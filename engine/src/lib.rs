//! WebAssembly wrapper around ingrid_core for the SeedGrid studio.
//!
//! An `Engine` loads the word list once and then answers JSON requests about a grid:
//! `fill` (find a complete fill) and `options` (arc-consistent option counts per slot,
//! the heatmap, plus the surviving words for one slot). Grids are rows of "#" (block),
//! "." (open) and letters. Slots are addressed by start cell index and direction, the
//! same way `src/lib/seedgrid/grid.ts` numbers cells.

use std::collections::HashSet;

use ingrid_core::arc_consistency::{establish_arc_consistency_for_static_grid, EliminationSet};
use ingrid_core::backtracking_search::{find_fill, FillFailure};
use ingrid_core::grid_config::{
    generate_slot_configs, generate_slot_options, generate_slots_from_template_string,
    sort_slot_options, Direction, GridConfig, SlotConfig,
};
use ingrid_core::types::{GlyphId, WordId};
use ingrid_core::word_list::{WordList, WordListSourceConfig, WordListSourceConfigProvider};
use serde::{Deserialize, Serialize};
use wasm_bindgen::prelude::*;

#[derive(Deserialize)]
#[serde(rename_all = "camelCase")]
struct SlotRule {
    start: usize,
    dir: String,
    /// Only these words may go here (Ingrid's "approved" list). They bypass the score floor.
    #[serde(default)]
    allow: Option<Vec<String>>,
    #[serde(default)]
    min_score: Option<u16>,
}

#[derive(Deserialize)]
#[serde(rename_all = "camelCase")]
struct Request {
    rows: Vec<String>,
    min_score: u16,
    #[serde(default)]
    timeout_ms: Option<u64>,
    #[serde(default)]
    slots: Vec<SlotRule>,
    /// Words that may not appear anywhere unless already written into the grid.
    #[serde(default)]
    reject: Vec<String>,
    /// Varies which of the near-best words are tried first, so repeated fills differ.
    #[serde(default)]
    seed: Option<u64>,
    /// For `options`: also list the surviving words for this slot.
    #[serde(default)]
    list_slot: Option<SlotRef>,
    #[serde(default)]
    list_limit: Option<usize>,
}

#[derive(Deserialize)]
struct SlotRef {
    start: usize,
    dir: String,
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
struct FillResponse {
    ok: bool,
    #[serde(skip_serializing_if = "Option::is_none")]
    rows: Option<Vec<String>>,
    #[serde(skip_serializing_if = "Option::is_none")]
    reason: Option<&'static str>,
    ms: f64,
}

#[derive(Serialize)]
struct SlotCount {
    start: usize,
    dir: &'static str,
    count: usize,
}

#[derive(Serialize)]
struct WordOption {
    word: String,
    score: u16,
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
struct OptionsResponse {
    ok: bool,
    slots: Vec<SlotCount>,
    #[serde(skip_serializing_if = "Option::is_none")]
    words: Option<Vec<WordOption>>,
}

/// Why a grid can't even be set up for a search.
enum Unprepared {
    /// Malformed rows, or a slot longer than the engine's `max_length`.
    BadRequest,
    /// This slot has no option at all (nothing fits its letters and rules).
    EmptySlot { start: usize, dir: &'static str },
}

struct Prepared {
    width: usize,
    height: usize,
    fill: Vec<Option<GlyphId>>,
    slot_configs: Vec<SlotConfig>,
    slot_options: Vec<Vec<WordId>>,
    crossing_count: usize,
}

fn dir_name(direction: Direction) -> &'static str {
    match direction {
        Direction::Across => "across",
        Direction::Down => "down",
    }
}

fn start_index(slot: &SlotConfig, width: usize) -> usize {
    slot.start_cell.1 * width + slot.start_cell.0
}

fn find_slot(slots: &[SlotConfig], width: usize, start: usize, dir: &str) -> Option<usize> {
    slots
        .iter()
        .position(|s| start_index(s, width) == start && dir_name(s.direction) == dir)
}

fn normalize(word: &str) -> String {
    word.chars()
        .filter(char::is_ascii_alphanumeric)
        .collect::<String>()
        .to_lowercase()
}

/// xorshift64*, enough to shuffle near-ties without another dependency.
fn next_random(state: &mut u64) -> u64 {
    *state ^= *state >> 12;
    *state ^= *state << 25;
    *state ^= *state >> 27;
    state.wrapping_mul(0x2545_F491_4F6C_DD1D)
}

#[wasm_bindgen]
pub struct Engine {
    list: WordList,
}

#[wasm_bindgen]
impl Engine {
    /// `word_list` is `WORD;SCORE` lines (extra `;fields` are ignored; the first occurrence
    /// of a word wins). `max_shared` is the longest run of letters two entries may share;
    /// ingrid_core supports 3–10, and anything outside that disables the check. Slots
    /// longer than `max_length` are refused as "bad-request".
    #[wasm_bindgen(constructor)]
    #[must_use]
    pub fn new(word_list: &str, max_shared: usize, max_length: usize) -> Engine {
        // ingrid_core wants a 'static source; the list lives as long as the engine anyway.
        let contents: &'static str = Box::leak(word_list.to_string().into_boxed_str());
        let list = WordList::new(
            vec![WordListSourceConfig {
                id: "0".into(),
                enabled: true,
                provider: WordListSourceConfigProvider::FileContents { contents },
                normalization: None,
            }],
            None,
            Some(max_length),
            if max_shared >= 3 { Some(max_shared) } else { None },
        );
        Engine { list }
    }

    #[wasm_bindgen(js_name = wordCount)]
    #[must_use]
    pub fn word_count(&self) -> usize {
        self.list.words.iter().map(Vec::len).sum()
    }

    /// Find a complete fill. Returns `{ ok, rows?, reason?, ms }` as JSON; `reason` is
    /// "unfillable" (proven impossible), "timeout", or "bad-request".
    #[must_use]
    pub fn fill(&mut self, request: &str) -> String {
        let start = instant::Instant::now();
        let elapsed = || start.elapsed().as_secs_f64() * 1000.0;
        let failure = |reason, ms| FillResponse { ok: false, rows: None, reason: Some(reason), ms };
        let response = match serde_json::from_str::<Request>(request) {
            Err(_) => failure("bad-request", 0.0),
            Ok(req) => match self.prepare(&req) {
                Err(Unprepared::BadRequest) => failure("bad-request", elapsed()),
                Err(Unprepared::EmptySlot { .. }) => failure("unfillable", elapsed()),
                Ok(p) => {
                    let config = self.config(&p);
                    let timeout = req.timeout_ms.map(std::time::Duration::from_millis);
                    match find_fill(&config, timeout, None) {
                        Ok(result) => {
                            let mut cells: Vec<char> = p
                                .fill
                                .iter()
                                .map(|g| g.map_or('.', |g| self.list.glyphs[g]))
                                .collect();
                            for (row, text) in req.rows.iter().enumerate() {
                                for (col, ch) in text.chars().enumerate() {
                                    if ch == '#' {
                                        cells[row * p.width + col] = '#';
                                    }
                                }
                            }
                            for choice in &result.choices {
                                let slot = &p.slot_configs[choice.slot_id];
                                let word = &self.list.words[slot.length][choice.word_id];
                                for (cell, &glyph) in slot.cell_fill_indices(p.width).iter().zip(&word.glyphs) {
                                    cells[*cell] = self.list.glyphs[glyph];
                                }
                            }
                            let rows = cells
                                .chunks(p.width)
                                .map(|r| r.iter().collect::<String>().to_uppercase())
                                .collect();
                            FillResponse { ok: true, rows: Some(rows), reason: None, ms: elapsed() }
                        }
                        Err(FillFailure::Timeout | FillFailure::Abort) => failure("timeout", elapsed()),
                        Err(_) => failure("unfillable", elapsed()),
                    }
                }
            },
        };
        serde_json::to_string(&response).unwrap_or_default()
    }

    /// Arc-consistent option counts for every slot (0 everywhere means the grid is
    /// dead), plus the surviving words for `listSlot`, best first.
    #[must_use]
    pub fn options(&mut self, request: &str) -> String {
        let Ok(req) = serde_json::from_str::<Request>(request) else {
            return r#"{"ok":false,"slots":[]}"#.into();
        };
        let response = match self.prepare(&req) {
            Err(Unprepared::BadRequest) => OptionsResponse { ok: false, slots: vec![], words: None },
            // Point at the slot that has nothing, rather than marking the whole grid dead.
            Err(Unprepared::EmptySlot { start, dir }) => OptionsResponse {
                ok: false,
                slots: vec![SlotCount { start, dir, count: 0 }],
                words: None,
            },
            Ok(p) => {
                let config = self.config(&p);
                let mut sets = EliminationSet::build_all(&p.slot_configs, &self.list);
                if establish_arc_consistency_for_static_grid(&config, &mut sets).is_err() {
                    OptionsResponse { ok: false, slots: vec![], words: None }
                } else {
                    let sets = &sets;
                    let surviving = |i: usize| p.slot_options[i].iter().filter(move |&&id| !sets[i].contains(id));
                    let slots = p
                        .slot_configs
                        .iter()
                        .map(|s| SlotCount {
                            start: start_index(s, p.width),
                            dir: dir_name(s.direction),
                            count: surviving(s.id).count(),
                        })
                        .collect();
                    let words = req.list_slot.as_ref().and_then(|r| {
                        let i = find_slot(&p.slot_configs, p.width, r.start, &r.dir)?;
                        let length = p.slot_configs[i].length;
                        let mut words: Vec<WordOption> = surviving(i)
                            .map(|&id| {
                                let w = &self.list.words[length][id];
                                WordOption { word: w.normalized_string.to_uppercase(), score: w.score }
                            })
                            .collect();
                        words.sort_by(|a, b| b.score.cmp(&a.score).then_with(|| a.word.cmp(&b.word)));
                        words.truncate(req.list_limit.unwrap_or(200));
                        Some(words)
                    });
                    OptionsResponse { ok: true, slots, words }
                }
            }
        };
        serde_json::to_string(&response).unwrap_or_default()
    }
}

impl Engine {
    fn config<'a>(&'a self, p: &'a Prepared) -> GridConfig<'a> {
        GridConfig {
            word_list: &self.list,
            fill: &p.fill,
            slot_configs: &p.slot_configs,
            slot_options: &p.slot_options,
            width: p.width,
            height: p.height,
            crossing_count: p.crossing_count,
            abort: None,
        }
    }

    /// Build slots and their starting options.
    fn prepare(&mut self, req: &Request) -> Result<Prepared, Unprepared> {
        let height = req.rows.len();
        let width = req.rows.first().map_or(0, |r| r.chars().count());
        let valid_cell = |c: char| c == '#' || c == '.' || c.is_ascii_alphabetic();
        if width == 0 || req.rows.iter().any(|r| r.chars().count() != width || !r.chars().all(valid_cell)) {
            return Err(Unprepared::BadRequest);
        }
        let template: String = req
            .rows
            .iter()
            .map(|r| r.to_lowercase() + "\n")
            .collect();
        let specs = generate_slots_from_template_string(&template);
        let (slot_configs, crossing_count) = generate_slot_configs(&specs);
        // Indexing the word list by a longer length panics, which would poison the engine.
        let max_length = self.list.max_length.unwrap_or(ingrid_core::MAX_SLOT_LENGTH).min(ingrid_core::MAX_SLOT_LENGTH);
        if slot_configs.iter().any(|s| s.length > max_length) {
            return Err(Unprepared::BadRequest);
        }

        let fill: Vec<Option<GlyphId>> = template
            .lines()
            .flat_map(|l| l.chars().collect::<Vec<_>>())
            .map(|c| (c != '.' && c != '#').then(|| self.list.glyph_id_for_char(c)))
            .collect();

        let reject: HashSet<String> = req.reject.iter().map(|w| normalize(w)).collect();
        let mut slot_options = Vec::with_capacity(slot_configs.len());
        for slot in &slot_configs {
            let entry_fill = slot.fill(&fill, width);
            let fixed = entry_fill.iter().all(Option::is_some);
            let rule = req
                .slots
                .iter()
                .find(|r| r.start == start_index(slot, width) && r.dir == dir_name(slot.direction));
            let mut options = match rule.and_then(|r| r.allow.as_ref()).filter(|_| !fixed) {
                Some(allow) => {
                    let mut ids = Vec::new();
                    for word in allow {
                        let word = normalize(word);
                        if word.chars().count() != slot.length {
                            continue;
                        }
                        let (_, id) = self.list.get_word_id_or_add_hidden(&word);
                        let glyphs = &self.list.words[slot.length][id].glyphs;
                        let fits = entry_fill.iter().zip(glyphs).all(|(f, g)| f.map_or(true, |f| f == *g));
                        if fits && !ids.contains(&id) {
                            ids.push(id);
                        }
                    }
                    ids
                }
                // No bucket means no word of this length was ever loaded.
                None if slot.length >= self.list.words.len() => Vec::new(),
                None => generate_slot_options(
                    &mut self.list,
                    &entry_fill,
                    rule.and_then(|r| r.min_score).unwrap_or(req.min_score),
                    None,
                    None,
                ),
            };
            if !fixed && !reject.is_empty() {
                let words = &self.list.words[slot.length];
                options.retain(|&id| !reject.contains(&words[id].normalized_string));
            }
            if options.is_empty() {
                return Err(Unprepared::EmptySlot { start: start_index(slot, width), dir: dir_name(slot.direction) });
            }
            slot_options.push(options);
        }

        sort_slot_options(&self.list, &slot_configs, &mut slot_options);
        if let Some(seed) = req.seed {
            // Nudge each word up to a few places, so a new seed explores a different fill
            // without giving up the fillability ordering.
            let mut state = seed.wrapping_mul(0x9E37_79B9_7F4A_7C15) | 1;
            for options in &mut slot_options {
                let mut keyed: Vec<(f64, WordId)> = options
                    .iter()
                    .enumerate()
                    .map(|(i, &id)| (i as f64 + (next_random(&mut state) % 1000) as f64 / 250.0, id))
                    .collect();
                keyed.sort_by(|a, b| a.0.total_cmp(&b.0));
                *options = keyed.into_iter().map(|(_, id)| id).collect();
            }
        }

        Ok(Prepared { width, height, fill, slot_configs, slot_options, crossing_count })
    }
}

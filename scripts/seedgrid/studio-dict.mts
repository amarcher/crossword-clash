/**
 * Writes the studio's word lists to public/seedgrid/ (gitignored): the same
 * merge `pnpm seedgrid` uses (base or production, then lively, rescore, blocked),
 * without blocked words.
 *
 *   words.dict             full list (FrequencyWords scoring): private use only
 *   words-production.dict  licensable sources only, for any studio others can reach
 *   NOTICES.txt            attributions the production list needs
 *
 * Dev studios load words.dict; every other build loads words-production.dict
 * from the public `seedgrid` Supabase Storage bucket (VITE_SEEDGRID_WORD_LIST
 * overrides both). Run after `pnpm seedgrid:dict` or after editing lively.dict
 * or rescore.dict, then publish the production list:
 *
 *   pnpm seedgrid:studio-dict
 *   pnpm seedgrid:upload-dict
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { formatDict, liftDicts, mergeDicts, parseDict } from "../../src/lib/seedgrid/dictionary";

const here = path.dirname(fileURLToPath(import.meta.url));
const listFile = (name: string) => path.join(here, "wordlists", name);
const sources = path.resolve(here, "../mini-generator/wordlists");
const outDir = path.resolve(here, "../../public/seedgrid");
const load = (name: string) => (fs.existsSync(listFile(name)) ? parseDict(fs.readFileSync(listFile(name), "utf8")) : []);

function write(base: string, out: string) {
  if (!fs.existsSync(listFile(base))) {
    console.warn(`Missing scripts/seedgrid/wordlists/${base}; skipping ${out}. Run \`pnpm seedgrid:dict\` first.`);
    return;
  }
  const entries = mergeDicts(liftDicts(load(base), load("lively.dict")), load("rescore.dict"), load("blocked.dict"))
    .filter((e) => e.score > 0)
    .sort((a, b) => b.score - a.score || (a.word < b.word ? -1 : 1));
  const file = path.join(outDir, out);
  fs.writeFileSync(file, formatDict(entries));
  console.log(`${entries.length} words → public/seedgrid/${out} (${(fs.statSync(file).size / 1e6).toFixed(1)} MB)`);
}

fs.mkdirSync(outDir, { recursive: true });
write("base.dict", "words.dict");
write("production.dict", "words-production.dict");

const notice = (file: string) => (fs.existsSync(path.join(sources, file)) ? fs.readFileSync(path.join(sources, file), "latin1").trim() : `(missing ${file})`);
fs.writeFileSync(
  path.join(outDir, "NOTICES.txt"),
  `Crossword Clash construction word list (words-production.dict)

Built from the sources below, with scores adjusted by Crossword Clash. Phrases
and overrides in lively.dict and rescore.dict are Crossword Clash's own.

== Crossword Nexus Collaborative Word List ==
https://github.com/Crossword-Nexus/collaborative-word-list

${notice("xwordlist.LICENSE")}

== ENABLE word list ==
Public domain.

== SCOWL (Spell Checker Oriented Word Lists), levels 10-70 ==
http://wordlist.aspell.net/ (used to judge how common a word is)

${notice("scowl/Copyright")}
`,
);
console.log("Attributions → public/seedgrid/NOTICES.txt");

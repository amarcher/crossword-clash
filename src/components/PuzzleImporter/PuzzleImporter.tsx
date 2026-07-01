import { useState, useCallback, useRef, useEffect } from "react";
import { useTranslation } from "react-i18next";
import { Title } from "../Title";
import { parse } from "@xwordly/xword-parser";
import { normalizePuzzle } from "../../lib/puzzleNormalizer";
import { SAMPLE_PUZZLES } from "../../lib/samplePuzzles";
import { track } from "../../lib/analytics";
import { NytRecommendation } from "../NytRecommendation";
import { AdSlot } from "../AdSlot";
import type { Puzzle } from "../../types/puzzle";

interface PuzzleImporterProps {
  onPuzzleLoaded: (puzzle: Puzzle, fileBuffer?: ArrayBuffer) => void;
}

/** One entry in /classic-puzzles/manifest.json. */
interface ClassicEntry {
  file: string;
  title: string;
  size: string;
}

export function PuzzleImporter({ onPuzzleLoaded }: PuzzleImporterProps) {
  const { t } = useTranslation();
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [isDragging, setIsDragging] = useState(false);
  const [classics, setClassics] = useState<ClassicEntry[]>([]);
  const [loadingClassic, setLoadingClassic] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  // Load the bundled 1924 public-domain classics list from the static asset.
  // Best-effort: if it 404s or is malformed, the section simply stays hidden.
  useEffect(() => {
    let cancelled = false;
    fetch("/classic-puzzles/manifest.json")
      .then((res) => (res.ok ? res.json() : Promise.reject(res.status)))
      .then((data: unknown) => {
        if (cancelled || !Array.isArray(data)) return;
        const valid = data.filter(
          (e): e is ClassicEntry =>
            typeof e === "object" &&
            e !== null &&
            typeof (e as ClassicEntry).file === "string" &&
            typeof (e as ClassicEntry).title === "string" &&
            typeof (e as ClassicEntry).size === "string",
        );
        setClassics(valid);
      })
      .catch(() => {
        /* No classics section — not fatal. */
      });
    return () => {
      cancelled = true;
    };
  }, []);

  const handleClassic = useCallback(
    async (entry: ClassicEntry) => {
      setError(null);
      setLoadingClassic(entry.file);
      try {
        const res = await fetch(`/classic-puzzles/${entry.file}`);
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        const buffer = await res.arrayBuffer();
        const parsed = parse(buffer, { filename: entry.file });
        const puzzle = normalizePuzzle(parsed, "puzzle.puz");
        track("puzzle_imported", {
          source: "classic",
          title: puzzle.title || entry.title,
          size: `${puzzle.width}x${puzzle.height}`,
        });
        onPuzzleLoaded(puzzle);
      } catch {
        setError(t("importer.classicError"));
      } finally {
        setLoadingClassic(null);
      }
    },
    [onPuzzleLoaded, t],
  );

  const handleFile = useCallback(
    async (file: File) => {
      setError(null);
      setLoading(true);
      try {
        const buffer = await file.arrayBuffer();
        const parsed = parse(buffer, { filename: file.name });
        // Detect .puz from binary magic bytes ("ACROSS&DOWN\0" at offset 2)
        // rather than filename — iOS Safari may rename uploaded files.
        const bytes = new Uint8Array(buffer);
        const isPuz =
          bytes.length >= 14 &&
          String.fromCharCode(...bytes.slice(2, 14)) === "ACROSS&DOWN\0";
        const puzzle = normalizePuzzle(parsed, isPuz ? "puzzle.puz" : file.name);
        onPuzzleLoaded(puzzle, buffer);
      } catch (e) {
        setError(e instanceof Error ? e.message : "Failed to parse puzzle file");
      } finally {
        setLoading(false);
      }
    },
    [onPuzzleLoaded],
  );

  const handleDrop = useCallback(
    (e: React.DragEvent) => {
      e.preventDefault();
      setIsDragging(false);
      const file = e.dataTransfer.files[0];
      if (file) handleFile(file);
    },
    [handleFile],
  );

  const handleDragOver = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(true);
  }, []);

  const handleDragLeave = useCallback(() => {
    setIsDragging(false);
  }, []);

  const handleInputChange = useCallback(
    (e: React.ChangeEvent<HTMLInputElement>) => {
      const file = e.target.files?.[0];
      if (file) handleFile(file);
    },
    [handleFile],
  );

  const acrossCount = (p: Puzzle) =>
    p.clues.filter((c) => c.direction === "across").length;
  const downCount = (p: Puzzle) =>
    p.clues.filter((c) => c.direction === "down").length;

  return (
    <div className="min-h-dvh crossword-bg p-6 sm:p-8">
      <div className="max-w-3xl mx-auto flex flex-col items-center">
        <Title className="mb-2" />
        <h2 className="text-xl font-semibold text-neutral-700 mt-2">
          {t("importer.hubTitle")}
        </h2>
        <p className="text-neutral-500 text-center max-w-md mt-1 mb-6">
          {t("importer.hubSubtitle")}
        </p>

        {/* Primary tile — NYT bookmarklet */}
        <a
          href="/install-bookmarklet"
          target="_blank"
          rel="noopener noreferrer"
          className="w-full max-w-md rounded-xl bg-white border-2 border-blue-500 p-5 mb-3 hover:bg-blue-50 transition-colors block focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500"
        >
          <div className="flex items-start justify-between gap-3">
            <div className="min-w-0">
              <h3 className="font-semibold text-neutral-800">
                {t("importer.tileNytTitle")}
              </h3>
              <p className="text-sm text-neutral-500 mt-1">
                {t("importer.tileNytDesc")}
              </p>
            </div>
            <span className="shrink-0 px-3 py-1.5 rounded-md bg-blue-600 text-white text-sm font-semibold">
              {t("importer.tileNytCta")}
            </span>
          </div>
        </a>

        {/* Two secondary tiles side-by-side on desktop */}
        <div className="w-full max-w-md grid grid-cols-1 sm:grid-cols-2 gap-3 mb-3">
          <a
            href="https://chromewebstore.google.com/detail/crossword-scraper/lmneijnoafbpnfdjabialjehgohpmcpo?hl=en-US"
            target="_blank"
            rel="noopener noreferrer"
            className="rounded-xl bg-white border border-neutral-300 p-4 hover:border-blue-400 hover:bg-blue-50 transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500"
          >
            <h3 className="font-semibold text-neutral-800 text-sm">
              {t("importer.tileScraperTitle")}
            </h3>
            <p className="text-xs text-neutral-500 mt-1 mb-2">
              {t("importer.tileScraperDesc")}
            </p>
            <span className="text-xs font-semibold text-blue-600">
              {t("importer.tileScraperCta")} →
            </span>
          </a>

          <button
            type="button"
            onDrop={handleDrop}
            onDragOver={handleDragOver}
            onDragLeave={handleDragLeave}
            onClick={() => fileInputRef.current?.click()}
            className={`rounded-xl border-2 border-dashed p-4 text-left transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500 ${
              isDragging
                ? "border-blue-500 bg-blue-50"
                : "border-neutral-300 hover:border-blue-400 hover:bg-blue-50 bg-white"
            }`}
          >
            <h3 className="font-semibold text-neutral-800 text-sm">
              {loading ? t("importer.parsing") : t("importer.tileFileTitle")}
            </h3>
            <p className="text-xs text-neutral-500 mt-1 mb-2">
              {t("importer.tileFileDesc")}
            </p>
            <span className="text-xs font-semibold text-blue-600">
              {t("importer.dropHere")} ↓
            </span>
            <input
              ref={fileInputRef}
              type="file"
              accept=".puz,.ipuz,.jpz,.xd"
              className="hidden"
              onChange={handleInputChange}
            />
          </button>
        </div>

        {/* Samples — open by default */}
        <details
          className="w-full max-w-md mt-2"
          open
        >
          <summary className="text-sm text-neutral-500 cursor-pointer hover:text-neutral-700 transition-colors select-none">
            {t("importer.tileSampleTitle")}
          </summary>
          <div className="grid grid-cols-2 gap-2 mt-2">
            {SAMPLE_PUZZLES.map((sp) => (
              <button
                key={sp.id}
                type="button"
                onClick={() => onPuzzleLoaded(sp.puzzle)}
                className="text-left px-3 py-2 rounded-lg border border-neutral-200 bg-white hover:border-blue-400 hover:bg-blue-50 transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500"
              >
                <span className="block text-sm font-medium text-neutral-700">
                  {sp.puzzle.title}
                </span>
                <span className="block text-xs text-neutral-400">
                  {sp.puzzle.width}&times;{sp.puzzle.height}
                  {" · "}
                  {acrossCount(sp.puzzle) + downCount(sp.puzzle)}{" "}
                  {t("importer.sampleClues")}
                </span>
              </button>
            ))}
          </div>
        </details>

        {/* Classic puzzles — bundled public-domain 1924 puzzles, one-click play. */}
        {classics.length > 0 && (
          <details
            className="w-full max-w-md mt-2"
            open
          >
            <summary className="text-sm text-neutral-500 cursor-pointer hover:text-neutral-700 transition-colors select-none">
              {t("importer.classicTitle")}
            </summary>
            <p className="text-xs text-neutral-400 mt-1 mb-2">
              {t("importer.classicSubtitle")}
            </p>
            <div className="grid grid-cols-2 gap-2">
              {classics.map((entry) => {
                const isLoading = loadingClassic === entry.file;
                return (
                  <button
                    key={entry.file}
                    type="button"
                    disabled={loadingClassic !== null}
                    onClick={() => handleClassic(entry)}
                    className="text-left px-3 py-2 rounded-lg border border-neutral-200 bg-white hover:border-blue-400 hover:bg-blue-50 transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500 disabled:opacity-60 disabled:pointer-events-none"
                  >
                    <span className="block text-sm font-medium text-neutral-700">
                      {entry.title}
                    </span>
                    <span className="block text-xs text-neutral-400">
                      {isLoading ? t("importer.parsing") : entry.size}
                    </span>
                  </button>
                );
              })}
            </div>
          </details>
        )}

        {error && (
          <p className="mt-4 text-red-600 text-sm max-w-md text-center">{error}</p>
        )}

        <div className="mt-6">
          <NytRecommendation variant="card" />
        </div>

        <div className="mt-4">
          <AdSlot placement="import-bottom" />
        </div>
      </div>
    </div>
  );
}

import { useState, useCallback, useEffect, useMemo, type ReactNode } from "react";
import { Link } from "react-router";
import { useTranslation } from "react-i18next";
import { ArrowRight, BookOpen, ExternalLink, FileUp, Loader2, Newspaper, Puzzle as PuzzleIcon } from "lucide-react";
import { parse } from "@xwordly/xword-parser";
import { SiteBar } from "../SiteBar";
import { Eyebrow, MiniGridThumb } from "../ui";
import { normalizePuzzle } from "../../lib/puzzleNormalizer";
import { SAMPLE_PUZZLES } from "../../lib/samplePuzzles";
import {
  loadClassicManifest,
  loadClassicPuzzle,
  type ClassicEntry,
} from "../../lib/classicLibrary";
import { NytRecommendation } from "../NytRecommendation";
import { AdSlot } from "../AdSlot";
import type { Puzzle } from "../../types/puzzle";
import { nativeNytImportAvailable } from "../../lib/nativeNytImport";

interface PuzzleImporterProps {
  onPuzzleLoaded: (puzzle: Puzzle, fileBuffer?: ArrayBuffer) => void;
}

/** How many classics the hub previews before pointing at /classics. */
const CLASSIC_PREVIEW_COUNT = 4;

const SCRAPER_URL =
  "https://chromewebstore.google.com/detail/crossword-scraper/lmneijnoafbpnfdjabialjehgohpmcpo?hl=en-US";

const CARD =
  "group flex h-full flex-col gap-3 rounded-2xl border border-line bg-surface p-4 text-left shadow-card transition-[box-shadow,border-color,background-color] duration-150 hover:border-line-strong hover:shadow-raised active:bg-surface-sunken focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand-500";

/** One consistent "source" card: icon tile, title, description, call to action. */
function SourceCard({
  icon: Icon,
  title,
  description,
  cta,
  external,
  ...link
}: {
  icon: typeof Newspaper;
  title: ReactNode;
  description: ReactNode;
  cta: ReactNode;
  external?: boolean;
} & ({ to: string; href?: never } | { href: string; to?: never })) {
  const body = (
    <>
      <span className="grid size-10 place-items-center rounded-xl bg-brand-50 text-brand-600">
        <Icon className="size-5" aria-hidden="true" />
      </span>
      <span className="block">
        <span className="block font-semibold leading-snug text-ink">{title}</span>
        <span className="mt-1 block text-sm leading-snug text-muted">{description}</span>
      </span>
      <span className="mt-auto inline-flex items-center gap-1.5 text-sm font-semibold text-brand-700">
        {cta}
        {external ? (
          <ExternalLink className="size-3.5" aria-hidden="true" />
        ) : (
          <ArrowRight className="size-4 transition-transform group-hover:translate-x-0.5" aria-hidden="true" />
        )}
      </span>
    </>
  );
  if (link.to) {
    return <Link to={link.to} className={CARD}>{body}</Link>;
  }
  return (
    <a href={link.href} target="_blank" rel="noopener noreferrer" className={CARD}>
      {body}
    </a>
  );
}

export function PuzzleImporter({ onPuzzleLoaded }: PuzzleImporterProps) {
  const { t } = useTranslation();
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [isDragging, setIsDragging] = useState(false);
  const [classics, setClassics] = useState<ClassicEntry[]>([]);
  const [loadingClassic, setLoadingClassic] = useState<string | null>(null);

  // Load the bundled 1924 public-domain classics list from the static asset.
  // Best-effort: resolves to [] on failure, so the section simply stays hidden.
  useEffect(() => {
    let cancelled = false;
    loadClassicManifest().then((list) => {
      if (!cancelled) setClassics(list);
    });
    return () => {
      cancelled = true;
    };
  }, []);

  // Preview the smallest puzzles first — the friendliest quick start from a
  // hub whose visitor hasn't chosen a size. The full, filterable list is /classics.
  const classicPreview = useMemo(
    () =>
      [...classics]
        .sort((a, b) => Math.max(a.width, a.height) - Math.max(b.width, b.height) || a.number - b.number)
        .slice(0, CLASSIC_PREVIEW_COUNT),
    [classics],
  );

  const handleClassic = useCallback(
    async (entry: ClassicEntry) => {
      setError(null);
      setLoadingClassic(entry.file);
      try {
        onPuzzleLoaded(await loadClassicPuzzle(entry));
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

  const nativeNyt = nativeNytImportAvailable();
  // The store apps have no drag-and-drop, bookmarklet or browser extensions.
  const nativeApp = import.meta.env.MODE === "mobile";

  return (
    <div className="min-h-dvh crossword-bg px-4 pb-10 pt-2">
      <SiteBar />
      <div className="mx-auto w-full max-w-3xl">
        <div className="pb-6 pt-4 text-center sm:pt-6">
          <h1 className="font-display text-3xl font-bold tracking-tight text-ink sm:text-4xl">
            {t("importer.hubTitle")}
          </h1>
          <p className="mx-auto mt-2 max-w-md text-sm text-muted sm:text-base">{t(nativeApp ? "importer.hubSubtitleNative" : "importer.hubSubtitle")}</p>
        </div>

        {/* Dropzone: a real <label> around a visually-hidden file input, so it is
            keyboard-focusable, tappable on phones, and accepts drag-and-drop. */}
        <label
          onDrop={handleDrop}
          onDragOver={handleDragOver}
          onDragLeave={handleDragLeave}
          className={`flex cursor-pointer flex-col items-center gap-2 rounded-2xl border-2 border-dashed px-5 py-8 text-center transition-colors has-[:focus-visible]:outline-2 has-[:focus-visible]:outline-offset-2 has-[:focus-visible]:outline-brand-500 sm:py-10 ${
            isDragging
              ? "border-brand-500 bg-brand-50"
              : "border-line-strong bg-surface hover:border-brand-500/60 hover:bg-brand-50/50 active:bg-brand-50"
          }`}
        >
          <span
            className={`grid size-12 place-items-center rounded-2xl transition-colors ${
              isDragging ? "bg-brand-600 text-white" : "bg-brand-50 text-brand-600"
            }`}
          >
            {loading ? (
              <Loader2 className="size-6 animate-spin motion-reduce:animate-none" aria-hidden="true" />
            ) : (
              <FileUp className="size-6" aria-hidden="true" />
            )}
          </span>
          <span className="font-display text-lg font-semibold text-ink">
            {loading ? t("importer.parsing") : t(nativeApp ? "importer.tileFileTitleNative" : "importer.tileFileTitle")}
          </span>
          <span className="max-w-sm text-sm text-muted">{t("importer.tileFileDesc")}</span>
          <span className="mt-1 text-sm font-semibold text-brand-700">
            {nativeApp ? (
              t("importer.browseNative")
            ) : (
              <>
                <span className="hidden md:inline">{t("importer.dropHere")}</span>
                <span className="md:hidden">{t("importer.orBrowse")}</span>
              </>
            )}
          </span>
          <input
            type="file"
            accept=".puz,.ipuz,.jpz,.xd"
            className="sr-only"
            onChange={handleInputChange}
          />
        </label>

        {error && (
          <p role="alert" className="mt-3 rounded-xl border border-red-200 bg-red-50 px-4 py-2.5 text-center text-sm font-medium text-red-700">
            {error}
          </p>
        )}

        {/* Sources */}
        <div className={`mt-3 grid gap-3 ${nativeApp ? "" : "sm:grid-cols-2"}`}>
          {nativeNyt ? (
            <SourceCard
              to="/nyt-import"
              icon={Newspaper}
              title={t("nytImport.title")}
              description={t("nytImport.description")}
              cta={t("nytImport.open")}
            />
          ) : (
            <SourceCard
              href="/install-bookmarklet"
              external
              icon={Newspaper}
              title={t("importer.tileNytTitle")}
              description={t("importer.tileNytDesc")}
              cta={t("importer.tileNytCta")}
            />
          )}
          {!nativeApp && (
            <SourceCard
              href={SCRAPER_URL}
              external
              icon={PuzzleIcon}
              title={t("importer.tileScraperTitle")}
              description={t("importer.tileScraperDesc")}
              cta={t("importer.tileScraperCta")}
            />
          )}
        </div>

        {/* Samples */}
        <section className="mt-8">
          <Eyebrow as="h2" className="px-1">{t("importer.tileSampleTitle")}</Eyebrow>
          <div className="mt-3 grid grid-cols-2 gap-3 sm:grid-cols-4">
            {SAMPLE_PUZZLES.map((sp) => (
              <button
                key={sp.id}
                type="button"
                onClick={() => onPuzzleLoaded(sp.puzzle)}
                className={`${CARD} items-start`}
              >
                <MiniGridThumb puzzle={sp.puzzle} className="w-14" />
                <span className="block">
                  <span className="block text-sm font-semibold leading-snug text-ink">{sp.puzzle.title}</span>
                  <span className="mt-0.5 block text-xs tabular-nums text-muted">
                    {sp.puzzle.width}&times;{sp.puzzle.height}
                    {" · "}
                    {sp.puzzle.clues.length} {t("importer.sampleClues")}
                  </span>
                </span>
              </button>
            ))}
          </div>
        </section>

        {/* Classic puzzles — bundled public-domain 1924 puzzles, one-click play. */}
        {classics.length > 0 && (
          <section className="mt-8">
            <Eyebrow as="h2" className="px-1">{t("importer.classicTitle")}</Eyebrow>
            <p className="mt-1 px-1 text-sm text-muted">{t("importer.classicSubtitle")}</p>
            <div className="mt-3 grid grid-cols-2 gap-3 sm:grid-cols-4">
              {classicPreview.map((entry) => {
                const isLoading = loadingClassic === entry.file;
                return (
                  <button
                    key={entry.file}
                    type="button"
                    disabled={loadingClassic !== null}
                    onClick={() => handleClassic(entry)}
                    className={`${CARD} items-start disabled:pointer-events-none disabled:opacity-60`}
                  >
                    <span className="grid size-9 place-items-center rounded-xl bg-gold-50 text-gold-700">
                      <BookOpen className="size-4.5" aria-hidden="true" />
                    </span>
                    <span className="block">
                      <span className="block text-sm font-semibold leading-snug text-ink">{entry.title}</span>
                      <span className="mt-0.5 block text-xs tabular-nums text-muted">
                        {isLoading ? t("importer.parsing") : `${entry.width}×${entry.height}`}
                      </span>
                    </span>
                  </button>
                );
              })}
            </div>
            <Link
              to="/classics"
              className="mt-2 inline-flex min-h-11 items-center gap-1.5 rounded-lg px-1 text-sm font-semibold text-brand-700 hover:text-brand-800 focus-visible:outline-2 focus-visible:outline-brand-500"
            >
              {t("importer.classicSeeAll", { count: classics.length })}
            </Link>
          </section>
        )}

        <div className="mt-6 flex flex-col items-center gap-4">
          <NytRecommendation variant="card" />
          <AdSlot placement="import-bottom" />
        </div>
      </div>
    </div>
  );
}

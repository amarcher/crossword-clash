import { useState, useCallback, useRef } from "react";
import { parse } from "@xwordly/xword-parser";
import { normalizePuzzle } from "../../lib/puzzleNormalizer";
import type { Puzzle } from "../../types/puzzle";

interface PuzzleImporterProps {
  onPuzzleLoaded: (puzzle: Puzzle, fileBuffer?: ArrayBuffer) => void;
}

export function PuzzleImporter({ onPuzzleLoaded }: PuzzleImporterProps) {
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [isDragging, setIsDragging] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

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

  return (
    <div className="flex flex-col items-center justify-center h-dvh bg-neutral-50 p-8">
      <h1 className="text-center leading-tight mb-2" style={{ fontFamily: "'Playfair Display', serif" }}>
        <span className="block text-5xl font-bold text-neutral-900">Crossword</span>
        <span className="block text-5xl font-bold italic text-amber-500">Clash</span>
      </h1>
      <p className="text-neutral-500 mb-8">
        Upload a crossword puzzle to get started
      </p>

      <div
        onDrop={handleDrop}
        onDragOver={handleDragOver}
        onDragLeave={handleDragLeave}
        onClick={() => fileInputRef.current?.click()}
        className={`w-full max-w-md border-2 border-dashed rounded-xl p-12 text-center cursor-pointer transition-colors ${
          isDragging
            ? "border-blue-500 bg-blue-50"
            : "border-neutral-300 hover:border-neutral-400 bg-white"
        }`}
      >
        {loading ? (
          <p className="text-neutral-600">Parsing puzzle...</p>
        ) : (
          <>
            <p className="text-lg font-medium text-neutral-700 mb-1">
              Drop a puzzle file here
            </p>
            <p className="text-sm text-neutral-400">
              or click to browse (.puz, .ipuz, .jpz, .xd)
            </p>
          </>
        )}
        <input
          ref={fileInputRef}
          type="file"
          accept=".puz,.ipuz,.jpz,.xd"
          className="hidden"
          onChange={handleInputChange}
        />
      </div>

      <p className="mt-6 text-sm text-neutral-400 max-w-md text-center">
        Need a .puz file? Use the{" "}
        <a
          href="https://chromewebstore.google.com/detail/crossword-scraper/lmneijnoafbpnfdjabialjehgohpmcpo?hl=en-US"
          target="_blank"
          rel="noopener noreferrer"
          className="text-blue-500 underline hover:text-blue-600"
        >
          Crossword Scraper
        </a>{" "}
        Chrome extension to download puzzles from popular crossword sites.
      </p>

      {error && (
        <p className="mt-4 text-red-600 text-sm max-w-md text-center">
          {error}
        </p>
      )}
    </div>
  );
}

import { useMemo, useState, useCallback } from "react";
import { Link } from "react-router";
import { buildBookmarkletUrl } from "../lib/bookmarkletSource";

export function InstallBookmarkletScreen() {
  const url = useMemo(buildBookmarkletUrl, []);
  const [copied, setCopied] = useState(false);

  const handleCopy = useCallback(() => {
    navigator.clipboard.writeText(url).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    });
  }, [url]);

  return (
    <div className="min-h-dvh crossword-bg">
      <div className="max-w-xl mx-auto px-5 py-10">
        <h1 className="text-2xl font-bold text-neutral-800 mb-6">
          Crossword Clash &mdash; NYT Bookmarklet
        </h1>

        <h2 className="text-lg font-semibold text-neutral-700 mt-8 mb-3">
          Option 1: Drag to bookmarks bar
        </h2>
        <div className="flex flex-col items-start gap-3 mb-3">
          <span className="font-semibold text-neutral-600">
            Drag this button to your bookmarks bar:
          </span>
          <div className="flex items-center gap-4">
            <a
              href={url}
              className="inline-block px-6 py-3 bg-blue-600 text-white rounded-lg font-semibold text-lg no-underline cursor-grab active:cursor-grabbing"
              onClick={(e) => e.preventDefault()}
            >
              NYT &rarr; Crossword Clash
            </a>
            <span className="pointer-events-none animate-[bounce-up_1.5s_ease-in-out_infinite]">
              <svg
                viewBox="0 0 64 64"
                fill="none"
                className="w-16 h-16"
              >
                <path
                  d="M32 56V16"
                  stroke="#2563eb"
                  strokeWidth="4"
                  strokeLinecap="round"
                />
                <path
                  d="M16 30L32 16L48 30"
                  stroke="#2563eb"
                  strokeWidth="4"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                />
                <rect
                  x="10"
                  y="4"
                  width="44"
                  height="6"
                  rx="2"
                  fill="#2563eb"
                  opacity="0.15"
                />
              </svg>
            </span>
          </div>
        </div>
        <p className="text-sm text-neutral-500">
          Make sure your bookmarks bar is visible (Cmd+Shift+B on Mac,
          Ctrl+Shift+B on Windows).
        </p>

        <h2 className="text-lg font-semibold text-neutral-700 mt-8 mb-3">
          Option 2: Manual install
        </h2>
        <ol className="list-decimal pl-5 space-y-2 text-neutral-700">
          <li>
            Right-click your bookmarks bar and choose &ldquo;Add
            Page...&rdquo; or &ldquo;Add Bookmark...&rdquo;
          </li>
          <li>
            Name:{" "}
            <code className="bg-neutral-100 px-1.5 py-0.5 rounded text-sm">
              NYT &rarr; Crossword Clash
            </code>
          </li>
          <li>
            URL: Click &ldquo;Copy&rdquo; below, then paste into the URL field
          </li>
        </ol>
        <textarea
          readOnly
          rows={4}
          value={url}
          className="w-full mt-3 p-2 text-[10px] font-mono border border-neutral-300 rounded bg-white"
        />
        <button
          onClick={handleCopy}
          className="mt-3 px-4 py-2 bg-blue-600 text-white rounded-md text-sm font-medium hover:bg-blue-700 transition-colors"
        >
          {copied ? "Copied!" : "Copy to clipboard"}
        </button>

        <h2 className="text-lg font-semibold text-neutral-700 mt-8 mb-3">
          Usage
        </h2>
        <ol className="list-decimal pl-5 space-y-2 text-neutral-700">
          <li>
            Go to any NYT crossword page &mdash;{" "}
            <a
              href="https://www.nytimes.com/crosswords/game/daily"
              target="_blank"
              rel="noopener noreferrer"
              className="text-blue-600 underline"
            >
              Daily
            </a>
            ,{" "}
            <a
              href="https://www.nytimes.com/crosswords/game/mini"
              target="_blank"
              rel="noopener noreferrer"
              className="text-blue-600 underline"
            >
              Mini
            </a>
            , or other puzzle types (must be logged in with crossword
            subscription)
          </li>
          <li>Click the bookmarklet in your bookmarks bar</li>
          <li>Crossword Clash opens in a new tab with the puzzle loaded</li>
        </ol>

        <div className="mt-8">
          <Link
            to="/"
            className="text-sm text-neutral-500 hover:text-neutral-700 transition-colors"
          >
            &larr; Back to Crossword Clash
          </Link>
        </div>
      </div>
    </div>
  );
}

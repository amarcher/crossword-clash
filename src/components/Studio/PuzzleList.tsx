import { useState } from "react";
import { Copy, Plus, Trash2 } from "lucide-react";
import { Button, Card, Eyebrow } from "../ui";
import type { LibraryEntry } from "../../lib/seedgrid/studioLibrary";

interface PuzzleListProps {
  entries: LibraryEntry[];
  currentId: string;
  newSize: number;
  onOpen: (entry: LibraryEntry) => void;
  onNew: () => void;
  onDuplicate: (entry: LibraryEntry) => void;
  onDelete: (entry: LibraryEntry) => void;
}

const ICON_BUTTON =
  "inline-flex size-9 shrink-0 items-center justify-center rounded-lg text-muted hover:bg-surface-sunken hover:text-ink active:bg-line focus-visible:outline-2 focus-visible:outline-brand-500";

function ago(at: number): string {
  const minutes = Math.round((Date.now() - at) / 60000);
  if (minutes < 1) return "just now";
  if (minutes < 60) return `${minutes} min ago`;
  const hours = Math.round(minutes / 60);
  if (hours < 24) return `${hours} h ago`;
  return new Date(at).toLocaleDateString([], { month: "short", day: "numeric" });
}

/** Every puzzle worked on in this browser; the open one is tinted. Saving is automatic. */
export function PuzzleList({ entries, currentId, newSize, onOpen, onNew, onDuplicate, onDelete }: PuzzleListProps) {
  const [confirming, setConfirming] = useState<string | null>(null);
  return (
    <Card className="p-4">
      <div className="flex items-center justify-between">
        <Eyebrow as="h2">My puzzles</Eyebrow>
        <Button variant="ghost" size="sm" onClick={onNew}>
          <Plus className="size-4" aria-hidden="true" /> New {newSize}×{newSize}
        </Button>
      </div>
      {entries.length === 0 ? (
        <p className="mt-2 text-sm text-muted">Puzzles save here automatically as you build them.</p>
      ) : (
        <ul className="mt-2 flex max-h-72 flex-col gap-0.5 overflow-y-auto overscroll-contain">
          {entries.map((entry) => {
            const current = entry.id === currentId;
            return (
              <li key={entry.id} className={`flex items-center gap-1 rounded-lg ${current ? "bg-brand-50" : ""}`}>
                {confirming === entry.id ? (
                  <div className="flex min-h-11 flex-1 items-center justify-between gap-2 px-2 text-sm">
                    <span className="text-ink-soft">Delete “{entry.title || "Untitled"}”?</span>
                    <span className="flex gap-1">
                      <Button variant="ghost" size="sm" onClick={() => setConfirming(null)}>Keep</Button>
                      <Button
                        variant="danger"
                        size="sm"
                        onClick={() => {
                          setConfirming(null);
                          onDelete(entry);
                        }}
                      >
                        Delete
                      </Button>
                    </span>
                  </div>
                ) : (
                  <>
                    <button
                      type="button"
                      aria-current={current ? "true" : undefined}
                      className="flex min-h-11 min-w-0 flex-1 flex-col justify-center rounded-lg px-2 text-left hover:bg-surface-sunken active:bg-line focus-visible:outline-2 focus-visible:outline-brand-500"
                      onClick={() => !current && onOpen(entry)}
                    >
                      <span className={`truncate text-sm ${current ? "font-semibold text-brand-700" : "text-ink"}`}>{entry.title || "Untitled"}</span>
                      <span className="text-xs text-subtle">
                        {entry.width}×{entry.height} · {Math.round(entry.filled * 100)}% filled · {ago(entry.updatedAt)}
                      </span>
                    </button>
                    <button type="button" className={ICON_BUTTON} aria-label={`Duplicate ${entry.title || "Untitled"}`} title="Duplicate" onClick={() => onDuplicate(entry)}>
                      <Copy className="size-4" aria-hidden="true" />
                    </button>
                    <button type="button" className={ICON_BUTTON} aria-label={`Delete ${entry.title || "Untitled"}`} title="Delete" onClick={() => setConfirming(entry.id)}>
                      <Trash2 className="size-4" aria-hidden="true" />
                    </button>
                  </>
                )}
              </li>
            );
          })}
        </ul>
      )}
    </Card>
  );
}

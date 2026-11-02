import { Ellipsis, Grid3x3, ListOrdered, Type } from "lucide-react";

/** The studio's four phone tabs. */
export type StudioTab = "grid" | "words" | "clues" | "more";

export const STUDIO_TABS: { id: StudioTab; label: string; icon: typeof Grid3x3 }[] = [
  { id: "grid", label: "Grid", icon: Grid3x3 },
  { id: "words", label: "Words", icon: Type },
  { id: "clues", label: "Clues", icon: ListOrdered },
  { id: "more", label: "More", icon: Ellipsis },
];

/** DOM id of a tab's panel, for `aria-controls` / `aria-labelledby`. */
export const studioPanelId = (tab: StudioTab) => `studio-panel-${tab}`;
export const studioTabId = (tab: StudioTab) => `studio-tab-${tab}`;

interface StudioTabBarProps {
  tab: StudioTab;
  onChange: (tab: StudioTab) => void;
  /** A small count beside a tab's label (the number of clues still missing). */
  counts?: Partial<Record<StudioTab, number>>;
}

/**
 * The phone studio's bottom tab bar. A fixed overlay, so it reads the home
 * indicator's inset itself (`.native-app #root` pads the insets for in-flow
 * content only). The selected tab is told by tint and weight, nothing else.
 */
export function StudioTabBar({ tab, onChange, counts }: StudioTabBarProps) {
  return (
    <nav
      aria-label="Studio sections"
      className="fixed inset-x-0 bottom-0 z-40 border-t border-line bg-surface/95 pb-[env(safe-area-inset-bottom)] backdrop-blur supports-[backdrop-filter]:bg-surface/85 lg:hidden"
    >
      <div role="tablist" aria-label="Studio sections" className="mx-auto grid max-w-md grid-cols-4 px-2">
        {STUDIO_TABS.map(({ id, label, icon: Icon }) => {
          const selected = id === tab;
          const count = counts?.[id];
          return (
            <button
              key={id}
              id={studioTabId(id)}
              type="button"
              role="tab"
              aria-selected={selected}
              aria-controls={studioPanelId(id)}
              tabIndex={selected ? 0 : -1}
              onClick={() => onChange(id)}
              onKeyDown={(e) => {
                if (e.key !== "ArrowRight" && e.key !== "ArrowLeft") return;
                e.preventDefault();
                const at = STUDIO_TABS.findIndex((t) => t.id === id);
                const next = STUDIO_TABS[(at + (e.key === "ArrowRight" ? 1 : STUDIO_TABS.length - 1)) % STUDIO_TABS.length].id;
                onChange(next);
                document.getElementById(studioTabId(next))?.focus();
              }}
              className={`flex min-h-14 flex-col items-center justify-center gap-0.5 rounded-xl text-xs touch-manipulation focus-visible:outline-2 focus-visible:outline-brand-500 ${
                selected ? "font-semibold text-brand-700" : "font-medium text-muted active:text-ink"
              }`}
            >
              <span className={`relative grid h-7 w-12 place-items-center rounded-full ${selected ? "bg-brand-50" : ""}`}>
                <Icon className="size-5" aria-hidden="true" />
                {count ? (
                  <span className="absolute -right-0.5 -top-0.5 grid min-w-4 place-items-center rounded-full bg-gold-400 px-1 text-[10px] font-bold leading-4 text-ink" aria-label={`${count} to do`}>
                    {count > 99 ? "99+" : count}
                  </span>
                ) : null}
              </span>
              {label}
            </button>
          );
        })}
      </div>
    </nav>
  );
}

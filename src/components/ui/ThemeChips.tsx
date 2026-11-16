/** A mashup's theme names both halves: "Home improvement × rock bands". */
export function themeParts(theme: string): string[] {
  return theme
    .split(/\s+[×x]\s+/)
    .map((part) => part.trim())
    .filter(Boolean)
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1));
}

/**
 * A puzzle's theme as gold chips under its title, one per half of a mashup
 * (Andrew, 2026-11-16: a single chip beside the eyebrow cut the second half
 * off). Rendered as siblings for a wrapping row: a chip that does not fit
 * moves to the next line whole, and only one wider than the row is cut short.
 */
export function ThemeChips({ theme }: { theme: string }) {
  return (
    <>
      {themeParts(theme).map((part) => (
        <span
          key={part}
          data-theme-chip
          className="max-w-full truncate rounded-full bg-gold-50 px-2 py-0.5 text-[11px] leading-4 font-semibold text-gold-700 ring-1 ring-gold-100"
          title={part}
        >
          {part}
        </span>
      ))}
    </>
  );
}

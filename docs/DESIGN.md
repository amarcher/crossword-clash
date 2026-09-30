# Crossword Clash design system

"Refined brand": neutral surfaces, the logo's blue as the single action color, the
logo's gold only for highlights. Restraint everywhere except the puzzle itself.

## Tokens (`src/index.css` `@theme`)

| Role | Token (Tailwind utility) | Use |
|---|---|---|
| Text | `ink`, `ink-soft`, `muted`, `subtle` | headings/body, secondary, captions, disabled/icons |
| Surfaces | `canvas` (page), `surface` (cards), `surface-sunken` (wells, footers, hover) | |
| Lines | `line`, `line-strong` | dividers/card borders, input + secondary-button borders |
| Brand | `brand-50…800` (600 = primary) | primary buttons, links, focus rings, active states |
| Gold | `gold-50…700` | streaks, trophies, the active word in the grid, "new"/theme chips. Never a button fill. |
| Stage (TV) | `stage`, `stage-raised`, `stage-line` | dark TV/host display only |
| Shadow | `shadow-card`, `shadow-raised`, `shadow-overlay` | cards, popovers, modals |

Fonts: `font-sans` = Figtree (body/UI, the default), `font-display` = Bricolage
Grotesque (page titles, puzzle titles, big numbers — never body copy or buttons).
Codes and timers: `font-mono tabular-nums`.

## Primitives (`src/components/ui`)

- `buttonClass(variant, size)` / `<Button>` — variants `primary | secondary | soft | ghost | danger | stage`, sizes `sm (36px) | md (44px) | lg (48px)`. Use `buttonClass` on `<Link>`.
- `<Card>` — white rounded-2xl surface. `<Eyebrow as="h2">` — small uppercase section label.
- `<ListGroup>` + `<ListRow icon title subtitle to|onClick tone>` — grouped navigation rows (menu-style).
- `<MiniGridThumb puzzle>` — non-interactive grid-shape thumbnail (the signature element).
- Icons: `lucide-react`, `size-4`/`size-5`, `aria-hidden`. No emoji as UI icons or button labels.

## Rules

1. **One primary action per view.** Everything else is `secondary`, `soft`, or `ghost`. No rainbow button stacks.
2. **Form controls are ≥16px on phones** (`text-base md:text-sm`) — iOS zooms otherwise. Touch targets ≥44px (`min-h-11`) for anything primary.
3. Radii: controls `rounded-xl`, cards `rounded-2xl`, chips `rounded-full`.
4. Layouts are designed for both widths: phone column `max-w-md` with a 16px gutter; desktop uses the space (two columns, grids) instead of a stretched phone column.
5. Sentence case copy; buttons say what happens ("Create room", not "Submit").
6. `hover:` always paired with an `active:` or focus state; `focus-visible:outline-2 outline-brand-500` on custom controls.
7. Respect `prefers-reduced-motion`; motion is short (150–250ms) and purposeful.
8. **No left-border accent bars** (`border-l-4`, inset left shadows, colored `borderLeft`) to mark active, selected, or attributed items. Use a tinted fill, a dot, a chip, or type weight instead.
9. The TV view uses the stage tokens and is read from across a room: large type, `clamp()` sizing, no small text.

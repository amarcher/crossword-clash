# Site chrome audit — headers, alignment, jank, page transitions

Audited 2026-10-17 on `main` (b2bf923, after the grid PRs). Covers the page
shells around the game: the site bar and logo, back controls, content
columns, first-paint stability, and route transitions. Measured headlessly
against the production build (`vite preview`) at 1280×900 and 390×844, plus
the dev server in the browser pane. Numbers below are from the production
build on localhost, so load times are near zero and only the *shape* of the
transition behaviour transfers to real networks.

## Verdict

There are four different page shells and they do not share an edge. The site
bar is always a 1024 px column, while the page under it is 448, 672, 768 or
1280 px wide, so on most inner pages the logo floats far to the left of the
content and on the studio it sits inside it. The flow screens use a third
pattern (chevron on the left, no logo) and the play screens a fourth. One
shell component that puts the bar *inside* the page's own column fixes the
alignment everywhere at once and is the prerequisite for a stable header
during page transitions.

Transitions themselves are instant swaps with no motion, no pending state,
and no prefetch; locally they take 10–20 ms, so the smoothness work is
choreography (a short cross-fade with the bar held still) and resilience on
slow networks (prefetch on intent, a progress bar after ~150 ms), not raw
speed. The one real jank is the menu's first paint, which moves after render
for three separate reasons.

## Status

**Items 1, 2, 3 and 5 shipped** (one page shell, PR "Site chrome: one page shell",
2026-10-17). Items 4 and 6–11 are open.

- `src/components/PageShell.tsx` — `width` token (`md | 2xl | 3xl | 4xl | 5xl | 7xl`,
  plus `widthLg` for the lobby's wider desktop column) puts the `SiteBar` and the
  page content in one `mx-auto w-full max-w-* px-4 md:px-6` column. `PAGE_GUTTER`
  is the shared gutter; `GameLayout`'s header and the menu use it too, so the
  title's x position no longer differs between menu, inner pages and play.
  `below` renders full-width content after the column (the classics' sticky
  filter band, whose inner row uses `pageColumnClass("5xl")`).
- `SiteBar` is width-agnostic (`w-full`, no max-width, no `-ml-1`) and gained
  `onBack` for the flow screens; `FlowPage` renders it (logo left, back +
  `action` right) instead of its own chevron row, and `HostImportScreen` passes
  its back target into the hub's bar instead of stacking a second header.
- `public/logo.png` is cropped to the wordmark (2292×500, 46.9 kB from 53.6 kB).
  Heights were rescaled to keep the visible size: SiteBar `h-9 sm:h-11` (was
  `h-12 sm:h-14` of the padded asset), `Title` static `h-28` (was `h-36`),
  `TVBrand` 2.76u (was 3.6u), bookmarklet page 37/43 px (was 48/56).

Measured with `scripts/chrome-alignment.mjs` (dev server, 1280×900 and 390×844):
Δ logo = logo's first opaque pixel column minus the column's content-box left
edge, Δ right = the bar's right slot's right edge minus the content-box right
edge. Before, on `main` 633b859; after, this branch.

| width | route | before Δ logo | before Δ right | after Δ logo | after Δ right |
|---|---|---|---|---|---|
| 1280 | /privacy | −205.5 | +208 | 0 | 0 |
| 1280 | /daily/leaderboard | −285.5 | +288 | 0 | 0 |
| 1280 | /nyt-import | −285.5 | +288 | 0 | 0 |
| 1280 | /solo/import | −125.5 | +128 | 0 | 0 |
| 1280 | /classics | −13.5 | +16 | 0 | 0 |
| 1280 | /studio | +114.5 | −112 | 0 | 0 |
| 1280 | /join, /host-game/name | no logo; chevron on the left | | 0 | 0 |
| 1280 | /host-game/import | −125.5 (two headers) | +128 | 0 | 0 |
| 390 | /privacy | −18.4 | +20 | 0 | 0 |
| 390 | every other SiteBar page | +1.6 | 0 | 0 | 0 |
| 390 | /join, /host-game/name | no logo; chevron on the left | | 0 | 0 |

Back control: 44 px tall everywhere, 44×44 icon-only on phones.

## Alignment — measured

Left edge of the logo's *visible* pixels vs the left edge of the page's
content column, desktop 1280 px (phone in brackets):

| Page | Shell | Content column | Logo visible edge | Offset |
|---|---|---|---|---|
| /classics | SiteBar + max-w-5xl | 128–1152 | 131 | +3 px inside (phone +2) |
| /privacy, /terms, /support | SiteBar + max-w-2xl | 304–976 | 131 | 173 px outside |
| /daily/leaderboard | SiteBar + max-w-md | 416–864 | 131 | 285 px outside |
| /nyt-import | SiteBar + max-w-md | 416–864 | 131 | 285 px outside |
| /solo/import (hub) | SiteBar + max-w-3xl | 256–1024 | 131 | 125 px outside |
| /studio | SiteBar + max-w-7xl | 16–1264 | 131 | 115 px *inside*; right slot ends at 1152 vs content 1264 |
| /menu | centred Lottie wordmark, no bar | 128–1152 | 340–940 (centred) | n/a |
| /join, /host-game/name, /lobby, /puzzle-ready, /challenge | FlowPage: chevron left, no logo | 416–864 | chevron at 420 | back control on the left |
| /solo/play, /play/:id | GameLayout: full-bleed bar, title + timer, no logo | 0–1280 | — | different gutter (24 px) |
| /host (TV) | dark stage, centred brand | — | — | its own world, fine |
| /host-game/import | custom 56 px back row at max-w-3xl, then the hub's own SiteBar | 256–1024 | 131 | two headers stacked |

Right edge: on every SiteBar page the back link / right slot ends at 1152
(the 5xl column), so it only lines up with content on /classics; on the
studio it is 112 px short of the content's right edge.

### Findings

1. **The site bar has a fixed width; pages don't.** `SiteBar` renders its own
   `mx-auto max-w-5xl` header regardless of the page below it. — `src/components/SiteBar.tsx`.
   Fix: make the bar width-agnostic (`w-full`, no max-width) and have one
   `PageShell` component (`width: "md" | "2xl" | "3xl" | "5xl" | "7xl"`) wrap
   both the bar and the content in the same `mx-auto max-w-* px-4`
   container. Every inner page then shares one edge by construction. Pages
   to move: ClassicLibrary, LegalPage, DailyLeaderboard, NytImport,
   PuzzleImporter (hub), Studio, RouteError.

2. **The logo PNG carries its own padding, and `-ml-1` only half corrects
   it.** `public/logo.png` is 2444×652 with the opaque wordmark at x 76–2368,
   y 76–576: 3.1 % transparent on the left and 11.7 % top and bottom. At the
   56 px bar height that is 6.5 px of invisible left margin and only 43 px of
   visible logo. The `-ml-1` (4 px) nudge leaves the visible edge 2–3 px
   inside the column. Fix: crop the asset (or export an SVG wordmark; there
   is only `favicon.svg` today) and delete the nudge. A cropped asset is also
   smaller than the 53 kB it costs on every inner page.

3. **Two back-button conventions.** FlowPage puts an icon-only chevron on the
   *left*; SiteBar puts "← Back" on the *right* (icon-only on phones).
   HostImportScreen hand-rolls a third row above the hub's SiteBar, so that
   page has two headers. Pick one: logo left, back + actions right (the
   SiteBar model) is the one the brand pages already use, so FlowPage should
   adopt the shared bar with its chevron in the right slot, or FlowPage's
   chevron should move into the bar's left slot *after* the logo. Either way
   HostImportScreen's extra row goes.

4. **The menu is the only page without the bar.** The centred animated
   wordmark is the brand moment and can stay, but the footer row (language,
   privacy, terms) uses a different pattern from LegalPage's right-slot
   language switcher. Low priority; note it so the shell work doesn't
   accidentally "fix" the hero.

5. **Play screens are deliberately full-bleed.** GameLayout's bar is a
   different beast (title + timer + action in a bordered strip). Fine, but
   its horizontal padding (16 / 24 px) should match the shell's gutter so
   the menu → play transition doesn't shift the title's x position.

## First-paint stability (jank)

Measured CLS, production build, cold cache:

| Page | Desktop | Phone | Cause |
|---|---|---|---|
| /menu | 0.07–0.08 | 0.15–0.17 | sections mount/unmount after first paint (below) |
| /classics | 0.10 | 0.15 | web-font swap reflows the card grid (19 px per card) |
| /privacy, /leaderboard, /solo/import, /studio | 0.00 | 0.00 | — |

6. **The menu renders, then rearranges.** Three things resolve after the
   first frame, each moving content: (a) `showFriends = Boolean(user) || loading`
   mounts the "Play with friends" section and the "Race friends" button
   during auth loading and unmounts them if there is no user (always, in a
   build without Supabase; in production whenever anonymous sign-in fails
   or is slow and resolves null) — the mutation log shows the section and
   button removed at +250 ms and everything below jumping 341 px; (b) the
   Daily Large tile is `{dailyLarge && …}`, so on the first visit of a day it
   mounts after the feed answers and pushes the phone layout down by a full
   card (~300 px); (c) the hero skeleton → content swap changes height
   slightly, and the Lottie's Suspense fallback is swapped for the real
   component (same box, no shift, but a re-mount). — `src/screens/MenuScreen.tsx`.
   Fix: keep sections mounted and *disable* instead of unmounting; reserve
   the Large tile's slot while the feed is unknown (skeleton hero) and only
   collapse it once the feed says "none today"; make the skeleton the same
   height as the loaded hero.

7. **Fonts swap after first paint.** Figtree and Bricolage are loaded from
   the Fontsource CSS (`font-display: swap`) with no `<link rel="preload">`,
   so the first frame is in the fallback font and the real one lands ~90 ms
   later, reflowing every text block (the classics cards move 19 px). Fix:
   preload the two latin `woff2` files from `index.html`, and add
   metric-matched fallbacks (`size-adjust`, `ascent-override`,
   `descent-override`, `line-gap-override` on a local `Arial`/`Helvetica`
   face) so the swap is visually silent even when the font is late.

8. **The wordmark animates on every return to the menu.** `Title animate`
   plays the 91-frame, 1.5 s Lottie each time the menu mounts (back from a
   puzzle, from the leaderboard, from a legal page). It also runs
   `goToAndStop` per frame on the main thread while the daily feed and
   auth are resolving. Play it once per session (sessionStorage flag) and
   rest on the final frame afterwards; the static image can carry
   `view-transition-name: brand` so it becomes the shared element during
   route transitions.

9. **Smaller things.** `theme-color` in `index.html` is `#1e1e2e` (a dark
   stage colour) while every page's canvas is `#f4f6fa`, so Android
   Chrome's address bar and iOS Safari's tint are dark over a light app;
   set it to the canvas colour (and `media="(prefers-color-scheme: dark)"`
   only if a dark theme ever ships). The classics sticky filter bar uses
   `backdrop-blur`, which is the single most expensive scroll effect on
   low-end phones; it's fine, but it's the first thing to drop if that
   page ever feels sticky. The main JS chunk is 1.0 MB (301 kB gzip) and
   includes the three narrator backends, ElevenLabs/OpenAI client code and
   `AudioContext` playback that only `/host` uses — route-lazy those and
   the menu's first load gets lighter for everyone.

## Page transitions

Measured on localhost: menu → classics 21 ms cold chunk, 14 ms warm;
classics → menu 10–13 ms; menu → import hub 16 ms. So:

10. **There is no transition, only a swap.** No `startViewTransition`, no
    `useNavigation()` pending state, no prefetch. On a fast connection the
    swap is instant and reads as abrupt; on a slow one the old page sits
    dead for the chunk download with no feedback at all, since the lazy
    route keeps the previous screen mounted.
    Recommendation, in order:
    - **Hold the bar still, fade the body.** Once every page shares the
      shell (item 1), give the bar `view-transition-name: site-bar` and the
      logo `view-transition-name: brand`, and wrap `navigate()` calls that
      come from the shell's links in `document.startViewTransition`. Keep
      the root cross-fade at ~160 ms ease-out, nothing slower; the bar and
      logo then stay put while only the content fades. This is the
      "buttery" effect at essentially zero cost, and it degrades to today's
      swap where the API is missing. React Router v7 note: the router wraps
      state updates in `React.startTransition`, so the update callback must
      `await navigate(to, { flushSync: true })` or the new snapshot is
      captured before the route commits (see the `view-transitions` skill).
      Honour `prefers-reduced-motion` by skipping the fade.
    - **Prefetch on intent.** Trigger the route's `lazy` import on
      `pointerenter` / `focus` / `touchstart` of menu rows and the bar's
      links (a tiny `prefetchRoute(path)` map next to `router.tsx`), so the
      chunk is usually cached by the time of the click.
    - **Pending feedback after 150 ms.** A 2 px top progress bar driven by
      `useNavigation().state === "loading"`, shown only once a navigation
      has been pending for 150 ms, so slow chunk loads never look like a
      dead click.
    - **Menu → play is the one place to be careful.** The play screens are
      full-bleed with a different bar, so the shared-element morph does not
      apply there; a plain fade is right, and the game grid should not
      animate at all (it has its own entrance already).

11. **Scroll position.** No `<ScrollRestoration>`; React Router's data router
    leaves the window scroll where it was, so coming back from a long
    classics list to the menu can land mid-page. Add `<ScrollRestoration />`
    in `RootLayout` (it restores on back/forward and scrolls to top on push).

## Checked and fine

- Route chunks are small (0.2–31 kB) and split per screen; `vite:preloadError`
  reload guard is in place.
- No horizontal overflow on any audited page at 390 px.
- The SiteBar back control is a 44 px target on phones; FlowPage's chevron too.
- The Lottie box is reserved during its lazy load (no shift from it).
- Button/list hover and active transitions are consistent at 150 ms.

## Suggested order

1. Item 1 + 2 + 3 together as "one page shell": the alignment fix, the
   cropped logo, FlowPage and HostImportScreen on the shared bar. This is
   the structural change everything else hangs on.
2. Items 6 + 7 + 8 as "stable first paint": menu sections, font preload +
   metric fallbacks, Lottie once per session.
3. Item 10 + 11 as "transitions": view-transition cross-fade with the bar
   held, prefetch on intent, pending bar, scroll restoration. Depends on 1.
4. Item 9 as polish (theme-color is a one-liner; the narrator chunk split
   is a separate, larger change).

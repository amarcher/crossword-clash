# Big screens: iPhone Duo, tablets, foldables, touch Macs

Research of 2026-10-28. The general knowledge (device sizes, platform rules,
web API support, gesture recipes) lives in the shared `touch-screens` skill
(`~/.claude/skills/touch-screens/`) so other projects can use it; this doc is
what it means for Crossword Clash.

## The devices in one paragraph

- **iPhone Duo** (on sale 2026-10-23): a passport-style foldable. The outer
  screen is a short, wide phone (Safari 382×618). The inner screen is
  iPad-shaped (669×951 pt, ratio 1.42, squarer than an iPad mini).
- **Galaxy Z Fold8** (Jul 2026) and **Z TriFold**: 4:3 inner screens, the
  "Android iPads". Most other book foldables (Pixel Fold, Oppo, Honor, Vivo,
  Fold7) are near square (1.04–1.13). Flips are tall phones that half-open
  into a tabletop.
- **Touch MacBook Pro** (announced today, ships Nov 6): a desktop layout people
  will tap. How its Safari reports touch is not documented yet.

## What each screen gets today (native app)

From the code audit. Layout is picked by `Capacitor.isNativePlatform()` plus
width breakpoints (`GameLayout.tsx`, `src/index.css:106-185`). The clue side
panel appears at ≥ 768 px. Below that, the app shows a clue bar plus the
in-app `PuzzleKeyboard` (~250 px tall).

| Screen | Gets | Problem |
|---|---|---|
| Duo outer, 382×618 | Phone column: header, grid, clue bar, keyboard | Height-starved: about 300 px is left for the grid |
| Duo inner, 669×902 | Phone column (669 < 768) | No clue list despite a tablet-sized screen |
| Fold7 inner, 984×1092; Fold8 | Grid + clue panel | Keyboard and clue bar still shown under the panel |
| iPad portrait / landscape | Grid + clue panel + clue bar + keyboard | Clue bar duplicates the panel; keyboard stays up with a Magic Keyboard attached |
| Half-open fold (tabletop / book) | Nothing special | — |

Fold and unfold already behave on Android: the main activity's
`configChanges` stops the WebView from being rebuilt. Layout is CSS, so it
reflows. No measurements are taken at mount that would break on resize.

## Quick fixes (small, high value)

1. **Build with Xcode 27.1.** This Mac has Xcode 26.6, so every build so far,
   build 20 included, runs letterboxed at phone size on the Duo's inner
   screen. CNN described unoptimized apps there as "a blown-up phone app".
   Rebuilding with the iOS 27.1 SDK makes the app edge to edge with no code
   change. Then test the Duo simulator in Xcode 27.1's Device Hub. Once built
   with 27.1, **Duo screenshots are required from April 2027**.
2. **Done (`claude/big-screen-fixes`): hide the in-app keyboard when a hardware keyboard is in use.** Use "last
   input modality": a physical keypress hides `PuzzleKeyboard`, a touch on the
   grid brings it back, and the choice is remembered per device. This hands
   about 250 px back to the grid on every docked iPad, Googlebook and
   keyboard-paired foldable. Google lists keyboard support as baseline
   ("adaptive ready").
3. **Done, narrowed: drop the clue bar where the clue panel shows — in
   keyboard mode only.** The bar also carries previous/next word and the
   direction toggle, which touch players still need; with a keyboard, Tab,
   Space and the arrows do that.
4. **Done: give `NytImportActivity` the same `configChanges`** as `MainActivity`
   (add `smallestScreenSize|screenLayout|density`). Without them, unfolding
   mid-import rebuilds the activity and reloads the NYT page.
5. **Done: keep the TV / host screen awake** with the Screen Wake Lock API, or a
   keep-awake plugin in the apps. A tablet propped up as the scoreboard
   currently dims and locks.
6. **Remove the stale `classics` screenshots** from both App Store sets
   (`docs/app-store/screenshots/*/0?-classics.png`). The classic library was
   removed today.

## Layout work (medium)

- **A "medium" native layout for 600–767 px** (Duo inner, iPad Split View,
  small tablet portrait): grid on top with a two-row clue strip, or the
  Across/Down lists beneath the grid when the height allows, instead of the
  phone's single clue bar.
- **A short-screen layout for the Duo's outer display** (aspect ≈ 1.45): a
  compact keyboard (shorter keys, or a two-row variant) and a slimmer header,
  triggered by aspect ratio and height rather than width.
- **TV view in portrait** (`index.css`, `TVLayout`): stack the grid above the
  scoreboard and clues when the screen is taller than wide. Today the side
  column squeezes the grid to about 630 px on a portrait iPad.

## Posture ideas (bigger; Android first)

Chrome 132+ / Android WebView (per MDN, unverified on hardware) exposes
`@media (device-posture: folded)` and Viewport Segments. Safari keeps both
behind flags, so on the Duo, fold state needs a small native bridge to
`ReservedRegion`, or `@erkamyaman/capacitor-foldable` (young, one maintainer).

- **Tabletop** (half-open, horizontal fold; Flip, Duo, Fold): grid on the
  upright half, clue and keyboard on the flat half. This is the same split
  Apple's showcase apps use (Tiny Computers, MLB, Prime Video).
- **Book** (vertical fold): grid | Across + Down, split exactly at the hinge
  (`env(viewport-segment-*)`).
- **Face-to-face race on one device**: a tablet or half-open foldable laid
  flat between two players, each with their own keyboard and half of the
  clues, the far side rotated 180°. This is Battlefleet Duo's trick, and it
  turns the app into a table game with no second phone or room code.
- **Outer screen as a glance**: on the Duo, the closed phone shows today's
  dailies and the live race scoreboard, and unfolding continues the same
  puzzle. The app already keeps running across the fold.

## The studio on wide touch screens

The desk at ≥ 64 rem is three columns (setup | grid | words) with clues below
(`StudioScreen.tsx:688`). It is already reachable by touch: long press on a
square opens the context menu for any non-mouse pointer
(`StudioGrid.tsx:92`). Ideas for an iPad in landscape, an unfolded Fold8, or
the touch MacBook Pro:

- **Swipe to paint black squares.** Drag across squares to toggle them, with
  symmetry, as one undo step. Because `touch-action` is decided at
  `pointerdown`, this needs a "Blocks" tool (or pen/mouse paints while fingers
  pan). Recipe in the skill's `gesture-recipes.md`.
- **Drag a word from the Words panel onto its slot**, with letters ghosted in
  the grid while hovering. Tap-to-place remains as the twin.
- **Swipe a candidate row** left to reject or right to approve, with an Undo
  toast. Long press a row for the same menu.
- **Pinch-zoom the grid** for 15×15 and larger on a phone or Duo, including
  trackpad pinch (`wheel` + `ctrlKey`) on Macs, with zoom buttons as the twin.
- **A fourth column for clues on very wide screens** (≥ ~1440 px), so clue
  writing sits beside the grid instead of below it. Picking an entry in either
  pane scrolls the other.
- **Size for fingers on the desktop layout**: where `any-pointer: coarse`
  matches (touch Mac, Windows touch, iPad), keep toolbar and menu targets
  ≥ 44 px.
- **Pencil**: Scribble works in standard web inputs. Whether it can write
  into grid cells through our single hidden input is unknown and needs an
  experiment; it probably needs visible per-cell inputs.
- **Touch Mac route**: the web studio already runs there. The iPad app on
  Apple-silicon Macs ("Designed for iPad") is the other path and is
  touch-native by construction.

## Sources

Apple: [iPhone Duo newsroom](https://www.apple.com/newsroom/2026/09/apple-unveils-iphone-duo/) ·
[HIG: designing for iPhone Duo](https://developer.apple.com/design/human-interface-guidelines/designing-for-iphone-duo) ·
[Preparing your app](https://developer.apple.com/documentation/technologyoverviews/preparing-your-app-for-iphone-duo) ·
[WebKit features in Safari 27.1](https://webkit.org/blog/18486/webkit-features-for-safari-27-1/) ·
[TN3192 (UIRequiresFullScreen)](https://developer.apple.com/tutorials/data/documentation/technotes/tn3192-migrating-your-app-from-the-deprecated-uirequiresfullscreen-key.md) ·
[Screenshot specs](https://developer.apple.com/help/app-store-connect/reference/app-information/screenshot-specifications) ·
[Duo app showcase](https://www.apple.com/newsroom/2026/10/developers-bring-incredible-new-app-experiences-to-iphone-duo/) ·
[9to5Mac review](https://9to5mac.com/2026/10/21/iphone-duo-review/) ·
[CNN review](https://www.cnn.com/cnn-underscored/reviews/iphone-duo)

Touch Mac: [9to5Mac](https://9to5mac.com/2026/10/28/apple-announces-redesigned-macbook-pro-its-first-touchscreen-mac/) ·
[TechCrunch](https://techcrunch.com/2026/10/28/apple-launches-its-new-touchscreen-macbook-pro/) ·
[macOS 27.2 touch clues](https://9to5mac.com/2026/10/05/macos-27-2-reveals-new-clues-about-apples-touchscreen-macbook-pro/)

Android: [Android 16 behavior changes](https://developer.android.com/about/versions/16/behavior-changes-16) ·
[Android 17 resizability](https://developer.android.com/blog/posts/prepare-your-app-for-the-resizability-and-orientation-changes-in-android-17) ·
[Adaptive app quality](https://developer.android.com/docs/quality-guidelines/large-screen-app-quality) ·
[Window size classes](https://developer.android.com/develop/ui/compose/layouts/adaptive/use-window-size-classes) ·
[Viewport Segments shipped](https://developer.chrome.com/blog/viewport-segments-api-shipped) ·
[Device Posture (MDN)](https://developer.mozilla.org/en-US/docs/Web/API/Device_Posture_API) ·
[Galaxy Z Fold8](https://www.gsmarena.com/samsung_galaxy_z_fold8_goes_wide_fold8_ultra_aims_for_the_foldable_crown-news-73825.php) ·
[capacitor-foldable](https://www.npmjs.com/package/@erkamyaman/capacitor-foldable)

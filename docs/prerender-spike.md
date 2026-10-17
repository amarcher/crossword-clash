# Spike: crawlable HTML for the content routes

**Date:** 2026-10-16
**Question:** Crawlers and the AdSense reviewer currently receive `index.html`
with an empty `#root` and a JSON-LD block, because `vercel.json` rewrites every
non-asset path to the SPA shell. Should the content routes be served as real
HTML, and if so, how?

**Decision:** build-time prerendering (option A). The six content routes are
rendered to static HTML by a Vite plugin after the client build and hydrated by
the same bundle. React Router framework mode with SSR (option B) is not
necessary for what the site needs and would cost far more.

**Caveat up front:** prerendering makes the content *crawlable*. It does not by
itself change an AdSense "low value content" verdict. That depends on how much
substantive text the site has; the prerendered menu is still a list of modes
plus a daily tile, and the classics page is 46 short cards. More words on the
page is a separate piece of work.

## The two options

### A. Build-time prerendering (chosen)

Render `/`, `/menu`, `/classics`, `/privacy`, `/terms`, `/support` to
`dist/<route>/index.html` (and `dist/index.html` for `/`) with the real markup
inside `#root`, per-route `<title>`/meta, and let the normal client bundle
`hydrateRoot` into it. Every other route keeps the SPA fallback.

Two ways to produce the HTML were considered:

| Renderer | Verdict |
| --- | --- |
| `react-dom/server` `renderToString` of the real route tree, via a second Vite build in SSR mode | **Chosen.** Same components, same Tailwind classes, deterministic, ~3 s extra build time, no browser needed on Vercel. |
| Headless Playwright against `vite preview`, saving the DOM | Rejected. Needs Chromium on the Vercel builder (~150 MB download per build), captures client state (daily feed, localStorage, consent) that must *not* be in the static HTML, and is slow and flaky. |

What it needs:

- **Module-init browser access must be guarded.** The SSR build imports the
  same modules the browser does. The ones that touched `window` at import or
  during the first render: `GameContext` (`window.location.hash` in a
  `useState` initializer), `IndexRedirect` (`window.location.search`,
  `hasImportHash()`), `consentStore` (already guarded), `i18n`
  (`localStorage`/`navigator`, already guarded), `Title` (`matchMedia`,
  already guarded), `platform.ts` (already injectable). `main.tsx` itself
  (`document.documentElement`, `window.addEventListener`) is not imported by
  the server entry, which is why the tree is split into an `AppShell`.
- **First client render must equal the server render**, or React throws the
  HTML away and re-renders from scratch (a visible flash, the thing we are
  trying to avoid). Anything read synchronously from the browser during
  render (localStorage, `matchMedia`, `navigator`) has to resolve to the server
  value during hydration and update afterwards. `useSyncExternalStore` with a
  server snapshot is React's sanctioned way to do this; a tiny `useHydrated()`
  hook built on it gates: the daily hero (feed cache), streak chips and
  solved/PB badges (solo stats), the desktop-only NYT tile, the iOS/Android
  app rows, and the consent-dependent `AdSlot`.
- **i18n language at build time** is English. The HTML is `lang="en"`. A
  visitor whose stored or browser language is Spanish must not hydrate English
  markup with Spanish text; an inline script in the prerendered page clears
  `#root` for them before the bundle loads, so they get today's client render.
- **Route-dependent redirects on `/`.** `IndexRedirect` sends returning players
  to `/solo/play`, `/rejoin`, `/importing`, `/join`, `/puzzle-ready`. The same
  inline script clears `#root` when any of those conditions hold (saved solo
  or multiplayer session, a `#puzzle=`/`#import` hash, `?join=`), so those
  visitors never see the menu HTML and never hydrate a tree that is about to
  `<Navigate>` away.
- **Consent banner and GA.** The GA snippet in `<head>` is unchanged (it runs
  before React either way). The consent banner renders nothing until
  `detectConsentRequirement()` resolves in an effect, so the static HTML has
  no banner and hydration matches. AdSense is injected by `AdSlot` only after
  consent, and `AdSlot`'s server render is "not allowed" (no `<ins>`), so the
  reviewer sees no ad slot in the static HTML, which is what a first-time EEA
  visitor sees today as well.
- **Lazy routes.** `/classics` and the legal pages are code-split. The router is
  not `initialized` until their modules load, so `main.tsx` waits for
  `router.state.initialized` before calling `hydrateRoot`; the static HTML
  stays on screen meanwhile. `Title`'s lazy Lottie logo falls back to its
  reserved box in the HTML (what `renderToString` does for a suspended
  `lazy`) and fills in client-side.
- **Classics data.** The screen fetched `manifest.json` in an effect, so a
  server render would have shown "Loading…". The prerender now preloads the
  manifest and embeds it in the page as `<script type="application/json">`;
  the screen reads it synchronously on first render, so server and client
  agree and the 46 cards (title, author, size, clue count, blurb) are in the
  HTML. Client-side navigation to `/classics` still fetches as before.
- **Per-route head.** One table (`src/lib/pageMeta.ts`) is the source of truth
  for `<title>`, description, canonical and the OG/Twitter copies. The
  prerender writes it into each page's `<head>`; the client applies the same
  table on every navigation (`router.subscribe`), replacing the ad-hoc
  `document.title` effect in `LegalPage`. `/menu` is canonicalised to `/`.
- **Vercel routing.** Vercel serves files on disk before applying `rewrites`,
  so `dist/classics/index.html` wins over the `/index.html` catch-all with no
  change to the rewrite list. `vite preview` does not serve directory indexes
  for extensionless paths; the existing `/install-bookmarklet` middleware is
  generalised to any `dist/<path>/index.html`.

Risk to the native Capacitor build: **none by construction.** The plugin runs
only when `mode !== "mobile"`, so `pnpm build --mode mobile` produces the same
`dist/` as before. In the apps, `#root` is empty, so `main.tsx` takes the
`createRoot` path exactly as today. The hydration path is also gated on a
`data-prerendered` attribute that only the plugin writes.

Build-time cost: one extra Vite build in SSR mode (no minification, one entry)
plus six `renderToString` calls. Measured locally (M-series Mac): the client
build takes about 3.2 s and the prerender step about 2.9 s, so `pnpm build`
goes from roughly 7 s to roughly 10 s end to end. On Vercel expect a similar
few-second increase; no browser download, no new dependency.

Two things found while implementing, both now handled:

- **The SPA catch-all serves the home page.** `vercel.json` rewrites every
  unknown path to `/index.html`, which after prerendering is the home page
  with the menu in `#root`. Without a guard, `/solo/play` would flash the menu
  until the bundle loaded and then hydrate a tree that renders a different
  screen. The inline guard clears `#root` whenever `location.pathname` is not
  the route the page was rendered for, and `main.tsx` checks the same.
- **A `lazy` component under `Suspense` breaks clean hydration.**
  `renderToString` emits a suspended boundary as "client-render this", and
  React 19 then logs a recoverable error on hydration even though the rest of
  the page hydrates in place. The animated logo (`Title`) now renders only its
  reserved box until hydration is done, and mounts the Lottie on the next
  render. The same would apply to any other lazy component that lands in a
  prerendered route.

Verification note: `vite build --mode development` still bundles production
React, which does not report mismatches. To see them, build with
`NODE_ENV=development` as well (see CLAUDE.md) and watch the console for
"hydrating prerendered <route>" with no error after it.

### B. React Router framework mode with SSR on Vercel (not chosen)

Migrate to `@react-router/dev` (Vite plugin, `routes.ts`, `root.tsx`,
`entry.server.tsx`/`entry.client.tsx`) and deploy with `@vercel/react-router`
so each request is rendered in a Vercel Function.

What it needs:

- Rewriting the route tree from `createBrowserRouter([...])` to the framework's
  file/config conventions; every screen becomes a route module. `IndexRedirect`
  and `HostIndexRedirect` (which read localStorage to decide where `/` goes)
  have no server equivalent and would have to become client-only redirects or
  loaders that read cookies.
- Every one of the module-init guards from option A, plus **every** screen must
  render on the server or be marked `clientLoader`/client-only, including the
  game screens that hold Supabase realtime channels, the Web Speech API, the
  AudioContext narrator and the studio's wasm worker. Framework mode does
  support `ssr: false` per route (SPA mode with prerender), but at that point
  it is option A with a framework migration attached.
- Vite config split: the framework plugin owns the build; the custom plugins
  here (studio asset dropping, mobile HTML transform, bookmarklet rewrite)
  would need re-homing.
- A server runtime on Vercel (Functions, cold starts, a second place where env
  vars matter), and the `api/*.ts` functions sitting beside it.
- **Capacitor:** the apps load `dist/index.html` from the filesystem with no
  server. A framework-mode build in SSR mode has no such file. The native build
  would need its own SPA-mode build (`ssr: false`), i.e. two build
  configurations maintained in parallel, with the mobile `transformIndexHtml`
  logic ported.
- Playwright E2E and the 941 vitest tests that render screens inside
  `MemoryRouter` would need review; `router.test.tsx` tests the redirect
  components directly and would be rewritten.
- Build time grows modestly, but deploy shape changes (static → function) and
  the cost model changes with it.

Benefits over A that the site does not currently need: per-request data on the
server (the daily puzzle could be rendered with today's title; the leaderboard
could be server-rendered), streaming, and `loader`-driven pages for a future
"one page per puzzle" library. If that library happens, revisit B then.

## Verification plan

- `pnpm build`, then `pnpm preview` and `curl -s localhost:4173/classics | grep -c "<li"` → 46;
  `curl -s localhost:4173/privacy | grep -o "<title>[^<]*"` → the privacy title;
  `curl -s localhost:4173/ | grep -c 'id="root"'` with real content inside.
- No hydration warnings in the browser console on `/`, `/classics`, `/privacy`
  as a fresh visitor; the Spanish path and the saved-solo-session path both
  clear `#root` and client-render.
- `pnpm exec vitest run --dir src`, `pnpm build`, `pnpm e2e`.
- `pnpm build --mode mobile` still produces an un-prerendered `dist/index.html`.

# End-to-end tests (Playwright)

```sh
pnpm exec playwright install chromium   # once
pnpm e2e                                # all specs
pnpm e2e solo                           # just the solo spec
```

Playwright starts its own Vite dev server on port 5287 (override with
`E2E_PORT`) and never reuses an existing one, so a dev server from another
checkout can't be picked up by accident.

| Spec | Needs Supabase | Runs in CI |
| --- | --- | --- |
| `solo.spec.ts` — play today's Mini to completion | no | yes |
| `multiplayer.spec.ts` — host + player in two isolated browser contexts, lobby → start → a claimed cell syncs across clients | yes | no (needs secrets) |

## Running the multiplayer spec locally

It is skipped unless `VITE_SUPABASE_URL` is set. `playwright.config.ts` loads
`VITE_*` vars from `.env` / `.env.local` (same files Vite reads), so with a
filled-in `.env.local` it just runs:

```sh
cp .env.example .env.local   # then fill in VITE_SUPABASE_URL / VITE_SUPABASE_ANON_KEY
pnpm e2e multiplayer
```

Notes:

- It creates a **real room** (games/players rows) on whatever project the env
  points at.
- Supabase rate-limits anonymous sign-ins per IP (~30/hour by default). The
  spec saves each role's anonymous session to `e2e/.auth/` (gitignored) and
  reuses it on later runs, so normally only the first run signs in. If you do
  hit the limit, the spec fails fast with a "rate limit" message — wait and
  retry, or delete `e2e/.auth/` if a saved session has gone stale.

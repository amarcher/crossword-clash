# Scalability and cost audit

*Written 2026-10-23. Vendor prices and plan limits were read from the vendors' pages on that date and are marked as such; everything labelled "estimate" is a modelling assumption, not a measurement.*

Crossword Clash today: version 1.0.2 on Google Play, in App Store review, the web app on Vercel, Supabase for data, auth, Realtime and edge functions, a Neon database for the `api_usage` ledger. Usage is small (low double-digit daily visitors; the production `games` table holds 733 rows since 2026-02-23, `players` 993, `puzzles` 662, `daily_results` 27, counted with the anon key over PostgREST on 2026-10-23). The question this audit answers: where does the architecture strain first as users grow, what does it cost at 1k, 10k and 100k monthly active users (MAU), and what covers that cost.

**Headline.** Nothing in the architecture is wrong for its size, and no limit bites below roughly 1,000 MAU. The first thing that forces money is not a capacity limit but Vercel's terms: the Hobby plan is for non-commercial use, so the day ads or purchases earn anything the site owes $20/month. The first *capacity* limit is Supabase database disk, and it is self-inflicted: a solo game stores its own copy of the puzzle (~15 KB) plus a `games` row rewritten on every keystroke, so disk grows ~230 KB per MAU per month and never shrinks. Fix that (dedupe puzzles, stop mirroring solo play to the server, delete stale rooms) and the next real wall is Supabase Realtime's messages-per-second ceiling, which arrives at a few dozen simultaneously hot race rooms. Ads on the web at ~1k MAU cover the fixed bill; a small premium tier that bundles ad-free and the AI narrator is what turns the narrator from a capped cost centre into revenue.

---

## 1. Multiplayer serving

### How a room works

- **Channel per room.** `useMultiplayer` (`src/hooks/useMultiplayer.ts`) subscribes every player to one Supabase Realtime channel, `game:<gameId>`, with `broadcast: { ack: true }`. Presence (`channel.track`) carries the live roster. The read-only spectate page (`useSpectatorRoom`, `src/hooks/useSpectatorRoom.ts`) subscribes to the same channel without tracking and re-fetches the room over REST on every broadcast (debounced 200 ms) and on a 15 s poll.
- **Claim path.** A correct letter is dispatched optimistically, then `claimCellOnServer` calls the `claim_cell` RPC (`supabase/migrations/20260426000001_claim_cell_auth_check.sql`), which `SELECT … FOR UPDATE`s the `games` row, checks `auth.uid()`, status and the cell, rewrites the whole `games.cells` JSONB with the new key and increments `players.score`. On success the client broadcasts `cell_claimed`; on failure it rolls back and calls `hydrate()` (two REST reads: `games` `select *` and `players`).
- **Other traffic per room.** `wrong_letter` broadcasts on every rejected letter (narrator flavour), `game_started`, `game_completed`, `race_finished`, `room_closed`, `new_game`; a hydrate on subscribe and on every tab wake (`visibilitychange`); `joinGame`/`rejoinGame` are 3–4 REST calls each (`src/lib/puzzleService.ts`).
- **Realtime publication.** Migration `20260224000000_multiplayer.sql` also adds `games` and `players` to the `supabase_realtime` publication. Nothing in the client subscribes to Postgres Changes, so this costs the Realtime server WAL decoding for every row update in those tables (including every solo keystroke, see §2) for no benefit. Drop them from the publication.

### Load per room (estimates)

Message counting rule, from Supabase's billing page (2026-10-23): a broadcast is billed as one message sent plus one per subscribed client that receives it, so a broadcast in a room of P players and S spectators costs about `1 + (P-1) + S` messages.

| Room | Cells | Claims (RPCs) | Broadcasts | Billed messages (4 players, no TV) |
|---|---|---|---|---|
| Daily mini 5×5 | ~21 | ~21 | ~21 claims + ~8 wrong letters + ~5 lifecycle | ~140 |
| Midi 9×9 | ~65 | ~65 | ~65 + ~20 + 5 | ~360 |
| 15×15 (classic / daily large) | ~190 | ~190 | ~190 + ~60 + 5 | ~1,000 |

A hot 4-player 15×15 race runs at roughly 2–4 claims/s, so ~10–16 Realtime messages/s plus ~3 RPCs/s and, if anyone has the spectate page open, up to 5 REST reads/s per spectator. Connections: one per player plus one per TV/spectator; players on the menu hold no channel.

### Plan limits that matter (Supabase, read 2026-10-23)

| Limit | Free | Pro (spend cap on) | Pro (spend cap off) | Overage |
|---|---|---|---|---|
| Realtime concurrent connections | 200 | 500 | 10,000 | $10 per 1,000 peak |
| Realtime messages per second | 100 | 500 | 2,500 | configurable via support |
| Realtime channel joins per second | 100 | 500 | 2,500 | — |
| Realtime messages per month | 2 M | 5 M | 5 M | $2.50 per million |
| Broadcast payload | 256 KB | 3 MB | 3 MB | — |
| Compute (default) | Nano, 60 direct / 200 pooled connections | Micro, 60 / 200 | Micro | Small ~$15/mo (90/400), Medium ~$60/mo (120/600) |
| Edge Function invocations | 500 k | 2 M | 2 M | $2 per million |
| Edge Function limits | 256 MB, 2 s CPU, 150 s wall (Free) / 400 s (paid) | | | |

Sources: supabase.com/pricing, docs/guides/realtime/limits, docs/guides/platform/compute-and-disk, docs/guides/functions/limits.

### Where it strains, in order

1. **Messages per second.** At ~12 msgs/s per hot 4-player 15×15 room, Free supports ~8 simultaneously hot rooms, Pro with the spend cap ~40, Pro without the cap ~200. Minis are 5× cheaper. Over the limit Realtime drops or delays broadcasts; the game still converges because `claim_cell` is authoritative and `hydrate()` runs on rollback and tab wake, but players see stale grids. **Fix:** turn the spend cap off before any launch push (it multiplies the ceiling 5× at no fixed cost), and stop broadcasting `wrong_letter` unless a TV/narrator is present in the room (it is ~30% of traffic and only the narrator reads it).
2. **Peak connections.** 200 (Free) / 500 (Pro) concurrent sockets is 50 / 125 four-player rooms at once. This is cheap once the cap is off: $10 per extra 1,000 peak connections.
3. **`claim_cell` row lock.** The `FOR UPDATE` on `games` serialises claims *within* a room, which is the intent; across rooms it is independent. Each claim is one short transaction (~5–20 ms, estimate) that rewrites a ~4 KB JSONB row, so a Micro instance should take several hundred claims/s before the PostgREST pool (sized to the compute tier) queues. That is far beyond the Realtime ceiling, so the lock is not the first limit. It does produce one dead tuple per claim (~190 row versions per 15×15 room); autovacuum copes at this scale.
4. **Hydrate storms.** Every rollback and every tab wake issues `games select *` (the full `cells` JSON). A classroom of 30 phones backgrounding and foregrounding together is 60 REST reads in a burst. Harmless until many rooms do it at once; fixable by hydrating only when the local grid is older than N seconds.
5. **Spectate polling.** `useSpectatorRoom` re-reads the room over REST on every broadcast and every 15 s. One spectator of a hot room is ~5 reads/s. A viral "watch this race" link would be the way this bites; a cheap fix is to derive the grid from the broadcasts and only poll for the roster.

### AI narrator edge functions

`narrator-claude`, `tts`, `agent-auth`, `openai-agent-auth` (`supabase/functions/`) each run, per request: a per-IP rate-limit check that counts and inserts into `narrator_usage` (`_shared/rateLimit.ts`), a budget check that queries the Neon `api_usage` ledger (`_shared/budgetGuard.ts`), then the vendor call, then a `logUsage` insert into Neon. So every narrator event is one edge invocation plus two Supabase queries plus two Neon round trips. The Claude path (`src/lib/narrator/claudeNarrator.ts`) resends the whole conversation history on every event, so input tokens grow with game length.

- Capacity is not the issue: invocations are a few hundred per narrated game against 500 k–2 M included.
- **Cost is the issue.** With the pricing in `src/lib/narratorBudget.ts` (Sonnet 4 $3/$15 per MTok, ElevenLabs TTS $0.00015/char, ElevenLabs agent $1.00/session, OpenAI Realtime $1.50/session), one narrated 15×15 game is roughly $0.80–1.50 on any backend (estimate: ~40 events, ~100 k cumulative input tokens, ~6 k TTS characters). The `NARRATOR_MONTHLY_USD_CAP` default of $20 therefore buys **15–25 narrated games a month** for the whole user base, after which every TV host gets the "taking a break" banner. The narrator cannot grow as a free feature; see §5.
- Rate limits: `tts` allows 30 calls/hour per IP but `narrator-claude` allows 60, so a lively Claude-narrated game loses its voice before it loses its commentary.
- `narrator_usage` has no retention; it gains one row per narrator call forever (`20260323000000_narrator_usage.sql`). Trivial today, but the count query runs on every call.
- `narrator-claude` pins `claude-sonnet-4-20250514`, which Anthropic lists as deprecated with a retirement date to be announced. Not a scale problem, but it will stop working one day without a code change; `claude-sonnet-5-5` is the like-for-like replacement at $2/$10 per MTok (Anthropic pricing, 2026-10-23).

---

## 2. Data we track

### Row growth per active user per day (estimates)

Assumptions: an active user opens the app 8 days a month and plays 1.5 puzzles per visit, one of which is a 15×15 on a third of visits.

| Table | Written by | Rows per DAU-day | Row size | Notes |
|---|---|---|---|---|
| `puzzles` | `uploadPuzzle` (`src/lib/puzzleService.ts`) on every solo load and every room | ~1.5 | **~15 KB** (measured, 20-row sample) | Dedup is by `file_hash`, which only file uploads have; dailies, classics and deep links insert a fresh copy every time (662 puzzles for 733 games) |
| `games` | `createGame` for solo and rooms; `updateGame` on **every cell change** in solo (`GameContext.tsx` effect) | ~1.5 rows, but ~200 UPDATEs per 15×15 | ~4 KB completed (measured) | Solo mirroring duplicates what localStorage already holds; ~190 `games` + ~190 `players` UPDATEs per solo 15×15 |
| `players` | one per participant | ~1.5 | ~150 B | |
| `play_sessions` | `usePlayInsights` upsert on hide/leave (`20261015000000_play_insights_and_daily_schedule.sql`) | ~1.5 | 0.6 KB (mini) to ~5 KB (15×15, `clues` JSONB ≤ 64 KB by CHECK) | Gated by consent on web, always on in apps |
| `daily_results` | one per (day, slot, user) finish | ≤ 3 | ~120 B | |
| `solves` | accounts only, one per (user, puzzle, day) | ≤ 2 | ~150 B | |
| `narrator_sessions`, `narrator_usage` | TV hosts only | ~0 | ~300 B | |
| `profiles` | one per account | ~0 | ~100 B | |
| `auth.users` (+ identities, sessions, refresh tokens) | `signInAnonymously` on **first visit**, before any play (`src/hooks/useSupabase.ts`) | 1 per new device | ~1–2 KB across auth tables | Never cleaned; Supabase: "Automatic cleanup of anonymous users is currently not available" |
| Neon `api_usage` | narrator / studio calls | ~0 | ~100 B | Free plan |

**Storage growth ≈ 20–25 KB per game played, ≈ 230 KB per MAU per month, cumulative.** At 1k MAU that is ~230 MB/month: the Free plan's 500 MB disk is gone in two months and Pro's 8 GB in three years. At 10k MAU Pro's 8 GB lasts ~3.5 months; at 100k MAU it is ~23 GB/month (disk is $0.125/GB/month, so the cost is small, ~$3/month per month of history, but the Free plan is simply unusable past ~1k MAU). Three changes cut this ~10×:

1. **Dedupe puzzles by content.** Hash the normalised puzzle (`puzzleIdentity()` already exists in `soloStats.ts`) and store it in `file_hash`, or a new `content_hash`, for every upload path, not just files. Dailies and classics then exist once each.
2. **Stop mirroring solo play to the server.** The `updateGame` effect in `GameContext.tsx` writes two rows per keystroke and nobody reads them back except the usage investigation. Keep `play_sessions` (one upsert per visit) as the analytics record and drop solo `games`/`players` rows, or write them once at completion.
3. **Retention.** Today 375 of 733 games are `active` and 126 `waiting` with nobody in them; rooms are never closed unless the host presses the button, and a six-character code stays joinable forever (`joinGame` accepts any `waiting`/`active` game). Add a `pg_cron` job: `waiting` rooms older than 12 h and `active` rooms untouched for 24 h → `closed`; `closed`/`completed` games older than 90 days deleted (cascade clears `players`; `daily_results.game_id` is `ON DELETE SET NULL`); orphaned `puzzles` with no `games` and no `daily_schedule` reference deleted; anonymous `auth.users` with no `players`, `play_sessions`, `daily_results` or `solves` rows older than 30 days deleted (Supabase publishes the SQL). `play_sessions.clues` nulled after 180 days, rows deleted after 2 years. `narrator_usage` older than 31 days deleted (the longest window it is queried over is the 30-day demo window).

### Queries and policies that get expensive

- **`insights_puzzles` (`20261017200000_play_insights_detail.sql`)** filters `play_sessions` by `started_at` alone. The only indexes are `(puzzle_key, started_at)` and `(user_id, started_at)`, so this is a sequential scan of the whole table plus a `percentile_cont` and four GROUP BYs. It is fine at thousands of rows; at ~1 M rows (about 1–2k DAU for a year) the studio panel will take tens of seconds and start hitting statement timeouts. **Fix:** an index on `play_sessions (started_at)`, and past ~5 M rows a nightly rollup into a `puzzle_stats_daily` table that the panel reads instead. `insights_clues` is keyed by `puzzle_key` and is fine.
- **RLS on `games` UPDATE** (`20260427000001_games_host_user_id.sql`) runs an `EXISTS` over `players` for every update; `idx_players_game_id` covers it. Fine.
- **`daily_results` leaderboard** reads `(day, slot, seconds)` with `LIMIT 50` through its composite index; `DailyLeaderboardScreen` refetches on every `visibilitychange`. Scales to millions of rows. A 10k-finisher day is 10k rows; nothing to do.
- **`solves` history load.** `ensureSolveHistory` (`src/lib/solveHistory.ts`, `PAGE = 1000`) downloads **every** row for the account on every app start. A three-daily-a-day solver accumulates ~1,100 rows a year, so after a few years each app open is several pages and a few hundred KB of egress. Replace with a `solve_summary(user_id)` RPC that returns best times and the streak days, and page the full list only on a history screen.
- **`claim_cell`** rewrites the whole `cells` JSONB; at 15×15 that is a 4 KB TOASTed value 190 times per room. Acceptable; a `cells` table keyed by `(game_id, cell)` would be the step up if rooms ever reach 2–3k concurrent, and it would also let `hydrate` fetch only what changed.
- **Realtime publication** includes `games` and `players` (§1); every solo keystroke is decoded by the Realtime server for subscribers that do not exist.

### Unbounded things, summarised

Abandoned rooms (51% of games are `active` forever), duplicate puzzle rows, anonymous auth users who never return (one per device that ever loaded the page, counted as MAU in the month they appear), `narrator_usage`, `play_sessions` clue detail, and `auth.sessions`/`refresh_tokens` rows behind each anonymous user. All are fixable with one migration adding `pg_cron` jobs; none needs an app release.

---

## 3. Web and static serving (Vercel)

### What a visitor costs

Measured from the current `dist/` (gzip): `index.html` 1.6 KB, main bundle 357 KB, CSS 15 KB, two latin fonts ~60 KB, the Lottie wordmark chunk 82 KB (first menu visit per tab session only), route chunks 5–80 KB each; 59 asset files. Prerendered routes (`/`, `/menu`, `/classics`, `/privacy`, `/terms`, `/support`) are static HTML. Daily puzzle files are 0.8 KB (mini) to 4 KB (large).

| Per visitor | First visit | Repeat visit | Note |
|---|---|---|---|
| Fast Data Transfer | ~550–650 KB | ~20–40 KB | `/assets` are immutable for a year (`vercel.json`); `index.html` is `no-cache` |
| CDN/edge requests | ~18 | ~8–10 | HTML, chunks, fonts, 3 daily feed fetches, `/api/geo`, favicon |
| Function invocations | 1 (`/api/geo`, `cache: no-store`, on every page load before consent is stored) | 0–1 | Daily feed: static file wins when the day has one; otherwise `api/daily.ts` with `s-maxage=300`, so at most ~290 invocations per slot per day however many visitors |
| Share links | `api/share` + `api/og` per unfurl, both `s-maxage=300` | | Only on shares |

Per MAU per month (8 visits): ~0.8 MB transfer, ~90 edge requests, ~8 invocations.

### Vercel plan limits (read 2026-10-23)

| | Hobby | Pro |
|---|---|---|
| Price | $0, **"for personal, non-commercial use"** | $20/month per seat, $20 usage credit included |
| Fast Data Transfer | 100 GB/month | 1 TB/month, then from $0.15/GB |
| CDN requests | 1 M/month | 10 M/month, then $2 per 1 M |
| Function invocations | 1 M/month | from $0.60 per 1 M |
| Fluid active CPU / memory | 4 h, 360 GB-h | $0.128/h, $0.0106/GB-h |
| Web Analytics events | 50 k | $3 per 100 k (not enabled on this project today) |
| Function default duration | 300 s | 300 s |

| MAU | Transfer | Edge requests | Invocations | Plan outcome |
|---|---|---|---|---|
| 1k | ~0.8 GB | ~90 k | ~8 k | Within Hobby quotas, but Hobby is non-commercial |
| 10k | ~8 GB | ~0.9 M | ~80 k | Edge requests brush the Hobby 1 M line |
| 100k | ~80 GB | ~9 M | ~0.8 M | Pro: within 1 TB and 10 M; ~$0–5 overage |

**The binding constraint is the terms, not the quotas.** AdSense is already wired (`src/components/AdSlot/AdSlot.tsx`, env `VITE_ADSENSE_PUB_ID`); the moment it earns, or an in-app purchase is sold through the web, the project should be on Pro at $20/month. Capacity-wise Hobby would carry ~10k MAU, and Pro ~1 M MAU before any meaningful overage. Other notes:

- `api/share.ts` and `api/og.ts` declare `runtime: "edge"`. Vercel has deprecated the Edge runtime in favour of Node.js on Fluid Compute; they keep working, but the `@vercel/og` 1.0.1 pin documented in CLAUDE.md is exactly the kind of edge-bundler fragility that goes away on Node. Migrate when convenient, not for scale.
- `/api/geo` is called on every page load until consent is stored, with `cache: "no-store"`. It is the only per-visit function invocation; caching the answer in `sessionStorage` would make the function count negligible, and matters only on Hobby.
- The 357 KB main bundle is the real per-visit cost. Splitting the studio (already a chunk), the engine wasm and the share canvas further would cut first-visit transfer, which is a performance win more than a cost one.
- Static daily files under `public/daily-puzzles/` are free to serve and already excluded from the SPA rewrite; keep publishing days as files when possible so `api/daily.ts` stays cold.

---

## 4. Cost model

### Fixed costs today

Plan status for Supabase and Vercel is not exposed to the tools used here; both are stated as "likely" and the model shows both cases.

| Item | Price (read 2026-10-23) | Today | Notes |
|---|---|---|---|
| Vercel | Hobby $0 / Pro $20/mo | Hobby (likely) | Non-commercial terms on Hobby |
| Supabase | Free $0 / Pro $25/mo (+$10 compute credit, Micro included) | Free or Pro (unknown) | Free pauses after a week idle; daily traffic prevents that |
| Neon (`app-dashboard` project, shared `api_usage` ledger) | Free $0 (1 GB storage, 100 CU-h, 6 h history) | Free | Launch plan is usage-based ($0.106/CU-h, $0.35/GB-mo) if ever needed |
| Apple Developer Program | $99/year | paid | $8.25/mo amortised |
| Google Play registration | $25 one-time | paid | sunk |
| Domain crosswordclash.com | ~$12–15/year (estimate) | paid | ~$1/mo |
| GA4, Sentry (optional DSN), Capacitor | $0 | | Sentry free tier if enabled |
| ElevenLabs plan | Starter $1/mo (30 k credits) → Creator $11/mo (121 k credits); agents ~$0.08/min (third-party reports; ElevenLabs' page quotes credits only) | unknown | TTS is 0.5–1 credit per character |
| Anthropic, OpenAI | pay-as-you-go | | Sonnet 4 $3/$15 per MTok (deprecated); Sonnet 5.5 $2/$10; OpenAI gpt-realtime audio $32/$64 per MTok ≈ $0.06–0.11/min |
| Narrator spend | capped by `NARRATOR_MONTHLY_USD_CAP` | ≤ $20/mo | `src/lib/narratorBudget.ts`, default 20 |

**Floor today: ~$9–10/month** (Apple + domain) if both platforms are on free plans and the narrator is unused. **Floor once monetised: ~$55/month** (Vercel Pro 20 + Supabase Pro 25 + Apple 8.25 + domain 1), plus up to $20 of narrator, so **~$75/month**.

### Variable cost per MAU (estimates)

Assumptions: 8 visits per MAU per month, 1.5 puzzles per visit, 20% of MAU play one 4-player room a month, 1% of monthly room players are online at the busiest minute, no cleanup shipped (worst case) and with cleanup (realistic case).

| Driver | Unit price | 1k MAU | 10k MAU | 100k MAU |
|---|---|---|---|---|
| Supabase MAU | 50k incl. Free / 100k incl. Pro, then $0.00325 | $0 | $0 | $0 (at the 100k line; every visitor's anonymous sign-in counts; $325 per extra 100k) |
| DB disk, no cleanup | 8 GB incl. Pro, then $0.125/GB-mo | +230 MB/mo (Free full in 2 months) | +2.3 GB/mo (Pro full in ~3.5 months, then ~$0.30/mo growing) | +23 GB/mo, ~$3/mo growing by $3 each month |
| DB disk, with cleanup | | +25 MB/mo | +250 MB/mo | +2.5 GB/mo, ~$0.3/mo growing |
| Egress (REST + Realtime) | 5 GB Free / 250 GB Pro, then $0.09/GB | ~0.4 GB | ~4 GB (Free limit at ~12k MAU) | ~40 GB |
| Realtime messages | 2 M / 5 M incl., then $2.50/M | ~50 k | ~500 k | ~5 M, $0–3 |
| Realtime peak connections | 200 / 500 incl., then $10/1,000 | ~10 | ~100 | ~400–1,000 → $0–10 |
| Realtime msgs/s at peak | 100 / 500 / 2,500 | ~10 | ~100 | **~600–1,200 → needs spend cap off** |
| Compute | Micro incl. | Micro | Micro | Small–Medium likely (+$5–50/mo) |
| Edge Function invocations | 500 k / 2 M incl. | ~few k | ~20 k | ~200 k |
| Vercel transfer / requests / invocations | see §3 | $0 | $0 | $0–5 |
| Narrator | capped | ≤ $20 | ≤ $20 | ≤ $20 (and unavailable most of the month) |

| Monthly total (estimate) | 1k MAU | 10k MAU | 100k MAU |
|---|---|---|---|
| Fixed, monetised | $55 | $55 | $55 |
| Variable | $0 | ~$1 | ~$15–75 |
| Narrator at cap | $20 | $20 | $20 |
| **Total** | **~$75** | **~$76** | **~$90–150** |
| Per MAU | 7.5¢ | 0.8¢ | 0.1–0.15¢ |

### Where each service forces an upgrade

| Service | Trigger | Scale (estimate) | Cost step |
|---|---|---|---|
| Vercel Hobby → Pro | commercial use (ads/IAP) | day one of revenue | +$20/mo |
| Supabase Free → Pro | 500 MB disk (no cleanup) | ~1k MAU after 2 months, or ~25 k games total | +$25/mo |
| Supabase Free → Pro | 5 GB egress | ~12k MAU | same |
| Supabase Free → Pro | 200 connections / 100 msgs/s | ~8 hot rooms at once | same |
| Supabase Pro spend cap off | 500 msgs/s or 500 connections | ~40 hot rooms / 125 rooms at once | $0 fixed, pay overage |
| Supabase compute Micro → Small/Medium | PostgREST pool saturation, vacuum lag | ~50k–100k MAU | +$5–50/mo |
| Supabase MAU overage | 100k MAU | 100k visitors/month | $3.25 per extra 1k |
| Neon Free → Launch | 1 GB storage or 100 CU-h | narrator ledger alone never gets there | usage-based |
| ElevenLabs plan | TTS credits | each narrated game ~6 k credits | Creator $11/mo covers ~20 games |

---

## 5. Monetisation against that model

### Break-even

Monetised fixed cost is ~$75/month with the narrator at cap, ~$55 without. Everything below is web-only revenue unless stated: the apps have no AdMob and no in-app purchases today.

### Option A: AdSense on the web (already wired)

`AdSlot` loads AdSense only when `VITE_ADSENSE_PUB_ID` and a slot id are set and, in the EEA/UK/CH, after consent (`src/lib/consentStore.ts`). Four placements exist (menu, completion, import, puzzle-ready). Page RPM for a US-heavy puzzle audience is **an estimate: $1–4 per thousand pageviews**; no reliable 2026 benchmark was found, and the first month of real AdSense reports should replace it.

| MAU | Pageviews/mo (8 visits × 3 pages) | Revenue at $1–4 RPM |
|---|---|---|
| 1k | 24 k | $24–96 |
| 10k | 240 k | $240–960 |
| 100k | 2.4 M | $2,400–9,600 |

Ads alone reach break-even somewhere between 1k and 3k web MAU, and they cover the first forced upgrade (Vercel Pro, $20) at roughly 300–800 MAU. They do nothing for app users and they are the reason Hobby is off the table. Architecture impact: none beyond what exists. AdMob in the apps would add a Capacitor plugin, Google's UMP consent flow, App Privacy / Data safety updates and store review risk for a few dollars per thousand impressions; defer until the apps have thousands of installs.

### Option B: Premium tier (ad-free + narrator + unlimited rooms)

Price point to test: $2.99/month or $19.99/year on the web through Stripe (2.9% + 30¢ per transaction, read 2026-10-23), in the apps through StoreKit / Play Billing at 15% commission (Apple Small Business Program up to $1 M prior-year proceeds; Google 15% on the first $1 M, 15% for subscriptions). Conversion for a casual puzzle game is **an estimate: 1–3% of MAU**.

| MAU | Subscribers at 2% | Net at ~$2.50/month each (web) |
|---|---|---|
| 1k | 20 | ~$50 |
| 10k | 200 | ~$500 |
| 100k | 2,000 | ~$5,000 |

Premium is the only path that makes the narrator viable: at ~$1–1.50 per narrated game, a $2.99 subscriber who narrates two games a month is break-even on narrator cost alone, so the tier should include a *monthly minute allowance* (say 60 minutes) rather than unlimited narration, enforced server-side.

Architecture implications:

- **Entitlements table** in Supabase: `entitlements (user_id uuid references auth.users on delete cascade, product text, source text check (source in ('stripe','apple','google','grant')), expires_at timestamptz, updated_at)`, RLS select-own, writes only by service role. Add it to `delete-account`'s owned tables or rely on the cascade (CLAUDE.md's rule for any table holding a user id).
- **Receipts.** A `verify-purchase` edge function that validates Stripe webhooks, App Store Server API JWS transactions and Google Play Developer API purchases and upserts `entitlements`. RevenueCat does all three for free up to $2,500 monthly tracked revenue (1% beyond, read 2026-10-23) and would save writing the Apple and Google halves; a webhook from it into the same edge function keeps Supabase the source of truth.
- **Identity.** Players are anonymous by default. A purchase must attach to the current anonymous `auth.uid()` and survive sign-in: `linkIdentity` already keeps the same user id when an anonymous user signs in with Apple or Google (`src/lib/account.ts`), so entitlements follow. Restore-purchases on a new device means signing in; the app sheet already exists. Apple requires purchases to work without an account, which this design satisfies.
- **Gating.** The narrator edge functions replace per-IP rate limiting with a per-user check: read `entitlements` with the service role (same shape as `studioAllowed` in `_shared/studioAuth.ts`), count the user's narrator minutes this month from `narrator_usage` keyed by `user_id` instead of IP, and keep the global `NARRATOR_MONTHLY_USD_CAP` as a backstop raised in step with subscriber count. The client hides `AdSlot` when entitled and the TTS settings modal shows the narrator as a premium feature with the free demo kept (`src/lib/narratorDemo.ts`).
- **"Unlimited rooms"** implies a free-tier limit, for example 3 live rooms a day per user, enforced in `createGame` via an RLS-checked RPC. Only worth adding once room load approaches the Realtime ceilings in §1.

### Option C: One-time purchases

A $4.99 "Supporter" unlock (ad-free forever, narrator minutes bundle) or puzzle packs. Same entitlements plumbing with `expires_at null`, no recurring billing, simplest store review. Revenue per MAU is lower over time but the first-year numbers are similar to a subscription, and it suits a small audience that resents subscriptions. Puzzle packs need the studio's output to be sold, which the classic library already proves as a content pipeline.

### What covers the first plan upgrade

- **Vercel Pro ($20)** is forced by commerce itself; web ads at ~300–800 MAU pay for it, so it is self-funding from the first month of AdSense.
- **Supabase Pro ($25)** is forced by disk at ~1k MAU unless the cleanup in §2 ships. The cleanup is a migration and costs nothing; ship it first and Supabase Free then lasts to ~10k MAU (egress). When Pro does become necessary, ads at ~1k MAU or ~10 premium subscribers cover it.
- **The narrator** is never covered by ads at small scale ($20 cap ≈ 20 games); it is covered only by premium or one-time bundles, so gate it behind those before promoting it.

---

## 6. Ranked: the first five limits to hit

| # | Limit | Bites at (estimate) | Why | Fix |
|---|---|---|---|---|
| 1 | **Vercel Hobby non-commercial terms** | first dollar of ad or IAP revenue | Pricing FAQ: Hobby is "for personal, non-commercial use" | Move to Pro ($20/mo) when enabling `VITE_ADSENSE_PUB_ID`; Pro quotas then carry ~1 M MAU |
| 2 | **Supabase database disk** 500 MB Free / 8 GB Pro | ~1k MAU for two months on Free; ~3.5 months at 10k MAU on Pro | Every solo load inserts a ~15 KB `puzzles` copy (`uploadPuzzle` dedupes only file uploads) and a `games` row rewritten per keystroke; 51% of games stay `active` forever | Content-hash dedupe in `uploadPuzzle`; stop solo `updateGame` mirroring; `pg_cron` retention for stale rooms, orphan puzzles, old anonymous users, old `play_sessions` detail |
| 3 | **Realtime messages per second** 100 / 500 / 2,500 | ~8 hot 4-player 15×15 rooms on Free, ~40 on Pro with spend cap | ~12 msgs/s per hot room (`cell_claimed` + `wrong_letter` × recipients) | Turn the Pro spend cap off before promotion; broadcast `wrong_letter` only when a TV/narrator is in the room; drop `games`/`players` from the Realtime publication |
| 4 | **Realtime peak connections** 200 / 500 | ~50 / 125 simultaneous 4-player rooms | One socket per player and spectator | Spend cap off; $10 per extra 1,000 is the cheapest overage in the stack |
| 5 | **Insights aggregates scan `play_sessions`** | ~1 M rows (1–2k DAU for a year) | `insights_puzzles` filters on `started_at` with no matching index; `percentile_cont` over the window | Index `play_sessions (started_at)`; nightly rollup table past ~5 M rows; 180-day retention on `clues` |

Close behind: anonymous-user MAU and `auth.users` growth (free to 100k visitors/month, $3.25 per extra 1k; cleanup SQL from Supabase), `ensureSolveHistory` downloading a whole account history per app open, the `$20` narrator cap (15–25 games/month), `narrator_usage` with no retention, and the deprecated `claude-sonnet-4-20250514` model id in `narrator-claude`.

---

## 7. Recommendation

**Before growth arrives (a week of work, no app release):**

1. One migration: `pg_cron` retention (stale rooms → `closed`; old `closed`/`completed` games, orphan puzzles, idle anonymous users, old `narrator_usage` deleted; `play_sessions.clues` nulled after 180 days), the `play_sessions (started_at)` index, and removing `games`/`players` from `supabase_realtime`.
2. Content-hash dedupe in `uploadPuzzle` for every path, and remove the solo `updateGame` effect (or write once on completion). This is the change that keeps Supabase Free viable to ~10k MAU and cuts REST writes by two orders of magnitude.
3. Swap `narrator-claude` to `claude-sonnet-5-5` and align the `tts` rate limit with `narrator-claude` (60/h) so the narrator does not go mute mid-game.
4. Decide the premium shape (B or C) and add the `entitlements` table and `verify-purchase` function now, while the narrator is still small, so gating is in place before anyone relies on it as free.
5. The moment AdSense is enabled, move Vercel to Pro.

**At the first sign of a spike (same day):** turn the Supabase Pro spend cap off (connections 500 → 10,000, msgs/s 500 → 2,500), and stop broadcasting `wrong_letter` without a TV in the room.

**Can wait until ~10k MAU:** Supabase compute Small/Medium, a `cells` table instead of the `games.cells` JSONB, the `solve_summary` RPC, nightly insights rollups, AdMob in the apps, migrating `api/share` and `api/og` off the Edge runtime, bundle splitting for first-visit transfer.

**Can wait indefinitely:** sharding rooms across projects, a dedicated WebSocket server, Neon paid plans. Nothing in the current design needs them below several hundred thousand MAU.

---

## Sources (read 2026-10-23)

- Supabase pricing, Realtime limits, Realtime messages billing, MAU billing, compute and disk, Edge Function limits, anonymous sign-ins: supabase.com/pricing; supabase.com/docs/guides/realtime/limits; …/platform/manage-your-usage/realtime-messages; …/manage-your-usage/monthly-active-users; …/platform/compute-and-disk; …/functions/limits; …/auth/auth-anonymous.
- Vercel pricing and limits: vercel.com/pricing; vercel.com/docs/limits (page dated 2026-09-16).
- Neon pricing: neon.com/pricing.
- Apple Developer Program fee: developer.apple.com/programs/whats-included; Small Business Program: developer.apple.com/app-store/small-business-program.
- Google Play registration fee: support.google.com/googleplay/android-developer/answer/6112435; service fees: …/answer/112622.
- Anthropic model pricing and Sonnet 4 deprecation: Anthropic model list as of 2026-10-06 (Sonnet 5.5 $2/$10 per MTok; `claude-sonnet-4-20250514` deprecated, retirement TBD).
- OpenAI gpt-realtime audio pricing ($32 / $64 per 1 M audio tokens): openai.com/api/pricing via search results (the page refused direct fetch); per-minute conversion is a third-party estimate.
- ElevenLabs plans: elevenlabs.io/pricing (credits); $0.08/min agent rate from third-party summaries, unverified on the vendor page.
- RevenueCat pricing: revenuecat.com/pricing. Stripe US card fee: stripe.com/pricing.
- AdSense RPM and premium conversion rates: no reliable vendor figure; the ranges above are estimates to be replaced with the first month of real reports.
- Row counts, status distribution and row sizes: production PostgREST with the anon key, 2026-10-23. Bundle sizes: `dist/` build of 2026-10-21, gzip.

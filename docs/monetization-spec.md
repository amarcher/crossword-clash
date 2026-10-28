# Monetisation spec: AdMob rewarded video and a premium tier

Written 2026-10-23. Spec only: no application code changes. Every claim about
the current code cites a file; every vendor fact names the page it was read
from and the date (all vendor pages were read on 2026-10-23 unless a line says
otherwise; the full list is in "Sources" at the end). Where a number is an
estimate rather than a vendor figure it says so.

Context: 1.0.2 is live on Google Play and in App Store review. AdSense has
rejected the website again for lacking original long-form content, so web
display ads are off the table; the apps have no ads SDK, no analytics SDK and
both stores' privacy forms say so. `docs/scalability-audit.md` §4–5 modelled
~$30/month of fixed cost today (~$75 once Supabase Pro and the narrator cap are
paid) and recommended a premium tier at ~2% conversion as the only thing that
makes the AI narrator viable. The puzzle archive (merged this week, PR #126 and
#128) already gates anonymous visitors to the last 7 days with a sign-in card,
the first premium hook.

---

## Decisions needed from Andrew

Each has a recommendation; the reasoning is in the section named.

| # | Decision | Recommendation | Where |
|---|---|---|---|
| 1 | Premium shape and price | A subscription, **"Crossword Clash Plus"**, $3.99/month or $24.99/year on every platform; no one-time "Supporter" at launch (revisit after two months of data, and never for the metered AI features) | §2.6 |
| 2 | Billing stack | **RevenueCat** for the two app stores (one webhook, Capacitor 8 plugin, free under $2,500/month), **Stripe Checkout + Customer Portal** directly on the web; both write the same `entitlements` table through one edge function | §2.7, §3 |
| 3 | Studio: premium-only, or free editor with only Claude drafting gated | **Premium-only** (editor, engine fill, play-test links, My puzzles, Claude drafting on a per-user allowance); daily queue, insights, scheduling and the studio token stay admin-only | §2.2 |
| 4 | Narrator free policy | Keep today's demo (5 sampled events, 2 grants per IP) for everyone; everything beyond it is Plus, **60 narrator-minutes a month per subscriber**; rewarded video adds 10 minutes in the apps | §2.3, §4.4 |
| 5 | Archive window for free accounts | Anonymous 7 days (as shipped), **free accounts 30 days**, Plus everything. This takes back part of decision (1) in `docs/puzzle-archive-spec.md` §5 (accounts currently see everything), so it should land with the Plus launch and a dated notice | §3.6 |
| 6 | iOS App Tracking Transparency | **Do not call the ATT prompt**; request non-personalised ads (`npa: true`) everywhere; accept the lower eCPM. Alternative: UMP's IDFA message + ATT for personalised ads in the apps | §1.5 |
| 7 | Reveal-letter rules | New feature; a reveal **disqualifies the solve from the daily leaderboard** and shows as 🟥 in the share block; free: 1 reveal per puzzle, rewarded ad +3, Plus unlimited | §1.1 |
| 8 | When to ship AdMob | Build it after Plus (phase 2); **turn live ad units on only once the apps have ~300 DAU**, before that it cannot pay for its own review cycle | §1.10, §4 |
| 9 | Stripe Tax and store programmes | Enrol in Apple's Small Business Program, set up the Google Play merchant profile, turn Stripe Tax on (0.5%/transaction, needs a tax registration decision) | §2.6 |
| 10 | Free trial | **None at launch** (a trial hands out narrator minutes and Claude calls to churners); an introductory annual offer can come later | §2.6 |

Open questions that are not decisions yet are listed in §5.

---

## 0. What exists today (the code the spec builds on)

| Area | Today | Cited |
|---|---|---|
| Accounts | Optional Apple/Google sign-in that links to the anonymous Supabase user (`linkIdentity`, falls back to `signInWithOAuth`; `identity_already_exists` signs in to the existing account). `accountsAvailable()` is **false in mobile mode**, so the apps have no account UI | `src/lib/account.ts:44`, `signInWith`, `finishSignIn`; `src/contexts/AccountContext.tsx` (`openAccount({ returnTo, placement })`); `src/hooks/useAccount.ts` |
| Archive gate | `isLockedDay(day, today, unlocked)`, `ANONYMOUS_ARCHIVE_DAYS` = 7. `unlocked = !account?.available \|\| (account.ready && !!account.user)`: a signed-in account sees everything and **the apps are never locked** (no account can be offered there). The locked panel opens the account sheet with `placement: "archive"` | `src/lib/archive.ts:29`; `src/screens/ArchiveScreen.tsx:120,409` |
| Narrator cost control | Shared monthly cap `DEFAULT_MONTHLY_CAP_USD` = 20 priced from the Neon `api_usage` ledger; HTTP 402 `narrator_unavailable/budget`; fails open without `DASHBOARD_DATABASE_URL`. Demo: `DEFAULT_DEMO_EVENT_ALLOWANCE` 5 events per browser, `DEFAULT_DEMO_GRANT_LIMIT` 2 per IP, only `narrator-claude` and `tts`. Per-IP rate limits in `narrator_usage` (keyed `client_ip, endpoint`): agent-auth 10/h, openai-agent-auth 10/h, narrator-claude 60/h, tts 60/h, studio-claude 120/h | `src/lib/narratorBudget.ts`; `supabase/functions/_shared/budgetGuard.ts`; `src/lib/narratorDemo.ts`; `supabase/functions/_shared/rateLimit.ts`; `supabase/migrations/20260323000000_narrator_usage.sql` |
| Narrator identity | **None.** The client calls `narrator-claude` and `tts` with `Authorization: Bearer <anon key>`; none of `narrator-claude`, `tts`, `agent-auth`, `openai-agent-auth` reads a user. A per-user allowance needs the user's access token in that header first | `src/lib/narrator/claudeNarrator.ts:29,94`; `supabase/functions/narrator-claude/index.ts` |
| Studio | Route only when `import.meta.env.DEV \|\| VITE_STUDIO === "1"`; the Vite plugin drops the worker and wasm otherwise. `CluePanel` (Claude drafting), `DailyQueue` and `Insights` all gate on `token \|\| admin` with the copy "Sign in as a studio admin, or enter the studio token". `useStudioAccount` reads the caller's own `studio_admins` row (select-own RLS, rows added by hand). `studioHeaders(token)` sends the account's access token when non-anonymous, else the anon key, plus `x-studio-token`. Server: `studioAllowed(req)` = constant-time STUDIO_TOKEN match **or** a non-anonymous user in `studio_admins`. `studio-claude`: `studioAllowed` → per-IP rate limit → `checkNarratorBudget(req, "studio-claude")` (it shares the $20 cap) → Anthropic structured output, models allow-listed to `claude-opus-5-5` (default) and `claude-sonnet-5-5`, `MAX_TOKENS` 16000, `MAX_PROMPT_CHARS` 40000, `logUsage`. Opus is priced in the cap at a deliberate $15/$75 ceiling (list is $4/$20). The client maps 401 → "token", 402 → "budget", 429 → "rate". My puzzles: localStorage `crossword-clash:studio-puzzles`, 50 entries. Play test: `toTransferPuzzle` → `#puzzle=` link. The fill engine is client-side wasm in a worker and costs nothing to serve; the word list is `/seedgrid/words.dict` in dev and `words-production.dict` from the public `seedgrid` Storage bucket otherwise | `src/routes.tsx:131-133`; `vite.config.ts:37-65`; `src/components/Studio/CluePanel.tsx:62,149`, `DailyQueue.tsx:84`, `Insights.tsx:92`; `src/hooks/useStudioAccount.ts`; `src/lib/studioAuth.ts`; `supabase/functions/_shared/studioAuth.ts`; `supabase/functions/studio-claude/index.ts`; `src/lib/narratorBudget.ts` (`DEFAULT_NARRATOR_PRICING`); `src/lib/seedgrid/studioClaude.ts`; `src/lib/seedgrid/studioLibrary.ts`; `src/screens/StudioScreen.tsx:294` |
| Consent (web) | `CONSENT_REGIONS` (EEA + UK + CH), stored choice `crossword-clash:consent` v1 `{ analytics, ads, v, ts }`; `adsAllowed()` / `analyticsAllowed()`; detection via `/api/geo` with a timezone fallback. `ConsentBanner` is disabled in mobile mode; `AdSlot` is `configured` only when `MODE !== "mobile"`, `VITE_ADSENSE_PUB_ID` is set and the slot id exists (five placements: menu, challenge, puzzle-ready, importer, completion). In the apps first-party play statistics are always on | `src/lib/consent.ts`; `src/lib/consentStore.ts`; `src/components/ConsentBanner/ConsentBanner.tsx:22`; `src/components/AdSlot/AdSlot.tsx:38-43`; `src/lib/adConfig.ts`; `src/lib/playInsightsClient.ts:29`; `index.html:71-77` |
| Native apps | Capacitor 8 (`@capacitor/core` ^8.5.1), the only plugin is `@capacitor/share`; `appId` `com.crosswordclash.app`; mobile build is `pnpm build --mode mobile && cap sync`; `Capacitor.isNativePlatform()` already drives layout and insights. iOS target 15.0, `MARKETING_VERSION` 1.0.2 build 9; Android `versionCode` 4 / 1.0.2, minSdk 24, target 36. No URL scheme, universal link or app link is configured. `PrivacyInfo.xcprivacy`: `NSPrivacyTracking` false, no tracking domains, collected types User ID and Gameplay Content | `package.json:37-40,31`; `capacitor.config.ts`; `src/main.tsx:16`; `ios/App/App.xcodeproj/project.pbxproj`; `android/variables.gradle`; `android/app/build.gradle:18-19`; `ios/App/App/Info.plist`; `android/app/src/main/AndroidManifest.xml`; `ios/App/App/PrivacyInfo.xcprivacy` |
| Store forms | Play: "Ads: No, the app contains no ads"; Data safety rows User IDs, Other user-generated content, Other actions, App interactions, all "collected, not shared". App Store: App Privacy "User ID" and "Gameplay Content", App Functionality, not linked, not tracking | `docs/play-store/README.md:140-160`; `docs/app-store/README.md:46-50` |
| Privacy policy | "The native iOS and Android apps do not include Google Analytics, Vercel Analytics, Speed Insights or advertising." and an "Advertising (website only)" section, in English and Spanish | `src/screens/legal/legalContent.ts:74,78,297,303` |
| ads.txt | `public/ads.txt` holds `google.com, pub-0897728874858477, DIRECT, f08c47fec0942fa0`; there is no `app-ads.txt` | `public/ads.txt` |
| Deleting and sweeping | `delete-account` deletes `play_sessions`, `narrator_sessions`, `daily_results`, `players`, nulls `games.host_user_id`, then deletes the auth user (cascades `profiles`, `solves`, `studio_admins`). The nightly `retention_sweep()` deletes anonymous users idle 30 days **with no `players` / `play_sessions` / `daily_results` / `narrator_sessions` / hosted `games` rows**; an entitlement must join that list or a paying anonymous user could be deleted | `supabase/functions/delete-account/index.ts`; `supabase/migrations/20261023000000_retention.sql:142` |
| Solve history and progress | `solves` (owner-only RLS, non-anonymous JWT required, `record_solves(jsonb)` RPC) is the account's source of truth for finishes; per-puzzle solo progress is local-only (`crossword-clash:solo-progress`, ≤ 30 records) because "syncing progress would be its own table and sync story" | `supabase/migrations/20261017300000_solves.sql`; `src/lib/soloProgress.ts:1-20` |
| Hints | None. The reducer has no reveal, check or hint action | `src/hooks/usePuzzle.ts` (actions LOAD_PUZZLE … ROLLBACK_CELL) |
| Rooms | `createGame` inserts the `games` row directly under RLS; a per-user room cap would need an RPC | `src/lib/puzzleService.ts:72` |
| Analytics | GA4 events via `track()` (web only; the apps have no GA): `puzzle_completed`, `narrator_enabled`, `account_sign_in_started`, … | `src/lib/analytics.ts:28-55` |

---

## 1. Rewarded video in the native apps

Rewarded video is opt-in by design, which is why it is the one ad format that
fits a crossword: nothing interrupts the solve, and the ad is traded for
something the player asked for. Web builds get no ad SDK (§1.9).

### 1.1 Placements

| # | Placement | Trigger | Reward | Verification | Volume |
|---|---|---|---|---|---|
| A | **Reveal a letter** (solo play) | A "Reveal" control in the solo play screen's clue bar; the first reveal per puzzle is free, the next tap offers "Watch an ad for 3 reveals" or "Go Plus" | 3 reveals, held per puzzle in the `soloProgress` record | Client-side (`onRewardedVideoAdReward`); the stake is small | Highest: every solo puzzle |
| B | **Unlock a locked archive day for this session** | The locked day's panel in `/archive` (once the apps have the lock, §3.6) shows "Watch an ad to play this day" next to the sign-in / Plus card | That one day's puzzles playable until the app is closed (`sessionStorage`-equivalent in-memory set) | Client-side; the day is one puzzle | Medium |
| C | **10 more narrator minutes** (TV hosts) | The TV view (`/host`) when the host's monthly narrator minutes are gone (§2.3) | +10 narrator minutes credited to the user's allowance | **Server-side verification (SSV)** because the reward costs money | Low: the TV view runs in the app only on a tablet or TV box; most hosts use a laptop, where there is no AdMob |

Reveal is a new feature, not a gate on an old one. It needs a `REVEAL_CELL`
action in `usePuzzle.ts` that fills the cell with its solution and marks the
`CellState` as `revealed`, `soloProgress.ts` to carry the per-puzzle reveal
count, the share block to paint a revealed cell 🟥 (it already paints wrong
cells so, `src/lib/shareBlock.ts`), and the daily leaderboard submission to be
skipped when any cell was revealed (decision 7). Multiplayer gets no reveal:
correct letters are permanent and claimed, so a reveal would be a free claim.

Placement B is only possible once the apps lock the archive, which they do not
today because no account can be offered there (`ArchiveScreen.tsx:120`). It
therefore depends on native sign-in (§3.5). It also pulls against Plus: a
player who can unlock any day for one ad has less reason to subscribe. Keep it
to one day per ad with a frequency cap of 3 a day, and show the Plus card
first.

Placement C is specified for completeness; build it last (§4).

### 1.2 Plugin choice

Compared on the npm registry and GitHub (read 2026-10-23):

| Plugin | Latest | Capacitor | SDKs | Activity | Verdict |
|---|---|---|---|---|---|
| `@capacitor-community/admob` | 8.2.1 (2026-10-06) | 8.5+ (v7 line for Capacitor 7) | Android GMA 25.4.+ and UMP 4.0.0; iOS GMA 13.11.0 and UMP ~> 3.1; minimum iOS 15 / API 24 | Last commit 2026-10-20, 23 open issues, ~239k downloads/month | **Use this** |
| `@capgo/capacitor-admob` | 8.2.5 (2026-10-18) | ≥ 8 | Android **Next-Gen** GMA SDK; iOS GMA 13.1.x | 14 stars, 0 open issues | Fallback if the Next-Gen Android SDK becomes required before the community plugin's next major |
| `capacitor-admob-nextgen` | 1.5.0 (2026-10-20) | ≥ 8 | Next-Gen wrapper | Not inspected | Too new |
| `capacitor-admob-ads` | 5.0.0 (2023-08-14) | "next" | — | Abandoned | No |

The community plugin's API, as its README documents it: `initialize({
testingDevices, initializeForTesting, tagForUnderAgeOfConsent,
maxAdContentRating })`; `prepareRewardVideoAd({ adId, isTesting, npa, ssv: {
userId, customData } })` then `showRewardVideoAd()`; the reward arrives on the
`RewardAdPluginEvents.Rewarded` event (string value `onRewardedVideoAdReward`),
and the README warns that `Dismissed` "does not indicate whether the user
earned a reward". Consent: `requestConsentInfo()` → `{ status,
isConsentFormAvailable, canRequestAds, privacyOptionsRequirementStatus }`,
`showConsentForm()`, `showPrivacyOptionsForm()`, `resetConsentInfo()`, with
`debugGeography` and `testDeviceIdentifiers` for testing. ATT:
`trackingAuthorizationStatus()` and `requestTrackingAuthorization()`. Our iOS
target (15.0) and Android minSdk (24) already meet the plugin's and Google's
minimums: GMA Android 25.5.0 (2026-09-17) raised minSdk to 24; GMA iOS 13.x
needs iOS 13+.

Google marks the legacy Android SDK as "in maintenance mode" and recommends the
Next-Gen SDK on the Android quick start; the community plugin defers Next-Gen
to its next major. That is acceptable for 2026 but is the reason to keep the
capgo plugin in view.

### 1.3 Ad units, test ids and configuration

- **Account.** AdMob uses the AdSense publisher account; signing in with the
  Google account that owns `pub-0897728874858477` links them and keeps the same
  publisher id (AdMob help 6014439). Payment threshold is $100, paid around the
  21st of the following month (AdMob help 2772208, 3001017).
- **App ids.** One AdMob app per store (`ca-app-pub-<publisher>~<app>`); iOS
  needs `GADApplicationIdentifier` in `Info.plist` plus `SKAdNetworkItems`
  including Google's `cstr6suwn9.skadnetwork` and the buyer ids Google lists;
  Android needs the `com.google.android.gms.ads.APPLICATION_ID` meta-data or
  the app crashes with "Missing application ID" (AdMob iOS and Android quick
  starts).
- **Ad units.** Three rewarded units per platform (reveal, archive-day,
  narrator-minutes), so caps, SSV and reporting are per placement. Their ids
  live in the mobile build's env (`VITE_ADMOB_REWARD_REVEAL_IOS` and so on,
  read only when `MODE === "mobile"`), next to the existing `VITE_AD_SLOT_*`
  pattern in `src/lib/adConfig.ts`.
- **Test ids.** Google's sample rewarded units are
  `ca-app-pub-3940256099942544/5224354917` (Android) and
  `ca-app-pub-3940256099942544/1712485313` (iOS); simulators are test devices
  automatically, physical devices are registered in the AdMob UI or via the
  plugin's `testingDevices` with `initializeForTesting: true`. Google's
  rewarded pages say that not using test ads during development "can lead to
  account suspension", so dev and preview builds must never load a production
  unit: resolve the unit id as `import.meta.env.DEV ? TEST_ID : PROD_ID`.

### 1.4 Load and show lifecycle, caps, offline and no fill

- **Preload** on entering a screen that can offer the reward (solo play, the
  archive day panel, the TV view), never at app start. Google's rewarded pages
  say loaded ads expire after an hour, so reload when the app returns to the
  foreground after an hour.
- **Offer only when loaded.** The reward button is enabled only once
  `prepareRewardVideoAd` resolved. If the load rejected (offline, no fill), the
  button reads "No ad available right now" for that attempt and the Plus card
  stays; the base game is never blocked by an ad that did not arrive. Google
  gives no retry prescription; use one retry after 30 s, then give up for that
  screen.
- **Disclosure.** AdMob's rewarded policy (help 7313578) requires an
  affirmative opt-in and a "clear, accurate and conspicuous disclosure of the
  action(s) required and reward(s) offered" before each ad, that declining
  "must not interfere" with normal use, and that the promised reward is
  delivered. The button copy carries the reward ("Watch an ad · 3 reveals"),
  and the reward is granted on `Rewarded`, never on `Dismissed`.
- **Frequency caps** are configured per ad unit in the AdMob UI (impressions
  per user per minute, hour or day; app-level caps stack; changes take up to
  24 h; AdMob help 6244508): reveal 10/day, archive-day 3/day, narrator 2/hour.
  Mirror the daily caps locally so the button hides once the cap is reached
  instead of failing to load.
- **Ad pods.** Rewarded units play back-to-back pods and interactive ads by
  default and Google says excluding them "may impact ad revenue" (help
  7372450); leave them on.
- **Placement C needs SSV.** Enable server-side verification on the narrator
  unit (Advanced settings → postback URL to a new `admob-ssv` edge function
  with `verify_jwt` off). Google sends a GET with `ad_network, ad_unit,
  custom_data, key_id, reward_amount, reward_item, signature, timestamp,
  transaction_id, user_id`, signed with ECDSA against the keys at
  `gstatic.com/admob/reward/verifier-keys.json` (cache ≤ 24 h); the server
  must answer 200 or Google retries five times (AdMob SSV docs, help 7311747).
  The function verifies the signature, dedupes on `transaction_id`, and credits
  `user_id` (set via the plugin's `ssv.userId` = Supabase uid) 10 minutes in
  `feature_usage` (§3.1). The client shows "Minutes added" only after the
  credit is visible, or after 10 s falls back to "It can take a moment".

### 1.5 iOS App Tracking Transparency: the non-personalised path

Apple's definition (developer.apple.com/app-store/user-privacy-and-data-use):
tracking is "linking user or device data collected from your app with user or
device data collected from other companies' apps, websites, or offline
properties for targeted advertising or advertising measurement purposes", and
the examples include "Placing a third-party SDK in your app that combines user
data from your app with user data from other developers' apps to target
advertising … even if you don't use the SDK for these purposes." Without ATT
permission "the device's advertising identifier value will be all zeros".

Google's position (AdMob iOS 14 and IDFA pages): ATT is optional ("If you
decide to include App Tracking Transparency"), "If a user denies ATT, continue
to request ads", and "The Google Mobile Ads SDK doesn't send IDFA in the ad
request". SKAdNetwork attributes installs without the IDFA.

Recommendation (decision 6): never call `requestTrackingAuthorization`, ship no
`NSUserTrackingUsageDescription`, pass `npa: true` on every request, and keep
`NSPrivacyTracking` false and `NSPrivacyTrackingDomains` empty in
`PrivacyInfo.xcprivacy` (the GMA SDK ships its own privacy manifest since
11.2.0, per its release notes). The cost is revenue: non-personalised and
limited ads pay less than personalised ones (how much less is not published by
Google; third-party reports vary, treat it as 30–50% lower, an estimate). The
alternative, UMP's IDFA message followed by the ATT alert, is a one-line
plugin call and can be added in a later release if the eCPM gap matters.

What App Review will look at either way: the App Privacy answers (§1.8) must
list what the GMA SDK collects, and the choice "used for tracking: no" rests on
the IDFA never being available. Google publishes no page stating what happens
when the prompt is never called, only the "continue to request ads" guidance;
this is a residual review risk to state in the review notes (guideline
2.3.1(a) asks for product changes to be "described with specificity").

### 1.6 Consent: Google UMP in the apps and the web consent store

Google's publisher consent requirements (AdMob help 13554116, same text as
AdSense 13554116): since 16 January 2024 (EEA/UK) and 31 July 2024
(Switzerland) "a certified CMP integrated with the TCF is required when serving
personalized ads"; traffic from a non-certified CMP "may be eligible for
non-personalized ads or limited ads". Google's own Privacy & messaging (the UMP
SDK, "IAB-certified for TCF v2.3 across all SDK versions", help 10113207) is a
certified CMP and is free. Our hand-built web banner is not certified, which is
why, on the website, AdSense would only ever have served non-personalised or
limited ads in the EEA/UK (worth knowing even though web ads are now moot).

In the apps, UMP owns consent:

1. Create the **European regulations (GDPR) message** and the **US state
   regulations message** under Privacy & messaging in AdMob (help 10860309,
   16368266). Skip the IDFA message under decision 6.
2. On launch, before any ad request: `requestConsentInfo()` →
   `showConsentForm()` when a form is available and required → load ads only
   when `canRequestAds` is true. Google's SDK docs: "`canRequestAds()` always
   returns false until you have called `requestConsentInfoUpdate()`", check it
   again after gathering because consent may exist from a previous session,
   and on error the SDK uses the previous session's status.
3. When `privacyOptionsRequirementStatus === "required"`, show a "Privacy
   options" row in the app's settings that calls `showPrivacyOptionsForm()`
   (the equivalent of the web "Cookie settings" link).
4. Pass `npa: true` regardless (decision 6); with a GDPR consent string the
   SDK picks the serving mode itself (personalised / non-personalised /
   limited, AdMob "ad serving modes").

**Coexistence with the web store.** `crossword-clash:consent` and
`ConsentBanner` stay web-only (the banner is already `disabled` in mobile
mode). Nothing syncs between them: the legal bases differ, Google needs the
TCF string that only UMP produces, and the apps already treat first-party play
statistics as always-on (`playInsightsClient.ts:29`), which UMP does not
change. The one shared piece is `CONSENT_REGIONS`: UMP decides the region
itself, so the list stays a web constant. `adsAllowed()` gains no app branch;
the AdMob module has its own `rewardedAdsReady()` derived from `canRequestAds`.

### 1.7 app-ads.txt on crosswordclash.com

Google's app-ads.txt docs: the file lives at the root of the developer website
listed in the store listing (`https://crosswordclash.com/app-ads.txt`), the
AdMob line is `google.com, pub-0897728874858477, DIRECT, f08c47fec0942fa0`
(the same publisher id as `public/ads.txt` because AdMob links to the AdSense
account), AdMob reads the **developer website** on Google Play and the
**marketing URL** in App Store Connect, strips `www.`, and needs about 24 h to
crawl and verify after each change (AdMob help 9363762). Action: add
`public/app-ads.txt` with that line (Vercel serves static files before the SPA
rewrite, as `ads.txt` already proves), confirm the Play developer website is
`https://crosswordclash.com` (it is, per `docs/play-store/README.md`) and set
the App Store marketing URL to the same host.

### 1.8 Store policy, privacy labels and policy text

**Google Play.** "You must declare whether or not your app contains ads"
(Policy and programs → App content → Ads); apps with ads carry a "Contains ads"
label and misrepresentation "may result in your app(s) being suspended" (Play
help 9859455). Google's Play data disclosure for GMA 25.5.0 says the SDK
"collects and shares the following data types automatically for advertising,
analytics, and fraud prevention purposes": IP address, user product
interactions (launches, taps, video views), diagnostics (performance, launch
time, hang rate, energy) and device/account identifiers (advertising ID, app
set ID), encrypted in transit; "you are solely responsible for deciding how to
respond to Google Play's Data safety section form". So the Data safety form
changes from "collected, not shared" to: Device or other IDs (advertising ID,
collected and **shared**, Advertising), App interactions (now also
Advertising/Analytics, shared), Diagnostics (crash logs, performance), and the
ads purpose on the existing rows where applicable. The target audience stays
13+; nothing here opts into Designed for Families.

**App Store.** App Privacy must be updated when practices change and needs no
new binary (App privacy details page). Google's iOS data disclosure for the GMA
SDK lists IP address (coarse location estimate), non-user-related crash logs,
user-associated performance data, Device ID, Advertising data (ads seen) and
other product interactions. Map them to Apple's categories: Identifiers →
Device ID; Usage Data → Advertising Data and Product Interaction; Diagnostics →
Crash Data and Performance Data; Location → Coarse Location; purposes
Third-Party Advertising and Analytics; "linked to you: no", "used to track you:
no" under decision 6. Also update `PrivacyInfo.xcprivacy` with the same
collected types (the SDK's own manifest covers its code, the app's manifest
must still describe the app). Review guidelines that now apply: 2.5.18
(advertising must suit the age rating, users must be able to see targeting
information and "report any inappropriate or age-inappropriate ads", which
Google's ad creatives expose through their AdChoices overlay) and 3.2.2(iii)
(no artificial inflation of impressions).

**Privacy policy.** The sentence "The native iOS and Android apps do not
include Google Analytics, Vercel Analytics, Speed Insights or advertising."
(`legalContent.ts:74`, Spanish at 297) becomes false. Add an "Advertising in
the apps" section: rewarded video from Google AdMob, shown only when the player
chooses to watch one; what Google's SDK receives (the list above); no
advertising identifier is requested on iOS; consent in the EEA/UK/CH through
Google's consent form with a "Privacy options" link in settings; link to
Google's ads privacy page. Mirror in Spanish and bump `LEGAL_LAST_UPDATED`.
The "Retention and your choices" paragraph is unchanged.

### 1.9 Web builds show no ad SDK

The plugin's web implementation is a no-op proxy, but its JavaScript would
still land in the web bundle. Import it only from a module that is itself
imported dynamically behind `import.meta.env.MODE === "mobile"` (the same
switch `AdSlot`, `ConsentBanner` and `accountsAvailable()` use), so the web
build contains neither the plugin nor the ad unit ids. Add a test in the
spirit of `consent.test.ts` that greps `dist/` for `capacitor-community/admob`
after a web build.

### 1.10 Revenue per daily active user

Rewarded eCPM is the best-paying mobile format but the published figures are
third-party and disagree by 2–4×:

| Source (published) | US iOS | US Android | Europe | LATAM / MEA Android |
|---|---|---|---|---|
| Appodeal, "The Latest eCPM Report 2025" (March 2025, Q4 2024 data, chart reads) | ≈ $17 | ≈ $13 | ≈ $9 / $5 | ≈ $3 / $2 |
| Tenjin × CAS Q2 2024 (via Playio, 2026-10-05) | ≈ $24 | ≈ $30 | — | — |
| Playwire (2025-09-17, via Playio) | $15–30 Tier 1 | | $8–18 global | |

Planning assumptions (estimates): a US-heavy, non-personalised, new app sits at
the low end, a blended **$8–12 eCPM**; opt-in placements in a puzzle app yield
**0.2–0.5 rewarded impressions per DAU per day**.

| | Low | High |
|---|---|---|
| Revenue per DAU per day | 0.2 × $8 / 1000 = $0.0016 | 0.5 × $12 / 1000 = $0.006 |
| Per DAU per month (30 days) | ≈ $0.05 | ≈ $0.18 |
| At 300 app DAU | ≈ $14/month | ≈ $54/month |
| At 1,000 app DAU | ≈ $48/month | ≈ $180/month |

The apps launched this month and are far below 300 DAU, so AdMob cannot cover
the ~$25 Supabase Pro step before roughly that mark (decision 8). It is still
worth building once Plus exists: the same placements are the Plus conversion
surface, and the AdMob account, UMP flow and store declarations take a review
cycle to settle.

---

## 2. Premium tier: Crossword Clash Plus

### 2.1 Free versus Plus

| Feature | Free (anonymous) | Free (account) | Plus |
|---|---|---|---|
| Daily mini, midi, large; imports; multiplayer rooms | yes | yes | yes |
| Puzzle archive | last 7 days | last 30 days (decision 5) | every day since 2026-10-16 |
| Reveal a letter (solo, apps and web) | 1 per puzzle, +3 per rewarded ad in the apps | same | unlimited |
| Solve history and streaks on every device | local only | `solves` sync (exists) | same |
| Per-puzzle progress on every device | local only | local only | `solo_progress` sync (§3.6) |
| AI narrator (TV view) | demo: 5 sampled events | demo | 60 narrator-minutes a month, +10 per rewarded ad in the apps |
| Construction studio | — | — | editor, engine fill, heatmap, play-test links, My puzzles, Claude clue drafting (40 calls a month) |
| Rooms | unlimited | unlimited | unlimited (a free cap only if Realtime load forces one, §2.5) |
| Web display ads | none today (AdSense rejected); if ever enabled, hidden for Plus | | none |

Nothing a free player has today is removed except the archive window for
signed-in accounts, which is why decision 5 needs an explicit yes.

### 2.2 The studio as a premium feature

**What Plus gets.** Everything that runs on the player's device, plus a metered
slice of Claude:

- `/studio` in production builds. The route is currently registered only in
  dev or with `VITE_STUDIO=1` and the Vite plugin strips the worker and wasm
  otherwise (`routes.tsx:132`, `vite.config.ts:37-65`). Register the route
  unconditionally and let the screen gate: a `StudioGate` wrapper renders the
  editor when `account.plus || account.studioAdmin`, otherwise a benefit-led
  Plus card (what the studio is, a short clip, "Go Plus"), with sign-in first
  when anonymous. The lazy chunk, worker and wasm load only after the gate
  passes, so free visitors pay nothing in bytes. `VITE_STUDIO` becomes a
  dev-only "skip the gate" switch.
- The Ingrid-style editor, engine fill and heatmap (client-side wasm), the
  word list from the public `seedgrid` bucket (`words-production.dict`, MIT /
  public-domain / SCOWL inputs only, as CLAUDE.md records; the private
  `words.dict` stays out of production), `.ipuz` export, Play test links, My
  puzzles (localStorage today; a synced `studio_puzzles` table is a later
  phase, §4).
- Clue drafting through `studio-claude` on a per-user allowance: **40 calls a
  month**, Sonnet 5.5 only. A draft of a 15×15 is one `cluesRequest` plus one
  fix pass plus occasional alternatives, about five calls, so 40 calls is
  roughly eight full puzzles a month. Cost ceiling: a call is a few thousand
  input tokens and up to a few thousand output tokens; at Sonnet 5.5's list
  price ($2 / $10 per MTok, Anthropic pricing page) that is well under $0.10 a
  call, so the worst-case subscriber costs under $4 a month in drafting, and
  the median far less. Opus 5.5 ($4 / $20) stays admin-only.

**What stays admin-only** (unchanged gates: `studio_admins` row or the studio
token): `DailyQueue` and `studio-schedule` (scheduling a puzzle on a day),
`Insights` and `studio-insights`, the Opus model, the `x-studio-token` path,
and the hidden word list. The studio token keeps working exactly as today for
the constructor's own browser.

**How `studio-claude` authorises a Plus user.** Replace the boolean
`studioAllowed(req)` with `studioAccess(req)` in `_shared/studioAuth.ts`:

```ts
type StudioAccess =
  | { kind: "admin"; userId: string | null }     // STUDIO_TOKEN or studio_admins
  | { kind: "plus"; userId: string }             // active entitlement
  | null;
```

Resolution order: token → admin row → `entitlements` lookup
(`has_entitlement(user_id, 'plus')`, §3.1) for a non-anonymous JWT. The same
`auth.getUser(jwt)` call that the admin branch already makes supplies the
user; `is_anonymous` users are refused as today. Then, for `kind: "plus"`:

- rate limit **per user**, not per IP: a new `checkUserRateLimit(userId,
  "studio-claude", 30/h)` that counts `feature_usage` events rather than
  `narrator_usage` rows;
- monthly allowance: `consumeAllowance(userId, "studio_claude", 1, 40)` in one
  `UPDATE … RETURNING` (§3.1), refused with HTTP 402 `{ error:
  "allowance_exhausted", feature: "studio_claude", resetsAt }` so the client's
  existing 402 → "budget" mapping (`studioClaude.ts`) can show "Your monthly
  drafting allowance is used up; resets on the 1st" instead of the global
  message;
- the request's `model` is forced to `claude-sonnet-5-5` and `maxTokens`
  capped at 8000;
- `logUsage` records `model` as today so the global ledger keeps pricing it,
  and the row gains a `user_id` column for per-user reporting.

The global `checkNarratorBudget` stays as a backstop for the admin path and is
raised in step with subscribers (§2.3). `studio-schedule` and
`studio-insights` keep `kind === "admin"` only.

**Client.** `CluePanel`, `DailyQueue` and `Insights` take `access:
StudioAccess` instead of `admin: boolean`; `CluePanel` enables drafting for
`plus` or `admin`, shows the remaining allowance ("31 of 40 drafts left this
month", from a `GET studio-claude?usage=1` or a `feature_usage` RLS read), and
the other two panels hide entirely for `plus`. `useStudioAccount` merges with
`useAccountContext` so there is one source for user, admin and plus.

**The alternative** (decision 3): keep the editor free for any signed-in
account and gate only Claude drafting and My-puzzles sync. It costs nothing to
serve and would be a funnel into Plus, but it gives away the tier's most
distinctive feature and makes the Plus pitch "AI clues" rather than "build
your own crossword". Recommendation: premium-only, with a public page and
screenshots of the studio so the pitch is visible before paying.

### 2.3 The narrator: a per-user allowance instead of the shared cap

Today the narrator is a shared $20/month pool for everyone (`budgetGuard.ts`),
which the audit put at 15–25 narrated games a month in total. Plus replaces
the pool with a per-subscriber allowance and keeps the pool as a backstop.

**Unit of account: the narrator-minute.** Reservation accounting, because the
server never sees how long an ElevenLabs or OpenAI session really ran (both are
client-to-vendor WebSockets authorised by `agent-auth` / `openai-agent-auth`):

| Engine | Charged when | Minutes |
|---|---|---|
| `elevenlabs-agent` | `agent-auth` grants a signed URL | 10 per grant |
| `openai-agent` | `openai-agent-auth` grants a token | 10 per grant |
| `claude` (+ `tts`) | every 6th `narrator-claude` call for the user (a game is ~30–40 events over ~10 minutes, so one event ≈ 10 s) | 1 per 6 calls |

Plus: **60 minutes a month** (about six agent games, or more Claude-path
games). Free: 0 beyond the existing demo. Rewarded placement C adds 10.

Worst-case cost per maxed-out subscriber, from vendor list prices: ElevenLabs
agents bill $0.080 per additional call minute plus the LLM (elevenlabs.io
/pricing/agents) → ~$5; OpenAI gpt-realtime audio is $32 / $64 per million
audio tokens with no published per-minute figure (developers.openai.com
pricing; the audit's ~$0.06–0.11 a minute is a third-party conversion) →
~$4–7; the Claude path is ~$0.05 of Sonnet 5.5 plus ~3,000 TTS characters a
game at ElevenLabs' API rate of $0.04 per 1,000 Flash characters → under $0.20
a game, ~$1.20 for 60 minutes. Expected use is a small fraction of 60 minutes
(a TV game night is an event, not a daily habit), so the allowance is a ceiling
on abuse, not a cost of goods; the price in §2.6 assumes a median subscriber
uses a few dollars a year of narration.

**Server changes.**

- The four narrator functions read the caller: the client sends the session's
  access token in `Authorization` instead of the anon key
  (`claudeNarrator.ts:29,94`, and the two agent backends); the functions call
  `auth.getUser(jwt)` the way `studioAuth.ts` does. A missing or anonymous
  user gets the demo path only.
- Order of checks becomes: per-IP rate limit (kept, abuse guard) →
  **per-user allowance** (`consumeAllowance(userId, "narrator_minutes", n,
  60)`) → global budget backstop (`checkNarratorBudget`, cap raised to
  `NARRATOR_MONTHLY_USD_CAP` = 20 + 2 × active subscribers, recomputed by the
  function from `entitlements` so no env change is needed per subscriber) →
  vendor call.
- Refusal: 402 `{ error: "allowance_exhausted", feature: "narrator_minutes",
  resetsAt, rewardAvailable }`; `useNarrator` treats it like
  `NARRATOR_UNAVAILABLE_BUDGET` today (no cascade, settle to paused) and
  `HostSpectateScreen` shows "Your narrator minutes for this month are used
  up" with the rewarded button in the apps.
- `narrator_sessions` gains nothing; `feature_usage` (§3.1) is the ledger.

**Client.** The TTS settings modal marks the narrator "Plus" with the demo
copy ("Hear a sample") for free users; `narrator_enabled` analytics gains a
`plan` param.

### 2.4 Synced per-puzzle progress

`soloProgress.ts` is deliberately local-only; `solves` stores finishes, not
grids (`puzzle-archive-spec.md` §5.3). Plus adds a mirror table
`solo_progress (user_id, puzzle_key, cells jsonb, elapsed_ms, filled, total,
updated_at)`, RLS owner-only, non-anonymous JWT **and** `has_entitlement(
auth.uid(), 'plus')` (§3.1). The client writes through the existing
`recordProgressCells` / `recordProgressElapsed` path with a 2-second debounce
and on `visibilitychange`, deletes the row where the local record is deleted
(finish, reset), and on load merges by `updatedAt` (newer wins; a finished
puzzle wins over progress, as `deriveArchiveItems` already rules). Size: at
most 30 rows of ~2 KB per subscriber. The retention sweep's 2-year
`play_sessions` rule needs no change; `solo_progress` rows die with the user
(cascade) and should be dropped when Plus lapses for 90 days.

### 2.5 Rooms

"Unlimited rooms" is a Plus line only if a free cap exists, and the audit says
to add one only when Realtime approaches its ceilings (§1 there). Specify the
hook now, build nothing: a `create_room()` RPC replacing the direct insert in
`createGame` (`puzzleService.ts:72`) that counts the caller's `games` rows in
the last 24 h and refuses beyond `free_rooms_per_day` (3) unless
`has_entitlement(auth.uid(), 'plus')`. Not in the first-month plan.

### 2.6 Pricing, fees and comparables

**Comparables** (App Store listings, read 2026-10-23): NYT Games $4.99–5.99 a
month, the standalone NYT Crossword subscription $6.99 a month / $39.99 a year;
Black Ink Crosswords $1.99 a month / $19.99 a year / $99.99 lifetime;
Crosswords With Friends VIP $5.99; Crossword Puzzle Redstone "Remove Ads"
$34.99 one-time; Puzzmo Plus about $40 a year (a 2024 press report, not the
vendor). Apple's price points start at $0.29 (Apple newsroom, 2022-12-06).

**Proposal (decision 1): $3.99 a month, $24.99 a year** (≈ $2.08 a month, a
48% saving the paywall can state). Reasoning: below NYT, above Black Ink's
$1.99 because Plus carries real per-user cost (narrator minutes, Claude calls)
that a pure content subscription does not; the annual price is the one to
push, since it front-loads cash and halves churn exposure.

**Net per subscriber after fees** (vendor fee pages, read 2026-10-23):

| Channel | Fee | Monthly $3.99 | Annual $24.99 |
|---|---|---|---|
| Apple, Small Business Program (15%; eligible under $1M prior-year proceeds, enrol as Account Holder) | 15% | $3.39 | $21.24 |
| Apple, standard | 30% in year one, 15% after a year of paid service | $2.79 | $17.49 |
| Google Play, US/EEA/UK from 2026-06-30: auto-renewing subscriptions 10% + 5% billing fee (first $1M) | 15% | $3.39 | $21.24 |
| Google Play, other markets: 15% on subscriptions | 15% | $3.39 | $21.24 |
| Stripe (US cards 2.9% + 30¢; +1.5% international, +1% currency conversion; Checkout included; Billing 0.7% not needed for Checkout-created subscriptions is **to confirm** on the Billing pricing page) | ~10% / ~4% | $3.57 | $23.97 |

Google's fee page changed materially this year: the US/EEA/UK schedule above
applies to purchases after 2026-06-30 and splits "new install" from "existing
install" rates for non-subscription items (20% + 5% vs 25% + 5%); subscriptions
are 10% + 5% in either case. The legacy 15%/30% table still governs other
markets. Read the live page before setting prices.

**A one-time "Supporter"** (decision 1, second half): Apple allows
non-consumables beside subscriptions (guideline 3.1.2(a) even protects a
previously bought "full game unlock" when subscriptions are added) and Black
Ink's $99.99 lifetime shows the pattern. But Plus's two metered features cost
money every month, so a lifetime unlock is an unbounded liability.
Recommendation: no Supporter at launch. If the first two months show a cohort
that resents subscriptions, add a **$19.99 non-consumable** that unlocks the
archive, synced progress, unlimited reveals and the studio editor for ever, and
leaves narrator minutes and Claude drafting to the subscription or rewarded
video. Same `entitlements` row with `expires_at null`, `product = 'supporter'`.

**Free trial** (decision 10): none at launch. Apple and Google both support
trials and introductory offers; the problem is ours, a trial hands narrator
minutes and Claude calls to people who will cancel. An annual introductory
price (first year $19.99) is the safer offer later.

**Prerequisites in the consoles:** Apple Paid Apps Agreement (Account Holder,
App Store Connect → Business → Agreements; sandbox testing does not work until
it is signed), banking and tax forms, Small Business Program enrolment; a
subscription group with the two products, whose **first submission must ride a
new app version**; Terms of Use and Privacy Policy links in the app and in the
App Store metadata (Schedule 2 §3.8(b) and Apple's subscriptions page, the
usual rejection when missing; `/terms` and `/privacy` exist, the app needs
in-app links on the paywall). Google: a merchant profile in the payments
centre (one-time link), two subscription products, licence testers (test
renewals are compressed: a month renews every 5 minutes, a year every 30).
Stripe: an account, two Prices, Checkout, Customer Portal, a webhook endpoint,
and the Stripe Tax decision (0.5% per transaction no-code; it needs a tax
registration where we are liable, decision 9).

### 2.7 RevenueCat versus direct StoreKit / Play Billing, and Stripe on the web

| | RevenueCat (apps) | Direct (StoreKit 2 + Play Billing + App Store Server API + Play Developer API) |
|---|---|---|
| Client | `@revenuecat/purchases-capacitor` 13.7.6 (2026-10-22), peer `@capacitor/core >= 8`, bundles Play Billing Library 8.3.0 (meets Google's "all new apps and updates must use Billing Library 8 or later by 2026-08-31") | Two native plugins or custom Swift/Kotlin; the Capacitor ecosystem has no maintained first-party IAP plugin to compare with |
| Server | One webhook (`INITIAL_PURCHASE`, `RENEWAL`, `CANCELLATION`, `EXPIRATION`, `BILLING_ISSUE`, `PRODUCT_CHANGE`, `TRANSFER`, …; a dashboard-set `Authorization` header to verify; 200 within 60 s; five retries) and `GET /v1/subscribers/{app_user_id}` to reconcile | Apple: Get Transaction Info / Get All Subscription Statuses with an App Store Connect API key JWT, JWS verified against Apple's root certificates with `@apple/app-store-server-library` (Node 22+), Server Notifications V2 (22 types). Google: `purchases.subscriptionsv2.get` / `purchases.products.get` with a service account, acknowledgement within 3 days or the purchase is refunded, Real-time developer notifications over Pub/Sub. Two of everything |
| Identity | `app_user_id` = Supabase uid (RevenueCat's rules: your auth id, non-guessable, under 100 chars); `logIn()` merges an anonymous RevenueCat id into it; `TRANSFER` events when a store account moves between uids | We key on `originalTransactionId` / purchase token ourselves |
| Price | Free to $2,500 monthly tracked revenue, then 1% of all tracked revenue ("$2,600 in MTR results in a $26 charge") | $0, our time |
| Web | Web Billing (Stripe as gateway, no RevenueCat fee, unified entitlements) exists, but its overview page 404s today and a search snippet still labels it beta | Stripe directly |

Recommendation (decision 2): **RevenueCat for the apps** (it is the Apple and
Google halves of `verify-purchase` for free at our scale, with the restore and
transfer cases already handled) and **Stripe Checkout directly on the web**
(mature, Apple Pay and Google Pay built into hosted Checkout with no extra
configuration, a Customer Portal for cancel/upgrade/invoices). Both feed one
`entitlements` table through one edge function (§3.2), so RevenueCat Web
Billing can replace the Stripe path later without touching the client's view of
entitlement, and so leaving RevenueCat later means writing the two direct
halves against the same contract.

Apple's multiplatform rule makes the split legal: guideline 3.1.3(b) lets apps
"allow users to access content, subscriptions, or features they have acquired
in your app on other platforms or your web site … provided those items are also
available as in-app purchases within the app", which they are. The apps never
link to the web checkout (3.1.1 forbids it outside the US storefront; the US
carve-out after the Epic injunction is live but under Supreme Court review as
of June 2026, per secondary sources) and only say "Already Plus on the web?
Sign in." Google's payments policy allows "consumption-only" apps that let a
user "access content paid for somewhere else" with no mirror-IAP condition.

---

## 3. Entitlements architecture

### 3.1 Data model and migration sketch

```sql
-- supabase/migrations/2026MMDD000000_entitlements.sql (sketch)

CREATE TABLE IF NOT EXISTS entitlements (
  user_id         UUID NOT NULL REFERENCES auth.users (id) ON DELETE CASCADE,
  product         TEXT NOT NULL CHECK (product IN ('plus', 'supporter')),
  source          TEXT NOT NULL CHECK (source IN ('revenuecat', 'stripe', 'apple', 'google', 'grant')),
  status          TEXT NOT NULL CHECK (status IN ('active', 'grace', 'expired', 'revoked')),
  expires_at      TIMESTAMPTZ,                 -- NULL = lifetime (supporter, grant)
  will_renew      BOOLEAN NOT NULL DEFAULT false,
  -- Apple originalTransactionId, Google purchase token, Stripe subscription id,
  -- or RevenueCat original_app_user_id: the key a restore on another device presents.
  external_id     TEXT,
  external_customer TEXT,                      -- Stripe customer id / RevenueCat app_user_id
  updated_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
  created_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY (user_id, product)
);
-- One store purchase can belong to one user at a time (restore = move).
CREATE UNIQUE INDEX IF NOT EXISTS entitlements_external_key
  ON entitlements (source, external_id) WHERE external_id IS NOT NULL;

ALTER TABLE entitlements ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Users read own entitlements" ON entitlements
  FOR SELECT USING ((select auth.uid()) = user_id);
-- No INSERT / UPDATE / DELETE policies: only the service role (verify-purchase) writes.

-- Idempotency + audit for every store/webhook event we acted on.
CREATE TABLE IF NOT EXISTS purchase_events (
  source      TEXT NOT NULL,
  event_id    TEXT NOT NULL,                   -- RevenueCat event.id, Stripe event.id, AdMob transaction_id
  user_id     UUID,
  kind        TEXT NOT NULL,
  payload     JSONB NOT NULL,
  received_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY (source, event_id)
);
ALTER TABLE purchase_events ENABLE ROW LEVEL SECURITY;   -- service role only

-- Metered Plus features, one row per user × feature × month.
CREATE TABLE IF NOT EXISTS feature_usage (
  user_id  UUID NOT NULL REFERENCES auth.users (id) ON DELETE CASCADE,
  feature  TEXT NOT NULL CHECK (feature IN ('narrator_minutes', 'studio_claude')),
  month    DATE NOT NULL,                      -- date_trunc('month', now() at time zone 'utc')
  used     INTEGER NOT NULL DEFAULT 0,
  bonus    INTEGER NOT NULL DEFAULT 0,         -- rewarded-video credits (narrator_minutes)
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY (user_id, feature, month)
);
ALTER TABLE feature_usage ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Users read own usage" ON feature_usage
  FOR SELECT USING ((select auth.uid()) = user_id);

-- The one question every gate asks. STABLE + SECURITY DEFINER so RLS policies
-- on other tables (solo_progress, create_room) can call it cheaply.
CREATE OR REPLACE FUNCTION has_entitlement(p_user UUID, p_product TEXT)
RETURNS BOOLEAN LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT EXISTS (
    SELECT 1 FROM entitlements e
    WHERE e.user_id = p_user AND e.product = p_product
      AND e.status IN ('active', 'grace')
      AND (e.expires_at IS NULL OR e.expires_at > now())
  );
$$;
REVOKE ALL ON FUNCTION has_entitlement(UUID, TEXT) FROM public;
GRANT EXECUTE ON FUNCTION has_entitlement(UUID, TEXT) TO authenticated, service_role;

-- Atomic allowance consumption for the edge functions (service role).
CREATE OR REPLACE FUNCTION consume_allowance(p_user UUID, p_feature TEXT, p_amount INT, p_limit INT)
RETURNS TABLE (allowed BOOLEAN, used INT, bonus INT) LANGUAGE plpgsql SECURITY DEFINER AS $$ … $$;
-- INSERT … ON CONFLICT DO UPDATE SET used = used + p_amount WHERE used + p_amount <= p_limit + bonus
-- RETURNING; allowed = a row came back.

-- Retention: a paying anonymous user is not idle.
-- In retention_sweep(), add to the anonymous-users DELETE:
--   AND NOT EXISTS (SELECT 1 FROM entitlements e WHERE e.user_id = u.id)
-- and the retentionMigration.test.ts owned-tables assertion gains 'entitlements'.
```

Status semantics: `active` renews or is paid up; `grace` is the store's
billing-retry window (RevenueCat `BILLING_ISSUE`, Stripe `past_due`), still
entitled; `expired` lapsed; `revoked` refunded or chargeback. The client treats
`active` and `grace` as Plus. `product = 'plus'` from any source; `'supporter'`
only if decision 1's second half is taken. `source = 'grant'` is a manual row
(press, the constructor's own accounts, refunds-as-goodwill) inserted by hand
like `studio_admins`.

`delete-account` needs no new table in `OWNED_TABLES` (both new tables cascade),
but it must **cancel the Stripe subscription** (`stripe.subscriptions.cancel`)
and ask RevenueCat to delete the customer before deleting the user, or the
person keeps being billed with no account. The privacy policy's "Accounts
(optional)" paragraph gains a sentence about what an entitlement row holds.

### 3.2 `verify-purchase` edge function contract

One function, three routes, no user JWT on the webhook routes (`verify_jwt =
false` in `supabase/config.toml` for this function, as Supabase's webhook
examples do; Supabase's own Stripe example uses `constructEventAsync` with
`Stripe.createSubtleCryptoProvider()` under Deno):

```
POST /functions/v1/verify-purchase/revenuecat
  Headers: Authorization: <shared secret configured in the RevenueCat dashboard>
  Body: RevenueCat webhook event
  → verify header (constant-time), insert purchase_events (source 'revenuecat', event.id) or 200 if seen,
    map event.type → status (INITIAL_PURCHASE/RENEWAL/UNCANCELLATION/PRODUCT_CHANGE → active;
    CANCELLATION → active with will_renew=false; BILLING_ISSUE → grace; EXPIRATION → expired;
    TRANSFER → move rows from transferred_from to transferred_to; refund types → revoked),
    user_id = event.app_user_id (the Supabase uid; RevenueCat anonymous ids are refused),
    expires_at = event.expiration_at_ms, external_id = event.original_app_user_id || transaction_id,
    upsert entitlements (user_id, 'plus'), 200.

POST /functions/v1/verify-purchase/stripe
  Headers: Stripe-Signature
  Body: raw Stripe event
  → constructEventAsync(body, sig, STRIPE_WEBHOOK_SIGNING_SECRET) (5-minute tolerance),
    insert purchase_events or 200 if seen,
    checkout.session.completed → bind customer → uid from client_reference_id (set by create-checkout),
    customer.subscription.created/updated → status from subscription.status
      (active|trialing → active; past_due → grace; canceled|unpaid|incomplete_expired → expired),
      expires_at = current_period_end, will_renew = !cancel_at_period_end, external_id = subscription.id,
    customer.subscription.deleted → expired; charge.refunded → revoked,
    invoice.payment_failed → grace (Stripe's own retry schedule governs; `invoice.paid` → active),
    200.

POST /functions/v1/verify-purchase/reconcile        (user JWT, non-anonymous or anonymous)
  Body: { source: "revenuecat" }  → GET api.revenuecat.com/v1/subscribers/{uid} with the secret key,
        upsert from subscriber.entitlements (the "Restore purchases" and "I just bought it, refresh" path;
        RevenueCat's TRANSFER event covers the device-moved case asynchronously).
  Body: { source: "stripe" }      → list the customer's subscriptions by uid metadata and upsert.
  → 200 { entitlements: [...] }
```

Companion functions, both user-JWT and non-anonymous only: `create-checkout`
(Stripe Checkout Session, `mode: "subscription"`, `client_reference_id` = uid,
`customer_email` from the account, `metadata.uid`, `success_url`
`/account?checkout=success`, `cancel_url` back to the paywall) and
`billing-portal` (`billing_portal.sessions.create({ customer, return_url })`).
The direct Apple and Google routes (`/apple` with a `transactionId`, `/google`
with `purchaseToken` + `productId` + `type`) are specified in the audit's
sketch and deliberately **not built** while RevenueCat is in use; the contract
above leaves room for them (same upsert, `source = 'apple' | 'google'`,
`external_id` = `originalTransactionId` / purchase token, Google acknowledged
within 3 days).

### 3.3 How entitlement reaches the client

`useAccount` (and so `AccountContextValue`) gains:

```ts
plus: boolean;            // has_entitlement for 'plus' or 'supporter' covering the feature
entitlements: EntitlementRow[] | null;   // null while loading
plusReady: boolean;       // false until the first answer (or the cache) is in
refreshEntitlements(): Promise<void>;
openPaywall(opts?: { placement: string; feature?: "archive" | "studio" | "narrator" | "reveal" | "progress" }): void;
```

Loading: whenever `user.id` changes (anonymous users included, since app
purchases attach to them, §3.5), `select * from entitlements where user_id =
…` under the select-own policy; refetch on `visibilitychange`, after a purchase
or restore, and when a 402 `allowance_exhausted` arrives. No Realtime
subscription: `games`/`players` were just taken out of the publication and
entitlement changes are rare.

**Cache and offline grace.** The last answer is kept in localStorage
(`crossword-clash:entitlements` `{ userId, rows, fetchedAt }`) and used as the
initial state so a Plus player opens the app offline to their archive and
studio. Rules: a cached `active`/`grace` row counts while `expires_at + 3 days
> now()` and `fetchedAt` is within 7 days; past that the client falls back to
free until it can refetch. Anything that costs money is decided on the server
(§2.2, §2.3), so the cache can only ever over-grant client-side features for a
week. The cache is cleared on sign-out and when `userId` changes.

`openPaywall` renders one `PaywallSheet` (sibling of `AccountSheet`): the
benefit list, the two prices with the annual one first, "Restore purchases" in
the apps, "Manage subscription" (Customer Portal on the web, the store's
subscription settings in the apps), and the Terms / Privacy links Apple's
Schedule 2 requires. In the apps it drives RevenueCat; on the web it calls
`create-checkout` and redirects. Where accounts cannot be offered and purchases
cannot be made (a web build without Supabase) the sheet is never shown, as
`AccountSheet` is gated today.

### 3.4 Analytics

New `track()` events: `paywall_viewed { placement, feature }`,
`checkout_started { channel }`, `purchase_completed { channel, product,
period }`, `purchase_restored`, `subscription_cancelled` (from the portal
return), `reward_ad_offered | reward_ad_started | reward_ad_earned |
reward_ad_failed { placement, reason }`, `reveal_used { source: "free" | "ad"
| "plus" }`. GA4 exists only on the web; in the apps these ride the existing
first-party `play_sessions` sender as a new `events` table or are read from the
RevenueCat and AdMob dashboards (§4.3).

### 3.5 Anonymous users, accounts and the two stores

- **Web: Plus requires an account.** `openPaywall` for an anonymous visitor
  opens `AccountSheet` first (`placement` forwarded), then the paywall. Stripe
  needs an email for receipts and a stable identity for the portal, and the
  retention sweep deletes idle anonymous users after 30 days, which would
  orphan a paid row. `linkIdentity` keeps the uid, so an existing anonymous
  history stays with the new account, as today.
- **Apps: Plus requires an account too (revised 2026-10-28; Andrew's call
  after the first sandbox purchase).** The original decision let the store
  sell to the device's anonymous uid, reading Apple's 5.1.1(v) as a bar on
  sign-in before purchase. It is not: 5.1.1(v) only forbids requiring a login
  where an app has no significant account-based features, and the free game
  stays fully playable without one. Plus *is* account-based — progress sync
  and solve history only exist for an account, and the studio is web-only, so
  an anonymous app buyer could reach neither and had no way back to Manage or
  Restore once the sheet closed. So the apps now behave like the web: the
  paywall shows an anonymous visitor the Apple / Google buttons with "Plus
  belongs to your account, so it follows you to the web and every device", the
  plans appear in place after the native sign-in (the username step waits for
  the account page), and the purchase attaches to the signed-in uid
  (RevenueCat `app_user_id` = uid, set at app start, never `logOut()`; the
  entitlement row is written for that uid). "Restore purchases" (3.1.1) is on
  the same signed-in paywall and re-presents the store receipt. A subscriber
  whose purchase predates this rule (the 2026-10-28 sandbox row) still sees
  Manage / Restore while anonymous, with the sign-in prompt beneath, and
  signing in keeps the uid. The retention sweep's `entitlements` exclusion
  stays as a safety net. The menu's "Crossword Clash Plus" row is permanent:
  the pitch for a non-subscriber, "tap to manage" for a subscriber.
- **Native sign-in is a prerequisite** for the apps' account card, the archive
  lock in the apps and cross-device Plus, because `accountsAvailable()` is
  false there: the webview cannot host the providers' pages. Supabase
  documents the native path: Sign in with Apple's identity token and Google's
  Credential Manager / GoogleSignIn-iOS id token go to `signInWithIdToken`,
  and the identity-linking guide says "For native mobile applications, you can
  link an identity using an ID token" for the same providers (Google, Apple,
  Facebook, Kakao, Keycloak) with manual linking enabled, which keeps the
  anonymous uid exactly as `linkIdentity` does on the web. Dashboard work:
  register the bundle id `com.crosswordclash.app` as an Apple client id
  (Supabase accepts "any client ID in the list as a valid token audience") and
  the Android and iOS Google client ids beside the web one. Plugin:
  `@capgo/capacitor-social-login` 8.7.5 (2026-10-21, peer `@capacitor/core >=
  8.0.0`, Apple and Google in one plugin); `@capacitor-community/apple-sign-in`
  7.1.0 (2025-10-02) still declares Capacitor 7 only. `accountsAvailable()`
  becomes `!!supabase && (MODE !== "mobile" || nativeSignInAvailable())`, and
  `signInWith` grows a native branch. The exact JavaScript method name for
  id-token linking is a spike item (the guide shows Dart's
  `linkIdentityWithIdToken` and a JavaScript Google example).
- **When linking says `identity_already_exists`** (the Apple ID already has an
  account from the web), the app signs in to that account, the uid changes, and
  the app calls RevenueCat `logIn(newUid)`: RevenueCat merges or emits a
  `TRANSFER` event, which `verify-purchase` applies by moving the rows, and the
  `uploadLocalHistory` path already carries local solves across.
- **Deletion.** `deleteAccount` must cancel billing first (§3.1). Supabase's
  own note that "Automatic cleanup of anonymous users is currently not
  available" is why `retention_sweep` exists; it just needs the new exclusion.

### 3.6 How each gated feature checks entitlement

| Feature | Where the check lives | Rule |
|---|---|---|
| Archive | `ArchiveScreen.tsx:120` `unlocked`, and `isLockedDay` gains a window parameter: `lockedBefore(day, today, windowDays)` with `windowDays` = 7 anonymous, 30 free account, ∞ Plus (decision 5). `unlocked` no longer treats `!account.available` as open once the apps can sign in; a web build without Supabase stays open as today | Client; the locked panel offers sign-in → Plus (→ rewarded ad in the apps) |
| Reveal | `SoloPlayScreen` reads `soloProgress` reveal count; Plus skips the count | Client |
| Narrator | `agent-auth`, `openai-agent-auth`, `narrator-claude`, `tts`: user JWT → `consume_allowance` → global backstop (§2.3) | **Server** |
| Studio editor | `StudioGate` on `plus \|\| studioAdmin` (§2.2) | Client (the editor is client-side; the only server asset is the public word list) |
| Studio Claude | `studioAccess(req)` + `consume_allowance(… 'studio_claude', 1, 40)` | **Server** |
| Progress sync | RLS on `solo_progress`: `auth.uid() = user_id AND NOT is_anonymous AND has_entitlement(auth.uid(), 'plus')` | **Server** (RLS) |
| Web display ads | `AdSlot` returns null when `plus` (only matters if AdSense is ever enabled) | Client |
| Rooms (future) | `create_room()` RPC | Server |

### 3.7 Security notes

Service role only for writes; `has_entitlement` is `SECURITY DEFINER` and
`STABLE` so RLS can call it without exposing the table; every webhook route is
idempotent on `(source, event_id)`; the RevenueCat `Authorization` header and
AdMob SSV signature are verified with constant-time comparison (`sameToken` in
`_shared/studioAuth.ts` is the pattern); `app_user_id`s that are RevenueCat
anonymous ids (`$RCAnonymousID:` prefix) are refused so no row is written for a
non-Supabase identity; Stripe's `client_reference_id` is trusted only from
`checkout.session.completed` events the signature verified; allowances are
consumed in one `UPDATE … RETURNING` so two concurrent calls cannot both pass
at the limit; and the global `checkNarratorBudget` remains the last line
against a bug in any of the above.

---

## 4. Rollout order and effort

### 4.1 Order

The audit named AdMob rewarded and the entitlements table as the first cover
for a plan upgrade. Entitlements first: it ships with a web deploy and no
store review, the studio (the headline Plus feature) is web-only in practice,
and the apps have too few users this month for ads to matter (§1.10). AdMob
second, once Plus exists to convert to.

| Phase | Ships by | Needs | What |
|---|---|---|---|
| **0. Plus on the web** | web deploy + `supabase db push` + `functions deploy` | Stripe account, decisions 1–5, 9, 10 | Migration (§3.1), `verify-purchase` (`/stripe`, `/reconcile`), `create-checkout`, `billing-portal`; `useAccount` extension + cache; `PaywallSheet`; archive window change; `solo_progress` sync; studio route ungated with `StudioGate`, `studioAccess` in `studio-claude`, per-user allowance; `retention_sweep` exclusion; privacy policy "Accounts" sentence; Terms gain a subscriptions section; analytics events. Flag `VITE_PLUS=1` so main can merge before launch |
| **1. Plus in the apps (1.1.0)** | App Store + Play review | Paid Apps Agreement, merchant profile, products in both consoles, Small Business enrolment, RevenueCat project, native sign-in client ids | `@capgo/capacitor-social-login` + native `signInWith`; `@revenuecat/purchases-capacitor`; paywall in-app with Restore and the Terms/Privacy links; `verify-purchase/revenuecat`; archive lock in the apps; review notes describing the subscription and the restore path. The first subscription must be submitted with this version (Apple) |
| **2. Rewarded video (1.2.0)** | App Store + Play review, plus a web deploy for `app-ads.txt` and the privacy policy | AdMob account linked to the AdSense publisher, apps and three units per platform, Privacy & messaging messages, decisions 6–8 | Reveal feature (web too, with the free-1 rule); `@capacitor-community/admob`, UMP flow, placements A and B; `PrivacyInfo.xcprivacy`, Data safety, App Privacy, Ads declaration; `public/app-ads.txt`; the web-bundle grep test. Live units switched on at ~300 DAU |
| **3. Narrator allowance** | web deploy + `functions deploy` (+ 1.3.0 for placement C) | decision 4 | User JWT on the four narrator functions, `consume_allowance` for `narrator_minutes`, the subscriber-scaled backstop, TTS modal copy; then `admob-ssv` and placement C |

Phases 0 and 3 are web deploys and can land in either order; 3 is listed last
only because the narrator's audience is TV hosts, the smallest group.

### 4.2 Effort (estimates, one engineer)

| Phase | Days | Biggest single item |
|---|---|---|
| 0 | 7–9 | `verify-purchase/stripe` + reconcile and its tests against recorded Stripe events; the studio gate and `studioAccess` |
| 1 | 6–8 | Native sign-in on both platforms with Supabase client ids (the id-token linking spike is the first day); console setup is wall-clock, not effort |
| 2 | 5–7 | UMP + ATT-less flow on real devices in a `debugGeography` EEA test; the two store privacy forms |
| 3 | 3–4 | Passing the user JWT through four functions and three backends without breaking the demo path |

### 4.3 What to measure in the first month

- **Funnel:** `paywall_viewed` → `checkout_started` → `purchase_completed`,
  by `placement` (archive lock, studio gate, narrator paused, reveal) and by
  channel; target to learn, not to hit: the audit's 1–3% of MAU. Archive
  locked-day views that end in sign-in vs Plus vs an ad.
- **Subscribers:** count, MRR, monthly vs annual mix, cancellations
  (`will_renew = false`), refunds, `grace` rows; from `entitlements`, the
  RevenueCat dashboard and Stripe.
- **Cost of goods per subscriber:** `feature_usage` for narrator minutes and
  Claude calls per user, the Neon `api_usage` ledger priced by
  `narratorBudget.ts`, divided by active subscribers; the distribution, not the
  mean, decides whether 60 minutes and 40 calls are right.
- **Studio:** `/studio` opens, gate → paywall rate, puzzles saved, drafts per
  user, play-test links opened.
- **Progress sync:** rows per subscriber, conflicts resolved by `updatedAt`.
- **Ads** (AdMob reports): requests, fill rate, impressions per DAU, eCPM by
  country and platform, revenue; UMP consent rate in the EEA/UK; reveal ads
  earned vs failed by `reason`; whether placement B cannibalises Plus (compare
  archive-lock → Plus conversion before and after ads go live).
- **Review and support:** store review outcomes for 1.1.0 and 1.2.0, support
  mail about billing, restore and ads, with the Support page gaining a
  "Subscriptions and refunds" entry pointing to the stores' own refund flows.

### 4.4 The free-feature policy decisions

Two of the decisions at the top are about what stays free, and they need a
yes before phase 0 and phase 3 respectively:

- **Narrator demo (decision 4).** Keep `DEFAULT_DEMO_EVENT_ALLOWANCE` = 5
  events per browser and `DEFAULT_DEMO_GRANT_LIMIT` = 2 per IP on the Claude
  path, so a first-time TV host still hears the narrator. The server already
  independently caps demo grants, so the demo cannot become the free tier.
  Alternative: a free allowance of 10 narrator-minutes a month per signed-in
  account; cost at today's volume is small, but it needs the user JWT work of
  phase 3 before it can be offered, and it makes "Plus gives you the narrator"
  a weaker line.
- **Studio editor free or Plus (decision 3).** §2.2 recommends Plus-only.
  Either way Claude drafting is Plus-metered and the daily queue, insights and
  token stay admin-only.

---

## 5. Open questions (not decisions, things to find out)

1. Does `supabase-js` expose id-token identity linking under `linkIdentity`
   or a sibling method? The guide names Dart's `linkIdentityWithIdToken` and
   shows a JavaScript Google example; a one-hour spike settles it, and the
   fallback is sign-in plus a RevenueCat `TRANSFER`.
2. Does `@apple/app-store-server-library` run under Supabase's Deno runtime? Only
   relevant if RevenueCat is ever left; not needed for phases 0–3.
3. Is the Stripe Billing 0.7% fee charged on subscriptions created through
   Checkout? The pricing pages read today list Billing "pay as you go" at
   0.7% and Checkout "included"; confirm with Stripe before projecting web net.
4. Can ElevenLabs agent sessions be capped at a maximum duration in the agent
   dashboard, so the 10-minute reservation is also a hard stop? Not checked.
5. Which Apple price points exist for $3.99 and $24.99 in every storefront we
   sell in; whether to use Apple's automatic equalisation.
6. Business and tax: who is the merchant of record for Stripe sales, which
   jurisdictions need registration before Stripe Tax is useful, and whether
   the Apple Small Business Program enrolment should wait for the app's first
   paid month.
7. Whether the TV view in the apps (placement C) has any real users; a month
   of `narrator_sessions.platform`-style data (via `play_sessions.platform` on
   the host device) answers it before building SSV.
8. Should the Spanish paywall show local-currency prices from the stores and
   Stripe, and are both legal pages' Spanish versions updated in the same PR.

---

## Sources (read 2026-10-23)

Google AdMob and Google Mobile Ads SDK: developers.google.com/admob/ios/quick-start; developers.google.com/admob/android/quick-start; developers.google.com/admob/ios/rel-notes (13.11.0, privacy manifest in 11.2.0); developers.google.com/admob/android/rel-notes (25.5.0, minSdk 24, UMP 4.0.0); developers.google.com/admob/android/test-ads and /ios/test-ads (test unit ids, account-flag warning); developers.google.com/admob/android/rewarded and /ios/rewarded (`onUserEarnedReward`, one-hour expiry, suspension warning); developers.google.com/admob/android/ssv (SSV parameters and keys); developers.google.com/admob/android/privacy, /ios/privacy and /android/privacy/ad-serving-modes (UMP flow, `canRequestAds`, serving modes); developers.google.com/admob/ios/privacy/idfa and /ios/ios14 (ATT optional, no IDFA sent, SKAdNetwork); developers.google.com/admob/ios/data-disclosure and /android/play-data-disclosure (SDK data types); developers.google.com/admob/ios/app-ads (app-ads.txt). AdMob help: support.google.com/admob/answer/7313578 (rewarded policy), 7311747 (rewarded units, SSV, caps), 6244508 (frequency capping), 7372450 (rewarded overview, pods), 13554116 and 13554020 (certified CMP requirement), 10113207 (UMP TCF certification, limited ads), 10860309 and 16368266 (Privacy & messaging, US state message), 10105530 (limited ads), 9363762 (app-ads.txt and store fields), 2772208 and 3001017 (payment threshold and timing), 6014439 (AdMob and AdSense accounts). Google consent policy: google.com/about/company/user-consent-policy.

Google Play: support.google.com/googleplay/android-developer/answer/9859455 (ads declaration), 112622 (service fees, incl. the 2026 US/EEA/UK schedule), 9858738 and 10281818 (payments policy and FAQ), 12570971 (user choice billing), 3092739 (merchant profile); developer.android.com/google/play/billing/release-notes, /deprecation-faq (Billing Library 8 by 2026-08-31), /integrate (acknowledgement within 3 days), /rtdn-reference, /test (licence testers, compressed renewals); developers.google.com/android-publisher/api-ref/rest/v3/purchases.subscriptionsv2/get and purchases.products/get.

Apple: developer.apple.com/app-store/review/guidelines (page dated 2026-10-16: 2.3.1(a), 2.5.18, 3.1.1, 3.1.1(a), 3.1.2(a)(c), 3.1.3(b), 3.2.2(iii), 5.1.1(v), 5.1.2(i)); developer.apple.com/app-store/user-privacy-and-data-use (tracking definition); developer.apple.com/app-store/app-privacy-details; developer.apple.com/app-store/small-business-program; developer.apple.com/app-store/subscriptions (70%/85%, Family Sharing, Terms/Privacy links); developer.apple.com/support/terms/apple-developer-program-license-agreement (Schedule 2 §3.8(b)); developer.apple.com/help/app-store-connect/manage-agreements/sign-and-update-agreements; developer.apple.com/help/app-store-connect/manage-subscriptions/offer-auto-renewable-subscriptions; developer.apple.com/help/app-store-connect/test-in-app-purchases/create-a-sandbox-apple-account; developer.apple.com/documentation/storekit (Product.purchase, Transaction.currentEntitlements, sandbox); developer.apple.com/documentation/appstoreserverapi (Get Transaction Info, Get All Subscription Statuses, JWSTransaction, server library); developer.apple.com/documentation/appstoreservernotifications/notificationtype; github.com/apple/app-store-server-library-node (README, Node 22+); apple.com/certificateauthority; developer.apple.com/news/?id=9txfddzf (2025-05-01 guideline change); developer.apple.com/support/dma-and-apps-in-the-eu (EU terms from 2026-10-01); apple.com/newsroom 2022-12-06 (price points from $0.29). Epic v. Apple status after 2025: Wikipedia only (secondary).

RevenueCat: revenuecat.com/pricing and docs account-management (free to $2,500 MTR, then 1%); registry.npmjs.org/@revenuecat/purchases-capacitor and the GitHub releases/CHANGELOG (13.7.6 on 2026-10-22, Capacitor 8 since 12.0.0, Billing Library 8.3.0); revenuecat.com/docs/getting-started/installation/capacitor; revenuecat.com/docs/web/overview (Web Billing engines and fees); revenuecat.com/docs/integrations/webhooks and event-types-and-fields; revenuecat.com/docs/api-v1/customers; revenuecat.com/docs/customers/identifying-customers.

Stripe: stripe.com/pricing; stripe.com/billing/pricing; stripe.com/tax/pricing; docs.stripe.com/payments/checkout/how-checkout-works; docs.stripe.com/apple-pay; docs.stripe.com/billing/subscriptions/webhooks; docs.stripe.com/customer-management/integrate-customer-portal; docs.stripe.com/webhooks (signature, 5-minute tolerance); docs.stripe.com/testing; github.com/stripe/stripe-node README (Deno support); supabase.com/docs/guides/functions/examples/stripe-webhooks and the example source in github.com/supabase/supabase.

Supabase: supabase.com/pricing (MAU, Edge Function invocations, disk); supabase.com/docs/guides/functions/auth and /local-development/cli/config (`verify_jwt`); supabase.com/docs/guides/auth/auth-anonymous (`is_anonymous`, no automatic cleanup); supabase.com/docs/guides/auth/auth-identity-linking (native id-token linking); supabase.com/docs/guides/auth/social-login/auth-apple and auth-google (native flows, client ids, nonce); supabase.com/docs/reference/javascript/auth-signinwithidtoken; supabase.com/docs/guides/database/postgres/row-level-security.

Capacitor: capacitorjs.com/docs/updating/8-0 (iOS 15, API 24, Xcode 26, Node 22); ionic.io/blog/announcing-capacitor-8 (2025-12-08); registry.npmjs.org for `@capacitor-community/admob` 8.2.1, `@capgo/capacitor-admob` 8.2.5, `capacitor-admob-nextgen` 1.5.0, `capacitor-admob-ads` 5.0.0, `@capgo/capacitor-social-login` 8.7.5, `@capacitor-community/apple-sign-in` 7.1.0, `@capacitor/browser` 8.0.5, `@capacitor/app` 8.1.2; github.com/capacitor-community/admob (README, podspec, build.gradle, commits, issues, releases); github.com/Cap-go/capacitor-admob.

AI vendors: platform.claude.com/docs/en/about-claude/pricing (Sonnet 5.5 $2/$10, Opus 5.5 $4/$20, Haiku 5.5 $0.10/$0.50, Fable 5.1 $10/$50, batch 50%); platform.claude.com/docs/en/build-with-claude/structured-outputs; elevenlabs.io/pricing, /pricing/agents ($0.080 per extra agent minute), /pricing/api ($0.04 per 1,000 Flash characters); developers.openai.com/api/docs/pricing (gpt-realtime audio $32/$64 per MTok).

eCPM (third-party): appodeal.com, "The Latest eCPM Report 2025" PDF (March 2025, Q4 2024 data); blog.playio.co mobile-game eCPM benchmarks 2026 (2026-10-05, reproducing Tenjin × CAS Q2 2024 and Playwire 2025-09-17 figures).

Comparables: apps.apple.com listings for NYT Games (id307569751), Black Ink Crosswords (id312142427), Crossword Puzzle Redstone (id957848865), Crosswords With Friends (id1184083151); Puzzmo Plus price from a 2024 adn.com report.

Could not be verified on a vendor page today, and so marked as estimates or spikes above: the eCPM discount for non-personalised ads; Google's behaviour when ATT is never requested (only "continue to request ads" after denial is documented); the Stripe Billing fee's applicability to Checkout subscriptions; the `supabase-js` method name for id-token linking; ElevenLabs agent session duration caps; RevenueCat Web Billing's beta status (its overview page 404s); the Google Play fee row above $1M in the 2026 US/EEA/UK table; rewarded impressions per DAU for puzzle apps (no vendor figure).

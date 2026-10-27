# Crossword Clash Plus: what Andrew sets up by hand

Everything the code reads from an environment variable or a Supabase secret,
and every dashboard step that only the account owner can do. The code never
holds a key. Decisions behind each step are in `docs/monetization-spec.md`
(the ten decisions at its top were all accepted on 2026-10-23).

Sections are in the order the PRs land. Do the "Entitlements foundation"
section once PR 1 merges; the rest follow their PRs.

---

## 1. Entitlements foundation (PR 1)

### 1.1 Database

Apply the migration (it creates `entitlements`, `purchase_events`,
`feature_usage`, `has_entitlement()`, `consume_allowance()` and redefines
`retention_sweep()` so a paying anonymous user is never swept):

```bash
npx supabase db push --dry-run --linked </dev/null
```

```bash
npx supabase db push --linked </dev/null
```

Nothing runs at apply time. To give an account Plus by hand (press, your own
accounts), insert a `grant` row in the SQL editor; the app treats it exactly
like a purchase and it never expires:

```sql
insert into entitlements (user_id, product, source, status, expires_at)
values ('<auth.users id>', 'plus', 'grant', 'active', null);
```

### 1.2 Edge functions and their secrets

`verify-purchase` receives webhooks that carry no Supabase JWT, so it must be
deployed with the gateway's JWT check off (it checks the user itself on its
`/reconcile` route):

```bash
npx supabase functions deploy verify-purchase --no-verify-jwt --project-ref rdqdhawlxuclfxpsvdgs </dev/null
```

`delete-account` now cancels billing before deleting the user and needs the
vendor keys too:

```bash
npx supabase functions deploy delete-account --project-ref rdqdhawlxuclfxpsvdgs </dev/null
```

Secrets (set the ones you have; a route whose secret is missing answers 503
and does nothing):

```bash
npx supabase secrets set REVENUECAT_WEBHOOK_SECRET=<random string you choose> REVENUECAT_SECRET_KEY=<RevenueCat secret API key> STRIPE_SECRET_KEY=<sk_live_…> STRIPE_WEBHOOK_SECRET=<whsec_…> --project-ref rdqdhawlxuclfxpsvdgs </dev/null
```

| Secret | Where it comes from | Used by |
|---|---|---|
| `REVENUECAT_WEBHOOK_SECRET` | You invent it (a long random string) and paste the same value into RevenueCat's webhook "Authorization header value" field (§1.4). The function compares the whole `Authorization` header to it. | `verify-purchase/revenuecat` |
| `REVENUECAT_SECRET_KEY` | RevenueCat → Project → API keys → **Secret** key (`sk_…`). Never the public SDK key. | `verify-purchase/reconcile` (Restore purchases), `delete-account` |
| `STRIPE_SECRET_KEY` | Stripe Dashboard → Developers → API keys → Secret key. Use the **test** key until launch day, then rotate to live. | `verify-purchase` (fetching a subscription after checkout, reconcile), `delete-account`, `create-checkout` and `billing-portal` (PR 3) |
| `STRIPE_WEBHOOK_SECRET` | Shown once when the webhook endpoint is created (§1.3), `whsec_…`. Test and live endpoints have different secrets. | `verify-purchase/stripe` |
| `REVENUECAT_ALLOW_SANDBOX` | Optional. Set to `1` only on a staging Supabase project; in production, sandbox purchases are ignored so a tester never gets live Plus. | `verify-purchase/revenuecat` |

### 1.3 Stripe webhook endpoint

`pnpm stripe:setup` (§3.1 step 2) creates the endpoint together with the
product and prices, and prints its signing secret once, as the
`STRIPE_WEBHOOK_SECRET` line for `.env.local` and the `secrets set` command.
What it makes, for the record (or to add by hand under Developers →
Webhooks → **Add endpoint**):

- Endpoint URL: `https://rdqdhawlxuclfxpsvdgs.supabase.co/functions/v1/verify-purchase/stripe`
- Events to send: `checkout.session.completed`,
  `customer.subscription.created`, `customer.subscription.updated`,
  `customer.subscription.deleted`. (Invoice events are not needed: Stripe
  moves the subscription to `past_due` and back itself and sends
  `customer.subscription.updated` each time.)
- API version pinned to `2026-06-24.dahlia`, the payload shape
  `purchaseEvents.ts` was written against.
- A rerun updates the events and description but cannot show the secret
  again; to rotate it, delete the endpoint in the dashboard and rerun.

Refunds: cancel the subscription in the dashboard as well as refunding the
charge; the cancellation is what reaches the app (`…deleted` → `expired`).

To test locally with the Stripe CLI:

```bash
stripe listen --forward-to https://rdqdhawlxuclfxpsvdgs.supabase.co/functions/v1/verify-purchase/stripe
```

(it prints a temporary `whsec_…`; set that as the secret on the project while
testing, then put the dashboard endpoint's secret back).

### 1.4 RevenueCat webhook (apps; needed from PR 3)

RevenueCat → Project → Integrations → **Webhooks** → Add:

- Webhook URL: `https://rdqdhawlxuclfxpsvdgs.supabase.co/functions/v1/verify-purchase/revenuecat`
- Authorization header value: the exact string you set as
  `REVENUECAT_WEBHOOK_SECRET` (RevenueCat sends it verbatim as the
  `Authorization` header).
- Environment: Production (sandbox events are ignored by the function unless
  `REVENUECAT_ALLOW_SANDBOX=1`).

The function reads these event types: `INITIAL_PURCHASE`, `RENEWAL`,
`UNCANCELLATION`, `PRODUCT_CHANGE`, `SUBSCRIPTION_EXTENDED`,
`NON_RENEWING_PURCHASE`, `CANCELLATION` (incl. `CUSTOMER_SUPPORT` →
revoked), `SUBSCRIPTION_PAUSED`, `BILLING_ISSUE`, `EXPIRATION`, `TRANSFER`.
The entitlement identifier in RevenueCat **must be `plus`** (that is the
string the function looks for in `entitlement_ids`).

### 1.5 Checking it works

- Send a test event from the Stripe dashboard (webhook → Send test event):
  the function answers 200 with `{"ok":true,"action":"ignore",…}` because a
  test event has no `metadata.uid`; a row appears in `purchase_events`.
- RevenueCat → webhook → **Send test event**: answers 200 with
  `{"ok":true,"action":"ignore","reason":"test_event"}`.
- A real purchase shows up as a row in `entitlements` with `status =
  'active'` and an `expires_at`; the app shows Plus within a tab switch.

### 1.6 Turning Plus on in the clients

Nothing in the UI changes until the build has `VITE_PLUS=1` (Vercel →
Project → Settings → Environment Variables, Production; and the mobile build
env). Leave it unset until the Stripe account (PR 3) is live.

---

## 2. Gates (PR 2)

No new accounts. One more migration, one more secret, and a redeploy of the
functions the gates changed.

### 2.1 Database

```bash
npx supabase db push --linked </dev/null
```

applies `20261024100000_solo_progress.sql` (the Plus progress-sync table and
its nightly `solo_progress_sweep()` at 04:27 UTC).

### 2.2 The server-side launch switch

The client's `VITE_PLUS=1` has a server twin: the `PLUS_GATES` secret. While
it is unset the narrator and studio functions behave exactly as before Plus
(shared cap, demo only when over budget, studio for admins and the token).
Set both on launch day:

```bash
npx supabase secrets set PLUS_GATES=1 --project-ref rdqdhawlxuclfxpsvdgs </dev/null
```

With it on: a subscriber gets 60 narrator minutes a month (10 per
ElevenLabs/OpenAI session grant, 1 per 6 Claude-narrator calls) and 40 studio
Claude drafts a month (Sonnet only); everyone else gets the narrator demo
only (2 demo calls per endpoint per IP per 30 days, as before) and no studio
drafting. The global narrator cap becomes `NARRATOR_MONTHLY_USD_CAP` + $2 ×
active subscribers.

### 2.3 Redeploy

```bash
npx supabase functions deploy narrator-claude tts agent-auth openai-agent-auth studio-claude studio-schedule studio-insights --project-ref rdqdhawlxuclfxpsvdgs </dev/null
```

(`studio-schedule` and `studio-insights` only pick up the refactored
`studioAllowed`; deploying them keeps the shared module in step.)

### 2.4 Granting yourself the studio without the token

Your own account is in `studio_admins` already, which the gate honours. A
friend who should have the studio without paying gets a `grant` row (§1.1).

## 3. Purchase UI, Stripe, RevenueCat, native sign-in (PR 3)

Everything here is an account, a product or a key only you can create. The
code reads each one from env or a secret and never hardcodes any of them.
Order matters a little: Stripe alone makes the **website** sell Plus; the
store work (3.3–3.6) makes the **apps** sell it and needs an app release.

### 3.1 Stripe (web)

1. **Account.** Crossword Clash has **its own Stripe account** under the
   same login (dashboard → account menu → New account), decided
   2026-10-27: a buyer's card statement, the Checkout page and Stripe's
   receipts all carry the account's name, and the Fable Designer account
   that first hosted the test objects would have put "FABLE DESIGNER" on
   every Plus charge. On the new account set Settings → Business → Public
   details: public business name "Crossword Clash", statement descriptor
   `CROSSWORD CLASH`, support email and the site URL; Branding → the icon
   and the brand colour (`#3B4FD9`); then Activate it (business, bank and
   tax details, yours) before live mode. Business and tax questions
   (merchant of record, which jurisdictions need a registration) are yours;
   Stripe Tax is optional (3.1 step 5). `pnpm stripe:setup` refuses a key
   whose account name and descriptor do not mention Crossword Clash, so the
   public details come first.
2. **Product, prices and webhook.** Put the account's secret key in
   `.env.local` as `STRIPE_SECRET_KEY` (test key first; the live key on
   launch day) and run

   ```bash
   pnpm stripe:setup
   ```

   It creates (or, on a rerun, re-checks) the product "Crossword Clash
   Plus" with the paywall's subtitle as its description and
   `CROSSWORD CLASH PLUS` as its statement descriptor, the two recurring
   prices — **$3.99 / month** and **$24.99 / year**, found again by lookup
   key — and the webhook endpoint of §1.3, and prints the `.env.local`
   lines and the `secrets set` command that follow (`src/lib/stripeSetup.ts`
   holds the definitions; a price whose amount or interval was changed by
   hand stops the run instead of being duplicated). Run it once per mode.
3. **Customer Portal.** The account's default portal configuration has no
   legal links and its "switch plans" list is whatever products the account
   grows; Plus keeps its own configuration, which the `billing-portal`
   function names in each session (`STRIPE_PORTAL_CONFIG`). After step 2
   has put the price ids in `.env.local`:

   ```bash
   pnpm stripe:portal-config
   ```

   creates (or, on a rerun, updates) a configuration named "Crossword Clash
   Plus" with crosswordclash.com's terms and privacy links, a return link to
   `/menu`, invoice history, card updates, cancel at period end with a
   reason, and plan switching limited to the two Plus prices (the definition
   is `src/lib/stripePortalConfig.ts`). It prints the `secrets set
   STRIPE_PORTAL_CONFIG=bpc_…` command to run next. Run it once per mode:
   the test key makes a test configuration, the live key a live one.
4. **Secrets.** The command `pnpm stripe:setup` printed, plus the site URL
   once:

   ```bash
   npx supabase secrets set STRIPE_SECRET_KEY=<sk_…> STRIPE_PRICE_MONTHLY=<price_…> STRIPE_PRICE_ANNUAL=<price_…> STRIPE_WEBHOOK_SECRET=<whsec_…> SITE_URL=https://crosswordclash.com --project-ref rdqdhawlxuclfxpsvdgs </dev/null
   ```

   Key, prices, webhook secret and portal configuration must all be from
   the same mode (test or live). Switching modes on launch day means
   rerunning steps 2–4 with the live key and setting all five secrets
   together.
5. **Stripe Tax (optional, decision 9).** Settings → Tax → turn on and add
   your registrations, then `STRIPE_AUTOMATIC_TAX=1` in the secrets; the
   Checkout session then collects the address and adds tax.
6. **Deploy the two new functions:**

   ```bash
   npx supabase functions deploy create-checkout billing-portal --project-ref rdqdhawlxuclfxpsvdgs </dev/null
   ```

7. **Test with a test card** (4242 4242 4242 4242, any future date): on a
   Vercel preview with `VITE_PLUS=1` (set the variable for the Preview
   environment only; untick "Save my information with Link" at checkout), sign
   in, Account → Crossword Clash Plus → Get Plus yearly → pay → you land back
   on the preview's `/menu?checkout=success` (Checkout returns to the origin
   the purchase started on when it is a preview deployment), the sheet
   reopens as a subscriber, `entitlements` has a `stripe` row. "Manage
   subscription" opens the portal; cancelling there arrives as
   `customer.subscription.updated` (`will_renew` false) and, at period end,
   `…deleted` (`expired`).

### 3.2 Vercel env

Project → Settings → Environment Variables → Production: `VITE_PLUS=1`. Set it
only once 3.1 is done in live mode; everything stays hidden before that.

### 3.3 App Store Connect (iOS)

1. **Paid Apps Agreement** (Account Holder): Business → Agreements → sign,
   then banking and tax forms. Sandbox purchases do not work until it is
   active.
2. **Small Business Program** (15%): developer.apple.com/app-store/small-business-program
   → enrol as Account Holder (eligible under $1M prior-year proceeds).
3. **Subscription group** "Crossword Clash Plus" with two auto-renewable
   subscriptions: product ids `plus_monthly` ($3.99, 1 month) and
   `plus_annual` ($24.99, 1 year); localized display names and descriptions
   (English + Spanish); a review screenshot each (the paywall sheet). Apple
   price equalisation is fine.
4. **App Store Server Notifications**: not needed (RevenueCat polls and
   receives them through its own App Store connection, 3.5).
5. **The first subscription must be submitted with a new app version**
   (1.1.0). Review notes: say that Plus is a subscription, where the paywall
   is (Account → Crossword Clash Plus), that "Restore purchases" is on the
   paywall, and that the Terms/Privacy links are on it. Add Terms of Use
   (EULA) and Privacy Policy URLs to the App Store metadata.
6. **Sign in with Apple capability**: in Xcode, target App → Signing &
   Capabilities → + Capability → Sign in with Apple. Commit the resulting
   `App.entitlements` and the project change. Then in Supabase →
   Authentication → Providers → Apple, add the bundle id
   `com.crosswordclash.app` to the client ids list (comma-separated next to
   the web Services ID); Supabase accepts any listed id as the token
   audience.

### 3.4 Google Play (Android)

1. **Merchant profile**: Play Console → Setup → Payments profile (one-time).
2. **Subscriptions**: Monetize → Subscriptions → create `plus_monthly` and
   `plus_annual` with base plans auto-renewing monthly / yearly at $3.99 /
   $24.99; add English + Spanish listings; activate.
3. **License testers**: Setup → License testing → your Google account(s);
   test renewals are compressed (a month renews every 5 minutes).
4. **Google Sign-In client ids** (for native sign-in): Google Cloud Console →
   the project behind your existing Supabase Google provider → Credentials.
   You need (a) the **Web** client id that Supabase already uses — that is
   `VITE_GOOGLE_WEB_CLIENT_ID`; (b) an **Android** client id for package
   `com.crosswordclash.app` with your upload key's and Play's app-signing
   SHA-1 fingerprints (Play Console → App integrity); (c) an **iOS** client
   id for the bundle id, which is `VITE_GOOGLE_IOS_CLIENT_ID`. In Supabase →
   Providers → Google, list the Android and iOS client ids beside the web
   one ("Authorized Client IDs").
5. **iOS Info.plist URL scheme for Google**: add a `CFBundleURLTypes` entry
   whose scheme is the iOS client id reversed
   (`com.googleusercontent.apps.<id>`); the Capgo plugin's README shows the
   exact plist snippet. Nothing is needed in the Android manifest.

### 3.5 RevenueCat

1. **Project** "Crossword Clash" with two apps: App Store (bundle id, the
   App Store Connect API key or shared secret as RevenueCat asks) and Play
   Store (package name + the Play service-account JSON RevenueCat asks for).
2. **Products**: import `plus_monthly` and `plus_annual` from both stores.
3. **Entitlement** with identifier exactly **`plus`**, attached to all four
   products.
4. **Offering** "default" (current) with packages **`$rc_annual`** →
   `plus_annual` and **`$rc_monthly`** → `plus_monthly` (the app looks the
   packages up by these identifiers).
5. **Webhook** as in §1.4. **Secret API key** → `REVENUECAT_SECRET_KEY`.
6. **Public SDK keys** (one per app, `appl_…` and `goog_…`) go into the
   mobile build's env: `VITE_REVENUECAT_IOS_KEY`, `VITE_REVENUECAT_ANDROID_KEY`
   (in `.env.local` on the machine that runs `pnpm mobile:sync`; they are
   public by design).
7. **Sandbox**: RevenueCat shows sandbox purchases in its dashboard; the
   webhook ignores them in production (§1.2). To see rows appear during
   testing, point the webhook at a staging project with
   `REVENUECAT_ALLOW_SANDBOX=1`, or trust the dashboard + the in-app
   "Restore purchases" path (which reads RevenueCat directly).

### 3.6 The app release (1.1.0)

With 3.3–3.5 done and the four `VITE_…` values in the mobile env:

```bash
pnpm mobile:sync
```

bumps nothing by itself; raise `MARKETING_VERSION` / `versionName` to 1.1.0
and the build numbers, add the Sign in with Apple capability (3.3.6) and the
Google URL scheme (3.4.5) in Xcode, build, and submit to both stores with the
subscriptions attached (Apple requires the first subscription to ride the
version's submission). `VITE_PLUS=1` in the mobile env turns the paywall on
in the apps.

### 3.7 Checklist before flipping the switches

**Status 2026-10-27: both switches are on.** `PLUS_GATES=1` is set, `VITE_PLUS=1`
is on Vercel Production (and Preview), and production was redeployed. The
same day community puzzles went live (`VITE_COMMUNITY=1` on both
environments). What is still open is marked below.

- [x] `entitlements` migration and `solo_progress` migration applied (§1.1, §2.1)
- [x] All functions deployed: `verify-purchase --no-verify-jwt`, `delete-account`, `create-checkout`, `billing-portal`, `narrator-claude`, `tts`, `agent-auth`, `openai-agent-auth`, `studio-claude`, `studio-schedule`, `studio-insights`
- [x] Secrets: `STRIPE_SECRET_KEY` (live), `STRIPE_WEBHOOK_SECRET` (live endpoint), `STRIPE_PRICE_MONTHLY`, `STRIPE_PRICE_ANNUAL`, `STRIPE_PORTAL_CONFIG` (live, from `pnpm stripe:portal-config`), `SITE_URL`, `REVENUECAT_WEBHOOK_SECRET`, `PLUS_GATES=1`. Still unset: `REVENUECAT_SECRET_KEY` (apps only, with §3.5)
- [x] Vercel `VITE_PLUS=1` (production), then a production redeploy: an env change needs a new build
- [ ] Stripe live account: a support email under Public details (receipts and the portal show it); Stripe Tax registration added and `STRIPE_AUTOMATIC_TAX=1` set, or tax deliberately left off (§3.1 step 5)
- [x] DMCA: registration DMCA-1084362, active 2026-10-27, renew by 2029-10-27 (service provider Fable Designer LLC; alternate names Crossword Clash, crosswordclash.com, Fable Designer, Fable Reader, fabledesigner.com); the same name, postal address and phone are in `DMCA_AGENT` in `src/screens/legal/legalContent.ts`, so `/copyright` names the agent. Plus opens the studio to subscribers and rooms already host players' puzzles, so the safe harbour had to be in place first.
- [x] Community puzzles: migration `20261028000000_community_puzzles.sql` applied; `studio-moderate`, `report-alert --no-verify-jwt` and `delete-account` deployed; `REPORT_ALERT_SECRET`, `REPORT_ALERT_TO`, `REPORT_ALERT_FROM` set; the `puzzle_reports` INSERT hook is a pg_net trigger (`public.report_alert_webhook()`, created by hand with the secret in its header; re-create it if the secret rotates); `VITE_COMMUNITY=1` on Production and Preview
- [x] `RESEND_API_KEY`: a send-only key from Crossword Clash's **own Resend account** (`andrew.m.archer+crosswordclash@gmail.com`, one account per product like Space Race and MTG), sender `alerts@crosswordclash.com`
- [x] Resend domain `crosswordclash.com` verified 2026-10-27 (DKIM TXT `resend._domainkey` plus CNAMEs `rsend` and `send` → `*.forge.rmta.net`, added at Squarespace, which holds the zone since Google Domains closed); a test report fired the trigger → `report-alert` → Resend with `{"ok":true}`
- [ ] One real test purchase on the web with a real card, refunded in Stripe afterwards

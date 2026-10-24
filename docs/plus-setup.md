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

Stripe Dashboard → Developers → Webhooks → **Add endpoint**:

- Endpoint URL: `https://rdqdhawlxuclfxpsvdgs.supabase.co/functions/v1/verify-purchase/stripe`
- Events to send: `checkout.session.completed`,
  `customer.subscription.created`, `customer.subscription.updated`,
  `customer.subscription.deleted`. (Invoice events are not needed: Stripe
  moves the subscription to `past_due` and back itself and sends
  `customer.subscription.updated` each time.)
- After saving, reveal the **Signing secret** and set it as
  `STRIPE_WEBHOOK_SECRET`.

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

_To be written with PR 2: the studio's per-user allowance, the narrator
minute allowance and the archive window need no new accounts, only the
redeploy of the functions that PR names._

## 3. Purchase UI, Stripe, RevenueCat, native sign-in (PR 3)

_To be written with PR 3: Stripe products and prices, Checkout and Customer
Portal settings, Stripe Tax; App Store Connect subscription group and
products, Paid Apps Agreement, Small Business Program; Google Play merchant
profile and subscriptions; RevenueCat project, apps and offering; Apple and
Google client ids for native sign-in in Supabase._

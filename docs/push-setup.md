# Push notifications: what Andrew sets up by hand

Everything the push code reads from a secret or a dashboard, and every step
only the account owner can do. The code never holds a key. Decisions behind
each step are in `docs/friends-spec.md` §3.3–3.4 and §9 (Q5–Q8 accepted
2026-10-31). Until these steps are done the feature stays off: the client
switch `VITE_PUSH` is unset, so nothing registers a token and nothing asks the
OS for permission.

Order: the database, then the keys, then the function and its two callers,
then the store forms, then the switch.

---

## 1. Database

Apply the migration (`device_tokens`, `notification_preferences`, `push_log`,
`push_reminder_targets()`, `push_sweep()` on its own cron job at 05:07 UTC):

```bash
npx supabase db push --dry-run --linked </dev/null
```

```bash
npx supabase db push --linked </dev/null
```

Nothing runs at apply time.

## 2. Apple: the APNs key and the capability

1. In the developer account, Certificates, Identifiers & Profiles → Keys →
   add a key with **Apple Push Notifications service (APNs)**, team-scoped,
   **Production**. Download the `.p8` once (Apple never shows it again) and
   note the 10-character **Key ID**. The Team ID is on the membership page.
   This is a different key from the `ASC_API_*` key the TestFlight script
   uses.
2. Add the **Push Notifications** capability to the App ID
   `com.crosswordclash.app` (the Associated Domains capability was added
   through the ASC API on 2026-10-30; the same `bundleIds/{id}/capabilities`
   call with `PUSH_NOTIFICATIONS` works, or tick it in the portal). The
   repo's `App.entitlements` already carries `aps-environment: production`;
   Xcode's automatic signing picks the capability up on the next build. A
   build made before the capability exists fails to register (the plugin's
   `registrationError`), nothing worse.

## 3. Google: the Firebase project and the service account

1. Create a Firebase project (any name) and add an Android app with package
   name `com.crosswordclash.app`. Download `google-services.json` into
   `android/app/` and commit it (it holds no secret; the Android template's
   `build.gradle` applies the Google services plugin only when the file
   exists, so the Android build is unchanged until then).
2. Project settings → Cloud Messaging: make sure the **Firebase Cloud
   Messaging API (V1)** is enabled (the legacy API is gone).
3. Project settings → Service accounts → **Generate new private key**. The
   JSON file is the `FCM_SERVICE_ACCOUNT` secret, whole.

## 4. Secrets and the function

```bash
npx supabase secrets set PUSH_SENDER_SECRET="$(openssl rand -hex 32)" APNS_KEY_ID=<key id> APNS_TEAM_ID=<team id> APNS_BUNDLE_ID=com.crosswordclash.app --project-ref rdqdhawlxuclfxpsvdgs </dev/null
```

```bash
npx supabase secrets set APNS_P8="$(cat AuthKey_<key id>.p8)" FCM_SERVICE_ACCOUNT="$(cat firebase-service-account.json)" --project-ref rdqdhawlxuclfxpsvdgs </dev/null
```

`APNS_SANDBOX=1` only for a development (Xcode-run) build; TestFlight and the
App Store use production APNs. `SITE_URL` defaults to the live site (the
reminder reads the day's theme from the daily feed there).

```bash
npx supabase functions deploy send-push --no-verify-jwt --project-ref rdqdhawlxuclfxpsvdgs </dev/null
```

`--no-verify-jwt` because its callers carry no user JWT; the function refuses
any request without the `x-push-secret` header.

Smoke test, once a device has registered (turn any switch on in the app
while signed in, then find your user id in `device_tokens`):

```bash
curl -s -X POST "https://rdqdhawlxuclfxpsvdgs.supabase.co/functions/v1/send-push" -H "x-push-secret: <PUSH_SENDER_SECRET>" -H "content-type: application/json" -d '{"kind":"test","userId":"<uuid>"}'
```

The answer counts `sent` / `failed` / `unregistered`; a `failed` with
`apns_not_configured` or `fcm_not_configured` names the missing secret.

## 5. The two callers

**The hourly reminder** (pg_cron → `net.http_post`, in the SQL editor; the
secret cannot live in a committed migration, which is why this is by hand):

```sql
select cron.schedule('push-daily-reminder', '3 * * * *', $$
  select net.http_post(
    url := 'https://rdqdhawlxuclfxpsvdgs.supabase.co/functions/v1/send-push',
    headers := '{"content-type":"application/json","x-push-secret":"<PUSH_SENDER_SECRET>"}'::jsonb,
    body := '{"kind":"daily_reminder"}'::jsonb
  );
$$);
```

Three minutes past each hour, so a player whose reminder hour is 8 gets it
at 08:03 local; `push_reminder_targets()` does the time-zone arithmetic.
`pg_net` is enabled on every hosted project (the report-alert webhook uses
it).

**Room invites** (Dashboard → Database → Webhooks → Create): table
`room_invites`, event **Insert**, type **Supabase Edge Function**,
function `send-push`, HTTP header `x-push-secret: <PUSH_SENDER_SECRET>`.
The function reads the row, checks the room is still `waiting`, applies the
invitee's switches and quiet hours, and stamps `pushed_at` when something
was sent.

## 6. Store forms

- **App Store Connect → App Privacy**: add *Identifiers → Device ID*
  (the push token), collected, linked to the user, App Functionality, not
  used for tracking. `ios/App/App/PrivacyInfo.xcprivacy` already declares it.
- **Play Console → Data safety**: add *Device or other IDs* (the FCM token
  and the Firebase installation id), collected, not shared (Google is the
  service provider), required for notifications, App functionality. The
  **Notification permission** needs no declaration.
- Both READMEs under `docs/app-store/` and `docs/play-store/` carry the rows.

## 7. The switch and the builds

Set `VITE_PUSH=1` in `.env.local` (the app builds read it; add it to
`scripts/testflight.sh`'s required switches once live) and on Vercel (the
website never registers a token, but the switch keeps the two builds'
feature sets equal). Then a new iOS build and Android release carry the
plugin, the entitlement, `POST_NOTIFICATIONS` and the status-bar icon.

What the player sees: nothing until they turn a switch on, on the account
page's Notifications card or the completion modal's "Remind me tomorrow"
after a daily. The OS prompt appears then, once; a denial leaves every
switch off with a line pointing at the phone's Settings.

## 8. Checks after the first day

```sql
select outcome, kind, count(*) from push_log where sent_at > now() - interval '1 day' group by 1, 2 order by 1, 2;
```

`unregistered` rows are devices that uninstalled (their token rows are
deleted as they are seen); `failed` with a reason in the function logs is
the thing to read; `quiet` and `opted_out` are the player's own settings at
work.

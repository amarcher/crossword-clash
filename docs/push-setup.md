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

Done 2026-10-31 (the key through the portal in the in-app browser, the
capability through the ASC API):

1. Key **Crossword Clash APNs**, Key ID `XCYXKS23C7`, team `J39B2498YF`
   (Andrew Archer, the personal team — the portal opens on Fable Designer
   LLC by default, and a key made there would be refused for this app),
   APNs, team-scoped, environment **Sandbox & Production** (frozen at
   creation; the one key serves TestFlight, the App Store and an Xcode
   development build, so `APNS_SANDBOX=1` needs no second key). The `.p8` is
   at `~/.appstoreconnect/private_keys/AuthKey_XCYXKS23C7.p8` (mode 600,
   beside the ASC API keys; Apple never serves it again). It is a different
   key from the `ASC_API_*` key the TestFlight script uses. Verified by
   sending to a bogus device token on both `api.push.apple.com` and
   `api.sandbox.push.apple.com`: `400 BadDeviceToken` means the provider
   token was accepted (a refused key answers `403 InvalidProviderToken`).
2. The **Push Notifications** capability was added to the App ID
   `com.crosswordclash.app` (bundle id resource `75MZZ652JR`) through the
   ASC API, the same `bundleIds/{id}/capabilities` call that added
   Associated Domains on 2026-10-30. The repo's `App.entitlements` already
   carries `aps-environment: production`; Xcode's automatic signing picks
   the capability up on the next build. A build made before the capability
   exists fails to register (the plugin's `registrationError`), nothing
   worse.
3. **The capability change invalidated the manual App Store profile** the
   TestFlight script signs with ("Crossword Clash App Store (API)", see
   `scripts/testflight.sh`). Recreated through the ASC API on 2026-10-31:
   DELETE the `INVALID` profile, POST a new `IOS_APP_STORE` profile with the
   same name, bundle id `75MZZ652JR` and certificate `Z7FXVDNWJ8`, install
   its `profileContent` under `~/Library/MobileDevice/Provisioning Profiles`
   (new uuid `e9d967c2-f6ba-42fc-885c-e7bb3b735ec6`, the old file removed);
   `security cms -D` on it shows `aps-environment: production` and
   associated domains. Do the same after any later App ID capability change.

## 3. Google: the Firebase project and the service account

Done 2026-10-31 from the CLI, no console needed: Firebase was attached to
the **existing** `crossword-clash` Cloud project (number 947795730277, the
one the Play publisher service account lives in) rather than a new one, so
Play and push share a project.

1. `gcloud services enable firebase.googleapis.com fcm.googleapis.com`, then
   `POST https://firebase.googleapis.com/v1beta1/projects/crossword-clash:addFirebase`
   (a `gcloud auth print-access-token` bearer plus
   `x-goog-user-project: crossword-clash`; the API refuses user credentials
   without a quota project) and `POST …/androidApps` with package name
   `com.crosswordclash.app`. `GET …/androidApps/{appId}/config` returns
   `google-services.json` base64-encoded; it is committed at
   `android/app/google-services.json` (it holds no secret; the Android
   template's `build.gradle` applies the Google services plugin only when the
   file exists).
2. Firebase Cloud Messaging API (V1) is `fcm.googleapis.com`, enabled above.
3. The sender is a dedicated service account,
   `fcm-sender@crossword-clash.iam.gserviceaccount.com`, with
   `roles/firebasecloudmessaging.admin` (the role that carries
   `cloudmessaging.messages.create`; the Firebase console's own
   `firebase-adminsdk-…` account is only created when the console is
   opened, so the API path has to make its own). Its key is at
   `~/.config/crossword-clash/fcm-service-account.json` (mode 600, beside
   the Play publisher key, never in the repo) and is the
   `FCM_SERVICE_ACCOUNT` secret, whole.

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
All six secrets were set on 2026-10-31 and the function answered the test
route for a user with no device (`no_token: 1`); the credentials themselves
were proven against APNs and FCM with bogus device tokens (§2, §3), so the
first real device only exercises registration.

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

**Friend requests** (added 2026-11-02; the same shape as room invites, by
SQL so the trigger can carry the secret): `friendships_push()` is a copy of
`room_invites_push()` for the `friendships` table that fires only for a row
whose `status` is `pending` (an accept updates the row, so it never inserts;
a request answered `accepted` on the spot, because the other side had asked
first, is an update too). `send-push` notifies the `recipient_id` with
"@name wants to be friends", landing on `/race/friends`, under their
`friend_requests` switch and quiet hours. Install it with
`docs/push-setup-friendships.sql`, which reads the `x-push-secret` header
out of `room_invites_push`'s own definition inside one `DO` block, so the
secret never leaves the database, then creates the function and the
trigger (idempotent). Deploy the function first:

```sh
npx supabase functions deploy send-push --no-verify-jwt --project-ref rdqdhawlxuclfxpsvdgs
```

```sh
npx supabase db query --linked -f docs/push-setup-friendships.sql
```

Both ran on 2026-11-02 (`friendships_push` verified with the header in
place). **Two CLI gotchas met that night:** a freshly fetched `npx supabase`
binary is not trusted by the keychain item that holds the access token, so
every command hangs silently on a keychain dialog in a headless shell; pass
the token through `SUPABASE_ACCESS_TOKEN` instead (`security
find-generic-password -s "Supabase CLI" -w`, a `go-keyring-base64:`-prefixed
base64 value). And current CLIs refuse a production mutation from an agent
shell without `--yes` (`HostedMutationConsentRequiredError`); `--remote=<ref>`
replaces the deprecated `--project-ref`.

The client side is `sendFriendRequest` nudging the recipient's Realtime
channel (so an open Race friends screen refreshes at once) and the
`appLinkTarget` route for `/race/friends`, so a tap on the notification
opens the requests.

**Room rendezvous** (phase f, docs/friends-spec.md §3.7; the same trigger
shape, two more files). First apply the migration
(`20261103000000_room_rendezvous.sql`: `room_invites.response`,
`room_nudges`, the two RPCs, the two new `push_log` kinds) and deploy the
function, then install the triggers:

```sh
npx supabase db push --linked </dev/null
```

```sh
npx supabase functions deploy send-push --no-verify-jwt --project-ref rdqdhawlxuclfxpsvdgs
```

```sh
npx supabase db query --linked -f docs/push-setup-players.sql
```

```sh
npx supabase db query --linked -f docs/push-setup-nudges.sql
```

- `players_push()` fires on a `players` INSERT (a first join; a rejoin
  updates the row) when the game is still `waiting`, the host is not the
  joiner and the host has a profile, and posts
  `{ kind: "room_joined", gameId, joinerUserId }`. `send-push` re-reads the
  room and the joiner's **username** (never the typed display name) and
  sends "@alicia joined your room" (or "A player joined your room") to the
  host under their `room_invites` switch, collapsing with the room's invite
  (`room-<game>`), landing on `/?join=CODE`.
- `room_nudges_push()` fires on every `room_nudges` INSERT (the row is
  written only by `nudge_host()`, which already applied the 3-minute
  cooldown and the block rule) and posts the webhook body shape;
  `send-push` sends "@alicia is waiting in your room" the same way.

Check both with `select tgname from pg_trigger where tgname in
('players_push', 'room_nudges_push');` and, after a test join, the
`room_joined` / `room_nudge` rows in `push_log` (§8).

## 6. Store forms

- **App Store Connect → App Privacy**: *Identifiers → Device ID* (the push
  token), collected, linked to the user, App Functionality, not used for
  tracking — published 2026-10-31. `ios/App/App/PrivacyInfo.xcprivacy`
  declares the same.
- **Play Console → Data safety**: *Device or other IDs* (the FCM token and
  the Firebase installation id), collected, not shared (Google is the
  service provider), not ephemeral, required, App functionality — submitted
  for review 2026-10-31 (reviews take up to 7 days; the row shows "Changes
  in review" on Publishing overview meanwhile). The **Notification
  permission** needs no declaration.
- Both READMEs under `docs/app-store/` and `docs/play-store/` carry the rows.

## 7. The switch and the builds

Set `VITE_PUSH=1` in `.env.local` (done 2026-10-31 together with
`VITE_FRIENDS=1`; both are in `scripts/testflight.sh`'s required switches)
and on Vercel (done 2026-10-31 for Production and Preview, like `VITE_PLUS`
and `VITE_COMMUNITY`; the website never registers a token, but the switch
keeps the two builds' feature sets equal). Then a new iOS build and Android release carry the
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

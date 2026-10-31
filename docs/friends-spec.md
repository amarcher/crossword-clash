# Friends, direct challenges and room invites by push

Written 2026-10-31 on `main` (dfe9b4d). Spec only: no application code
changes. Every claim about the current code cites a file; every store rule
names the page it was read from and the date (all policy pages were read on
2026-10-31; the list is in "Sources" at the end). Nothing here was run
against production data.

Context: joining a race is the painful step. The host must get a six-letter
code, a QR code or an invite link in front of the other person, who must be
looking at a second screen at the same moment. PR #181 (2026-10-30) made the
links open the installed app instead of the browser; it did not change who
has to be where. Andrew's idea of 2026-10-31: once people have accounts, let
them import contacts to find friends already on the app, challenge friends
directly, and have the app suggest push-notifying friends when a room opens.
The main session's reply, which Andrew accepted ("I do want that, sounds
perfect"): contact import is the most policy-sensitive permission on both
stores and should come last; matching must be on hashed identifiers with
privacy-policy and store-form changes; push is new infrastructure and should
first carry something simple; a friends list from usernames and "people you
have raced", with "Challenge a friend" through the share sheet, gets most of
the win with no new permission. This document is that plan.

Decisions for Andrew are the numbered list in §9; the decision log is §10.

---

## 0. What exists today (the code the spec builds on)

| Area | Today | Cited |
|---|---|---|
| Menu entry points | A "Race friends" section (`menu.friendsHeading`) with three rows: Start a game → `/host-game/name`, Join with a code → `/join`, TV mode → `/host`; mounted but disabled until auth has a user | `src/screens/MenuScreen.tsx:268-296` |
| Getting into a room | The lobby shows the code (tap to copy), a **Share invite link** button (`navigator.share({ url })` with `buildRaceInviteUrl(shareOrigin(), { code })`, else clipboard) and a QR code of `${shareOrigin()}/?join=CODE`. The invite link is `/share?t=race&code=…`, which `api/share.ts` unfurls into a card and redirects to `/?join=CODE`. `/join` is a code field (focused on arrival) plus a name field | `src/components/GameLobby/GameLobby.tsx:52-74,150-212`; `src/lib/shareLinks.ts:35-41`; `src/components/GameLobby/JoinGame.tsx` |
| Links into the apps (PR #181) | iOS universal links and Android App Links claim `/?join=CODE`, `/share?t=race&code=`, `/join`, `/daily/:day/:slot` and `/puzzles/*`; `appLinkTarget(url)` maps both invite forms to `/join?join=CODE`; `startAppLinks` listens through `@capacitor/app`. Needs iOS build 25 / Android 10 | `src/lib/appLinks.ts:26-55`; `public/.well-known/*`; CLAUDE.md "Links into the apps" |
| Who is in a room | `players (game_id, user_id, display_name, color, score)`, `UNIQUE (game_id, user_id)`; `games.host_user_id` (the creator, including a TV host who is no player); `games.short_code` is the room code. Rooms are presence-driven; nothing persists who raced whom beyond these rows, and finished games are deleted after 90 days | `supabase/migrations/20260223000000_initial_schema.sql:28-36`; `20260225100000`; `20260427000001_games_host_user_id.sql`; `20261023000000_retention.sql` (`finished_game_ttl`) |
| Accounts | Optional Apple/Google sign-in linked to the anonymous user; `profiles.username` (3–20 chars, **public read**, owner-only writes, non-anonymous JWT); `accountsAvailable()` is true on the web and, since native sign-in, in the apps; `openAccount({ placement })` opens the sheet; `isAccount(user)` is the "real account" test | `src/lib/account.ts:25-55,165-214`; `src/contexts/AccountContext.tsx:39-50,147-160`; `supabase/migrations/20261017100000_profiles.sql:6-50` |
| Deleting an account | `delete-account` cancels billing, deletes `play_sessions`, `narrator_sessions`, `daily_results`, `players`, nulls `games.host_user_id`, then deletes the auth user; every other table must reference `auth.users ON DELETE CASCADE` (or `profiles`, which does) | `supabase/functions/delete-account/index.ts:24,61-80` |
| Retention | `retention_sweep()` (nightly 04:17 UTC) with every window a named constant: waiting rooms closed after 12 h, active after 24 h, finished games deleted after 90 days, idle anonymous users with no owned rows after 30 days, and so on; `retentionMigration.test.ts` reads the newest definition | `supabase/migrations/20261023000000_retention.sql:70-180` |
| Push and contacts | **None.** The only Android permission is `INTERNET`; `Info.plist` has no usage strings; `App.entitlements` has `applinks:` only; `PrivacyInfo.xcprivacy` declares User ID and Gameplay Content, not linked, no tracking; Capacitor plugins: app, filesystem, share, keep-awake, app-update, social-login, RevenueCat | `android/app/src/main/AndroidManifest.xml:61`; `ios/App/App/PrivacyInfo.xcprivacy`; `package.json:39-52` |
| Targets | iOS deployment 15.0; Android `minSdk 24`, `targetSdk 36` (so the Android 13 notification prompt is under the app's control, §4.2) | `ios/App/App.xcodeproj/project.pbxproj:254`; `android/variables.gradle:2-4` |
| Legal text | Privacy: "Accounts (optional)", "Information stored on our servers (Supabase)", "Retention and your choices"; terms: "Reports, removal and blocking" (hide an author, 24-hour review). en + es, `LEGAL_LAST_UPDATED` | `src/screens/legal/legalContent.ts:18,67,74,148,283` |
| Store forms | App Store: App Privacy "User ID" + "Gameplay Content", App Functionality, not linked. Play: Data safety User IDs, App interactions, Other user-generated content, Other actions; collected, not shared | `docs/app-store/README.md:46-50`; `docs/play-store/README.md:100-105,161-165` |
| Analytics | GA4 `track(event, params)` with a typed vocabulary (`account_sign_in_started`, `puzzle_reported`, `app_update_shown`, …); web only | `src/lib/analytics.ts:27-95` |
| Name hygiene | `isObjectionableName` / `displayableName` screen display names on write and read | `src/lib/nameFilter.ts` |

---

## 1. Problem statement: the join friction today

A race needs two people in the same room within minutes. Every way in starts
with the host producing a token (code, QR or link) and ends with the guest
consuming it, and each of the four journeys needs a second screen, a second
person, or both:

1. **Two phones in one room.** The host opens the lobby and turns the phone
   round; the guest scans the QR with the camera app. Since PR #181 the scan
   opens the app at `/join?join=CODE` instead of Safari, which removed the
   "I'm on the website now, where's my app" step. Still needed: both people
   present, the guest knowing to use the camera, the guest having the app
   installed (the web fallback works but lands them in the browser).
2. **A friend elsewhere.** The host taps Share invite link, picks Messages or
   WhatsApp, picks the person, sends. The guest taps the link and, with the
   app installed, lands in the lobby (PR #181); without it, on the web. Still
   needed: the host must know where to reach the friend, the friend must be
   looking at that app, and the link is only good while the room is
   `waiting` (closed after 12 h by the sweep, `waiting_room_ttl`). The host
   has no idea whether the friend saw it until presence shows them.
3. **Reading the code out.** Across a table or a video call the host reads
   six letters and the guest types them on `/join`. Prone to O/0 and I/1
   mistakes; the field was given focus-on-arrival for this (PR #174).
4. **The TV.** `/host` puts the code and QR on a shared screen; players scan
   it. Same as journey 1 with the TV as the second screen.

What none of them has: a notion inside the app of *who* to invite, a way for
the invited person to be told (rather than to be watching the right app at
the right second), and a way to challenge someone who is not free right now.
The only asynchronous challenge is the completion modal's "Beat my time"
link (`/daily/2026-10-20/mini?beat=102&by=Archer`, CLAUDE.md "Sharing a
result"), and it too goes through the share sheet.

Measured only by inference: `mode_selected { mode: "host" }` versus
`game_started` and the 51 % of rooms that were never closed before the
retention work (`docs/scalability-audit.md`) say many lobbies are opened and
abandoned before a second player arrives. Phase (a) adds the events that
would measure this directly (§7).

---

## 2. Goals and non-goals

**Goals**

- A player with an account can keep a list of friends, see which of them
  they have raced, and start a race with one of them in two taps.
- An invited friend learns about the room without watching a messaging app:
  in the app if it is open, by push if it is not, and the tap lands in the
  lobby.
- Every phase ships on its own, is useful on its own, and adds the smallest
  permission it can; the two permissions (notifications, contacts) are asked
  for in context and never required.
- Everything a friend can send is templated: there is no free-text message
  between players anywhere in this spec.
- The server never holds a raw contact list, and a user who deletes their
  account leaves no row behind.

**Non-goals**

- Chat, direct messages, comments, reactions or any free-text channel.
- Presence ("Alicia is online"), activity feeds or a public friends count.
- Web push: Safari needs the site installed to the Home Screen and the apps
  are where rooms are joined; the website keeps the share sheet and link.
- Inviting people who are *not* on the app from their contacts (SMS or
  email invites). Apple 5.1.2(v) allows it only one person at a time with a
  preview of the message; the share sheet already does this better.
- Leagues (`docs/leagues-spec.md`) and the daily board stay as they are;
  friends are an input they can use later ("friends on today's board").

---

## 3. Phases

Each phase is one PR behind its own switch (`VITE_FRIENDS=1`, `VITE_PUSH=1`,
`VITE_CONTACTS=1`; the `plusEnabled()` / `communityEnabled()` pattern), so a
phase can merge dark and flip when its store forms and legal text are live.

### 3.1 Phase (a): a friends list with no new permission

**Who.** Signed-in accounts with a username (`isAccount(user)` and a
`profiles` row), the community-publishing rule. Anonymous visitors see the
sign-in pitch (`openAccount({ placement: "friends" })`). In the apps this
works since native sign-in; nothing is Plus-gated.

**Where.** On the **Race friends** screen (`/race`, §3.6), which replaces the
menu's Start a game / Join with a code rows and is where the friends list,
the invites inbox, the code field and Start a room all live; the account
menu links it too. The lobby gains an **Invite friends** list (§3.2) and the
completion modal's "Race a friend live" row leads here.

**Adding a friend, three ways.**

1. **By username.** A search field over `profiles.username` (public read;
   exact match and prefix, ≥ 3 characters, 10 results, debounced like
   `UsernamePicker`'s availability check). Tapping a result sends a request.
2. **People you have raced.** A section listing accounts that shared a room
   with the viewer: the other `players` rows of every `games` row the viewer
   was in (or hosted), joined to `profiles`, newest game first. This is a
   SECURITY INVOKER RPC `recent_opponents()` over `players` and `games`
   (both publicly readable; the RPC exists to do the join server-side). The
   window is the retention window, 90 days, because the game rows are the
   record; a `race_history` table is the upgrade if the list proves useful
   (§9 Q3). Anonymous co-players have no username and are not listed.
3. **From a room.** In the lobby and on the completion modal, each
   signed-in player who is not yet a friend has an **Add friend** chip.

**Requests.** `send_friend_request(username)` creates a `friendships` row
with `status = 'pending'`; the recipient sees it under "Requests" with
Accept / Decline (and Block, §8). Accepting sets `accepted`; declining
deletes the row and the requester sees nothing (their list shows "Requested"
until then; a declined request can be re-sent after 7 days, enforced by the
RPC). A request to someone who has already requested you accepts at once.
Pending requests expire after 30 days (`friend_request_ttl`, §5.4).

**What a friend row shows.** Username, "Raced 4 times · last Tuesday" from
the same `recent_opponents()` data, and a **Race** button that starts the
host flow (`/host-game/name`) with the friend pre-selected for the lobby's
invite list. Nothing else: no streaks, times or activity (non-goal).

**In the apps and on phones.** The screen is a `PageShell` list at phone
width with 44 px rows and 16 px inputs (the `mobile-web` rules the studio
and community screens follow); selected state by tint and weight, never a
left-border bar.

### 3.2 Phase (b): "Challenge a friend"

Two deliveries of the same invite; the first exists today.

**Through the share sheet (today).** The lobby's Share invite link stays the
primary action for anyone not on the friends list. Nothing changes except
the button's label when friends exist ("Share link" beside the list).

**In-app.** The lobby shows **Invite friends**: the viewer's friends, each
with an Invite button (or "Invited ✓"). Tapping calls
`invite_to_room(game_id, friend_id)`, which inserts a `room_invites` row
after checking the caller is the host or a player of a `waiting` room, the
two are friends, neither has blocked the other, and the limits hold (§8).
Delivery before push exists:

- If the friend has the app or site open, a per-user Realtime Broadcast
  channel (`user:<uid>`, subscribed by `AccountProvider` while signed in,
  the same `supabase.channel` the rooms use) carries `room_invite` and an
  **Invite banner** appears on any screen outside a game: "Archer invited
  you to race · *Birds of a feather* · Join". Join navigates to
  `/join?join=CODE` with the viewer's username as the name, exactly what the
  app link does. Dismiss marks `seen_at`.
- If not, the invite waits at the top of the Race friends screen (§3.6)
  and as a badge on its menu row, read on sign-in and on `visibilitychange`; an invite to a
  room that is no longer `waiting` is shown struck through ("Started without
  you · Ask for a rematch") and deleted by the sweep (§5.4).

The names in the banner are usernames from `profiles`, never the free-text
display name, and the puzzle title is the room's `puzzles.title`. There is no
message field.

**Async challenge, the small addition.** The completion modal's daily
"Beat my time" link gets a second target when the finisher has friends:
"Send to a friend" writes a `room_invites` row with `kind = 'beat'` and the
daily link instead of a room (`link` column). The friend's banner reads
"Archer solved today's mini in 1:42 · Beat it". Same table, same delivery,
same push later; no new screen.

### 3.3 Phase (c): push notification infrastructure, first used for a daily reminder

**Why a reminder first.** Push is a new vendor on Android (Firebase), a new
capability and key on iOS, a sender, a token table and two store-form
changes. Its first payload should be something whose failure costs nothing:
a daily reminder the player asked for. Room invites (phase d) ride on the
proven pipe.

**Client.** `@capacitor/push-notifications` (the Capacitor 8 line; the
plugin page gives the APNs token on iOS and the FCM token on Android;
`register()` does not prompt, `requestPermissions()` does; Android 13+
needs `checkPermissions()` / `requestPermissions()` before anything
arrives). Wrapped in `src/lib/push.ts` the way `appUpdate.ts` wraps its
plugin: dynamic import behind `MODE === "mobile"`, module namespace in the
promise, never the plugin object (`nativePluginProxy.test.ts` and
`nativeBundle.test.ts` extended). On iOS the Push Notifications capability
goes on the App ID (the ASC API, as Associated Domains was added on
2026-10-30) and `aps-environment` into `App.entitlements`; an APNs
authentication key (`.p8`, team-scoped, Production) is created in the
developer account, distinct from the `ASC_API_*` key. On Android, a Firebase
project with `google-services.json` in `android/app/`; the plugin brings the
messaging SDK (`firebaseMessagingVersion` 25.0.1 by default), and a white
status-bar icon goes in the manifest.

**Permission timing (the rule from both platforms).** Apple: "Make the
request in a context that helps people understand why your app needs
authorization … rather than automatically requesting authorization on first
launch"; a denial is final ("Subsequent authorization requests don't prompt
the person"), so the app must send them to Settings. Android 13 (API 33)
made `POST_NOTIFICATIONS` a runtime permission and, because we target 36, the
app chooses the moment; the guidance is the same ("let them familiarize
themselves with your app"). So: **the prompt is only ever shown after the
player turns a notification switch on** (the daily reminder in Settings or
on the completion modal after a daily, "Remind me tomorrow"; a room-invite
switch in phase d), preceded by one in-app sentence saying what will arrive.
Never on launch, never from the menu. Provisional authorization (iOS's
quiet trial delivery) is **not** used: a room invite that lands silently in
Notification Center is a missed race, and the reminder is explicitly
requested anyway (§9 Q6).

**The reminder itself.** `notification_preferences.daily_reminder` (default
false), `daily_reminder_hour` (local hour, default 8) and `timezone`
(IANA, from the device). A pg_cron job every hour calls `send-push` with
`{ kind: "daily_reminder", hour }`; the function selects users whose local
hour matches, who have the switch on, and who have not finished today's
mini (`solves` for accounts; for anonymous app users, the reminder is sent
regardless, since their finishes are local). Copy: "Today's mini is ready ·
*Theme* · 5×5" with the day's theme from the feed; the tap opens `/menu`.
One per day per user, `apns-collapse-id` / FCM `collapse_key`
`daily-<day>`. **Anonymous app users may turn the reminder on** (§9 Q5):
most app users are anonymous, the reminder needs no identity, and the
retention sweep's idle-anonymous rule retires their token with the user
after 30 days without opening the app, which is the right outcome.

**Sender.** One edge function, `send-push` (service role; deployed
`--no-verify-jwt` for the cron and webhook callers, each request carrying a
`PUSH_SENDER_SECRET` header compared constant-time, the `report-alert`
pattern). It reads the recipients' `device_tokens`, applies
`notification_preferences` and quiet hours (§5.3), and sends:

- **iOS: APNs directly** over HTTP/2 to `api.push.apple.com/3/device/<token>`
  with an ES256 JWT (`kid`, `iss` = team id, `iat`) signed from the `.p8`
  (`npm:jose` in Deno); Apple requires the token refreshed between 20 and 60
  minutes, so the function caches one per isolate for 50 minutes. Topic
  header `apns-topic: com.crosswordclash.app`. A `410 Unregistered` (or
  `400 BadDeviceToken`) deletes the row.
- **Android: FCM HTTP v1** (`fcm.googleapis.com/v1/projects/<id>/messages:send`)
  with an OAuth2 access token minted from a service-account key (the
  legacy server-key API began shutting down 2024-07-22 and is gone). An
  `UNREGISTERED` error deletes the row.
- No Firebase on iOS: it keeps the iOS privacy manifest free of a second
  SDK and the sender is a hundred lines either way. The alternative
  (`@capacitor-firebase/messaging`, one FCM path for both) is §9 Q7.

Payloads carry a `url` (an https link on `crosswordclash.com`) and the app
hands it to `appLinkTarget(url)` from `pushNotificationActionPerformed`, so
a notification tap and an app link are the same code path.

**Opt-outs.** A Notifications section in the account page and the apps'
settings: one switch per kind (daily reminder, room invites, friend
requests), quiet hours (default 22:00–08:00 local, during which only room
invites from friends are delivered, and only if the user turned off quiet
hours for them), and the OS-level link to Settings when permission was
denied. Every push carries nothing sensitive: a username, a puzzle title, a
room code (Apple 4.5.4: "should not be used to send sensitive personal or
confidential information").

### 3.4 Phase (d): room invites by push

Phase (b)'s `room_invites` insert gains a Database Webhook (the
`puzzle_reports` → `report-alert` pattern) that calls `send-push` with the
row id. The notification: title "Archer opened a room", body "*Birds of a
feather* · 15×15 · Join", `url = https://crosswordclash.com/?join=CODE`,
collapse id `room-<game_id>` so a re-invite replaces rather than stacks, and
`apns-expiration` / FCM `ttl` of one hour (a lobby older than that is dead
to the invitee; the sweep closes it at 12 h). The tap opens the app through
the existing app-link mapping to `/join?join=CODE`; if the room has since
started or closed, `/join` already shows its "room not found / started"
states. The `beat` kind sends "Archer solved today's mini in 1:42 · Beat
it" with the daily link.

Rules: only friends can be invited (no push to strangers, ever); the
recipient's `room_invites` switch and quiet hours apply; one push per
(room, friend); 20 invites per host per hour and 50 a day (§8); a blocked
relation makes the RPC answer as if sent and do nothing (§8). The host sees
"Invited" and, through presence, who arrived; nothing tells the host that
the friend saw the push.

### 3.5 Phase (e): finding friends from contacts

Recommended last, possibly never (§9 Q1, §10). Specified so the decision is
informed.

**What the stores now want (verified §4).** Apple's 5.1.1(iii): "Where
possible, use the out-of-process picker or a share sheet rather than
requesting full access to protected resources like Photos or Contacts";
iOS 18 added limited access, where a prompt for full access shows the person
a picker of which contacts to share. Google Play's **Contacts Permissions
policy** (announced 2026-04-15, effective 2027-01-27): apps targeting
Android 17 may request `READ_CONTACTS` only if the Contact Picker is not
sufficient, with a Play Console declaration, and pre-review checks flag the
permission from 2026-10-27. Reading the whole address book to find friends
is exactly the case both platforms are steering away from.

**Design: the picker, never the address book.** "Find friends" opens the
system contact picker (`@capacitor/contacts` `pickContact()`; on iOS the
picker "requires no permission and always shows the full contact list, even
under iOS 18+ Limited Access"; on Android the current plugin "requests
READ_CONTACTS internally to read the picked contact's details", which is the
one thing to re-check when Android 17's permissionless picker lands, §9 Q9).
The player picks the people they want to find, one or several; the app
reads only those contacts' emails and phone numbers, normalizes them
(lower-cased email; phone to E.164 with the device region as the default
country), hashes each with SHA-256 **on the device**, and sends the hashes
to the `match-contacts` edge function. Nothing else leaves the phone: no
names, no full list.

**The identity problem, stated plainly.** Matching needs the *other* person's
identifier on our side, and we have almost none: Sign in with Apple gives an
email that is often a private relay address (unmatchable by design), Google
gives a real email, and **no provider gives a phone number**. So a user is
only findable by an identifier they registered and verified themselves:
`contact_identities (user_id, kind, hmac, discoverable)`, written by a
`register-contact-identity` function that verifies an email by a one-time
link (Resend, already a vendor) and a phone number by an SMS code, which
needs an SMS vendor the project does not have (Twilio or similar, a cost per
code). **Recommendation: email only**, and no SMS vendor until the feature
earns it.

**Reciprocal discoverability.** A person who never used Find friends should
not be findable by their phone number just because a friend has it. So
`discoverable` is set only when the user *themselves* registers an
identifier from the Find friends screen ("Let friends find you by this
email too", on by default on that screen, off everywhere else). Matching is
mutual: you can only find people who opted into being found. This is the
substantive privacy protection; the hashing below is the hygiene.

**Hash scheme and its weakness.** Phone numbers have about 10¹⁰ values per
country and emails are guessable from names, so an unkeyed SHA-256 of
either is reversible by brute force in minutes; a leaked table of such
hashes is a leaked table of phone numbers, which is why Signal gave up on
hashing for contact discovery. The scheme here:

- Client: `h1 = SHA-256(normalized value)`, sent over TLS. This keeps raw
  numbers out of our request logs and out of the server's memory as text,
  no more.
- Server (`match-contacts`): `h2 = HMAC-SHA256(CONTACT_HASH_KEY, h1)` with
  the key a Supabase secret the function alone holds; compare `h2` against
  `contact_identities.hmac` (stored the same way at registration) where
  `discoverable`; answer the matching usernames; **discard the uploaded set
  in memory** (Play's "ephemeral processing": "accessing and using it while
  the data is only stored in memory"). Nothing uploaded is written to a
  table or a log. A stored table leak without the key is not brute-forceable;
  the key never meets a raw value.
- Known residual weakness: `h1` in flight and in the function's memory is
  brute-forceable to a compromised server or a logging mistake. Mitigation:
  the function logs counts only, runs no other code, and the mutual opt-in
  means a brute-forced `h1` reveals a phone number the uploader already had.
- Alternative if a batch is ever needed: a `contact_match_uploads` table
  with `created_at` and a 1-hour `contact_upload_ttl` in the sweep, service
  role only. Not recommended; the in-memory match handles a picked handful.

**Deletion.** "Stop letting friends find me" deletes the user's
`contact_identities` rows at once; account deletion cascades them. The
uploaded hashes never persisted, so there is nothing else to delete, and the
privacy policy says exactly that (§6).

**What the user sees before anything is read.** A full screen, not a sheet,
before the picker opens (Google's prominent-disclosure format; Apple's
"ensure your purpose strings clearly and completely describe your use"):

> **Find friends from your contacts**
> Crossword Clash uses the contacts you pick to find friends who already play. On this phone it turns their email addresses and phone numbers into scrambled codes and sends only the codes to our server to check for a match. We never receive names or your contact list, we keep nothing you send, and nobody is matched unless they chose to be found. Only friends you add this way are affected; we never message your contacts.
> [Choose contacts]   [Not now]

Below it, the toggle "Let friends find me by my email (andrew@…)" with the
verification step. The iOS purpose string
(`NSContactsUsageDescription`, required by the plugin even though the picker
is out of process): "Crossword Clash reads the contacts you pick to find
friends who already play. Only scrambled codes of their email addresses and
numbers leave your phone."

### 3.6 The menu's multiplayer entry points: "Race friends" becomes a screen

**Today.** The daily tile's **Race friends** button and the "Play with
friends" section's **Start a game** row both go straight to the host name
screen (`MenuScreen.tsx:106-116,272-279`, `to="/host-game/name"`); **Join
with a code** is the quieter row beneath it (`:280-287`, `/join`). A
newcomer told "join my game" has to find that row, and a host has nothing
to do on the name screen but type a name they already have. Two fixes were
on the table before friends existed: make Race friends a fork between Start
and Join, or keep it on hosting and add a "Have a code?" link to the name
screen. Andrew ruled on 2026-10-31 that friends reshape these entry points
instead (§10), so this spec proposes the shape.

**Proposal: one screen, `/race` (`RaceScreen`, chunk `race`).** The daily
tile's Race friends button (carrying the daily as `urlPuzzle`, shown as a
chip "Racing: Today's Mini · change") and a single menu row **Race friends ·
challenge, join or start** (replacing Start a game and Join with a code; TV
mode keeps its row) both open it. Its blocks, in the order they appear on a
phone:

1. **From your friends** (accounts with pending `room_invites`): "Alicia
   opened a room · *Birds of a feather* · **Join**", "Archer solved today's
   mini in 1:42 · **Beat it**". Join is the app link's path (`/join?join=`)
   with the username as the name. This is the common join with no code.
2. **Friends**, each with **Challenge** (the host flow with that friend
   pre-selected for the lobby's invite list and the chip's puzzle if any)
   and an **Add friends** row (username search, people you have raced).
3. **Start a room**: the host flow for the chip's puzzle, or the puzzle
   picker when there is none (`/pick-puzzle?intent=race`).
4. **Join with a code**: `JoinGame` embedded inline, six boxes and Join,
   with "or scan the room's QR with your camera" beneath. Always on the
   screen, never behind a link, because the code is the one path that works
   for everyone; it is the fallback rather than the front door.

The order is **by state**, so the most useful block is first: with no
friends and no invites (every newcomer), the code field and Start a room
come first and the friends blocks become one "Add friends to race them in a
tap" card; with friends and no invites, Friends first; with invites,
invites first. On a 375 px phone every arrangement puts its first block and
the code field's top within the first screen.

**Signed-out and anonymous visitors.** Blocks 3 and 4 only, plus a quiet
sign-in row "Sign in to keep a friends list and get invited" (`openAccount({
placement: "race" })`); nothing about friends is shown as locked or greyed.
The screen is identical with `VITE_FRIENDS` off, which is how it can ship
ahead of phase (a) if the join problem needs fixing sooner.

**Degradation on the web.** No push: an invite reaches a web player through
the Realtime banner while the site is open, else it waits in block 1 for
the next visit, with the badge on the menu row read on load; everything
else is the same. Challenge for a friend who is on the web shows "Invited"
to the host exactly as in the apps; the host cannot tell the two apart and
does not need to.

**Where the existing flows sit.** The lobby keeps the code, the QR and the
Share invite link unchanged (`GameLobby.tsx:150-212`); Share is also the
Challenge for anyone not on the list. Deep links do not pass through the
screen: `/?join=CODE` and `/share?t=race&code=` map to `/join?join=CODE`
(`appLinkTarget`, `appLinks.ts:41-45`) and `/join` stays a route, so a
scanned QR or a tapped invite link lands on the code already filled, as
today. The two earlier fixes are folded in: the screen *is* the fork, with
friends above it, and the host name screen gains the one-line "Have a code
instead? Join a game" link for players who arrived from the daily tile.

**Measuring the change.** `mode_selected { mode: "race" }` on the row and
tile, and `race_action { action }` on the screen (§7), so the share of
joins by invite, code, QR and link is visible for the first time.

---

## 4. Store policy requirements

Both guideline sets were read on 2026-10-31. Apple's page is dated
"Last Updated: October 16, 2026" (a tracker's diff of that revision shows
changes to UGC definitions, moderation enforcement and submission
checklists, nothing to the numbers cited here). Google's Policy Center pages
carry no dates; the Contacts policy's effective dates are quoted.

### 4.1 Apple App Store Review Guidelines

| Rule | What it says (quoted or close) | What it forces in this spec |
|---|---|---|
| **4.5.4 Push Notifications** | "Push Notifications must not be required for the app to function, and should not be used to send sensitive personal or confidential information. Push Notifications should not be used for promotions or direct marketing purposes unless customers have explicitly opted in … via consent language displayed in your app's UI, and you provide a method in your app for a user to opt out" | Every feature works with push denied (invites fall back to the inbox, §3.2); payloads carry a username, title and room code only; the daily reminder is opt-in by a switch the user flips, with the same switch to opt out (§3.3); no promotional push of any kind, ever, including "come back" or Plus upsells |
| **5.1.1(i) Privacy policies** | Must "identify what data … the app/service collects, how it collects that data, and all uses", name third parties with "the same or equal protection", and "explain its data retention/deletion policies" | §6's paragraphs: friends, tokens (naming Apple and Google/Firebase as the carriers), contact hashes, each with its retention window and deletion path |
| **5.1.1(ii) Permission** | Consent for collection "even if such data is considered to be anonymous"; "Ensure your purpose strings clearly and completely describe your use of the data" | The pre-picker screen and the purpose string in §3.5; the notification switch before the OS prompt in §3.3 |
| **5.1.1(iii) Data minimization** | "Apps should only request access to data relevant to the core functionality … Where possible, use the out-of-process picker or a share sheet rather than requesting full access to protected resources like Photos or Contacts" | Phase (e) uses the picker and never requests Contacts authorization for the address book; phase (b) keeps the share sheet as the way to reach non-friends |
| **5.1.1(iv) Access** | "Respect the user's permission settings … Where possible, provide alternative solutions for users who don't grant consent" | A denied notification permission leaves the inbox and banner path; a declined picker leaves username search and "people you have raced" |
| **5.1.1(v) Account sign-in** | "If your app doesn't include significant account-based features, let people use it without a login … inviting friends to use the app are not considered core app functionality" | Friends are an account feature on top of a game that stays fully playable anonymously; the lobby's share link and QR stay for everyone |
| **5.1.1(viii)** | "Apps that compile personal information from any source that is not directly from the user or without the user's explicit consent … are not permitted" | No raw contacts stored; matching only against identifiers people registered themselves (§3.5 reciprocity) |
| **5.1.1(x)** | May request "basic contact information (such as name and email address) so long as the request is optional … features and services are not conditional on providing the information" | Registering a discoverable email is optional and gates nothing but being found |
| **5.1.2(i) Data use and sharing** | "You may not use, transmit, or share someone's personal data without first obtaining their permission … Your app may not require users to enable system functionalities (such as push notifications …) in order to access functionality" | A friend's username is shown to the people they accepted; an invite reaches only an accepted friend; nothing requires notifications on |
| **5.1.2(ii)** | "Data collected for one purpose may not be repurposed without further consent" | Contact hashes are used for the match in that request and nothing else; device tokens only for the kinds the user switched on |
| **5.1.2(iv)** | "Do not use information from Contacts … to build a contact database for your own use or for sale" | No contact table at all (§3.5, §5.1) |
| **5.1.2(v)** | "Do not contact people using information collected via a user's Contacts … except at the explicit initiative of that user on an individualized basis; do not include a Select All option" | The non-goal in §2: we never message a contact; invites to non-players stay in the OS share sheet |
| **5.1.3 Health and Health Research** | "Health, fitness, and medical data are especially sensitive…" | **Not relevant**: nothing here touches HealthKit or health data. Listed because the brief asked |
| **1.2 User-generated content** | Filtering, a report mechanism, "the ability to block abusive users", published contact information | Usernames are already filtered (`isObjectionableName`); §8 adds Block on a request or a friend and a Report on a username; `/support` is the contact |
| **App Privacy labels** | "Contacts: such as a list of contacts in the user's phone"; Contact Info "Email Address … including but not limited to a hashed email address", "Phone Number … including … a hashed phone number"; Identifiers "User ID", "Device ID: … or other device-level ID"; data linked to the user unless de-identified before collection | Phase (c): add **Device ID** (the push token, linked, App Functionality). Phase (e): add **Contacts**, **Email Address** and **Phone Number** (hashed values still count), linked to the user who registers them; the picked contacts' hashes are processed in memory only, but Apple's "on device only" exemption does not cover data sent off device, so declare. Update `PrivacyInfo.xcprivacy` to match |
| **Purpose strings** | `NSContactsUsageDescription`: "This key is required if your app uses APIs that access the user's contacts"; "Your app crashes if you attempt to access contact data without a contacts usage description" | The string in §3.5, added with the plugin even though the picker is out of process |

### 4.2 Google Play

| Rule | What it says | What it forces |
|---|---|---|
| **User Data policy** | Prominent disclosure "must be within the app itself … must describe the data being accessed or collected … explain how the data will be used and/or shared", in the format "[This app] collects/transmits/syncs/stores [type of data] to enable ['feature'], [in what scenario]"; consent before collection; navigation away is not consent; "Use a runtime permissions request whenever available"; "We don't allow unauthorized publishing or disclosure of people's non-public contacts"; account deletion in-app and on the web; "complete a clear and accurate Data safety section" | The §3.5 screen is the disclosure, in that format, shown before the picker; nothing about a contact is published; `delete-account` already exists in-app and the account page is the web path; Data safety rows below |
| **Permissions policy** | Permissions "necessary to implement current features or services"; "Use the data only for purposes that the user has consented to"; "Core functionality is defined as the main purpose of the app" as "promoted in your Google Play listing"; request sensitive permissions incrementally, in context | `POST_NOTIFICATIONS` is requested only when a switch is flipped (§3.3); `READ_CONTACTS` is not requested as a broad permission at all |
| **Contacts Permissions policy** (announced 2026-04-15, effective **2027-01-27**) | "Broad access to users' contacts is now restricted"; "Apps that target Android 17 or higher (API level 37+) may only request the READ_CONTACTS permission if the Android Contact Picker is not sufficient" and "must submit a Play Console declaration"; "All user Contacts are personal and sensitive data"; "Apps may not disclose or publish non-public Contacts data unless authorized by the individual data subjects"; pre-review checks in Play Console from 2026-10-27; Google: "READ_CONTACTS will be reserved for apps that can't function without it" | Phase (e) is picker-based so that when the app targets API 37 it needs no declaration. If the Capacitor plugin still requests `READ_CONTACTS` for the picked contact on Android 17 (§3.5), that is a blocker to fix or wait out, not a declaration to file: a crossword game would not pass "can't function without it" |
| **Data safety form** | "'Collect' means transmitting data from your app off a user's device"; "User data collected pseudonymously must be disclosed"; data that "can reasonably be re-associated with a user must be disclosed"; SDK data counts "irrespective of whether data is transmitted to you or a third-party server" (Firebase named); Contacts "contact names, message history, and social graph information"; Device or other IDs include the "Firebase installation ID" | Phase (c): **Device or other IDs** collected (FCM token and Firebase installation id), App functionality, required for the feature, not shared (Google as a service provider). Phase (a): **App activity → Other actions** already covers friend lists; add nothing. Phase (e): **Contacts** (collected, pseudonymous, ephemeral processing declared as "not stored") and **Personal info → Email address / Phone number** for the registered identifier. Also tick "Users interact" in the content rating questionnaire if not already (rooms already qualify) |
| **Notification permission, Android 13+** | `POST_NOTIFICATIONS` is a runtime permission from API 33; for apps targeting 13+ "the app controls when the dialog appears"; "Before you ask users to grant any permissions, let them familiarize themselves with your app"; a denial leaves the app to explain and link to Settings | Declare `POST_NOTIFICATIONS` in the manifest; prompt only from the switch; `shouldShowRequestPermissionRationale` → the one-sentence rationale; after a denial, the switch row says "Turned off in Settings" with a link |

Timeline note for Andrew: the Play contacts rule bites when the app
**targets** API 37, not when Android 17 ships, and Play's annual target-SDK
requirement usually gives a year; the picker design makes the date moot.

---

## 5. Data model

### 5.1 Tables

```sql
-- 2026MMDD000000_friends.sql (phase a and b)

CREATE TABLE friendships (
  requester_id  UUID NOT NULL REFERENCES profiles (user_id) ON DELETE CASCADE,
  recipient_id  UUID NOT NULL REFERENCES profiles (user_id) ON DELETE CASCADE,
  status        TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'accepted')),
  created_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
  responded_at  TIMESTAMPTZ,
  PRIMARY KEY (requester_id, recipient_id),
  CHECK (requester_id <> recipient_id)
);
-- One row per pair whichever way it was asked:
CREATE UNIQUE INDEX friendships_pair ON friendships (LEAST(requester_id, recipient_id), GREATEST(requester_id, recipient_id));
CREATE INDEX friendships_recipient ON friendships (recipient_id, status);
-- RLS: select where auth.uid() IN (requester_id, recipient_id). No client insert/update;
-- delete own (unfriend: either party deletes the row; decline: the recipient deletes).

CREATE TABLE blocks (
  blocker_id  UUID NOT NULL REFERENCES profiles (user_id) ON DELETE CASCADE,
  blocked_id  UUID NOT NULL REFERENCES profiles (user_id) ON DELETE CASCADE,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY (blocker_id, blocked_id)
);
-- RLS: select / insert / delete where blocker_id = auth.uid(). The blocked side never reads it.

CREATE TABLE room_invites (
  id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  kind         TEXT NOT NULL DEFAULT 'room' CHECK (kind IN ('room', 'beat')),
  game_id      UUID REFERENCES games (id) ON DELETE CASCADE,     -- kind = room
  link         TEXT,                                              -- kind = beat: the /daily/... link
  from_user_id UUID NOT NULL REFERENCES profiles (user_id) ON DELETE CASCADE,
  to_user_id   UUID NOT NULL REFERENCES profiles (user_id) ON DELETE CASCADE,
  created_at   TIMESTAMPTZ NOT NULL DEFAULT now(),
  pushed_at    TIMESTAMPTZ,
  seen_at      TIMESTAMPTZ,
  CHECK ((kind = 'room') = (game_id IS NOT NULL))
);
CREATE UNIQUE INDEX room_invites_once ON room_invites (game_id, to_user_id) WHERE kind = 'room';
CREATE INDEX room_invites_inbox ON room_invites (to_user_id, created_at DESC);
-- RLS: select where auth.uid() IN (from_user_id, to_user_id); update seen_at where to_user_id = auth.uid();
-- insert only through invite_to_room().

-- phase c
CREATE TABLE device_tokens (
  id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id      UUID NOT NULL REFERENCES auth.users (id) ON DELETE CASCADE,  -- anonymous users allowed (the reminder)
  platform     TEXT NOT NULL CHECK (platform IN ('ios', 'android')),
  token        TEXT NOT NULL UNIQUE,
  app_version  TEXT, locale TEXT, timezone TEXT,
  created_at   TIMESTAMPTZ NOT NULL DEFAULT now(),
  last_seen_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  failed_at    TIMESTAMPTZ
);
CREATE INDEX device_tokens_user ON device_tokens (user_id);
-- RLS: select / insert / update / delete where user_id = auth.uid() (the client upserts its own token on
-- every registration and deletes it on sign-out). The sender reads with the service role.

CREATE TABLE notification_preferences (
  user_id             UUID PRIMARY KEY REFERENCES auth.users (id) ON DELETE CASCADE,
  daily_reminder      BOOLEAN NOT NULL DEFAULT false,
  daily_reminder_hour SMALLINT NOT NULL DEFAULT 8 CHECK (daily_reminder_hour BETWEEN 0 AND 23),
  room_invites        BOOLEAN NOT NULL DEFAULT true,
  friend_requests     BOOLEAN NOT NULL DEFAULT true,
  quiet_start         SMALLINT NOT NULL DEFAULT 22 CHECK (quiet_start BETWEEN 0 AND 23),
  quiet_end           SMALLINT NOT NULL DEFAULT 8  CHECK (quiet_end BETWEEN 0 AND 23),
  quiet_hours         BOOLEAN NOT NULL DEFAULT true,
  timezone            TEXT NOT NULL DEFAULT 'UTC',
  updated_at          TIMESTAMPTZ NOT NULL DEFAULT now()
);
-- RLS: select / insert / update where user_id = auth.uid().

CREATE TABLE push_log (                       -- rate limits and the audit of what was sent; no body text
  id          BIGSERIAL PRIMARY KEY,
  user_id     UUID REFERENCES auth.users (id) ON DELETE CASCADE,
  kind        TEXT NOT NULL,                  -- daily_reminder | room_invite | beat | friend_request
  collapse_id TEXT,
  sent_at     TIMESTAMPTZ NOT NULL DEFAULT now(),
  outcome     TEXT NOT NULL                   -- sent | unregistered | failed | quiet | opted_out
);
-- RLS on, no client policies.

-- phase e (email first)
CREATE TABLE contact_identities (
  user_id      UUID NOT NULL REFERENCES profiles (user_id) ON DELETE CASCADE,
  kind         TEXT NOT NULL CHECK (kind IN ('email', 'phone')),
  hmac         TEXT NOT NULL,                 -- HMAC-SHA256(CONTACT_HASH_KEY, SHA-256(normalized value)), hex
  discoverable BOOLEAN NOT NULL DEFAULT true,
  verified_at  TIMESTAMPTZ NOT NULL,
  PRIMARY KEY (user_id, kind)
);
CREATE UNIQUE INDEX contact_identities_hmac ON contact_identities (kind, hmac);
-- RLS: select / update discoverable / delete where user_id = auth.uid(); insert only by register-contact-identity.
-- No table for uploaded hashes: match-contacts compares in memory (§3.5).
```

Why these shapes: every user-id column references `profiles` (which cascades
from `auth.users`) where a username is required, and `auth.users` where an
anonymous user may hold the row (`device_tokens`, `notification_preferences`,
`push_log`), the CLAUDE.md rule for new user-id columns. `blocks` is its own
table rather than a `friendships` status so a block outlives an unfriend, is
one-directional and is invisible to the blocked side. `room_invites.game_id`
cascades with the game, so the 90-day sweep needs no new step for them, and
the shorter `room_invite_ttl` (§5.4) is the one that matters.

### 5.2 Writes: RPCs and functions

| Call | Who | Does |
|---|---|---|
| `send_friend_request(p_username text)` | non-anonymous JWT with a profile | refuses self, an existing pair row, a block in either direction (answers `sent` and inserts nothing), > 20 requests in 24 h, > 100 pending outstanding, and a re-request within 7 days of a decline (a `request_cooldowns (requester_id, recipient_id, until)` row written by the decline, RLS on with no client policies); inserts `pending`, or sets `accepted` when the reverse row is pending |
| `respond_friend_request(p_requester uuid, p_accept boolean)` | the recipient | `accepted` + `responded_at`, or deletes the row and writes the cooldown |
| `recent_opponents()` | any account | `SECURITY INVOKER`: the other `players` of the caller's games (and games they hosted), joined to `profiles`, with count and last game; window = what the sweep has kept |
| `invite_to_room(p_game_id uuid, p_friend uuid)` / `send_beat(p_friend uuid, p_link text)` | an account that is host or player of a `waiting` room (`beat`: any account) | friendship `accepted`, no block either way, the recipient's `room_invites` preference on (else `muted`, inserted with `pushed_at` null so the inbox still gets it), ≤ 20 invites in 1 h and ≤ 50 in 24 h by the caller; inserts; a Database Webhook on INSERT calls `send-push` (phase d) |
| `register_device_token` (plain RLS upsert from the client) | any JWT | `ON CONFLICT (token) DO UPDATE SET user_id, last_seen_at` (a token that moves to a new anonymous user after storage was cleared follows the user) |
| `send-push` (edge function, service role, `PUSH_SENDER_SECRET`) | cron, webhooks | §3.3; writes `push_log`; deletes unregistered tokens |
| `register-contact-identity` (edge function, user JWT) | account | sends the verification email (Resend) and, on the link's return, writes `contact_identities` |
| `match-contacts` (edge function, user JWT) | account | HMACs the uploaded `h1` values, answers `{ username, user_id }[]` for discoverable matches that are not blocked either way; per-user rate limit (`checkRateLimit`, 10 calls/h, ≤ 50 hashes per call); logs counts only |

All RPCs are `SECURITY DEFINER` with `search_path` pinned and the caller read
from `auth.uid()` / `auth.jwt()` inside (the community pattern), refusals as
`RAISE EXCEPTION 'friends:<code>'` mapped by a `FriendsError.kind`.

### 5.3 Quiet hours and preferences in the sender

`send-push` evaluates, per recipient: the kind's switch; quiet hours in the
recipient's `timezone` (room invites are the one kind that may cross quiet
hours, and only when `quiet_hours` is off); the device's `locale` for the
string (en/es from the same `i18n` resources, loaded in Deno from the JSON
files). Every skip is a `push_log` row with its `outcome`, so "why didn't I
get it" is answerable.

### 5.4 Retention and account deletion

`retention_sweep()` is redefined (the newest definition wins;
`retentionMigration.test.ts` reads the newest file) with new named constants:

| Constant | Window | Step |
|---|---|---|
| `friend_request_ttl` | 30 days | `pending` friendships deleted |
| `request_cooldown_ttl` | 7 days | cooldown rows deleted |
| `room_invite_ttl` | 7 days | `room_invites` deleted (a `room` invite is dead after 12 h anyway; 7 days keeps the inbox's "started without you" row for a week) |
| `device_token_ttl` | 90 days since `last_seen_at`, or 7 days after `failed_at` | `device_tokens` deleted (the app re-registers on every launch, so an unseen token is an uninstalled or dormant device) |
| `push_log_ttl` | 30 days | `push_log` deleted (the longest rate-limit window is 24 h) |
| `contact_identities` | until the user removes it or the account goes | no step; stated in the policy |

The idle-anonymous-user rule gains **no** exclusion for `device_tokens` or
`notification_preferences`: an anonymous device that has not opened the app
in 30 days should stop being reminded, and the cascade does that.

**`delete-account`**: nothing joins `OWNED_TABLES`; every new table
cascades from `auth.users` or `profiles`. The function's doc comment lists
them, and a migration test asserts every new user-id column has `ON DELETE
CASCADE`. A deleted user's friends simply lose the row; their pending
invites vanish; their device tokens go with them, so the sender can never
address a deleted account.

---

## 6. Privacy policy, terms, store forms

English drafts; Spanish follows the house pattern (same paragraph in `es`,
`i18n.test.ts` parity, `legal.test.tsx` placeholder check), and
`LEGAL_LAST_UPDATED` is bumped with each phase.

**Privacy → "Accounts (optional)", new paragraphs** (phase a/b):

> **Friends.** If you add friends, we store who asked whom, when, and whether it was accepted, and who you have blocked (the blocked person is not told). Your friends see your username and that you share a friends list; nobody else sees your friends. "People you have raced" is worked out from the rooms you were both in, which we already keep for 90 days. When you invite a friend to a room or send them a time to beat, we store the invitation (who, whom, which room or puzzle, when) for 7 days. Pending friend requests are deleted after 30 days. Removing a friend or deleting your account removes these records.

**Privacy → new heading "Notifications (apps)"** (phase c/d):

> If you turn on notifications in the app, your phone gives us a push token, a code Apple or Google issues so we can send notifications to that device. We store the token with your ID, the platform, your language and time zone, and which kinds of notification you turned on (a daily puzzle reminder, room invitations, friend requests) and your quiet hours. Notifications are delivered through Apple's Push Notification service on iPhone and Google's Firebase Cloud Messaging on Android; they carry only what you see in them (a username, a puzzle title, a room code), never anything sensitive. We keep a log of what was sent and why something was not, without its text, for 30 days. A token we have not seen for 90 days is deleted; turning notifications off, signing out or deleting your account deletes it at once. We never send marketing by notification.

**Privacy → new heading "Finding friends from your contacts (apps)"**
(phase e only, if built):

> Find friends is optional. If you use it, you pick contacts with your phone's own picker; the app turns the email addresses and phone numbers of only those contacts into scrambled codes on your phone and sends the codes to our server, which checks them against players who chose to be findable and then discards them. We never receive names, your contact list, or the addresses and numbers themselves, and we store nothing from what you send. If you choose to let friends find you, we store a keyed scrambled code of your verified email address (or phone number) with your ID until you turn that off or delete your account; we cannot turn the code back into the address.

**Privacy → "Retention and your choices"**: add "Friend requests are deleted
after 30 days if unanswered, invitations after 7 days, push tokens 90 days
after the device was last seen, and the notification log after 30 days."

**Terms → new heading "Friends and invitations"**: "Friends features are for
accounts. You may add people by username or from rooms you shared, and
invite friends to rooms or to beat a time. Invitations are fixed messages;
there is no messaging. Don't send repeated requests to people who have
declined, and don't use friends features to harass anyone. You can block
any player, and we may remove the friends features from accounts that abuse
them." Amend "Reports, removal and blocking": "You can hide an author's
puzzles **and block any player** so…".

**App Privacy (App Store Connect) and `PrivacyInfo.xcprivacy`:** phase c
adds *Identifiers → Device ID* (linked to the user, App Functionality, no
tracking); phase e adds *Contacts → Contacts*, *Contact Info → Email
Address* and *Phone Number* (linked, App Functionality). **Data safety
(Play):** phase c adds *Device or other IDs* (collected, not shared,
required, App functionality; Firebase as service provider); phase e adds
*Contacts* (collected, not shared, optional, App functionality, ephemeral
processing where the form allows it) and *Personal info → Email address* /
*Phone number* for the registered identifier. `docs/app-store/README.md` and
`docs/play-store/README.md` each get the new rows.

---

## 7. Analytics events

New members of `AnalyticsEvent` (`src/lib/analytics.ts`), web and, through
the same `track`, nowhere else (the apps have no GA; counts for the apps
come from the tables):

| Event | Params | When |
|---|---|---|
| `friend_request_sent` | `method` (username \| raced \| room \| contacts) | the RPC succeeded |
| `friend_request_responded` | `accepted` | Accept / Decline |
| `friend_removed` | — | unfriend |
| `player_blocked` | `placement` (request \| friend \| room) | Block |
| `room_invite_sent` | `channel` (inapp \| share), `kind` (room \| beat) | Invite / Send to a friend; `share` is the existing share-sheet path, tagged now so the two can be compared |
| `room_invite_opened` | `via` (banner \| inbox \| push) | the invitee tapped Join |
| `race_action` | `action` (invite-join \| challenge \| start \| join-code \| add-friend), `signed_in` | a tap on the Race friends screen (§3.6) |
| `room_invite_pushed` | `kind` | server-side count from `push_log`, surfaced in the insights panel, not GA |
| `push_permission_prompted` | `placement` (reminder \| invites \| requests) | the OS prompt was shown |
| `push_permission_result` | `granted` | the answer |
| `push_opened` | `kind` | a notification tap launched or foregrounded the app |
| `reminder_toggled` | `on`, `hour` | the daily reminder switch |
| `contacts_find_started` | — | the pre-picker screen's Choose contacts |
| `contacts_matched` | `picked`, `matched` | the match answered (counts only) |
| `discoverable_toggled` | `on`, `kind` | Let friends find me |

---

## 8. Abuse and safety

- **Request spam**: 20 requests per 24 h and 100 pending per account; a
  declined request cannot be repeated for 7 days; three declines by the same
  person make further requests to them silently undeliverable (a cooldown
  row with `until = 'infinity'`). Usernames are the only free text and are
  already filtered on write and read (`isObjectionableName`,
  `displayableName`).
- **Blocking**: Block on a request, a friend row, a lobby player or a
  completion-modal row. It deletes any friendship, hides the blocker's
  username from the blocked person's search and "people you have raced"
  (the RPCs filter both directions), and makes every RPC from the blocked
  side answer as if it had worked while inserting nothing. **What a blocked
  user sees**: nothing different. Their request shows "Requested", their
  invite shows "Invited", and nothing arrives; the search still finds the
  username (hiding it would reveal the block). A block does not stop them
  joining a room by code or QR, which is a different feature; the lobby's
  existing Close room remains the host's tool.
- **Report path**: a Report on a username (from a request or a friend row)
  writes a `user_reports` row (the `puzzle_reports` shape: reporter,
  reported, reason **Offensive name · Harassment · Something else**, note)
  through a `report_user` RPC, posted to the existing `report-alert` email,
  and reviewed in the studio's Reports panel (`studio-moderate` gains
  `action: "rename"` to replace a username with `player_<n>` and
  `"suspend_friends"` to switch the features off for the account). Apple 1.2
  asks for "timely responses"; the terms' 24-hour line covers it.
- **Invitations are templated**, so there is no vector for abusive text; a
  harassing pattern of invites is rate-limited (20/h, 50/day) and blockable.
- **Minors**: the apps are rated 4+ / Everyone and the privacy policy says
  the game is not directed to children under 13. Friends need an Apple or
  Google account, whose own age rules apply, so the features add no
  under-13 collection; there is no chat and no profile beyond a username;
  the Play content-rating questionnaire's "users interact" item is already
  true for rooms and stays so. Google's Families policy does not apply
  (the app does not target children) but its spirit is met: nothing lets a
  stranger reach a child beyond a room code they already had. Contact
  matching (phase e) touches other people's data; the mutual opt-in means a
  child who never registered an email cannot be found.
- **Push abuse**: only friends can trigger a push to a person; the daily
  reminder is self-scheduled; the sender has no API callable from a client;
  `push_log` makes volume visible.

---

## 9. Open questions for Andrew (with a recommendation each)

1. **Build phase (e) at all?** The yield is structurally low (no phone
   numbers from sign-in, Apple relay emails unmatchable, mutual opt-in
   required) and it is the one phase that touches both stores' most
   sensitive forms. **Recommendation: not now.** Ship (a)–(d), measure
   `friend_request_sent` by `method` for two months, and build (e) only if
   "people you have raced" plus username search leaves players saying "I
   can't find anyone". If built, email only, picker only (§3.5).
2. **Order (c) before (b)'s in-app delivery?** The in-app banner and inbox
   in (b) work without push and prove the invite data model; (c) is
   infrastructure. **Recommendation: keep the order** (a → b → c → d);
   (c) can start in parallel once (a) has merged, since they share no files.
3. **"People you have raced" from the 90-day game rows or a new table?**
   **Recommendation: the game rows first.** A `race_history (user_id,
   other_id, games, last_at)` table maintained by a trigger on `players` is
   a one-migration upgrade if the 90-day window frustrates anyone.
4. **Who can be invited in-app: friends only, or also recent opponents?**
   **Recommendation: friends only.** A push to a non-friend is the thing
   Apple 5.1.2(i) and Play's User Data policy would read as contacting
   someone without permission; a recent opponent is one tap from being a
   friend.
5. **Daily reminder for anonymous app users?** **Recommendation: yes.**
   Most app users are anonymous, the reminder needs no identity, and the
   30-day idle rule retires the token for free. Room-invite and
   friend-request pushes stay account-only by construction.
6. **iOS provisional (quiet) authorization for the reminder?**
   **Recommendation: no.** It would let the reminder arrive without a
   prompt, but a provisional grant is silent and the same grant would mute
   room invites, which need a banner and a sound to be useful.
7. **APNs direct plus FCM, or Firebase on both platforms?**
   **Recommendation: APNs direct on iOS, FCM on Android.** One ES256 JWT is
   simpler than a second SDK in the iOS app and keeps the iOS privacy
   manifest unchanged by push; the sender has two short branches either way.
8. **Quiet hours default on (22:00–08:00)?** **Recommendation: yes**, with
   room invites allowed to cross them off by default (a late race is the
   point of a late invite) and a switch to let them.
9. **Android picker and `READ_CONTACTS`.** If (e) is built, the current
   `@capacitor/contacts` requests `READ_CONTACTS` to read the picked
   contact, which Play's 2027 rule would flag on API 37. **Recommendation:**
   wait for Android 17's permissionless picker to reach the plugin (or a
   small native shim around `ACTION_PICK` with the result URI's granted
   read), and do not file a declaration.
10. **Web push.** **Recommendation: not in this plan.** The website keeps
    the banner/inbox delivery; revisit if the website's share of races stays
    above the apps'.
11. **The Race friends screen (§3.6): block order by state, or fixed?**
    **Recommendation: by state**, so a newcomer sees the code field first
    and a player with invites sees them first; a fixed order would put one
    of them below the fold. And keep the "Have a code instead?" link on the
    host name screen as the cheap second path.

---

## 10. Decision log

| Date | Decision | Outcome |
|---|---|---|
| 2026-10-30 | PR #181: invite links, lobby QR, daily and community links open the installed app (iOS build 25 / Android 10) | The join tap lands in the app; who-must-be-where is unchanged (§1) |
| 2026-10-31 | Andrew's idea: contacts import to find friends, direct challenges, push suggestions when a room opens | The brief for this spec |
| 2026-10-31 | The main session's recommendation, accepted by Andrew: start without contacts; friends from usernames and "people you have raced", "Challenge a friend" through the share sheet, push later and first for something simple | §3's phase order: (a) friends, (b) challenge, (c) push with a daily reminder, (d) invites by push, (e) contacts last and optional |
| 2026-10-31 | Research finding: Google Play's Contacts Permissions policy (announced 2026-04-15, effective 2027-01-27) and Apple 5.1.1(iii) both steer friend-finding to the system picker; no provider gives us phone numbers | Phase (e) redesigned around the picker and verified, self-registered, mutually opted-in identifiers; recommended deferred (§9 Q1) |
| 2026-10-31 | **Join Game prominence folded into the friends design** (Andrew): rather than fix "Join with a code" on its own (a fork under Race friends, or a "Have a code?" link on the host name screen), the friends work reshapes the menu's multiplayer entry points | §3.6: one Race friends screen with invites, friends, Start a room and an always-visible code field, ordered by state; the code is the fallback, not the front door |
| 2026-10-31 | Spec written; questions 1–11 put to Andrew | Awaiting rulings |

---

## Sources (read 2026-10-31)

- Apple, App Store Review Guidelines, "Last Updated: October 16, 2026": 1.2, 4.5.4, 5.1.1 (i)–(x), 5.1.2 (i)–(vii), 5.1.3. https://developer.apple.com/app-store/review/guidelines/
- Apple, App privacy details on the App Store (data types Contacts, Email Address and Phone Number "including … hashed", User ID, Device ID; linkage and tracking definitions; on-device exemption). https://developer.apple.com/app-store/app-privacy-details/
- Apple, `NSContactsUsageDescription` ("required if your app uses APIs that access the user's contacts"). https://developer.apple.com/documentation/bundleresources/information-property-list/nscontactsusagedescription
- Apple, Accessing the contact store (limited access, `CNAuthorizationStatus.limited`, ContactAccessButton, the crash without a usage description). https://developer.apple.com/documentation/contacts/accessing-the-contact-store
- Apple, Asking permission to use notifications (request in context; one prompt only; provisional authorization). https://developer.apple.com/documentation/usernotifications/asking-permission-to-use-notifications
- Apple, Establishing a token-based connection to APNs (ES256 JWT, 20–60 minute refresh, team-scoped keys). https://developer.apple.com/documentation/usernotifications/establishing-a-token-based-connection-to-apns
- Google Play, User Data policy (prominent disclosure and consent format, deletion, Data safety accuracy, non-public contacts). https://support.google.com/googleplay/android-developer/answer/10144311
- Google Play, Permissions and APIs that Access Sensitive Information (current features, core functionality as promoted in the listing). https://support.google.com/googleplay/android-developer/answer/9888170
- Google Play, Contacts Permissions policy, effective 2027-01-27 (API 37+, Contact Picker, declaration). https://support.google.com/googleplay/android-developer/answer/16909972 ; policy timeline https://developer.android.com/distribute/play-policies ; announcement 2026-04-15 https://android-developers.googleblog.com/2026/04/giving-users-clearer-choice-and-everyone-a-safer-more-trusted-app-ecosystem.html
- Google Play, Data safety form (collect, share, ephemeral processing, pseudonymous data must be disclosed, SDK data counts, Firebase installation ID). https://support.google.com/googleplay/android-developer/answer/10787469
- Android, Notification runtime permission (API 33, app-controlled timing when targeting 13+, prompt guidance). https://developer.android.com/develop/ui/views/notifications/notification-permission
- Capacitor, Push Notifications plugin (APNs token on iOS, FCM token on Android, `requestPermissions`, Android 13). https://capacitorjs.com/docs/apis/push-notifications
- Capacitor, Contacts plugin (`pickContact`; iOS picker needs no permission even under Limited Access; Android picker requests `READ_CONTACTS` internally). https://capacitorjs.com/docs/apis/contacts
- Firebase, Migrate from legacy FCM APIs to HTTP v1 (legacy send deprecated 2023-06-20, shutdown from 2024-07-22; OAuth2 access token). https://firebase.google.com/docs/cloud-messaging/migrate-v1
- Supabase, Sending Push Notifications (FCM HTTP v1 from an edge function triggered by a Database Webhook). https://supabase.com/docs/guides/functions/examples/push-notifications

# Google Play (Android)

Package `com.crosswordclash.app`, published from the **Fable Designer**
organization Play account (the same account decision recorded in
`space-race/docs/play-store/account.md`: an organization account skips the
12-tester closed-test rule that blocks new personal accounts). The package name
locks to that account on first upload.

- Store page: https://play.google.com/store/apps/details?id=com.crosswordclash.app
- Play Console: app ID `4973846620766710663` under developer account
  `6294983081887284734` (sign in as the Fable Designer Google login, not the
  personal one; the console then lands on `/console/u/<n>/`).
- Live since October 13, 2026: release **2 (1.0.0)**, all 178 countries.
- Latest: **33 (1.1.3)**, sent for review November 17, 2026; see "History" below.

## What is in this folder

| File | Play Console field |
| --- | --- |
| `title.txt` | App name (30 max) |
| `short-description.txt` | Short description (80 max) |
| `full-description.txt` | Full description (4000 max) |
| `whats-new-<version>.txt` | Release notes for that release (500 max, inside `<en-US>` tags) |
| `icon-512.png` | App icon, 512×512 |
| `feature-graphic.png` | Feature graphic, 1024×500 |
| `screenshots/phone/` | Phone screenshots, 1080×2160 |
| `screenshots/tablet-10/` | Tablet screenshots, 1600×2560 (used for both the 7-inch and 10-inch slots) |

The screenshots were replaced on November 16, 2026 with eight captioned tiles
per set (the same series as `../app-store/README.md` describes: the app's own
screens in a device frame on the site's crossword backdrop, invented player
names, synthetic solves). Uploaded November 17, 2026 as `phone-NN-*.png` and
`tablet-NN-*.png` so the two sets are distinct in the asset library. The earlier
sets were emulator captures (Pixel 7 image, Android 16) of live games on
the production backend. None of them, and none of the text, names The New York
Times: third-party trademarks in store metadata are a common rejection. The
importer is disclosed only in reviewer notes (the iOS text in
`../app-store/review-notes.txt` applies to Play too) and no screenshot shows it.

## Build

```sh
pnpm mobile:sync
cd android
JAVA_HOME="/Applications/Android Studio.app/Contents/jbr/Contents/Home" \
  ./gradlew :app:bundleRelease
# -> android/app/build/outputs/bundle/release/app-release.aab
```

Release builds are signed with the Play **upload key** when the gitignored
`android/keystore.properties` and `android/upload-keystore.jks` exist; both are
backed up outside the repo in `~/CrosswordClash-PlayUpload-Key-BACKUP/`. Keep
that backup: with Play App Signing enabled (the default) a lost upload key can
be reset by Google, but only through a support request. Bump `versionCode` in
`android/app/build.gradle` for every upload (the iOS build number and Android
version code are bumped together, see `../testflight/README.md`).

Copies of uploaded bundles are kept as `artifacts/mobile/CrosswordClash-<version>-<versionCode>.aab`
(gitignored). Verify a bundle's signer with
`keytool -printcert -jarfile <aab>`; the owner must read `CN=Fable Designer LLC`.

Icons and splash screens for both platforms are generated from the iOS catalog
icon by `node scripts/build-app-art.mjs`.

## Release process

1. **Internal testing first.** Create the release on the internal testing track
   (Testing → Internal testing → Create new release), upload the bundle, paste
   the `whats-new-<version>.txt` notes, save, then roll out to the internal
   email list. Internal releases need no Google review and reach testers in
   minutes.
2. **Then production.** On the internal release use *Promote release →
   Production*, review the countries (all), confirm the notes, then *Start
   rollout to Production*. Google reviews the update (hours to a few days);
   managed publishing is **off**, so it goes live automatically on approval.
3. Listing, Data safety and other App content changes are staged in
   *Publishing overview* and go out with *Submit changes for review*. They can
   ride along with the production rollout or be sent on their own.
4. **The in-app "update available" banner needs nothing here.** The apps ask
   the store themselves (`src/lib/appUpdate.ts`, no server side). Play's
   in-app update API only recognises a build that was installed from Play
   under the same package name (`com.crosswordclash.app`) and the same
   signing as the live release, so keep the upload key and never sideload a
   build to test the banner; a device on an internal-testing track sees the
   track's newer build as the update.

## Status on October 21, 2026 (1.0.2, versionCode 4)

Done by Claude, nothing submitted or rolled out:

- Signed bundle built from `main` at `90ddb88` (versionCode 4, versionName
  1.0.2, target SDK 36, min 24). Copy at
  `artifacts/mobile/CrosswordClash-1.0.2-4.aab`; signer verified as the Fable
  Designer upload key.
- Bundle uploaded to the **internal testing** track as a **draft** release
  named `4 (1.0.2)` with the notes from `whats-new-1.0.2.txt`. Play parsed it
  as 4 (1.0.2), API 24+, target 36. Not rolled out.
- **Store listing** saved as *draft changes* (status "Live · Draft changes"):
  the full description now mentions the three dailies and sharing (matches
  `full-description.txt`), and the four tablet screenshots were uploaded to
  both the 7-inch and 10-inch slots, which the console now marks as required.
  Name, short description, icon, feature graphic and the five phone
  screenshots are unchanged. Category Game / Word, contact email and website
  unchanged.
- **Data safety** updated and saved to Publishing overview: *App activity →
  App interactions* added (collected, not shared, not ephemeral, required,
  purpose Analytics). This is the play-statistics row (`play_sessions`) that
  the apps started sending in 1.0.2: progress, active time, per-clue timings,
  wrong letters, platform label. The privacy policy already describes it
  ("Play statistics, on the website and in the apps"). Everything else in the
  form is as before. Publishing overview shows "Submit 1 change for review".
- Content rating, target audience (13+), ads (none), app access (no login)
  and the other App content declarations were re-checked: "all caught up",
  nothing changed.

### Done October 22, 2026 (driven through the console by Claude, each button on Andrew's say-so)

1. **Internal testers.** Email list `Internal` (2 addresses) created, attached to
   the internal testing track and saved. The track is Active.
2. **4 (1.0.2) rolled out to internal testing**, "Available to internal
   testers" from Oct 22 10:48 PM. The only release warning was the usual
   missing deobfuscation file.
3. **Listing draft saved** (full description, 7-inch and 10-inch tablet
   screenshots) into Publishing overview.
4. **Submitted for review**: those three listing changes plus the Data safety
   update, now "Changes in review". Google's quick checks run first (up to
   14 minutes), then the review itself, typically within 7 days.

5. **Promoted to production** (later the same evening, on Andrew's go-ahead):
   4 (1.0.2), 100% of users, all targeted countries, the internal release
   notes carried over. Saving it joined the review already in flight, so
   Google asked to restart that review; confirmed. Production, the listing
   changes and Data safety are now one review. Managed publishing is off, so
   it goes live on approval.

### Still to do

- Nothing in the console. Watch Publishing overview (or the email) for the
  review result; a rejection comes with the policy reason.

### Follow-ups outside the Play Console

- The iOS App Privacy answers (`../app-store/README.md`) predate the
  play-statistics rows too; App Store Connect should gain *Usage Data →
  Product Interaction* for Analytics, not linked, not tracking, before the
  next iOS App Store submission.

## Play Console answers

- **App or game / category:** Game, Word. Free. Contact email as on the
  website's Support page; website `https://crosswordclash.com`.
- **Privacy policy:** `https://crosswordclash.com/privacy`
- **App access:** all functionality is available without special access (no
  login).
- **Ads:** No, the app contains no ads.
- **Content rating questionnaire:** category Game; no violence, sexuality,
  language, controlled substances or gambling. Users can interact (multiplayer
  rooms, display names) but there is no free-text chat and no sharing of
  location or personal info. Once community puzzles are on
  (`VITE_COMMUNITY=1`) the app shows player-published puzzles: answer the
  user-generated-content questions as moderated content with in-app
  reporting and blocking (Report on every puzzle page, Hide this author), per
  Play's UGC policy; publishing is web-only.
- **Target audience:** 13 and over only. Do not opt in to Designed for
  Families.
- **Data safety:** data is collected and is encrypted in transit; users can
  request deletion (Support page). Collected, not shared, required:
  - *Personal info → User IDs* (anonymous player ID), App functionality.
  - *App activity → Other user-generated content* (display name), App
    functionality.
  - *App activity → Other actions* (game progress, leaderboard times), App
    functionality.
  - *App activity → App interactions* (play statistics per puzzle and clue,
    platform label), Analytics. Added for 1.0.2.
  - *Device or other IDs* (the FCM push token and the Firebase installation
    id; Google is the service provider, so not "shared"), required for
    notifications, App functionality. Submitted for review 2026-10-31 (the
    Data safety page is `app-content/data-privacy-security` under the app;
    the Save on its Preview step only stages the change, Publishing
    overview's "Submit changes for review" sends it). The Android 13
    notification permission itself needs no declaration.
  No data is used for advertising; the Android build has no ads SDK, no Google
  Analytics and no crash reporting.
- **News app, COVID-19, government, financial, health:** No to each.

## History

- **October 9, 2026:** app record created, listing and declarations filled,
  bundle 2 (1.0.0, with the NYT subscriber check) sent for review.
- **October 13, 2026:** approved and live.
- **October 14–16, 2026:** bundle 3 (1.0.1, daily feed from the website)
  uploaded to internal testing and rolled out there on October 16, with no
  tester list.
- **October 21, 2026:** bundle 4 (1.0.2) drafted on internal testing; listing
  and Data safety changes staged.
- **October 22, 2026:** tester list created, 4 (1.0.2) rolled out to internal
  testing, listing + Data safety changes submitted for review, then 4 (1.0.2)
  promoted to production in the same review.
- **October 23, 2026:** Google approved; 4 (1.0.2) live in 178 countries.
- **October 31 – November 3, 2026:** 1.1.0 internal builds 10–20 uploaded and
  rolled out on the internal track through the Play Developer API
  (`play-upload.mjs` with the play-publisher service account); 10 (1.1.0)
  reached production in between.
- **November 4, 2026:** 20 (1.1.0) rolled out to production (100%) through the
  API (`edits` → `tracks/production` PUT with `whats-new-1.1.0.txt` → commit).
  Release notes are capped at 500 characters; the first two drafts were
  refused at the commit for 868 and 524.
- **November 11, 2026:** 21 (1.1.1) on the internal track and in production.
- **November 14, 2026:** 22 (1.1.2) built on the Mac Studio, uploaded through
  the console (see "Uploading without the API" below), rolled out to internal
  testing with `whats-new-1.1.2-internal-22.txt`, then promoted to production
  (100%) with the same notes and sent for review. Managed publishing is off,
  so it goes live on approval.
- **November 17, 2026:** 33 (1.1.3) uploaded through the console and rolled out
  to internal testing with `whats-new-1.1.3.txt`, then promoted to production
  (100%, all countries) with the same notes. The listing got the new short and
  full descriptions and the eight-tile sets in the phone, 7-inch and 10-inch
  slots. All six changes were sent for review together. The asset library
  adds uploads to a slot in the order they finish, so upload one file per
  call to keep the order.
  The listing's AI asset declaration already read "Label assets as created or
  edited using AI" and was not editable on the review step; no individual
  asset was labelled. Later the same day the listing's Video field was set to
  the 16:9 reel (https://www.youtube.com/watch?v=XmGX4YKABBs, see
  `../marketing/README.md`). Sending that change cancelled and restarted the
  review that was in progress, so all seven changes are in one review. Then tile 06 was swapped in the
  phone, 7-inch and 10-inch slots (`06-keyboard` out, `06-studio` in: "Make
  your own crossword") and the review was restarted once more with those three
  screenshot changes. To keep the order, tiles 06 to 08 were removed and
  uploaded again one file at a time.

- **November 18, 2026:** 34 (1.1.3) uploaded through the console and rolled out
  to internal testing with `whats-new-1.1.3-internal-34.txt` (the one race
  dialog and the shared-link landings). Not promoted to production. Built on
  the Studio with `ANDROID_HOME=~/Library/Android/sdk` and
  `JAVA_HOME=/opt/homebrew/opt/openjdk@21`.

- **November 18, 2026:** 35 (1.1.4) uploaded through the console and rolled out
  to internal testing with `whats-new-1.1.4-internal-35.txt` (the consistency
  and audit passes, #320 to #328). Not promoted to production.

- **November 20, 2026:** 40 (1.1.4) uploaded through the console to the
  internal testing draft (it replaced the unpublished 39) with
  `whats-new-1.1.4.txt`, then rolled out to internal testing on Andrew's
  say-so. Not promoted to production. The store listing's
  phone, 7-inch and 10-inch screenshot slots were replaced with the eight new
  tiles each (`screenshots/phone`, `screenshots/tablet-10`: the leaderboard is
  in, the community list and the archive are out) and saved as draft changes,
  not sent for review. The Foldable Screenshots slot is empty.

## Uploading without the API

The play-publisher service-account key and `play-upload.mjs` live on the
MacBook only. From any other machine, upload through the console in a Chrome
that is signed in as the Fable Designer login (it may not be account 0; try
`/console/u/<n>/` until the app loads):

1. Test and release → Internal testing → Create new release, drop the `.aab`
   on "Upload app bundles", paste the notes, Next, Save and publish.
2. Promote release → Production, Next, Save, then Publishing overview →
   Submit for review.

Claude in Chrome's `file_upload` refuses more than 10 MB per call and the
bundle is about 12 MB. Split it (`split -b 6500000`), upload each part to a
temporary `<input type=file>` added to the page, join them with
`new File([a, b], name)`, check the SHA-256 against the bundle on disk, then
set the result on the console's `input[accept=".aab"]` with a `DataTransfer`
and dispatch `change`.

On a machine where Android Studio bundles JDK 25, Gradle fails with
"Unsupported class file major version 69"; build with
`JAVA_HOME=/opt/homebrew/opt/openjdk@21` instead.

## Known gaps

- The NYT importer has never been exercised on Android with a real subscriber
  sign-in, and the app has only ever run on an emulator and a Kindle Fire.
- The Play listing cannot be created or filled through an API; everything
  above is driven through the console.

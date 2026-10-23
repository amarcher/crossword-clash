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
- Current work: **4 (1.0.2)**, see "Status" below.

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

Screenshots are emulator captures (Pixel 7 image, Android 16) of live games on
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

### What Andrew does in the Play Console

In this order. Every step below is a submit or rollout button, which is why
it is left to him.

1. **Internal testers.** Testing → Internal testing → *Testers* tab → *Create
   email list*, add the tester addresses, save. The track has never had a
   list, so release 3 (1.0.1) reached nobody either.
2. **Roll out 4 (1.0.2) to internal testing.** Releases tab → *Edit release*
   on the draft → *Next* → *Start rollout to Internal testing*. Install it on a
   Play device from the opt-in link on the Testers tab and run through
   `../testflight/WHAT-TO-TEST-9.txt` (the Android build has the same web
   code).
3. **Publish the listing draft.** Store presence → Store listings → Default
   store listing → *Edit listing* → check the description and the tablet
   screenshots → *Next* → *Save*. That stages it in Publishing overview.
4. **Submit the staged changes.** Publishing → Publishing overview → *Submit
   changes for review* (Data safety, and the listing once step 3 is done).
5. **Production.** Once internal testing looks right: Internal testing →
   *Promote release → Production* → confirm countries and notes → *Start
   rollout to Production*. Or do steps 4 and 5 together from Publishing
   overview.

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
  location or personal info.
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
  and Data safety changes staged (above).

## Known gaps

- The NYT importer has never been exercised on Android with a real subscriber
  sign-in, and the app has only ever run on an emulator and a Kindle Fire.
- The Play listing cannot be created or filled through an API; everything
  above is driven through the console.

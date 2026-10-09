# Google Play submission (Android 1.0.0)

Package `com.crosswordclash.app`, published from the **Fable Designer**
organization Play account (the same account decision recorded in
`space-race/docs/play-store/account.md`: an organization account skips the
12-tester closed-test rule that blocks new personal accounts). The package name
locks to that account on first upload.

## What is in this folder

| File | Play Console field |
| --- | --- |
| `title.txt` | App name (30 max) |
| `short-description.txt` | Short description (80 max) |
| `full-description.txt` | Full description (4000 max) |
| `icon-512.png` | App icon, 512×512 |
| `feature-graphic.png` | Feature graphic, 1024×500 |
| `screenshots/phone/` | Phone screenshots, 1080×2160 |
| `screenshots/tablet-10/` | 10-inch tablet screenshots, 1600×2560 |

Screenshots are emulator captures (Pixel 7 image, Android 16) of live games on
the production backend. None of them, and none of the text, names The New York
Times.

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
`android/app/build.gradle` for every upload.

Icons and splash screens for both platforms are generated from the iOS catalog
icon by `node scripts/build-app-art.mjs`.

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
  request deletion (Support page). Collected, not shared, required, for App
  functionality: *Personal info → User IDs* (anonymous player ID), *App
  activity → Other user-generated content* (display name) and *App activity →
  Other actions* (game progress, leaderboard times). No data is used for
  advertising or analytics; the Android build has no analytics or ads SDKs.
- **News app, COVID-19, government, financial, health:** No to each.

## Status on October 9, 2026

Signed release bundle (versionCode 1, versionName 1.0.0) builds and passes
lint. The debug build was run on an arm64 emulator for the screenshots: menu,
classics, solo play, lobby and a three-player race all worked.

## Known gaps

- The NYT importer has never been exercised on Android with a real subscriber
  sign-in, and the app has never run on a physical Android device.
- The Play listing cannot be created or filled through an API; the app record
  is created in Play Console.

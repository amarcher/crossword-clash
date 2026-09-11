# Native NYT import prototype

## What is implemented

- Capacitor 8 iOS and Android projects, application ID `com.crosswordclash.app`.
- Native-only entry on the menu and import hub. Choose a dated Daily or Mini.
- A separate NYT browser with persistent website storage, an explicit Import
  button, a Close button, and a return-to-selected-puzzle action.
- NYT email sign-in stays on NYT. External identity-provider navigation is not
  supported by this prototype; no Safari/Chrome/NYT-app cookies are copied.
- The importer runs the bundled extractor on request, using the current NYT
  page's session. No backend proxies, cookie exports, automatic retries,
  alternate endpoints on access denial, or remote extractor downloads.
- Successful imports are validated and saved to an app-local inbox before
  showing the puzzle. Cancelling preserves the previous import.
- Solo play and restored solo progress for these imports remain local.
- Choosing the existing hosting or challenge-sharing options sends a puzzle
  copy to participants. The play picker explains that behavior. Per-participant
  imports and matching without puzzle redistribution are **not implemented**.
- English and Spanish app/native controls. The NYT website manages its own UI.

This is a development prototype, not a released app. It does not establish NYT
authorization or App Store/Play approval.

## Build and run

Prerequisites: Node 22+, pnpm, Xcode, Android Studio with Java 21 and Android SDK
36. Capacitor dependencies are locked in `pnpm-lock.yaml`.

```sh
pnpm install --frozen-lockfile
pnpm mobile:sync
pnpm mobile:ios
pnpm mobile:android
```

`mobile:sync` builds the extractor, builds the React app in mobile mode, and
copies assets into both native projects. Mobile builds omit web analytics and
AdSense. Standard `pnpm build` remains the website build. Run `mobile:sync`
before native builds after changing shared source; do not copy a web build
into the native projects accidentally.

For Android, set `sdk.dir` in ignored `android/local.properties`. Use Java 21
(Android Studio's bundled runtime works), then:

```sh
cd android
./gradlew :app:assembleDebug :app:lintDebug
```

APK: `android/app/build/outputs/apk/debug/app-debug.apk`.

Unsigned iPhone simulator build:

```sh
xcodebuild -project ios/App/App.xcodeproj -scheme App \
  -sdk iphonesimulator -configuration Debug \
  -derivedDataPath ios/DerivedData CODE_SIGNING_ALLOWED=NO build
```

Physical iPhone installation requires selecting the appropriate signing team
in Xcode. No signing identity, provisioning profile, or store listing was
configured by this change. Generated app icons remain Capacitor defaults.

## Subscriber verification

1. Open Clash → Import from NYT. Select an edition and open NYT.
2. Sign in **on NYT's page**, using an existing subscriber account. Do not put
   credentials into chat, logs, fixtures, or source files.
3. Tap Selected puzzle if login doesn't return to it. Confirm the displayed
   edition and tap Import this puzzle.
4. Confirm title, author, dimensions, numbering and clues in Clash; play solo.
5. Close and reopen the app. Confirm the inbox and solo progress persist.
6. Import a different edition without signing in again while the session is
   valid. Repeat after backgrounding and changing networks.
7. Test cancellation, an inaccessible edition, an expired session and a slow
   connection. No partial or unsupported puzzle should replace the inbox.

A subscriber import, retained NYT sign-in across app updates/restarts, and
restored solo progress were verified on the iPhone simulator on September 11,
2026 (details below). Android subscriber sign-in and physical-device
verification remain outstanding.

## Isolation and data boundaries

The game uses Capacitor's normal bridged local view. NYT runs in a different
WKWebView (iOS) or WebView activity (Android) with no Capacitor bridge and no
`addJavascriptInterface`. Never add NYT to `server.allowNavigation`, enable
Capacitor cookie interception, or expose the game bridge to the publisher page.

Main-frame navigation permits HTTPS NYT domains only. Extraction requires the
exact `www.nytimes.com` origin and a dated Daily/Mini path. iOS uses an isolated
WebKit content world. Android evaluates the bundled script and polls a random
per-attempt result slot; navigation invalidates the attempt. Native timeouts
bound the wait. Only normalized puzzle fields cross into the game.

The inbox contains the latest imported puzzle, not credentials. It uses the
app's local web storage. NYT cookies stay in the native browser's website
storage; Android OS app backup is disabled. iOS default app/device backup
behavior is unchanged. Persistence is not cross-device sync.

## Known scope and limitations

- The NYT endpoint is undocumented. Live responses can change independently
  of our app; failures return actionable errors and keep the existing inbox.
- Currently supports standard single-letter A–Z puzzles, dimensions 2–35.
  Rebus/nonalphabetic cells fail explicitly. Special artwork, bars, complex
  clue markup, and NYT-specific cell-style encodings need live compatibility
  verification; do not claim complete themed-puzzle fidelity.
- Date selection is explicit, initially using New York's calendar date. It
  does not infer the next edition from NYT's evening release schedule.
- Email login is the initial path. Google, Apple and work/school identity
  redirects require separate supported authentication design and testing.
- A valid import is not independent proof of an active subscription.
- Safari Share extension, Android incoming shares, public matchmaking,
  per-participant puzzle imports and authoritative race validation are later
  work. This prototype retains the current multiplayer implementation.

## Tests

```sh
pnpm test
# With one selected Android emulator/device:
ANDROID_SERIAL=emulator-5554 ./android/gradlew -p android \
  :app:connectedDebugAndroidTest \
  -Pandroid.testInstrumentationRunnerArguments.class=com.crosswordclash.app.NytImporterInstrumentedTest
```

Fixtures are synthetic puzzles. Tests cover extraction, origin/date validation,
denied access, malformed results, account-field exclusion, cancellation,
inbox restoration, and preventing solo imports from writing to Supabase.
Android instrumentation verifies the real separate browser configuration and
packaged extractor. These tests are not a substitute for subscriber sign-in.

Local build logs and screenshots belong under ignored `artifacts/mobile/`.

### Verification recorded September 10, 2026

- TypeScript, mobile bundle build and 638 Vitest tests passed.
- iOS simulator build passed for the generated Xcode project.
- On iPhone 17 Pro / iOS 26.5 Simulator, menu → import hub → edition picker →
  native NYT browser → actual NYT subscriber page → email sign-in form was
  observed. Subscriber sign-in remains pending.
- Android debug APK build and `:app:lintDebug` passed (default-template and
  WebView-review warnings remain). Two importer instrumentation tests passed
  on an Android 16 ARM emulator.
- The Android app's menu rendered with the native import entry available.
- The built mobile HTML retains the app script, omits web analytics, and native
  configuration enables neither remote bridged navigation nor cookie interception.
- No physical-device subscriber import, account-session retention test, store
  upload, production deployment, or external publication has been completed.

### Verification recorded September 11, 2026

- Reproduced the subscriber's FORMAT error on the September 10 Daily edition.
  The live v6 response stores `body[0].clues` as an indexed array (70 clues),
  while the importer incorrectly required an object. Grid dimensions, date,
  single-letter answers, and cell labels passed the existing checks.
- The shared parser now accepts indexed arrays and older ID-keyed objects,
  retaining individual clue, cell, and edition validation. Synthetic regression
  tests cover successful array import and malformed/missing array entries.
- Rebuilt and installed the repaired iOS app without clearing its data. Using
  the retained NYT session, Import succeeded directly from the NYT landing
  screen without first pressing Play. Clash showed September 10, Simeon Seigel,
  a 15×15 grid, and 35 Across / 35 Down clues.
- Opened solo play, entered a correct letter, terminated and relaunched the
  app, and observed the same puzzle and saved letter. Removed the temporary
  test letter afterward and left the puzzle open for the subscriber.
- All 640 Vitest tests, mobile asset/type-check build, iOS simulator build,
  and Android debug build/lint passed. The repaired Android APK includes the
  shared parser, but subscriber import on Android was not exercised here.
- Temporary diagnostics inspected only response structure, not credentials;
  no publisher puzzle payload was saved as a test fixture. Diagnostic code
  was removed before building the repaired app.

## References

- [Capacitor custom iOS code](https://capacitorjs.com/docs/ios/custom-code)
- [Capacitor custom Android code](https://capacitorjs.com/docs/android/custom-code)
- [Android WebView](https://developer.android.com/develop/ui/views/layout/webapps/webview)
- [Apple WKWebView](https://developer.apple.com/documentation/webkit/wkwebview)

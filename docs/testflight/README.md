# iOS TestFlight release

- App Store Connect: [Crossword Clash: Play Together](https://appstoreconnect.apple.com/teams/69a6de96-d39f-47e3-e053-5b8c7c11a4d1/apps/6811111993/testflight)
- Apple ID: `6811111993`
- Bundle identifier: `com.crosswordclash.app`
- Owner: Andrew Archer, team `J39B2498YF` (personal account, alongside Space Race).
- Listing name includes “Play Together” because “Crossword Clash” was unavailable.
  The device display name remains Crossword Clash.
- Initial version/build: `1.0.0 (1)`, iPhone and iPad, iOS 15+.
- Intended audience: external friends and family. First external build requires
  Apple's TestFlight beta review; upload or processing success alone does not
  make a build available to these testers.

## Rebuild

Increment `CURRENT_PROJECT_VERSION` in the Xcode project before each upload.
Use a new archive path so prior artifacts remain available.

```sh
pnpm mobile:sync
xcodebuild -project ios/App/App.xcodeproj -scheme App \
  -configuration Release -destination 'generic/platform=iOS' \
  -derivedDataPath ios/DerivedData \
  -archivePath artifacts/mobile/CrosswordClash-1.0.0-1.xcarchive archive
xcodebuild -exportArchive \
  -archivePath artifacts/mobile/CrosswordClash-1.0.0-1.xcarchive \
  -exportPath artifacts/mobile/testflight-export \
  -exportOptionsPlist ios/ExportOptions-TestFlight.plist \
  -allowProvisioningUpdates
```

The checked-in export options produce a local signed IPA. Upload is a separate
operation: use Xcode Organizer or a copy of the export options with
`destination` set to `upload`. Keep the intended Apple account explicit.
`-allowProvisioningUpdates` uses Xcode's configured account to obtain signing
profiles. No authentication keys, passwords, or private certificates belong in
this repository.

The app icon is the "Tile duel" artwork (two C tiles and a lightning bolt on
blue), checked in as the single 1024px opaque RGB PNG in
`ios/App/App/Assets.xcassets/AppIcon.appiconset/`. Xcode generates every size
from it and iOS masks the corners, so replace that file to change the icon.
The website favicon and touch icon in `public/` are exports of the same art.

## Review material

- `BETA-DESCRIPTION.txt`: TestFlight beta app description.
- `REVIEW-NOTES.txt`: Apple beta-review steps, including optional NYT behavior.
- `WHAT-TO-TEST.txt`: build-specific tester instructions.
- Contact phone and feedback email should be provided by the owner in App Store
  Connect, not checked into the repository.

## Verification

September 11, 2026: Release archive and App Store signed IPA export succeeded.
Verified bundle identifier, version/build, iPhone/iPad support, bundled native
NYT extractor, absence of the web analytics script, and Capacitor/Cordova
privacy manifests. Code-signature verification passed. App icon is a 1024px
RGB PNG without alpha. The app uses system HTTPS and WebCrypto APIs; the
`ITSAppUsesNonExemptEncryption` declaration is false.

The shared app passed all 640 tests before this release preparation. Live NYT
subscriber import and solo progress restoration were verified in the iPhone
simulator; physical-device verification remains part of this beta.

See `../NATIVE-NYT-IMPORT.md` for importer behavior and current limitations.

### Current handoff, September 11, 2026

- Apple accepted the upload at 12:10 PM Eastern. Processing completed and build
  `1.0.0 (1)` is **Ready to Submit** for external beta review.
- Build ID: `500b67ca-8faf-4492-947a-f98d3010e922`.
- External group: **Friends and Family**,
  `78f6022f-d97f-494a-a09f-1bd0687915be`.
- Required prerequisite internal group: **Development**,
  `e9a9d2b9-67e4-4855-b54c-b247a480eb77`, with automatic distribution off.
- The owner supplied the review contact phone. Contact information, feedback
  email, and review notes were saved in App Store Connect without adding
  contact details to this repository. Review does not require a Clash login.
- Build `1.0.0 (1)` was submitted for external beta review with
  `WHAT-TO-TEST.txt` and attached to **Friends and Family**. Verified Apple
  status: **Waiting for Review**; group contains 1 build and 0 testers.
- Build 1 was subsequently enabled for the **Development** internal group
  (3 testers). The owner also enabled an external public invitation link.
  External availability still depends on Apple beta-review approval.
- Build 2 uploaded successfully with the NYT navigation fix, but was not
  assigned to testers before work expanded to the combined build 3.
- Local signed IPA: `artifacts/mobile/testflight-export/App.ipa`.
  SHA-256: `05297485a0b0a589bf42cde327dc6f5aa5aebca257510ad3aeb4ff760bd0e085`.

### Build 3: native input and TV joining

- Native letters-only keyboard appears with the puzzle. The active clue stays
  immediately above it; the grid fits the remaining viewport without page scroll.
- Native safe areas are handled explicitly, with a separate layout for short
  landscape screens and a clue sidebar on larger displays.
- NYT cross-host GET redirects stay in the embedded browser, avoiding app-link
  handoff. A fresh sign-in on a physical phone with NYT Games installed remains
  a required beta check. The original report confirmed authentication itself
  had succeeded despite the stuck loading page.
- Join as TV opens a read-only room display without creating a player. Native
  invitations now use the public website rather than the embedded app origin.
- 646 shared tests passed; mobile and web production builds passed. Native
  navigation policy tests and the iOS Release archive passed. Simulator input,
  active clue visibility, clue sheet, portrait/landscape layout, and lack of outer
  scrolling were checked, including a saved 15 by 15 NYT puzzle.
- A synthetic live room verified TV joining, scoring, refresh recovery, rematch,
  and closure; player count remained unchanged. Test rooms were closed afterward.
- Tester instructions: `WHAT-TO-TEST-3.txt`. Apple accepted build 3 at
  4:52 PM Eastern. Processing completed and build 3 was assigned to
  **Development** (3 internal testers); the group build table shows **Testing**.
  Build ID: `ffaaba3f-3f7d-49d1-bfcc-322ece82ab8b`. Test instructions were saved.
  Build 1 remains Waiting for Review for external testers; Apple blocks adding
  another build from this version to external review until that review ends.
- Website changes are committed locally; production publishing awaits owner
  approval. Commit: `74f9623` (application code).

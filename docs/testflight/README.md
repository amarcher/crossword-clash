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
node scripts/build-ios-icon.mjs
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

The icon renderer uses existing React/@vercel/og dependencies and macOS Swift
ImageIO for lossless RGB PNG encoding. It renders the existing blue C tile
identity with an opaque background, replacing the Capacitor template icon.

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
- No testers have been invited, no public invitation link has been enabled,
  and the build has not yet been submitted for external beta review.
- The external-build wizard requires the owner's feedback email and review
  contact phone/email. Those details have been requested. Description and
  marketing URL were saved; Apple did not save the review contact/note block
  while its required contact fields were incomplete. Review notes remain in
  this directory and in the prepared browser form.
- Finish contact information, save the review notes, add the build to Friends
  and Family, paste WHAT-TO-TEST.txt, and submit for beta review. Do not claim
  external tester availability until Apple approves the build.
- Local signed IPA: `artifacts/mobile/testflight-export/App.ipa`.
  SHA-256: `05297485a0b0a589bf42cde327dc6f5aa5aebca257510ad3aeb4ff760bd0e085`.

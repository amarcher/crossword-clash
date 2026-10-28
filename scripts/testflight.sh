#!/usr/bin/env bash
# Build the iOS app and upload it to TestFlight, in one go. macOS + Xcode only.
#
#   pnpm testflight            # sync, archive, upload
#   pnpm testflight --no-sync  # skip pnpm mobile:sync (web build already copied)
#   pnpm testflight --export   # sign a local IPA instead of uploading
#
# Signing and the upload use the Apple account signed in to Xcode
# (-allowProvisioningUpdates); nothing here reads a key or password.
# Bump CURRENT_PROJECT_VERSION in ios/App/App.xcodeproj before each upload.
set -euo pipefail
cd "$(dirname "$0")/.."

if [[ "$(uname)" != "Darwin" ]]; then
  echo "testflight: needs macOS with Xcode (this is $(uname))." >&2
  exit 1
fi
command -v xcodebuild >/dev/null || { echo "testflight: xcodebuild not found; install Xcode." >&2; exit 1; }

sync=1 plist=ios/ExportOptions-TestFlight-Upload.plist what=upload
for arg in "$@"; do
  case "$arg" in
    --no-sync) sync=0 ;;
    --export) plist=ios/ExportOptions-TestFlight.plist what=export ;;
    *) echo "testflight: unknown option $arg" >&2; exit 2 ;;
  esac
done

pbx=ios/App/App.xcodeproj/project.pbxproj
version=$(sed -n 's/.*MARKETING_VERSION = \([^;]*\);.*/\1/p' "$pbx" | head -1)
build=$(sed -n 's/.*CURRENT_PROJECT_VERSION = \([^;]*\);.*/\1/p' "$pbx" | head -1)
archive="artifacts/mobile/CrosswordClash-$version-$build.xcarchive"
export_dir="artifacts/mobile/testflight-$what-$version-$build"

if [[ -e "$archive" ]]; then
  echo "testflight: $archive already exists; bump CURRENT_PROJECT_VERSION or remove it first." >&2
  exit 1
fi

echo "== Crossword Clash $version ($build): $what"
if [[ $sync == 1 ]]; then pnpm mobile:sync; fi

xcodebuild -project ios/App/App.xcodeproj -scheme App \
  -configuration Release -destination 'generic/platform=iOS' \
  -derivedDataPath ios/DerivedData \
  -archivePath "$archive" -allowProvisioningUpdates archive

xcodebuild -exportArchive \
  -archivePath "$archive" \
  -exportPath "$export_dir" \
  -exportOptionsPlist "$plist" \
  -allowProvisioningUpdates

if [[ $what == upload ]]; then
  echo "== Uploaded $version ($build). Processing takes a few minutes; then assign the build to a group in App Store Connect:"
  echo "   https://appstoreconnect.apple.com/apps/6811111993/testflight"
else
  echo "== Signed IPA in $export_dir"
fi

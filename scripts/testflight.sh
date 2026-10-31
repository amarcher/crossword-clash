#!/usr/bin/env bash
# Build the iOS app and upload it to TestFlight, in one go. macOS + Xcode only.
#
#   pnpm testflight            # sync, archive, upload
#   pnpm testflight --no-sync  # skip pnpm mobile:sync (web build already copied)
#   pnpm testflight --export   # sign a local IPA instead of uploading
#
# Signing uses the local distribution certificate; App Store Connect access for
# the export and the upload comes from the ASC_API_* key (never the Apple account
# signed in to Xcode, whose session expires). Nothing here reads a password.
# Bump CURRENT_PROJECT_VERSION in ios/App/App.xcodeproj before each upload.
set -euo pipefail
cd "$(dirname "$0")/.."

if [[ "$(uname)" != "Darwin" ]]; then
  echo "testflight: needs macOS with Xcode (this is $(uname))." >&2
  exit 1
fi
command -v xcodebuild >/dev/null || { echo "testflight: xcodebuild not found; install Xcode." >&2; exit 1; }

# The SDK the app is built with decides how it looks on the iPhone Duo: a build
# from Xcode 26 or earlier runs letterboxed at phone size on the inner screen,
# one from the iOS 27.1 SDK (Xcode 27.1) fills it, with no code change. Builds
# up to 21 came from Xcode 26.6; refuse to make another one like them.
min_xcode=27.1
xcode=$(xcodebuild -version | sed -n 's/^Xcode \([0-9][0-9.]*\).*/\1/p')
if [[ -z "$xcode" ]] || [[ "$(printf '%s\n' "$min_xcode" "$xcode" | sort -V | head -1)" != "$min_xcode" ]]; then
  echo "testflight: Xcode ${xcode:-?} is active; ${min_xcode} or later is needed (full screen on iPhone Duo). Install it, or point xcode-select at it." >&2
  exit 1
fi

# The web build bakes feature switches in from .env.local; an app built
# without one ships with that feature silently missing (builds 11–19 had no
# community puzzles and no Publish because VITE_COMMUNITY was never set here).
# Keep this list equal to the switches production (Vercel) has on.
for flag in VITE_PLUS VITE_COMMUNITY; do
  if ! grep -q "^${flag}=1" .env.local 2>/dev/null; then
    echo "testflight: .env.local must set ${flag}=1 (production has it on); refusing to build an app without it." >&2
    exit 1
  fi
done

: "${ASC_API_KEY_ID:?set ASC_API_KEY_ID (the App Store Connect API key for the personal team)}"
: "${ASC_API_ISSUER_ID:?set ASC_API_ISSUER_ID}"
[[ -f "$HOME/.appstoreconnect/private_keys/AuthKey_${ASC_API_KEY_ID}.p8" ]] || { echo "testflight: ~/.appstoreconnect/private_keys/AuthKey_${ASC_API_KEY_ID}.p8 is missing." >&2; exit 1; }

sync=1 plist=ios/ExportOptions-TestFlight.plist what=upload
for arg in "$@"; do
  case "$arg" in
    --no-sync) sync=0 ;;
    --export) what=export ;;
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

# The archive signs with the same API key: a new capability on the App ID
# (Associated Domains, build 25) needs a regenerated profile, and without the
# key Xcode asks an Apple account that may have expired ("No Accounts").
xcodebuild -project ios/App/App.xcodeproj -scheme App \
  -configuration Release -destination 'generic/platform=iOS' \
  -derivedDataPath ios/DerivedData \
  -archivePath "$archive" -allowProvisioningUpdates \
  -authenticationKeyPath "$HOME/.appstoreconnect/private_keys/AuthKey_${ASC_API_KEY_ID}.p8" \
  -authenticationKeyID "$ASC_API_KEY_ID" \
  -authenticationKeyIssuerID "$ASC_API_ISSUER_ID" \
  archive

# Export signs with the App Store Connect API key, never the Apple account
# signed in to Xcode: that session expires without warning ("Failed to Use
# Accounts" stopped build 23 on 2026-10-30), the key does not. The upload goes
# through altool with the same key for the same reason.
xcodebuild -exportArchive \
  -archivePath "$archive" \
  -exportPath "$export_dir" \
  -exportOptionsPlist "$plist" \
  -allowProvisioningUpdates \
  -authenticationKeyPath "$HOME/.appstoreconnect/private_keys/AuthKey_${ASC_API_KEY_ID}.p8" \
  -authenticationKeyID "$ASC_API_KEY_ID" \
  -authenticationKeyIssuerID "$ASC_API_ISSUER_ID"

if [[ $what == upload ]]; then
  xcrun altool --upload-app -f "$export_dir/App.ipa" -t ios --apiKey "$ASC_API_KEY_ID" --apiIssuer "$ASC_API_ISSUER_ID"
  echo "== Uploaded $version ($build). Processing takes a few minutes; then assign the build to a group in App Store Connect:"
  echo "   https://appstoreconnect.apple.com/apps/6811111993/testflight"
else
  echo "== Signed IPA in $export_dir"
fi

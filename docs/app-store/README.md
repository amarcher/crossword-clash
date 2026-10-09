# App Store submission (iOS 1.0.0)

Everything here feeds the App Store Connect record for
[Crossword Clash: Play Together](https://appstoreconnect.apple.com/apps/6811111993/distribution)
(Apple ID `6811111993`, bundle `com.crosswordclash.app`, team `J39B2498YF`).
Build and signing mechanics live in [../testflight/README.md](../testflight/README.md).

## What is in this folder

| File | App Store Connect field |
| --- | --- |
| `subtitle.txt` | App Information → Subtitle (30 max) |
| `promotional-text.txt` | Version → Promotional Text (170 max) |
| `description.txt` | Version → Description |
| `keywords.txt` | Version → Keywords (100 max) |
| `review-notes.txt` | Version → App Review Information → Notes |
| `screenshots/iphone-6.9/` | 6.9" iPhone set, 1320×2868 |
| `screenshots/ipad-13/` | 13" iPad set, 2064×2752 |

Other values saved on the draft: category Games (Word, Puzzle), copyright
`2026 Andrew Archer`, marketing URL `https://crosswordclash.com`, support URL
`https://crosswordclash.com/support`, privacy policy URL
`https://crosswordclash.com/privacy`, version string `1.0.0`.

The listing text deliberately never names The New York Times: third-party
trademarks in metadata or screenshots are a common rejection. The importer is
disclosed in the review notes instead, and no screenshot shows it.

## State on October 8, 2026

Saved to the App Store Connect draft through the API: all text fields above,
the category, the review contact (copied from the TestFlight review record) and
notes, and both screenshot sets. Nothing has been submitted for review.

Screenshots are real simulator captures (iPhone 17 Pro Max, iPad Pro 13-inch
M5) of live games on the production backend, with the alpha channel removed.

## Still to do, in order

1. Decide whether 1.0 ships with the NYT importer (see the risk note below).
2. Merge and deploy the website so `https://crosswordclash.com/support` exists
   before review; Apple opens the support URL.
3. Upload build 4 (`CURRENT_PROJECT_VERSION = 4`) and attach it to version
   1.0.0.
4. In App Store Connect, the parts the API does not cover:
   - **App Privacy.** Suggested answers: data is collected; *Identifiers →
     User ID* (the anonymous Supabase ID) and *User Content → Gameplay Content*
     (display name, game progress, leaderboard times), both for App
     Functionality, not linked to identity, not used for tracking. This matches
     `ios/App/App/PrivacyInfo.xcprivacy`.
   - **Age rating** questionnaire. Everything is "None"/"No"; the one judgement
     call is User-Generated Content, since display names are visible to others.
   - **Content rights** declaration.
   - **Pricing and availability**: Free, and the territories to sell in.
5. Submit for review.
6. After approval: set `IOS_APP_STORE_URL` in `src/lib/platform.ts` (turns on
   the menu row for iPhone and iPad web visitors) and add the Smart App Banner
   meta tag to `index.html`.

## Review risks

- **NYT importer (guideline 5.2, third-party content).** TestFlight beta review
  approved build 1 with it, but App Review is stricter and could reject an app
  that reads content from a publisher's site without that publisher's
  permission. Shipping 1.0 without it and adding it in an update would remove
  the largest rejection risk.
- **Web wrapper (guideline 4.2).** Mitigated by the native crossword keyboard,
  bundled puzzles that work offline and saved progress.
- **User-generated content (guideline 1.2).** Display names are filtered
  (`src/lib/nameFilter.ts`), and the Support page gives a reporting contact.
- The privacy policy and terms are still marked as unreviewed drafts in
  `src/screens/legal/legalContent.ts`.

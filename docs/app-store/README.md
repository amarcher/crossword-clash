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
| `screenshots/iphone-duo-outer/` | iPhone Duo outer display set, 1398×2034 |
| `screenshots/iphone-duo-inner/` | iPhone Duo inner display set, 2007×2853 |

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

The October screenshots were real simulator captures (iPhone 17 Pro Max, iPad Pro 13-inch
M5) of live games on the production backend, with the alpha channel removed.

## Screenshots and reel for 1.1.3 (November 16, 2026)

Both sets were replaced with eight captioned tiles each (01-race-friends …
08-archive; 06-studio, 07 and 08 are the Plus tiles). Each tile is the app's own screen,
captured from the web build running in native mode at the device's pixel
size, set in a device frame on the site's crossword backdrop. Player names
are invented and their solves are synthetic, so no real player appears. The
race tile uses the November 15 Midi because the November 16 one has NYT as an
answer.

## 1.1.3 (November 17, 2026): sent for review with build 52

Through the App Store Connect API, on Andrew's go-ahead: version 1.1.3 created
with build 52 attached (release after approval, as 1.1.2 was), then the
description, promotional text, `whats-new-1.1.3.txt`, the review notes and both
eight-tile screenshot sets (all sixteen processed), then a review submission
with the version as its one item. State after the submit: WAITING_FOR_REVIEW.
The review notes are capped at 4000 characters; the Plus paragraph now lists
the benefits the paywall shows in this build.

Later the same day, at Andrew's request, the submission was withdrawn before a
reviewer picked it up, tile 06 was swapped in both sets (`06-keyboard` out,
`06-studio` in: "Make your own crossword", a third Plus tile showing the
studio with a finished 9×9) and the version was submitted again. Nothing else
changed. Apple's API answered 500 to about half the calls that afternoon; every
step is safe to repeat.

`../marketing/crossword-clash-reel.mp4` is the matching 28.5-second promo
reel (1080×1920, 30 fps). Its music was synthesized for it, so nothing is
licensed. It is a marketing video, not an App Preview: it shows a TV, device
frames and store badges, which App Previews do not allow.

## Screenshots for the next version (November 20, 2026)

Every set was rebuilt with `pnpm store:shots` after two tiles were added:
`race-a-solve` ("Race anyone's finished solve": a midi being raced against
three finished solves, their squares marked as they fill) and `community`
("Solve what players make": the community list). The studio tile now ends
"Then publish it." Apple's sets hold ten tiles; Play takes eight per device,
so the Play sets leave out the leaderboard and the archive
(`tilesFor` in `scripts/store-shots/compose.mjs`).

| | Apple (10) | Play (8) |
| --- | --- | --- |
| Race friends on one grid | 01 | 01 |
| Three new crosswords a day | 02 | 02 |
| Race anyone's finished solve | 03 | 03 |
| See who got there first | 04 | 04 |
| Game night on the big screen | 05 | 05 |
| Climb the daily leaderboard | 06 | |
| Solve what players make | 07 | 06 |
| Make your own crossword (Plus) | 08 | 07 |
| Know your solving stats (Plus) | 09 | 08 |
| Play every past daily (Plus) | 10 | |

The community list's six puzzles are invented (`COMMUNITY` in `stage.mjs`),
like the names on the board: on the day of the capture the real list held one
puzzle. The solve being raced shows 13 Across in its clue bar because the
puzzle's other early clues name a film, a band and a team. A capture's visits
are no longer recorded as play (`play_sessions`, `narrator_sessions` and
`solo_progress` writes are blocked in `cap.mjs`). Nothing is uploaded yet.

## Regenerating the screenshots (`pnpm store:shots`)

Added November 18, 2026 with the two iPhone Duo sets (Apple requires Duo
screenshots from April 2027; these are not uploaded yet). One command rebuilds
the tiles from the app as it is in the checkout, so a set can be refreshed
before any submission:

```sh
pnpm store:shots                      # all six sets, into the docs folders
pnpm store:shots duoOuter,duoInner    # only those sets
pnpm store:shots --out /tmp/tiles     # somewhere else, to look before replacing
pnpm store:shots --no-room            # skip the room; its two tiles stay as they are
```

Sets: `iphone`, `ipad`, `duoOuter`, `duoInner` (this folder) and `android`,
`tablet` (`../play-store/screenshots`). The scripts are in
`scripts/store-shots/`; raw captures land in `artifacts/store-shots/`
(ignored).

- **What it needs:** `.env.local`, Chrome, and the test accounts in
  `~/.config/crossword-clash/shots-accounts.json` (as `pnpm shots`).
- **Same content every run:** the app's clock is pinned to the showcase day
  (`SHOW_DAY` in `cap.mjs`, November 16, 2026), so the tiles always show that
  day's dailies whatever today's are. Names and times on the board and in the
  race are invented (`stage.mjs`). Before changing the day, read its puzzles'
  titles and clues: store art must not show another company's trademark.
- **The room tiles are a real room** on production, hosted on a TV and played
  to the end by the test accounts: one finished test room per two sets,
  removed by the retention sweep. Each set always plays as the same account
  (`seat` in `cap.mjs`), so its tiles show the same player's view whichever
  sets a run names. A room that fails part-way is closed, and its tiles are
  reported instead of being composed from an older capture.
- **Nothing reaches the daily boards:** native mode would let a finish post
  from localhost, so every write to `daily_results` is blocked in the capture.
- **The studio tile** comes from this checkout when its word list is built
  (`pnpm seedgrid:studio-dict`), otherwise from the live site; the run says
  which.
- **It uploads nothing.** Look at the tiles, commit them, then upload.

The Duo sets were made this way (the studio draft's clue on screen was
reworded first; it named Monopoly). The iPhone, iPad and Play sets in the repo
are still the November 16 captures; a full run on November 18 reproduced them
except for tile 03, where the race dialog has since changed, and tile 01,
whose clue bar now always shows 1 Across (the live sets show "Looney Tunes
duck" there, and their studio tile the Monopoly clue).

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
     `ios/App/App/PrivacyInfo.xcprivacy`. With push notifications
     (`VITE_PUSH=1`, docs/push-setup.md) *Identifiers → Device ID* (the APNs
     push token), collected, linked to the user, App Functionality, not used
     for tracking — published 2026-10-31; the privacy manifest declares it.
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
  Once community puzzles are switched on (`VITE_COMMUNITY=1`,
  `docs/community-puzzles-spec.md` §3.5) the app also browses and plays
  player-published puzzles: the publish checks filter titles, notes and
  clues through the same word list; every puzzle page has **Report** (four
  reasons, reviewed within a day, three reporters hold a puzzle
  automatically) and **Hide puzzles by this author** (the block the
  guideline asks for); publishing itself is web-only. Tick "Infrequent/Mild
  User Generated Content" in the age-rating questionnaire at the next
  submission.
- The privacy policy and terms are still marked as unreviewed drafts in
  `src/screens/legal/legalContent.ts`.

## 1.1.0 (November 4, 2026): swapping build 25 for build 35

Version 1.1.0 sat WAITING_FOR_REVIEW with build 25 (submitted October 31 with
the Plus subscription group and both plans) while builds 26–35 shipped to
TestFlight. Build 35 carries friends, push notifications, room rendezvous, the
race fixes and the TV chooser, and `review-notes.txt` gained paragraphs on
friends and notifications. The swap: Andrew removes the submission from review
in App Store Connect (the API's `canceled: true` PATCH is refused by the
session's permission layer), then the scratchpad script points the version at
build 35, pushes the review notes and creates the draft submission with the
version item; the subscriptions are added in the UI ("Add for Review" on the
group and each plan, the group alone is refused) and Submit for Review goes
from the App Review page. `whatsNew` still cannot be set before the first
release ships (409).

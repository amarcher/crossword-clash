# Solo leaderboard posting

Signed-in accounts have **Leaderboard eligible** in Account → Leaderboards, on by default. Turning it off applies to future eligible daily solo finishes; existing public entries remain. Personal solve history and solo emoji-grid sharing are unchanged.

Guests must enter a name and choose **Post** after each eligible finish, including when a name was remembered from another game. Until then, their time is shown as solved but is not inserted into the ranked table. Naming a share does not submit a leaderboard entry.

The preference is stored in Supabase Auth user metadata as `solo_leaderboard_enabled`. Only explicit `false` disables it. `leaderboardPreference.ts` reads the current user from the server before each signed-in finish, so an opt-out on another device is respected. Failed preference reads keep the finish private. The setting reports save failures and retains its last confirmed value. No database migration is required.

`PendingDailyResult.postingHold` prevents account opt-outs or unresolved reads from being submitted by the name form. Multiplayer posting and the existing production-origin guard are unchanged. Revealed solo solves remain ineligible.

## Verification

Unit and screen integration tests cover default-on accounts, opt-outs, failed reads/saves, remembered guest names, explicit guest submission, private results excluded from rankings, and independent sharing. The reviewed local preview used the actual settings component with fixture auth storage; phone/desktop checks covered layout, touch targets, toggle and reload. This verifies UI behavior, not a live account mutation. The full production build, lint, unit suite and offline solo browser suite also pass.

# Join an existing game as a TV

Choose **Join as TV** on the menu or join form and enter the six-character room
code from the host's lobby. The direct route is `/watch/CODE`; `/watch` shows
the code form. This is available in both the web and native app.

The display shows the puzzle, clues, scores, player invitation QR code, and
waiting/live/completed/closed state. It never creates a player, tracks player
presence, starts a game, claims a cell, or closes a room. Leaving the display
only changes the local screen. Existing **Host as TV** creates and controls a
room as before.

`SpectatorScreen` lives outside the player and host layouts, so opening a TV
does not restore or overwrite those sessions. `useSpectatorRoom` subscribes to
room broadcasts and refreshes a read-only database snapshot. It also refreshes
on visibility/online recovery and every 15 seconds. Each refresh resolves the
room code again so rematches follow the replacement game. Async races show
player results without exposing individual in-progress grids.

September 11, 2026 verification: a synthetic live room remained at one player
while the browser display joined, showed a claimed letter and score, recovered
after refresh, followed a rematch under the same code, and displayed closure.
Both synthetic rooms were closed after the check. Unit tests cover read-only
queries, invalid codes, cached puzzle reuse, and rematch/closed snapshots.

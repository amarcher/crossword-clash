# RUNNER — how a woken Crossword Clash Claude session operates

*You (the headless agent) were spawned by `clash-agent/poller.py` with a JSON
brief: `kind` ("message", "approval", "worklist", "continue", "ci-fix" or
"incident"), `channel`, `thread_ts` (may be null for an item with no
thread), `tier`, `payload`, `note` (your own wake note from the last run on
this thread, if any) and `context` (the recent thread, each entry tagged
`who` = a policy tier). Read `clash-agent/policy.md` first — it decides what
you may do for whom. This file is the mechanics. It began as a direct port
of smart-home/house-agent's RUNNER.md; the follow-through rules came from
storybook-studio/fable-agent on 2026-09-01.*

## Ground rules

- You have the full project harness: the repo, `CLAUDE.md` (read it; it
  is the map of this codebase), its docs (`docs/plus-setup.md`,
  `docs/monetization-spec.md`, `docs/friends-spec.md`, etc.), the gate, and
  the project's memory (Claude Code's auto memory, shared by every
  worktree of this repo). Use them exactly as an interactive session would.
- **Always reply where the request lives.** In the thread (`thread_ts` from
  the brief) when there is one; as a new top-level message in the channel
  when there is not (an issue item). Never leave a wake unanswered: act,
  ask, or explain. Take that literally — the poller no longer hands you a
  message an earlier run already answered (`drop_answered`), so "someone
  else may have covered this" is not a reason to stay quiet. If it reached
  you, it is yours.
- One wake = one thread. Don't roam the channel or other threads.
- **Read your note first.** `note` in the brief is what the last run on
  this thread did, verified and left open. Start from it, don't rediscover it.

## Replying (Slack Web API, bot token)

```sh
TOK=$(cat ~/.crossword-clash/clash-agent/slack_token.txt)
curl -sS -H "Authorization: Bearer $TOK" \
  --data-urlencode "channel=<channel>" \
  --data-urlencode "thread_ts=<thread_ts>" \
  --data-urlencode "text=<your reply>" \
  https://slack.com/api/chat.postMessage
```

Omit `thread_ts` for a top-level message. Preview images/screenshots:
upload with `files.uploadV2` (`files:write` is granted) — but never post
one that contains a secret, token, or customer PII.

## Follow through — finish your own follow-ups

**The default is to keep going.** If, while doing what was asked, you find
the next thing — a follow-up fix, a check worth running, a loose end the
thread raised — do it now, in this run, in this worktree. Do not end with a
list of open items, and do not file for later what you could do this
minute. That rule ("never hand Andrew a list") stands; the change is that
the answer to "not now" is almost always "yes, now".

**When one run isn't enough** (you are approaching the cap with real work
still to do): push what you have, write what comes next to
`$CLASH_AGENT_CONTINUE_PATH` — two to five lines a fresh you can act on —
and end the run. The poller wakes you again immediately, in this same
worktree, with that note in the brief (`kind: continue`). Up to six
continues chain; that is hours, not a limit you should meet.

**Defer only behind a named condition.** Some work genuinely cannot run
yet. Those, and only those, go in the queue with the reason:

```sh
python3 clash-agent/worklist.py add \
  --title "one line: what needs doing" \
  --public-title "the same thing in plain, non-ops language" \
  --detail "everything a fresh session needs to do it cold — files, symptom,
            what you already ruled out, how you'll know it's fixed" \
  --thread <thread_ts> [--priority 1] \
  --wait <why it can't run now>
```

| `--wait` | it runs when |
|---|---|
| `approval` | Andrew has 👍'd an ask further up this thread |
| `after:2026-09-02T08:00` | that moment has passed (a store review window, "after the 3pm deploy") |
| `cmd:<shell>` | that command exits 0 — the natural fit for device and store work here, e.g. `cmd:xcrun simctl list devices booted \| grep -q Booted` (a simulator is up), `cmd:xcrun devicectl list devices \| grep -q Connected` (a phone is attached), or a one-liner against the App Store Connect API that exits 0 once a build has finished processing |
| `ci:<pr>` | every check on that PR has finished |
| `daytime` | between 09:00 and 18:00 (for anything disruptive; nothing here is) |

An item filed with no `--wait` is picked up on the next sweep — seconds
after this run ends — so use that only when the work truly belongs in its
own run (a different branch, a different thread). Items are worked oldest
first within priority, one at a time on the follow-through lane; the queue
is also fed by open GitHub issues labelled `agent-ready`.

`--title` is for you: write it however you think. `--public-title` is the
only part of the item a human may ever read — it's what the stuck notice
says if the item ends up needing Andrew, and the channel has non-Andrew
members. So: no PR numbers, versions, filenames, branch/deploy/config words.
"the checkout confirmation email", not "Fix Resend domain verification in
stripe-webhook.ts". Anything that smells of ops is dropped at post time and
the notice goes vague instead — which is safe but tells him nothing, so
write the line.

**When you're woken with `kind: "worklist"`:**

- Do the item end to end under the normal rules — branch, gate green, PR.
- Then close it: `worklist.py done <id> --note "what landed"` (or
  `drop <id> --note "why"` if it turned out not to be worth doing). An item
  left unclosed reopens on the next pass — a timeout can't lose the work.
  For an issue item (`source: issue`) the PR body must say `Closes #N`;
  `done` also comments on the issue for you.
- **Post exactly one line when it lands** — what changed, plainly. In the
  item's thread when it has one, top-level when it doesn't. Nothing when
  you start, nothing about the queue itself.
- If you can't finish it, post nothing and let it reopen. After three passes
  it goes `stuck` and the pass posts one line asking for Andrew — that is
  the *only* thing that should ever cost him an unprompted message. It says
  the `public_title` and never the title, and if the item is parked on an
  unanswered 👍 it says *that*, rather than claiming three failed tries at
  something that never ran.
- A worklist wake is repo work. Don't post anything unrelated to the item.

Only an Andrew-tier run may file an item (`worklist.py` reads the tier
stamp the poller sets at the spawn boundary). From an unknown-tier wake,
just say the thing in-thread.

## Your wake note — write it every run

Before you end **any** run, write `$CLASH_AGENT_NOTE_PATH` (overwrite it;
it is this thread's note, not a log):

```
<one plain line: what landed or what you found — this line may be read aloud in the channel>

Did: …
Verified: … (gate / preview / simulator or device / store — and what you did not verify and why)
Open: … (or "nothing")
Branch / PR: …
```

The first line is the headline: the ledger and the end-of-day digest use
it, so write it the way you would say it to Andrew — no PR numbers, no
branch names. The next run on this thread gets the whole note as `note`.
An interactive session can read it too. This is the thread's memory; the
25 messages in `context` are only the channel's.

## Requesting Andrew's approval

When policy.md says an action needs Andrew's 👍 (destructive actions, and —
always, no exceptions — anything touching the live-money /
production-store surface):

1. Post the ask **in-thread**: what will change, why, and exactly what is
   irreversible or customer-facing if it's the live-money class. Capture the
   returned message `ts` (that's `ask_ts`).
2. Register it for the poller — write
   `~/.crossword-clash/clash-agent/pending/<ask_ts>.json`:

```json
{"ask_ts": "<ts of your ask message>",
 "thread_ts": "<the thread>",
 "summary": "one line of what was requested",
 "action": "what to do on approval (enough for a fresh session to execute)"}
```

3. End your session (write your note first). The poller watches reactions;
   Andrew's 👍/👎 wakes a fresh session with `kind: "approval"` and the
   verdict. On `approved`, execute `action` exactly as written and confirm
   in-thread; on `denied`, acknowledge gracefully in-thread and stand down.

**You don't need to do any of this for a run that ran out of time.** If the
45-minute cap kills you mid-task with real work still on your branch, the
poller notices on its own (`remove_worktree`'s dirty/unpushed check),
preserves your worktree instead of deleting it, and posts its own 👍-gated
resume ask naming your branch — see `register_resume` in `poller.py`. If
Andrew reacts 👍, you'll be woken again in that exact worktree, on that
exact branch, with a note telling you so; run `git status`/`git log` first
to reorient before doing anything else. (Better: don't get there — write
your continue file at a checkpoint and let the poller wake you.)

## Doing work

- **Repo changes**: feature branch, small commits, the gate green, PR to
  `main`. The gate is `pnpm install --frozen-lockfile && pnpm lint && pnpm
  build && pnpm exec vitest run src api proxy.test.ts` — exactly what CI
  runs — and your worktree is a fresh checkout, so the install comes
  first. `.env.local` is deliberately NOT in your worktree (it holds the
  Supabase keys, `STUDIO_TOKEN`, the Stripe, RevenueCat, Resend and App
  Store Connect keys); the gate runs without it, as CI does. Keep
  `CLAUDE.md` true when you change what it describes, and its test count
  line when you add tests.
- **You're always running in your own isolated `git worktree`**, cut fresh
  from `origin/main` for this one wake (or from the PR's branch for a
  `ci-fix` wake) — never the shared repo checkout, and never another
  wake's leftover branch or in-progress build. Branch, commit, push, open a
  PR exactly as you would anywhere else.
- **Fill in the PR's Verified section** (`.github/pull_request_template.md`).
  Each line names what actually ran or says plainly that it did not. The
  PR watch refuses to merge a PR without it. For a screen, open the
  Vercel preview the PR gets and *look at it* (a 375 px phone width too);
  for Capacitor / iOS / Android work, say which simulator or device ran it
  (`xcrun simctl list devices booted`), or that none was available; for a
  migration or an edge function, say whether it was applied or deployed
  (normally not — that is Andrew's, see policy.md) and what was only
  tested; for anything under `docs/app-store`, `docs/play-store` or
  `docs/testflight`, say what store state you checked and what you did
  not touch.
- **You don't wait for CI.** Once your PR is open and your note is written,
  end the run. `clash-agent/prwatch.py` watches the checks (here the two
  GitHub Actions jobs — lint, build and unit tests; the solo E2E — plus
  Vercel's preview build and its comments check): red wakes you again on
  the PR's own branch (`kind: ci-fix`, with
  the failing checks in the payload — fix, push, end; the watch resumes),
  green Andrew-tier work merges on its own, and green work for anyone else
  asks Andrew for a 👍.
- **Don't get guillotined silently.** The poller caps a run at 45 minutes
  and SIGKILLs it — a build + gate can approach that. So for anything that
  touches the repo: (1) post a one-line in-thread ack when you start ("On
  it — looking into that now"), and (2) push your branch and open the PR *as
  soon as you have one coherent commit*, then keep iterating on it. That way
  a timeout leaves a visible PR to finish, never a stranded local branch and
  a silent thread.
- **Never** print the Slack token, the Supabase service-role or access
  token, `STUDIO_TOKEN`, Stripe / RevenueCat / Resend / App Store Connect
  keys, the contents of `.env.local`, or any other secret into the thread,
  a commit, or a log line you post. The Supabase CLI's token comes from the
  keychain item "Supabase CLI" (`go-keyring-base64:` prefix, base64) —
  export it in-process, never echo it.
- **Player data**: if asked about players, purchases or boards, summarize
  (counts, totals, a breakdown) rather than pasting rows — usernames,
  emails, user ids and display names from `auth.users`, `profiles`,
  `daily_results`, `players`, `purchase_events` and `entitlements` are
  personal data, not channel content; a purchase is named by its store and
  plan, never its buyer.

## Tone

Direct, competent teammate voice in the channel: short, concrete, technical
when it helps ("Done — PR #212, live once you merge it."). Build logs, gate
output, and diagnostics stay out of the channel unless Andrew asks for them.

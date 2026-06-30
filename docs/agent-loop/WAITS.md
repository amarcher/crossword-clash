# Waits — durable, deterministic wake-up conditions

When the loop blocks on **external state** — a permission-gated merge, a human step, a slow remote process — it must not improvise a private wait. An in-session Monitor alone dies with the session, and nobody else can see *what* would unblock it. A **wait record** makes the condition:

- **durable** — it survives session death; any future iteration can pick it up,
- **deterministic** — one canonical check command with a stated satisfied-predicate, re-runnable by anyone with identical meaning,
- **visible** — Andrew and other agents can read exactly what is blocked, how to check it, and how to flip it.

## Layout

One open wait per file at `.agents/waits/<id>.md` (`<id>` = short kebab slug, e.g. `pr-41-merge`). Create the dir on first use and keep `/.agents/` gitignored — waits are runtime coordination, not source.

## The record

```markdown
# wait:pr-41-merge — PR #41 blocked on permission gate
- status: open                        # open | satisfied | cancelled
- opened: <ISO-ts> · by:loop
- blocked-on: PR #41 has a panel verdict + green checks but this session may not squash-merge
- check: `gh pr view 41 --json state --jq .state`
- satisfied-when: output == MERGED    # output == CLOSED → status: cancelled instead
- unblock-how: merge PR #41 (one click, or any agent with GitHub access), OR add a
  `gh pr merge` permission rule and tell the loop to retry
- announced: PR #41 comment · push notification
- tripwire: Monitor <task-id> · 60s poll · ScheduleWakeup fallback 30m
- on-wake: housekeeping (worktree, loser branch), set queue [done: #41], next feature
```

Every field matters: `check` + `satisfied-when` are the deterministic core; `unblock-how` is what makes the wait actionable by *someone else*; `on-wake` lets a fresh context resume without re-deriving intent.

## Rules

1. **File before you sleep.** Blocking on external state without filing a wait is a protocol violation — the improvised Monitor that happens to work this time is invisible and unrepeatable next time.
2. **The check is the contract.** Read-only, idempotent, fast (<10s), no side effects, output machine-comparable against `satisfied-when`. Prefer **shared external state** that Andrew and remote agents can both reach — PR/issue state, a label, a committed file. Cloud agents (Slack/claude.ai) cannot write local files, so a local-only rendezvous can never be flipped from outside; pick state they can touch.
3. **Announce with the same fields.** Post `blocked-on` + `unblock-how` to #crossword-clash (and as a comment on the PR itself when PR-scoped — visible to Andrew and any GitHub-connected agent), plus a push notification if urgent. State that the loop re-checks automatically: the unblocker only has to flip the state, never to notify the loop.
4. **Arm a tripwire, but it's an optimization.** Start a persistent Monitor on the `check` (60s for fast-flip human-actionable states; match the cadence of slow external processes) plus a ScheduleWakeup fallback. The wait *file* is the source of truth — the tripwire just makes wake-up prompt.
5. **Re-evaluate open waits every iteration.** The loop's SYNC step runs the `check` of every `status: open` wait: satisfied → sign it (`status: satisfied · [seen:loop <ts>]`), execute `on-wake`; cancelled-condition met → sign as cancelled and surface it. This is the determinism guarantee: even if the tripwire and its session died, the next iteration resumes the wait identically.
6. **Sign, don't delete.** Resolved waits stay as the audit trail.

## Cross-references

A feature-scoped wait also marks its queue line `[blocked:wait:<id>]` (cleared on satisfaction). Waits are coordination, not the record — durable truth remains git + the queue + the judges' memo.

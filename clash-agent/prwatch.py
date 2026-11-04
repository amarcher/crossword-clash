#!/usr/bin/env python3
"""
PR watch — the part of a wake that used to happen to nobody.

A run ends when its pull request opens. Everything that decides whether the
work actually lands happens after that: the checks, the merge-state trap (a
DIRTY merge state never runs anything and reads as green), the check-count
rule, and the merge itself. Those were rules a headless run had no way to
follow. This process follows them.

poller.wake_agent starts one of these, detached, for every run that leaves
a branch behind. It polls the PR and acts on exactly three states:

  red     a check failed, or the PR conflicts with main → wake the agent
          again on the PR's own branch (kind "ci-fix"), at most MAX_FIXES
          times, then one plain line to the thread
  green   every check finished and passed, at least MIN_CHECKS of them,
          merge state clean, and the PR body carries its Verified block →
          Andrew-tier work merges; anything else registers a 👍 ask whose
          approval wake runs the merge
  pending keep watching, up to WATCH_S; then stop quietly — a PR that is
          still building after that is unusual enough that the ledger
          line is the right record, not a message

What "green" means HERE. Every PR to this repo carries GitHub Actions
(`.github/workflows/ci.yml`, on every pull request with no path filter):
`Lint, build, unit tests` (pnpm lint, pnpm build, the vitest run — the gate
itself) and `E2E (solo, no Supabase)`; plus Vercel's `Vercel` status
context (the preview deployment) and its `Vercel Preview Comments` check
run; and, when the Supabase GitHub integration is attached, a `Supabase
Preview` check that is SKIPPED on a PR without migrations. Read off PRs
#218 and #219 with `gh pr view N --json statusCheckRollup` on 2026-11-04:
5 and 5, the Supabase one skipped on both. MIN_CHECKS is 4 — the two
Actions jobs and the two Vercel checks, which every PR gets — so the
integration's check can come or go without a verdict waiting for ever,
and SKIPPED counts as good. A Vercel status context reports through
`state` (PENDING/SUCCESS/FAILURE), not `status`/`conclusion` — so a
pending deployment is treated as running, never as a completed check with
no conclusion (a fable-agent verdict would have read that as green once
the count was met).

Every action writes a ledger line (poller.append_ledger). Wakes run on the
follow-through lane (poller.acquire_lock("work.lock")) so a fix never
collides with a queued item.

Offline seam: CLASH_AGENT_GH overrides the `gh` binary (the selftest points
it at a scripted stub); `verdict()` is pure and driven directly.
"""
import argparse
import json
import os
import subprocess
import sys
import time

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import poller

GH = os.environ.get("CLASH_AGENT_GH", "gh")
POLL_S = int(os.environ.get("CLASH_AGENT_PRWATCH_POLL_S", "60"))
WATCH_S = 45 * 60          # after this, stop watching (the ledger says so)
FIND_S = 5 * 60            # how long to wait for the PR to exist at all
MAX_FIXES = 2              # red → fix wake, this many times
MIN_CHECKS = 4             # the two Actions jobs + Vercel + Vercel Preview
                           # Comments — see the module docstring
LANE_WAIT_S = 15 * 60      # how long a fix wake waits for the lane
REQUIRE_VERIFIED = True    # the PR body must carry a "Verified" section
GOOD = {"SUCCESS", "NEUTRAL", "SKIPPED"}
BAD = {"FAILURE", "TIMED_OUT", "CANCELLED", "ACTION_REQUIRED", "ERROR",
       "STARTUP_FAILURE"}
# A status context (Vercel's deployment) says PENDING/EXPECTED while it
# builds; a check run says QUEUED/IN_PROGRESS in `status`. Both are "not
# finished yet", never "finished with nothing to say".
RUNNING = {"PENDING", "EXPECTED", "QUEUED", "IN_PROGRESS", "WAITING",
           "REQUESTED"}
CLEAN_STATES = {"MERGEABLE", "CLEAN", "HAS_HOOKS", "UNSTABLE", "BEHIND"}


def gh(*args, timeout=60):
    r = subprocess.run([GH, *args], cwd=poller.REPO, capture_output=True,
                       text=True, timeout=timeout, env=poller.gh_env())
    return r.returncode, r.stdout, r.stderr


def find_pr(branch):
    rc, out, _ = gh("pr", "list", "--head", branch, "--state", "open",
                    "--json", "number,url,title")
    if rc != 0:
        return None
    prs = json.loads(out or "[]")
    return prs[0] if prs else None


def view(number):
    rc, out, err = gh("pr", "view", str(number), "--json",
                      "number,url,title,body,state,isDraft,mergeStateStatus,"
                      "statusCheckRollup,headRefName")
    if rc != 0:
        poller.log(f"prwatch: gh pr view #{number} failed: {err.strip()}")
        return None
    return json.loads(out or "{}")


def outcome_of(check):
    """A check run's `conclusion`, or a status context's `state`, upper-cased
    — the one word that says how it ended (or that it hasn't)."""
    return (check.get("conclusion") or check.get("state") or "").upper()


def verdict(pr):
    """Pure: one of 'merged', 'closed', 'draft', 'red', 'green', 'pending',
    plus a reason. This is the whole policy, so the selftest drives it
    directly with hand-built PR objects."""
    if not pr:
        return "pending", "no data"
    if pr.get("state") == "MERGED":
        return "merged", "already merged"
    if pr.get("state") == "CLOSED":
        return "closed", "closed without merging"
    if pr.get("isDraft"):
        return "draft", "draft — not watched"
    ms = pr.get("mergeStateStatus") or "UNKNOWN"
    if ms == "DIRTY":
        return "red", "conflicts with main (a DIRTY merge state never runs the checks)"
    checks = pr.get("statusCheckRollup") or []
    failed = [c for c in checks if outcome_of(c) in BAD]
    if failed:
        names = ", ".join((c.get("name") or c.get("context") or "?") for c in failed)
        return "red", f"failed: {names}"
    running = [c for c in checks
               if c.get("status") not in (None, "COMPLETED")
               or outcome_of(c) in RUNNING
               or not outcome_of(c)]
    if running:
        return "pending", f"{len(running)} check(s) still running"
    if len(checks) < MIN_CHECKS:
        return "pending", (f"only {len(checks)} check(s) reported — fewer than "
                           f"{MIN_CHECKS} means no verdict yet")
    if ms not in CLEAN_STATES:
        return "pending", f"merge state {ms}"
    if REQUIRE_VERIFIED and not has_verified_block(pr.get("body") or ""):
        return "red", "the PR body has no Verified section"
    return "green", f"{len(checks)} checks passed, merge state {ms}"


def has_verified_block(body):
    low = body.lower()
    return "## verified" in low or "**verified**" in low or "\nverified:" in low


def failure_detail(pr):
    """What to hand the fix wake: each failed check's name and link."""
    out = []
    for c in pr.get("statusCheckRollup") or []:
        concl = outcome_of(c)
        if concl in BAD:
            out.append({"name": c.get("name") or c.get("context"),
                        "conclusion": concl,
                        "url": c.get("detailsUrl") or c.get("targetUrl")})
    return out


def wait_for_lane():
    deadline = time.time() + LANE_WAIT_S
    while time.time() < deadline:
        lock = poller.acquire_lock("work.lock")
        if lock is not None:
            return lock
        time.sleep(20)
    return None


def post(text, thread):
    try:
        poller.post_message(text, thread_ts=thread)
    except Exception as e:
        poller.log(f"prwatch: post failed ({e})")


def register_merge_ask(pr, thread):
    """Non-Andrew-tier work is green: ask for the 👍, and let the approval
    wake do the merge — the same gate every other consequential action uses."""
    text = (f"This one is built and every check is green — react 👍 here and "
            f"I'll land it: {pr['url']}")
    try:
        r = poller.post_message(text, thread_ts=thread)
        ask_ts = r.get("ts")
    except Exception as e:
        poller.log(f"prwatch: merge ask failed ({e})")
        return
    if not ask_ts:
        return
    p = {"ask_ts": ask_ts, "thread_ts": thread,
         "summary": f"merge PR #{pr['number']}",
         "action": (f"Run exactly: gh pr merge {pr['number']} --squash "
                    f"--delete-branch — then confirm in-thread in one line.")}
    os.makedirs(poller.pending_dir(), exist_ok=True)
    json.dump(p, open(os.path.join(poller.pending_dir(), f"{ask_ts}.json"), "w"))


def merge(pr):
    rc, out, err = gh("pr", "merge", str(pr["number"]), "--squash",
                      "--delete-branch", timeout=120)
    return rc == 0, (out + err).strip()


def watch(branch, thread, tier, note_key):
    thread = None if thread in (None, "-", "") else thread
    t0 = time.time()
    pr = None
    while pr is None and time.time() - t0 < FIND_S:
        pr = find_pr(branch)
        if pr is None:
            time.sleep(30)
    if pr is None:
        poller.log(f"prwatch: no open PR for {branch} after {FIND_S}s; done")
        poller.append_ledger(kind="prwatch", branch=branch, thread=thread,
                             key=note_key, event="no-pr")
        return 0
    number = pr["number"]
    poller.log(f"prwatch: watching #{number} ({branch})")
    fixes = 0
    watch_from = time.time()
    while time.time() - watch_from < WATCH_S:
        cur = view(number)
        state, why = verdict(cur)
        if state in ("merged", "closed", "draft"):
            poller.log(f"prwatch: #{number} {state} — {why}")
            poller.append_ledger(kind="prwatch", pr=number, branch=branch,
                                 thread=thread, key=note_key, event=state)
            return 0
        if state == "green":
            if tier == "andrew":
                ok, msg = merge(cur)
                poller.append_ledger(kind="prwatch", pr=number, branch=branch,
                                     thread=thread, key=note_key,
                                     event="merged" if ok else "merge-failed",
                                     detail=msg[:300])
                if ok:
                    poller.log(f"prwatch: merged #{number}")
                    post(f"Landed — {cur.get('title', 'the change')} is on "
                         f"main; Vercel is shipping it now.", thread)
                else:
                    poller.log(f"prwatch: merge of #{number} failed: {msg}")
                    post(f"Every check is green but the merge didn't take — "
                         f"needs a look: {cur['url']}", thread)
                return 0
            register_merge_ask(cur, thread)
            poller.append_ledger(kind="prwatch", pr=number, branch=branch,
                                 thread=thread, key=note_key, event="merge-ask")
            return 0
        if state == "red":
            if fixes >= MAX_FIXES:
                poller.log(f"prwatch: #{number} still red after {fixes} fixes")
                poller.append_ledger(kind="prwatch", pr=number, branch=branch,
                                     thread=thread, key=note_key,
                                     event="gave-up", detail=why)
                post(f"Couldn't get the checks green on this one after two "
                     f"tries — it needs a look: {cur['url']}", thread)
                return 0
            fixes += 1
            poller.log(f"prwatch: #{number} red ({why}); fix wake {fixes}/{MAX_FIXES}")
            poller.append_ledger(kind="prwatch", pr=number, branch=branch,
                                 thread=thread, key=note_key, event="fix-wake",
                                 n=fixes, detail=why)
            lock = wait_for_lane()
            if lock is None:
                poller.log("prwatch: lane never freed; giving up on this fix")
                return 0
            try:
                poller.wake_agent("ci-fix", thread,
                                  {"pr": number, "url": cur["url"],
                                   "branch": branch, "reason": why,
                                   "failures": failure_detail(cur),
                                   "fix_attempt": fixes},
                                  tier, note_key=note_key,
                                  ref=f"origin/{branch}")
            finally:
                lock.close()
            watch_from = time.time()          # a fresh push earns a fresh wait
            time.sleep(POLL_S)
            continue
        time.sleep(POLL_S)
    poller.log(f"prwatch: #{number} still pending after {WATCH_S}s; stopping")
    poller.append_ledger(kind="prwatch", pr=number, branch=branch, thread=thread,
                         key=note_key, event="timeout")
    return 0


def main(argv=None):
    p = argparse.ArgumentParser(description="watch a PR's checks and act")
    p.add_argument("--branch", required=True)
    p.add_argument("--thread", default="-")
    p.add_argument("--tier", default="unknown")
    p.add_argument("--note-key", default=None)
    a = p.parse_args(argv)
    return watch(a.branch, a.thread, a.tier, a.note_key or a.branch)


if __name__ == "__main__":
    sys.exit(main())

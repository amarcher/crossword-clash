#!/usr/bin/env python3
"""
The follow-through queue — what Crossword Clash Claude will do next, and what it
is waiting on.

This used to be "the daylight worklist" (a direct port of
smart-home/house-agent's): a run that found more to do filed it here and a
launchd job worked the queue at 09:40 and 14:40. That is why a thread could
go quiet for days and then get a report. The rule now is the other way round
(RUNNER.md, "Follow through"): a run FINISHES its own follow-ups — when one
cap isn't enough it writes its continue file and the poller wakes it again
at once. This queue holds only the work that cannot run yet, and every item
says why:

    --wait approval          Andrew's 👍 on an ask further up the thread
    --wait after:<ISO time>  not before this moment (a store's review
                             window, tomorrow morning, "after the 3pm deploy")
    --wait daytime           09–18 only — for anything that would be
                             disruptive out of hours (kept from the house
                             bot; nothing in this repo makes noise)
    --wait cmd:<shell>       whatever this command exits 0 for: a booted
                             simulator, a device on `xcrun devicectl`, an
                             App Store Connect build finished processing
    --wait ci:<pr>           the checks on that PR have all finished

An item with no `--wait` is ready now: the poller's sweep picks it up on
the follow-through lane within seconds of the run that filed it ending.

The second source of items is GitHub: an open issue labelled
`agent-ready` (ISSUE_LABEL) becomes an item on the next pass. That is how a
roadmap turns into work the agent picks up unattended — Andrew writes the
issue, the agent opens the PR, the PR says `Closes #N`, and the issue's
timeline is the record of what happened.

Every spawn goes through poller.wake_agent — the ONE spawn path: isolated
worktree, linked memory, budget, ledger, continue chain, PR watch. This
file only decides WHICH item is ready; it never runs an agent itself.
(clash-agent used to carry its own wake_agent here, with its own worktree —
that was the right instinct and it is now the poller's job for every wake.)

The escape hatch is the honest part: an item that fails MAX_ATTEMPTS passes
goes `stuck`, and that — a thing genuinely needing Andrew — is the only
case that ever costs him a message. Not a list; one item, with the reason.
Because it is the ONE unprompted message the whole design allows, it has to
be the best-written line the bot sends: see `compose_stuck_notice` for why
the item's own `title` is never allowed anywhere near it (whoever else ever
joins #crossword-clash shouldn't get a build log for a stuck item either).

Trust: `add` refuses unless the filing run is an Andrew-tier run (the poller
stamps CLASH_AGENT_TIER at the spawn boundary), so a queued item always
traces back to a session Andrew's own messages authorized. An issue item is
Andrew-tier because only the repo's owner labels issues on it. That stamp
is what justifies the wake's permission mode — poller.py's TIER_MODE rule,
carried across the queue: text in a public channel must never be able to
conjure an ungated agent.

Usage (the agent's side, from a woken session):
    python3 clash-agent/worklist.py add --title "..." --detail "..." \\
        [--public-title "..."] [--thread <ts>] [--priority 2] [--wait ...]
    python3 clash-agent/worklist.py list [--json]
    python3 clash-agent/worklist.py done <id> [--note "what landed"]
    python3 clash-agent/worklist.py drop <id> [--note "why"]

Usage (the daemon's side, one pass on the follow-through lane):
    python3 clash-agent/worklist.py --run

The CLASH_AGENT_* env overrides are the offline-selftest seam, exactly as in
poller.py: state dir, claude binary, repo dir, and the clock. Production
never sets them.
"""
import argparse
import datetime
import json
import os
import re
import subprocess
import sys

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import poller  # same directory; STATE_DIR, the lane locks, the log helper

WORKLIST_DIR = os.path.join(poller.STATE_DIR, "worklist")
DONE_DIR = os.path.join(WORKLIST_DIR, "done")

# The `daytime` condition's window. Not a schedule any more — a condition an
# item may ask for. Kept in code (not a plist) so a lid opened at 03:00 can
# never start something that asked to wait for the day.
DAY_START_H, DAY_END_H = 9, 18

MAX_ATTEMPTS = 3          # then the item goes `stuck` and Andrew hears once
LANE = "work.lock"        # the follow-through lane (poller.acquire_lock)
# Open issues carrying this label become items. Empty disables the source.
ISSUE_LABEL = os.environ.get("CLASH_AGENT_ISSUE_LABEL", "agent-ready")

# ---------------------------------------------------------- the stuck notice
# An item's `title` is written by Crossword Clash Claude FOR Crossword Clash Claude and reads like
# it: "Deploy PR #196 — Shippo live-mode rollout (awaiting Andrew's 👍)". The
# stuck notice never says the title — the channel is public with non-Andrew
# members. It says `public_title`, which the filing run writes in plain,
# non-ops language on purpose, and when there isn't one it says nothing
# specific at all. Nothing is summarised at post time: a title that can't be
# said safely is simply not said.
OPS_VOCAB = re.compile(r"""(?xi)
      \#\d                                     # PR / issue numbers
    | \b\d+\.\d+                               # version strings
    | \b[\w.-]+\.(py|md|ya?ml|json|sh|js|ts|plist|html|css|tsx)\b
    | /                                        # paths
    | \b(pr|repo|repository|branch|commit|merge|rebase|deploy|deployed
        |deployment|rollback|revert|config|entity|entities|api|cli|mcp|rest
        |json|yaml|cron|launchd|plist|add-?on|bridge|endpoint|token|script
        |selftest|regex|traceback|integration|webhook|payload|schema|env
        |workaround|patch|refactor|render|repo-side|upstream|stripe|shippo
        |vercel|neon|resend|supabase|revenuecat|testflight)\b
""")

# The tail both endings share: whichever way it's stuck, nothing moves alone.
WAITS_HERE = "Nothing's moved on it, and nothing will until you say."


def public_subject(item):
    """The words the notice is allowed to say out loud, or None.

    `public_title` is the only field written for the channel to read. The
    guard is the backstop for the day a future filing run writes one by
    pasting the title in: a subject that reads like ops vocabulary is
    dropped, not cleaned — failing closed costs Andrew a vaguer sentence,
    failing open costs him a build log in a channel anyone else who joins
    #crossword-clash can also read."""
    t = (item.get("public_title") or "").strip().rstrip(".")
    if not t:
        return None
    hit = OPS_VOCAB.search(t)
    if hit:
        poller.log(f"worklist: public_title for {item.get('id')} reads like "
                   f"ops vocabulary ({hit.group(0)!r}); using the generic line")
        return None
    return t


def waiting_on_andrew(item):
    """True when the item is parked on an unanswered 👍 rather than failing.

    An item that asked for approval and is waiting stays `working` on disk and
    its attempts still tick up each pass — even though every one of those
    passes did nothing, by design. Reaching `stuck` that way is the intended
    escalation, but "I've tried it three times and keep stopping in the same
    place" would be a flat lie about it. An undecided pending file in the same
    thread is how we tell the two apart (poller.check_approvals deletes the
    file the moment Andrew decides)."""
    thread = item.get("thread_ts")
    if not thread:
        return False
    d = poller.pending_dir()
    if not os.path.isdir(d):
        return False
    for fn in sorted(os.listdir(d)):
        if not fn.endswith(".json"):
            continue
        try:
            p = json.load(open(os.path.join(d, fn)))
        except Exception as e:
            poller.log(f"worklist: pending {fn} unreadable ({e}); "
                       f"not counting it as a wait")
            continue
        if p.get("thread_ts") == thread:
            return True
    return False


def compose_stuck_notice(item, waiting=False):
    """The one unprompted line a stuck item may cost Andrew. Plain language,
    no title, no ops vocabulary, and honest about WHICH kind of stuck it
    is."""
    subject = public_subject(item)
    if waiting:
        if subject:
            return (f"Still waiting on your :+1: for {subject} — it's a "
                    f"little further up this thread. {WAITS_HERE}")
        return (f"Still waiting on your :+1: for something asked a little "
                f"further up this thread. {WAITS_HERE}")
    n = item.get("attempts", 0)
    tried = (f"Tried it {n} times and kept stopping in the same place, "
             f"so it needs you.")
    if subject:
        return (f"One thing that didn't get done on its own: {subject}. "
                f"{tried} It'll wait here until you say.")
    return (f"There's something in the project that didn't get done on its "
            f"own. {tried} Ask and I'll walk you through it — it'll wait "
            f"here until you say.")


def now():
    """Wall clock (selftest seam: CLASH_AGENT_NOW as an ISO string)."""
    override = os.environ.get("CLASH_AGENT_NOW")
    if override:
        return datetime.datetime.fromisoformat(override)
    return datetime.datetime.now()


def in_daytime(t=None):
    t = t or now()
    return DAY_START_H <= t.hour < DAY_END_H


# ---------------------------------------------------------------- storage
def _paths():
    os.makedirs(DONE_DIR, exist_ok=True)
    return WORKLIST_DIR, DONE_DIR


def load_items():
    """Open/working/stuck items, oldest first within priority order."""
    d, _ = _paths()
    items = []
    for fn in sorted(os.listdir(d)):
        if not fn.endswith(".json"):
            continue
        try:
            items.append(json.load(open(os.path.join(d, fn))))
        except Exception as e:
            poller.log(f"worklist {fn}: unreadable ({e}); leaving it")
    items.sort(key=lambda i: (i.get("priority", 2), i.get("filed", ""), i.get("id", "")))
    return items


def save_item(item):
    d, _ = _paths()
    path = os.path.join(d, f"{item['id']}.json")
    tmp = path + ".tmp"
    with open(tmp, "w") as f:
        json.dump(item, f, indent=2)
    os.replace(tmp, path)
    return path


def retire(item, outcome, note=""):
    """Move a finished item out of the queue — kept, never deleted, so the
    record of what the bot did while nobody watched stays readable."""
    d, done = _paths()
    item["state"] = outcome
    item["closed"] = now().isoformat(timespec="seconds")
    if note:
        item["note"] = note
    with open(os.path.join(done, f"{item['id']}.json"), "w") as f:
        json.dump(item, f, indent=2)
    try:
        os.remove(os.path.join(d, f"{item['id']}.json"))
    except FileNotFoundError:
        pass


def find(item_id):
    for i in load_items():
        if i["id"] == item_id:
            return i
    return None


def known_ids():
    """Every id the queue has ever held — open or retired."""
    d, done = _paths()
    ids = set()
    for folder in (d, done):
        for fn in os.listdir(folder):
            if fn.endswith(".json"):
                ids.add(fn[:-5])
    return ids


# ------------------------------------------------------------- conditions
def parse_wait(spec):
    """Validate a --wait spec. Returns the normalised string or raises."""
    if spec is None:
        return None
    spec = spec.strip()
    if spec in ("approval", "daytime"):
        return spec
    kind, _, arg = spec.partition(":")
    if kind == "after" and arg:
        datetime.datetime.fromisoformat(arg)          # raises if malformed
        return f"after:{arg}"
    if kind == "cmd" and arg.strip():
        return f"cmd:{arg.strip()}"
    if kind == "ci" and arg.strip().isdigit():
        return f"ci:{arg.strip()}"
    raise ValueError(f"unknown --wait {spec!r}; see worklist.py --help")


def is_ready(item):
    """Can this item run now? Returns (ready, reason-if-not)."""
    spec = item.get("wait_for")
    if not spec:
        return True, None
    kind, _, arg = spec.partition(":")
    if kind == "approval":
        return (not waiting_on_andrew(item)), "waiting on Andrew's 👍"
    if kind == "daytime":
        return in_daytime(), f"outside {DAY_START_H}:00–{DAY_END_H}:00"
    if kind == "after":
        try:
            t = datetime.datetime.fromisoformat(arg)
        except ValueError:
            return True, None              # malformed: don't wedge the item
        return now() >= t, f"not before {arg}"
    if kind == "cmd":
        try:
            r = subprocess.run(arg, shell=True, capture_output=True,
                               timeout=30, env=poller.gh_env())
            return r.returncode == 0, f"`{arg}` exits {r.returncode}"
        except Exception as e:
            return False, f"`{arg}` failed: {e}"
    if kind == "ci":
        try:
            r = subprocess.run(["gh", "pr", "view", arg, "--json",
                                "statusCheckRollup,state"],
                               cwd=poller.REPO, capture_output=True, text=True,
                               timeout=30, env=poller.gh_env())
            pr = json.loads(r.stdout or "{}")
        except Exception as e:
            return False, f"checks on #{arg} unreadable: {e}"
        if pr.get("state") in ("MERGED", "CLOSED"):
            return True, None
        pending = [c for c in pr.get("statusCheckRollup") or []
                   if c.get("status") not in (None, "COMPLETED")
                   or str(c.get("state") or "").upper() in ("PENDING", "EXPECTED")]
        return (not pending), f"{len(pending)} check(s) still running on #{arg}"
    return True, None


# ------------------------------------------------------------ the issues
def pull_issues():
    """Open issues labelled ISSUE_LABEL become items (id `issue-<n>`), once.
    Silent when gh is missing or the repo has no such label."""
    if not ISSUE_LABEL:
        return []
    try:
        r = subprocess.run(["gh", "issue", "list", "--label", ISSUE_LABEL,
                            "--state", "open", "--limit", "30", "--json",
                            "number,title,body,url,labels"],
                           cwd=poller.REPO, capture_output=True, text=True,
                           timeout=30, env=poller.gh_env())
        issues = json.loads(r.stdout or "[]") if r.returncode == 0 else []
    except Exception as e:
        poller.log(f"worklist: issue pull failed ({e})")
        return []
    have = known_ids()
    new = []
    for iss in issues:
        iid = f"issue-{iss['number']}"
        if iid in have:
            continue
        item = poller.queue_item(
            id=iid, title=iss["title"],
            public_title=iss["title"],
            detail=(f"GitHub issue #{iss['number']}: {iss['url']}\n\n"
                    f"{iss.get('body') or ''}\n\nDo it end to end under the "
                    f"normal rules. The PR body must say `Closes "
                    f"#{iss['number']}` so the issue closes on merge."),
            tier="andrew", thread_ts=None, priority=2, source="issue",
            issue=iss["number"], url=iss["url"])
        new.append(item)
        poller.log(f"worklist: filed {iid} from the {ISSUE_LABEL} label")
    return new


def comment_issue(item, text):
    if item.get("source") != "issue" or not item.get("issue"):
        return
    try:
        subprocess.run(["gh", "issue", "comment", str(item["issue"]),
                        "--body", text], cwd=poller.REPO, capture_output=True,
                       timeout=30, env=poller.gh_env())
    except Exception as e:
        poller.log(f"worklist: issue comment failed ({e})")


# ---------------------------------------------------------------- commands
def cmd_add(a):
    tier = os.environ.get("CLASH_AGENT_TIER", "")
    if tier != "andrew":
        print("worklist: refusing to file — only an Andrew-tier run may queue "
              "work (CLASH_AGENT_TIER is %r). Say it in-thread instead."
              % tier, file=sys.stderr)
        return 2
    try:
        wait = parse_wait(a.wait)
    except ValueError as e:
        print(f"worklist: {e}", file=sys.stderr)
        return 2
    item = poller.queue_item(title=a.title, detail=a.detail, tier=tier,
                             thread_ts=a.thread, public_title=a.public_title,
                             wait_for=wait, priority=a.priority)
    print(item["id"])
    return 0


def cmd_list(a):
    items = load_items()
    if a.json:
        print(json.dumps(items, indent=2))
        return 0
    if not items:
        print("worklist: empty")
        return 0
    for i in items:
        ready, why = is_ready(i) if i.get("state") == "open" else (None, None)
        wait = "" if ready in (True, None) else f"  ⏳ {why}"
        print(f"{i['id']}  [{i['state']}/p{i.get('priority', 2)}/"
              f"{i.get('attempts', 0)}try]  {i['title']}{wait}")
    return 0


def cmd_close(a, outcome):
    item = find(a.id)
    if not item:
        print(f"worklist: no open item {a.id!r}", file=sys.stderr)
        return 1
    retire(item, outcome, a.note)
    if outcome == "done":
        comment_issue(item, a.note or "Landed.")
    else:
        comment_issue(item, f"Not doing this one: {a.note or 'dropped'}")
    print(f"{a.id} → {outcome}")
    return 0


# ---------------------------------------------------------------- the pass
def reconcile(items):
    """A pass that died (timeout, crash, reboot) leaves its item `working`.
    Reopen it — up to MAX_ATTEMPTS, after which it's stuck and worth a word."""
    for i in items:
        if i.get("state") != "working":
            continue
        if i.get("attempts", 0) >= MAX_ATTEMPTS:
            i["state"] = "stuck"
        else:
            i["state"] = "open"
        save_item(i)
    return items


def wake_on(item):
    """Wake headless Claude Code on one item, through the one spawn path
    (poller.wake_agent: worktree, memory, budget, ledger, continue chain,
    PR watch). A budget-deferred wake carries its original brief."""
    if item.get("source") == "budget" and item.get("deferred_kind"):
        return poller.wake_agent(item["deferred_kind"], item.get("thread_ts"),
                                 item.get("deferred_payload") or {},
                                 item.get("tier", "unknown"),
                                 note_key=item.get("thread_ts") or item["id"])
    return poller.wake_agent("worklist", item.get("thread_ts"),
                             {"item": item}, item.get("tier", "unknown"),
                             note_key=item.get("thread_ts") or item["id"])


def run_pass():
    """One pass on the follow-through lane: pull labelled issues, report the
    stuck, then claim the first READY item and work it. Silent when there's
    nothing to do — an empty queue must never cost anyone a message."""
    lock = poller.acquire_lock(LANE)
    if lock is None:
        poller.log("worklist: the follow-through lane is busy; next pass")
        return 0
    pull_issues()
    items = reconcile(load_items())
    stuck = [i for i in items if i.get("state") == "stuck"
             and not i.get("reported")]
    for i in stuck:
        # The ONE case worth Andrew's attention — and it costs him one item
        # with a reason, not a list at bedtime. In the item's thread when it
        # has one; top-level for an issue item (it came from GitHub, so the
        # channel is the only place Andrew would otherwise never hear).
        try:
            poller.post_message(
                compose_stuck_notice(i, waiting_on_andrew(i)),
                thread_ts=i.get("thread_ts"))
        except Exception as e:
            poller.log(f"worklist: stuck notice failed ({e})")
        i["reported"] = True
        save_item(i)
    todo = [i for i in items if i.get("state") == "open"]
    if not todo:
        poller.log("worklist: nothing open")
        return 0
    item = None
    for cand in todo:
        ready, why = is_ready(cand)
        if ready:
            item = cand
            break
        poller.log(f"worklist: {cand['id']} waits ({why})")
    if item is None:
        return 0
    item["state"] = "working"
    item["attempts"] = item.get("attempts", 0) + 1
    item["last_attempt"] = now().isoformat(timespec="seconds")
    save_item(item)
    poller.log(f"worklist: working {item['id']} (attempt {item['attempts']})")
    ok = wake_on(item)
    if ok and item.get("source") == "budget":
        # A deferred wake is done the moment it ran; nothing to close.
        cur = find(item["id"])
        if cur:
            retire(cur, "done", "ran the deferred wake")
    return 0


# ---------------------------------------------------------------- main
def main(argv=None):
    p = argparse.ArgumentParser(description=__doc__.split("\n")[1])
    p.add_argument("--run", action="store_true",
                   help="one pass on the follow-through lane (the daemon's "
                        "entry point; safe to run by hand)")
    sub = p.add_subparsers(dest="cmd")

    a = sub.add_parser("add", help="file an item that cannot run yet")
    a.add_argument("--title", required=True)
    a.add_argument("--public-title", default=None,
                   help="the same thing in plain, non-ops language, for the "
                        "one message Andrew hears if it ever gets stuck (no "
                        "PR numbers, versions, filenames or ops words — "
                        "those are dropped and the notice goes generic)")
    a.add_argument("--detail", required=True,
                   help="enough for a fresh session to execute it cold")
    a.add_argument("--thread", default=None, help="Slack thread_ts it came from")
    a.add_argument("--priority", type=int, default=2, help="1 = first")
    a.add_argument("--wait", default=None,
                   help="why it can't run now: approval | daytime | "
                        "after:<ISO> | cmd:<shell exits 0> | ci:<pr>. "
                        "Omit it and the item runs on the next sweep.")

    sub.add_parser("list", help="what's queued and what each waits on").add_argument(
        "--json", action="store_true")

    for name, help_ in (("done", "it landed"), ("drop", "it's not worth doing")):
        s = sub.add_parser(name, help=help_)
        s.add_argument("id")
        s.add_argument("--note", default="")

    args = p.parse_args(argv)
    if args.run:
        return run_pass()
    if args.cmd == "add":
        return cmd_add(args)
    if args.cmd == "list":
        return cmd_list(args)
    if args.cmd in ("done", "drop"):
        return cmd_close(args, "done" if args.cmd == "done" else "dropped")
    p.print_help()
    return 1


if __name__ == "__main__":
    sys.exit(main())

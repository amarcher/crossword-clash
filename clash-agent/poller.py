#!/usr/bin/env python3
"""
Clash Agent sweep engine — the Slack front door to Andrew's Claude Code, for
the crossword-clash project.

One call = one sweep. daemon.py (the launchd KeepAlive process) triggers a
sweep the moment Slack pushes a message/reaction event over Socket Mode, and
as a periodic fallback in case an event is missed. A sweep reads the
#crossword-clash channel (C0CDQQ1CHUG, The Archers workspace) with the Crossword Clash Claude
bot token from the persisted watermark; on a new human message (top-level or
in a tracked thread) it wakes `claude -p --model opus` headless in the repo
with the thread as context. The headless agent does everything else —
classification, building, gating, replying — under clash-agent/RUNNER.md and
clash-agent/policy.md. The sweep stays a dumb, provable transport: detect,
dedupe, spawn, never interpret. (Running this file by hand performs a single
sweep — the event push only decides WHEN sweeps happen, never WHAT they do.)

This is a direct port of smart-home/house-agent's poller.py — same shape,
same safety spine — adapted for a different Slack workspace (The Archers, not
the family workspace), a single trust tier (Andrew; no second "alicia"-style
tier — see policy.md), and Opus instead of the CLI's default model. The
follow-through changes of 2026-09-01 (wake notes, the continue chain, the
ledger and budget, linked memory, the PR watch, two lanes) were ported from
storybook-studio/fable-agent, where they landed first.

Approval loop: when the agent needs Andrew's 👍 it writes a pending file into
STATE_DIR/pending/<message_ts>.json (see RUNNER.md). Each cycle the poller
checks reactions on those messages; Andrew's 👍/👎 wakes the agent again with
the verdict. Nobody else's reactions count.

Safety spine:
  * two lanes, one lock each (dead-pid reclaimed): the Slack lane (this
    sweep and its wakes) and the follow-through lane (queued items, CI-fix
    wakes, run by worklist.py/prwatch.py). A slow build on one lane never
    makes the other wait, and nothing ever runs twice in one lane
  * at-most-once: state advances BEFORE the spawn, so a crashing agent can't
    poison-loop on one message; the failure posts a fallback line
  * at-most-once ACROSS the two spawn paths too: an approval run that already
    had the message in front of it and replied after it means the message
    sweep in the same cycle must not wake a second session on it
    (drop_answered) — otherwise the thread gets two replies to one message
  * the bot's own messages and join/leave noise never wake the agent
  * everything run-generated — AND both Slack tokens — lives OUTSIDE the
    repo (~/.crossword-clash/clash-agent), beyond the reach of any git clean
  * every wake runs in its OWN disposable `git worktree` cut fresh from
    `origin/main` — never the shared repo checkout. This closes a real
    incident hit by a sibling port of this exact pattern
    (storybook-studio/fable-agent, 2026-08-14): two wakes sharing one
    checkout let wake N+1 branch from wake N's leftover feature branch
    instead of a clean main, and its "one-line fix" PR squash-merged wake
    N's entire unreviewed diff onto main as a stowaway. See
    `make_worktree`/`remove_worktree`/`register_resume` below — preserved
    (never deleted) if a run leaves uncommitted/unpushed work behind, with
    a 👍-gated resume ask so that work is never silently lost or silently
    resumed either.
  * ONE spawn path: `wake_agent` is the only thing that ever runs `claude`.
    worklist.py (queued items) and prwatch.py (CI fixes) call it; they never
    spawn on their own, so the worktree, the memory link, the budget, the
    ledger, the continue chain and the PR watch apply to every wake alike.

The CLASH_AGENT_* env overrides are the offline-selftest seam (selftest.py):
they redirect the Slack API base, token file, state dir, claude binary, and
repo dir so a verification run can never read the real token, touch Slack,
or spawn a real agent. Production never sets them.
"""
import datetime
import fcntl
import json
import os
import re
import shutil
import subprocess
import sys
import urllib.parse
import urllib.request
import uuid

BASE = os.path.dirname(os.path.abspath(__file__))
REPO = os.environ.get("CLASH_AGENT_REPO", os.path.dirname(BASE))
API = os.environ.get("CLASH_AGENT_API", "https://slack.com/api")
STATE_DIR = os.environ.get("CLASH_AGENT_STATE_DIR",
                           os.path.expanduser("~/.crossword-clash/clash-agent"))
# Tokens live in STATE_DIR, OUTSIDE the repo — same reasoning as house-agent
# (2026-07-03: a `git clean` during branch juggling deleted gitignored token
# files from a repo-relative state dir and silently broke the sweep for three
# days). Nothing under the repo tree may be load-bearing at runtime unless
# git owns it.
TOKEN_FILE = os.environ.get("CLASH_AGENT_TOKEN_FILE",
                            os.path.join(STATE_DIR, "slack_token.txt"))
WORKTREE_DIR = os.environ.get("CLASH_AGENT_WORKTREE_DIR",
                              os.path.join(STATE_DIR, "worktrees"))
CLAUDE_BIN = os.environ.get("CLASH_AGENT_CLAUDE_BIN",
                            "/Users/archer/.local/bin/claude")
# Every spawn runs Opus, not the CLI's configured default (Sonnet) — the one
# deliberate difference from house-agent, per Andrew's call when this was
# built. Overridable for the offline selftest seam.
CLAUDE_MODEL = os.environ.get("CLASH_AGENT_CLAUDE_MODEL", "opus")

CHANNEL = "C0CDQQ1CHUG"          # #crossword-clash, The Archers workspace
BOT_USER = "U0CF05TD9PE"         # Crossword Clash Claude's own user id, via auth.test
ANDREW = "U406UR8P4"            # Andrew — same id as house-agent, same
                                  # workspace; approvals come from him ONLY
# Single trust tier: only Andrew is enforced-privileged. Anyone else who
# ever joins #crossword-clash falls through to "unknown" below — read-only,
# nothing executes, flagged to Andrew in thread. Add a collaborator here
# (and to policy.md's table) if that should change; nothing about the code
# below assumes exactly one entry.
TIERS = {ANDREW: "andrew"}
APPROVE, DENY = "+1", "-1"       # reaction names for the 👍 / 👎 verdict

# Tiered spawn — the trust tier enforced HARD at the spawn boundary, not just
# in policy prose: only a wake whose new messages are ALL Andrew's (or an
# approval wake, which exists only because Andrew reacted) runs with the
# permission gate bypassed. Every other wake runs permission-gated —
# non-allowlisted tool calls fail fast and the agent routes the ask through
# the 👍 flow instead. Text in a public channel can never conjure an
# ungated agent.
TIER_MODE = {"andrew": "bypassPermissions"}
DEFAULT_MODE = "acceptEdits"

# launchd hands its children a bare PATH (/usr/bin:/bin:/usr/sbin:/sbin) — no
# /opt/homebrew/bin, so a woken agent has no npm/gh/vercel without this (see
# house-agent's 20260802-0954 finding: the gate died at stage 2 before any
# real verification ran, and the gate being non-negotiable meant the wake
# shipped nothing). The fix lives HERE, at the spawn boundary both wakes
# share, not in each agent's head or in per-plist EnvironmentVariables.
BREW_BIN = "/opt/homebrew/bin"

THREAD_TTL_S = 48 * 3600         # stop watching a thread 48 h after last activity
CLAUDE_TIMEOUT_S = 45 * 60       # a single agent run may build + gate; cap it.
                                 # 45, not 30: a real feature build + the
                                 # repo's check can run past 20 min, and once
                                 # every wake runs in its own worktree a
                                 # longer cap only delays the next wake's
                                 # turn — it can no longer let one wake's
                                 # leftover state contaminate another's PR
                                 # (see make_worktree below).
CONTEXT_LIMIT = 25               # most recent messages handed to the agent
# Follow-through. A run that has more to do than one cap allows does not
# file it for later — it pushes, writes what comes next to its continue
# file, and exits; the poller wakes it again AT ONCE in the same worktree.
# Bounded, so a run that keeps saying "more" can't hold a lane all day.
MAX_CONTINUES = 6
# Money. Every spawn carries a hard per-run budget, and the day has a cap
# summed from the ledger. Over the cap the wake is not dropped — it is
# queued with an `after:` condition for the next morning and the thread
# hears one plain line. (Defaults copied from fable-agent, flagged in the
# PR: tune via the plist's environment.)
WAKE_BUDGET_USD = float(os.environ.get("CLASH_AGENT_WAKE_BUDGET_USD", "25"))
DAILY_BUDGET_USD = float(os.environ.get("CLASH_AGENT_DAILY_BUDGET_USD", "120"))
# The one scheduled message: a plain-voiced digest of what landed today,
# posted top-level once the hour passes — only on days something did.
DIGEST_HOUR = (int(os.environ["CLASH_AGENT_DIGEST_HOUR"])
               if os.environ.get("CLASH_AGENT_DIGEST_HOUR") else
               None if "CLASH_AGENT_DIGEST_HOUR" in os.environ else 18)
# Post-merge: fable-agent's repo has a "verify shipped" workflow that asks
# the domain what it serves after every push to main. This repo has no
# GitHub Actions at all — Vercel deploys main on push and that is the whole
# story — so the check is OFF by default (empty = disabled). Set
# CLASH_AGENT_SHIPPED_WORKFLOW to a workflow name if one ever exists.
SHIPPED_WORKFLOW = os.environ.get("CLASH_AGENT_SHIPPED_WORKFLOW", "") or None
# The only copy the POLLER itself can put in the channel (the agent voices
# everything else). It must NOT promise "nothing changed": a timed-out run
# may have already branched and committed, so the line points to progress
# rather than claiming a clean slate.
FALLBACK_TEXT = ("Started on that but ran long and had to stop partway "
                 "through — Andrew will pick up from where it got to.")


def log(msg):
    print(f"{datetime.datetime.now().isoformat(timespec='seconds')}  {msg}",
          flush=True)


def slack(method, **params):
    """Slack Web API call. Raises on transport errors; returns the parsed
    body (callers check body['ok'])."""
    tok = open(TOKEN_FILE).read().strip()
    url = f"{API}/{method}"
    data = urllib.parse.urlencode(params).encode()
    req = urllib.request.Request(url, data=data, method="POST")
    req.add_header("Authorization", f"Bearer {tok}")
    with urllib.request.urlopen(req, timeout=20) as r:
        return json.load(r)


def post_message(text, thread_ts=None):
    params = {"channel": CHANNEL, "text": text}
    if thread_ts:
        params["thread_ts"] = thread_ts
    return slack("chat.postMessage", **params)


def add_reaction(name, ts):
    """Best-effort ack reaction on a triggering message — 'seen, working on
    it' before the (possibly multi-minute) agent run even starts. Never
    blocks or fails the wake: an already-reacted message ("already_reacted")
    is not an error, and any other transport/API failure is logged and
    swallowed, since a missing eyes-emoji is cosmetic, not correctness."""
    try:
        r = slack("reactions.add", channel=CHANNEL, name=name, timestamp=ts)
        if not r.get("ok") and r.get("error") != "already_reacted":
            log(f"reaction add not ok ({r.get('error')}) on {ts}")
    except Exception as e:
        log(f"reaction add failed on {ts}: {e}")


# ------------------------------------------------------------------ state
def state_path():
    return os.path.join(STATE_DIR, "state.json")


def load_state():
    try:
        with open(state_path()) as f:
            return json.load(f)
    except Exception:
        return {"last_ts": "0", "threads": {}}


def save_state(st):
    os.makedirs(STATE_DIR, exist_ok=True)
    tmp = state_path() + ".tmp"
    with open(tmp, "w") as f:
        json.dump(st, f, indent=2)
    os.replace(tmp, state_path())


def acquire_lock(name="poller.lock"):
    """One run per LANE. `poller.lock` is the Slack lane (the sweep and the
    wakes it spawns); `work.lock` is the follow-through lane (queued items,
    CI-fix wakes) — so a long build on one never makes a question on the
    other wait. Returns the held lock file object, or None when another
    live run owns it (dead-pid locks are reclaimed by flock itself — the
    lock dies with the process)."""
    os.makedirs(STATE_DIR, exist_ok=True)
    f = open(os.path.join(STATE_DIR, name), "a+")
    try:
        fcntl.flock(f, fcntl.LOCK_EX | fcntl.LOCK_NB)
    except OSError:
        f.close()
        return None
    f.seek(0)
    f.truncate()
    f.write(str(os.getpid()))
    f.flush()
    return f


# ------------------------------------------------------------------ messages
def is_human(m):
    """A message that should wake the agent: a real user (not our bot, not
    any bot integration), no join/leave/topic subtype."""
    if m.get("subtype") or m.get("bot_id"):
        return False
    u = m.get("user")
    return bool(u) and u != BOT_USER


def fetch_new(st):
    """New human messages since the watermark: top-level channel history plus
    replies in every tracked (recently active) thread. Returns a list of
    (thread_ts_or_None, message), oldest first, and updates watermarks."""
    new = []
    r = slack("conversations.history", channel=CHANNEL,
              oldest=st["last_ts"], limit=50)
    if not r.get("ok"):
        log(f"conversations.history not ok: {r.get('error')}")
        return []
    for m in sorted(r.get("messages", []), key=lambda m: m["ts"]):
        if float(m["ts"]) <= float(st["last_ts"]):
            continue
        st["last_ts"] = m["ts"]
        if is_human(m):
            new.append((m.get("thread_ts"), m))
            st["threads"][m.get("thread_ts") or m["ts"]] = m["ts"]
    # tracked threads: replies don't appear in channel history, poll each
    now = datetime.datetime.now().timestamp()
    for tts in list(st["threads"]):
        if now - float(st["threads"][tts]) > THREAD_TTL_S:
            del st["threads"][tts]
            continue
        r = slack("conversations.replies", channel=CHANNEL, ts=tts,
                  oldest=st["threads"][tts], limit=50)
        if not r.get("ok"):
            continue
        for m in sorted(r.get("messages", []), key=lambda m: m["ts"]):
            if float(m["ts"]) <= float(st["threads"][tts]):
                continue
            st["threads"][tts] = m["ts"]
            if is_human(m):
                new.append((tts, m))
    return new


def thread_context(thread_ts):
    """The conversation the agent sees: the thread's messages (or recent
    channel history for a top-level message), each tagged with its policy
    tier. The agent re-reads policy.md to interpret the tiers."""
    r = slack("conversations.replies", channel=CHANNEL, ts=thread_ts,
              limit=CONTEXT_LIMIT)
    msgs = r.get("messages", []) if r.get("ok") else []
    out = []
    for m in msgs[-CONTEXT_LIMIT:]:
        who = ("clash-claude" if m.get("user") == BOT_USER or m.get("bot_id")
               else TIERS.get(m.get("user"), f"unknown:{m.get('user')}"))
        out.append({"who": who, "ts": m["ts"], "text": m.get("text", "")})
    return out


def newest_house_reply(thread_ts):
    """Newest clash-claude message currently in the thread, as a float ts —
    or None when Slack can't say. None must always read as 'nobody has
    replied', so an unreadable thread can only ever cause an extra wake,
    never a swallowed one."""
    try:
        ours = [float(c["ts"]) for c in thread_context(thread_ts)
                if c["who"] == "clash-claude"]
    except Exception as e:
        log(f"thread {thread_ts} unreadable ({e}); treating as unanswered")
        return None
    return max(ours) if ours else None


def drop_answered(thread_ts, msgs, covered):
    """Drop the messages a run earlier in THIS sweep already answered.

    An approval run is spawned with a snapshot of its thread and RUNNER.md
    tells it to reply there, so a message that (a) predates that snapshot —
    i.e. the run saw it — and (b) is older than a clash-claude reply now
    sitting in the thread has already been answered. Waking a second session
    on it would double-reply (house-agent hit exactly this on 2026-08-06;
    ported here verbatim since the failure mode is identical).

    Fail-open by construction: `covered` only carries threads whose run
    SUCCEEDED (a timed-out run's fallback line must not count as an answer),
    both halves must hold, and an unreadable thread suppresses nothing. A
    genuinely unanswered message always wakes a session.
    """
    seen_at = covered.get(thread_ts)
    if not seen_at:
        return msgs
    replied = newest_house_reply(thread_ts)
    if replied is None:
        return msgs
    keep, done = [], []
    for m in msgs:
        (done if float(m["ts"]) < seen_at and float(m["ts"]) < replied
         else keep).append(m)
    if done:
        log(f"thread {thread_ts}: {len(done)} message(s) "
            f"({', '.join(m['ts'] for m in done)}) already answered by the "
            f"run that just finished; not waking a second session")
    return keep


# ------------------------------------------------------------------ approvals
def pending_dir():
    return os.path.join(STATE_DIR, "pending")


def check_approvals():
    """For each pending approval the agent registered, read the reactions on
    its ask-message. Andrew's 👍 → verdict 'approved'; his 👎 → 'denied';
    anyone else's reactions are ignored. Returns [(pending_dict, verdict)]
    and removes decided files."""
    decided = []
    d = pending_dir()
    if not os.path.isdir(d):
        return decided
    for fn in sorted(os.listdir(d)):
        if not fn.endswith(".json"):
            continue
        path = os.path.join(d, fn)
        try:
            p = json.load(open(path))
            r = slack("reactions.get", channel=CHANNEL, timestamp=p["ask_ts"])
            if not r.get("ok"):
                continue
            verdict = None
            for rx in (r.get("message", {}).get("reactions") or []):
                if ANDREW not in rx.get("users", []):
                    continue
                if rx.get("name") == APPROVE:
                    verdict = "approved"
                elif rx.get("name") == DENY:
                    verdict = "denied"
                    break            # an explicit 👎 always wins
            if verdict:
                decided.append((p, verdict))
                os.remove(path)
        except Exception as e:
            log(f"pending {fn}: unreadable ({e}); leaving for next pass")
    return decided


# ------------------------------------------------------------------ the agent
def spawn_env(tier, note_key=None):
    """The environment a woken agent runs in: the tier stamp (worklist.py's
    filing gate reads it — set here so a prompt can't rewrite it), a PATH
    that carries Homebrew's bin (without which the repo gate and gh/npm are
    structurally unreachable from a launchd-spawned run), and — when the
    wake has a note key — the two files RUNNER.md tells the agent to write:
    its wake note (what it did, for the next wake on this thread) and its
    continue file (what comes next, when one cap wasn't enough)."""
    env = {**os.environ, "CLASH_AGENT_TIER": tier}
    path = env.get("PATH", "")
    if BREW_BIN not in path.split(":"):
        env["PATH"] = f"{BREW_BIN}:{path}" if path else BREW_BIN
    if note_key:
        env["CLASH_AGENT_NOTE_PATH"] = note_path(note_key)
        env["CLASH_AGENT_CONTINUE_PATH"] = continue_path(note_key)
    return env


def gh_env():
    """gh/git from the poller itself (PR watch, issue pull): launchd's PATH
    has no /opt/homebrew/bin, so every such call borrows the spawn PATH."""
    return spawn_env("poller")


# ------------------------------------------------------------------ ledger
def ledger_path():
    return os.path.join(STATE_DIR, "ledger.jsonl")


def append_ledger(**entry):
    """One line per thing that happened: a run, a refusal, a merge, a
    fix wake. The answer to "what did the agent do on Tuesday" — and the
    daily budget's source of truth."""
    entry = {"at": datetime.datetime.now().isoformat(timespec="seconds"),
             **entry}
    try:
        os.makedirs(STATE_DIR, exist_ok=True)
        with open(ledger_path(), "a") as f:
            f.write(json.dumps(entry, sort_keys=True) + "\n")
    except OSError as e:
        log(f"ledger unwritable ({e}): {entry}")
    return entry


def ledger_entries(day=None):
    """Entries, optionally only those stamped on `day` (YYYY-MM-DD)."""
    out = []
    try:
        with open(ledger_path()) as f:
            for ln in f:
                try:
                    e = json.loads(ln)
                except ValueError:
                    continue
                if day is None or str(e.get("at", "")).startswith(day):
                    out.append(e)
    except FileNotFoundError:
        pass
    return out


def today():
    return datetime.datetime.now().date().isoformat()


def spent_today():
    return sum(float(e.get("cost") or 0) for e in ledger_entries(today()))


# ------------------------------------------------------ notes + continues
def note_path(key):
    """The wake note for a thread (or a queued item): what the last run on
    it did, verified, and left open. Written by the agent at the end of a
    run, handed back at the start of the next — the thread's memory, as
    opposed to the channel's 25 messages."""
    return os.path.join(STATE_DIR, "threads", f"{key}.md")


def continue_path(key):
    return os.path.join(STATE_DIR, "threads", f"{key}.continue")


def read_note(key):
    try:
        return open(note_path(key)).read().strip() or None
    except OSError:
        return None


def take_continue(key):
    """The agent's 'more to do' signal, consumed on read so a chain can't
    replay itself."""
    p = continue_path(key)
    try:
        text = open(p).read().strip()
    except OSError:
        return None
    try:
        os.remove(p)
    except OSError:
        pass
    return text or "continue where you left off"


def headline(key):
    """First line of the wake note, for the ledger and the digest — the
    agent writes it in plain voice (RUNNER.md), so it may be said aloud."""
    note = read_note(key)
    if not note:
        return None
    first = note.splitlines()[0].strip().lstrip("#-* ").strip()
    return first[:200] or None


# ------------------------------------------------------------- the queue
def queue_item(title, detail, tier, thread_ts=None, public_title=None,
               wait_for=None, priority=2, source="agent", **extra):
    """File one item into the follow-through queue (STATE_DIR/worklist/,
    one JSON per item — worklist.py reads them). Shared by worklist.py's
    `add` and by the poller itself (a wake refused for budget is queued for
    the morning rather than dropped). `public_title` is this repo's name
    for the plain-voiced line (fable-agent calls it family_title)."""
    t = datetime.datetime.now()
    slug = re.sub(r"[^a-z0-9]+", "-", title.lower()).strip("-")[:40]
    item = {
        # the id carries a random tail: two items filed in the same second
        # (two budget refusals in one sweep) must never overwrite each other
        "id": extra.pop("id", None) or f"{t:%Y%m%d-%H%M%S}-{os.urandom(2).hex()}-{slug}",
        "title": title,
        "public_title": public_title,
        "detail": detail,
        "thread_ts": thread_ts,
        "priority": priority,
        "filed": t.isoformat(timespec="seconds"),
        "tier": tier,
        "state": "open",
        "attempts": 0,
        "wait_for": wait_for,
        "source": source,
        **extra,
    }
    d = os.path.join(STATE_DIR, "worklist")
    os.makedirs(d, exist_ok=True)
    path = os.path.join(d, f"{item['id']}.json")
    tmp = path + ".tmp"
    with open(tmp, "w") as f:
        json.dump(item, f, indent=2)
    os.replace(tmp, path)
    return item


# ----------------------------------------------------------- one process
def parse_result(stdout):
    """The `--output-format json` result object: the last JSON line on
    stdout. Anything else (an older binary, a stub, a crash before the
    result) parses to {} and the caller falls back to the exit code."""
    for ln in reversed((stdout or "").splitlines()):
        ln = ln.strip()
        if ln.startswith("{") and ln.endswith("}"):
            try:
                obj = json.loads(ln)
            except ValueError:
                continue
            if obj.get("type") == "result" or "total_cost_usd" in obj:
                return obj
    return {}


def run_claude(prompt, mode, cwd, env, run_log, timeout=None):
    """One `claude -p` process, and everything it reports about itself.

    Returns a dict: ok, error, session_id, cost, duration_ms, num_turns,
    is_error, text. `ok` is False on a non-zero exit, on a result that says
    is_error, on the per-run budget stopping it, or on the cap — the caller
    decides what a not-ok run means (fallback line, resume ask)."""
    cmd = [CLAUDE_BIN, "-p", prompt, "--model", CLAUDE_MODEL,
           "--permission-mode", mode, "--output-format", "json",
           "--max-budget-usd", f"{WAKE_BUDGET_USD:g}"]
    res = {"ok": False, "error": None, "session_id": None, "cost": 0.0,
           "duration_ms": None, "num_turns": None, "is_error": None,
           "text": ""}
    try:
        with open(run_log, "a") as err:
            r = subprocess.run(cmd, cwd=cwd, stdout=subprocess.PIPE,
                               stderr=err, timeout=timeout or CLAUDE_TIMEOUT_S,
                               env=env, text=True)
        with open(run_log, "a") as out:
            out.write(r.stdout or "")
        obj = parse_result(r.stdout)
        res.update(session_id=obj.get("session_id"),
                   cost=float(obj.get("total_cost_usd") or 0),
                   duration_ms=obj.get("duration_ms"),
                   num_turns=obj.get("num_turns"),
                   is_error=obj.get("is_error"),
                   text=(obj.get("result") or "") if obj else (r.stdout or ""))
        if r.returncode != 0:
            res["error"] = f"exit {r.returncode}"
        elif obj.get("is_error"):
            res["error"] = f"result error ({obj.get('subtype')})"
        else:
            res["ok"] = True
    except subprocess.TimeoutExpired:
        res["error"] = f"timeout after {timeout or CLAUDE_TIMEOUT_S}s"
    except Exception as e:
        res["error"] = str(e)
    return res


# ------------------------------------------------------------- worktrees
def make_worktree(label, ref="origin/main"):
    """A fresh git worktree off up-to-date `ref` (origin/main by default —
    a CI-fix wake asks for the PR's own branch), isolated to this one wake.
    (Incident this closes — hit in storybook-studio/fable-agent,
    2026-08-14, identical architecture: wakes shared the one main checkout;
    wake N left it on its own feature branch, wake N+1 branched from THAT
    instead of main, so its "one-line fix" PR squash-merged wake N's entire
    unreviewed diff along as a stowaway.) A worktree is the actual fix: no
    wake can ever see another wake's branch, uncommitted state, or an
    in-progress build, because each gets its own directory and checkout.

    Deliberately NOT linked in: `.env.local`. fable-agent links its
    repo's local env into every worktree so a wake can boot the app; here
    that file holds the Supabase keys, STUDIO_TOKEN, the Stripe, RevenueCat,
    Resend and App Store Connect keys and the feature switches, the gate
    (`pnpm build`, `pnpm lint`, the vitest run) runs without any of them
    (CI does too, on purpose), and policy.md's production class says nothing
    touches that surface without a 👍 — so it stays in the main checkout
    only."""
    remote_branch = ref.split("/", 1)[1] if ref.startswith("origin/") else None
    subprocess.run(["git", "fetch", "origin"] +
                   ([remote_branch] if remote_branch else []),
                   cwd=REPO, capture_output=True, timeout=60, check=True)
    subprocess.run(["git", "worktree", "prune"],
                   cwd=REPO, capture_output=True, timeout=30)
    path = os.path.join(WORKTREE_DIR, label)
    if os.path.exists(path):
        shutil.rmtree(path, ignore_errors=True)
    os.makedirs(WORKTREE_DIR, exist_ok=True)
    subprocess.run(["git", "worktree", "add", "--detach", path, ref],
                   cwd=REPO, capture_output=True, timeout=60, check=True)
    if remote_branch and remote_branch != "main":
        # Put the PR's branch under the agent's feet so `git push` just
        # works. Best-effort: if the branch is checked out somewhere else
        # the wake stays detached and RUNNER.md's brief names the branch.
        subprocess.run(["git", "switch", "-C", remote_branch,
                        "--track", ref], cwd=path, capture_output=True,
                       timeout=30)
    return path


def current_branch(wt):
    try:
        b = subprocess.run(["git", "rev-parse", "--abbrev-ref", "HEAD"],
                           cwd=wt, capture_output=True, text=True,
                           timeout=10).stdout.strip()
        return b if b and b != "HEAD" else None
    except Exception:
        return None


def remove_worktree(path):
    """Best-effort cleanup once a wake is done — never fatal, and NEVER
    destroys a worktree that still holds uncommitted or unpushed work.
    RUNNER.md's push-early contract means real work should already be safe
    on its own remote branch by the time a wake ends; if that contract was
    violated (a crash, a timeout mid-commit), leaving the worktree in place
    is the ONLY way that work survives — a clean-looking git dir is not
    proof the work inside it is safe. Returns True when the worktree was
    left in place (there may be real work an Andrew-approved resume can pick
    back up — see register_resume), False when it was removed."""
    try:
        dirty = subprocess.run(["git", "status", "--porcelain"], cwd=path,
                               capture_output=True, text=True, timeout=15)
        unpushed = subprocess.run(["git", "log", "@{u}..HEAD", "--oneline"],
                                  cwd=path, capture_output=True, text=True,
                                  timeout=15)
        if dirty.stdout.strip() or (unpushed.returncode == 0 and unpushed.stdout.strip()):
            log(f"worktree left in place — uncommitted or unpushed work "
                f"survives: {path}")
            return True
    except Exception as e:
        log(f"worktree safety check failed ({e}) — leaving it in place: {path}")
        return True
    subprocess.run(["git", "worktree", "remove", "--force", path],
                   cwd=REPO, capture_output=True, timeout=30)
    return False


def register_resume(thread_ts, wt, kind):
    """A run that left real, unpublished work behind (crash/timeout
    mid-commit) gets ONE honest message and a real path back to it — never a
    silently rotting worktree nobody knows exists. Reuses the exact approval
    mechanism (Andrew's own 👍/👎, nobody else's) rather than inventing a
    second one: resuming is exactly as consequential as any other
    andrew-tier, ungated action, so it earns the same gate. If the ask
    itself can't be posted, the worktree still survives on disk
    (remove_worktree already decided that) — it's just unregistered, same as
    any other still-there-but-not-yet-noticed state."""
    branch = current_branch(wt) or "(unknown branch)"
    ask_text = (
        f"This one ran long and I had to stop before finishing — the "
        f"in-progress work is still there, on `{branch}`. React 👍 here if "
        f"you'd like me to pick it back up where I left off, or leave it "
        f"and I won't touch it again."
    )
    try:
        r = post_message(ask_text, thread_ts=thread_ts)
        ask_ts = r.get("ts")
        if not ask_ts:
            log(f"resume ask posted but Slack returned no ts — can't "
                f"register it for approval, worktree still on disk: {wt}")
            return
    except Exception as e:
        log(f"resume ask post failed ({e}) — worktree left in place but "
            f"unregistered: {wt}")
        return
    p = {"ask_ts": ask_ts, "thread_ts": thread_ts,
         "summary": f"resume the interrupted {kind} run on {branch}",
         "action": "resume and finish the original task in the "
                   "already-checked-out worktree",
         "resume_worktree": wt}
    os.makedirs(pending_dir(), exist_ok=True)
    json.dump(p, open(os.path.join(pending_dir(), f"{ask_ts}.json"), "w"))


# ------------------------------------------------------------ PR watch
def start_pr_watch(branch, thread_ts, tier, note_key):
    """Hand a finished run's branch to prwatch.py, detached: it watches the
    PR's checks, re-wakes the agent on red, merges green Andrew-tier work,
    and asks for 👍 on everything else. Never blocks the sweep."""
    if not branch or branch == "main":
        return None
    try:
        os.makedirs(os.path.join(STATE_DIR, "runs"), exist_ok=True)
        out = open(os.path.join(STATE_DIR, "runs", f"prwatch-{branch.replace('/', '-')}.log"), "a")
        p = subprocess.Popen(
            [sys.executable, os.path.join(BASE, "prwatch.py"),
             "--branch", branch, "--thread", thread_ts or "-",
             "--tier", tier, "--note-key", note_key],
            cwd=REPO, stdout=out, stderr=subprocess.STDOUT,
            env=gh_env(), start_new_session=True)
        log(f"pr watch started for {branch} (pid {p.pid})")
        return p.pid
    except Exception as e:
        log(f"pr watch failed to start for {branch}: {e}")
        return None


# ---------------------------------------------------------------- budget
def over_budget():
    return spent_today() >= DAILY_BUDGET_USD


def defer_for_budget(kind, thread_ts, payload, tier):
    """The day's cap is spent: queue this wake for the morning instead of
    dropping it, and tell the thread once, plainly."""
    tomorrow = (datetime.datetime.now() + datetime.timedelta(days=1)).replace(
        hour=8, minute=0, second=0, microsecond=0)
    title = f"deferred {kind} wake" + (f" in thread {thread_ts}" if thread_ts else "")
    queue_item(title=title,
               detail=("This wake was refused because the day's budget was "
                       "spent. Re-run it exactly as a fresh wake of the "
                       "same kind. Payload: " + json.dumps(payload)),
               tier=tier, thread_ts=thread_ts,
               public_title="something you asked for yesterday",
               wait_for=f"after:{tomorrow.isoformat(timespec='minutes')}",
               priority=1, source="budget", deferred_kind=kind,
               deferred_payload=payload)
    append_ledger(kind=kind, thread=thread_ts, tier=tier, ok=False,
                  outcome="deferred-budget", spent=round(spent_today(), 2))
    st = load_state()
    if st.get("budget_notice_date") != today():
        try:
            post_message("I've used up what I'm allowed to spend today — "
                         "I'll pick this up first thing tomorrow.",
                         thread_ts=thread_ts)
        except Exception as e:
            log(f"budget notice failed: {e}")
        st["budget_notice_date"] = today()
        save_state(st)


# ------------------------------------------------------------- the wake
INTRO = {
    "message": ("woken by clash-agent/poller.py for the #crossword-clash Slack "
                "channel."),
    "approval": ("woken by clash-agent/poller.py because Andrew reacted to "
                 "an ask you registered."),
    "worklist": ("woken by clash-agent/worklist.py on a queued item — not "
                 "by a Slack message. The 'Follow through' section of "
                 "RUNNER.md governs this wake: do the item end to end and "
                 "close it with worklist.py."),
    "continue": ("woken again by clash-agent/poller.py to CONTINUE your own "
                 "previous run in this same worktree — you asked for this "
                 "by writing your continue file. Run `git status` and "
                 "`git log` first; your continue note is in the brief."),
    "ci-fix": ("woken by clash-agent/prwatch.py because the checks on your "
               "pull request are red (or it conflicts with main). The "
               "worktree is on the PR's branch. Fix it, push, and the "
               "watch resumes on its own."),
    "incident": ("woken by clash-agent/poller.py because the repo's "
                 "post-merge workflow failed: a merge reached main and the "
                 "site is not serving it. Diagnose first; promoting a "
                 "deployment needs Andrew's 👍."),
}


def wake_agent(kind, thread_ts, payload, tier, note_key=None, ref="origin/main"):
    """Spawn headless Claude Code (Opus) in an isolated worktree with the
    thread — and the thread's wake note — as context, and keep it going for
    as long as it says it has more to do.

    The prompt stays thin on purpose: RUNNER.md and policy.md (read fresh
    each run) are the real instructions, so behavior changes ship as doc
    edits, not poller deploys. `tier` picks the permission mode (see
    TIER_MODE) — the hard enforcement of the trust tier.

    Shape of one wake:
      * budget check — over the day's cap the wake is queued for the
        morning, never dropped
      * worktree off `ref` (origin/main, or a PR branch for ci-fix)
      * run; if the agent left a continue file, run again in the same
        worktree with that note — up to MAX_CONTINUES
      * ledger line per run
      * on success, hand the branch to prwatch.py; on failure, the
        fail-closed fallback (and the 👍-gated resume when real work is
        left behind)

    An approval whose pending file carries `resume_worktree` (see
    register_resume) is Andrew resuming a run that ran long and left real
    work behind — it runs IN that already-checked-out worktree, on its
    current branch, instead of a fresh one off origin/main."""
    mode = TIER_MODE.get(tier, DEFAULT_MODE)
    note_key = note_key or thread_ts or f"{kind}-{os.getpid()}"
    if over_budget():
        log(f"daily budget spent ({spent_today():.2f} ≥ {DAILY_BUDGET_USD}); "
            f"deferring {kind} wake for thread {thread_ts}")
        defer_for_budget(kind, thread_ts, payload, tier)
        return False

    resume_wt = (payload.get("pending") or {}).get("resume_worktree") \
        if kind == "approval" else None
    resuming = bool(resume_wt and os.path.isdir(resume_wt))
    if resume_wt and not resuming:
        log(f"resume worktree {resume_wt!r} no longer exists — starting "
            f"fresh instead")

    def brief_for(k, pl):
        return {
            "kind": k,
            "channel": CHANNEL,
            "thread_ts": thread_ts,
            "tier": tier,
            "payload": pl,
            "note": read_note(note_key),
            "context": thread_context(thread_ts) if thread_ts else [],
        }

    def prompt_for(k, pl, extra=""):
        return (
            "You are Crossword Clash Claude, " + INTRO.get(k, INTRO["message"])
            + " FIRST read clash-agent/RUNNER.md and clash-agent/policy.md "
            "and follow them exactly — they are the contract for scope, "
            "trust tiers, approvals, how to reply, and how to follow "
            "through. " + extra + "Then handle this:\n\n"
            + json.dumps(brief_for(k, pl), indent=2)
        )

    resume_note = (
        "You are RESUMING your own prior run in this exact worktree — it "
        "already has real, uncommitted-or-unpushed work on its current "
        "branch. Run `git status` and `git log` first to see exactly where "
        "you left off before doing anything else. "
    ) if resuming else ""

    os.makedirs(os.path.join(STATE_DIR, "runs"), exist_ok=True)
    # A random suffix, not just key/kind/pid: the daemon's pid is stable for
    # days, so two wakes in the SAME thread (e.g. a reply after an earlier
    # resume is still pending) would otherwise compute the identical label —
    # and make_worktree's own "rm any existing dir at this path" step would
    # silently destroy an earlier wake's PRESERVED, resume-ask worktree the
    # moment a same-thread wake landed after it. (clash-agent's own catch,
    # 2026-08-14; kept over fable-agent's pid-only label.)
    label = (f"{note_key}-{kind}-{os.getpid()}-{uuid.uuid4().hex[:8]}"
             .replace("/", "-"))
    run_log = os.path.join(STATE_DIR, "runs", f"{label}.log")
    env = spawn_env(tier, note_key)
    wake_started = datetime.datetime.now().timestamp()
    wt = None
    cleaned_up = False
    res = {"ok": False, "error": "not started"}
    try:
        wt = resume_wt if resuming else make_worktree(label, ref=ref)
        if resuming:
            log(f"resuming preserved worktree: {wt}")
        k, pl, extra = kind, payload, resume_note
        for chain in range(MAX_CONTINUES + 1):
            res = run_claude(prompt_for(k, pl, extra), mode, wt, env, run_log)
            append_ledger(kind=k, thread=thread_ts, key=note_key, tier=tier,
                          mode=mode, chain=chain, ok=res["ok"],
                          error=res["error"], cost=round(res["cost"], 4),
                          duration_ms=res["duration_ms"],
                          turns=res["num_turns"], session=res["session_id"],
                          branch=current_branch(wt), headline=headline(note_key))
            if not res["ok"]:
                raise RuntimeError(res["error"])
            more = take_continue(note_key)
            if more is None:
                break
            if chain >= MAX_CONTINUES:
                log(f"continue chain hit MAX_CONTINUES ({MAX_CONTINUES}) on "
                    f"{note_key}; stopping here")
                break
            log(f"agent asked to continue ({chain + 1}/{MAX_CONTINUES}) on "
                f"{note_key}")
            k, pl, extra = "continue", {"continue_note": more,
                                        "chain": chain + 1,
                                        "original_kind": kind,
                                        "original_payload": payload}, ""
        log(f"agent run ok ({kind}, thread {thread_ts}, {tier}/{mode}) → {run_log}")
        start_pr_watch(current_branch(wt), thread_ts, tier, note_key)
        return True
    except Exception as e:
        log(f"agent run FAILED ({kind}, thread {thread_ts}): {e} — see {run_log}")
        # A run that already replied since this wake started already spoke
        # for itself — a second, scarier fallback line on top of a finished
        # job is noise at best, actively misleading at worst.
        already_spoke = False
        if thread_ts:
            try:
                newest = newest_house_reply(thread_ts)
                already_spoke = newest is not None and newest > wake_started
            except Exception as e2:
                log(f"already-spoke check failed ({e2}) — falling back to posting")

        preserved = False
        if wt is not None:
            preserved = remove_worktree(wt)
            cleaned_up = True

        if preserved:
            # Real, unpublished work survives on disk — make sure Andrew can
            # actually find it and decide whether to resume, rather than it
            # silently rotting in WORKTREE_DIR forever.
            register_resume(thread_ts, wt, kind)
        elif already_spoke:
            log(f"skipping fallback ({kind}, thread {thread_ts}) — the agent "
                f"already replied since this wake started")
        else:
            try:
                post_message(FALLBACK_TEXT, thread_ts=thread_ts)
            except Exception as e2:
                log(f"fallback post also failed: {e2}")
        return False
    finally:
        if wt is not None and not cleaned_up:
            remove_worktree(wt)


# ------------------------------------------------------------- the digest
def maybe_post_digest(st):
    """Once a day, after DIGEST_HOUR, one top-level message saying what
    landed today in plain voice — the headlines the agent wrote in its
    wake notes, never PR numbers or branch names. Silent on a day nothing
    landed, and never twice."""
    if DIGEST_HOUR is None or st.get("digest_date") == today():
        return
    if datetime.datetime.now().hour < DIGEST_HOUR:
        return
    st["digest_date"] = today()
    save_state(st)
    lines, seen = [], set()
    for e in ledger_entries(today()):
        h = e.get("headline")
        if e.get("ok") and h and h not in seen:
            seen.add(h)
            lines.append(f"• {h}")
    if not lines:
        return
    try:
        post_message("What got done today:\n" + "\n".join(lines[:12]))
    except Exception as e:
        log(f"digest post failed: {e}")


# ------------------------------------------------------------ shipped?
def check_shipped(st):
    """Did the last merge actually reach users? Where a repo has a
    post-merge workflow that asks the domain (fable-agent's 'verify
    shipped'), a failed run wakes an incident brief in its own top-level
    thread. This repo has none today (SHIPPED_WORKFLOW is None), so this is
    a no-op until one exists."""
    if not SHIPPED_WORKFLOW:
        return
    try:
        r = subprocess.run(["gh", "run", "list", "--workflow", SHIPPED_WORKFLOW,
                            "--limit", "1", "--json",
                            "databaseId,conclusion,headSha,url,status"],
                           cwd=REPO, capture_output=True, text=True,
                           timeout=30, env=gh_env())
        runs = json.loads(r.stdout or "[]") if r.returncode == 0 else []
    except Exception as e:
        log(f"verify-shipped check failed ({e})")
        return
    if not runs:
        return
    run = runs[0]
    if run.get("conclusion") != "failure":
        return
    if str(run.get("databaseId")) == str(st.get("shipped_failed_seen")):
        return
    st["shipped_failed_seen"] = str(run.get("databaseId"))
    save_state(st)
    try:
        r = post_message("Something that just merged isn't reaching the "
                         "live site. Looking into it.")
        thread_ts = r.get("ts")
    except Exception as e:
        log(f"incident post failed: {e}")
        thread_ts = None
    wake_agent("incident", thread_ts,
               {"workflow": SHIPPED_WORKFLOW, "run": run}, tier="andrew",
               note_key=f"incident-{run.get('databaseId')}")


# ------------------------------------------------------------------ main
# ------------------------------------------------------------ deploy
FOLLOW_EVERY_S = 600


def follow_main(st):
    """The deploy checkout follows origin/main on its own. It is a worktree
    on a `deploy` branch that tracks origin/main (README, "Deploying"): a
    fast-forward there IS the deploy, and the daemon re-execs itself when
    its sources change on disk. At most every ten minutes, only when REPO
    really is on `deploy` — a dev checkout running a sweep by hand is never
    pulled out from under its owner — and never anything but a
    fast-forward: a checkout that has diverged stays where it is and says
    so in the log."""
    now = datetime.datetime.now().timestamp()
    if now - st.get("followed_at", 0) < FOLLOW_EVERY_S:
        return
    st["followed_at"] = now
    save_state(st)
    if current_branch(REPO) != "deploy":
        return

    def head():
        return subprocess.run(["git", "rev-parse", "--short", "HEAD"],
                              cwd=REPO, capture_output=True, text=True,
                              timeout=10).stdout.strip()
    try:
        before = head()
        r = subprocess.run(["git", "pull", "--ff-only", "--quiet"], cwd=REPO,
                           capture_output=True, text=True, timeout=120,
                           env=gh_env())
        after = head()
    except Exception as e:
        log(f"deploy checkout: pull failed ({e})")
        return
    if r.returncode != 0:
        why = ((r.stderr or r.stdout).strip().splitlines() or ["?"])[0]
        log(f"deploy checkout: not a fast-forward, staying on {before} — {why}")
        return
    if after != before:
        log(f"deploy checkout: {before} → {after} (main); the daemon "
            "re-execs if its sources changed")
        append_ledger(kind="deploy", key="deploy", ok=True,
                      detail=f"{before}->{after}")


def main():
    lock = acquire_lock()
    if lock is None:
        log("another run holds the lock; skipping this sweep")
        return 0
    st = load_state()
    first_arm = st["last_ts"] == "0"

    # Decided approvals wake the agent with the verdict. Tier andrew: an
    # approval wake exists only because Andrew explicitly reacted, and it
    # executes exactly the registered action he reviewed.
    # These runs block the sweep (often for minutes) and reply in-thread, so
    # record thread → when the run's thread snapshot was taken; drop_answered
    # uses it below to keep the message sweep from re-waking on anything that
    # run already answered.
    covered = {}
    for p, verdict in check_approvals():
        log(f"approval {verdict}: {p.get('summary', p['ask_ts'])}")
        snapshot = datetime.datetime.now().timestamp()
        if wake_agent("approval", p["thread_ts"],
                      {"verdict": verdict, "pending": p}, tier="andrew"):
            covered[p["thread_ts"]] = max(covered.get(p["thread_ts"], 0),
                                          snapshot)

    new = fetch_new(st)
    # Arm-time watermark: the very first sweep only sets the high-water mark —
    # it must not replay the channel's whole backlog into agent runs.
    if first_arm:
        save_state(st)
        log(f"first sweep: watermark armed at {st['last_ts']}, "
            f"{len(new)} backlog message(s) skipped")
        return 0
    # At-most-once: persist the advanced watermark BEFORE spawning, so a
    # crashing agent can't poison-loop on the same message forever.
    save_state(st)
    by_thread = {}
    for tts, m in new:
        by_thread.setdefault(tts or m["ts"], []).append(m)
    for thread_ts, msgs in by_thread.items():
        msgs = drop_answered(thread_ts, msgs, covered)
        if not msgs:
            continue
        # The wake's tier is the WEAKEST author among its new messages: one
        # non-Andrew message in the batch and the whole run is gated.
        tiers = {TIERS.get(m.get("user"), "unknown") for m in msgs}
        tier = "andrew" if tiers == {"andrew"} else "unknown"
        log(f"waking agent: thread {thread_ts}, {len(msgs)} new, tier {tier}")
        # Instant "seen, working on it" before the (possibly multi-minute)
        # run starts — skipped for approval wakes above, where Andrew's own
        # reaction is already the visible signal.
        add_reaction("eyes", msgs[-1]["ts"])
        wake_agent("message", thread_ts, {"new_ts": [m["ts"] for m in msgs]},
                   tier=tier)
    if not new:
        log("no new messages")
    # What a sweep does besides messages: say what landed today (once,
    # after DIGEST_HOUR), notice a merge that never reached users, and
    # keep the deploy checkout on main.
    maybe_post_digest(st)
    check_shipped(st)
    follow_main(st)
    return 0


if __name__ == "__main__":
    sys.exit(main())

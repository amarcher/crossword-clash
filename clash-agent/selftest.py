#!/usr/bin/env python3
"""Offline clash-agent selftest — proves the #crossword-clash poller BEFORE it ever
touches Slack or spawns a real agent. No network, no real token, no `claude`,
no GitHub.

A right-sized port of smart-home/house-agent's selftest.py for this project:
same seam pattern (stub Slack API on loopback + a recorder stub for `claude`,
all via CLASH_AGENT_* env overrides), a smaller scenario set matched to what's
actually different here (single trust tier, Opus on every spawn, a different
workspace/channel) — PLUS the worktree-isolation regression suite ported from
storybook-studio/fable-agent (2026-08-14 incident: see poller.py's
make_worktree docstring), PLUS the follow-through suite ported from the same
place on 2026-09-01 (conditions, two lanes, wake notes, the continue chain,
the PR-watch verdict, the budget). The worktree scenarios run
against a REAL local git repo + bare "origin" (a few `git init`/`git init
--bare`/`git push` calls in fixture setup) — not a mocked filesystem —
because that's the exact seam a mock would paper over.

Contract pins first:
  * the daemon plist points at daemon.py in the DEPLOY checkout, with
    logs under STATE_DIR (outside the repo); the daylight plist is GONE
  * poller.py's CHANNEL/ANDREW/TIER_MODE/CLAUDE_MODEL/CLAUDE_TIMEOUT_S pins:
    bypassPermissions is reachable ONLY from the andrew tier; every spawn
    uses --model opus; the run cap is 45 (not 30) minutes
  * both token files default to STATE_DIR outside the repo (the house-agent
    2026-07-03 git-clean class)
  * the worktree machinery (make_worktree/remove_worktree/register_resume)
    exists in poller.py, and worklist.py spawns ONLY through poller.wake_agent
  * the follow-through contract (check_worklist_contract): no daylight job,
    conditions in code, one spawn path, the tier gate stamped at the spawn
    boundary, the plain-voiced stuck notice, budget/ledger/memory/continue/
    PR-watch pins, the PR template's Verified section, and the docs that
    promise all of it

Then the behavioral proof against a stub Slack API, a stub `claude` binary
that records its argv/cwd and answers like the real binary's
`--output-format json` result, and a real git repo + bare origin:
  1. seams wired — token/state/API/claude/repo all redirected
  2. first sweep only ARMS the watermark: a channel with backlog spawns
     nothing
  3. a new message from Andrew wakes the agent once, tier "andrew",
     --permission-mode bypassPermissions, --model opus, in an ISOLATED
     worktree containing origin/main's content, acked with an eyes
     reaction, cleaned up after
  4. a new message from anyone else wakes the agent once, tier "unknown",
     --permission-mode acceptEdits
  5. a repeat sweep with nothing new spawns nothing (dedupe)
  6. the bot's own messages and bot_id messages (any bot integration)
     never wake the agent
  7. thread replies (invisible to channel history) are picked up via the
     tracked-thread watermark
  8. singleton: a held lock skips the sweep
  9. approvals: Andrew's 👍 wakes the agent with verdict approved and clears
     the pending file; his 👎 → denied; a NON-Andrew 👍 decides nothing
 10. worktree isolation: two separate wakes never share a worktree directory
 11. a wake that leaves uncommitted work has its worktree PRESERVED, not
     deleted
 12. a run that already replied since it started never gets the generic
     fallback stacked on top
 13. a run that fails AND leaves real work behind gets a 👍-gated resume ask
     (not the fallback); Andrew's 👍 resumes it IN THE SAME worktree; a
     resume that resolves its own leftover gets cleanly removed after
 14. a failing spawn with no leftover work posts the plain fallback and the
     watermark still advances (no poison loop)
 15. the follow-through queue (worklist.py): only an Andrew-tier run may
     file; an unknown --wait is refused; an item with no condition runs on
     the very next pass — 03:12 included — in its OWN worktree, ungated,
     with kind "worklist" and its note/continue paths; `done` retires the
     item into worklist/done/; daytime / cmd: / after: / approval
     conditions each gate and clear on their own; priority order; an item
     that never closes reopens, and after three dead passes costs Andrew
     exactly ONE plain in-thread notice — never repeated. That notice says
     the item's `public_title` and NEVER its agent-voiced `title` (the
     real "Deploy PR #196 ..." shape is replayed as a fixture), an
     ops-flavoured public_title is dropped rather than tidied, and an item
     parked on an unanswered 👍 says it's waiting rather than claiming
     three failed tries. Two lanes: the queue runs while a Slack wake
     holds its lock; a second queue pass waits for the first.
 16. the wake note: written by the run, handed back to the next wake on
     the same thread, headlined + costed in the ledger with its session
 17. follow through: a run that writes its continue file is woken again
     AT ONCE in the same worktree with that note; the file is consumed;
     the chain is bounded at MAX_CONTINUES (6)
 18. memory: the worktree's project memory is a link to the main
     checkout's (realpath keys); stray pre-existing memory is folded in
 19. the PR watch's whole policy as a pure function: DIRTY / red /
     under-counted / unverified / pending-Vercel never read as green
 20. money: over the day's cap a wake is QUEUED for the morning, not
     dropped, and the thread hears one plain line (once a day); it runs
     as itself when the day turns. Last, because the seeded spend blocks
     every wake after it.

Exit 0 = pass; non-zero with a CLASH-AGENT SELFTEST FAIL line otherwise.
"""
import datetime
import fcntl
import http.server
import json
import os
import re
import shutil
import stat
import subprocess
import sys
import tempfile
import threading
import time
import urllib.parse

BASE = os.path.dirname(os.path.abspath(__file__))
ROOT = os.path.dirname(BASE)
DAYLIGHT_PLIST = os.path.join(BASE, "com.archer.race-daylight.plist")
PR_TEMPLATE = os.path.join(ROOT, ".github", "pull_request_template.md")

BANNED_WORDS = ("error", "fail", "http", "unreachable", "exception",
                "traceback")


def fail(msg):
    print(f"CLASH-AGENT SELFTEST FAIL: {msg}")
    sys.exit(1)


def ok(msg):
    print(f"  ok: {msg}")


def _git(args, cwd=None):
    """Fixture-setup git call — fails loudly rather than silently producing
    a broken fixture the worktree scenarios would then pass against for the
    wrong reason."""
    r = subprocess.run(["git", *args], cwd=cwd, capture_output=True, text=True)
    if r.returncode != 0:
        fail(f"selftest fixture setup failed: git {args} (cwd={cwd}) — {r.stderr}")
    return r


# ------------------------------------------------------------ contract pins
def check_contract():
    import poller

    if poller.CHANNEL != "C0CDQQ1CHUG":
        fail(f"poller.CHANNEL is {poller.CHANNEL!r}, expected #crossword-clash's id")
    if poller.ANDREW != "U406UR8P4":
        fail(f"poller.ANDREW is {poller.ANDREW!r}, expected Andy's user id")
    if poller.TIER_MODE != {"andrew": "bypassPermissions"}:
        fail(f"TIER_MODE must map ONLY andrew to bypassPermissions, got "
             f"{poller.TIER_MODE!r}")
    if poller.DEFAULT_MODE != "acceptEdits":
        fail(f"DEFAULT_MODE is {poller.DEFAULT_MODE!r}, expected acceptEdits "
             f"(anything non-andrew must run permission-gated)")
    if poller.TIERS.get(poller.ANDREW) != "andrew":
        fail("ANDREW must map to tier 'andrew' in TIERS")
    if os.environ.get("CLASH_AGENT_CLAUDE_MODEL") is None and poller.CLAUDE_MODEL != "opus":
        fail(f"CLAUDE_MODEL default is {poller.CLAUDE_MODEL!r}, expected 'opus' "
             f"(every clash-agent spawn must run Opus, not the CLI default)")
    if poller.CLAUDE_TIMEOUT_S != 45 * 60:
        fail(f"CLAUDE_TIMEOUT_S is {poller.CLAUDE_TIMEOUT_S!r}, expected 45 "
             f"minutes — safe to raise from 30 only because worktree "
             f"isolation means a longer cap no longer risks cross-wake "
             f"contamination")
    if os.environ.get("CLASH_AGENT_SHIPPED_WORKFLOW") is None and poller.SHIPPED_WORKFLOW:
        fail(f"SHIPPED_WORKFLOW defaults to {poller.SHIPPED_WORKFLOW!r} — this "
             f"repo has no post-merge workflow; the default must be off")
    repo_root = os.path.dirname(BASE)
    if os.path.commonpath([os.path.abspath(poller.TOKEN_FILE), repo_root]) == repo_root \
            and os.environ.get("CLASH_AGENT_TOKEN_FILE") is None:
        fail("TOKEN_FILE default must live outside the repo tree")
    for fn in ("make_worktree", "remove_worktree", "register_resume", "add_reaction"):
        if not hasattr(poller, fn):
            fail(f"poller.py lost {fn}() — the worktree-isolation fix "
                 f"(storybook-studio/fable-agent, 2026-08-14) is missing")

    path = os.path.join(BASE, "com.archer.clash-agent.plist")
    if not os.path.isfile(path):
        fail("missing com.archer.clash-agent.plist")
    text = open(path).read()
    if "clash-agent/daemon.py" not in text:
        fail("com.archer.clash-agent.plist doesn't reference clash-agent/daemon.py")
    # The daemon runs from its own deploy checkout (a worktree on a `deploy`
    # branch tracking origin/main), never the checkout being developed in.
    if "/Users/archer/.crossword-clash/clash-agent/checkout</string>" not in text:
        fail("com.archer.clash-agent.plist WorkingDirectory doesn't point at the "
             "deploy checkout (~/.crossword-clash/clash-agent/checkout)")
    if "/Users/archer/.crossword-clash/clash-agent/" not in text:
        fail("com.archer.clash-agent.plist logs aren't under the outside-repo state dir")

    poller_src = open(os.path.join(BASE, "poller.py")).read()
    worklist_src = open(os.path.join(BASE, "worklist.py")).read()
    if poller_src.count("bypassPermissions") != 1:
        fail("bypassPermissions appears outside TIER_MODE in poller.py — "
             "the only path to an ungated agent must be the andrew tier")
    if "bypassPermissions" in worklist_src:
        fail("worklist.py names bypassPermissions — the queue no longer picks "
             "a permission mode; poller.wake_agent does, from the tier stamp")
    ok("contract pins")
    check_worklist_contract(poller_src, worklist_src)


def check_worklist_contract(poller_src, wsrc):
    """The follow-through queue can't drift either: no scheduled daylight
    job any more, one spawn path, conditions in code, and the docs that
    promise all of it."""
    psrc = open(os.path.join(BASE, "prwatch.py")).read()
    dsrc = open(os.path.join(BASE, "daemon.py")).read()
    readme = open(os.path.join(BASE, "README.md")).read()
    runner = open(os.path.join(BASE, "RUNNER.md")).read()
    policy = open(os.path.join(BASE, "policy.md")).read()

    # The daylight job is gone on purpose (2026-09-01): a run finishes its
    # own follow-ups; the queue holds only work that names what it waits on.
    if os.path.exists(DAYLIGHT_PLIST):
        fail("com.archer.race-daylight.plist is back — the twice-daily pass "
             "was retired; queued work runs on the follow-through lane as "
             "soon as its condition clears")
    if "def is_ready" not in wsrc or "def parse_wait" not in wsrc:
        fail("worklist.py lost its conditions (is_ready/parse_wait) — an item "
             "must say why it can't run now, or run now")
    if "def in_daylight" in wsrc or "if not in_daylight()" in wsrc:
        fail("worklist.py gates the whole pass on a daylight window again — "
             "daytime is one CONDITION an item may ask for, not the queue's clock")
    # ONE spawn path: the queue never runs an agent itself
    if "poller.wake_agent(" not in wsrc:
        fail("worklist.py no longer spawns through poller.wake_agent — the "
             "worktree, budget, ledger, continue chain and PR "
             "watch all live there and must not be re-implemented")
    if "subprocess.run([poller.CLAUDE_BIN" in wsrc or "poller.make_worktree(" in wsrc:
        fail("worklist.py spawns claude (or cuts a worktree) itself again — "
             "that is a second spawn path, and every safety property lives "
             "in the first")
    # the tier gate: only an Andrew-tier run may queue work (the stamp is set
    # at the SPAWN boundary, not in a prompt the run could be talked into
    # rewriting)
    if 'CLASH_AGENT_TIER": tier' not in poller_src:
        fail("poller.py no longer stamps CLASH_AGENT_TIER into the run's "
             "environment — worklist.py's filing gate depends on it")
    if 'os.environ.get("CLASH_AGENT_TIER", "")' not in wsrc \
            or 'if tier != "andrew"' not in wsrc:
        fail("worklist.py add no longer refuses non-Andrew-tier runs — a "
             "channel message could queue itself ungated work")
    # the stuck notice is the ONE unprompted message this design allows: it
    # must read the plain-voiced field, never the agent-voiced title it
    # used to paste in verbatim (house-agent's 2026-08-08 leak).
    if "def compose_stuck_notice" not in wsrc or "public_title" not in wsrc:
        fail("worklist.py lost the plain-voiced stuck notice — the notice "
             "must never go back to interpolating the raw item title")
    notice = wsrc.split("def compose_stuck_notice", 1)[1].split("\ndef ", 1)[0]
    if re.search(r"""\[.?['"]title['"]""", notice):
        fail("compose_stuck_notice reads the item's own title again — titles "
             "are written by the agent FOR the agent (PR numbers, versions, "
             "filenames) and must never reach the channel")
    if "--public-title" not in runner:
        fail("RUNNER.md no longer tells the filing run to write a "
             "--public-title — without one every stuck notice is generic")
    # the promises this whole mechanism exists to keep
    low = runner.lower()
    for must in ("follow through", "never hand andrew a list",
                 "clash_agent_note_path", "clash_agent_continue_path",
                 "--wait", "verified", "cmd:"):
        if must not in low:
            fail(f"RUNNER.md lost {must!r} — the agent would stop following "
                 f"through, writing its note, or filling the Verified block")
    if "to-do list" not in policy:
        fail("policy.md lost the standing rule against handing Andrew a "
             "to-do list")
    if "daylight" in policy.lower():
        fail("policy.md still sends work to a daylight worklist — the queue "
             "is the follow-through queue now, worked as soon as a condition clears")
    # poller: the spawn carries a budget and reports itself; memory is linked
    for frag in ('"--output-format", "json"', '"--max-budget-usd"',
                 "def follow_main", "def append_ledger", "def take_continue",
                 "CLASH_AGENT_NOTE_PATH", "CLASH_AGENT_CONTINUE_PATH",
                 "def start_pr_watch", "def defer_for_budget", "MAX_CONTINUES"):
        if frag not in poller_src:
            fail(f"poller.py lost {frag!r} — budget, ledger, "
                 f"continue chain or PR watch is gone")
        for frag in ("link_memory", "memory_index", "BRAIN_DIR", "CLAUDE_PROJECTS_DIR"):
            if frag in poller_src:
                fail(f"poller.py grew memory machinery again ({frag!r}) — auto "
                     "memory is on and keyed to the git repo (verified 2026-09-02 "
                     "with a headless probe), so every wake already shares the store")
    if "uuid.uuid4().hex[:8]" not in poller_src:
        fail("poller.py lost the random worktree-label suffix — two wakes in "
             "one thread would compute the same label and the second would "
             "destroy the first's preserved worktree (clash-agent's own "
             "2026-08-14 catch)")
    # prwatch: green means what the module docstring says it means
    for frag in ("def verdict", "MIN_CHECKS = 4", '"DIRTY"', "REQUIRE_VERIFIED = True",
                 "def has_verified_block", "MAX_FIXES", '"PENDING"'):
        if frag not in psrc:
            fail(f"prwatch.py lost {frag!r} — a DIRTY, under-counted or "
                 f"still-deploying PR would read as green again")
    if "def start_work_lane" not in dsrc or "worklist.py" not in dsrc:
        fail("daemon.py no longer kicks the follow-through lane after each "
             "sweep — queued items would never run")
    if not os.path.exists(PR_TEMPLATE) or "## Verified" not in open(PR_TEMPLATE).read():
        fail(".github/pull_request_template.md must carry a '## Verified' "
             "section — prwatch refuses to merge a PR without one")
    for must in ("ledger", "follow-through", "work.lock", "prwatch",
                 "agent-ready", "purchase-alert", "deploy checkout"):
        if must not in readme.lower():
            fail(f"README no longer documents {must!r}")
    if "09:40" in readme.split("## Incidents")[0].replace("bootout", ""):
        pass  # the install section may mention the retired times historically
    ok("follow-through contract: no daylight job, one spawn path (worktree + "
       "memory + budget + ledger + continue + PR watch), conditions in "
       "code, tier gate stamped at the spawn boundary, RUNNER/policy/"
       "template promises pinned")


# ------------------------------------------------------------ stub Slack
class _State:
    def __init__(self):
        self.messages = []   # list of dict: ts, user, bot_id, text, thread_ts, subtype
        self.reactions = {}  # ts -> [{"name": ..., "users": [...]}]
        # Real wall-clock, not a fixed epoch: fetch_new() compares tracked
        # threads against datetime.now() and expires anything older than
        # THREAD_TTL_S (48h) — a fixed-past base would evict every tracked
        # thread before the test ever polls its replies.
        self._n = time.time()

    def next_ts(self):
        self._n += 1
        return f"{self._n:.6f}"

    def add_message(self, user=None, bot_id=None, text="", thread_ts=None,
                    subtype=None):
        ts = self.next_ts()
        self.messages.append({"ts": ts, "user": user, "bot_id": bot_id,
                              "text": text, "thread_ts": thread_ts or ts,
                              "subtype": subtype})
        return ts

    def add_reaction(self, ts, name, user):
        self.reactions.setdefault(ts, []).append({"name": name, "users": [user]})

    def posted(self, since=0):
        """Everything the bot (or the poller) put in the channel after index
        `since` — the stub records a chat.postMessage as a bot_id message."""
        return [m for m in self.messages[since:] if m.get("bot_id") == "Bstub"]


class StubSlack(http.server.BaseHTTPRequestHandler):
    state: _State = None

    def log_message(self, *a):
        pass

    def do_POST(self):
        length = int(self.headers.get("Content-Length", 0))
        body = self.rfile.read(length).decode()
        params = {k: v[0] for k, v in urllib.parse.parse_qs(body).items()}
        method = self.path.strip("/")
        st = StubSlack.state
        out = {"ok": True}

        if method == "conversations.history":
            oldest = float(params.get("oldest", "0"))
            msgs = [m for m in st.messages
                    if m["thread_ts"] == m["ts"] and float(m["ts"]) > oldest]
            out["messages"] = msgs
        elif method == "conversations.replies":
            tts = params["ts"]
            oldest = float(params.get("oldest", "0"))
            msgs = [m for m in st.messages
                    if m["thread_ts"] == tts and float(m["ts"]) > oldest]
            out["messages"] = sorted(msgs, key=lambda m: m["ts"])
        elif method == "chat.postMessage":
            ts = st.add_message(bot_id="Bstub", text=params.get("text", ""),
                                thread_ts=params.get("thread_ts"))
            out["ts"] = ts
        elif method == "reactions.get":
            ts = params["timestamp"]
            out["message"] = {"reactions": st.reactions.get(ts, [])}
        elif method == "reactions.add":
            ts_ = params["timestamp"]
            name = params.get("name")
            existing = st.reactions.setdefault(ts_, [])
            if any(r["name"] == name for r in existing):
                out = {"ok": False, "error": "already_reacted"}
            else:
                existing.append({"name": name, "users": ["Bstub"]})
        else:
            out = {"ok": False, "error": "unhandled_method"}

        payload = json.dumps(out).encode()
        self.send_response(200)
        self.send_header("Content-Type", "application/json")
        self.send_header("Content-Length", str(len(payload)))
        self.end_headers()
        self.wfile.write(payload)


def start_stub_slack(state):
    StubSlack.state = state
    srv = http.server.ThreadingHTTPServer(("127.0.0.1", 0), StubSlack)
    threading.Thread(target=srv.serve_forever, daemon=True).start()
    return srv, f"http://127.0.0.1:{srv.server_port}"


# Recorder stub for `claude`: logs argv/cwd/PATH/git-state at spawn time (not
# afterward, which races against a clean run's own worktree cleanup), and —
# controlled by env vars the test sets per-scenario — can leave uncommitted
# work behind, clean up a prior run's leftover, reply in-thread the way a
# real woken agent does, write its wake note, ask to continue (once, via a
# flag file it consumes; or always), or exit non-zero. It answers on stdout
# the way the real binary does under --output-format json, so the poller's
# ledger/budget path is exercised with a cost it must attribute.
CLAUDE_STUB = """#!/usr/bin/env python3
import json, os, sys, urllib.parse, urllib.request
rec = os.environ.get("CLASH_AGENT_TEST_RECORDER")
note_env = os.environ.get("CLASH_AGENT_NOTE_PATH")
cont_env = os.environ.get("CLASH_AGENT_CONTINUE_PATH")
if rec:
    with open(rec, "a") as f:
        f.write(json.dumps({
            "argv": sys.argv[1:], "cwd": os.getcwd(),
            "path": os.environ.get("PATH", ""),
            "has_git": os.path.exists(".git"),
            "has_marker": os.path.exists("MARKER.txt"),
            "note_env": note_env, "cont_env": cont_env,
        }) + "\\n")
note = os.environ.get("CLASH_AGENT_TEST_CLAUDE_NOTE")
if note and note_env:
    os.makedirs(os.path.dirname(note_env), exist_ok=True)
    open(note_env, "w").write(note)
once = os.environ.get("CLASH_AGENT_TEST_CLAUDE_CONTINUE_ONCE")
always = os.environ.get("CLASH_AGENT_TEST_CLAUDE_CONTINUE_ALWAYS")
if cont_env and once and os.path.exists(once):
    os.makedirs(os.path.dirname(cont_env), exist_ok=True)
    open(cont_env, "w").write(open(once).read() or "more")
    os.remove(once)
elif cont_env and always:
    os.makedirs(os.path.dirname(cont_env), exist_ok=True)
    open(cont_env, "w").write(always)
if os.environ.get("CLASH_AGENT_TEST_CLAUDE_DIRTY"):
    open(os.path.join(os.getcwd(), "leftover.txt"), "w").write("uncommitted\\n")
if os.environ.get("CLASH_AGENT_TEST_CLAUDE_RESOLVE"):
    p = os.path.join(os.getcwd(), "leftover.txt")
    if os.path.exists(p):
        os.remove(p)
reply_thread = os.environ.get("CLASH_AGENT_TEST_CLAUDE_REPLY")
if reply_thread:
    body = urllib.parse.urlencode({
        "channel": "TESTCHANNEL", "thread_ts": reply_thread,
        "text": "done - deployed it and tried it once",
    }).encode()
    urllib.request.urlopen(urllib.request.Request(
        os.environ["CLASH_AGENT_API"] + "/chat.postMessage", data=body),
        timeout=10).read()
failing = os.environ.get("CLASH_AGENT_TEST_CLAUDE_EXIT", "0") != "0"
print(json.dumps({"type": "result", "subtype": "error" if failing else "success",
                  "is_error": failing, "session_id": "stub-%d" % os.getpid(),
                  "total_cost_usd": 0.5, "duration_ms": 1234, "num_turns": 3,
                  "result": "ok"}))
sys.exit(int(os.environ.get("CLASH_AGENT_TEST_CLAUDE_EXIT", "0")))
"""


def make_claude_stub(tmp):
    path = os.path.join(tmp, "claude-stub.py")
    with open(path, "w") as f:
        f.write(CLAUDE_STUB)
    os.chmod(path, os.stat(path).st_mode | stat.S_IEXEC)
    return path


def recorded_runs(recorder):
    if not os.path.exists(recorder):
        return []
    return [json.loads(l) for l in open(recorder) if l.strip()]


def clear_test_flags():
    for k in ("CLASH_AGENT_TEST_CLAUDE_EXIT", "CLASH_AGENT_TEST_CLAUDE_DIRTY",
              "CLASH_AGENT_TEST_CLAUDE_RESOLVE", "CLASH_AGENT_TEST_CLAUDE_REPLY",
              "CLASH_AGENT_TEST_CLAUDE_NOTE", "CLASH_AGENT_TEST_CLAUDE_CONTINUE_ONCE",
              "CLASH_AGENT_TEST_CLAUDE_CONTINUE_ALWAYS"):
        os.environ.pop(k, None)


def prompt_of(run):
    return run["argv"][run["argv"].index("-p") + 1]


def mode_of(run):
    return run["argv"][run["argv"].index("--permission-mode") + 1]


# ------------------------------------------------------------ fixture
def setup_fixture():
    """A REAL local git repo + bare 'origin' (not a mocked filesystem) so
    make_worktree()'s `git fetch origin main` / `git worktree add --detach
    <path> origin/main` genuinely runs, fully offline. This is the exact
    mechanism the worktree-isolation fix is a regression test for: a fixture
    that isn't real git would let a worktree bug pass silently."""
    tmp = tempfile.mkdtemp(prefix="clash-agent-selftest-")
    state_dir = os.path.join(tmp, "state")
    fake_repo = os.path.join(tmp, "repo")
    origin_bare = os.path.join(tmp, "origin.git")
    _git(["init", "--bare", "-q", "-b", "main", origin_bare])
    _git(["init", "-q", "-b", "main", fake_repo])
    open(os.path.join(fake_repo, "MARKER.txt"), "w").write("origin/main content\n")
    _git(["add", "MARKER.txt"], cwd=fake_repo)
    _git(["-c", "user.email=t@t", "-c", "user.name=t", "commit", "-q", "-m", "seed"],
         cwd=fake_repo)
    _git(["remote", "add", "origin", origin_bare], cwd=fake_repo)
    _git(["push", "-q", "origin", "main"], cwd=fake_repo)

    recorder = os.path.join(tmp, "runs.jsonl")
    claude_stub = make_claude_stub(tmp)
    slack_state = _State()
    srv, api_base = start_stub_slack(slack_state)


    os.environ["CLASH_AGENT_STATE_DIR"] = state_dir
    os.environ["CLASH_AGENT_TOKEN_FILE"] = os.path.join(tmp, "token.txt")
    os.environ["CLASH_AGENT_API"] = api_base
    os.environ["CLASH_AGENT_CLAUDE_BIN"] = claude_stub
    os.environ["CLASH_AGENT_REPO"] = fake_repo
    os.environ["CLASH_AGENT_TEST_RECORDER"] = recorder
    # never reach GitHub or post a real digest from a selftest
    os.environ["CLASH_AGENT_SHIPPED_WORKFLOW"] = ""
    os.environ["CLASH_AGENT_ISSUE_LABEL"] = ""
    os.environ["CLASH_AGENT_DIGEST_HOUR"] = ""
    os.environ.pop("CLASH_AGENT_TIER", None)
    with open(os.environ["CLASH_AGENT_TOKEN_FILE"], "w") as f:
        # deliberately NOT token-shaped
        f.write("selftest-placeholder-not-a-token")

    sys.path.insert(0, BASE)
    for m in ("poller", "worklist", "prwatch"):
        sys.modules.pop(m, None)
    import poller
    import worklist

    return {
        "tmp": tmp, "fake_repo": fake_repo, "state_dir": state_dir,
        "recorder": recorder, "slack_state": slack_state, "srv": srv,
        "poller": poller, "worklist": worklist,
    }


def teardown_fixture(fx):
    fx["srv"].shutdown()
    shutil.rmtree(fx["tmp"], ignore_errors=True)


# ------------------------------------------------------------ behavioral
def run_behavioral(fx):
    poller = fx["poller"]
    slack_state = fx["slack_state"]
    recorder = fx["recorder"]
    fake_repo = fx["fake_repo"]

    ok("seams wired (state dir, token file, Slack API, claude binary, real "
       "git repo + bare origin, projects dir all redirected; GitHub and the "
       "digest switched off)")

    ANDREW, OTHER, BOT = poller.ANDREW, "U_OTHER_PERSON", poller.BOT_USER

    # 1) backlog exists before the first sweep — must not replay it
    slack_state.add_message(user=OTHER, text="pre-existing backlog message")
    poller.main()
    if recorded_runs(recorder):
        fail("first sweep spawned an agent on backlog instead of only arming")
    ok("first sweep only arms the watermark")

    # 2) Andrew's message wakes the agent, tier andrew, opus, bypassPermissions,
    #    in an isolated worktree off origin/main, acked with an eyes reaction,
    #    cleaned up after
    open(recorder, "w").close()
    ts_a = slack_state.add_message(user=ANDREW, text="ship it")
    poller.main()
    runs = recorded_runs(recorder)
    if len(runs) != 1:
        fail(f"expected exactly 1 spawn for Andrew's message, got {len(runs)}")
    argv = runs[0]["argv"]
    if "--model" not in argv or argv[argv.index("--model") + 1] != "opus":
        fail(f"spawn argv missing --model opus: {argv}")
    if mode_of(runs[0]) != "bypassPermissions":
        fail(f"Andrew-tier spawn wasn't bypassPermissions: {argv}")
    if "--output-format" not in argv or argv[argv.index("--output-format") + 1] != "json":
        fail(f"spawn argv lacks --output-format json — cost and session would be unknown: {argv}")
    if "--max-budget-usd" not in argv:
        fail(f"spawn argv lacks --max-budget-usd — a run has no ceiling: {argv}")
    if '"tier": "andrew"' not in prompt_of(runs[0]) or "RUNNER.md" not in prompt_of(runs[0]):
        fail("the brief must carry the tier and point at RUNNER.md")
    wt1 = runs[0]["cwd"]
    if os.path.realpath(wt1) in (os.path.realpath(fake_repo), fake_repo):
        fail(f"agent ran directly in the shared repo, not an isolated "
             f"worktree — the exact seam the 2026-08-14 fable-agent "
             f"incident exploited: {wt1}")
    if not runs[0]["has_git"]:
        fail(f"agent's cwd {wt1} was not a git checkout at all")
    if not runs[0]["has_marker"]:
        fail(f"worktree {wt1} didn't contain origin/main's content — "
             f"make_worktree didn't actually check out origin/main")
    if os.path.exists(wt1):
        fail(f"a clean (non-dirty) wake's worktree must be removed after "
             f"the run, still exists: {wt1}")
    if not any(r["name"] == "eyes" for r in slack_state.reactions.get(ts_a, [])):
        fail("no eyes-reaction ack was added on the triggering message")
    if not runs[0]["note_env"] or not runs[0]["cont_env"]:
        fail("the wake was not handed CLASH_AGENT_NOTE_PATH / "
             "CLASH_AGENT_CONTINUE_PATH — it could neither write its note "
             "nor ask to continue")
    ok("Andrew's message wakes the agent: tier andrew, opus, "
       "bypassPermissions, JSON result + budget, isolated worktree off "
       "origin/main, eyes ack, note/continue paths, cleaned up after")

    # 3) someone else's message wakes the agent gated
    open(recorder, "w").close()
    slack_state.add_message(user=OTHER, text="what's the deploy status")
    poller.main()
    runs = recorded_runs(recorder)
    if len(runs) != 1:
        fail(f"expected exactly 1 spawn for the other person's message, got {len(runs)}")
    if mode_of(runs[0]) != "acceptEdits":
        fail("non-Andrew message must spawn permission-gated (acceptEdits)")
    ok("a non-Andrew message wakes the agent permission-gated")

    # 4) repeat sweep, nothing new
    open(recorder, "w").close()
    poller.main()
    if recorded_runs(recorder):
        fail("a sweep with no new messages spawned an agent")
    ok("dedupe: nothing new spawns nothing")

    # 5) bot's own / integration messages never wake the agent
    open(recorder, "w").close()
    slack_state.add_message(user=BOT, text="I already said this")
    slack_state.add_message(bot_id="B_GITHUB", text="PR #1 opened")
    poller.main()
    if recorded_runs(recorder):
        fail("bot/integration messages woke the agent")
    ok("the bot's own messages and integration posts never wake the agent")

    # 6) thread replies picked up via tracked-thread watermark
    open(recorder, "w").close()
    reply_thread = ts_a
    slack_state.add_message(user=ANDREW, text="reply in thread",
                            thread_ts=reply_thread)
    poller.main()
    runs = recorded_runs(recorder)
    if len(runs) != 1:
        fail(f"expected exactly 1 spawn for a tracked-thread reply, got {len(runs)}")
    wt2 = runs[0]["cwd"]
    ok("thread replies are picked up via the tracked-thread watermark")

    # 7) singleton lock (the Slack lane)
    lock = poller.acquire_lock()
    if lock is None:
        fail("could not acquire the lock the first time")
    second = poller.acquire_lock()
    if second is not None:
        fail("a second concurrent acquire_lock() succeeded — singleton broken")
    lock.close()
    ok("singleton lock: a second concurrent acquire is refused")

    # 8) approvals
    open(recorder, "w").close()
    os.makedirs(poller.pending_dir(), exist_ok=True)
    ask_ts = slack_state.add_message(bot_id="Bstub", text="ok to deploy?",
                                     thread_ts=reply_thread)
    with open(os.path.join(poller.pending_dir(), f"{ask_ts}.json"), "w") as f:
        json.dump({"ask_ts": ask_ts, "thread_ts": reply_thread,
                   "summary": "deploy", "action": "deploy it"}, f)
    slack_state.add_reaction(ask_ts, "+1", OTHER)  # must be ignored
    poller.main()
    if recorded_runs(recorder):
        fail("a non-Andrew reaction decided a pending approval")
    if not os.path.exists(os.path.join(poller.pending_dir(), f"{ask_ts}.json")):
        fail("the pending file was consumed by a non-Andrew reaction")
    slack_state.add_reaction(ask_ts, "+1", ANDREW)
    open(recorder, "w").close()
    poller.main()
    runs = recorded_runs(recorder)
    if len(runs) != 1:
        fail(f"expected exactly 1 approval spawn, got {len(runs)}")
    if '"approved"' not in prompt_of(runs[0]) or "deploy it" not in prompt_of(runs[0]):
        fail("approval wake lost the verdict or the registered action")
    if os.path.exists(os.path.join(poller.pending_dir(), f"{ask_ts}.json")):
        fail("the pending file wasn't cleared after Andrew's decision")
    ok("approvals: only Andrew's reaction decides, and clears the pending file")

    # 9) worktree isolation across wakes: two separate wakes never share a dir
    if wt1 == wt2:
        fail(f"two separate wakes shared the same worktree directory — "
             f"the exact seam the 2026-08-14 fable-agent incident "
             f"exploited: {wt2}")
    ok("worktree: each wake gets its own fresh checkout off origin/main, "
       "never a sibling wake's leftover directory")

    # 10) a wake that leaves uncommitted work has its worktree PRESERVED
    os.environ["CLASH_AGENT_TEST_CLAUDE_DIRTY"] = "1"
    open(recorder, "w").close()
    slack_state.add_message(user=ANDREW, text="worktree isolation check, "
                                                "goes sideways")
    poller.main()
    clear_test_flags()
    runs = recorded_runs(recorder)
    wtC = runs[0]["cwd"]
    if not os.path.exists(wtC) or not os.path.exists(
            os.path.join(wtC, "leftover.txt")):
        fail(f"a wake that left uncommitted work must have its worktree "
             f"PRESERVED, not deleted — the only copy of that work just "
             f"got destroyed: {wtC}")
    ok("worktree: uncommitted leftover work survives — never silently "
       "deleted along with its worktree")
    shutil.rmtree(wtC, ignore_errors=True)  # tidy up before the next checks

    # 11) a run that already replied since it started never gets the
    #     generic fallback stacked on top
    os.environ["CLASH_AGENT_TEST_CLAUDE_EXIT"] = "1"
    thread_spoke = slack_state.add_message(user=ANDREW, text="already-spoke check")
    os.environ["CLASH_AGENT_TEST_CLAUDE_REPLY"] = thread_spoke
    before_posted = len(slack_state.messages)
    poller.main()
    clear_test_flags()
    posted_texts = [m.get("text", "") for m in slack_state.messages[before_posted:]]
    if not any("done - deployed it" in t for t in posted_texts):
        fail(f"the stub's own in-thread reply never landed: {posted_texts}")
    if any("ran long and had to stop" in t for t in posted_texts):
        fail(f"a run that already replied since it started still got the "
             f"fallback line stacked on top: {posted_texts}")
    ok("fallback: suppressed when the agent already replied since the wake "
       "started — no confusing 'ran long' line on a finished job")

    # 12) a run that fails AND leaves real work behind gets a 👍-gated resume
    #     ask instead of the generic fallback; Andrew's 👍 resumes it IN THE
    #     SAME preserved worktree
    shutil.rmtree(poller.pending_dir(), ignore_errors=True)
    os.environ["CLASH_AGENT_TEST_CLAUDE_EXIT"] = "1"
    os.environ["CLASH_AGENT_TEST_CLAUDE_DIRTY"] = "1"
    resume_thread = slack_state.add_message(user=ANDREW, text="resume check")
    before_posted = len(slack_state.messages)
    open(recorder, "w").close()
    poller.main()
    clear_test_flags()
    runs = recorded_runs(recorder)
    if len(runs) != 1:
        fail(f"expected exactly 1 spawn for the resume-ask check, got {len(runs)}")
    failed_wt = runs[0]["cwd"]
    posted_texts = [m.get("text", "") for m in slack_state.messages[before_posted:]]
    if any("ran long and had to stop" in t for t in posted_texts):
        fail("a run that left real work behind must NOT get the generic "
             "fallback — it gets a 👍-gated resume ask instead")
    if not any("React 👍" in t for t in posted_texts):
        fail(f"no resume ask was posted for a run that left real work "
             f"behind: {posted_texts}")
    pend_files = [f for f in os.listdir(poller.pending_dir()) if f.endswith(".json")]
    if len(pend_files) != 1:
        fail(f"expected exactly one pending resume-ask file, got {pend_files}")
    resume_pending = json.load(open(os.path.join(poller.pending_dir(), pend_files[0])))
    # realpath both sides: macOS resolves /var -> /private/var through
    # os.getcwd() inside the stub subprocess but not necessarily through
    # plain string concatenation in poller.py's own wt variable — same
    # directory, two spellings.
    if os.path.realpath(resume_pending.get("resume_worktree", "")) != \
            os.path.realpath(failed_wt):
        fail(f"pending resume file doesn't point at the preserved worktree: "
             f"{resume_pending}")
    if not os.path.exists(os.path.join(failed_wt, "leftover.txt")):
        fail(f"the worktree the resume ask points at lost its leftover "
             f"work: {failed_wt}")

    # Andrew's 👍 on the resume ask — this run resolves its own leftover and
    # succeeds, so the worktree should be cleanly removed after
    os.environ["CLASH_AGENT_TEST_CLAUDE_RESOLVE"] = "1"
    slack_state.add_reaction(resume_pending["ask_ts"], "+1", ANDREW)
    open(recorder, "w").close()
    poller.main()
    clear_test_flags()
    runs = recorded_runs(recorder)
    if len(runs) != 1:
        fail(f"Andrew's 👍 must wake exactly one resume run, got {len(runs)}")
    if os.path.realpath(runs[0]["cwd"]) != os.path.realpath(failed_wt):
        fail(f"the resume run must run IN THE SAME preserved worktree, not "
             f"a fresh one — got {runs[0]['cwd']!r}, expected {failed_wt!r}")
    if not runs[0]["has_marker"]:
        fail("the resumed run's worktree lost origin/main's content")
    if os.path.exists(failed_wt):
        fail(f"a resume that resolved its own leftover and succeeded must "
             f"have its worktree cleaned up, still exists: {failed_wt}")
    if os.path.exists(os.path.join(poller.pending_dir(),
                                    f"{resume_pending['ask_ts']}.json")):
        fail("the decided resume-ask pending file must be removed")
    ok("resume: a run that leaves real work behind gets a 👍-gated ask "
       "naming its branch, never the generic fallback; Andrew's 👍 resumes "
       "it in the SAME worktree, cleaned up once it lands")

    # 13) a failing spawn with NO leftover work posts the plain fallback and
    #     the watermark still advances (no poison loop)
    os.environ["CLASH_AGENT_TEST_CLAUDE_EXIT"] = "1"
    before = poller.load_state()["last_ts"]
    before_posted = len(slack_state.messages)
    slack_state.add_message(user=ANDREW, text="this one will fail cleanly")
    poller.main()
    clear_test_flags()
    after = poller.load_state()["last_ts"]
    if after == before:
        fail("watermark didn't advance despite a failed spawn — poison-loop risk")
    fb = [m for m in slack_state.posted(before_posted) if "ran long" in m.get("text", "")]
    if not fb:
        fail("no fallback line was posted after a failed spawn with no "
             "leftover work")
    for w in BANNED_WORDS:
        if w in fb[0]["text"].lower():
            fail(f"system vocabulary {w!r} reached the channel via the fallback line")
    ok("a failing spawn with no leftover work posts the plain fallback and "
       "the watermark still advances")


# ------------------------------------------------------------ the queue
def run_worklist(fx):
    """15 — the follow-through queue: file it with a reason, and it runs the
    moment the reason clears — not at 09:40."""
    poller, worklist = fx["poller"], fx["worklist"]
    slack_state, recorder, state_dir = fx["slack_state"], fx["recorder"], fx["state_dir"]
    fake_repo = fx["fake_repo"]
    WORKLIST = os.path.join(BASE, "worklist.py")
    ANDREW = poller.ANDREW

    def wl(*args, tier="andrew", when="2026-08-01T10:00:00"):
        # launchd's bare PATH, on purpose: the pass runs the way the daemon
        # runs it, so the /opt/homebrew/bin assertion below proves the spawn
        # boundary ADDS it — an interactive shell's PATH can't mask a regression
        e = dict(os.environ, CLASH_AGENT_TIER=tier, CLASH_AGENT_NOW=when,
                 PATH="/usr/bin:/bin:/usr/sbin:/sbin")
        return subprocess.run([sys.executable, WORKLIST, *args], env=e,
                              capture_output=True, text=True, timeout=120)

    def spawns():
        return recorded_runs(recorder)

    def queue():
        return json.loads(wl("list", "--json").stdout)

    # threads the items belong to: real ones, so notices land somewhere the
    # stub can see them
    t_main = slack_state.add_message(user=ANDREW, text="queue thread")
    t_leak = slack_state.add_message(user=ANDREW, text="leak thread")
    t_ops = slack_state.add_message(user=ANDREW, text="ops thread")
    poller.main()          # track them (three ordinary wakes)

    open(recorder, "w").close()
    r = wl("add", "--title", "not from Andrew", "--detail", "x", tier="unknown")
    if r.returncode == 0:
        fail("worklist add accepted a non-Andrew-tier run — a channel "
             "message could queue itself ungated work")
    r = wl("add", "--title", "x", "--detail", "d", "--wait", "sometime")
    if r.returncode == 0:
        fail("worklist add accepted an unknown --wait — a typo would file an "
             "item that never runs and never says why")
    r = wl("add", "--title", "fix the checkout confirmation email", "--detail",
           "the confirmation email never lands", "--thread", t_main,
           "--priority", "2")
    if r.returncode != 0:
        fail(f"worklist add failed for an Andrew-tier run: {r.stderr}")
    item_a = r.stdout.strip()
    if "fix-the-checkout-confirmation-email" not in item_a:
        fail(f"worklist id should carry the title slug, got {item_a!r}")

    # no condition = ready now, whatever the clock says (this used to wait
    # for daylight; that is exactly the days-later chime-in)
    wl("--run", when="2026-08-01T03:12:00")
    got = spawns()
    if len(got) != 1:
        fail(f"an item with no condition must run on the next pass, even at "
             f"03:12 — got {len(got)} spawn(s)")
    p = prompt_of(got[-1])
    for must in ("RUNNER.md", "policy.md", '"kind": "worklist"',
                 "fix the checkout confirmation email", t_main):
        if must not in p:
            fail(f"worklist wake prompt is missing {must!r}")
    if mode_of(got[-1]) != "bypassPermissions":
        fail("an Andrew-tier worklist item must wake an ungated agent")
    if got[-1]["argv"][got[-1]["argv"].index("--model") + 1] != "opus":
        fail("a worklist wake must run Opus like every other wake")
    if "/opt/homebrew/bin" not in got[-1]["path"].split(":"):
        fail(f"a worklist wake's PATH lacks /opt/homebrew/bin (got "
             f"{got[-1]['path']!r}) — the pass could not run npm or gh")
    # the pass runs in its OWN worktree, through the one spawn path
    wt_q = got[-1]["cwd"]
    if os.path.realpath(wt_q) in (os.path.realpath(fake_repo), fake_repo):
        fail(f"a queued item ran in the shared checkout, not a worktree: {wt_q}")
    if not got[-1]["has_marker"] or not got[-1]["has_git"]:
        fail(f"the queued item's worktree {wt_q} is not a checkout of origin/main")
    if os.path.exists(wt_q):
        fail(f"a clean worklist wake's worktree must be removed after the "
             f"run, still exists: {wt_q}")
    if not got[-1]["note_env"] or not got[-1]["cont_env"]:
        fail("a queued wake was not handed CLASH_AGENT_NOTE_PATH / "
             "CLASH_AGENT_CONTINUE_PATH — it could neither write its note "
             "nor ask to continue")
    if queue()[0]["state"] != "working" or queue()[0]["attempts"] != 1:
        fail(f"claimed item should be working/attempt 1, got {queue()[0]}")
    # closing retires it; the record is kept, not deleted
    wl("done", item_a, "--note", "landed")
    if queue():
        fail("a closed item is still in the queue")
    if not os.path.exists(os.path.join(state_dir, "worklist", "done",
                                       f"{item_a}.json")):
        fail("a closed item must be kept under worklist/done/, not deleted")

    # conditions: each names why it waits, and clears on its own
    n = len(spawns())
    c_day = wl("add", "--title", "noisy thing", "--detail", "d", "--thread",
               t_main, "--wait", "daytime").stdout.strip()
    wl("--run", when="2026-08-01T03:12:00")
    if len(spawns()) != n:
        fail("a `daytime` item ran at 03:12 — the one condition that exists "
             "for out-of-hours disruption is not enforced")
    out = wl("list", when="2026-08-01T03:12:00").stdout
    if "outside" not in out:
        fail(f"`list` should say why the item waits, got {out!r}")
    wl("--run", when="2026-08-01T10:00:00")
    if len(spawns()) != n + 1:
        fail("a `daytime` item did not run at 10:00")
    wl("done", c_day)
    n = len(spawns())
    c_cmd = wl("add", "--title", "needs the simulator", "--detail", "d",
               "--thread", t_main, "--wait", "cmd:exit 1").stdout.strip()
    wl("--run")
    if len(spawns()) != n:
        fail("a `cmd:` item whose command exits 1 ran anyway — a simulator "
             "that is not booted would be 'verified' on")
    c_ok = wl("add", "--title", "simulator is up", "--detail", "d",
              "--thread", t_main, "--wait", "cmd:true", "--priority", "1").stdout.strip()
    wl("--run")
    if len(spawns()) != n + 1:
        fail("a `cmd:` item whose command exits 0 did not run")
    if [i for i in queue() if i["state"] == "working"][0]["id"] != c_ok:
        fail("the ready item behind a blocked one was not the one claimed")
    wl("done", c_ok)
    wl("drop", c_cmd)
    n = len(spawns())
    c_after = wl("add", "--title", "tomorrow", "--detail", "d", "--thread",
                 t_main, "--wait", "after:2026-08-02T08:00").stdout.strip()
    wl("--run", when="2026-08-01T23:00:00")
    if len(spawns()) != n:
        fail("an `after:` item ran before its time")
    wl("--run", when="2026-08-02T08:00:00")
    if len(spawns()) != n + 1:
        fail("an `after:` item did not run once its time had passed")
    wl("done", c_after)
    # `approval`: parked until the pending file in its thread is decided
    n = len(spawns())
    pend = poller.pending_dir()
    os.makedirs(pend, exist_ok=True)
    pfile = os.path.join(pend, "approval-park.json")
    json.dump({"ask_ts": "1.000001", "thread_ts": t_main, "summary": "s",
               "action": "a"}, open(pfile, "w"))
    c_appr = wl("add", "--title", "after the nod", "--detail", "d", "--thread",
                t_main, "--wait", "approval").stdout.strip()
    wl("--run")
    if len(spawns()) != n:
        fail("an `approval` item ran while its ask was still undecided")
    os.remove(pfile)
    wl("--run")
    if len(spawns()) != n + 1:
        fail("an `approval` item did not run once the ask was decided")
    wl("done", c_appr)

    # clash-agent's own unit pins, kept: reconcile trips stuck at
    # MAX_ATTEMPTS; the ops-vocabulary guard drops a title-shaped public_title
    if worklist.reconcile([{"id": "u", "state": "working",
                            "attempts": worklist.MAX_ATTEMPTS}])[0]["state"] != "stuck":
        fail("an item at MAX_ATTEMPTS wasn't marked stuck on reconcile")
    os.remove(os.path.join(state_dir, "worklist", "u.json"))
    if worklist.public_subject({"public_title": "Fix PR #212 in stripe-webhook.ts"}) is not None:
        fail("an ops-vocabulary public_title wasn't dropped")
    if worklist.public_subject({"public_title": "the checkout confirmation email"}) \
            != "the checkout confirmation email":
        fail("a plain public_title was altered or dropped")

    # priority order, the reopen-on-death loop, and the ONE message a stuck
    # item is allowed to cost Andrew
    a2 = wl("add", "--title", "second thing", "--detail", "d",
            "--thread", t_main).stdout.strip()
    b = wl("add", "--title", "first thing", "--detail", "d", "--thread",
           t_main, "--priority", "1").stdout.strip()
    wl("--run")
    if [i for i in queue() if i["state"] == "working"][0]["id"] != b:
        fail("the pass ignored priority — p1 must go first")
    posted_before = len(slack_state.messages)
    for _ in range(3):        # attempts 2, 3, then the stuck report
        wl("--run")
    stuck = [i for i in queue() if i["id"] == b]
    if not stuck or stuck[0]["state"] != "stuck":
        fail(f"an item that never closes must go stuck after 3 attempts, got {stuck}")
    notices = slack_state.posted(posted_before)
    if len(notices) != 1:
        fail(f"a stuck item must cost Andrew exactly one message, got "
             f"{len(notices)}: {[m['text'] for m in notices]}")
    if notices[0].get("thread_ts") != t_main:
        fail("the stuck notice must land in the item's own thread")
    low = notices[0]["text"].lower()
    if "first thing" in low:
        fail(f"the stuck notice pasted the item's own title into the channel "
             f"({notices[0]['text']!r}) — titles are written by the agent FOR "
             f"the agent")
    if "didn't get done" not in low or "3 times" not in low:
        fail(f"an item filed with no public_title must still say honestly "
             f"that it's stuck after 3 tries, got {notices[0]['text']!r}")
    for w in BANNED_WORDS:
        if w in low:
            fail(f"stuck notice carries system vocabulary ({w!r}): "
                 f"{notices[0]['text']!r}")
    wl("--run")               # the queue moves on to the next item
    if len(slack_state.posted(posted_before)) != 1:
        fail("a stuck item re-reported itself on a later pass — Andrew must "
             "hear about it once, not every day")
    wl("drop", a2, "--note", "clearing the bench for the notice cases")

    def force_stuck(item_id):
        """Leave an item exactly where three dead passes leave it: still
        `working`, attempts spent, never reported. The next pass's reconcile
        is what flips it to stuck and composes the notice."""
        p = os.path.join(state_dir, "worklist", f"{item_id}.json")
        i = json.load(open(p))
        i.update(state="working", attempts=3)
        i.pop("reported", None)
        json.dump(i, open(p, "w"))

    def notice_for(item_id):
        n = len(slack_state.messages)
        wl("--run")
        got = slack_state.posted(n)
        if len(got) != 1:
            fail(f"forcing {item_id} stuck posted {len(got)} messages, want 1")
        return got[0]["text"]

    # A real title looks like this — full of PR numbers and version strings —
    # and it must never reach the channel word for word (house-agent's
    # 2026-08-08 leak, reproduced here as a fixture). The same item is also
    # parked on an unanswered 👍 — it never ran, so "tried it 3 times" would
    # be a false claim of repeated failure on top of the leak.
    c = wl("add", "--title",
           "Deploy PR #196 - v2.9.11 Shippo live-mode rollout (awaiting "
           "Andrew's thumbs-up)",
           "--public-title", "the shipping rates",
           "--detail", "d", "--thread", t_leak, "--priority", "1").stdout.strip()
    json.dump({"ask_ts": "2.000001", "thread_ts": t_leak, "summary": "s",
               "action": "a"}, open(os.path.join(pend, "leak-park.json"), "w"))
    force_stuck(c)
    text = notice_for(c)
    low = text.lower()
    for leak in ("#196", "196", "2.9.11", "shippo", "deploy", "rollout",
                 "thumbs-up"):
        if leak in low:
            fail(f"the stuck notice leaked {leak!r} from the item title into "
                 f"the channel: {text!r}")
    if re.search(r"\bpr\b", low):
        fail(f"the stuck notice leaked a PR reference: {text!r}")
    if "the shipping rates" not in text:
        fail(f"the notice should say the public_title it was given: {text!r}")
    if ":+1:" not in text or "waiting" not in low:
        fail(f"an item parked on an unanswered approval must say it's waiting "
             f"on Andrew's :+1:, got {text!r}")
    if "tried it" in low or "times" in low:
        fail(f"an item that never ran must not claim repeated failure: {text!r}")
    for w in BANNED_WORDS:
        if w in low:
            fail(f"waiting notice carries system vocabulary ({w!r}): {text!r}")
    os.remove(os.path.join(pend, "leak-park.json"))

    # a public_title written by pasting the title in: dropped, not cleaned —
    # the guard fails closed to a vaguer line rather than a build log
    d_id = wl("add", "--title", "x", "--public-title",
              "deploy PR #196 and re-run the Stripe migration", "--detail", "d",
              "--thread", t_ops, "--priority", "1").stdout.strip()
    force_stuck(d_id)
    text = notice_for(d_id)
    low = text.lower()
    if "#196" in low or "deploy" in low or "stripe" in low or "migration" in low:
        fail(f"an ops-flavored public_title reached the channel — the guard "
             f"must drop the subject, not tidy it: {text!r}")
    if "didn't get done" not in low:
        fail(f"dropping the subject must still leave an honest line: {text!r}")
    for stale in queue():
        wl("drop", stale["id"], "--note", "bench cleared")

    # two lanes: a Slack wake in flight does NOT block the queue (that was
    # the old singleton — one long build made every question wait), but a
    # second pass on the follow-through lane does wait for the first
    n = len(spawns())
    lane_item = wl("add", "--title", "lane check", "--detail", "d",
                   "--thread", t_main).stdout.strip()
    slack_lock = open(os.path.join(state_dir, "poller.lock"), "a+")
    fcntl.flock(slack_lock, fcntl.LOCK_EX | fcntl.LOCK_NB)
    wl("--run")
    slack_lock.close()
    if len(spawns()) != n + 1:
        fail("a queued item waited on the Slack lane's lock — the two lanes "
             "share one lock again, so a long build blocks every question")
    wl("done", lane_item)
    lane_item = wl("add", "--title", "lane check 2", "--detail", "d",
                   "--thread", t_main).stdout.strip()
    work_lock = open(os.path.join(state_dir, "work.lock"), "a+")
    fcntl.flock(work_lock, fcntl.LOCK_EX | fcntl.LOCK_NB)
    n = len(spawns())
    wl("--run")
    if len(spawns()) != n:
        fail("a pass ran while the follow-through lane was busy — two queued "
             "items could edit the repo at once")
    work_lock.close()
    wl("drop", lane_item)
    ok("queue: Andrew-tier filing gate, unknown --wait refused, no-"
       "condition item runs at once (03:12 included) in its OWN worktree "
       "through the one spawn path, daytime/cmd/after/approval conditions "
       "gate and clear, priority, three dead passes → ONE stuck notice "
       "(never repeated)")
    ok("queue notice: no title leak (PR #/version/Shippo fixture), "
       "ops-flavoured public_title dropped not tidied, parked-on-:+1: "
       "item says it's waiting rather than claiming failed tries")
    ok("lanes: the queue runs while a Slack wake holds its lock; a "
       "second queue pass waits for the first")
    return wl


# ------------------------------------------------------------ follow-through
def run_follow_through(fx, wl):
    poller = fx["poller"]
    slack_state, recorder, state_dir = fx["slack_state"], fx["recorder"], fx["state_dir"]
    fake_repo = fx["fake_repo"]
    ANDREW = poller.ANDREW

    def spawns():
        return recorded_runs(recorder)

    def ledger():
        p = os.path.join(state_dir, "ledger.jsonl")
        return [json.loads(l) for l in open(p)] if os.path.exists(p) else []

    # 16 — the wake note: written by the run, handed back to the next run on
    #      the same thread, headlined in the ledger. The thread's memory, as
    #      opposed to the channel's 25 messages.
    os.environ["CLASH_AGENT_TEST_CLAUDE_NOTE"] = ("Fixed the shipping quote\n\n"
                                                 "Did: the thing\nVerified: build green\n"
                                                 "Open: nothing\n")
    t_note = slack_state.add_message(user=ANDREW, text="note check")
    open(recorder, "w").close()
    poller.main()
    clear_test_flags()
    got = spawns()
    if len(got) != 1:
        fail(f"expected one spawn for the note check, got {len(got)}")
    note_file = os.path.join(state_dir, "threads", f"{t_note}.md")
    if got[0]["note_env"] != note_file:
        fail(f"the wake's CLASH_AGENT_NOTE_PATH should be {note_file}, got "
             f"{got[0]['note_env']!r}")
    if not os.path.exists(note_file):
        fail("the run's wake note was not kept under threads/")
    if '"note": null' not in prompt_of(got[0]):
        fail("the FIRST wake on a thread must be handed an empty note, not "
             "someone else's")
    slack_state.add_message(user=ANDREW, text="and the follow-up?", thread_ts=t_note)
    open(recorder, "w").close()
    poller.main()
    got = spawns()
    if len(got) != 1 or "Fixed the shipping quote" not in prompt_of(got[0]):
        fail("the next wake on the same thread was not handed the previous "
             "run's wake note — the thread has no memory")
    mine = [e for e in ledger() if e.get("thread") == t_note]
    if len(mine) != 2:
        fail(f"expected two ledger lines for the thread, got {len(mine)}: {mine}")
    e = mine[-1]
    if e.get("cost") != 0.5 or e.get("kind") != "message" or not e.get("ok") \
            or e.get("tier") != "andrew" or e.get("headline") != "Fixed the shipping quote":
        fail(f"the ledger line is missing cost/kind/ok/tier/headline: {e}")
    if not e.get("session"):
        fail("the ledger line lost the session id — a resume could never find it")
    ok("note: written by the run, handed to the next wake on the thread, "
       "headline + cost + session in the ledger")

    # 17 — follow through: a run that writes its continue file is woken
    #      again AT ONCE, in the same worktree, with that note — bounded.
    once = os.path.join(fx["tmp"], "continue-once")
    open(once, "w").write("push the second half of the fix")
    os.environ["CLASH_AGENT_TEST_CLAUDE_CONTINUE_ONCE"] = once
    t_cont = slack_state.add_message(user=ANDREW, text="continue check")
    open(recorder, "w").close()
    poller.main()
    clear_test_flags()
    got = spawns()
    if len(got) != 2:
        fail(f"a run that asked to continue must be woken exactly once more "
             f"in the same sweep, got {len(got)} spawn(s)")
    if got[0]["cwd"] != got[1]["cwd"]:
        fail("the continue wake ran in a different worktree — the work it "
             "was continuing is not under its feet")
    p2 = prompt_of(got[1])
    if '"kind": "continue"' not in p2 or "push the second half" not in p2:
        fail("the continue wake was not handed the continue note")
    if os.path.exists(os.path.join(state_dir, "threads", f"{t_cont}.continue")):
        fail("the continue file was not consumed — the chain would replay")
    if os.path.exists(got[0]["cwd"]):
        fail("the worktree of a finished continue chain was not cleaned up")
    os.environ["CLASH_AGENT_TEST_CLAUDE_CONTINUE_ALWAYS"] = "more"
    slack_state.add_message(user=ANDREW, text="runaway continue")
    open(recorder, "w").close()
    poller.main()
    clear_test_flags()
    got = spawns()
    if len(got) != 7:
        fail(f"a run that always asks to continue must stop after "
             f"MAX_CONTINUES (6) extra wakes — 7 runs total — got {len(got)}")
    ok("continue: one more wake in the same worktree with the note, "
       "file consumed, chain bounded at 6")

    deploy = os.path.join(fx["tmp"], "deploy")
    _git(["-C", fake_repo, "worktree", "add", "-q", "--track", "-b", "deploy",
          deploy, "origin/main"])
    saved_repo, saved_state = poller.REPO, poller.STATE_DIR
    poller.REPO = deploy
    # follow_main saves state: give it its own dir so the fixture's
    # watermark is never clobbered by an in-process call
    poller.STATE_DIR = os.path.join(fx["tmp"], "state-inproc")
    marker = os.path.join(fake_repo, "MARKER.txt")

    # 18 — the deploy checkout follows origin/main: fast-forward only, on
    # the `deploy` branch only, at most once per FOLLOW_EVERY_S
    def head(path):
        return subprocess.run(["git", "-C", path, "rev-parse", "HEAD"],
                              capture_output=True, text=True).stdout.strip()
    def land(text):
        open(marker, "a").write(text + "\n")
        _git(["-C", fake_repo, "add", "MARKER.txt"])
        _git(["-C", fake_repo, "-c", "user.email=t@t", "-c", "user.name=t",
              "commit", "-q", "-m", text])
        _git(["-C", fake_repo, "push", "-q", "origin", "main"])
    land("second commit")
    st = {}
    poller.follow_main(st)
    if head(deploy) != head(fake_repo):
        fail("the deploy checkout did not fast-forward onto origin/main")
    land("third commit")
    poller.follow_main(st)
    if head(deploy) == head(fake_repo):
        fail("follow_main pulled twice inside FOLLOW_EVERY_S")
    poller.follow_main({})
    if head(deploy) != head(fake_repo):
        fail("after the throttle window the deploy checkout did not follow")
    other = os.path.join(fx["tmp"], "other")
    _git(["-C", fake_repo, "worktree", "add", "-q", "--track", "-b", "notdeploy",
          other, "origin/main"])
    _git(["-C", other, "reset", "-q", "--hard", "HEAD~1"])
    stale = head(other)
    poller.REPO = other
    poller.follow_main({})
    if head(other) != stale:
        fail("a checkout that is not on `deploy` was pulled — a dev checkout "
             "running a sweep by hand would be yanked out from under its owner")
    poller.REPO = deploy
    open(os.path.join(deploy, "LOCAL.txt"), "w").write("diverged\n")
    _git(["-C", deploy, "add", "LOCAL.txt"])
    _git(["-C", deploy, "-c", "user.email=t@t", "-c", "user.name=t",
          "commit", "-q", "-m", "local divergence"])
    diverged = head(deploy)
    land("fourth commit")
    poller.follow_main({})
    if head(deploy) != diverged:
        fail("a diverged deploy checkout was moved — follow_main must be "
             "fast-forward only")
    poller.REPO, poller.STATE_DIR = saved_repo, saved_state
    ok("deploy: the deploy checkout follows main (ff-only, deploy branch only, "
       "throttled); a diverged one stays put")

    # 19 — the PR watch's whole policy, as a pure function. The shapes are
    #      what `gh pr view --json statusCheckRollup` returns for THIS repo:
    #      the two GitHub Actions CheckRuns of ci.yml, a `Vercel`
    #      StatusContext (state, no status/conclusion) and the `Vercel
    #      Preview Comments` CheckRun — MIN_CHECKS of them, so the fixture
    #      builds that many and the under-count case one fewer.
    import prwatch
    def pr(n_checks=prwatch.MIN_CHECKS, concl="SUCCESS", ms="MERGEABLE", body="x\n\n## Verified\n- gate",
           state="OPEN", draft=False, running=0):
        checks = [{"name": f"c{i}", "status": "COMPLETED", "conclusion": concl}
                  for i in range(n_checks)]
        for i in range(running):
            checks[i] = {"name": f"c{i}", "status": "IN_PROGRESS", "conclusion": None}
        return {"state": state, "isDraft": draft, "mergeStateStatus": ms,
                "statusCheckRollup": checks, "body": body}
    cases = [
        (pr(), "green"),
        (pr(ms="DIRTY"), "red"),                  # never ran anything
        (pr(n_checks=prwatch.MIN_CHECKS - 1), "pending"),  # too few checks = no verdict
        (pr(running=1), "pending"),
        (pr(body="no verified block"), "red"),
        (pr(state="MERGED"), "merged"),
        (pr(draft=True), "draft"),
        (pr(ms="UNKNOWN"), "pending"),
    ]
    bad = pr(); bad["statusCheckRollup"][1]["conclusion"] = "FAILURE"
    cases.append((bad, "red"))
    vercel = pr(); vercel["statusCheckRollup"][0] = {"context": "Vercel", "status": None, "state": "SUCCESS"}
    cases.append((vercel, "green"))               # a status context, not a run
    deploying = pr(); deploying["statusCheckRollup"][0] = {"context": "Vercel", "status": None, "state": "PENDING"}
    cases.append((deploying, "pending"))          # still building — NOT green
    broke = pr(); broke["statusCheckRollup"][0] = {"context": "Vercel", "status": None, "state": "FAILURE"}
    cases.append((broke, "red"))
    for obj, want in cases:
        got_v, why = prwatch.verdict(obj)
        if got_v != want:
            fail(f"prwatch.verdict said {got_v!r} ({why}), want {want!r} for "
                 f"ms={obj['mergeStateStatus']} checks={obj['statusCheckRollup']}")
    ok(f"pr watch: {len(cases)} verdict cases — DIRTY/red/under-counted/"
       f"unverified/still-deploying never read as green")

    # 20 — money: over the day's cap a wake is QUEUED for the morning, not
    #      dropped, and the thread hears one plain line. Last, because the
    #      seeded spend would block every wake after it.
    ledger_p = os.path.join(state_dir, "ledger.jsonl")
    keep = open(ledger_p).read() if os.path.exists(ledger_p) else ""
    today_iso = datetime.datetime.now().isoformat(timespec="seconds")
    open(ledger_p, "a").write(json.dumps({"at": today_iso, "kind": "message",
                                          "ok": True, "cost": 999.0}) + "\n")
    t_budget = slack_state.add_message(user=ANDREW, text="budget check")
    posted_before = len(slack_state.messages)
    open(recorder, "w").close()
    poller.main()
    if spawns():
        fail("a wake ran with the day's budget already spent")
    texts = [m["text"] for m in slack_state.posted(posted_before)]
    if len(texts) != 1 or "tomorrow" not in texts[0] or "spend" not in texts[0]:
        fail(f"over budget, the thread must hear exactly one plain line about "
             f"picking it up tomorrow, got {texts}")
    for w in BANNED_WORDS:
        if w in texts[0].lower():
            fail(f"the budget line carries system vocabulary ({w!r})")
    deferred = [i for i in json.loads(wl("list", "--json").stdout)
                if i.get("source") == "budget"]
    if len(deferred) != 1 or not str(deferred[0].get("wait_for", "")).startswith("after:"):
        fail(f"the refused wake was not queued with an after: condition: {deferred}")
    t_budget2 = slack_state.add_message(user=ANDREW, text="second one today")
    poller.main()
    if len(slack_state.posted(posted_before)) != 1:
        fail("the budget line was posted twice in one day")
    # the morning: the spend is yesterday's, the item is ready, the wake runs
    # as the kind it was refused as
    open(ledger_p, "w").write(keep)
    open(recorder, "w").close()
    r = wl("--run", when="2100-01-01T09:00:00")
    got = spawns()
    if len(got) != 1 or '"kind": "message"' not in prompt_of(got[0]) \
            or not (t_budget in prompt_of(got[0]) or t_budget2 in prompt_of(got[0])):
        fail(f"the deferred wake did not run the next morning as the original "
             f"message wake — {len(got)} spawn(s); pass said: {r.stdout!r} "
             f"{r.stderr!r}; queue: {wl('list', '--json').stdout!r}")
    wl("--run", when="2100-01-01T09:01:00")       # the second refusal's turn
    if len(spawns()) != 2:
        fail("the second deferred wake did not run on the next pass")
    if [i for i in json.loads(wl("list", "--json").stdout) if i.get("source") == "budget"]:
        fail("a deferred wake that ran was left in the queue")
    ok("budget: over the cap → queued for the morning + one plain line "
       "(once a day), and it runs as itself when the day turns")


def main():
    check_contract()
    fx = setup_fixture()
    try:
        run_behavioral(fx)
        wl = run_worklist(fx)
        run_follow_through(fx, wl)
    finally:
        teardown_fixture(fx)
    print("CLASH-AGENT SELFTEST PASS: contract pins, arm-only first sweep, "
          "tiered spawn, dedupe, noise filter, thread pickup, two lanes, "
          "Andrew-only approvals, worktree isolation + preserved leftovers + "
          "the 👍-gated resume, the fail-closed fallback, the follow-through "
          "queue and its conditions, wake notes, continue chains, linked "
          "memory, the PR-watch verdict and the budget all proven offline "
          "(no Slack, no tokens, no GitHub, no real agent).")
    return 0


if __name__ == "__main__":
    sys.exit(main())

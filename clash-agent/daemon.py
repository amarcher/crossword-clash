#!/usr/bin/env python3
"""
Clash Agent daemon — Socket Mode push, so #crossword-clash feels instant.

Runs under launchd (com.archer.clash-agent.plist, KeepAlive) on the pyenv
python that carries slack_sdk. It holds an outbound WebSocket to Slack
(Socket Mode — no inbound port, no tunnel); when Slack pushes a message in
#crossword-clash from anyone but the bot, or one of Andrew's reactions, it
triggers a poller.py sweep. The sweep — not the event — decides what to do:
all dedupe/watermark/tier/approval logic stays in poller.py where the
selftest proves it, so a replayed, forged-looking, or duplicate event can at
worst cause a no-op sweep.

This is a direct port of smart-home/house-agent's daemon.py — same
self-restart/heartbeat mechanism, same reasoning — pointed at a different
Slack workspace and repo. See poller.py's module docstring for what's
different (workspace, single trust tier, Opus).

Reliability: events only mark a flag; the main loop runs sweeps serially
(the Slack-lane lock in poller.py guards cross-process too), and after each
sweep kicks one pass of the follow-through lane (worklist.py --run) as a
child process on its own lock. A fallback
sweep every FALLBACK_SWEEP_S catches anything a dropped event missed, and
one catch-up sweep runs at every (re)connect — a Mac wake or Slack flap
never loses messages, because the watermark is the source of truth.

Staying current: this process does `import poller` once and then runs
forever under KeepAlive, so it holds whatever poller.py said the day it
started. house-agent learned this the hard way (a month of landed fixes
looked deployed and were not, 2026-08-01) — so this loop fingerprints its
own sources every idle tick and os.execv's onto anything new, and writes a
heartbeat (STATUS_FILE) naming the code it is actually running.

slack_sdk is imported lazily inside main(): scripts/check-equivalent
py_compile and the selftest (which drives relevant(), the restart decision,
and the poller directly) run on the stdlib-only system python.
"""
import datetime
import hashlib
import json
import os
import subprocess
import sys
import threading
import time

BASE = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, BASE)
import poller

APP_TOKEN_FILE = os.environ.get("CLASH_AGENT_APP_TOKEN_FILE",
                                os.path.join(poller.STATE_DIR,
                                             "slack_app_token.txt"))
# The heartbeat a future drift-sentinel-style check can read: pid, start,
# beat, and the hash of every source file this process is running. Lives in
# STATE_DIR with the rest of the run-generated state, outside the repo.
STATUS_FILE = os.environ.get("CLASH_AGENT_STATUS_FILE",
                             os.path.join(poller.STATE_DIR,
                                          "daemon.status.json"))
FALLBACK_SWEEP_S = 900     # missed-event safety net
WORKLIST = os.path.join(BASE, "worklist.py")
WORK_LOG = os.path.join(poller.STATE_DIR, "work.out.log")
IDLE_TICK_S = 5            # how quickly a flagged sweep starts
BEAT_EVERY_S = 60          # heartbeat cadence while idle


def log(msg):
    print(f"{datetime.datetime.now().isoformat(timespec='seconds')}  "
          f"daemon: {msg}", flush=True)


# ------------------------------------------------------- staying current
def watched_sources():
    """The source files this process is actually RUNNING: daemon.py itself
    plus every module imported out of clash-agent/ (poller today). Derived
    from sys.modules rather than a hardcoded list, so a module added to the
    daemon's imports tomorrow is watched without anyone remembering to."""
    paths = {os.path.abspath(__file__)}
    for mod in list(sys.modules.values()):
        f = getattr(mod, "__file__", None) or ""
        if f and os.path.dirname(os.path.abspath(f)) == BASE:
            paths.add(os.path.abspath(f))
    return sorted(paths)


def fingerprint(paths=None):
    """{filename: sha256} over the watched sources. CONTENT, never mtime: a
    branch checkout that restores identical bytes must not cost a restart,
    and an edit that preserves the mtime must not hide one."""
    out = {}
    for p in (watched_sources() if paths is None else paths):
        try:
            with open(p, "rb") as f:
                out[os.path.basename(p)] = hashlib.sha256(f.read()).hexdigest()
        except OSError:
            out[os.path.basename(p)] = "unreadable"
    return out


def importable(paths=None):
    """Every watched source parses. The guard on the re-exec: launchd would
    restart a daemon that dies on a syntax error every ThrottleInterval
    forever, so a half-written file must never be exec'd into."""
    for p in (watched_sources() if paths is None else paths):
        try:
            with open(p, "rb") as f:
                compile(f.read(), p, "exec")
        except (OSError, SyntaxError, ValueError):
            return False
    return True


def restart_due(boot, disk, pending):
    """Pure decision (the selftest drives it directly): re-exec when the
    on-disk fingerprint differs from the one this process booted with AND has
    already been seen once — a file caught mid-write is a different
    fingerprint on the next tick, and only a settled one restarts us.
    Returns (restart_now, the fingerprint to remember)."""
    if disk == boot:
        return False, None
    if disk == pending:
        return True, pending
    return False, disk


def write_status(fp, started, path=None):
    """Publish what this process is running. The re-exec above fails silently
    if the loop ever wedges; this file is how that becomes visible from the
    outside."""
    path = path or STATUS_FILE
    try:
        os.makedirs(os.path.dirname(path), exist_ok=True)
        tmp = path + ".tmp"
        with open(tmp, "w") as f:
            json.dump({"pid": os.getpid(), "started": started,
                       "beat": datetime.datetime.now().isoformat(
                           timespec="seconds"),
                       "dir": BASE, "code": fp}, f, indent=2)
        os.replace(tmp, path)
    except OSError as e:
        log(f"heartbeat unwritable ({e})")


def reexec():
    """Replace this process with a fresh one on the new code. execv keeps the
    launchd-owned stdout/stderr, so the log runs continuously across the swap,
    and the new process's catch-up sweep covers anything that arrived during
    it."""
    log("sources changed on disk — re-exec onto the new code")
    sys.stdout.flush()
    os.execv(sys.executable,
             [sys.executable, os.path.abspath(__file__)] + sys.argv[1:])


def start_work_lane(current):
    """After every sweep, one pass of the follow-through lane in its own
    process: worklist.py --run claims the first READY queued item (or a
    labelled issue) and wakes the agent on it. Its own lock keeps it to one
    at a time; running it as a child rather than inline is what lets a
    long queued build never delay the next Slack sweep. Returns the live
    Popen (the previous one if still running). In race-agent this replaced
    a twice-daily calendar job on 2026-09-01; clash-agent never had one."""
    if current is not None and current.poll() is None:
        return current
    try:
        out = open(WORK_LOG, "a")
        p = subprocess.Popen([sys.executable, WORKLIST, "--run"],
                             cwd=poller.REPO, stdout=out,
                             stderr=subprocess.STDOUT, env=poller.gh_env())
        return p
    except Exception as e:
        log(f"work lane failed to start ({e}); next sweep retries")
        return None


def relevant(event):
    """Does this Events API payload warrant a sweep? Messages in #crossword-clash
    from anyone but the bot (and not join/leave noise, and not any bot
    integration's posts — those are bot_id messages, already excluded by
    is_human), or Andrew's reactions (the approval verdict). Pure +
    stdlib-only — the selftest drives it directly."""
    t = event.get("type")
    if t == "message":
        return event.get("channel") == poller.CHANNEL and poller.is_human(event)
    if t == "reaction_added":
        return (event.get("item", {}).get("channel") == poller.CHANNEL
                and event.get("user") == poller.ANDREW)
    return False


def main():
    from slack_sdk.socket_mode.builtin import SocketModeClient
    from slack_sdk.socket_mode.response import SocketModeResponse
    from slack_sdk.web import WebClient

    sweep_flag = threading.Event()

    def handle(client, req):
        # Ack FIRST — Slack redelivers unacked envelopes, and a sweep can
        # run for minutes. The flag coalesces bursts into one sweep.
        client.send_socket_mode_response(
            SocketModeResponse(envelope_id=req.envelope_id))
        if req.type == "events_api" and relevant(
                (req.payload or {}).get("event") or {}):
            sweep_flag.set()

    app_tok = open(APP_TOKEN_FILE).read().strip()
    bot_tok = open(poller.TOKEN_FILE).read().strip()
    client = SocketModeClient(app_token=app_tok,
                              web_client=WebClient(token=bot_tok))
    client.socket_mode_request_listeners.append(handle)
    client.connect()
    log("socket connected; catch-up sweep")
    sweep_flag.set()                     # catch-up on every (re)start

    boot_fp = fingerprint()
    started = datetime.datetime.now().isoformat(timespec="seconds")
    write_status(boot_fp, started)
    log(f"running {len(boot_fp)} source file(s): {', '.join(sorted(boot_fp))}")
    pending_fp = warned_fp = None
    last_beat = time.time()

    last_sweep = 0.0
    connected = True
    work = None
    while True:
        # Stale-code guard: checked BEFORE the sweep, so a landed fix is
        # what runs the next one.
        disk_fp = fingerprint()
        due_restart, pending_fp = restart_due(boot_fp, disk_fp, pending_fp)
        if due_restart:
            if importable():
                reexec()                 # never returns
            if warned_fp != disk_fp:     # complain once per broken revision
                log("new source on disk doesn't parse — staying on the "
                    "running copy until it does")
                warned_fp = disk_fp
        if time.time() - last_beat > BEAT_EVERY_S:
            write_status(boot_fp, started)
            last_beat = time.time()

        # Reconnect catch-up: the SDK's receiver/monitor threads answer pings
        # and auto-reconnect on their own, but events that fired while the
        # socket was down are gone — sweep the moment the connection returns
        # instead of waiting out the fallback interval.
        now_connected = client.is_connected()
        if now_connected and not connected:
            log("socket reconnected; catch-up sweep")
            sweep_flag.set()
        connected = now_connected
        due = (sweep_flag.is_set()
               or time.time() - last_sweep > FALLBACK_SWEEP_S)
        if due:
            sweep_flag.clear()           # BEFORE the sweep: a mid-sweep
            last_sweep = time.time()     # event re-arms the flag
            try:
                poller.main()
            except Exception as e:
                log(f"sweep raised ({e}); next tick retries")
            work = start_work_lane(work)
        time.sleep(IDLE_TICK_S)


if __name__ == "__main__":
    sys.exit(main())

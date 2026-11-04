#!/bin/bash
# Claude Code session hook for this repo (.claude/settings.json wires it to
# SessionStart and SessionEnd). Two jobs, both about recollection:
#
#   SessionEnd   — append one line to the agent's ledger for this interactive
#                  session: branch, last commit subject, PR if one exists. A
#                  dozen sessions a week each end with a summary that lived
#                  only in that terminal; the ledger keeps the line.
#   SessionStart — print the last few ledger lines (what the previous sessions
#                  and the Slack agent did, which PRs are still open) so a new
#                  session opens knowing; and warn once when the Slack daemon's
#                  heartbeat is stale, so a wedged bot is noticed by whoever
#                  sits down next rather than by nobody.
#
# Headless wakes (CLASH_AGENT_TIER set) write their own ledger lines from
# poller.py and get their thread note in the brief, so the hook stays out of
# their way. Never fails the session: every step is best-effort, and the
# script exits 0 whatever happens.
set -u
STATE_DIR="${CLASH_AGENT_STATE_DIR:-$HOME/.crossword-clash/clash-agent}"
LEDGER="$STATE_DIR/ledger.jsonl"
STATUS="$STATE_DIR/daemon.status.json"
INPUT="$(cat 2>/dev/null || true)"
[ -n "${CLASH_AGENT_TIER:-}" ] && exit 0
command -v python3 >/dev/null 2>&1 || exit 0

python3 - "$INPUT" "$LEDGER" "$STATUS" <<'PY' 2>/dev/null || true
import datetime, json, os, subprocess, sys

raw, ledger, status = sys.argv[1], sys.argv[2], sys.argv[3]
try:
    ev = json.loads(raw) if raw.strip() else {}
except ValueError:
    ev = {}
name = ev.get("hook_event_name", "")
cwd = ev.get("cwd") or os.getcwd()


def sh(*args, timeout=8):
    try:
        r = subprocess.run(args, cwd=cwd, capture_output=True, text=True,
                           timeout=timeout)
        return r.stdout.strip() if r.returncode == 0 else ""
    except Exception:
        return ""


def entries():
    out = []
    try:
        with open(ledger) as f:
            for ln in f:
                try:
                    out.append(json.loads(ln))
                except ValueError:
                    pass
    except OSError:
        pass
    return out


if name == "SessionEnd":
    branch = sh("git", "rev-parse", "--abbrev-ref", "HEAD")
    subject = sh("git", "log", "-1", "--format=%s")
    pr = None
    if branch and branch not in ("HEAD", "main"):
        raw_pr = sh("gh", "pr", "view", branch, "--json", "number,url,state", timeout=15)
        try:
            pr = json.loads(raw_pr) if raw_pr else None
        except ValueError:
            pr = None
    line = {"at": datetime.datetime.now().isoformat(timespec="seconds"),
            "kind": "session", "session": ev.get("session_id"),
            "reason": ev.get("reason"), "cwd": cwd, "branch": branch or None,
            "commit": subject or None,
            "pr": (pr or {}).get("number"), "pr_url": (pr or {}).get("url"),
            "pr_state": (pr or {}).get("state")}
    os.makedirs(os.path.dirname(ledger), exist_ok=True)
    with open(ledger, "a") as f:
        f.write(json.dumps(line, sort_keys=True) + "\n")

elif name == "SessionStart":
    lines = []
    try:
        beat = json.load(open(status)).get("beat")
        age = (datetime.datetime.now()
               - datetime.datetime.fromisoformat(beat)).total_seconds()
        if age > 300:
            lines.append(f"⚠ clash-agent daemon heartbeat is {int(age // 60)} min "
                         f"old — the Slack bot may be wedged. "
                         f"`launchctl kickstart -k gui/$UID/com.archer.clash-agent`")
    except Exception:
        pass
    recent = [e for e in entries()
              if e.get("kind") in ("session", "message", "approval", "worklist",
                                   "continue", "ci-fix", "incident")
              and (e.get("kind") != "session" or e.get("branch") not in (None, "main")
                   or e.get("commit"))][-6:]
    if recent:
        lines.append("Recent work (clash-agent ledger, newest last):")
        for e in recent:
            when = str(e.get("at", ""))[:16].replace("T", " ")
            if e.get("kind") == "session":
                what = e.get("commit") or "(no commit)"
                pr = f" PR #{e['pr']} {e.get('pr_state', '')}".rstrip() if e.get("pr") else ""
                lines.append(f"  {when}  session  {e.get('branch') or '-'}: {what}{pr}")
            else:
                head = e.get("headline") or e.get("error") or ("ok" if e.get("ok") else "failed")
                lines.append(f"  {when}  bot/{e.get('kind')}  {head}"
                             + (f"  [{e['branch']}]" if e.get("branch") else ""))
    if lines:
        print("\n".join(lines))
PY
exit 0

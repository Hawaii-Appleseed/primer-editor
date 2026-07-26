#!/usr/bin/env python3
"""Bring this checkout up to date with its origin, or explain why it can't.

    python3 tools/selfupdate.py              # update if it is safe to
    python3 tools/selfupdate.py --check      # only report, change nothing

Run by the launcher before the server starts, which is what makes the editor
behave like an app: quit, reopen, you have the latest.

The whole design constraint is that this is a REAL checkout the person owns —
they can read it, edit it, commit to it, open a PR. So an update is only ever
a fast-forward, and anything that could lose work stops and says so instead:

  * uncommitted changes to tracked files      -> skip
  * local commits origin does not have        -> skip
  * a branch that is not the upstream's       -> skip
  * no origin, or no network                  -> skip, quietly

Nothing here resets, stashes, checks out or force-pulls. The worst case is
that you stay on the version you already had and are told why.
"""
from __future__ import annotations

import argparse
import json
import subprocess
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]


def version() -> tuple[str, str]:
    """What is running right now: short commit and the date it was authored.
    Shown in the editor, so "which version are you on?" has an answer."""
    rc, out = git("log", "-1", "--pretty=%h|%cs")
    if rc or "|" not in out:
        return "", ""
    sha, _, date = out.strip().partition("|")
    return sha, date


def git(*args: str, timeout: int = 30) -> tuple[int, str]:
    try:
        r = subprocess.run(["git", "-C", str(ROOT), *args],
                           capture_output=True, text=True, timeout=timeout)
        return r.returncode, (r.stdout + r.stderr).strip()
    except (OSError, subprocess.SubprocessError) as e:
        return 1, str(e)


def status() -> dict:
    """What an update WOULD do. Never touches the working tree."""
    if not (ROOT / ".git").exists():
        return {"can": False, "why": "not a git checkout", "behind": 0, "quiet": True}
    rc, _ = git("remote", "get-url", "origin")
    if rc:
        return {"can": False, "why": "no origin remote", "behind": 0, "quiet": True}
    # Fetch is the only network call, and a failure here is normal (offline,
    # VPN, a private repo the credentials have expired for) — never fatal.
    rc, out = git("fetch", "--quiet", "origin", timeout=60)
    if rc:
        return {"can": False, "why": f"could not reach origin ({out.splitlines()[-1] if out else 'offline'})",
                "behind": 0, "quiet": True}
    rc, upstream = git("rev-parse", "--abbrev-ref", "@{u}")
    if rc:
        return {"can": False, "why": "this branch tracks nothing upstream",
                "behind": 0, "quiet": True}
    rc, counts = git("rev-list", "--left-right", "--count", "@{u}...HEAD")
    if rc:
        return {"can": False, "why": "could not compare with upstream", "behind": 0, "quiet": True}
    behind, ahead = (int(n) for n in counts.split())
    if behind == 0:
        return {"can": False, "why": "already up to date", "behind": 0, "ahead": ahead,
                "quiet": True, "current": True, "log": []}
    # Only TRACKED files matter: generated output under docs/ is untracked and
    # is rewritten by every build, so counting it would block every update.
    rc, dirty = git("status", "--porcelain", "--untracked-files=no")
    if dirty:
        n = len(dirty.splitlines())
        return {"can": False, "behind": behind, "ahead": ahead, "log": incoming(),
                "why": f"you have uncommitted changes to {n} tracked file"
                       f"{'s' if n > 1 else ''} — commit or discard them first"}
    if ahead:
        # Refusing outright is what a developer wants and what an ORDINARY USER
        # can never recover from: Save commits locally (see serve.py _save), so
        # the first edit anyone makes puts them one commit ahead, and every
        # update after that was skipped for the rest of the install's life.
        #
        # Their commits and yours touch disjoint parts of the tree — theirs the
        # authored content, yours the engine — and when that actually holds, a
        # rebase replays their work on top of the update with nothing to
        # decide. When it does NOT hold, the old refusal is still exactly
        # right: stop, and let a person choose.
        clash = sorted(mine_vs_theirs())
        if clash:
            return {"can": False, "behind": behind, "ahead": ahead, "log": incoming(),
                    "why": f"you have {ahead} commit{'s' if ahead > 1 else ''} of your own "
                           f"touching the same file{'s' if len(clash) > 1 else ''} as this "
                           f"update ({', '.join(clash[:3])}"
                           f"{', …' if len(clash) > 3 else ''}) — merge or push them "
                           f"yourself, nothing here will touch them"}
        return {"can": True, "behind": behind, "ahead": ahead, "upstream": upstream,
                "mode": "rebase", "log": incoming(),
                "why": f"{behind} new commit{'s' if behind > 1 else ''}, replaying your "
                       f"{ahead} saved change{'s' if ahead > 1 else ''} on top"}
    return {"can": True, "behind": behind, "ahead": 0, "upstream": upstream,
            "mode": "ff", "log": incoming(),
            "why": f"{behind} new commit{'s' if behind > 1 else ''}"}


def _paths(a: str, b: str) -> set:
    """Files that differ between two commits."""
    rc, out = git("diff", "--name-only", a, b)
    return set(out.split("\n")) - {""} if not rc else set()


def mine_vs_theirs() -> set:
    """Files touched BOTH by the local commits and by the incoming ones — the
    only case where replaying local work on top of an update has anything to
    decide. Compared from the merge base, so unrelated history is not counted."""
    rc, base = git("merge-base", "@{u}", "HEAD")
    if rc:
        return {"(cannot compare)"}
    base = base.strip()
    return _paths(base, "HEAD") & _paths(base, "@{u}")


def incoming() -> list:
    """One-line subjects of what an update would bring, newest last — so the
    person can be told WHAT is arriving rather than only how many."""
    rc, out = git("log", "--reverse", "--pretty=%s", "HEAD..@{u}")
    return [] if rc else [ln for ln in out.split("\n") if ln.strip()][:20]


def apply_update(st: dict) -> bool:
    """Fast-forward, or rebase local saves on top. Returns True when the
    checkout moved."""
    # git() returns (returncode, output) — unpack it that way round.
    _, before = git("rev-parse", "HEAD")
    # Where we came FROM, recorded before anything moves. An install that
    # updates itself can be broken by a bad push, and a person with no git at
    # their fingertips then has nothing to go back to. One line, written where
    # a human or a support answer can find it.
    try:
        (ROOT / ".primer-previous-version").write_text(before.strip() + "\n")
    except OSError:
        pass
    if st.get("mode") == "rebase":
        rc, out = git("rebase", "@{u}", timeout=120)
        if rc:
            # Leaving a half-finished rebase behind would strand the checkout
            # in a state the app cannot start from and the person cannot name.
            git("rebase", "--abort")
            print(f"  update skipped, nothing changed: your saved work could not be "
                  f"replayed on top ({out.splitlines()[-1] if out else 'conflict'})")
            return False
    else:
        rc, out = git("merge", "--ff-only", "@{u}")
        if rc:
            print(f"  update failed, nothing changed: {out.splitlines()[-1] if out else 'unknown'}")
            return False
    _, after = git("rev-parse", "HEAD")
    _, subject = git("log", "-1", "--pretty=%s")
    replayed = (f", your {st['ahead']} saved change"
                f"{'s' if st['ahead'] > 1 else ''} replayed on top") if st.get("ahead") else ""
    print(f"  updated — {st['behind']} new commit"
          f"{'s' if st['behind'] > 1 else ''}{replayed}: {subject}")
    # requirements can move with the code; a new dependency that is never
    # installed fails later and somewhere else.
    rc, changed = git("diff", "--name-only", before.strip(), after.strip())
    if not rc and "requirements.txt" in changed:
        print("  requirements.txt changed — installing")
        subprocess.run([sys.executable, "-m", "pip", "install", "--quiet",
                        "-r", str(ROOT / "requirements.txt")], check=False)
    return True


def main() -> int:
    ap = argparse.ArgumentParser()
    ap.add_argument("--check", action="store_true", help="report only, change nothing")
    ap.add_argument("--json", action="store_true", help="machine-readable status")
    ap.add_argument("--quiet", action="store_true", help="say nothing when already current")
    a = ap.parse_args()

    st = status()
    if a.json:
        st["sha"], st["date"] = version()
        if not a.check and st["can"]:
            st["applied"] = apply_update(st)
            st["sha"], st["date"] = version()
        print(json.dumps(st))
        return 0
    if a.check:
        print(f"behind={st['behind']} can_update={st['can']} — {st['why']}")
        return 0
    if st["can"]:
        return 0 if apply_update(st) else 0
    # An update that cannot happen is only worth mentioning when it is because
    # of something the person could act on.
    if not st.get("quiet"):
        print(f"  update available ({st['behind']} commit"
              f"{'s' if st['behind'] > 1 else ''}) but not applied: {st['why']}")
    elif not a.quiet and st.get("current"):
        print("  up to date")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())

#!/usr/bin/env python3
"""The watcher must wait for a burst of writes to STOP before it rebuilds.

What this guards was reported as "the editor freezes while Claude is making
edits": a rebuild fired per write, every rebuild bumps the version, and every
bump costs each open editor a full Pyodide re-render — about a second of frozen
main thread each. Measured on the pre-fix watcher, six writes 0.15s apart
produced THREE rebuilds, two of them against states the burst had already
moved past.

Scope, so the next person doesn't over-trust it: settling is one pass (0.4s),
so it coalesces writes that land closer together than that. A file left
genuinely broken for seconds — a real half-finished edit, not a fast rewrite —
still builds and still fails, which is what "build failed on disk" in the
editor's status row is for.

Run directly:  python3 report2027/tools/test_watch_settle.py
"""
import importlib.util
import shutil
import tempfile
import threading
import time
from pathlib import Path

HERE = Path(__file__).resolve().parent

PID = "settle-test"


def _fresh_serve():
    """A watcher runs forever and cannot be stopped, so every case gets its
    OWN module instance — otherwise the previous case's thread keeps watching
    through globals this one has since replaced, and rebuilds land in the
    wrong list."""
    spec = importlib.util.spec_from_file_location("serve_under_test", HERE / "serve.py")
    mod = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(mod)
    return mod


def _harness(serve, tmp: Path):
    """Point the module's watcher at ONE temp project whose rebuild is a
    recorder. Returns the list it records into: (content the build would have
    seen) per call."""
    serve.PROJECTS = {PID: {"root": tmp, "binding": None}}
    serve.STATE = {PID: serve.ProjectState()}
    serve._watch_patterns = lambda root, b: [str(tmp / "*.md")]
    seen = []

    def fake_rebuild(pid, reason=""):
        seen.append((tmp / "a.md").read_text())
        # what the real rebuild does at the end, and what stops it re-firing
        serve.STATE[pid].mtimes = serve._snapshot(serve._watch_patterns(tmp, None))

    serve.rebuild = fake_rebuild
    return seen


TMPDIRS = []


def _run(write_burst) -> list:
    serve = _fresh_serve()
    tmp = Path(tempfile.mkdtemp())
    TMPDIRS.append(tmp)                 # swept at the very end, not here
    (tmp / "a.md").write_text("start\n")
    seen = _harness(serve, tmp)
    threading.Thread(target=serve.watcher, daemon=True).start()
    time.sleep(1.0)                     # let it baseline
    write_burst(tmp)
    time.sleep(2.5)                     # well past the settle window
    return seen


def test_a_burst_is_one_rebuild():
    def burst(tmp):
        for i in range(6):
            (tmp / "a.md").write_text(f"edit {i}\n")
            time.sleep(0.15)            # tighter than the 0.4s pass: never settles
    seen = _run(burst)
    assert len(seen) == 1, f"expected ONE rebuild for one burst, got {len(seen)}: {seen}"
    assert seen[0] == "edit 5\n", f"rebuilt against a stale state of the burst: {seen[0]!r}"
    print("  ok: six writes in a row -> one rebuild, against the final bytes")


def test_a_settled_change_still_rebuilds():
    # The guard must not become a way to MISS changes — one quiet edit still
    # reaches the editor, which is the whole point of the watcher.
    def burst(tmp):
        (tmp / "a.md").write_text("one quiet edit\n")
    seen = _run(burst)
    assert len(seen) == 1, f"a single settled edit must rebuild exactly once: {seen}"
    print("  ok: a single quiet edit still rebuilds")


def test_a_watch_rebuild_of_an_already_built_state_is_dropped():
    """The double-build every Save produced: the Save writes and rebuilds, the
    watcher independently sees the same writes and queues its own, and that one
    ran against bytes already built — a second version bump, and a second full
    re-render in every open editor."""
    serve = _fresh_serve()
    tmp = Path(tempfile.mkdtemp())
    TMPDIRS.append(tmp)
    (tmp / "a.md").write_text("start\n")
    builds = tmp / "builds.log"

    class Binding:
        build = f"echo x >> {builds}"
        editor = None

    serve.PROJECTS = {PID: {"root": tmp, "binding": Binding()}}
    serve.STATE = {PID: serve.ProjectState()}
    serve._watch_patterns = lambda root, b: [str(tmp / "*.md")]
    serve.STATE[PID].mtimes = serve._snapshot([str(tmp / "*.md")])

    (tmp / "a.md").write_text("saved by the editor\n")
    serve.rebuild(PID, "save")            # what Save does
    serve.rebuild(PID, "watch")           # what the watcher had already queued

    ran = builds.read_text().count("x") if builds.exists() else 0
    assert ran == 1, f"expected ONE build for one change, ran {ran}"
    assert serve.STATE[PID].version == 1, \
        f"expected ONE version bump, got {serve.STATE[PID].version}"

    # …and the watcher is not muzzled: a NEW change still builds.
    (tmp / "a.md").write_text("and a later edit\n")
    serve.rebuild(PID, "watch")
    assert builds.read_text().count("x") == 2, "a genuinely new change must still build"
    print("  ok: a save and the watcher's echo of it are one build, not two")


if __name__ == "__main__":
    try:
        test_a_burst_is_one_rebuild()
        test_a_settled_change_still_rebuilds()
        test_a_watch_rebuild_of_an_already_built_state_is_dropped()
        print("watch-settle tests passed")
    finally:
        # Only now: a watcher thread cannot be stopped, and the ones still
        # running would otherwise spend the rest of the run logging watch
        # errors about the directory that vanished under them.
        for d in TMPDIRS:
            shutil.rmtree(d, ignore_errors=True)

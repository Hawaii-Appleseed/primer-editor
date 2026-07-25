#!/bin/bash
# One-line install for the docsync draft editor.
#
#   curl -fsSL https://raw.githubusercontent.com/dtomkatsu/primer-editor/main/install.sh | bash
#
# What you get is a REAL git checkout you own — read it, edit it, commit to it,
# open a pull request — plus a double-clickable app that keeps it up to date.
# Nothing is installed system-wide: Python packages go in a virtualenv inside
# the checkout, and the app bundle is a build artifact you can delete.
#
#   PRIMER_HOME=/somewhere  where to install     (default ~/primer-editor)
#   PRIMER_PORT=8010        which port to serve  (default 8010)
#   PRIMER_BRANCH=main      which branch to track
set -euo pipefail

REPO_URL="${PRIMER_REPO:-https://github.com/dtomkatsu/primer-editor.git}"
DEST="${PRIMER_HOME:-$HOME/primer-editor}"
BRANCH="${PRIMER_BRANCH:-main}"
PORT="${PRIMER_PORT:-8010}"

say()  { printf '  %s\n' "$*"; }
ok()   { printf '  \033[32m✓\033[0m %s\n' "$*"; }
die()  { printf '\n  \033[31m✗\033[0m %s\n\n' "$*" >&2; exit 1; }

printf '\n  Draft editor — install\n\n'

# --- prerequisites ------------------------------------------------------------
# Checked BEFORE anything is written, so a machine that cannot run this is
# never left with a half-made directory.
command -v git >/dev/null 2>&1 || die "git is required. On macOS: xcode-select --install"

PY=""
for c in python3.13 python3.12 python3.11 python3.10 python3; do
  command -v "$c" >/dev/null 2>&1 || continue
  "$c" -c 'import sys; raise SystemExit(0 if sys.version_info >= (3,10) else 1)' 2>/dev/null \
    && { PY="$(command -v "$c")"; break; }
done
[ -n "$PY" ] || die "Python 3.10 or newer is required (none found on PATH).
     macOS:  brew install python@3.12
     Ubuntu: sudo apt install python3 python3-venv"
ok "$("$PY" -V) at $PY"

# --- fetch --------------------------------------------------------------------
# A private repo cannot be cloned over plain https without credentials, and the
# error git gives ("could not read Username") explains nothing. Prefer gh,
# which already holds an authenticated session, and say what to do if neither
# route works.
if [ -d "$DEST/.git" ]; then
  say "already installed at $DEST — updating instead"
  git -C "$DEST" remote set-url origin "$REPO_URL" 2>/dev/null || true
  "$PY" "$DEST/tools/selfupdate.py" || true
else
  say "cloning into $DEST"
  if ! git clone --quiet --branch "$BRANCH" "$REPO_URL" "$DEST" 2>/dev/null; then
    if command -v gh >/dev/null 2>&1 && gh auth status >/dev/null 2>&1; then
      gh repo clone "${REPO_URL#https://github.com/}" "$DEST" -- --quiet --branch "$BRANCH" \
        || die "clone failed even with gh — do you have access to $REPO_URL ?"
    else
      die "could not clone $REPO_URL

     If the repository is private you need access first:
       gh auth login          (then re-run this installer)
     or clone it yourself with a key you already use:
       git clone <ssh-url> \"$DEST\""
    fi
  fi
fi
cd "$DEST"
ok "source at $DEST ($(git rev-parse --short HEAD))"

# --- dependencies -------------------------------------------------------------
# In a venv inside the checkout: no sudo, no system packages touched, and
# deleting the directory removes every trace.
if [ ! -x ".venv/bin/python" ]; then
  say "creating a virtualenv"
  "$PY" -m venv .venv || die "could not create a virtualenv (Ubuntu: sudo apt install python3-venv)"
fi
.venv/bin/python -m pip install --quiet --upgrade pip >/dev/null 2>&1 || true
.venv/bin/python -m pip install --quiet -r requirements.txt || die "dependency install failed"
ok "dependencies installed"

# --- check, then build the launcher ------------------------------------------
.venv/bin/python tools/preflight.py || die "preflight failed — see above"

if [ "$(uname -s)" = "Darwin" ]; then
  PATH="$DEST/.venv/bin:$PATH" PRIMER_PORT="$PORT" ./report2027/tools/make_launcher.sh >/dev/null
  ok "app installed — ~/Applications/Budget Primer Editor.app"
  printf '\n  Done. Open the app from Finder, or:\n'
  printf '    open ~/Applications/"Budget Primer Editor.app"\n\n'
  printf '  It updates itself from GitHub each time you open it.\n'
  printf '  Your own commits are never touched — an update that would\n'
  printf '  overwrite them is skipped and explained instead.\n\n'
else
  printf '\n  Done. Start it with:\n'
  printf '    cd %s && .venv/bin/python report2027/tools/serve.py\n\n' "$DEST"
  printf '  (the double-clickable app is macOS only)\n\n'
fi

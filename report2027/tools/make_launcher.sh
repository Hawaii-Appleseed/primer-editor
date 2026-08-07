#!/bin/bash
# Build a double-clickable macOS launcher for the live draft editor.
#
# The result is a real .app bundle: launching it starts the local live server
# (report2027/tools/serve.py) if it is not already up, then opens the editor in
# a standalone Chrome "app" window — no tabs, no address bar, its own Dock icon.
# It is the one-icon version of `make -C report2027 live`.
#
#   ./report2027/tools/make_launcher.sh            # -> ~/Applications
#   ./report2027/tools/make_launcher.sh /some/dir  # -> /some/dir
#
# The bundle is a build artifact, not committed. Re-run this after moving the
# repo (the repo path is baked in at build time so the icon works from anywhere).
set -euo pipefail

# The repo is two levels above this script, resolved absolutely so the baked
# path is correct no matter where the build runs from.
HERE="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REPO="$(cd "$HERE/../.." && pwd)"
OUT_DIR="${1:-$HOME/Applications}"
APP="$OUT_DIR/Budget Primer Editor.app"
PORT="${PRIMER_PORT:-8010}"

mkdir -p "$APP/Contents/MacOS" "$APP/Contents/Resources"

# Finder launches apps with a bare-bones PATH (/usr/bin:/bin:...), where
# python3 is Apple's system Python — no pyyaml, so the build fails inside the
# app while working fine in a terminal. Resolve the developer's python3 NOW,
# at build time in a real shell, and bake the absolute path in.
PYTHON="$(command -v python3)"

# --- the launch script: start the server if needed, then open the app window --
cat > "$APP/Contents/MacOS/launch" <<LAUNCH
#!/bin/bash
REPO="$REPO"
PORT="$PORT"
PYTHON="$PYTHON"
URL="http://localhost:\$PORT/primer/start.html"

cd "\$REPO" || exit 1

# Finder launches apps with a minimal PATH, so a bare \`python3\` — which the
# Makefile and everything serve.py shells out to (\`make pub\` -> build_data,
# render_report, docsync.stage) uses — resolves to Apple's system Python, which
# lacks pyyaml and fails every build. Put the developer's python FIRST on PATH
# so the entire build chain, not just serve.py's own launch, uses it.
export PATH="\$(dirname "\$PYTHON"):\$PATH"

# Opening the app IS how you get updates: fast-forward this checkout from
# origin before the server starts, so the code that boots is the current code.
# Never destructive — selfupdate.py refuses whenever the person has local
# commits or uncommitted work, and says why. Failure here (offline, no access)
# is not fatal: you simply run what you already have.
: > /tmp/primer-live.log   # fresh log per launch
{
  # Prefer the checkout's own updater (better messages, installs new
  # requirements), but never DEPEND on it: it ships inside the very thing it
  # updates, so a checkout older than it — or one where it broke — could never
  # update again. The inline fallback below lives in the app bundle, which is
  # rebuilt at install time, and does the same safe thing.
  if [ -x tools/selfupdate.py ] || [ -f tools/selfupdate.py ]; then
    "\$PYTHON" tools/selfupdate.py
  elif [ -d .git ] && git rev-parse '@{u}' >/dev/null 2>&1; then
    git fetch --quiet origin || true
    behind=\$(git rev-list --count HEAD..'@{u}' 2>/dev/null || echo 0)
    ahead=\$(git rev-list --count '@{u}'..HEAD 2>/dev/null || echo 0)
    dirty=\$(git status --porcelain --untracked-files=no 2>/dev/null | wc -l | tr -d ' ')
    if [ "\$behind" -gt 0 ] && [ "\$ahead" = "0" ] && [ "\$dirty" = "0" ]; then
      git merge --ff-only '@{u}' >/dev/null 2>&1 \\
        && echo "  updated — \$behind new commit(s)"
      [ -x .venv/bin/python ] \\
        && .venv/bin/python -m pip install --quiet -r requirements.txt || true
    elif [ "\$behind" -gt 0 ]; then
      echo "  update available (\$behind) but not applied: you have local work"
    fi
  fi
} >>/tmp/primer-live.log 2>&1 || true

# The app OWNS the server. A server on this port that the app did not start
# (a leftover from a Claude session, a forgotten terminal) may be running in
# a context that cannot reach the keychain — its Push would fail — so it is
# replaced, not reused. Reopening the app while its own server runs just
# focuses the window. Ownership is a pidfile written at boot.
PIDFILE="/tmp/primer-live.pid"
up() { curl -sf "http://localhost:\$PORT/__ping" >/dev/null 2>&1; }
mine() { [ -f "\$PIDFILE" ] && kill -0 "\$(cat "\$PIDFILE")" 2>/dev/null \
  && lsof -nP -iTCP:\$PORT -sTCP:LISTEN -t 2>/dev/null | grep -qx "\$(cat "\$PIDFILE")"; }
if up && ! mine; then
  lsof -nP -iTCP:\$PORT -sTCP:LISTEN -t 2>/dev/null | xargs kill 2>/dev/null
  sleep 1
fi
# Ownership is not FRESHNESS. The selfupdate above may have just moved the
# checkout forward while our own surviving server keeps running the code it
# imported at boot — the exact "I relaunched the app and the fix still is not
# there" report. The server hashes its own sources per ping (serverStale), so
# ask it, and replace a stale own-server exactly like a foreign one.
if up && mine && curl -sf "http://localhost:\$PORT/__ping" | grep -q '"serverStale": *true'; then
  kill "\$(cat "\$PIDFILE")" 2>/dev/null
  sleep 1
fi
if ! up; then
  # PRIMER_PORT must be PASSED, not just baked into the URL: without it the
  # server took its own default (8010) while the app polled the port it was
  # built for, so a non-default install waited forever and then opened a
  # window pointing at nothing. It only ever "worked" because the two
  # numbers happened to match.
  PRIMER_OPEN=0 PRIMER_PORT="\$PORT" nohup "\$PYTHON" -u report2027/tools/serve.py \\
    >>/tmp/primer-live.log 2>&1 &
  echo \$! > "\$PIDFILE"
  for _ in \$(seq 1 40); do
    up && break
    sleep 0.25
  done
fi

# A standalone window (--app) so it reads as an app, not a browser tab — via
# \`open\`, which hands off to the running Chrome and survives this script
# exiting. Invoking the Chrome binary directly and backgrounding it did NOT:
# the handoff stub died with the script and no window ever appeared. Falls
# back to the default browser if Chrome isn't installed.
# Reopening the app should RETURN you to its window, not add another one.
# \`open -n\` forces a NEW instance every time, so every click on the Dock icon
# left another editor window behind — and each one is a full Pyodide boot.
# Look for a window already showing this server and raise it instead.
#
# This is the DEFAULT, not the only option: a second editor is a real thing to
# want (two projects side by side, one report open on two pages), and the
# editor's own File ▸ New window asks the server for one. That way an extra
# window is deliberate rather than the by-product of clicking the Dock icon
# twice. Both windows share this one server; keep it to a handful — each holds
# an SSE connection and browsers cap those at ~6 per host.
#
# This asks macOS for permission to control Chrome the first time (System
# Settings > Privacy & Security > Automation). Declining is not fatal: the
# lookup fails, and the old behaviour — open a window — is what happens.
focus_existing() {
  osascript - "http://localhost:\$PORT/" <<'OSA' 2>/dev/null
on run argv
  set target to item 1 of argv
  tell application "System Events"
    if not (exists process "Google Chrome") then return "no"
  end tell
  tell application "Google Chrome"
    repeat with w in windows
      repeat with t in tabs of w
        if URL of t starts with target then
          set index of w to 1
          activate
          return "yes"
        end if
      end repeat
    end repeat
  end tell
  return "no"
end run
OSA
}

if [ -d "/Applications/Google Chrome.app" ]; then
  if [ "\$(focus_existing)" != "yes" ]; then
    open -na "Google Chrome" --args --app="\$URL"
  fi
else
  open "\$URL"
fi
LAUNCH
chmod +x "$APP/Contents/MacOS/launch"

# --- Info.plist ---------------------------------------------------------------
cat > "$APP/Contents/Info.plist" <<'PLIST'
<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0">
<dict>
  <key>CFBundleName</key><string>Budget Primer Editor</string>
  <key>CFBundleDisplayName</key><string>Budget Primer Editor</string>
  <key>CFBundleIdentifier</key><string>org.hiappleseed.primereditor</string>
  <key>CFBundleVersion</key><string>1.0</string>
  <key>CFBundleShortVersionString</key><string>1.0</string>
  <key>CFBundlePackageType</key><string>APPL</string>
  <key>CFBundleExecutable</key><string>launch</string>
  <key>CFBundleIconFile</key><string>icon</string>
  <key>LSMinimumSystemVersion</key><string>10.13</string>
  <key>NSHighResolutionCapable</key><true/>
</dict>
</plist>
PLIST

# --- icon: reuse the editor's own, converted to .icns -------------------------
SRC_PNG="$REPO/docs/primer/icons/icon-512.png"
if [ -f "$SRC_PNG" ]; then
  ICONSET="$(mktemp -d)/icon.iconset"
  mkdir -p "$ICONSET"
  for spec in "16:16x16" "32:16x16@2x" "32:32x32" "64:32x32@2x" \
              "128:128x128" "256:128x128@2x" "256:256x256" "512:256x256@2x" \
              "512:512x512"; do
    px="${spec%%:*}"; name="${spec##*:}"
    sips -z "$px" "$px" "$SRC_PNG" --out "$ICONSET/icon_$name.png" >/dev/null
  done
  iconutil -c icns "$ICONSET" -o "$APP/Contents/Resources/icon.icns"
  rm -rf "$(dirname "$ICONSET")"
fi

# Make Finder/LaunchServices pick up the new bundle immediately.
touch "$APP"

echo "Built: $APP"
echo "Repo baked in: $REPO  (port $PORT)"
echo "Launch it from Finder, Spotlight, or drag it to the Dock."

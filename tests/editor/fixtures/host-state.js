// Surgical, lock-guarded cleanup for the HOST state every test worker
// shares: docsync.yml and docs/primer/projects.json.
//
// The old pattern — snapshot the whole file in beforeAll, write the snapshot
// back in afterEach — was the docsync.yml scaffold race: two files in
// parallel workers each restore "their" snapshot over the other's live
// state, so one worker's binding vanishes mid-test and another's residue
// gets resurrected. It left zz-spec-* blocks committed three separate times
// before it was understood as one pattern, and it made every full-suite
// failure list untrustworthy (three runs, three disjoint sets).
//
// The fix is two rules, together:
//   · remove ONLY YOUR OWN keys — a cleanup that touches nothing but the
//     slug it created cannot stomp a concurrent worker's state, however the
//     scheduler interleaves;
//   · do the read-modify-write under the SAME cross-process lock serve.py
//     holds for its scaffold/adopt/connect writes (a mkdir in tmpdir — the
//     one primitive every platform creates atomically), so a cleanup cannot
//     interleave with the server appending someone else's binding.
const fs = require('fs');
const os = require('os');
const path = require('path');

const REPO = path.resolve(__dirname, '..', '..', '..');
const YML = path.join(REPO, 'docsync.yml');
const REGISTRY = path.join(REPO, 'docs', 'primer', 'projects.json');
// MUST match serve.py's HOST_LOCK: same tmpdir resolution, same name.
const LOCK = path.join(os.tmpdir(), 'docsync-host-state.lock');

const msleep = ms =>
  Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, ms);

const alive = pid => {
  try { process.kill(pid, 0); return true; }
  catch (e) { return e.code === 'EPERM'; }
};

/** Run `fn` holding the cross-process host-state lock. Synchronous on
 *  purpose: hooks calling this do file work measured in milliseconds, and a
 *  sync critical section cannot accidentally interleave awaits inside it. */
function withHostLock(fn, timeoutMs = 30000) {
  const deadline = Date.now() + timeoutMs;
  for (;;) {
    try {
      fs.mkdirSync(LOCK);
      fs.writeFileSync(path.join(LOCK, 'pid'), String(process.pid));
      break;
    } catch (e) {
      let pid = 0;
      try { pid = +fs.readFileSync(path.join(LOCK, 'pid'), 'utf8'); } catch (e2) {}
      if (pid && !alive(pid)) {                    // holder died: steal
        fs.rmSync(LOCK, { recursive: true, force: true });
        continue;
      }
      if (Date.now() > deadline) {                 // wedged: steal, press on
        fs.rmSync(LOCK, { recursive: true, force: true });
        continue;
      }
      msleep(20);
    }
  }
  try {
    return fn();
  } finally {
    fs.rmSync(LOCK, { recursive: true, force: true });
  }
}

/** Remove the named scaffold bindings — and nothing else — from docsync.yml.
 *  A binding is the "  - id: <slug>" line through the line before the next
 *  top-level list item (or a non-indented key, or EOF), plus the comment
 *  line docsync/new.py writes directly above it. */
function removeYmlBindings(...slugs) {
  withHostLock(() => {
    let lines = fs.readFileSync(YML, 'utf8').split('\n');
    for (const slug of slugs) {
      const at = lines.findIndex(l => l.trim() === `- id: ${slug}`);
      if (at < 0) continue;
      let start = at;
      // The scaffold's own comment (and any blank spacer) belongs to the block.
      while (start > 0 && (lines[start - 1].trim().startsWith('#')
                           || lines[start - 1].trim() === '')) start--;
      let end = at + 1;
      while (end < lines.length) {
        const t = lines[end];
        if (/^\s*- id: /.test(t) || (/^\S/.test(t) && t.trim() !== '')) break;
        end++;
      }
      // Leave one blank line's worth of separation, not the block's worth.
      lines = lines.slice(0, start).concat(lines.slice(end));
    }
    // Exactly one trailing newline, however the block boundaries fell —
    // removing the LAST binding must not also eat the file's final newline
    // (the first run of this helper left `\\ No newline at end of file`
    // sitting in git status, which reads as residue when it is not).
    fs.writeFileSync(YML, lines.join('\n').replace(/\n*$/, '\n'));
  });
}

/** Remove the named keys — and nothing else — from projects.json. A file
 *  left holding only other workers' entries is exactly right; an emptied
 *  file is an inert override layer (the server synthesises its registry
 *  and merges this file over it). */
function removeRegistryKeys(...slugs) {
  withHostLock(() => {
    if (!fs.existsSync(REGISTRY)) return;
    let reg;
    try { reg = JSON.parse(fs.readFileSync(REGISTRY, 'utf8')); }
    catch (e) { return; }        // unreadable registry is not ours to repair
    let touched = false;
    for (const slug of slugs) {
      if (slug in reg) { delete reg[slug]; touched = true; }
    }
    if (touched) {
      const tmp = REGISTRY + '.tmp';
      fs.writeFileSync(tmp, JSON.stringify(reg, null, 2) + '\n');
      fs.renameSync(tmp, REGISTRY);
    }
  });
}

module.exports = { withHostLock, removeYmlBindings, removeRegistryKeys, YML, REGISTRY };

// A report living in its OWN repo going stale, and being caught up.
// tools/selfupdate.py keeps the editor current; this is the same contract for
// the report's content — check in the background, tell the person, never apply
// anything on its own. Real git repos in a scratch dir (an origin, a clone
// behind it), a real /__adopt to mount them, and the real /__pull to catch up.
const { test, expect } = require('./fixtures/editor-test');
const fs = require('fs');
const os = require('os');
const path = require('path');
const { execSync } = require('child_process');

const REPO = path.resolve(__dirname, '..', '..');
const REGISTRY = path.join(REPO, 'docs', 'primer', 'projects.json');
const SLUG = 'zz-spec-stale';

let scratch, origin, clone, regBefore, regExisted;
const git = (cwd, cmd) => execSync(`git -C ${JSON.stringify(cwd)} ${cmd}`,
  { stdio: 'pipe' }).toString();

// Serial: shares the host registry, which the hooks snapshot and restore.
test.describe.configure({ mode: 'serial' });

test.describe('report content updates', () => {
  // The shared fixture blocks /__pull for every spec, because it fetches and
  // fast-forwards a REAL repo. This file is the exception: it only ever aims
  // at scratch clones it built itself, so it lets the endpoint through — at
  // page level, which Playwright checks before context-level routes.
  test.beforeEach(async ({ page }) => {
    await page.route('**/__pull', route => route.continue());
  });

  test.beforeAll(() => {
    regExisted = fs.existsSync(REGISTRY);
    regBefore = regExisted ? fs.readFileSync(REGISTRY, 'utf8') : null;

    scratch = fs.mkdtempSync(path.join(os.tmpdir(), 'stale-'));
    origin = path.join(scratch, 'origin');

    // A real docsync repo with one blank project, committed.
    fs.mkdirSync(origin);
    execSync(`cp -R ${JSON.stringify(path.join(REPO, 'docsync'))} ${JSON.stringify(origin)}`);
    execSync(`rm -rf ${JSON.stringify(path.join(origin, 'docsync', '__pycache__'))}`);
    // A seed binding: load_registry refuses an empty list, and docsync.new
    // reads the registry to see which ids are taken. It has no editor block,
    // so /__adopt rightly skips it.
    fs.writeFileSync(path.join(origin, 'docsync.yml'),
      'bindings:\n  - id: seed\n    content: projects/seed/content.md\n');
    fs.mkdirSync(path.join(origin, 'projects'));
    execSync('python3 -', { input: [
      `import sys`,
      `sys.path.insert(0, ${JSON.stringify(REPO)})`,
      `from pathlib import Path`,
      `from docsync.new import create`,
      `create(${JSON.stringify(SLUG)}, "Stale Spec Report", root=Path(${JSON.stringify(origin)}))`,
    ].join('\n') });
    // create() spec-loads origin's own docsync/registry.py, which writes
    // __pycache__ INSIDE origin — and `add -A` then commits the .pyc files.
    // The clone's rebuilds regenerate them with different bytes, a tracked
    // modification, and /__pull rightly refuses a "dirty" repo whose only
    // dirt is bytecode. Ignore the cache like every real repo does.
    execSync(`find ${JSON.stringify(origin)} -name __pycache__ -type d -exec rm -rf {} +`);
    fs.writeFileSync(path.join(origin, '.gitignore'), '__pycache__/\nweb/\ndocs/\n');
    git(origin, 'init -q -b main');
    git(origin, '-c user.email=s@x -c user.name=S add -A');
    git(origin, '-c user.email=s@x -c user.name=S commit -q -m "first"');

    // The colleague's clone — level with origin at this point.
    clone = path.join(scratch, 'clone');
    execSync(`git clone -q ${JSON.stringify(origin)} ${JSON.stringify(clone)}`);
  });

  test.afterAll(() => {
    // Restore, then make sure OUR key is gone regardless: if the snapshot
    // was itself taken over a previous run's residue, a blanket restore puts
    // that residue back — an entry pointing at a temp dir that no longer
    // exists, which the next server start reports as a broken project.
    if (regExisted) fs.writeFileSync(REGISTRY, regBefore);
    else if (fs.existsSync(REGISTRY)) fs.unlinkSync(REGISTRY);
    if (fs.existsSync(REGISTRY)) {
      try {
        const r = JSON.parse(fs.readFileSync(REGISTRY, 'utf8'));
        if (SLUG in r) {
          delete r[SLUG];
          fs.writeFileSync(REGISTRY, JSON.stringify(r, null, 2) + '\n');
        }
      } catch (e) { /* unreadable registry is not this test's to repair */ }
    }
    execSync(`rm -rf ${JSON.stringify(scratch)}`);
  });

  test('a clone that falls behind is offered the newer content, and takes it',
    async ({ page }) => {
      // Adopt the CLONE, so the server is serving it.
      await page.goto('start.html');
      await page.waitForTimeout(600);
      await page.click('#adopt');
      await page.fill('#np-root', clone);
      await page.click('#np-create');
      await page.waitForURL(`**/edit.html?project=${SLUG}`, { timeout: 30000 });
      await page.frameLocator('#out').locator('section.page[data-page="1"]')
        .waitFor({ state: 'visible', timeout: 75000 });

      // Level with origin: nothing to offer.
      let c = await page.evaluate(() =>
        fetch('/__ping?project=' + M.id).then(r => r.json()).then(j => j.content));
      expect(c.behind || 0).toBe(0);
      await expect(page.locator('#cupd')).toBeHidden();

      // Someone else pushes a change to the report.
      const md = path.join(origin, 'projects', SLUG, 'content.md');
      fs.writeFileSync(md, fs.readFileSync(md, 'utf8')
        .replace('Stale Spec Report', 'Stale Spec Report REVISED'));
      git(origin, '-c user.email=s@x -c user.name=S commit -aqm "revise the title"');

      // The server notices on its next check. Ask for one rather than waiting
      // out CONTENT_POLL — the polling loop itself is not what this asserts.
      const pull = await page.evaluate(() =>
        fetch('/__pull', { method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ project: M.id }) }).then(r => r.json()));
      if (!pull.ok) console.log('PULL-REFUSED:', JSON.stringify(pull));
      expect(pull.ok).toBe(true);
      expect(pull.message).toMatch(/1 change/);

      // The clone really moved, and the rebuilt page carries the new words.
      expect(git(clone, 'log --format=%s -1').trim()).toBe('revise the title');
      expect(fs.readFileSync(path.join(clone, 'projects', SLUG, 'content.md'), 'utf8'))
        .toContain('REVISED');
    });

  test('unpushed work of your own blocks the update instead of being merged over',
    async ({ page }) => {
      // The settle loop + boot + one reload fallback can honestly need more
      // than the default 90s under load.
      test.setTimeout(180000);
      // KNOWN-INTERMITTENT (~1 in 3 in tight serial loops, rare in full runs,
      // and OLDER than the features this file tests): booting the editor on a
      // freshly adopted external project right after a commit lands sometimes
      // hangs before first render — server healthy (__ping ok, no build
      // error), detectLocal completed (#stat shows the live message), then
      // nothing, and a reload does not recover it. The failure dump below
      // prints the evidence when it happens. Root cause still unfound; if you
      // are here chasing it, start at boot()'s engine-file fetch loop.
      // A local commit the colleague has not pushed: a real merge, which is a
      // decision — not something a button called "update" should make for them.
      fs.appendFileSync(path.join(clone, 'projects', SLUG, 'content.md'),
        '\nLocal work.\n');
      git(clone, '-c user.email=c@x -c user.name=C commit -aqm "my own edit"');
      const md = path.join(origin, 'projects', SLUG, 'content.md');
      fs.appendFileSync(md, '\nMore from upstream.\n');
      git(origin, '-c user.email=s@x -c user.name=S commit -aqm "upstream again"');

      // The commits above just triggered the watcher's rebuild of the adopted
      // project; booting the editor WHILE its staged engine is being re-copied
      // can catch the manifest half-written. Let the build settle (version
      // stable across two polls), then boot — with one reload as the fallback,
      // which is exactly what the editor itself offers a person.
      await page.waitForTimeout(500);
      let v0 = -1;
      for (let i = 0; i < 20; i++) {
        const j = await page.evaluate(async s2 =>
          fetch(`/__ping?project=${s2}`).then(r => r.json()).catch(() => null), SLUG);
        if (j && j.v === v0 && !j.error) break;
        v0 = j ? j.v : -1;
        await page.waitForTimeout(700);
      }
      await page.goto(`edit.html?project=${SLUG}`);
      try {
        await page.frameLocator('#out').locator('section.page[data-page="1"]')
          .waitFor({ state: 'visible', timeout: 30000 });
      } catch (e) {
        await page.reload();
        try {
          await page.frameLocator('#out').locator('section.page[data-page="1"]')
            .waitFor({ state: 'visible', timeout: 60000 });
        } catch (e2) {
          const stat = await page.locator('#stat').textContent().catch(() => '?');
          const ping = await page.evaluate(async s2 =>
            fetch(`/__ping?project=${s2}`).then(r => r.json()).catch(x => String(x)), SLUG);
          console.log('STUCK stat:', stat, '| ping:', JSON.stringify(ping).slice(0, 400));
          throw e2;
        }
      }

      const out = await page.evaluate(() =>
        fetch('/__pull', { method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ project: M.id }) }).then(r => r.json()));
      expect(out.ok).toBe(false);
      expect(out.error).toMatch(/not pushed yet/);
      // and their commit is still theirs — nothing was merged over it
      expect(git(clone, 'log --format=%s -1').trim()).toBe('my own edit');
    });

  test('the editor’s own repo is not offered this — the version chip owns it',
    async ({ page }) => {
      const { gotoEditor } = require('./fixtures/editor-test');
      await gotoEditor(page);          // any page, so a relative fetch resolves
      // rxkids lives in THIS repo whether or not the machine has a
      // projects.json — budget-primer does not: a dev checkout points it at
      // a separate clone via local_root, so it proved nothing here.
      const out = await page.evaluate(() =>
        fetch('/__pull', { method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ project: 'rxkids' }) }).then(r => r.json()));
      expect(out.ok).toBe(false);
      expect(out.error).toMatch(/editor's own repo/);
    });
});

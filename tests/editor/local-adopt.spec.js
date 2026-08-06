// "Adopt existing…" against a LOCAL server (start.html -> serve.py /__adopt):
// a docsync repo already cloned on this computer is registered by its folder
// path — the "add the live report later" path a colleague's editor-only
// install relies on. The adopted repo is a scratch one built here, so the
// test needs no network and no BudgetPrimerFinal on the machine; cleanup
// removes only this file's own registry keys, under the cross-process
// host-state lock (fixtures/host-state.js).
const { test, expect } = require('./fixtures/editor-test');
const fs = require('fs');
const os = require('os');
const path = require('path');
const { execSync } = require('child_process');
const { removeRegistryKeys } = require('./fixtures/host-state');

const REPO = path.resolve(__dirname, '..', '..');
const REGISTRY = path.join(REPO, 'docs', 'primer', 'projects.json');
const SLUG = 'zz-spec-adopted';

let scratch;

/** A minimal but REAL docsync repo in a fresh temp dir: the engine package, a
 *  registry, and one blank project made by the same docsync.new the scaffold
 *  uses. Via stdin: three nested quoting layers (JS -> shell -> python) is
 *  two too many for a -c one-liner. */
function buildScratchRepo(slug, title) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'adopt-repo-'));
  execSync(`cp -R ${JSON.stringify(path.join(REPO, 'docsync'))} ${JSON.stringify(dir)}`);
  execSync(`rm -rf ${JSON.stringify(path.join(dir, 'docsync', '__pycache__'))}`);
  fs.writeFileSync(path.join(dir, 'docsync.yml'),
    'bindings:\n  - id: seed\n    content: projects/seed/content.md\n');
  fs.mkdirSync(path.join(dir, 'projects'));
  execSync('python3 -', { input: [
    `import sys`,
    `sys.path.insert(0, ${JSON.stringify(REPO)})`,
    `from pathlib import Path`,
    `from docsync.new import create`,
    `create(${JSON.stringify(slug)}, ${JSON.stringify(title)}, root=Path(${JSON.stringify(dir)}))`,
  ].join('\n') });
  return dir;
}

// One worker, in order: these tests share a socket (the GitHub stand-in) or
// on-disk state their before/after hooks snapshot and restore — fullyParallel
// would run each test's hooks in its OWN worker, and the second worker's
// setup/teardown lands mid-flight under the first (EADDRINUSE on the mock,
// a registry restored while the other test is still writing it).
test.describe.configure({ mode: 'serial' });

test.describe('local adopt', () => {
  test.beforeAll(() => {
    scratch = buildScratchRepo(SLUG, 'Adopted Spec Report');
  });
  test.afterAll(() => {
    // OUR key only, under the cross-process lock — a blanket snapshot
    // restore stomped concurrent workers' entries and resurrected residue
    // (see fixtures/host-state.js).
    removeRegistryKeys(SLUG);
    execSync(`rm -rf ${JSON.stringify(scratch)}`);
  });

  test('a repo on disk is adopted by folder path and served immediately', async ({ page }) => {
    await page.goto('start.html');
    await page.waitForTimeout(600);
    await page.click('#adopt');
    // Local adoption is a folder, not an owner/name — the GitHub fields hide.
    await expect(page.locator('#np-root-l')).toBeVisible();
    await expect(page.locator('#np-repo-l')).toBeHidden();
    await page.fill('#np-root', scratch);
    await page.click('#np-create');

    // Adoption opens the first adopted project in the editor, served through
    // the external mount — proof the RUNNING server picked it up, no restart.
    await page.waitForURL(`**/edit.html?project=${SLUG}`, { timeout: 30000 });
    await page.frameLocator('#out').locator('section.page[data-page="1"]')
      .waitFor({ state: 'visible', timeout: 75000 });

    // The host registry gained the entry, pointing at the clone.
    const reg = JSON.parse(fs.readFileSync(REGISTRY, 'utf8'));
    expect(reg[SLUG]).toBeTruthy();
    expect(reg[SLUG].local_root).toBe(fs.realpathSync(scratch));
    expect(reg[SLUG].base).toBe(`../_repo-${SLUG}`);
    // The seed binding has no editor block, so adoption rightly skipped it.
    expect(reg.seed).toBeUndefined();
  });

  test('a folder that is not a docsync repo is refused plainly', async ({ page }) => {
    await page.goto('start.html');
    await page.waitForTimeout(600);
    await page.click('#adopt');
    await page.fill('#np-root', os.tmpdir());
    await page.click('#np-create');
    await expect(page.locator('#np-err')).toContainText('no docsync.yml');
  });
});

test.describe('re-adopting after the checkout is gone', () => {
  const SLUG2 = 'zz-spec-readopt';
  let first, second;

  test.afterAll(() => {
    // OUR key only, under the cross-process lock (fixtures/host-state.js).
    removeRegistryKeys(SLUG2);
    for (const d of [first, second]) {
      if (d) execSync(`rm -rf ${JSON.stringify(d)}`);
    }
  });

  test('a registration whose folder was deleted yields the id to a fresh checkout',
    async ({ page }) => {
      // The trap this pins: /__adopt refused any id already in the RUNNING
      // server's memory, full stop. Delete the adopted folder — a scratch
      // clone, a re-clone under a new path, a tidy-up — and its registration
      // became a ghost: everything touching it errored, and the id was
      // unusable until someone restarted the server. Deterministic, not a
      // flake: this is exactly why content-update.spec.js could never run
      // twice against one server (--repeat-each failed its adopt on every
      // repeat after the first).
      first = buildScratchRepo(SLUG2, 'First Checkout');
      const a1 = await (await page.request.post('/__adopt',
        { data: { root: first } })).json();
      expect(a1.ok).toBe(true);
      expect(a1.added).toContain(SLUG2);

      // The folder vanishes — with the registration still in server memory.
      execSync(`rm -rf ${JSON.stringify(first)}`);
      first = null;

      // A fresh checkout wants the same id. Pre-fix: "every project there is
      // already in your list", forever.
      second = buildScratchRepo(SLUG2, 'Second Checkout');
      const a2 = await (await page.request.post('/__adopt',
        { data: { root: second } })).json();
      expect(a2.ok).toBe(true);
      expect(a2.added).toContain(SLUG2);

      // And the replacement is genuinely SERVED — the registry points at the
      // new root and the project answers.
      const reg = JSON.parse(fs.readFileSync(REGISTRY, 'utf8'));
      expect(reg[SLUG2].local_root).toBe(fs.realpathSync(second));
      const ping = await (await page.request.get(`/__ping?project=${SLUG2}`)).json();
      expect(ping.ok).toBe(true);
      expect(ping.error).toBeUndefined();

      // Re-adopting the SAME live checkout is a no-op, and a no-op is not an
      // error: it answers ok with the projects, so the start page opens one
      // exactly as a fresh adoption would. (This is also what lets the
      // content-update spec run twice against one server — its second pass
      // re-adopts the same clone.)
      const again = await (await page.request.post('/__adopt',
        { data: { root: second } })).json();
      expect(again.ok).toBe(true);
      expect(again.added).toContain(SLUG2);
      expect(again.message).toContain('already');

      // A DIFFERENT checkout still on disk keeps being refused — eviction is
      // for ghosts, idempotence is for the same folder; a live conflict stays
      // a conflict.
      const third = buildScratchRepo(SLUG2, 'Third Checkout');
      try {
        const a3 = await (await page.request.post('/__adopt',
          { data: { root: third } })).json();
        expect(a3.ok).toBe(false);
        expect(a3.error).toContain('different checkout');
      } finally {
        execSync(`rm -rf ${JSON.stringify(third)}`);
      }
    });
});

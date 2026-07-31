// "Adopt existing…" against a LOCAL server (start.html -> serve.py /__adopt):
// a docsync repo already cloned on this computer is registered by its folder
// path — the "add the live report later" path a colleague's editor-only
// install relies on. The adopted repo is a scratch one built here, so the
// test needs no network and no BudgetPrimerFinal on the machine; the host's
// projects.json is snapshotted and restored.
const { test, expect } = require('./fixtures/editor-test');
const fs = require('fs');
const os = require('os');
const path = require('path');
const { execSync } = require('child_process');

const REPO = path.resolve(__dirname, '..', '..');
const REGISTRY = path.join(REPO, 'docs', 'primer', 'projects.json');
const SLUG = 'zz-spec-adopted';

let scratch, regBefore, regExisted;

// One worker, in order: these tests share a socket (the GitHub stand-in) or
// on-disk state their before/after hooks snapshot and restore — fullyParallel
// would run each test's hooks in its OWN worker, and the second worker's
// setup/teardown lands mid-flight under the first (EADDRINUSE on the mock,
// a registry restored while the other test is still writing it).
test.describe.configure({ mode: 'serial' });

test.describe('local adopt', () => {
  test.beforeAll(() => {
    regExisted = fs.existsSync(REGISTRY);
    regBefore = regExisted ? fs.readFileSync(REGISTRY, 'utf8') : null;

    // A minimal but REAL docsync repo: the engine package, a registry, and
    // one blank project made by the same docsync.new the scaffold uses.
    scratch = fs.mkdtempSync(path.join(os.tmpdir(), 'adopt-repo-'));
    execSync(`cp -R ${JSON.stringify(path.join(REPO, 'docsync'))} ${JSON.stringify(scratch)}`);
    execSync(`rm -rf ${JSON.stringify(path.join(scratch, 'docsync', '__pycache__'))}`);
    fs.writeFileSync(path.join(scratch, 'docsync.yml'),
      'bindings:\n  - id: seed\n    content: projects/seed/content.md\n');
    fs.mkdirSync(path.join(scratch, 'projects'));
    // Via stdin: three nested quoting layers (JS -> shell -> python) is two
    // too many for a -c one-liner.
    execSync('python3 -', { input: [
      `import sys`,
      `sys.path.insert(0, ${JSON.stringify(REPO)})`,
      `from pathlib import Path`,
      `from docsync.new import create`,
      `create(${JSON.stringify(SLUG)}, "Adopted Spec Report", root=Path(${JSON.stringify(scratch)}))`,
    ].join('\n') });
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

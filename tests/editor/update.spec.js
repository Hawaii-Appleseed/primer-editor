// Staying current: the version chip, the update offer, and installing one.
//
// The app is a real git checkout that fast-forwards itself, and it used to do
// that ONLY at launch — so anyone who leaves the editor open (which is how it
// is used) ran whatever was current the day they last quit. The server now
// polls in the background and publishes what it finds; these tests drive that
// payload directly, because the alternative is a test that needs a second
// repository and a push to it in order to assert on a tooltip.
//
// The real git decisions — whether an update is safe, whether local saves can
// be replayed on top of it — live in tools/selfupdate.py and are exercised
// against actual repositories there, not here.
const { test, expect, gotoEditor, PING, UPDATE } = require('./fixtures/editor-test');

const ver = (page) => page.locator('#ver');
const upd = (page) => page.locator('#upd');

/** Answer /__ping with an `update` block of our choosing. Version is held
 *  constant so nothing re-renders — these tests are about the chrome. */
async function withUpdate(context, update) {
  await context.unroute(PING).catch(() => {});
  await context.route(PING, route => route.fulfill({
    json: { ok: true, v: 90010, ahead: 0, watchAge: 0.4, update },
  }));
}

test.describe('version and updates', () => {
  test('the running version is shown, and says it is the latest', async ({ page, context }) => {
    await withUpdate(context, { sha: 'abc1234', date: '2026-07-26', behind: 0, can: false, log: [] });
    await gotoEditor(page);
    await expect(ver(page)).toBeVisible();
    await expect(ver(page)).toHaveText('abc1234');
    await expect(ver(page)).toHaveAttribute('title', /2026-07-26[\s\S]*latest version/);
    await expect(upd(page)).toBeHidden();      // nothing to offer
  });

  test('an available update is offered, and names what is in it', async ({ page, context }) => {
    await withUpdate(context, {
      sha: 'abc1234', date: '2026-07-26', behind: 2, can: true,
      log: ['editor: fix chart dragging', 'editor: faster scrolling'],
    });
    await gotoEditor(page);
    await expect(upd(page)).toBeVisible();
    await expect(upd(page)).toHaveText('Update (2)');
    // The count alone is ignorable; the subjects are the reason to click.
    await expect(upd(page)).toHaveAttribute('title', /fix chart dragging[\s\S]*faster scrolling/);
  });

  test('an update held back by the person’s own work is explained, not offered', async ({ page, context }) => {
    await withUpdate(context, {
      sha: 'abc1234', date: '2026-07-26', behind: 1, can: false,
      why: 'you have 2 commits of your own touching the same files as this update',
      log: ['editor: fix chart dragging'],
    });
    await gotoEditor(page);
    // A button that would do nothing when pressed is worse than no button —
    // but the reason still has to be reachable.
    await expect(upd(page)).toBeHidden();
    await expect(ver(page)).toHaveAttribute('title', /Not applied:[\s\S]*commits of your own/);
  });

  test('installing is refused while there are unsaved edits', async ({ page, context }) => {
    await withUpdate(context, {
      sha: 'abc1234', date: '2026-07-26', behind: 1, can: true, log: ['editor: a fix'],
    });
    await gotoEditor(page);

    let posted = false;
    await context.route(UPDATE, route => { posted = true; route.fulfill({ json: { ok: true } }); });
    await page.evaluate(() => { source = original + '\n'; markDirty(); });
    await upd(page).click();

    await expect(page.locator('#stat')).toContainText('save your changes first');
    expect(posted, 'an install must not start with unsaved work in the document').toBe(false);
    await expect(upd(page)).toBeVisible();     // still offered, not consumed
  });

  test('installing posts, waits for the server to come back, then reloads', async ({ page, context }) => {
    await withUpdate(context, {
      sha: 'abc1234', date: '2026-07-26', behind: 1, can: true, log: ['editor: a fix'],
    });
    await gotoEditor(page);

    // The server restarts into the new code, so it goes away and comes back.
    // Reloading into that gap shows a browser error page, which reads as "the
    // update broke it" — so the client must wait for a live answer first.
    let down = true;
    await context.route(UPDATE, route => {
      route.fulfill({ json: { ok: true, restarting: true, sha: 'def5678' } });
      setTimeout(() => { down = false; }, 1500);
    });
    await context.unroute(PING).catch(() => {});
    await context.route(PING, route => down
      ? route.abort()
      : route.fulfill({ json: { ok: true, v: 90010, ahead: 0, update: { sha: 'def5678', behind: 0, can: false } } }));

    const reloaded = page.waitForNavigation({ timeout: 30000 });
    await upd(page).click();
    await expect(page.locator('#stat')).toContainText(/restarting/);
    await reloaded;
    // Back up on the new version.
    await expect(ver(page)).toHaveText('def5678', { timeout: 30000 });
  });
});

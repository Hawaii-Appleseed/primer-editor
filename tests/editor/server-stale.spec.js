// A server running pre-fix code must SAY so.
//
// The process imports serve.py and docsync/*.py once, at launch, and then
// runs for days. Update it, vendor a new engine over it, switch branches —
// nothing in the UI changed, and the symptoms are baffling rather than
// obvious: a fix that is demonstrably on disk has demonstrably no effect, or
// an endpoint the client knows about answers "unknown endpoint". That is the
// fourth distinct cause of "why do I have to keep refreshing", and the only
// one no amount of client-side correctness can fix.
//
// serve.py hashes its own sources at boot and re-hashes them per ping, so the
// SERVER is what notices; the editor only has to report it.
const { test, expect, gotoEditor } = require('./fixtures/editor-test');

const PING = /\/__ping(\?|$)/;

/** Answer /__ping with the real payload plus an override. */
const pingWith = (page, patch) => page.route(PING, async route => {
  const r = await route.fetch();
  let body = {};
  try { body = await r.json(); } catch (e) {}
  route.fulfill({ json: { ...body, ...patch } });
});

test.describe('a stale editor server', () => {
  test('is named, and says a relaunch is what fixes it', async ({ page }) => {
    await pingWith(page, { serverStale: true });
    await gotoEditor(page);
    const stat = page.locator('#stat');
    await expect(stat).toHaveText(/running old code/i, { timeout: 20000 });
    await expect(stat).toHaveText(/relaunch/i);
    await expect(stat).toHaveClass(/err/);
    // The person's own work is untouched — say that, so the warning does not
    // read as "your document is broken".
    await expect(stat).toHaveAttribute('title', /work here is unaffected/i);
  });

  test('stays quiet when the server is current', async ({ page }) => {
    await pingWith(page, { serverStale: false });
    await gotoEditor(page);
    await expect(page.locator('#stat')).not.toHaveText(/running old code/i);
  });

  test('a dead watcher outranks it — that stops reload entirely', async ({ page }) => {
    await pingWith(page, { serverStale: true, watchAge: 99 });
    await gotoEditor(page);
    await expect(page.locator('#stat')).toHaveText(/live reload has stopped/i,
      { timeout: 20000 });
  });
});

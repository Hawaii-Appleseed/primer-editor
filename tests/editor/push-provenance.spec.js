// The Push button counts commits waiting to go to GitHub — for THIS project.
//
// Editor tabs share one live-reload connection: a leader holds the only stream
// and relays each event to the others through a localStorage key. That key was
// the only thing keeping two projects apart, and it is built from the
// manifest's id — so a tab whose manifest had no id scoped to the empty string,
// which is not a project but a bucket every id-less tab falls into together.
// Those tabs relayed to each other and each applied the other's numbers as its
// own. The symptom was a Push button flipping between two repositories' commit
// counts, which is what sent me looking.
//
// The fix is provenance: every live payload now names the project it describes,
// and one that names a different project is dropped. Asserted here on the
// network path rather than the localStorage relay — the leader and its
// followers run every payload through the same guard, and a leader tab cannot
// be pushed into following (its own heartbeat reclaims the lock within the
// election tick, so a test that "became a follower" would really be testing a
// tab that had stopped listening).
const { test, expect, gotoEditor } = require('./fixtures/editor-test');

const pushText = (page) => page.locator('#push').textContent();

/** Answer /__ping with a payload of our choosing. The version is held constant
 *  across calls so only the first one counts as a change — this is a test about
 *  the Push count, not about re-rendering. */
async function serve(context, payload) {
  await context.unroute('**/__ping*').catch(() => {});
  await context.route('**/__ping*', route => route.fulfill({
    json: { ok: true, v: 90005, watchAge: 0.4, ...payload },
  }));
}

test.describe('Push shows only this project’s commit count', () => {
  // Both halves in one test, deliberately. The foreign-payload assertion is an
  // assertion of ABSENCE, which would also hold if nothing were arriving at
  // all — so the same test goes on to send a payload this tab MUST honour,
  // proving the path was live throughout.
  test('a foreign project’s count is dropped, an unstamped one is still honoured', async ({ page, context }) => {
    await gotoEditor(page);
    const before = await pushText(page);

    await serve(context, { ahead: 999, project: 'some-other-report' });
    await page.waitForTimeout(6000);            // several heartbeats' worth
    expect(await pushText(page), "another project's count must never reach this button")
      .toBe(before);
    expect(await pushText(page)).not.toContain('999');

    // No `project` key at all — exactly what a server from before the stamp
    // sends. Dropping these would break live reload against an older server.
    await serve(context, { ahead: 42 });
    await expect.poll(() => pushText(page), { timeout: 10000 }).toBe('Push (42)');
  });

  test('a payload stamped with this project is honoured', async ({ page, context }) => {
    await gotoEditor(page);
    const id = await page.evaluate(async () =>
      (await (await fetch('engine/manifest.json', { cache: 'no-store' })).json()).id);
    await serve(context, { ahead: 77, project: id });
    await expect.poll(() => pushText(page), { timeout: 10000 }).toBe('Push (77)');
  });

  test('the relay key is scoped to a real project, never a shared empty bucket', async ({ page }) => {
    await gotoEditor(page);
    const keys = await page.evaluate(() =>
      Object.keys(localStorage).filter(k => /^primer-live-(leader|event):/.test(k)));
    expect(keys.length, 'the editor should claim its live-reload keys').toBeGreaterThan(0);
    for (const k of keys) {
      const scope = k.slice(k.indexOf(':') + 1);
      expect(scope, `${k} must not scope to the shared empty bucket`).not.toBe('');
    }
  });
});

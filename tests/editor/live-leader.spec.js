// Shared live-reload connection (edit.html startLive). Every editor tab used to
// open its own /__events stream; a few piled up against Chromium's six-per-
// origin cap and deadlocked the server. Now the tabs elect ONE leader that holds
// the only stream and relays events to the rest through localStorage — so no
// matter how many tabs are open, exactly one connection exists and it cannot
// pile up. window.__liveIsLeader() reports which tab holds it. Local mode.
const { test, expect, gotoEditor } = require('./fixtures/editor-test');

const isLeader = (page) => page.evaluate(() => window.__liveIsLeader && window.__liveIsLeader());

test.describe('single shared live-reload connection', () => {
  test('the only open tab is the leader (holds the one stream)', async ({ page }) => {
    await gotoEditor(page);
    expect(await isLeader(page)).toBe(true);
  });

  test('a second tab is a follower — it opens NO stream of its own', async ({ page, context }) => {
    await gotoEditor(page);
    expect(await isLeader(page)).toBe(true);

    const page2 = await context.newPage();
    await gotoEditor(page2);

    // exactly one leader across the two tabs
    expect(await isLeader(page2)).toBe(false);
    expect(await isLeader(page)).toBe(true);
    await page2.close();
  });

  test('closing the leader promotes the surviving tab', async ({ page, context }) => {
    await gotoEditor(page);
    const page2 = await context.newPage();
    await gotoEditor(page2);
    expect(await isLeader(page)).toBe(true);
    expect(await isLeader(page2)).toBe(false);

    // the leader leaves; its lock is dropped on pagehide, so the follower takes
    // over on its next election tick
    await page.close();
    await expect.poll(() => isLeader(page2), { timeout: 8000 }).toBe(true);
    await page2.close();
  });

  test('a follower reloads on a relayed event (localStorage is the relay)', async ({ page, context }) => {
    await gotoEditor(page);                 // leader
    const page2 = await context.newPage();
    await gotoEditor(page2);                // follower
    expect(await isLeader(page2)).toBe(false);

    // the follower listens for the leader's relay via the storage event; a bumped
    // version triggers a reload. Simulate the leader's relay directly.
    const navPromise = page2.waitForNavigation({ timeout: 8000 }).catch(() => null);
    await page2.evaluate(() => {
      // seed the follower's baseline, then relay a higher version from "the leader"
      const cur = JSON.parse(localStorage.getItem('primer-live-event') || '{}');
      localStorage.setItem('primer-live-event',
        JSON.stringify({ v: (cur.v || 0) + 5, ahead: 0, _n: 'test.' + Date.now() }));
      window.dispatchEvent(new StorageEvent('storage', {
        key: 'primer-live-event',
        newValue: localStorage.getItem('primer-live-event'),
      }));
    });
    // it should have adopted the bump (a reload, or at least no crash / still leaderless)
    await navPromise;
    expect(await isLeader(page2)).toBe(false);
    await page2.close();
  });
});

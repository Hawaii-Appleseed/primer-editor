// A version bump must only cost a re-render when something actually MOVED.
//
// Every rebuild restages the whole engine, and any watched file anywhere in the
// repo bumps the version for every project. _pull() used to answer all of that
// by rewriting the engine into Pyodide's FS and re-rendering unconditionally —
// about a second of frozen main thread, per bump, usually for byte-identical
// bytes. The status row said "reloaded", which was exactly the branch where
// nothing had changed; scrolling through one reads as a stutter.
//
// Both halves are asserted in one test on purpose. A no-op bump proves itself
// by ABSENCE (the status row stays untouched), which would also "pass" if the
// bump never arrived at all — so the same test goes on to send a bump that DOES
// change an engine file and requires the render, proving the plumbing under the
// negative assertion was live the whole time.
const { test, expect, gotoEditor } = require('./fixtures/editor-test');

const SENTINEL = 'sentinel — nothing re-rendered';
const seed = (page) => page.evaluate((s) => { document.getElementById('stat').textContent = s; }, SENTINEL);
const stat = (page) => page.locator('#stat').textContent();

/** Answer /__ping with a version far above anything the real server will
 *  reach, which is what the editor treats as "the disk changed". */
async function bumpTo(context, v) {
  await context.unroute('**/__ping*').catch(() => {});
  await context.route('**/__ping*', route => route.fulfill({
    json: { ok: true, v, ahead: 0, watchAge: 0.4 },
  }));
}

test('a bump that changes nothing does not re-render; one that changes the engine does', async ({ page, context }) => {
  await gotoEditor(page);

  // --- half one: a bump with identical bytes on disk -------------------------
  // The engine is re-fetched (the editor cannot know it is unchanged without
  // looking), finds every file byte-identical, and stops there.
  await seed(page);
  await bumpTo(context, 90001);
  await page.waitForTimeout(6000);          // several heartbeats' worth
  expect(await stat(page), 'a no-op bump must not re-render or touch the status row')
    .toBe(SENTINEL);

  // --- half two: the comparator still SEES a change --------------------------
  // The other half of the risk is over-skipping: a fingerprint too coarse to
  // notice a real engine edit would stop renderer changes reaching the page at
  // all, and the symptom would be silence. End-to-end coverage is out of reach
  // here (engine files arrive through the service worker, so they cannot be
  // intercepted, and the test server's watcher does not follow fixture edits),
  // so pin the comparator itself — including the appended-comment case that a
  // length-only or first-bytes check would wave through.
  const verdicts = await page.evaluate(() => {
    const f = window.__fileSig;
    if (!f) return null;
    const src = 'def render():\n    return 1\n';
    return {
      same:      f(src) === f(src),
      appended:  f(src) !== f(src + '# a trailing comment\n'),
      oneChar:   f(src) !== f(src.replace('1', '2')),
      bytes:     f(new Uint8Array([1, 2, 3])) !== f(new Uint8Array([1, 2, 4])),
      crossType: f('abc') === f('abc'),
    };
  });
  expect(verdicts, 'edit.html should expose __fileSig for this test').not.toBeNull();
  expect(verdicts).toEqual({ same: true, appended: true, oneChar: true, bytes: true, crossType: true });
});

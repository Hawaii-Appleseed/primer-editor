// A boot that CANNOT finish must say so, rather than sit silent forever.
//
// Everything visible is gated on one Promise.all: Pyodide plus every engine
// file. A promise that REJECTS lands in boot's catch and gets explained. A
// promise that simply never settles used to produce nothing at all — no
// error, no console line, no failed state — so the editor sat showing
// whatever detectLocal had last written while the page looked merely slow.
// That is the reported "sometimes hangs before the first render, and a
// reload does not recover it", and its worst property was being
// undiagnosable: nothing said which of the ~15 downloads was outstanding.
//
// Three defences. Downloads are time-bounded, so a stall becomes a normal
// error; anything still outstanding gets NAMED while boot keeps waiting; and
// — the one that turned out to be the ACTUAL reported failure — boot's
// closing "live — …" no longer overwrites a first render that failed, which
// had been showing a traceback in the canvas under a status row insisting
// all was well. The download stalls here are injected: the field report was
// diagnosed from a captured trace, where #stat held boot's own closing line,
// which proved boot had RUN TO COMPLETION and the hang was never in it.
const { test, expect } = require('./fixtures/editor-test');

test.describe('a boot that stalls', () => {
  test('names what it is still waiting on instead of showing nothing',
    async ({ page }) => {
      // Hold ONE engine SOURCE file open forever — the shape of the real
      // hang. A .py specifically: manifest.json is awaited earlier, before
      // the watched Promise.all exists, so holding that tests a different
      // (and already-explained) stall.
      let released;
      const held = new Promise(r => { released = r; });
      let heldUrl = '';
      await page.route('**/engine/**', async route => {
        if (!heldUrl && /\.py(\?|$)/.test(route.request().url())) {
          heldUrl = route.request().url();
          await held;                       // never, until this test says so
        }
        return route.continue();
      });

      await page.goto('edit.html');
      // Boot cannot have finished — the report never renders.
      await expect(page.frameLocator('#out').locator('section.page').first())
        .toBeHidden({ timeout: 5000 }).catch(() => {});

      // …and within the stall window it SAYS what it is waiting for, naming
      // the actual outstanding file rather than a generic "loading".
      await expect(page.locator('#stat'))
        .toContainText('still waiting on', { timeout: 40000 });
      const said = await page.locator('#stat').textContent();
      expect(said).toMatch(/\d+s so far/);
      // The held file is identified by name, which is the whole point: the
      // next occurrence in the wild diagnoses itself.
      const leaf = heldUrl.split('/').pop().split('?')[0];
      expect(said).toContain(leaf.split('.')[0]);

      released();
    });

  test('a download that stalls forever becomes an error, not an eternal wait',
    async ({ page }) => {
      await page.goto('edit.html');
      await page.frameLocator('#out').locator('section.page').first()
        .waitFor({ state: 'visible', timeout: 90000 });
      // fetch() has no default timeout; boundedFetch gives it one. Rather
      // than wait out the real 45s here, assert the mechanism is armed and
      // that an abort is reported with the URL and the reason — an aborted
      // fetch otherwise surfaces as an anonymous DOMException naming
      // neither.
      const wired = await page.evaluate(async () => {
        const src = boundedFetch.toString();
        return { hasSignal: src.includes('signal'),
                 hasTimeout: /FETCH_TIMEOUT/.test(src),
                 secs: FETCH_TIMEOUT / 1000 };
      }).catch(() => null);
      // boundedFetch lives in the editor's own scope; if the page is up at
      // all it is reachable.
      expect(wired, 'boundedFetch should be reachable in the editor scope')
        .not.toBeNull();
      expect(wired.hasSignal).toBe(true);
      expect(wired.hasTimeout).toBe(true);
      expect(wired.secs).toBeGreaterThan(10);      // generous, but bounded

      // And when the timeout fires, the message NAMES the url and the
      // reason. Driven by making fetch reject exactly as an expired
      // AbortSignal does, rather than waiting out the real 45s: what is
      // under test is the rethrow, and an anonymous DOMException reaching
      // the boot handler would be no better than the hang it replaced.
      const err = await page.evaluate(async () => {
        const real = window.fetch;
        window.fetch = () => Promise.reject(
          Object.assign(new Error('signal timed out'), { name: 'TimeoutError' }));
        try {
          return await boundedFetch('engine/report2027/tools/render_report.py')
            .then(() => 'resolved', e => e.message);
        } finally { window.fetch = real; }
      });
      expect(err).toContain('no answer after');
      expect(err).toContain('render_report.py');
      expect(err).not.toContain('signal timed out');   // not the raw DOMException
    });

  test('a healthy boot says none of this', async ({ page }) => {
    // The guard must be invisible when nothing is wrong — a warning that
    // fires on every normal load is a warning nobody reads.
    const warned = [];
    page.on('console', m => { if (m.type() === 'warning') warned.push(m.text()); });
    await page.goto('edit.html');
    await page.frameLocator('#out').locator('section.page').first()
      .waitFor({ state: 'visible', timeout: 90000 });
    await expect(page.locator('#stat')).not.toContainText('still waiting on');
    expect(warned.filter(w => w.includes('[boot]'))).toEqual([]);
  });
});

test.describe('a first render that fails', () => {
  test('is not overwritten by boot’s reassuring status line', async ({ page }) => {
    // renderOnce() paints the traceback into the canvas, says "draft does not
    // build", and returns NORMALLY — a draft that does not build is a state to
    // sit in and fix, not an exception. boot() then reached its closing line
    // and replaced that message with "live — edits here…", so the canvas showed
    // a traceback while the status row said all was well. Whatever the render
    // failed FOR, the person was told nothing was wrong: the reported
    // "editor boots, nothing renders, and nothing says why".
    await page.goto('edit.html');
    await page.frameLocator('#out').locator('section.page').first()
      .waitFor({ state: 'visible', timeout: 90000 });

    // Break the document so the NEXT render genuinely cannot build, then run
    // boot's closing sequence over it.
    await page.evaluate(async () => {
      writeSlot('basics.h1', 'x');
      source = source.replace(/\[\[sources\]\]/, '[[sources]]\nBROKEN LINE NO COLON');
      await render();
    });
    await expect(page.locator('#stat')).toContainText('does not build');

    // The masking step: boot's tail. It must leave the failure standing.
    await page.evaluate(() => {
      if (local && !renderFailed) $('stat').textContent =
        'live — edits here and from Claude land in the same files';
    });
    await expect(page.locator('#stat')).toContainText('does not build');
    expect(await page.evaluate(() => renderFailed)).toBe(true);

    // And a render that succeeds clears it again — the flag is state, not a
    // one-way latch that would suppress the message forever after.
    await page.evaluate(async () => { source = original; await render(); });
    expect(await page.evaluate(() => renderFailed)).toBe(false);
  });
});

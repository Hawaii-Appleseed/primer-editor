// Keyboard zoom (⌘+ / ⌘- / ⌘0).
//
// These keys used to reach Chrome, which zooms the whole INTERFACE rather than
// the report — and did it backwards: browser zoom-in shrinks the CSS viewport,
// so the auto-fit scale (stage width ÷ VIEW_W) got smaller and the page you
// were enlarging got smaller with it. Chrome also persists page zoom per
// origin, so quitting and reopening restored the same wrong zoom, and the
// editor's own zoom buttons are hidden (#zoom is display:none) so there was no
// way back from inside the app.
//
// Ctrl rather than Meta throughout: the handler takes either, and Ctrl behaves
// the same on every platform the suite might run on.
const { test, expect, gotoEditor } = require('./fixtures/editor-test');

const scale = (page) => page.evaluate(() => curScale);
const choice = (page) => page.evaluate(() => zoomChoice);

/** Dispatch a synthetic key so the test can read defaultPrevented, which
 *  page.keyboard.press cannot report. */
const fire = (page, opts, into = 'document') => page.evaluate(([o, where]) => {
  const target = where === 'iframe'
    ? document.getElementById('out').contentDocument : document;
  const ev = new KeyboardEvent('keydown',
    { bubbles: true, cancelable: true, ctrlKey: true, ...o });
  target.dispatchEvent(ev);
  return ev.defaultPrevented;
}, [opts, into]);

test.describe('keyboard zoom', () => {
  test('⌘+ and ⌘- walk the zoom ladder', async ({ page }) => {
    await gotoEditor(page);
    await page.evaluate(() => setZoom('1', false));

    await page.keyboard.press('Control+Equal');
    await expect.poll(() => scale(page)).toBe(1.1);
    await page.keyboard.press('Control+Equal');
    await expect.poll(() => scale(page)).toBe(1.25);
    await page.keyboard.press('Control+Minus');
    await expect.poll(() => scale(page)).toBe(1.1);
    // And it says so — #zoom is hidden, so the status row is the only feedback.
    await expect(page.locator('#stat')).toContainText('zoom 110%');
  });

  test('the keys are taken from the browser, so the page itself never zooms', async ({ page }) => {
    await gotoEditor(page);
    await page.evaluate(() => setZoom('1', false));
    expect(await fire(page, { key: '=', code: 'Equal' })).toBe(true);
    expect(await fire(page, { key: '-', code: 'Minus' })).toBe(true);
    // A US keyboard delivers ⌘+ as shift+Equal; matching on e.key alone would
    // miss it.
    await page.evaluate(() => setZoom('1', false));
    await fire(page, { key: '+', code: 'Equal', shiftKey: true });
    expect(await scale(page)).toBe(1.1);
  });

  test('⌘0 resets the editor AND is left for the browser to act on too', async ({ page }) => {
    await gotoEditor(page);
    await page.evaluate(() => setZoom('1.5', false));
    expect(await scale(page)).toBe(1.5);

    // Deliberately NOT prevented. It is the way out of a page zoom that was
    // already stuck from before this handler existed — one keystroke has to
    // reset both layers, or someone whose Chrome is at 150% can never recover
    // from inside an app whose zoom controls are hidden.
    expect(await fire(page, { key: '0', code: 'Digit0' })).toBe(false);
    await expect.poll(() => choice(page)).toBe('');          // back to auto-fit
    await expect(page.locator('#stat')).toContainText('fit to width');
  });

  test('zoom works with focus inside the report, and while a field has the caret', async ({ page }) => {
    await gotoEditor(page);
    await page.evaluate(() => setZoom('1', false));

    // The top-level listener never hears iframe keys, so the in-page handler
    // has to carry this too.
    expect(await fire(page, { key: '=', code: 'Equal' }, 'iframe')).toBe(true);
    await expect.poll(() => scale(page)).toBe(1.1);

    // And a caret in a text field is no reason for ⌘- to fall through to
    // Chrome — zoom means the same thing wherever focus happens to be, so the
    // check runs BEFORE the usual text-field guards.
    await page.evaluate(() => {
      const i = document.createElement('input');
      i.id = 'zoom-focus-probe';
      document.getElementById('bar').appendChild(i);
      i.focus();
    });
    await page.keyboard.press('Control+Minus');
    await expect.poll(() => scale(page)).toBe(1);
    await page.evaluate(() => document.getElementById('zoom-focus-probe').remove());
  });

  test('the ends of the ladder hold, and say so', async ({ page }) => {
    await gotoEditor(page);
    await page.evaluate(() => setZoom('2', false));
    await page.keyboard.press('Control+Equal');
    await expect(page.locator('#stat')).toContainText('as far in as it goes');
    expect(await scale(page)).toBe(2);            // held, not wrapped or overshot

    await page.evaluate(() => setZoom('0.25', false));
    await page.keyboard.press('Control+Minus');
    await expect(page.locator('#stat')).toContainText('as far out as it goes');
    expect(await scale(page)).toBe(0.25);
  });
});

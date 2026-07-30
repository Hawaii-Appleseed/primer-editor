// A second editor window on the same server (File ▸ New window ->
// serve.py's /__window). The launcher deliberately RAISES its existing window
// rather than adding one — a Dock icon that stacked up full Pyodide boots was
// a real annoyance — so an extra window is asked for explicitly here. Local
// mode.
const { test, expect, gotoEditor } = require('./fixtures/editor-test');

test.describe('new window', () => {
  test.beforeEach(async ({ page }) => {
    await gotoEditor(page);
    await page.waitForTimeout(800);
  });

  test('the row really hides when it is not applicable', async ({ page }) => {
    // .pop .shp is display:flex, which beats [hidden]'s own display:none —
    // the same trap as #bar > button[hidden]. Only the local server can open
    // an app window, so a hosted editor must not show the row at all, and
    // "visible in local mode" passes either way.
    await page.click('#file');
    await expect(page.locator('#file-newwin')).toBeVisible();
    await page.evaluate(() => { $('file-newwin').hidden = true; });
    await expect(page.locator('#file-newwin')).toBeHidden();
  });

  test('the File menu offers it, and it asks the server for THIS url',
    async ({ page }) => {
      await page.click('#file');
      await expect(page.locator('#file-newwin')).toBeVisible();

      // Intercepted: letting it through would spawn a real Chrome window per run.
      let body = null;
      await page.route('**/__window*', async route => {
        body = route.request().postDataJSON();
        await route.fulfill({ status: 200, contentType: 'application/json',
                              body: JSON.stringify({ ok: true, url: body.url }) });
      });
      await page.click('#file-newwin');
      await page.waitForTimeout(400);

      // The client sends its OWN location: which mount a project is served
      // under is already worked out in the browser, and re-deriving it on the
      // server would be a second copy of that mapping to keep in step.
      expect(body).not.toBeNull();
      expect(body.url).toContain('edit.html');
      expect(body.url).toContain(String(new URL(page.url()).port));
      await expect(page.locator('#filepop')).toBeHidden();
      await expect(page.locator('#stat')).toContainText('new window');
    });

  test('the endpoint opens nothing but a url on this very server',
    async ({ page }) => {
      const out = await page.evaluate(async () => {
        const post = url => fetch('/__window', {
          method: 'POST', headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ url }) }).then(r => r.json());
        return {
          foreign: await post('https://example.org/'),
          spaced: await post(`http://localhost:${location.port}/x";touch /tmp/pwn"`),
          empty: await post(''),
        };
      });
      // Not a shell string in the first place (Popen takes a list), but the
      // origin check is what stops this being an "open any url" endpoint.
      for (const k of ['foreign', 'spaced', 'empty']) {
        expect(out[k].ok).toBe(false);
        expect(out[k].error).toMatch(/plain path on this server/);
      }
    });
});

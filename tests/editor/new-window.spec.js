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

      // More than one project lives on this server, so it asks which one to
      // open — defaulted to whatever is already open here, so accepting that
      // default reproduces the old one-click "duplicate this window" result.
      const dlg = page.locator('dialog[open]');
      await expect(dlg).toBeVisible();
      await expect(dlg.locator('select')).toHaveValue(
        await page.evaluate(() => activeProjectId()));
      await dlg.getByRole('button', { name: 'Open' }).click();
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

  test('picking a different project in the dialog opens THAT one',
    async ({ page }) => {
      await page.click('#file');
      let body = null;
      await page.route('**/__window*', async route => {
        body = route.request().postDataJSON();
        await route.fulfill({ status: 200, contentType: 'application/json',
                              body: JSON.stringify({ ok: true, url: body.url }) });
      });
      await page.click('#file-newwin');

      // Registered projects are per-machine (docs/primer/projects.json is
      // untracked — see serve.py), so which OTHER project exists here cannot
      // be named ahead of time — only that the current one is pre-selected
      // and at least one alternative is offered.
      const dlg = page.locator('dialog[open]');
      const select = dlg.locator('select');
      const current = await select.inputValue();
      // Skip the "+ New report…" sentinel row — this test is about opening
      // a project that already exists.
      const other = await select.locator('option').evaluateAll(
        (opts, cur) => opts.map(o => o.value)
          .find(v => v !== cur && !v.startsWith('\u0000')), current);
      test.skip(!other, 'only one project registered on this server');
      await select.selectOption(other);
      await dlg.getByRole('button', { name: 'Open' }).click();
      await page.waitForTimeout(400);

      expect(body).not.toBeNull();
      expect(body.url).toContain('project=' + other);
    });

  test('the picker also offers "+ New report…", which scaffolds then opens a window',
    async ({ page }) => {
      // Both endpoints mocked: a real /__scaffold writes docsync.yml and
      // projects/<slug>/ on this machine, a real /__window spawns Chrome.
      let scaffolded = null, opened = null;
      await page.route('**/__scaffold*', async route => {
        scaffolded = route.request().postDataJSON();
        await route.fulfill({ status: 200, contentType: 'application/json',
                              body: JSON.stringify({ ok: true, slug: scaffolded.slug }) });
      });
      await page.route('**/__window*', async route => {
        opened = route.request().postDataJSON();
        await route.fulfill({ status: 200, contentType: 'application/json',
                              body: JSON.stringify({ ok: true, url: opened.url }) });
      });
      await page.click('#file');
      await page.click('#file-newwin');
      const dlg = page.locator('dialog[open]');
      await dlg.locator('select').selectOption({ label: '+ New report…' });
      await dlg.getByRole('button', { name: 'Open' }).click();

      // The picker hands off to the New report form.
      const form = page.locator('dialog[open]');
      await expect(form).toContainText('New report');
      await form.locator('input[name="name"]').fill('Session Notes');
      await form.getByRole('button', { name: 'Create' }).click();
      await page.waitForTimeout(400);

      // The id derives from the title, the default size is Letter, and the
      // window the server is asked for is the NEW report's, not this one's.
      expect(scaffolded).not.toBeNull();
      expect(scaffolded.name).toBe('Session Notes');
      expect(scaffolded.slug).toBe('session-notes');
      expect(scaffolded.size).toEqual({ w: 8.5, h: 11.0 });
      expect(opened).not.toBeNull();
      expect(opened.url).toContain('project=session-notes');
    });

  test('cancelling the picker opens nothing',
    async ({ page }) => {
      await page.click('#file');
      let called = false;
      await page.route('**/__window*', async route => {
        called = true;
        await route.fulfill({ status: 200, contentType: 'application/json',
                              body: JSON.stringify({ ok: true, url: '' }) });
      });
      await page.click('#file-newwin');

      const dlg = page.locator('dialog[open]');
      await dlg.getByRole('button', { name: 'Cancel' }).click();
      await page.waitForTimeout(300);

      expect(called).toBe(false);
      await expect(page.locator('#stat')).not.toContainText('new window');
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

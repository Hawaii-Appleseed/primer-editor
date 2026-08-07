// Playwright config for the draft editor (docsync/editor/edit.html), the
// single-file app assessed in docs/primer/LIBRARIES.md — recommendation #1
// there was to formalize the ad-hoc /tmp Playwright harness into the repo.
// Dev-only: nothing here ships to users.
const { defineConfig, devices } = require('@playwright/test');

const PORT = process.env.PRIMER_TEST_PORT || 8199;

module.exports = defineConfig({
  testDir: 'tests/editor',
  fullyParallel: true,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 1 : 0,
  // Pyodide (~30MB, cdn.jsdelivr.net) boots once per test — generous timeouts.
  timeout: 90_000,
  expect: { timeout: 15_000 },
  reporter: process.env.CI ? [['github'], ['list'], ['html', { open: 'never' }]] : 'list',
  use: {
    baseURL: `http://localhost:${PORT}/primer/`,
    trace: 'retain-on-failure',
  },
  projects: [
    { name: 'chromium', use: { ...devices['Desktop Chrome'] } },
  ],
  webServer: {
    command: 'python3 report2027/tools/serve.py',
    url: `http://localhost:${PORT}/__ping`,
    reuseExistingServer: false,
    timeout: 30_000,
    // PRIMER_OPEN=0: serve.py's default behavior opens a real browser tab on
    // startup (nice for `make live`, pointless — and awkward on a CI runner
    // with no display — when Playwright is about to drive its own browser).
    env: { PRIMER_PORT: String(PORT), PRIMER_OPEN: '0',
           // Never let the suite's shared server idle-exit mid-run: spec
           // pages come and go by design, so their goodbyes would reap it.
           PRIMER_LINGER: '0',
           // No network from the suite: the push-health probe asks GitHub
           // whether a push would work, and a real answer for a real
           // checkout would bleed into specs that mock everything else.
           PRIMER_PUSH_PROBE: '0',
           // The connect-github spec stands in for GitHub on this port; the
           // fake client id keeps the device flow ON without a real App.
           PRIMER_GH_BASE: 'http://localhost:8390',
           PRIMER_GH_API: 'http://localhost:8390',
           PRIMER_GH_CLIENT: 'Iv23TESTCLIENT' },
  },
});

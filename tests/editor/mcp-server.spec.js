// docsync/mcp_server.py — read-only MCP access to the reports a running
// editor serves, for a client with no browser at all.
//
// Driven here exactly as a real client drives it: spawn the process, speak
// JSON-RPC over stdio, point it at the suite's own dev server. That is the
// only way to test the thing that actually ships — the protocol handling and
// the tool payloads together, not one or the other in isolation.
const { test, expect } = require('./fixtures/editor-test');
const { spawn } = require('child_process');
const path = require('path');

const REPO = path.resolve(__dirname, '..', '..');
const PORT = process.env.PRIMER_TEST_PORT || 8199;

/** A live MCP session: spawn, initialize, and hand back call/close. */
async function session() {
  const proc = spawn('python3', [path.join(REPO, 'docsync', 'mcp_server.py')], {
    cwd: REPO,
    env: { ...process.env, PRIMER_URL: `http://localhost:${PORT}` },
    stdio: ['pipe', 'pipe', 'pipe'],
  });
  let buf = '';
  const waiters = [];
  proc.stdout.on('data', d => {
    buf += d.toString();
    let i;
    while ((i = buf.indexOf('\n')) >= 0) {
      const line = buf.slice(0, i).trim();
      buf = buf.slice(i + 1);
      if (line && waiters.length) waiters.shift()(JSON.parse(line));
    }
  });
  let id = 0;
  const rpc = (method, params) => new Promise((resolve, reject) => {
    const t = setTimeout(() => reject(new Error(`timeout on ${method}`)), 200000);
    waiters.push(v => { clearTimeout(t); resolve(v); });
    proc.stdin.write(JSON.stringify({ jsonrpc: '2.0', id: ++id, method, params }) + '\n');
  });
  const notify = (method) =>
    proc.stdin.write(JSON.stringify({ jsonrpc: '2.0', method }) + '\n');

  const init = await rpc('initialize', {
    protocolVersion: '2025-06-18', capabilities: {},
    clientInfo: { name: 'spec', version: '1' },
  });
  notify('notifications/initialized');

  /** Call a tool and parse the JSON payload back out of its text content. */
  const call = async (name, args = {}) => {
    const r = await rpc('tools/call', { name, arguments: args });
    if (r.error) return { _rpcError: r.error };
    return { _isError: r.result.isError, ...JSON.parse(r.result.content[0].text) };
  };
  return { init, rpc, call, close: () => proc.kill() };
}

test.describe('mcp server', () => {
  test('initializes, lists its tools, and says editing is not here',
    async ({ page }) => {
      await page.goto('edit.html');          // ensure the dev server is up
      const s = await session();
      try {
        expect(s.init.result.serverInfo.name).toBe('docsync-primer');
        expect(s.init.result.capabilities).toHaveProperty('tools');
        // The client's protocol version is echoed, not overridden.
        expect(s.init.result.protocolVersion).toBe('2025-06-18');
        // The instructions carry the one thing a pilot must not get wrong.
        expect(s.init.result.instructions).toContain('window.docsync.api');

        const list = await s.rpc('tools/list', {});
        const names = list.result.tools.map(t => t.name);
        expect(names).toEqual(expect.arrayContaining(
          ['list_reports', 'status', 'inventory', 'get_slot', 'search', 'uncited_sources']));
        // Every tool is described and schema'd, or a client cannot call it.
        for (const t of list.result.tools) {
          expect(t.description.length).toBeGreaterThan(10);
          expect(t.inputSchema.type).toBe('object');
        }
      } finally { s.close(); }
    });

  test('reads the document: reports, slots, search, uncited sources',
    async ({ page }) => {
      await page.goto('edit.html');
      const s = await session();
      try {
        const reports = await s.call('list_reports');
        expect(reports.ok).toBe(true);
        expect(reports.reports.map(r => r.id)).toContain('budget-primer');

        const slot = await s.call('get_slot',
          { project: 'budget-primer', key: 'whopays.p1' });
        expect(slot.ok).toBe(true);
        expect(slot.md).toContain('low- and middle-income');

        // search spans slots, sources and text boxes in one pass.
        const found = await s.call('search',
          { project: 'budget-primer', query: 'low- and middle-income' });
        expect(found.ok).toBe(true);
        expect(found.count).toBeGreaterThan(0);
        expect(found.hits.some(h => h.key === 'whopays.p1')).toBe(true);

        // The pre-publish check: an uncited source renders but refuses to ship.
        const un = await s.call('uncited_sources', { project: 'budget-primer' });
        expect(un.ok).toBe(true);
        expect(Array.isArray(un.uncited)).toBe(true);
        expect(un.publishable).toBe(un.uncited.length === 0);

        const inv = await s.call('inventory',
          { project: 'budget-primer', elements: false });
        expect(inv.ok).toBe(true);
        expect(inv.slots.length).toBeGreaterThan(50);
        expect(inv.page.w).toBe(8.5);
      } finally { s.close(); }
    });

  test('a failed call is marked isError and suggests a way forward, not a stack trace',
    async ({ page }) => {
      await page.goto('edit.html');
      const s = await session();
      try {
        const bad = await s.call('get_slot',
          { project: 'budget-primer', key: 'no.such.slot' });
        expect(bad._isError).toBe(true);      // the model should react, not retry blind
        expect(bad.ok).toBe(false);
        expect(bad.did_you_mean.length).toBeGreaterThan(0);

        // Unknown tool and missing argument are PROTOCOL errors, distinct from
        // a tool that ran and failed.
        const unknown = await s.rpc('tools/call', { name: 'nope', arguments: {} });
        expect(unknown.error.message).toContain('unknown tool');
        const missing = await s.rpc('tools/call',
          { name: 'get_slot', arguments: { project: 'budget-primer' } });
        expect(missing.error.message).toContain('missing key');
      } finally { s.close(); }
    });

  test('with no editor running it names that, rather than leaking a refused connection',
    async () => {
      const proc = spawn('python3', [path.join(REPO, 'docsync', 'mcp_server.py')], {
        cwd: REPO,
        // A port nothing listens on: the commonest real failure by far.
        env: { ...process.env, PRIMER_URL: 'http://localhost:8299' },
        stdio: ['pipe', 'pipe', 'pipe'],
      });
      const out = [];
      proc.stdout.on('data', d => out.push(d.toString()));
      proc.stdin.write(JSON.stringify({ jsonrpc: '2.0', id: 1, method: 'initialize',
        params: { protocolVersion: '2025-06-18', capabilities: {}, clientInfo: {} } }) + '\n');
      proc.stdin.write(JSON.stringify({ jsonrpc: '2.0', id: 2, method: 'tools/call',
        params: { name: 'list_reports', arguments: {} } }) + '\n');
      await new Promise(r => setTimeout(r, 4000));
      proc.kill();
      const text = out.join('');
      expect(text).toContain('no editor server at');
      expect(text).toMatch(/Budget Primer Editor app|make -C report2027 live/);
    });
});

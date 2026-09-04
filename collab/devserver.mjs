/**
 * Boot a throwaway `wrangler dev` (Miniflare: real Durable Objects, real
 * websockets, real storage in a temp dir) for a test, and stop it after.
 * Shared by server.test.mjs, client.test.mjs and the editor's Playwright
 * collab spec.
 *
 *   const dev = await startDev({ port: 8788 });
 *   ...
 *   await dev.stop();
 */
import { spawn } from 'node:child_process';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const HERE = dirname(fileURLToPath(import.meta.url));
const sleep = ms => new Promise(r => setTimeout(r, ms));

/**
 * @param {object} o
 * @param {number} o.port
 * @param {Record<string,string>} [o.vars]   extra `--var` bindings (e.g. ALLOWED_ORIGINS)
 * @param {number} [o.timeoutMs]             default 90s
 */
export async function startDev({ port, vars = {}, timeoutMs = 90_000 }) {
  const persistDir = mkdtempSync(join(tmpdir(), 'primer-collab-'));
  // The inspector port defaults to 9229 for every wrangler, and two test
  // files booting their own relay at once (node --test runs files in
  // parallel) collided on it — the second one died with EADDRINUSE and its
  // whole suite was cancelled. Derive it from the serving port instead.
  const args = ['wrangler', 'dev', '--ip', '127.0.0.1', '--port', String(port),
                '--inspector-port', String(port + 1000),
                '--persist-to', persistDir, '--log-level', 'warn'];
  for (const [k, v] of Object.entries(vars)) args.push('--var', `${k}:${v}`);
  const proc = spawn('npx', args, { cwd: HERE, stdio: ['ignore', 'pipe', 'pipe'] });

  const log = [];
  proc.stdout.on('data', d => log.push(String(d)));
  proc.stderr.on('data', d => log.push(String(d)));
  proc.on('exit', c => { if (c) log.push(`\n[wrangler exited ${c}]`); });

  const host = `127.0.0.1:${port}`;
  const deadline = Date.now() + timeoutMs;
  for (;;) {
    if (Date.now() > deadline) {
      proc.kill('SIGKILL');
      throw new Error(`wrangler dev did not come up in ${timeoutMs / 1000}s:\n${log.join('')}`);
    }
    try {
      const r = await fetch(`http://${host}/health`);
      if (r.ok) break;
    } catch { /* not up yet */ }
    await sleep(400);
  }

  return {
    host, port, proc, log,
    async stop() {
      if (!proc.killed) { proc.kill('SIGTERM'); await sleep(500); proc.kill('SIGKILL'); }
      rmSync(persistDir, { recursive: true, force: true });
    },
  };
}

// `node devserver.mjs [port]` — run one by hand and leave it up (Ctrl-C stops
// it), for driving a local editor with ?collab=http://127.0.0.1:<port>.
if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) {
  const port = Number(process.argv[2] || 8787);
  const dev = await startDev({ port, vars: process.env.COLLAB_ALLOWED_ORIGINS
    ? { ALLOWED_ORIGINS: process.env.COLLAB_ALLOWED_ORIGINS } : {} });
  console.log(`primer-collab dev relay on http://${dev.host} (fresh storage; Ctrl-C to stop)`);
  process.on('SIGINT', async () => { await dev.stop(); process.exit(0); });
  await new Promise(() => {});
}

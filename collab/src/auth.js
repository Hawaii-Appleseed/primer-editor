/**
 * Who may open a collaborative session, and how that decision travels to the
 * Durable Object.
 *
 * The rule is the one the editor already enforces for saving: you may edit a
 * project if your GitHub token has push permission on its repository
 * (edit.html's `tokenWhy()`). Nothing new to sign up for, and adding a
 * collaborator on GitHub is the whole onboarding story.
 *
 * The token itself never reaches the websocket URL. A browser POSTs it to
 * /auth over TLS in a request body; the Worker checks GitHub once and returns
 * a short-lived signed TICKET naming the room and the login. The ticket is
 * what rides the websocket query string, so a URL captured in a log or a proxy
 * is worthless a minute later and cannot be replayed against another room.
 *
 * Tickets are stateless (HMAC-SHA256 over a compact JSON payload), so
 * verifying one costs no storage read and works identically in every isolate.
 */

const enc = new TextEncoder();
const dec = new TextDecoder();

/** How long a minted ticket stays usable. Long enough to cover a slow
 *  connection, short enough that a leaked URL is not a credential. */
export const TICKET_TTL_SECONDS = 90;

/* -------------------------------------------------------------- base64url */

function b64urlEncode(bytes) {
  let s = '';
  for (const b of bytes) s += String.fromCharCode(b);
  return btoa(s).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

function b64urlDecode(str) {
  const s = str.replace(/-/g, '+').replace(/_/g, '/');
  const bin = atob(s + '='.repeat((4 - (s.length % 4)) % 4));
  const out = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
  return out;
}

/* ----------------------------------------------------------------- tickets */

async function hmacKey(secret) {
  return crypto.subtle.importKey(
    'raw', enc.encode(secret), { name: 'HMAC', hash: 'SHA-256' }, false, ['sign', 'verify']);
}

/** Sign a payload object into a compact `<payload>.<sig>` string. */
export async function mintTicket(secret, payload) {
  const body = b64urlEncode(enc.encode(JSON.stringify(payload)));
  const key = await hmacKey(secret);
  const sig = new Uint8Array(await crypto.subtle.sign('HMAC', key, enc.encode(body)));
  return `${body}.${b64urlEncode(sig)}`;
}

/**
 * Verify a ticket and return its payload, or null.
 *
 * Checks the signature before anything else, then expiry, then that the ticket
 * was minted for the room actually being joined — an unforgeable ticket for
 * room A must not open room B.
 */
export async function verifyTicket(secret, ticket, room) {
  if (typeof ticket !== 'string' || !ticket.includes('.')) return null;
  const [body, sig] = ticket.split('.', 2);
  let ok = false;
  try {
    const key = await hmacKey(secret);
    ok = await crypto.subtle.verify('HMAC', key, b64urlDecode(sig), enc.encode(body));
  } catch { return null; }
  if (!ok) return null;

  let payload;
  try { payload = JSON.parse(dec.decode(b64urlDecode(body))); }
  catch { return null; }

  if (typeof payload?.exp !== 'number' || payload.exp < Date.now() / 1000) return null;
  if (room !== undefined && payload.room !== room) return null;
  return payload;
}

/* ------------------------------------------------------------- room naming */

/**
 * A room is one project in one repository: `owner~repo~project`.
 *
 * `~` separates because it is unreserved in a URL and cannot appear in a
 * GitHub owner or repository name, so the three parts are unambiguous and the
 * whole thing is a single safe path segment.
 */
export function parseRoom(room) {
  if (typeof room !== 'string') return null;
  const parts = room.split('~');
  if (parts.length !== 3) return null;
  const [owner, repo, project] = parts;
  if (!/^[A-Za-z0-9-]{1,39}$/.test(owner)) return null;
  if (!/^[A-Za-z0-9._-]{1,100}$/.test(repo)) return null;
  if (!/^[A-Za-z0-9._-]{1,100}$/.test(project)) return null;
  return { owner, repo, project, nwo: `${owner}/${repo}` };
}

export function formatRoom(owner, repo, project) {
  return `${owner}~${repo}~${project}`;
}

/* ---------------------------------------------------------------- GitHub */

/**
 * Ask GitHub who this token belongs to and whether it can push to `nwo`.
 *
 * Deliberately the same single call edit.html makes (`GET /repos/{nwo}`, read
 * `permissions.push`) rather than a collaborator-list lookup: it answers the
 * question for tokens of every kind — PAT, fine-grained PAT, GitHub App user
 * token — without needing org-level scopes the editor has never asked for.
 */
export async function checkRepoPermission(token, nwo) {
  const res = await fetch(`https://api.github.com/repos/${nwo}`, {
    headers: {
      authorization: `Bearer ${token}`,
      accept: 'application/vnd.github+json',
      'user-agent': 'primer-collab',
    },
  });

  if (res.status === 401) return { ok: false, reason: 'token rejected by GitHub' };
  if (res.status === 403) return { ok: false, reason: 'token lacks access (or is rate limited)' };
  if (res.status === 404) return { ok: false, reason: 'repository not found for this token' };
  if (!res.ok) return { ok: false, reason: `GitHub returned ${res.status}` };

  const repo = await res.json();
  if (!repo?.permissions?.push) {
    return { ok: false, reason: 'token has read access but not push' };
  }

  // The login is used for presence (who is in the room) and for attributing
  // the commit a Save makes. A failure here is not fatal to editing.
  let login = null;
  try {
    const me = await fetch('https://api.github.com/user', {
      headers: {
        authorization: `Bearer ${token}`,
        accept: 'application/vnd.github+json',
        'user-agent': 'primer-collab',
      },
    });
    if (me.ok) login = (await me.json())?.login ?? null;
  } catch { /* presence degrades to anonymous */ }

  return { ok: true, login, defaultBranch: repo.default_branch ?? 'main' };
}

/* ------------------------------------------------------------------ CORS */

export function allowedOrigins(env) {
  return String(env.ALLOWED_ORIGINS || '')
    .split(',').map(s => s.trim()).filter(Boolean);
}

export function allowedRepos(env) {
  return String(env.ALLOWED_REPOS || '')
    .split(',').map(s => s.trim().toLowerCase()).filter(Boolean);
}

export function corsHeaders(env, request) {
  const origin = request.headers.get('origin');
  if (!origin || !allowedOrigins(env).includes(origin)) return null;
  return {
    'access-control-allow-origin': origin,
    'access-control-allow-methods': 'POST, OPTIONS',
    'access-control-allow-headers': 'content-type',
    'access-control-max-age': '86400',
    vary: 'origin',
  };
}

/**
 * The signing secret. `wrangler dev` has no secrets bound, so local
 * development falls back to a fixed value — which is safe precisely because
 * it is well known: a ticket signed with it is worthless against a deployed
 * Worker, which always has a real COLLAB_SECRET.
 */
export function signingSecret(env) {
  return env.COLLAB_SECRET || 'dev-only-insecure-secret';
}

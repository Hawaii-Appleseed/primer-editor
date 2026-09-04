/**
 * primer-collab — the Worker in front of the rooms.
 *
 * Three routes:
 *
 *   POST /auth                      exchange a GitHub token for a room ticket
 *   GET  /parties/primer-room/:room the collaborative websocket
 *   GET  /health                    liveness, no auth
 *
 * The Worker's whole job is to decide who may open a room. Once a socket is
 * accepted, everything else happens in the Durable Object (src/room.js).
 */
import { routePartykitRequest } from 'partyserver';
import {
  mintTicket, verifyTicket, parseRoom, checkRepoPermission,
  corsHeaders, allowedRepos, signingSecret, TICKET_TTL_SECONDS,
} from './auth.js';

export { PrimerRoom } from './room.js';

const json = (body, init = {}, extra = null) => new Response(
  JSON.stringify(body),
  { ...init, headers: { 'content-type': 'application/json', ...(extra || {}), ...(init.headers || {}) } });

export default {
  async fetch(request, env, ctx) {
    const url = new URL(request.url);
    const cors = corsHeaders(env, request);

    if (request.method === 'OPTIONS') {
      // Only a browser we allow gets a usable preflight; anything else is told
      // nothing at all rather than being handed a hint about what exists.
      return cors ? new Response(null, { status: 204, headers: cors })
                  : new Response(null, { status: 403 });
    }

    if (url.pathname === '/health') {
      return json({ ok: true, service: 'primer-collab' }, {}, cors);
    }

    if (url.pathname === '/auth') {
      if (request.method !== 'POST') return json({ error: 'POST required' }, { status: 405 }, cors);
      return handleAuth(request, env, cors);
    }

    // Everything else is a room. onBeforeConnect runs here, in the Worker,
    // before any Durable Object is touched — an unauthenticated attempt costs
    // no DO time at all.
    const routed = await routePartykitRequest(request, env, {
      onBeforeConnect: (req) => gateConnection(req, env),
    });
    if (routed) return routed;

    return json({ error: 'not found' }, { status: 404 }, cors);
  },
};

/**
 * POST /auth  {room, token}  ->  {ticket, exp, login}
 *
 * The only place a GitHub token is ever seen, and it is never stored, logged
 * or forwarded to the Durable Object.
 */
async function handleAuth(request, env, cors) {
  if (!cors) {
    // No Origin, or one not on the list. A ticket handed to an unknown page is
    // exactly the thing the allowlist exists to prevent.
    return json({ error: 'origin not allowed' }, { status: 403 });
  }

  let body;
  try { body = await request.json(); }
  catch { return json({ error: 'expected a JSON body' }, { status: 400 }, cors); }

  const room = parseRoom(body?.room);
  if (!room) {
    return json({ error: 'room must be "owner~repo~project"' }, { status: 400 }, cors);
  }

  const allowed = allowedRepos(env);
  if (allowed.length && !allowed.includes(room.nwo.toLowerCase())) {
    // Without this, push access to any repository at all would mint a ticket
    // for a room named after someone else's.
    return json({ error: `repository ${room.nwo} is not served here` }, { status: 403 }, cors);
  }

  const token = typeof body?.token === 'string' ? body.token.trim() : '';
  if (!token) return json({ error: 'a GitHub token is required' }, { status: 400 }, cors);

  const verdict = await checkRepoPermission(token, room.nwo);
  if (!verdict.ok) {
    return json({ error: verdict.reason, repo: room.nwo }, { status: 403 }, cors);
  }

  const exp = Math.floor(Date.now() / 1000) + TICKET_TTL_SECONDS;
  const ticket = await mintTicket(signingSecret(env), {
    room: body.room,
    login: verdict.login,
    ro: false,
    exp,
  });

  return json({ ticket, exp, login: verdict.login, repo: room.nwo }, {}, cors);
}

/**
 * The websocket gate. Returns a Response to refuse, or a Request carrying the
 * verified identity to allow.
 *
 * The ticket is bound to its room, so a valid ticket for one project cannot
 * open another — see verifyTicket.
 */
async function gateConnection(req, env) {
  const url = new URL(req.url);
  const roomName = url.pathname.split('/').filter(Boolean).pop();

  if (!parseRoom(roomName)) {
    return new Response('bad room name', { status: 400 });
  }

  const ticket = url.searchParams.get('ticket');
  const payload = await verifyTicket(signingSecret(env), ticket, roomName);
  if (!payload) {
    return new Response('a valid ticket is required — POST /auth first', { status: 401 });
  }

  // Hand the verdict to the Durable Object as headers. A received Request has
  // immutable headers, so this has to be a new one.
  const headers = new Headers(req.headers);
  headers.set('x-collab-login', payload.login ?? '');
  headers.set('x-collab-ro', payload.ro ? '1' : '0');
  return new Request(req, { headers });
}

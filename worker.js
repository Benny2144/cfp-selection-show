import { createRemoteJWKSet, jwtVerify } from 'jose';

const MEDIA_PREFIX = '/media/';
const API_PREFIX = '/api/';
const ALLOWED_MEDIA = new Set(['committee.mp4', 'intro-video.mp4', 'selection-night-open.mp4']);
const GOOGLE_JWKS = createRemoteJWKSet(
  new URL('https://www.googleapis.com/oauth2/v3/certs'),
  { cooldownDuration: 30_000, cacheMaxAge: 3_600_000 },
);

const SESSION_COOKIE = '__Host-cfp_session';
const SESSION_TTL_MS = 30 * 24 * 60 * 60 * 1000;
const SESSION_TOUCH_MS = 6 * 60 * 60 * 1000;
const SECURITY_EVENT_TTL_MS = 90 * 24 * 60 * 60 * 1000;
const MAX_JSON_BYTES = 512 * 1024;
const MAX_LOGO_BYTES = 1024 * 1024;
const MAX_EVENT_BYTES = 96 * 1024;
const MAX_EVENTS_PER_USER = 25;
const MAX_LEAGUE_BYTES = 512 * 1024;
const MAX_OWNED_LEAGUES = 8;
const MAX_LEAGUE_MEMBERSHIPS = 24;
const MAX_LEAGUE_MEMBERS = 32;
const LOGO_TYPES = new Set(['image/png', 'image/jpeg', 'image/webp']);
const TEAM_ID_RE = /^[a-z0-9][a-z0-9-]{0,63}$/;
const EVENT_CODE_RE = /^[A-HJ-NP-Z2-9]{10}$/;
const EVENT_ID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const LEAGUE_CODE_RE = /^[A-HJ-NP-Z2-9]{8}$/;

function json(body, status = 200, headers = {}) {
  return new Response(JSON.stringify(body), {
    status,
    headers: {
      'content-type': 'application/json; charset=utf-8',
      'cache-control': 'no-store',
      ...headers,
    },
  });
}

function methodNotAllowed(allow) {
  return json({ error: 'Method not allowed' }, 405, { allow });
}

function log(level, fields) {
  const line = JSON.stringify({ service: 'cfp-dynasty-studio', ...fields });
  if (level === 'error') console.error(line);
  else if (level === 'warn') console.warn(line);
  else console.log(line);
}

function copyResponse(response, headers) {
  return new Response(response.body, {
    status: response.status,
    statusText: response.statusText,
    headers,
  });
}

function secureResponse(response, requestId, api = false) {
  const headers = new Headers(response.headers);
  headers.set('x-content-type-options', 'nosniff');
  headers.set('referrer-policy', 'strict-origin-when-cross-origin');
  headers.set('x-frame-options', 'DENY');
  headers.set('cross-origin-opener-policy', 'same-origin-allow-popups');
  headers.set('permissions-policy', 'camera=(), microphone=(), geolocation=(), payment=(), usb=()');
  headers.set('strict-transport-security', 'max-age=31536000');
  headers.set('x-request-id', requestId);
  if (api) headers.set('cache-control', 'no-store');

  const contentType = headers.get('content-type') || '';
  if (contentType.includes('text/html')) {
    headers.set('content-security-policy', [
      "default-src 'self'",
      "script-src 'self' https://accounts.google.com/gsi/client",
      "style-src 'self' 'unsafe-inline' https://accounts.google.com",
      "img-src 'self' data: blob: https://lh3.googleusercontent.com",
      "media-src 'self' blob:",
      "connect-src 'self' https://accounts.google.com",
      "frame-src https://accounts.google.com",
      "font-src 'self' data:",
      "worker-src 'self' blob:",
      "object-src 'none'",
      "base-uri 'self'",
      "form-action 'self' https://accounts.google.com",
      "frame-ancestors 'none'",
    ].join('; '));
  }
  return copyResponse(response, headers);
}

function parseCookies(request) {
  const out = {};
  for (const part of (request.headers.get('cookie') || '').split(';')) {
    const at = part.indexOf('=');
    if (at < 1) continue;
    out[part.slice(0, at).trim()] = part.slice(at + 1).trim();
  }
  return out;
}

function base64url(bytes) {
  let binary = '';
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/g, '');
}

function sessionToken() {
  const bytes = new Uint8Array(32);
  crypto.getRandomValues(bytes);
  return base64url(bytes);
}

async function sha256(value) {
  const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(value));
  return base64url(new Uint8Array(digest));
}

function sessionCookie(token) {
  return `${SESSION_COOKIE}=${token}; Path=/; HttpOnly; Secure; SameSite=Lax; ` +
    `Max-Age=${Math.floor(SESSION_TTL_MS / 1000)}`;
}

function clearSessionCookie() {
  return `${SESSION_COOKIE}=; Path=/; HttpOnly; Secure; SameSite=Lax; Max-Age=0`;
}

function sameOriginMutation(request) {
  const origin = request.headers.get('origin');
  const expected = new URL(request.url).origin;
  return origin === expected && request.headers.get('x-cfp-request') === '1';
}

async function readBounded(request, maximum) {
  const declared = Number(request.headers.get('content-length') || 0);
  if (declared > maximum) throw new Response('Payload too large', { status: 413 });
  if (!request.body) return new Uint8Array();

  const reader = request.body.getReader();
  const chunks = [];
  let size = 0;
  while (true) {
    const { value, done } = await reader.read();
    if (done) break;
    size += value.byteLength;
    if (size > maximum) {
      await reader.cancel();
      throw new Response('Payload too large', { status: 413 });
    }
    chunks.push(value);
  }
  const bytes = new Uint8Array(size);
  let offset = 0;
  for (const chunk of chunks) {
    bytes.set(chunk, offset);
    offset += chunk.byteLength;
  }
  return bytes;
}

async function readJson(request, maximum = MAX_JSON_BYTES) {
  const bytes = await readBounded(request, maximum);
  try {
    return JSON.parse(new TextDecoder().decode(bytes));
  } catch {
    throw new Response('Invalid JSON', { status: 400 });
  }
}

function publicUser(row) {
  return {
    id: row.id,
    email: row.email,
    name: row.display_name || '',
    picture: row.avatar_url || '',
  };
}

async function sessionFor(request, env, ctx) {
  const raw = parseCookies(request)[SESSION_COOKIE];
  if (!raw || raw.length > 128) return null;
  const tokenHash = await sha256(raw);
  const now = Date.now();
  const row = await env.DB.prepare(`
    SELECT s.token_hash, s.last_seen_at, u.id, u.email, u.display_name, u.avatar_url
    FROM sessions s
    JOIN users u ON u.id = s.user_id
    WHERE s.token_hash = ? AND s.expires_at > ?
  `).bind(tokenHash, now).first();
  if (!row) return null;

  if (Number(row.last_seen_at) < now - SESSION_TOUCH_MS) {
    ctx.waitUntil(env.DB.prepare(`
      UPDATE sessions SET last_seen_at = ?, expires_at = ? WHERE token_hash = ?
    `).bind(now, now + SESSION_TTL_MS, tokenHash).run());
  }
  return { tokenHash, user: publicUser(row) };
}

function validSnapshot(snapshot) {
  if (!snapshot || typeof snapshot !== 'object' || Array.isArray(snapshot)) return false;
  if (snapshot.schema !== 1 || !snapshot.state || typeof snapshot.state !== 'object') return false;
  if (!Array.isArray(snapshot.state.seeds) || snapshot.state.seeds.length !== 12) return false;
  if (!Array.isArray(snapshot.state.out) || snapshot.state.out.length !== 4) return false;
  if (snapshot.customTeams && (!Array.isArray(snapshot.customTeams) || snapshot.customTeams.length > 100)) return false;
  if (snapshot.history && (!Array.isArray(snapshot.history) || snapshot.history.length > 40)) return false;
  if (snapshot.entries && (!Array.isArray(snapshot.entries) || snapshot.entries.length > 60)) return false;
  if (snapshot.overrides && (typeof snapshot.overrides !== 'object' || Array.isArray(snapshot.overrides))) return false;
  return true;
}

function boundedText(value, maximum, allowEmpty = true) {
  return typeof value === 'string' && value.length <= maximum && (allowEmpty || value.trim().length > 0);
}

function validPublishedPayload(payload) {
  if (!payload || typeof payload !== 'object' || Array.isArray(payload)) return false;
  if (!boundedText(payload.l, 120, false) || !boundedText(payload.y, 24, false) ||
      !boundedText(payload.t, 120, false) || !boundedText(payload.s, 120) ||
      !boundedText(payload.k || '', 500) || !boundedText(payload.ol || '', 80)) return false;
  if (!['asc', 'desc'].includes(payload.o) || !['full', 'short', 'off'].includes(payload.c) ||
      !['max', 'normal', 'calm'].includes(payload.f) || !['on', 'off'].includes(payload.n) ||
      !['lead', 'both', 'off'].includes(payload.st) || !['on', 'still', 'off'].includes(payload.rf)) return false;
  if (!(payload.p === 'manual' || [7000, 10000, 14000, 20000].includes(payload.p))) return false;
  if (![0, 2, 4].includes(payload.oc)) return false;
  for (const key of ['mv', 'vv', 'cv', 'fv', 'bv']) {
    if (!Number.isFinite(payload[key]) || payload[key] < 0 || payload[key] > 250) return false;
  }
  if (!Number.isFinite(payload.pm) || payload.pm < 0) return false;
  if (!Array.isArray(payload.d) || payload.d.length !== 12 ||
      !Array.isArray(payload.u) || payload.u.length > 4) return false;
  const validTeam = (row, seed = false) => row === null || (
    Array.isArray(row) && (seed ? row.length === 3 : row.length === 2) &&
    TEAM_ID_RE.test(String(row[0] || '')) && boundedText(row[1] || '', 24) &&
    (!seed || row[2] === 0 || row[2] === 1)
  );
  if (!payload.d.every(row => validTeam(row, true)) || !payload.u.every(row => validTeam(row))) return false;
  if (payload.g != null && !boundedText(payload.g, 1024)) return false;
  if (payload.rs != null) {
    if (typeof payload.rs !== 'object' || Array.isArray(payload.rs) || Object.keys(payload.rs).length > 20) return false;
    for (const [gameId, score] of Object.entries(payload.rs)) {
      if (!/^[a-z0-9-]{1,32}$/i.test(gameId) || !score || typeof score !== 'object' || Array.isArray(score)) return false;
      if (!['a', 'b'].every(side => score[side] == null || /^[0-9]{0,3}$/.test(String(score[side])))) return false;
    }
  }
  if (payload.v != null) {
    if (typeof payload.v !== 'object' || Array.isArray(payload.v) || Object.keys(payload.v).length > 16) return false;
    for (const [id, value] of Object.entries(payload.v)) {
      if (!TEAM_ID_RE.test(id) || !value || typeof value !== 'object' || Array.isArray(value)) return false;
      if (!boundedText(value.a || '', 8) || !boundedText(value.sc || '', 100) ||
          !boundedText(value.m || '', 100) || !boundedText(value.c || '', 60) ||
          !/^#[0-9a-f]{3,8}$/i.test(value.p || '') || !/^#[0-9a-f]{3,8}$/i.test(value.s || '')) return false;
    }
  }
  return true;
}

function randomCode(length) {
  const alphabet = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  const bytes = new Uint8Array(length);
  crypto.getRandomValues(bytes);
  return [...bytes].map(byte => alphabet[byte % alphabet.length]).join('');
}

const eventCode = () => randomCode(10);
const leagueCode = () => randomCode(8);

function publicEvent(row, env, includePayload = false) {
  const event = {
    id: row.id,
    code: row.code,
    url: `${env.APP_ORIGIN}/watch/${row.code}`,
    title: row.title,
    league: row.league_name,
    season: row.season,
    version: Number(row.version),
    views: Number(row.view_count || 0),
    createdAt: Number(row.created_at),
    updatedAt: Number(row.updated_at),
    lastViewedAt: row.last_viewed_at == null ? null : Number(row.last_viewed_at),
  };
  if (includePayload) event.payload = JSON.parse(row.payload_json);
  return event;
}

async function accountData(env, userId) {
  const row = await env.DB.prepare(`
    SELECT snapshot_json, version, updated_at FROM account_data WHERE user_id = ?
  `).bind(userId).first();
  if (!row) return null;
  try {
    return {
      snapshot: JSON.parse(row.snapshot_json),
      version: Number(row.version),
      updatedAt: Number(row.updated_at),
    };
  } catch {
    log('error', { event: 'corrupt_account_snapshot', userId });
    return null;
  }
}

async function verifyGoogleCredential(credential, env) {
  if (typeof credential !== 'string' || credential.length < 100 || credential.length > 8192) {
    throw new Error('Invalid Google credential');
  }
  const { payload } = await jwtVerify(credential, GOOGLE_JWKS, {
    algorithms: ['RS256'],
    audience: env.GOOGLE_CLIENT_ID,
    issuer: ['https://accounts.google.com', 'accounts.google.com'],
  });
  if (!payload.sub || !payload.email || payload.email_verified !== true) {
    throw new Error('Google account email is not verified');
  }
  return {
    sub: String(payload.sub),
    email: String(payload.email).slice(0, 254),
    name: String(payload.name || '').slice(0, 120),
    picture: String(payload.picture || '').slice(0, 1024),
  };
}

async function googleLogin(request, env, requestId) {
  if (request.method !== 'POST') return methodNotAllowed('POST');
  if (!sameOriginMutation(request)) return json({ error: 'Request origin rejected' }, 403);

  const body = await readJson(request, 16 * 1024);
  let identity;
  try {
    identity = await verifyGoogleCredential(body.credential, env);
  } catch (error) {
    log('warn', { event: 'google_login_rejected', requestId, reason: error instanceof Error ? error.message : 'unknown' });
    return json({ error: 'Google sign-in could not be verified' }, 401);
  }

  const now = Date.now();
  const proposedId = crypto.randomUUID();
  const row = await env.DB.prepare(`
    INSERT INTO users (
      id, google_sub, email, email_normalized, display_name, avatar_url,
      created_at, updated_at, last_login_at
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
    ON CONFLICT(google_sub) DO UPDATE SET
      email = excluded.email,
      email_normalized = excluded.email_normalized,
      display_name = excluded.display_name,
      avatar_url = excluded.avatar_url,
      updated_at = excluded.updated_at,
      last_login_at = excluded.last_login_at
    RETURNING id, email, display_name, avatar_url
  `).bind(
    proposedId,
    identity.sub,
    identity.email,
    identity.email.toLowerCase(),
    identity.name,
    identity.picture,
    now,
    now,
    now,
  ).first();

  if (!row) return json({ error: 'Account could not be created' }, 500);
  const token = sessionToken();
  const tokenHash = await sha256(token);
  await env.DB.batch([
    env.DB.prepare(`
      INSERT INTO sessions (token_hash, user_id, created_at, last_seen_at, expires_at)
      VALUES (?, ?, ?, ?, ?)
    `).bind(tokenHash, row.id, now, now, now + SESSION_TTL_MS),
    env.DB.prepare('DELETE FROM sessions WHERE expires_at <= ?').bind(now),
    env.DB.prepare(`
      DELETE FROM sessions WHERE user_id = ? AND token_hash NOT IN (
        SELECT token_hash FROM sessions WHERE user_id = ? ORDER BY created_at DESC LIMIT 10
      )
    `).bind(row.id, row.id),
    env.DB.prepare(`
      INSERT INTO security_events (id, user_id, event_type, created_at) VALUES (?, ?, 'login', ?)
    `).bind(crypto.randomUUID(), row.id, now),
  ]);

  const data = await accountData(env, row.id);
  log('info', { event: 'login_succeeded', requestId, userId: row.id });
  return json({ authenticated: true, user: publicUser(row), data }, 200, {
    'set-cookie': sessionCookie(token),
  });
}

async function bootstrap(request, env, ctx) {
  if (request.method !== 'GET') return methodNotAllowed('GET');
  const session = await sessionFor(request, env, ctx);
  if (!session) {
    return json({
      authenticated: false,
      googleClientId: env.GOOGLE_CLIENT_ID || '',
      cloudAvailable: !!env.DB,
    });
  }
  return json({
    authenticated: true,
    googleClientId: env.GOOGLE_CLIENT_ID || '',
    cloudAvailable: true,
    user: session.user,
    data: await accountData(env, session.user.id),
  });
}

async function saveAccountData(request, env, ctx) {
  if (request.method !== 'PUT') return methodNotAllowed('PUT');
  if (!sameOriginMutation(request)) return json({ error: 'Request origin rejected' }, 403);
  const session = await sessionFor(request, env, ctx);
  if (!session) return json({ error: 'Sign in required' }, 401);

  const body = await readJson(request);
  if (!validSnapshot(body.snapshot)) return json({ error: 'Invalid account data' }, 400);
  const snapshotJson = JSON.stringify(body.snapshot);
  if (new TextEncoder().encode(snapshotJson).byteLength > MAX_JSON_BYTES) {
    return json({ error: 'Account data is too large' }, 413);
  }
  const baseVersion = Number.isInteger(body.baseVersion) && body.baseVersion >= 0
    ? body.baseVersion : -1;
  const now = Date.now();
  let saved = false;
  let version = 0;

  if (body.force === true) {
    await env.DB.prepare(`
      INSERT INTO account_data (user_id, snapshot_json, schema_version, version, updated_at)
      VALUES (?, ?, 1, 1, ?)
      ON CONFLICT(user_id) DO UPDATE SET
        snapshot_json = excluded.snapshot_json,
        schema_version = 1,
        version = account_data.version + 1,
        updated_at = excluded.updated_at
    `).bind(session.user.id, snapshotJson, now).run();
    saved = true;
  } else if (baseVersion === 0) {
    const result = await env.DB.prepare(`
      INSERT OR IGNORE INTO account_data (user_id, snapshot_json, schema_version, version, updated_at)
      VALUES (?, ?, 1, 1, ?)
    `).bind(session.user.id, snapshotJson, now).run();
    saved = Number(result.meta.changes || 0) === 1;
  } else if (baseVersion > 0) {
    const result = await env.DB.prepare(`
      UPDATE account_data
      SET snapshot_json = ?, schema_version = 1, version = version + 1, updated_at = ?
      WHERE user_id = ? AND version = ?
    `).bind(snapshotJson, now, session.user.id, baseVersion).run();
    saved = Number(result.meta.changes || 0) === 1;
  }

  const latest = await accountData(env, session.user.id);
  if (!saved) return json({ error: 'Cloud data changed on another device', conflict: true, data: latest }, 409);
  version = latest ? latest.version : 1;
  return json({ saved: true, version, updatedAt: latest ? latest.updatedAt : now });
}

async function logout(request, env, ctx) {
  if (request.method !== 'POST') return methodNotAllowed('POST');
  if (!sameOriginMutation(request)) return json({ error: 'Request origin rejected' }, 403);
  const session = await sessionFor(request, env, ctx);
  if (session) {
    const now = Date.now();
    await env.DB.batch([
      env.DB.prepare('DELETE FROM sessions WHERE token_hash = ?').bind(session.tokenHash),
      env.DB.prepare(`
        INSERT INTO security_events (id, user_id, event_type, created_at) VALUES (?, ?, 'logout', ?)
      `).bind(crypto.randomUUID(), session.user.id, now),
    ]);
  }
  return json({ signedOut: true }, 200, { 'set-cookie': clearSessionCookie() });
}

function logoId(url) {
  const raw = decodeURIComponent(url.pathname.slice('/api/logos/'.length));
  return TEAM_ID_RE.test(raw) ? raw : null;
}

async function listLogos(request, env, ctx) {
  if (request.method !== 'GET') return methodNotAllowed('GET');
  const session = await sessionFor(request, env, ctx);
  if (!session) return json({ error: 'Sign in required' }, 401);
  const result = await env.DB.prepare(`
    SELECT team_id, content_type, byte_size, updated_at FROM user_logos
    WHERE user_id = ? ORDER BY team_id
  `).bind(session.user.id).all();
  return json({ logos: result.results || [] });
}

async function userLogo(request, env, ctx, url) {
  const session = await sessionFor(request, env, ctx);
  if (!session) return json({ error: 'Sign in required' }, 401);
  const teamId = logoId(url);
  if (!teamId) return json({ error: 'Invalid team id' }, 400);

  if (request.method === 'GET' || request.method === 'HEAD') {
    const row = await env.DB.prepare(`
      SELECT object_key, content_type, updated_at FROM user_logos
      WHERE user_id = ? AND team_id = ?
    `).bind(session.user.id, teamId).first();
    if (!row) return new Response('Not found', { status: 404 });
    const object = request.method === 'HEAD'
      ? await env.MEDIA.head(row.object_key)
      : await env.MEDIA.get(row.object_key);
    if (!object) return new Response('Not found', { status: 404 });
    const headers = new Headers({
      'content-type': row.content_type,
      'cache-control': 'private, max-age=3600',
      etag: object.httpEtag,
    });
    if ('size' in object) headers.set('content-length', String(object.size));
    return new Response(request.method === 'HEAD' ? null : object.body, { headers });
  }

  if (!sameOriginMutation(request)) return json({ error: 'Request origin rejected' }, 403);
  if (request.method === 'PUT') {
    const contentType = (request.headers.get('content-type') || '').split(';')[0].toLowerCase();
    if (!LOGO_TYPES.has(contentType)) {
      return json({ error: 'Use a PNG, JPEG, or WebP logo' }, 415);
    }
    const bytes = await readBounded(request, MAX_LOGO_BYTES);
    if (!bytes.byteLength) return json({ error: 'Logo file is empty' }, 400);
    const objectKey = `accounts/${session.user.id}/logos/${teamId}`;
    await env.MEDIA.put(objectKey, bytes, {
      httpMetadata: { contentType, cacheControl: 'private, max-age=3600' },
    });
    try {
      await env.DB.prepare(`
        INSERT INTO user_logos (user_id, team_id, object_key, content_type, byte_size, updated_at)
        VALUES (?, ?, ?, ?, ?, ?)
        ON CONFLICT(user_id, team_id) DO UPDATE SET
          object_key = excluded.object_key,
          content_type = excluded.content_type,
          byte_size = excluded.byte_size,
          updated_at = excluded.updated_at
      `).bind(session.user.id, teamId, objectKey, contentType, bytes.byteLength, Date.now()).run();
    } catch (error) {
      await env.MEDIA.delete(objectKey);
      throw error;
    }
    return json({ saved: true, teamId });
  }

  if (request.method === 'DELETE') {
    const row = await env.DB.prepare(`
      SELECT object_key FROM user_logos WHERE user_id = ? AND team_id = ?
    `).bind(session.user.id, teamId).first();
    await env.DB.prepare(`
      DELETE FROM user_logos WHERE user_id = ? AND team_id = ?
    `).bind(session.user.id, teamId).run();
    if (row) await env.MEDIA.delete(row.object_key);
    return json({ deleted: true, teamId });
  }
  return methodNotAllowed('GET, HEAD, PUT, DELETE');
}

async function listEvents(request, env, ctx) {
  if (request.method !== 'GET') return methodNotAllowed('GET');
  const session = await sessionFor(request, env, ctx);
  if (!session) return json({ error: 'Sign in required' }, 401);
  const rows = await env.DB.prepare(`
    SELECT id, code, title, league_name, season, version, view_count,
           created_at, updated_at, last_viewed_at
    FROM published_events WHERE owner_user_id = ?
    ORDER BY updated_at DESC LIMIT ?
  `).bind(session.user.id, MAX_EVENTS_PER_USER).all();
  return json({ events: (rows.results || []).map(row => publicEvent(row, env)) });
}

async function publishEvent(request, env, ctx) {
  if (request.method !== 'POST') return methodNotAllowed('POST');
  if (!sameOriginMutation(request)) return json({ error: 'Request origin rejected' }, 403);
  const session = await sessionFor(request, env, ctx);
  if (!session) return json({ error: 'Sign in required' }, 401);
  const body = await readJson(request, MAX_EVENT_BYTES);
  if (!validPublishedPayload(body.payload)) return json({ error: 'Invalid Selection Night event' }, 400);
  if (body.payload.d.some(seed => !seed)) {
    return json({ error: 'Fill all 12 seeds before publishing' }, 400);
  }
  const payloadJson = JSON.stringify(body.payload);
  if (new TextEncoder().encode(payloadJson).byteLength > MAX_EVENT_BYTES) {
    return json({ error: 'Published event is too large' }, 413);
  }
  const now = Date.now();
  let row;
  let activity = 'published';
  const requestedId = typeof body.eventId === 'string' && EVENT_ID_RE.test(body.eventId)
    ? body.eventId : null;

  if (requestedId) {
    row = await env.DB.prepare(`
      UPDATE published_events SET
        title = ?, league_name = ?, season = ?, payload_json = ?,
        version = version + 1, updated_at = ?
      WHERE id = ? AND owner_user_id = ?
      RETURNING id, code, title, league_name, season, version, view_count,
                created_at, updated_at, last_viewed_at
    `).bind(
      String(body.payload.t).trim(), String(body.payload.l).trim(), String(body.payload.y).trim(),
      payloadJson, now, requestedId, session.user.id,
    ).first();
    if (!row) return json({ error: 'Published event was not found' }, 404);
    activity = 'updated';
  } else {
    const count = await env.DB.prepare(`
      SELECT COUNT(*) AS total FROM published_events WHERE owner_user_id = ?
    `).bind(session.user.id).first();
    if (Number(count?.total || 0) >= MAX_EVENTS_PER_USER) {
      return json({ error: `Keep up to ${MAX_EVENTS_PER_USER} published events. Revoke an old one first.` }, 409);
    }
    const id = crypto.randomUUID();
    let inserted = false;
    for (let attempt = 0; attempt < 5 && !inserted; attempt++) {
      try {
        row = await env.DB.prepare(`
          INSERT INTO published_events (
            id, owner_user_id, code, title, league_name, season, payload_json,
            version, view_count, created_at, updated_at
          ) VALUES (?, ?, ?, ?, ?, ?, ?, 1, 0, ?, ?)
          RETURNING id, code, title, league_name, season, version, view_count,
                    created_at, updated_at, last_viewed_at
        `).bind(
          id, session.user.id, eventCode(), String(body.payload.t).trim(),
          String(body.payload.l).trim(), String(body.payload.y).trim(), payloadJson, now, now,
        ).first();
        inserted = !!row;
      } catch (error) {
        if (!/unique/i.test(String(error))) throw error;
      }
    }
    if (!inserted || !row) return json({ error: 'Could not create a unique event link' }, 503);
  }

  await env.DB.batch([
    env.DB.prepare(`
      INSERT INTO event_activity (id, event_id, actor_user_id, event_type, metadata_json, created_at)
      VALUES (?, ?, ?, ?, ?, ?)
    `).bind(
      crypto.randomUUID(), row.id, session.user.id, activity,
      JSON.stringify({ version: Number(row.version) }), now,
    ),
    env.DB.prepare(`
      INSERT INTO security_events (id, user_id, event_type, created_at) VALUES (?, ?, ?, ?)
    `).bind(crypto.randomUUID(), session.user.id, `event_${activity}`, now),
  ]);
  log('info', { event: `event_${activity}`, userId: session.user.id, eventId: row.id, code: row.code });
  return json({ event: publicEvent(row, env) }, activity === 'published' ? 201 : 200);
}

async function eventActivity(request, env, ctx, eventId) {
  if (request.method !== 'GET') return methodNotAllowed('GET');
  if (!EVENT_ID_RE.test(eventId)) return json({ error: 'Event not found' }, 404);
  const session = await sessionFor(request, env, ctx);
  if (!session) return json({ error: 'Sign in required' }, 401);
  const owner = await env.DB.prepare(`
    SELECT id FROM published_events WHERE id = ? AND owner_user_id = ?
  `).bind(eventId, session.user.id).first();
  if (!owner) return json({ error: 'Event not found' }, 404);
  const rows = await env.DB.prepare(`
    SELECT event_type, metadata_json, created_at FROM event_activity
    WHERE event_id = ? ORDER BY created_at DESC LIMIT 20
  `).bind(eventId).all();
  return json({ activity: (rows.results || []).map(row => ({
    type: row.event_type,
    at: Number(row.created_at),
    metadata: JSON.parse(row.metadata_json || '{}'),
  })) });
}

async function eventByCode(request, env, ctx, code) {
  if (request.method !== 'GET') return methodNotAllowed('GET');
  if (!EVENT_CODE_RE.test(code)) return json({ error: 'Event not found' }, 404);
  const row = await env.DB.prepare(`
    SELECT id, code, title, league_name, season, payload_json, version, view_count,
           created_at, updated_at, last_viewed_at
    FROM published_events WHERE code = ?
  `).bind(code).first();
  if (!row) return json({ error: 'This Selection Night event is no longer available' }, 404);
  const now = Date.now();
  const viewCookie = `cfp_view_${code.toLowerCase()}`;
  const firstView = parseCookies(request)[viewCookie] !== '1';
  if (firstView) {
    row.view_count = Number(row.view_count || 0) + 1;
    row.last_viewed_at = now;
    ctx.waitUntil(env.DB.prepare(`
      UPDATE published_events SET view_count = view_count + 1, last_viewed_at = ? WHERE id = ?
    `).bind(now, row.id).run());
  }
  return json({ event: publicEvent(row, env, true) }, 200, firstView ? {
    'set-cookie': `${viewCookie}=1; Path=/; HttpOnly; Secure; SameSite=Lax; Max-Age=43200`,
  } : {});
}

async function deleteEvent(request, env, ctx, eventId) {
  if (request.method !== 'DELETE') return methodNotAllowed('DELETE');
  if (!sameOriginMutation(request)) return json({ error: 'Request origin rejected' }, 403);
  if (!EVENT_ID_RE.test(eventId)) return json({ error: 'Event not found' }, 404);
  const session = await sessionFor(request, env, ctx);
  if (!session) return json({ error: 'Sign in required' }, 401);
  const deleted = await env.DB.prepare(`
    DELETE FROM published_events WHERE id = ? AND owner_user_id = ?
    RETURNING id
  `).bind(eventId, session.user.id).first();
  if (!deleted) return json({ error: 'Event not found' }, 404);
  await env.DB.prepare(`
    INSERT INTO security_events (id, user_id, event_type, created_at) VALUES (?, ?, 'event_revoked', ?)
  `).bind(crypto.randomUUID(), session.user.id, Date.now()).run();
  log('info', { event: 'event_revoked', userId: session.user.id, eventId });
  return json({ deleted: true });
}

function leagueSummary(row, env) {
  return {
    id: row.id,
    code: row.code,
    inviteUrl: `${env.APP_ORIGIN}/join/${row.code}`,
    name: row.name,
    season: row.season,
    role: row.membership_role,
    members: Number(row.member_count || 0),
    version: Number(row.workspace_version || 1),
    createdAt: Number(row.created_at),
    updatedAt: Number(row.updated_at),
    updatedBy: row.updated_by_name || '',
  };
}

async function leagueDetails(env, leagueId, userId) {
  const row = await env.DB.prepare(`
    SELECT l.id, l.code, l.name, l.season, l.workspace_json, l.workspace_version,
           l.owner_user_id, l.created_at, l.updated_at, lm.role AS membership_role,
           updater.display_name AS updated_by_name,
           (SELECT COUNT(*) FROM league_members all_members WHERE all_members.league_id = l.id) AS member_count
    FROM league_rooms l
    JOIN league_members lm ON lm.league_id = l.id AND lm.user_id = ?
    LEFT JOIN users updater ON updater.id = l.updated_by_user_id
    WHERE l.id = ?
  `).bind(userId, leagueId).first();
  if (!row) return null;
  const members = await env.DB.prepare(`
    SELECT u.id, u.display_name, u.avatar_url, lm.role, lm.joined_at, lm.last_seen_at
    FROM league_members lm JOIN users u ON u.id = lm.user_id
    WHERE lm.league_id = ?
    ORDER BY CASE lm.role WHEN 'owner' THEN 0 WHEN 'admin' THEN 1 ELSE 2 END,
             lm.joined_at ASC
  `).bind(leagueId).all();
  let workspace;
  try {
    workspace = JSON.parse(row.workspace_json);
  } catch {
    log('error', { event: 'corrupt_league_workspace', leagueId });
    workspace = null;
  }
  return {
    ...leagueSummary(row, env),
    ownerUserId: row.owner_user_id,
    workspace,
    memberList: (members.results || []).map(member => ({
      id: member.id,
      name: member.display_name || 'League member',
      picture: member.avatar_url || '',
      role: member.role,
      joinedAt: Number(member.joined_at),
      lastSeenAt: Number(member.last_seen_at),
    })),
  };
}

async function listLeagues(request, env, ctx) {
  if (request.method !== 'GET') return methodNotAllowed('GET');
  const session = await sessionFor(request, env, ctx);
  if (!session) return json({ error: 'Sign in required' }, 401);
  const rows = await env.DB.prepare(`
    SELECT l.id, l.code, l.name, l.season, l.workspace_version, l.created_at, l.updated_at,
           lm.role AS membership_role, updater.display_name AS updated_by_name,
           (SELECT COUNT(*) FROM league_members all_members WHERE all_members.league_id = l.id) AS member_count
    FROM league_members lm JOIN league_rooms l ON l.id = lm.league_id
    LEFT JOIN users updater ON updater.id = l.updated_by_user_id
    WHERE lm.user_id = ? ORDER BY l.updated_at DESC LIMIT ?
  `).bind(session.user.id, MAX_LEAGUE_MEMBERSHIPS).all();
  return json({ leagues: (rows.results || []).map(row => leagueSummary(row, env)) });
}

async function createLeague(request, env, ctx) {
  if (request.method !== 'POST') return methodNotAllowed('POST');
  if (!sameOriginMutation(request)) return json({ error: 'Request origin rejected' }, 403);
  const session = await sessionFor(request, env, ctx);
  if (!session) return json({ error: 'Sign in required' }, 401);
  const body = await readJson(request, MAX_LEAGUE_BYTES + 4096);
  const name = typeof body.name === 'string' ? body.name.trim() : '';
  const season = typeof body.season === 'string' ? body.season.trim() : '';
  if (!boundedText(name, 120, false) || !boundedText(season, 24, false) ||
      !validSnapshot(body.workspace)) return json({ error: 'Invalid league room' }, 400);
  const workspaceJson = JSON.stringify(body.workspace);
  if (new TextEncoder().encode(workspaceJson).byteLength > MAX_LEAGUE_BYTES) {
    return json({ error: 'League workspace is too large' }, 413);
  }
  const limits = await env.DB.prepare(`
    SELECT
      (SELECT COUNT(*) FROM league_rooms WHERE owner_user_id = ?) AS owned,
      (SELECT COUNT(*) FROM league_members WHERE user_id = ?) AS memberships
  `).bind(session.user.id, session.user.id).first();
  if (Number(limits?.owned || 0) >= MAX_OWNED_LEAGUES) {
    return json({ error: `You can own up to ${MAX_OWNED_LEAGUES} league rooms.` }, 409);
  }
  if (Number(limits?.memberships || 0) >= MAX_LEAGUE_MEMBERSHIPS) {
    return json({ error: `You can join up to ${MAX_LEAGUE_MEMBERSHIPS} league rooms.` }, 409);
  }
  const id = crypto.randomUUID();
  const now = Date.now();
  let created = false;
  for (let attempt = 0; attempt < 5 && !created; attempt++) {
    try {
      await env.DB.batch([
        env.DB.prepare(`
          INSERT INTO league_rooms (
            id, owner_user_id, code, name, season, workspace_json, workspace_version,
            created_at, updated_at, updated_by_user_id
          ) VALUES (?, ?, ?, ?, ?, ?, 1, ?, ?, ?)
        `).bind(id, session.user.id, leagueCode(), name, season, workspaceJson, now, now, session.user.id),
        env.DB.prepare(`
          INSERT INTO league_members (league_id, user_id, role, joined_at, last_seen_at)
          VALUES (?, ?, 'owner', ?, ?)
        `).bind(id, session.user.id, now, now),
        env.DB.prepare(`
          INSERT INTO league_activity (id, league_id, actor_user_id, event_type, metadata_json, created_at)
          VALUES (?, ?, ?, 'room_created', ?, ?)
        `).bind(crypto.randomUUID(), id, session.user.id, JSON.stringify({ version: 1 }), now),
        env.DB.prepare(`
          INSERT INTO security_events (id, user_id, event_type, created_at)
          VALUES (?, ?, 'league_created', ?)
        `).bind(crypto.randomUUID(), session.user.id, now),
      ]);
      created = true;
    } catch (error) {
      if (!/unique|constraint/i.test(String(error))) throw error;
    }
  }
  if (!created) return json({ error: 'Could not create a unique league room' }, 503);
  const league = await leagueDetails(env, id, session.user.id);
  log('info', { event: 'league_created', userId: session.user.id, leagueId: id, code: league?.code });
  return json({ league }, 201);
}

async function joinLeague(request, env, ctx) {
  if (request.method !== 'POST') return methodNotAllowed('POST');
  if (!sameOriginMutation(request)) return json({ error: 'Request origin rejected' }, 403);
  const session = await sessionFor(request, env, ctx);
  if (!session) return json({ error: 'Sign in required' }, 401);
  const body = await readJson(request, 4096);
  const code = String(body.code || '').trim().toUpperCase();
  if (!LEAGUE_CODE_RE.test(code)) return json({ error: 'Enter a valid league invite code' }, 400);
  const room = await env.DB.prepare(`
    SELECT id FROM league_rooms WHERE code = ?
  `).bind(code).first();
  if (!room) return json({ error: 'League room not found' }, 404);
  const existing = await leagueDetails(env, room.id, session.user.id);
  if (existing) return json({ league: existing });
  const limits = await env.DB.prepare(`
    SELECT
      (SELECT COUNT(*) FROM league_members WHERE league_id = ?) AS members,
      (SELECT COUNT(*) FROM league_members WHERE user_id = ?) AS memberships
  `).bind(room.id, session.user.id).first();
  if (Number(limits?.members || 0) >= MAX_LEAGUE_MEMBERS) {
    return json({ error: 'This league room is full' }, 409);
  }
  if (Number(limits?.memberships || 0) >= MAX_LEAGUE_MEMBERSHIPS) {
    return json({ error: `You can join up to ${MAX_LEAGUE_MEMBERSHIPS} league rooms.` }, 409);
  }
  const now = Date.now();
  await env.DB.batch([
    env.DB.prepare(`
      INSERT INTO league_members (league_id, user_id, role, joined_at, last_seen_at)
      VALUES (?, ?, 'member', ?, ?)
    `).bind(room.id, session.user.id, now, now),
    env.DB.prepare(`
      INSERT INTO league_activity (id, league_id, actor_user_id, event_type, metadata_json, created_at)
      VALUES (?, ?, ?, 'member_joined', '{}', ?)
    `).bind(crypto.randomUUID(), room.id, session.user.id, now),
    env.DB.prepare(`
      INSERT INTO security_events (id, user_id, event_type, created_at)
      VALUES (?, ?, 'league_joined', ?)
    `).bind(crypto.randomUUID(), session.user.id, now),
  ]);
  const league = await leagueDetails(env, room.id, session.user.id);
  log('info', { event: 'league_joined', userId: session.user.id, leagueId: room.id });
  return json({ league });
}

async function getLeague(request, env, ctx, leagueId) {
  if (request.method !== 'GET') return methodNotAllowed('GET');
  if (!EVENT_ID_RE.test(leagueId)) return json({ error: 'League room not found' }, 404);
  const session = await sessionFor(request, env, ctx);
  if (!session) return json({ error: 'Sign in required' }, 401);
  const league = await leagueDetails(env, leagueId, session.user.id);
  if (!league) return json({ error: 'League room not found' }, 404);
  return json({ league });
}

async function updateLeagueWorkspace(request, env, ctx, leagueId) {
  if (request.method !== 'PUT') return methodNotAllowed('PUT');
  if (!sameOriginMutation(request)) return json({ error: 'Request origin rejected' }, 403);
  if (!EVENT_ID_RE.test(leagueId)) return json({ error: 'League room not found' }, 404);
  const session = await sessionFor(request, env, ctx);
  if (!session) return json({ error: 'Sign in required' }, 401);
  const access = await env.DB.prepare(`
    SELECT l.workspace_version, lm.role FROM league_rooms l
    JOIN league_members lm ON lm.league_id = l.id
    WHERE l.id = ? AND lm.user_id = ?
  `).bind(leagueId, session.user.id).first();
  if (!access) return json({ error: 'League room not found' }, 404);
  if (!['owner', 'admin'].includes(access.role)) {
    return json({ error: 'Commissioner access is required to publish this board' }, 403);
  }
  const body = await readJson(request, MAX_LEAGUE_BYTES + 4096);
  const baseVersion = Number(body.baseVersion);
  if (!Number.isInteger(baseVersion) || baseVersion < 1 || !validSnapshot(body.workspace)) {
    return json({ error: 'Invalid league workspace update' }, 400);
  }
  const workspaceJson = JSON.stringify(body.workspace);
  if (new TextEncoder().encode(workspaceJson).byteLength > MAX_LEAGUE_BYTES) {
    return json({ error: 'League workspace is too large' }, 413);
  }
  const now = Date.now();
  const updated = await env.DB.prepare(`
    UPDATE league_rooms SET workspace_json = ?, workspace_version = workspace_version + 1,
      updated_at = ?, updated_by_user_id = ?
    WHERE id = ? AND workspace_version = ?
    RETURNING workspace_version
  `).bind(workspaceJson, now, session.user.id, leagueId, baseVersion).first();
  if (!updated) {
    const current = await env.DB.prepare(`
      SELECT workspace_version, updated_at FROM league_rooms WHERE id = ?
    `).bind(leagueId).first();
    return json({
      error: 'Another commissioner published a newer board. Load it before publishing again.',
      current: current ? { version: Number(current.workspace_version), updatedAt: Number(current.updated_at) } : null,
    }, 409);
  }
  await env.DB.batch([
    env.DB.prepare(`
      UPDATE league_members SET last_seen_at = ? WHERE league_id = ? AND user_id = ?
    `).bind(now, leagueId, session.user.id),
    env.DB.prepare(`
      INSERT INTO league_activity (id, league_id, actor_user_id, event_type, metadata_json, created_at)
      VALUES (?, ?, ?, 'board_published', ?, ?)
    `).bind(crypto.randomUUID(), leagueId, session.user.id,
      JSON.stringify({ version: Number(updated.workspace_version) }), now),
  ]);
  const league = await leagueDetails(env, leagueId, session.user.id);
  log('info', { event: 'league_board_published', userId: session.user.id, leagueId, version: updated.workspace_version });
  return json({ league });
}

async function leagueActivity(request, env, ctx, leagueId) {
  if (request.method !== 'GET') return methodNotAllowed('GET');
  if (!EVENT_ID_RE.test(leagueId)) return json({ error: 'League room not found' }, 404);
  const session = await sessionFor(request, env, ctx);
  if (!session) return json({ error: 'Sign in required' }, 401);
  const member = await env.DB.prepare(`
    SELECT 1 AS ok FROM league_members WHERE league_id = ? AND user_id = ?
  `).bind(leagueId, session.user.id).first();
  if (!member) return json({ error: 'League room not found' }, 404);
  const rows = await env.DB.prepare(`
    SELECT a.event_type, a.metadata_json, a.created_at, u.display_name AS actor_name
    FROM league_activity a LEFT JOIN users u ON u.id = a.actor_user_id
    WHERE a.league_id = ? ORDER BY a.created_at DESC LIMIT 40
  `).bind(leagueId).all();
  return json({ activity: (rows.results || []).map(row => ({
    type: row.event_type,
    at: Number(row.created_at),
    actor: row.actor_name || 'Former member',
    metadata: JSON.parse(row.metadata_json || '{}'),
  })) });
}

async function rotateLeagueInvite(request, env, ctx, leagueId) {
  if (request.method !== 'POST') return methodNotAllowed('POST');
  if (!sameOriginMutation(request)) return json({ error: 'Request origin rejected' }, 403);
  if (!EVENT_ID_RE.test(leagueId)) return json({ error: 'League room not found' }, 404);
  const session = await sessionFor(request, env, ctx);
  if (!session) return json({ error: 'Sign in required' }, 401);
  let updated = false;
  for (let attempt = 0; attempt < 5 && !updated; attempt++) {
    try {
      const row = await env.DB.prepare(`
        UPDATE league_rooms SET code = ? WHERE id = ? AND owner_user_id = ? RETURNING id
      `).bind(leagueCode(), leagueId, session.user.id).first();
      if (!row) return json({ error: 'Only the league owner can rotate its invite' }, 403);
      updated = true;
    } catch (error) {
      if (!/unique|constraint/i.test(String(error))) throw error;
    }
  }
  if (!updated) return json({ error: 'Could not create a new invite code' }, 503);
  const now = Date.now();
  await env.DB.batch([
    env.DB.prepare(`
      INSERT INTO league_activity (id, league_id, actor_user_id, event_type, metadata_json, created_at)
      VALUES (?, ?, ?, 'invite_rotated', '{}', ?)
    `).bind(crypto.randomUUID(), leagueId, session.user.id, now),
    env.DB.prepare(`
      INSERT INTO security_events (id, user_id, event_type, created_at)
      VALUES (?, ?, 'league_invite_rotated', ?)
    `).bind(crypto.randomUUID(), session.user.id, now),
  ]);
  const league = await leagueDetails(env, leagueId, session.user.id);
  return json({ league });
}

async function changeLeagueMember(request, env, ctx, leagueId, targetUserId) {
  if (request.method !== 'PATCH' && request.method !== 'DELETE') {
    return methodNotAllowed('PATCH, DELETE');
  }
  if (!sameOriginMutation(request)) return json({ error: 'Request origin rejected' }, 403);
  if (!EVENT_ID_RE.test(leagueId) || !EVENT_ID_RE.test(targetUserId)) {
    return json({ error: 'League member not found' }, 404);
  }
  const session = await sessionFor(request, env, ctx);
  if (!session) return json({ error: 'Sign in required' }, 401);
  const access = await env.DB.prepare(`
    SELECT l.owner_user_id, mine.role AS my_role, target.role AS target_role
    FROM league_rooms l
    JOIN league_members mine ON mine.league_id = l.id AND mine.user_id = ?
    LEFT JOIN league_members target ON target.league_id = l.id AND target.user_id = ?
    WHERE l.id = ?
  `).bind(session.user.id, targetUserId, leagueId).first();
  if (!access || !access.target_role) return json({ error: 'League member not found' }, 404);
  if (targetUserId === access.owner_user_id || access.target_role === 'owner') {
    return json({ error: 'The league owner cannot be removed or reassigned' }, 409);
  }
  const now = Date.now();
  if (request.method === 'DELETE') {
    if (session.user.id !== targetUserId && access.my_role !== 'owner') {
      return json({ error: 'Only the league owner can remove another member' }, 403);
    }
    await env.DB.batch([
      env.DB.prepare(`DELETE FROM league_members WHERE league_id = ? AND user_id = ?`)
        .bind(leagueId, targetUserId),
      env.DB.prepare(`
        INSERT INTO league_activity (id, league_id, actor_user_id, event_type, metadata_json, created_at)
        VALUES (?, ?, ?, ?, ?, ?)
      `).bind(crypto.randomUUID(), leagueId, session.user.id,
        session.user.id === targetUserId ? 'member_left' : 'member_removed',
        JSON.stringify({ targetUserId }), now),
    ]);
    return json({ removed: true, userId: targetUserId });
  }
  if (access.my_role !== 'owner') return json({ error: 'Only the league owner can assign roles' }, 403);
  const body = await readJson(request, 4096);
  const role = String(body.role || '');
  if (!['admin', 'member'].includes(role)) return json({ error: 'Invalid league role' }, 400);
  await env.DB.batch([
    env.DB.prepare(`UPDATE league_members SET role = ? WHERE league_id = ? AND user_id = ?`)
      .bind(role, leagueId, targetUserId),
    env.DB.prepare(`
      INSERT INTO league_activity (id, league_id, actor_user_id, event_type, metadata_json, created_at)
      VALUES (?, ?, ?, 'role_changed', ?, ?)
    `).bind(crypto.randomUUID(), leagueId, session.user.id,
      JSON.stringify({ targetUserId, role }), now),
  ]);
  return json({ updated: true, userId: targetUserId, role });
}

async function deleteLeague(request, env, ctx, leagueId) {
  if (request.method !== 'DELETE') return methodNotAllowed('DELETE');
  if (!sameOriginMutation(request)) return json({ error: 'Request origin rejected' }, 403);
  if (!EVENT_ID_RE.test(leagueId)) return json({ error: 'League room not found' }, 404);
  const session = await sessionFor(request, env, ctx);
  if (!session) return json({ error: 'Sign in required' }, 401);
  const deleted = await env.DB.prepare(`
    DELETE FROM league_rooms WHERE id = ? AND owner_user_id = ? RETURNING id
  `).bind(leagueId, session.user.id).first();
  if (!deleted) return json({ error: 'Only the league owner can delete this room' }, 403);
  await env.DB.prepare(`
    INSERT INTO security_events (id, user_id, event_type, created_at)
    VALUES (?, ?, 'league_deleted', ?)
  `).bind(crypto.randomUUID(), session.user.id, Date.now()).run();
  log('info', { event: 'league_deleted', userId: session.user.id, leagueId });
  return json({ deleted: true });
}

async function deleteAccount(request, env, ctx) {
  if (request.method !== 'DELETE') return methodNotAllowed('DELETE');
  if (!sameOriginMutation(request)) return json({ error: 'Request origin rejected' }, 403);
  const session = await sessionFor(request, env, ctx);
  if (!session) return json({ error: 'Sign in required' }, 401);
  const rows = await env.DB.prepare(`
    SELECT object_key FROM user_logos WHERE user_id = ?
  `).bind(session.user.id).all();
  await env.DB.batch([
    env.DB.prepare('DELETE FROM published_events WHERE owner_user_id = ?').bind(session.user.id),
    env.DB.prepare('DELETE FROM user_logos WHERE user_id = ?').bind(session.user.id),
    env.DB.prepare('DELETE FROM account_data WHERE user_id = ?').bind(session.user.id),
    env.DB.prepare('DELETE FROM sessions WHERE user_id = ?').bind(session.user.id),
    env.DB.prepare('DELETE FROM security_events WHERE user_id = ?').bind(session.user.id),
    env.DB.prepare('DELETE FROM users WHERE id = ?').bind(session.user.id),
  ]);
  await Promise.all((rows.results || []).map(row => env.MEDIA.delete(row.object_key)));
  log('info', { event: 'account_deleted', userId: session.user.id });
  return json({ deleted: true }, 200, { 'set-cookie': clearSessionCookie() });
}

async function health(request, env) {
  if (request.method !== 'GET') return methodNotAllowed('GET');
  const started = Date.now();
  await env.DB.prepare('SELECT 1 AS ok').first();
  return json({ ok: true, service: 'cfp-dynasty-studio', database: 'ready', latencyMs: Date.now() - started });
}

async function handleApi(request, env, ctx, url, requestId) {
  if (url.pathname === '/api/health') return health(request, env);
  if (url.pathname === '/api/bootstrap') return bootstrap(request, env, ctx);
  if (url.pathname === '/api/auth/google') return googleLogin(request, env, requestId);
  if (url.pathname === '/api/auth/logout') return logout(request, env, ctx);
  if (url.pathname === '/api/account/data') return saveAccountData(request, env, ctx);
  if (url.pathname === '/api/account') return deleteAccount(request, env, ctx);
  if (url.pathname === '/api/events') {
    return request.method === 'POST' ? publishEvent(request, env, ctx) : listEvents(request, env, ctx);
  }
  const activityMatch = url.pathname.match(/^\/api\/events\/([0-9a-f-]+)\/activity$/i);
  if (activityMatch) return eventActivity(request, env, ctx, activityMatch[1]);
  const eventMatch = url.pathname.match(/^\/api\/events\/([^/]+)$/);
  if (eventMatch) {
    return request.method === 'DELETE'
      ? deleteEvent(request, env, ctx, eventMatch[1])
      : eventByCode(request, env, ctx, eventMatch[1].toUpperCase());
  }
  if (url.pathname === '/api/leagues') {
    return request.method === 'POST' ? createLeague(request, env, ctx) : listLeagues(request, env, ctx);
  }
  if (url.pathname === '/api/leagues/join') return joinLeague(request, env, ctx);
  const leagueActivityMatch = url.pathname.match(/^\/api\/leagues\/([0-9a-f-]+)\/activity$/i);
  if (leagueActivityMatch) return leagueActivity(request, env, ctx, leagueActivityMatch[1]);
  const leagueInviteMatch = url.pathname.match(/^\/api\/leagues\/([0-9a-f-]+)\/invite$/i);
  if (leagueInviteMatch) return rotateLeagueInvite(request, env, ctx, leagueInviteMatch[1]);
  const leagueWorkspaceMatch = url.pathname.match(/^\/api\/leagues\/([0-9a-f-]+)\/workspace$/i);
  if (leagueWorkspaceMatch) return updateLeagueWorkspace(request, env, ctx, leagueWorkspaceMatch[1]);
  const leagueMemberMatch = url.pathname.match(/^\/api\/leagues\/([0-9a-f-]+)\/members\/([0-9a-f-]+)$/i);
  if (leagueMemberMatch) {
    return changeLeagueMember(request, env, ctx, leagueMemberMatch[1], leagueMemberMatch[2]);
  }
  const leagueMatch = url.pathname.match(/^\/api\/leagues\/([0-9a-f-]+)$/i);
  if (leagueMatch) {
    return request.method === 'DELETE'
      ? deleteLeague(request, env, ctx, leagueMatch[1])
      : getLeague(request, env, ctx, leagueMatch[1]);
  }
  if (url.pathname === '/api/logos') return listLogos(request, env, ctx);
  if (url.pathname.startsWith('/api/logos/')) return userLogo(request, env, ctx, url);
  return json({ error: 'API route not found' }, 404);
}

function mediaHeaders(object, length) {
  const headers = new Headers();
  object.writeHttpMetadata(headers);
  headers.set('etag', object.httpEtag);
  headers.set('accept-ranges', 'bytes');
  headers.set('cache-control', 'public, max-age=31536000, immutable');
  if (length !== undefined) headers.set('content-length', String(length));
  return headers;
}

function parseRange(value, size) {
  const match = /^bytes=(\d*)-(\d*)$/.exec(value || '');
  if (!match || (!match[1] && !match[2])) return null;
  let offset;
  let length;
  if (!match[1]) {
    const suffix = Number(match[2]);
    if (!Number.isSafeInteger(suffix) || suffix <= 0) return null;
    length = Math.min(suffix, size);
    offset = size - length;
  } else {
    const start = Number(match[1]);
    const requestedEnd = match[2] ? Number(match[2]) : size - 1;
    if (!Number.isSafeInteger(start) || !Number.isSafeInteger(requestedEnd) ||
        start < 0 || start >= size || requestedEnd < start) return null;
    const end = Math.min(requestedEnd, size - 1);
    offset = start;
    length = end - start + 1;
  }
  return { offset, length };
}

async function serveMedia(request, env, key) {
  if (!ALLOWED_MEDIA.has(key)) return new Response('Not found', { status: 404 });
  if (request.method !== 'GET' && request.method !== 'HEAD') {
    return new Response('Method not allowed', { status: 405, headers: { allow: 'GET, HEAD' } });
  }
  const metadata = await env.MEDIA.head(key);
  if (!metadata) return new Response('Not found', { status: 404 });
  const ifNoneMatch = request.headers.get('if-none-match');
  if (ifNoneMatch && (ifNoneMatch === '*' || ifNoneMatch.includes(metadata.httpEtag))) {
    return new Response(null, { status: 304, headers: mediaHeaders(metadata) });
  }
  const rangeValue = request.headers.get('range');
  const ifRange = request.headers.get('if-range');
  const mayUseRange = rangeValue && (!ifRange || ifRange === metadata.httpEtag);
  if (mayUseRange) {
    const range = parseRange(rangeValue, metadata.size);
    if (!range) {
      return new Response('Range not satisfiable', {
        status: 416,
        headers: { 'accept-ranges': 'bytes', 'content-range': `bytes */${metadata.size}` },
      });
    }
    const object = await env.MEDIA.get(key, { range });
    if (!object || !('body' in object)) return new Response('Not found', { status: 404 });
    const headers = mediaHeaders(object, range.length);
    headers.set('content-range', `bytes ${range.offset}-${range.offset + range.length - 1}/${metadata.size}`);
    return new Response(request.method === 'HEAD' ? null : object.body, { status: 206, headers });
  }
  if (request.method === 'HEAD') {
    return new Response(null, { headers: mediaHeaders(metadata, metadata.size) });
  }
  const object = await env.MEDIA.get(key);
  if (!object || !('body' in object)) return new Response('Not found', { status: 404 });
  return new Response(object.body, { headers: mediaHeaders(object, object.size) });
}

export default {
  async fetch(request, env, ctx) {
    const url = new URL(request.url);
    const requestId = request.headers.get('cf-ray') || crypto.randomUUID();
    try {
      if (url.pathname.startsWith(API_PREFIX)) {
        const response = await handleApi(request, env, ctx, url, requestId);
        return secureResponse(response, requestId, true);
      }
      if (url.pathname.startsWith(MEDIA_PREFIX)) {
        const key = decodeURIComponent(url.pathname.slice(MEDIA_PREFIX.length));
        const response = await serveMedia(request, env, key);
        return secureResponse(response, requestId);
      }
      if (/^\/(?:watch\/[A-HJ-NP-Z2-9]{10}|join\/[A-HJ-NP-Z2-9]{8})\/?$/.test(url.pathname)) {
        if (request.method !== 'GET' && request.method !== 'HEAD') {
          return secureResponse(methodNotAllowed('GET, HEAD'), requestId);
        }
        const root = new URL('/', url);
        const response = await env.ASSETS.fetch(new Request(root, request));
        return secureResponse(response, requestId);
      }
      const response = await env.ASSETS.fetch(request);
      return secureResponse(response, requestId);
    } catch (error) {
      if (error instanceof Response) return secureResponse(error, requestId, true);
      log('error', {
        event: 'request_failed',
        requestId,
        method: request.method,
        path: url.pathname,
        error: error instanceof Error ? error.message : String(error),
      });
      return secureResponse(json({ error: 'Internal server error', requestId }, 500), requestId, true);
    }
  },
  async scheduled(controller, env, ctx) {
    const now = Date.now();
    ctx.waitUntil(
      env.DB.batch([
        env.DB.prepare('DELETE FROM sessions WHERE expires_at <= ?').bind(now),
        env.DB.prepare('DELETE FROM security_events WHERE created_at <= ?')
          .bind(now - SECURITY_EVENT_TTL_MS),
      ]).then(results => {
        log('info', {
          event: 'scheduled_cleanup',
          scheduledTime: controller.scheduledTime,
          sessionsDeleted: results[0]?.meta?.changes || 0,
          securityEventsDeleted: results[1]?.meta?.changes || 0,
        });
      }).catch(error => {
        log('error', {
          event: 'scheduled_cleanup_failed',
          error: error instanceof Error ? error.message : String(error),
        });
        throw error;
      }),
    );
  },
};

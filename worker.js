import { createRemoteJWKSet, jwtVerify } from 'jose';

const MEDIA_PREFIX = '/media/';
const API_PREFIX = '/api/';
const ALLOWED_MEDIA = new Set(['intro-video.mp4', 'selection-night-open.mp4']);
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
const LOGO_TYPES = new Set(['image/png', 'image/jpeg', 'image/webp']);
const TEAM_ID_RE = /^[a-z0-9][a-z0-9-]{0,63}$/;

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
      "style-src 'self' 'unsafe-inline'",
      "img-src 'self' data: blob: https://lh3.googleusercontent.com",
      "media-src 'self' blob:",
      "connect-src 'self' https://accounts.google.com",
      "frame-src https://accounts.google.com",
      "font-src 'self' data:",
      "worker-src 'self' blob:",
      "object-src 'none'",
      "base-uri 'none'",
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

async function deleteAccount(request, env, ctx) {
  if (request.method !== 'DELETE') return methodNotAllowed('DELETE');
  if (!sameOriginMutation(request)) return json({ error: 'Request origin rejected' }, 403);
  const session = await sessionFor(request, env, ctx);
  if (!session) return json({ error: 'Sign in required' }, 401);
  const rows = await env.DB.prepare(`
    SELECT object_key FROM user_logos WHERE user_id = ?
  `).bind(session.user.id).all();
  await env.DB.batch([
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

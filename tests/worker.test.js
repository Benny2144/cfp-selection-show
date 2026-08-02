import { describe, expect, it } from 'vitest';
import { env } from 'cloudflare:test';
import { testable } from '../worker.js';

function validEventPayload() {
  return {
    l: 'Saturday Dynasty', y: '2032', t: 'Selection Night', s: '', k: '', ol: '',
    o: 'asc', c: 'full', f: 'max', n: 'on', st: 'lead', rf: 'on', p: 'manual', oc: 4,
    mv: 100, vv: 100, cv: 100, fv: 100, bv: 100, pm: 0,
    d: Array.from({ length: 12 }, (_, index) => [`team-${index + 1}`, `Team ${index + 1}`, 0]),
    u: [], g: '', rs: {}, v: {},
  };
}

describe('Worker contract validation', () => {
  it('accepts a complete bounded account snapshot', () => {
    expect(testable.validSnapshot({
      schema: 1,
      state: { seeds: Array(12).fill(null), out: Array(4).fill(null) },
      customTeams: [], history: [], entries: [], overrides: {},
    })).toBe(true);
  });

  it('rejects malformed or oversized snapshot structures', () => {
    expect(testable.validSnapshot({ schema: 1, state: { seeds: [], out: [] } })).toBe(false);
    expect(testable.validSnapshot({
      schema: 1,
      state: { seeds: Array(12).fill(null), out: Array(4).fill(null) },
      history: Array(41).fill({}),
    })).toBe(false);
  });

  it('accepts a complete broadcast and rejects unsafe team identifiers', () => {
    const payload = validEventPayload();
    expect(testable.validPublishedPayload(payload)).toBe(true);
    payload.d[0][0] = '../other-account';
    expect(testable.validPublishedPayload(payload)).toBe(false);
  });

  it('accepts a tapped winner marker and rejects an invalid result side', () => {
    const payload = validEventPayload();
    payload.rs = { fr1: { a: '', b: '', w: 'a' } };
    expect(testable.validPublishedPayload(payload)).toBe(true);
    payload.rs.fr1.w = 'home';
    expect(testable.validPublishedPayload(payload)).toBe(false);
  });

  it('parses normal, open-ended, and suffix byte ranges', () => {
    expect(testable.parseRange('bytes=10-19', 100)).toEqual({ offset: 10, length: 10 });
    expect(testable.parseRange('bytes=90-', 100)).toEqual({ offset: 90, length: 10 });
    expect(testable.parseRange('bytes=-8', 100)).toEqual({ offset: 92, length: 8 });
    expect(testable.parseRange('bytes=100-120', 100)).toBeNull();
  });

  it('requires an exact same-origin mutation marker', () => {
    const allowed = new Request('https://studio.example/api/account', {
      method: 'PUT', headers: { origin: 'https://studio.example', 'x-cfp-request': '1' },
    });
    const rejected = new Request('https://studio.example/api/account', {
      method: 'PUT', headers: { origin: 'https://attacker.example', 'x-cfp-request': '1' },
    });
    expect(testable.sameOriginMutation(allowed)).toBe(true);
    expect(testable.sameOriginMutation(rejected)).toBe(false);
  });

  it('creates high-entropy human-safe invite codes', () => {
    const codes = new Set(Array.from({ length: 250 }, () => testable.randomCode(10)));
    expect(codes.size).toBe(250);
    for (const code of codes) expect(code).toMatch(/^[A-HJ-NP-Z2-9]{10}$/);
  });

  it('returns a standards-compliant 429 when a limiter rejects a request', async () => {
    const response = await testable.rateLimitResponse(
      { limit: async () => ({ success: false }) }, 'user-1', 'Slow down',
    );
    expect(response.status).toBe(429);
    expect(response.headers.get('retry-after')).toBe('60');
    await expect(response.json()).resolves.toEqual({ error: 'Slow down' });
  });

  it('routes one isolated live coordinator per league room', async () => {
    const room = env.LEAGUE_LIVE.getByName('league-room-contract-test');
    await expect(room.status()).resolves.toEqual({ members: [] });
    await expect(room.publishBoard({ version: 7, actor: 'Commissioner', at: Date.now() }))
      .resolves.toEqual({ delivered: 0 });
  });
});

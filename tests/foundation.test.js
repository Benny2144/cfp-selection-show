import { beforeAll, describe, expect, it, vi } from 'vitest';

beforeAll(async () => { await import('../js/foundation.js'); });

describe('application routing contract', () => {
  it('maps every major screen to a durable URL and back', () => {
    const foundation = globalThis.CFPFoundation;
    const expected = {
      home: '/hub', room: '/committee', final: '/bracket', results: '/results',
      pickem: '/projections', history: '/history', show: '/show',
    };
    Object.entries(expected).forEach(([screen, route]) => {
      expect(foundation.routeForScreen(screen)).toBe(route);
      expect(foundation.screenForPath(route)).toBe(screen);
      expect(foundation.screenForPath(`${route}/`)).toBe(screen);
    });
    expect(foundation.screenForPath('/')).toBe('home');
    expect(foundation.screenForPath('/watch/ABCDEFGH23')).toBe('show');
  });

  it('provides a distinct document title for every major view', () => {
    const foundation = globalThis.CFPFoundation;
    const titles = Object.keys(foundation.ROUTES)
      .map(screen => foundation.titleForScreen(screen, 'Saturday Dynasty'));
    expect(new Set(titles).size).toBe(Object.keys(foundation.ROUTES).length);
    titles.forEach(title => expect(title).toContain('Saturday Dynasty'));
  });
});

describe('central playoff validation', () => {
  const seeds = Array.from({ length: 12 }, (_, index) => ({ id: `team-${index}` }));

  it('requires a complete field and five configured automatic bids', () => {
    const foundation = globalThis.CFPFoundation;
    const incomplete = foundation.validatePlayoff({
      seeds: seeds.slice(0, 11),
      champions: [{ conf: 'SEC' }, { conf: 'Big Ten' }],
    });
    expect(incomplete.ready).toBe(false);
    expect(incomplete.issues.map(issue => issue.code))
      .toEqual(expect.arrayContaining(['field-incomplete', 'automatic-bids']));

    const ready = foundation.validatePlayoff({
      seeds,
      champions: ['SEC', 'Big Ten', 'ACC', 'Big 12', 'MWC'].map(conf => ({ conf })),
    });
    expect(ready.ready).toBe(true);
  });

  it('rejects multiple champion flags from the same conference', () => {
    const result = globalThis.CFPFoundation.validatePlayoff({
      seeds,
      champions: ['SEC', 'SEC', 'ACC', 'Big Ten', 'Big 12'].map(conf => ({ conf })),
    });
    expect(result.ready).toBe(false);
    expect(result.issues).toContainEqual(expect.objectContaining({
      code: 'duplicate-champion', conference: 'SEC',
    }));
  });
});

describe('inactive-screen and focus contracts', () => {
  function fakeScreen() {
    const classes = new Set(['screen']);
    return {
      hidden: false,
      inert: false,
      attributes: {},
      classList: { toggle: (name, on) => on ? classes.add(name) : classes.delete(name) },
      setAttribute(name, value) { this.attributes[name] = value; },
      classes,
    };
  }

  it('removes inactive screens from interaction and the accessibility tree', () => {
    const screen = fakeScreen();
    globalThis.CFPFoundation.setScreenState(screen, false);
    expect(screen.hidden).toBe(true);
    expect(screen.inert).toBe(true);
    expect(screen.attributes['aria-hidden']).toBe('true');
    expect(screen.classes.has('active')).toBe(false);
  });

  it('restores focus to the connected initiator, then a fallback', () => {
    const trigger = { isConnected: true, focus: vi.fn() };
    const fallback = { focus: vi.fn() };
    expect(globalThis.CFPFoundation.restoreFocus(trigger, fallback)).toBe(true);
    expect(trigger.focus).toHaveBeenCalledOnce();
    expect(fallback.focus).not.toHaveBeenCalled();

    trigger.isConnected = false;
    globalThis.CFPFoundation.restoreFocus(trigger, fallback);
    expect(fallback.focus).toHaveBeenCalledOnce();
  });
});

describe('destructive action guard', () => {
  it('does not run a destructive mutation until confirmation succeeds', async () => {
    const action = vi.fn();
    const denied = await globalThis.CFPFoundation.actions.runConfirmed(
      async () => false, action,
    );
    expect(denied).toBe(false);
    expect(action).not.toHaveBeenCalled();

    const accepted = await globalThis.CFPFoundation.actions.runConfirmed(
      async () => true, action,
    );
    expect(accepted).toBe(true);
    expect(action).toHaveBeenCalledOnce();
  });
});

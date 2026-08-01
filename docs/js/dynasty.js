/* =====================================================================
   DYNASTY — the parts of a playoff that outlive selection night.

   Four things live here, and they all key off the same field the
   committee room already builds:

     Champs    who won their league, and whether the bids add up
     Games     the 11-game bracket as a graph, so winners can advance
     History   every season this browser has finished, and who won it
     Movement  where a team sat in the last saved field

   Nothing in here talks to the DOM. The screens in ui-dynasty.js do
   that, so the rules stay testable from the console.
   ===================================================================== */

/* ======================================================================
   CONFERENCE CHAMPIONS

   The playoff gives automatic bids to the five highest-ranked conference
   champions. Seeding itself is straight off the rankings — the top four
   seeds get the byes whether or not they won their league — so a champion
   flag is a label on a team, never a constraint on where it sits.
   ====================================================================== */
const Champs = (() => {

  /** Every seeded team that is flagged as its conference's champion,
      in seed order. The first five of those hold the automatic bids. */
  function list() {
    return STATE.seeds
      .map((s, i) => (s && s.champ) ? { seed: i + 1, id: s.id, conf: team(s.id).conf } : null)
      .filter(Boolean);
  }

  /** True when this seed is one of the five automatic bids. */
  function isAutoBid(i) {
    const idx = list().findIndex(c => c.seed === i + 1);
    return idx >= 0 && idx < 5;
  }

  /** How a reveal should describe the team: champion of X, or at-large. */
  function tagFor(i) {
    const s = STATE.seeds[i];
    if (!s) return '';
    if (!s.champ) return 'AT-LARGE BID';
    const conf = (team(s.id).conf || '').toUpperCase();
    return conf ? conf + ' CHAMPION' : 'CONFERENCE CHAMPION';
  }

  /* ------------------------------------------------------------------
     Advisory only. A dynasty can end up anywhere — a league might play
     ten conferences or three — so this reports what looks off and lets
     the commissioner decide, rather than refusing to run the show.
     ------------------------------------------------------------------ */
  function problems() {
    const out = [];
    const cs = list();
    const seeded = STATE.seeds.filter(Boolean).length;

    if (seeded === 12 && cs.length < 5)
      out.push(`Only ${cs.length} conference champion${cs.length === 1 ? '' : 's'} ` +
               'in the field — the playoff awards five automatic bids.');

    /* Two champions of one league means somebody is mislabelled. */
    const byConf = {};
    cs.forEach(c => (byConf[c.conf] = byConf[c.conf] || []).push(c.seed));
    Object.entries(byConf).forEach(([conf, seeds]) => {
      if (seeds.length > 1)
        out.push(`${conf || 'One conference'} has ${seeds.length} champions flagged ` +
                 `(seeds ${seeds.join(', ')}).`);
    });

    return out;
  }

  return { list, isAutoBid, tagFor, problems };
})();


/* ======================================================================
   THE BRACKET AS A GRAPH

   Eleven games. A slot is filled either by a seed outright or by the
   winner of an earlier game, so one pass in bracket order resolves the
   whole thing from a handful of scores.
   ====================================================================== */
const GAMES = [
  /* first round — the higher seed hosts on campus */
  { id: 'fr1', round: 'r1', name: 'First Round', site: 'campus', a: { seed: 8 },  b: { seed: 9 }  },
  { id: 'fr2', round: 'r1', name: 'First Round', site: 'campus', a: { seed: 5 },  b: { seed: 12 } },
  { id: 'fr3', round: 'r1', name: 'First Round', site: 'campus', a: { seed: 7 },  b: { seed: 10 } },
  { id: 'fr4', round: 'r1', name: 'First Round', site: 'campus', a: { seed: 6 },  b: { seed: 11 } },

  /* quarter-finals — the four bowls */
  { id: 'qf1', round: 'qf', name: 'Rose Bowl',   site: 'bowl', a: { seed: 1 }, b: { win: 'fr1' } },
  { id: 'qf2', round: 'qf', name: 'Cotton Bowl', site: 'bowl', a: { seed: 4 }, b: { win: 'fr2' } },
  { id: 'qf3', round: 'qf', name: 'Sugar Bowl',  site: 'bowl', a: { seed: 2 }, b: { win: 'fr3' } },
  { id: 'qf4', round: 'qf', name: 'Orange Bowl', site: 'bowl', a: { seed: 3 }, b: { win: 'fr4' } },

  /* semi-finals */
  { id: 'sf1', round: 'sf', name: 'Fiesta Bowl', site: 'bowl', a: { win: 'qf1' }, b: { win: 'qf2' } },
  { id: 'sf2', round: 'sf', name: 'Peach Bowl',  site: 'bowl', a: { win: 'qf3' }, b: { win: 'qf4' } },

  { id: 'nc', round: 'nc', name: 'National Championship', site: 'neutral',
    a: { win: 'sf1' }, b: { win: 'sf2' } }
];

const GAME_BY_ID = Object.fromEntries(GAMES.map(g => [g.id, g]));

/* What a round is worth in the pick'em, and how the results screen groups. */
const ROUND_INFO = {
  r1: { label: 'First Round',    points: 1 },
  qf: { label: 'Quarter-finals', points: 2 },
  sf: { label: 'Semi-finals',    points: 4 },
  nc: { label: 'National Championship', points: 8 }
};

const Bracket = (() => {

  /** Resolve every slot from the scores in `results`.

      Returns a map of gameId -> {a, b, winner, loser, scoreA, scoreB},
      where a/b are seed numbers or null when the feeding game has not
      been played yet. Walking GAMES in order is enough: a game never
      depends on one that comes after it. */
  function solve(results) {
    const r = results || STATE.results || {};
    const out = {};

    const slot = (ref) => {
      if (ref.seed != null) return STATE.seeds[ref.seed - 1] ? ref.seed : null;
      const prev = out[ref.win];
      return prev ? prev.winner : null;
    };

    GAMES.forEach(g => {
      const a = slot(g.a), b = slot(g.b);
      const sc = r[g.id] || {};
      const sa = numOrNull(sc.a), sb = numOrNull(sc.b);

      let winner = null, loser = null;
      /* Only a finished game with two different scores advances anybody.
         A tie sits there rather than picking arbitrarily — overtime is a
         thing, and a half-typed score should not move the bracket. */
      if (a && b && sa !== null && sb !== null && sa !== sb) {
        winner = sa > sb ? a : b;
        loser  = sa > sb ? b : a;
      }
      out[g.id] = { id: g.id, a, b, sa, sb, winner, loser, game: g };
    });

    return out;
  }

  const numOrNull = v => {
    if (v === '' || v == null) return null;
    const n = Number(v);
    return Number.isFinite(n) ? n : null;
  };

  /** The seed that won it all, or null. */
  const champion = (results) => solve(results).nc.winner;

  /** How many of the eleven have a result. */
  function played(results) {
    const s = solve(results);
    return GAMES.filter(g => s[g.id].winner).length;
  }

  /** Games that can be played right now — both slots known, no score in. */
  function playable(results) {
    const s = solve(results);
    return GAMES.filter(g => s[g.id].a && s[g.id].b && !s[g.id].winner);
  }

  /** Human label for a slot, used everywhere a team might not be known. */
  function slotName(seedNo, solved, ref) {
    if (seedNo) {
      const s = STATE.seeds[seedNo - 1];
      return s ? team(s.id).school : 'No. ' + seedNo;
    }
    if (ref && ref.win) {
      const g = GAME_BY_ID[ref.win];
      return 'Winner ' + (g ? g.name : ref.win);
    }
    return 'TBD';
  }

  return { solve, champion, played, playable, slotName, numOrNull };
})();


/* ======================================================================
   HISTORY

   A dynasty runs for years. Each finished season is archived here so the
   site can show a roll of honour instead of forgetting everything the
   moment the next field is built.
   ====================================================================== */
const History = (() => {
  const KEY = 'cfp27.history';

  function all() {
    try {
      const v = JSON.parse(localStorage.getItem(KEY) || '[]');
      return Array.isArray(v) ? v : [];
    } catch (e) { return []; }
  }

  function write(list) {
    try { localStorage.setItem(KEY, JSON.stringify(list.slice(0, 40))); }
    catch (e) {}
  }

  /** A season's worth of the board, small enough to keep dozens of. */
  function snapshot() {
    return {
      season: STATE.season,
      league: STATE.league,
      savedAt: Date.now(),
      seeds: STATE.seeds.map(s => s ? { id: s.id, record: s.record || '', champ: !!s.champ } : null),
      out:   STATE.out.map(s => s ? { id: s.id, record: s.record || '' } : null),
      results: Object.assign({}, STATE.results || {}),
      champion: Bracket.champion()
    };
  }

  /** Save the current field under its season.

      Re-saving the same season replaces it rather than piling up — a
      commissioner tweaks the board and re-runs the show more than once,
      and twelve copies of 2027 is not a history. */
  function save() {
    const snap = snapshot();
    const list = all().filter(h => !(h.season === snap.season && h.league === snap.league));
    list.unshift(snap);
    write(list);
    return snap;
  }

  function remove(savedAt) {
    write(all().filter(h => h.savedAt !== savedAt));
  }

  /** The most recent season that is not the one on the board now. */
  function previous() {
    return all().find(h => !(h.season === STATE.season && h.league === STATE.league)) || null;
  }

  /** Load an archived season back onto the board. */
  function restoreSeason(savedAt) {
    const h = all().find(x => x.savedAt === savedAt);
    if (!h) return false;
    STATE.season = h.season;
    STATE.league = h.league;
    STATE.seeds = (h.seeds || []).map(s => s ? { id: s.id, record: s.record, champ: !!s.champ } : null);
    while (STATE.seeds.length < 12) STATE.seeds.push(null);
    STATE.out = (h.out || []).map(s => s ? { id: s.id, record: s.record } : null);
    while (STATE.out.length < 4) STATE.out.push(null);
    STATE.results = Object.assign({}, h.results || {});
    return true;
  }

  /** Titles per team across every archived season. */
  function rollOfHonour() {
    const tally = {};
    all().forEach(h => {
      const champSeed = h.champion;
      if (!champSeed) return;
      const s = (h.seeds || [])[champSeed - 1];
      if (!s) return;
      (tally[s.id] = tally[s.id] || { id: s.id, titles: [], n: 0 });
      tally[s.id].titles.push(h.season);
      tally[s.id].n++;
    });
    return Object.values(tally).sort((a, b) => b.n - a.n);
  }

  return { all, save, remove, previous, restoreSeason, rollOfHonour, snapshot };
})();


/* ======================================================================
   MOVEMENT

   Where a team sat in the last saved field. The broadcast puts a little
   arrow next to every name for exactly this reason — it is the fastest
   way to tell a story about a team without saying a word.
   ====================================================================== */
const Movement = (() => {
  let base = null;          // the field we are comparing against
  let loaded = false;

  /** Compare against the most recent archived season by default. */
  function refresh() {
    base = History.previous();
    loaded = true;
    return base;
  }

  function seedOf(field, id) {
    if (!field || !field.seeds) return null;
    const i = field.seeds.findIndex(s => s && s.id === id);
    return i === -1 ? null : i + 1;
  }

  /** {dir:'up'|'down'|'same'|'new', by:n, was:n} or null when there is
      nothing to compare to at all. */
  function of(i) {
    if (!loaded) refresh();
    const s = STATE.seeds[i];
    if (!s || !base) return null;
    const was = seedOf(base, s.id);
    if (was == null) return { dir: 'new', by: 0, was: null, from: base.season };
    const by = was - (i + 1);          // positive = climbed
    return {
      dir: by > 0 ? 'up' : by < 0 ? 'down' : 'same',
      by: Math.abs(by), was, from: base.season
    };
  }

  /** Short broadcast-style caption, e.g. "Up 3 from No. 7". */
  function caption(i) {
    const m = of(i);
    if (!m) return '';
    if (m.dir === 'new') return `New to the field`;
    if (m.dir === 'same') return `Holds at No. ${m.was}`;
    return `${m.dir === 'up' ? 'Up' : 'Down'} ${m.by} from No. ${m.was}`;
  }

  const source = () => (loaded ? base : refresh());

  return { of, caption, refresh, source };
})();

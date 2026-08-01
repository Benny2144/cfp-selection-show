/* =====================================================================
   PICK'EM — the league fills in the bracket, the commissioner scores it.

   There is no server behind this site, so an entry has to be something a
   person can paste into a group chat. Eleven games is eleven yes/no
   choices, which packs into a number small enough to write on a napkin:

       BEN-1JZ

   The name is just a name. The three characters after the dash are the
   eleven picks in base 36. Pasting that back in reconstructs the whole
   bracket, because a pick is "the team on the top line" or "the team on
   the bottom line" and the graph in dynasty.js knows who those are.
   ===================================================================== */
const Pickem = (() => {
  const KEY = 'cfp27.entries';

  /* ---------------------------------------------------------- encoding */

  /** picks: array of 11 values, 0 = slot a, 1 = slot b. */
  function encode(name, picks) {
    let bits = 0;
    for (let i = 0; i < GAMES.length; i++) bits |= (picks[i] ? 1 : 0) << i;
    return cleanName(name) + '-' + bits.toString(36).toUpperCase();
  }

  function decode(code) {
    const m = String(code || '').trim().match(/^(.*)-([0-9A-Z]+)$/i);
    if (!m) return null;
    const bits = parseInt(m[2], 36);
    if (!Number.isFinite(bits) || bits < 0) return null;
    const picks = [];
    for (let i = 0; i < GAMES.length; i++) picks.push((bits >> i) & 1);
    return { name: cleanName(m[1]) || 'ANON', picks, code: code.trim().toUpperCase() };
  }

  const cleanName = n => String(n || '').toUpperCase()
    .replace(/[^A-Z0-9 _]/g, '').trim().replace(/\s+/g, '_').slice(0, 16);

  /* ---------------------------------------------------------- resolving */

  /** Turn a set of a/b choices into the seed each game was predicted to
      produce. Same walk as Bracket.solve, but driven by choices rather
      than by scores — so a person's bracket resolves even before a single
      game has been played. */
  function resolve(picks) {
    const out = {};
    const slot = ref => {
      if (ref.seed != null) return STATE.seeds[ref.seed - 1] ? ref.seed : null;
      const prev = out[ref.win];
      return prev ? prev.winner : null;
    };
    GAMES.forEach((g, i) => {
      const a = slot(g.a), b = slot(g.b);
      const choice = picks[i] ? 'b' : 'a';
      const winner = choice === 'b' ? b : a;
      out[g.id] = { a, b, choice, winner };
    });
    return out;
  }

  /** The champion this entry predicted. */
  const championOf = picks => resolve(picks).nc.winner;

  /* ----------------------------------------------------------- scoring */

  /** Score one entry against whatever results have actually been entered.

      A game only scores once it has been played, so the leaderboard is
      live and honest the whole way through — nobody is being marked down
      for a game that has not kicked off. */
  function score(picks, results) {
    const actual = Bracket.solve(results);
    const mine = resolve(picks);
    let points = 0, correct = 0, possible = 0, played = 0;
    const perGame = {};

    GAMES.forEach(g => {
      const truth = actual[g.id].winner;
      const pick = mine[g.id].winner;
      const worth = ROUND_INFO[g.round].points;
      let st = 'open';
      if (truth) {
        played++;
        if (pick && pick === truth) { points += worth; correct++; st = 'hit'; }
        else st = 'miss';
      } else if (pick) {
        /* Still alive only if the team they picked has not already lost. */
        st = stillAlive(pick, actual) ? 'alive' : 'dead';
        if (st === 'alive') possible += worth;
      }
      perGame[g.id] = { pick, truth, worth, status: st };
    });

    return { points, correct, played, possible, ceiling: points + possible, perGame };
  }

  /** Has this seed lost a game already? */
  function stillAlive(seed, actual) {
    return !GAMES.some(g => actual[g.id].loser === seed);
  }

  /* ---------------------------------------------------------- the book */

  function all() {
    try {
      const v = JSON.parse(localStorage.getItem(KEY) || '[]');
      return Array.isArray(v) ? v : [];
    } catch (e) { return []; }
  }

  function write(list) {
    try {
      localStorage.setItem(KEY, JSON.stringify(list.slice(0, 60)));
      document.dispatchEvent(new CustomEvent('cfp:local-change', { detail: { source: 'pickem' } }));
    } catch (e) {}
  }

  function replace(list) { write(Array.isArray(list) ? list : []); }

  /** Add an entry from its code. One entry per name — pasting a newer
      code for somebody replaces their old one rather than entering them
      twice, which is what happens when a person fixes a typo and sends
      it again. */
  function add(code) {
    const e = decode(code);
    if (!e) return null;
    const list = all().filter(x => x.name !== e.name);
    list.push({ name: e.name, picks: e.picks, code: e.code, addedAt: Date.now() });
    write(list);
    return e;
  }

  function remove(name) { write(all().filter(x => x.name !== name)); }
  function clear() { write([]); }

  /** Everybody, sorted by points then by what they can still reach. */
  function leaderboard(results) {
    return all()
      .map(e => Object.assign({}, e, score(e.picks, results)))
      .sort((a, b) => b.points - a.points || b.ceiling - a.ceiling ||
                      a.name.localeCompare(b.name));
  }

  /** The most-picked champion, which is the fun stat to read out. */
  function consensus() {
    const tally = {};
    all().forEach(e => {
      const c = championOf(e.picks);
      if (c) tally[c] = (tally[c] || 0) + 1;
    });
    return Object.entries(tally)
      .map(([seed, n]) => ({ seed: +seed, n }))
      .sort((a, b) => b.n - a.n);
  }

  const maxPoints = () =>
    GAMES.reduce((n, g) => n + ROUND_INFO[g.round].points, 0);

  return { encode, decode, resolve, championOf, score, all, add, remove,
           clear, replace, leaderboard, consensus, maxPoints, cleanName };
})();

/* =====================================================================
   THE SCREENS THAT COME AFTER SELECTION NIGHT

     Results    enter the scores, watch the bracket advance
     Pick'em    the league predicts it, the commissioner scores it
     History    every season this dynasty has finished
     Export     the bracket as one image
     Premiere   a countdown so everybody presses play together

   Rules live in dynasty.js and pickem.js. This file only paints.
   ===================================================================== */
const Dynasty = (() => {

  /* A small banner in a fixed-height wrapper — the plates size themselves
     off --bh, so a context that wants them smaller just says so. */
  function plate(id, h, flip) {
    const w = document.createElement('div');
    w.className = 'dy-plate';
    if (h) w.style.setProperty('--bh', h + 'px');
    w.appendChild(bannerEl(id, { flip: !!flip }));
    return w;
  }

  const seedTeam = n => {
    const s = STATE.seeds[n - 1];
    return s ? team(s.id) : null;
  };

  /* A changed winner invalidates every score or prediction fed by that game.
     Walking the graph keeps the reset surgical: the other side of the bracket
     is never touched. */
  function downstreamGames(gameId) {
    const affected = new Set([gameId]);
    let changed = true;
    while (changed) {
      changed = false;
      GAMES.forEach(g => {
        if (affected.has(g.id)) return;
        if ((g.a.win && affected.has(g.a.win)) || (g.b.win && affected.has(g.b.win))) {
          affected.add(g.id); changed = true;
        }
      });
    }
    affected.delete(gameId);
    return [...affected];
  }

  function clearDownstreamResults(gameId) {
    downstreamGames(gameId).forEach(id => { delete STATE.results[id]; });
  }

  function clearDownstreamProjection(gameId) {
    downstreamGames(gameId).forEach(id => {
      const index = GAMES.findIndex(g => g.id === id);
      if (index >= 0) myPicks[index] = null;
      delete STATE.projectionScores[id];
    });
  }

  /* ======================================================================
     RESULTS — play the bracket out
     ====================================================================== */

  function renderResults() {
    const wrap = $('#resultsBody');
    if (!wrap) return;
    wrap.innerHTML = '';
    wrap.className = 'playoff-bracket-board result-bracket-board';

    const solved = Bracket.solve();
    const rounds = ['r1', 'qf', 'sf', 'nc'];

    /* champion banner across the top, once there is one */
    const champSeed = solved.nc.winner;
    const crown = $('#resCrown');
    if (champSeed) {
      const s = STATE.seeds[champSeed - 1];
      crown.innerHTML = '';
      crown.classList.add('on');
      const k = document.createElement('div');
      k.className = 'crown-kick';
      k.textContent = `${STATE.season} National Champion`;
      const b = plate(s.id, 74);
      b.classList.add('crown-plate');
      const n = document.createElement('div');
      n.className = 'crown-sub';
      n.textContent = `No. ${champSeed} seed · ${team(s.id).conf}`;
      crown.append(k, b, n);
    } else {
      crown.classList.remove('on');
      crown.innerHTML = '';
    }

    rounds.forEach(r => {
      const games = GAMES.filter(g => g.round === r);
      const sec = document.createElement('section');
      sec.className = 'res-round r-' + r;

      const head = document.createElement('div');
      head.className = 'res-head';
      head.innerHTML = `<b>${esc(ROUND_INFO[r].label)}</b>` +
        `<span>${games.length} game${games.length === 1 ? '' : 's'}</span>`;
      sec.appendChild(head);

      const grid = document.createElement('div');
      grid.className = 'res-grid';
      games.forEach(g => grid.appendChild(gameCard(g, solved)));
      sec.appendChild(grid);
      wrap.appendChild(sec);
    });

    const done = Bracket.played();
    $('#resProgress').textContent = `${done} of ${GAMES.length} played`;
    const bar = $('#resBar');
    if (bar) bar.style.width = (done / GAMES.length * 100).toFixed(1) + '%';
  }

  function gameCard(g, solved) {
    const st = solved[g.id];
    const card = document.createElement('div');
    card.className = 'gcard' + (st.winner ? ' done' : '') +
                     (st.a && st.b && !st.winner ? ' live' : '') +
                     (st.decidedBy === 'advance' ? ' manual' : '');
    card.dataset.game = g.id;

    const h = document.createElement('div');
    h.className = 'g-head';
    const where = g.site === 'campus' && st.a
      ? `at ${(seedTeam(st.a) || {}).school || 'the higher seed'}`
      : g.site === 'campus' ? 'campus site' : 'tap a team or enter score';
    h.innerHTML = `<b>${esc(g.name)}</b><span>${esc(where)}</span>`;
    card.appendChild(h);

    card.appendChild(sideRow(g, st, 'a'));
    card.appendChild(sideRow(g, st, 'b'));

    return card;
  }

  function sideRow(g, st, which) {
    const seedNo = st[which];
    const row = document.createElement('div');
    row.className = 'g-side';
    if (st.winner) row.classList.add(st.winner === seedNo ? 'won' : 'lost');
    if (seedNo) {
      row.classList.add('can-advance');
      row.tabIndex = 0;
      row.setAttribute('role', 'button');
    }

    const n = document.createElement('span');
    n.className = 'g-seed';
    n.textContent = seedNo || '';
    row.appendChild(n);

    if (seedNo && STATE.seeds[seedNo - 1]) {
      row.appendChild(plate(STATE.seeds[seedNo - 1].id, 40));
    } else {
      const ph = document.createElement('div');
      ph.className = 'dy-plate empty';
      ph.textContent = Bracket.slotName(seedNo, st, g[which]);
      row.appendChild(ph);
    }

    const advance = document.createElement('span');
    advance.className = 'g-advance';
    advance.textContent = st.winner === seedNo ? 'ADVANCED' : 'ADVANCE';
    advance.setAttribute('aria-hidden', 'true');
    row.appendChild(advance);

    const inp = document.createElement('input');
    inp.className = 'g-score';
    inp.type = 'text';
    inp.inputMode = 'numeric';
    inp.maxLength = 3;
    inp.placeholder = '—';
    inp.disabled = !seedNo;
    inp.dataset.game = g.id;
    inp.dataset.side = which;
    inp.setAttribute('aria-label', seedNo && STATE.seeds[seedNo - 1]
      ? `${team(STATE.seeds[seedNo - 1].id).school} score in ${g.name}`
      : `Score in ${g.name}`);
    inp.value = (STATE.results[g.id] || {})[which] ?? '';
    inp.onclick = event => event.stopPropagation();
    inp.onkeydown = event => event.stopPropagation();
    inp.oninput = () => {
      const before = Bracket.solve()[g.id].winner;
      inp.value = inp.value.replace(/[^0-9]/g, '');
      STATE.results[g.id] = Object.assign({}, STATE.results[g.id]);
      STATE.results[g.id][which] = inp.value;
      delete STATE.results[g.id].w;
      const after = Bracket.solve()[g.id].winner;
      if (before !== after) clearDownstreamResults(g.id);
      persist();
      if (after && after !== before) {
        const winner = seedTeam(after);
        CFPFoundation.live.announce(`${g.name} finalized. ${winner?.school || 'Winner'} advances.`);
      }
      scheduleResultsPaint();
    };
    row.appendChild(inp);

    const advanceTeam = () => {
      if (!seedNo) return;
      const before = Bracket.solve()[g.id].winner;
      const result = Object.assign({}, STATE.results[g.id]);
      const other = which === 'a' ? 'b' : 'a';
      const selectedScore = Bracket.numOrNull(result[which]);
      const otherScore = Bracket.numOrNull(result[other]);
      /* If a completed score points the other way, a deliberate tap updates
         the visible score too so the bracket can never contradict itself. */
      if (selectedScore !== null && otherScore !== null && selectedScore <= otherScore)
        result[which] = String(otherScore + 1);
      result.w = which;
      STATE.results[g.id] = result;
      const after = Bracket.solve()[g.id].winner;
      if (before !== after) clearDownstreamResults(g.id);
      persist(); renderResults();
      const winner = seedTeam(after);
      CFPFoundation.live.announce(`${g.name} finalized. ${winner?.school || 'Winner'} advances.`);
    };
    row.onclick = advanceTeam;
    row.onkeydown = event => {
      if (event.key === 'Enter' || event.key === ' ') {
        event.preventDefault(); advanceTeam();
      }
    };

    return row;
  }

  /* Repainting on every keystroke steals focus from the box being typed
     into, so the redraw waits for a pause and then puts the caret back. */
  let paintTimer = null;
  function scheduleResultsPaint() {
    clearTimeout(paintTimer);
    paintTimer = setTimeout(() => {
      const act = document.activeElement;
      const mark = act && act.classList.contains('g-score')
        ? `${act.dataset.game || ''}:${act.dataset.side || ''}` : '';
      renderResults();
      if (mark) {
        const [game, side] = mark.split(':');
        const back = document.querySelector(`.g-score[data-game="${game}"][data-side="${side}"]`);
        if (back) { back.focus(); back.setSelectionRange(back.value.length, back.value.length); }
      }
    }, 420);
  }

  async function clearResults(event) {
    if (!Object.keys(STATE.results || {}).length) return;
    const before = CFPFoundation.actions.clone(STATE.results);
    const accepted = await CFPFoundation.actions.confirm({
      title: 'Clear every playoff score?',
      message: 'All finalized games and the current champion will be removed. You can undo this afterward.',
      confirmLabel: 'Clear scores',
      trigger: event?.currentTarget,
    });
    if (!accepted) return;
    STATE.results = {};
    persist(); renderResults();
    toast('Results cleared');
    CFPFoundation.live.announce('All playoff scores were cleared');
    CFPFoundation.actions.undo('Scores cleared', () => {
      STATE.results = CFPFoundation.actions.clone(before);
      persist(); renderResults();
    });
  }

  /* ======================================================================
     PICK'EM
     ====================================================================== */

  let myPicks = [];
  let pickMode = 'make';                 // 'make' | 'board'
  let projectionPaintTimer = null;

  function saveProjection() {
    STATE.projectionPicks = myPicks.slice(0, GAMES.length);
    while (STATE.projectionPicks.length < GAMES.length) STATE.projectionPicks.push(null);
    STATE.projectionScores = STATE.projectionScores || {};
    persist();
  }

  function renderPickem() {
    $$('#pickem .pk-tab').forEach(b =>
      b.classList.toggle('on', b.dataset.mode === pickMode));
    $('#pkMake').hidden = pickMode !== 'make';
    $('#pkBoard').hidden = pickMode !== 'board';
    if (pickMode === 'make') renderPickForm(); else renderBoard();
  }

  function renderPickForm() {
    const wrap = $('#pkGames');
    wrap.innerHTML = '';
    wrap.className = 'playoff-bracket-board projection-bracket-board';
    const mine = Pickem.resolve(myPicks);

    ['r1', 'qf', 'sf', 'nc'].forEach(r => {
      const games = GAMES.filter(g => g.round === r);
      const section = document.createElement('section');
      section.className = 'res-round projection-round r-' + r;
      const head = document.createElement('div');
      head.className = 'res-head pk-round';
      head.innerHTML = `<b>${esc(ROUND_INFO[r].label)}</b>` +
        `<span>${ROUND_INFO[r].points} pt${ROUND_INFO[r].points === 1 ? '' : 's'} each</span>`;
      section.appendChild(head);

      const grid = document.createElement('div');
      grid.className = 'res-grid';
      games.forEach(g => {
        const i = GAMES.indexOf(g);
        const st = mine[g.id];
        grid.appendChild(projectionGameCard(g, i, st, mine));
      });
      section.appendChild(grid);
      wrap.appendChild(section);
    });
    updateCode();
  }

  function projectionGameCard(g, index, st, mine) {
    const card = document.createElement('div');
    card.className = 'gcard projection-card' + (st.winner ? ' picked' : '') +
      (st.a && st.b && !st.winner ? ' live' : '');
    card.dataset.game = g.id;

    const head = document.createElement('div');
    head.className = 'g-head';
    const where = g.site === 'campus' && st.a
      ? `at ${(seedTeam(st.a) || {}).school || 'the higher seed'}`
      : `${ROUND_INFO[g.round].points} point${ROUND_INFO[g.round].points === 1 ? '' : 's'}`;
    head.innerHTML = `<b>${esc(g.name)}</b><span>${esc(where)}</span>`;
    card.appendChild(head);
    card.appendChild(projectionSideRow(g, index, st, mine, 'a'));
    card.appendChild(projectionSideRow(g, index, st, mine, 'b'));
    return card;
  }

  function projectionSideRow(g, index, st, mine, side) {
    const seedNo = st[side];
    const row = document.createElement('div');
    row.className = 'g-side prediction-side' + (st.choice === side ? ' won selected' : '') +
      (st.choice && st.choice !== side ? ' lost' : '');
    if (seedNo) {
      row.classList.add('can-advance');
      row.tabIndex = 0;
      row.setAttribute('role', 'button');
    }

    const seed = document.createElement('span');
    seed.className = 'g-seed';
    seed.textContent = seedNo || '';
    row.appendChild(seed);

    if (seedNo && STATE.seeds[seedNo - 1]) {
      row.appendChild(plate(STATE.seeds[seedNo - 1].id, 40));
    } else {
      const placeholder = document.createElement('div');
      placeholder.className = 'dy-plate empty';
      placeholder.textContent = Bracket.slotName(seedNo, mine, g[side]);
      row.appendChild(placeholder);
    }

    const advance = document.createElement('span');
    advance.className = 'g-advance';
    advance.textContent = st.choice === side ? 'PICKED' : 'PICK';
    advance.setAttribute('aria-hidden', 'true');
    row.appendChild(advance);

    const input = document.createElement('input');
    input.className = 'g-score projection-score';
    input.type = 'text';
    input.inputMode = 'numeric';
    input.maxLength = 3;
    input.placeholder = '—';
    input.disabled = !seedNo;
    input.dataset.game = g.id;
    input.dataset.side = side;
    input.setAttribute('aria-label', seedNo && STATE.seeds[seedNo - 1]
      ? `${team(STATE.seeds[seedNo - 1].id).school} predicted score in ${g.name}`
      : `Predicted score in ${g.name}`);
    input.value = (STATE.projectionScores[g.id] || {})[side] ?? '';
    input.onclick = event => event.stopPropagation();
    input.onkeydown = event => event.stopPropagation();
    input.oninput = () => {
      input.value = input.value.replace(/[^0-9]/g, '');
      STATE.projectionScores[g.id] = Object.assign({}, STATE.projectionScores[g.id]);
      STATE.projectionScores[g.id][side] = input.value;
      const score = STATE.projectionScores[g.id];
      const a = Bracket.numOrNull(score.a), b = Bracket.numOrNull(score.b);
      const previous = myPicks[index];
      if (st.a && st.b && a !== null && b !== null && a !== b)
        myPicks[index] = a > b ? 0 : 1;
      if (previous !== myPicks[index]) clearDownstreamProjection(g.id);
      saveProjection();
      if (previous !== myPicks[index] && myPicks[index] !== null)
        CFPFoundation.live.announce(`${g.name} projection saved`);
      scheduleProjectionPaint(input);
    };
    row.appendChild(input);

    const choose = () => {
      if (!seedNo) return;
      const choice = side === 'b' ? 1 : 0;
      if (myPicks[index] !== choice) clearDownstreamProjection(g.id);
      myPicks[index] = choice;
      saveProjection(); renderPickForm();
      CFPFoundation.live.announce(`${g.name} projection saved`);
    };
    row.onclick = choose;
    row.onkeydown = event => {
      if (event.key === 'Enter' || event.key === ' ') {
        event.preventDefault(); choose();
      }
    };
    return row;
  }

  function scheduleProjectionPaint(activeInput) {
    clearTimeout(projectionPaintTimer);
    const mark = `${activeInput.dataset.game}:${activeInput.dataset.side}`;
    projectionPaintTimer = setTimeout(() => {
      renderPickForm();
      const [game, side] = mark.split(':');
      const back = document.querySelector(`.projection-score[data-game="${game}"][data-side="${side}"]`);
      if (back) { back.focus(); back.setSelectionRange(back.value.length, back.value.length); }
    }, 420);
  }

  function updateCode() {
    const name = $('#pkName').value;
    const champ = Pickem.championOf(myPicks);
    const t = champ && seedTeam(champ);
    const picked = myPicks.filter(value => value === 0 || value === 1).length;
    const complete = picked === GAMES.length && !!champ;
    const scored = Object.values(STATE.projectionScores || {}).some(score =>
      score && (score.a !== '' && score.a != null || score.b !== '' && score.b != null));
    $('#pkChampion').innerHTML = complete && t
      ? `Your champion: <b>${esc(t.school)}</b>${scored ? ' · predicted scores included' : ''}`
      : `${picked} of ${GAMES.length} winners picked. Tap a team to advance it.`;
    $('#pkCode').value = name.trim() && complete
      ? Pickem.encode(name, myPicks, STATE.projectionScores) : '';
    $('#pkCode').placeholder = complete ? 'add your name' : 'finish every round to unlock';
    $('#pkCopy').disabled = !name.trim() || !complete;
    $('#pkCount').textContent = `${picked}/${GAMES.length} picks`;
  }

  function renderBoard() {
    const wrap = $('#pkTable');
    wrap.innerHTML = '';
    const rows = Pickem.leaderboard();
    const max = Pickem.maxPoints();

    if (!rows.length) {
      wrap.innerHTML =
        '<p class="dy-empty">No entries yet. Everyone in the league makes their ' +
        'picks on the other tab, sends you the code, and you paste them in above.</p>';
    } else {
      const table = document.createElement('div');
      table.className = 'lb';
      const head = document.createElement('div');
      head.className = 'lb-row lb-head';
      head.innerHTML = '<span class="lb-pos">#</span><span class="lb-name">Name</span>' +
        '<span class="lb-champ">Their champion</span><span class="lb-pts">Pts</span>' +
        '<span class="lb-max">Max</span><span class="lb-x"></span>';
      table.appendChild(head);

      rows.forEach((e, i) => {
        const champ = Pickem.championOf(e.picks);
        const t = champ && seedTeam(champ);
        const alive = champ && !GAMES.some(g => Bracket.solve()[g.id].loser === champ);
        const r = document.createElement('div');
        r.className = 'lb-row' + (i === 0 && e.points ? ' lead' : '');
        r.innerHTML =
          `<span class="lb-pos">${i + 1}</span>` +
          `<span class="lb-name">${esc(e.name.replace(/_/g, ' '))}</span>` +
          `<span class="lb-champ${alive ? '' : ' out'}">${t ? esc(t.school) : '—'}</span>` +
          `<span class="lb-pts">${e.points}</span>` +
          `<span class="lb-max">${e.ceiling}<i>/${max}</i></span>`;
        const x = document.createElement('button');
        x.className = 'lb-x'; x.innerHTML = '&times;'; x.title = 'Remove entry';
        x.onclick = () => { Pickem.remove(e.name); renderBoard(); };
        r.appendChild(x);
        table.appendChild(r);
      });
      wrap.appendChild(table);

      const con = Pickem.consensus();
      if (con.length) {
        const c = document.createElement('div');
        c.className = 'lb-consensus';
        c.innerHTML = '<b>Consensus pick</b>' + con.slice(0, 3).map(x => {
          const t = seedTeam(x.seed);
          return `<span>${t ? esc(t.school) : 'No. ' + x.seed} ` +
                 `<i>${x.n} vote${x.n === 1 ? '' : 's'}</i></span>`;
        }).join('');
        wrap.appendChild(c);
      }
    }

    $('#pkCount').textContent = rows.length
      ? `${rows.length} entr${rows.length === 1 ? 'y' : 'ies'}` : '';
  }

  function addEntry() {
    const code = $('#pkPaste').value.trim();
    if (!code) return;
    /* people paste a whole chat line — take every code-shaped thing in it */
    const found = code.match(/[A-Z0-9_ ]{1,16}-[0-9A-Z]+(?:~[0-9A-Z._]+)?/gi) || [];
    let n = 0;
    found.forEach(c => { if (Pickem.add(c)) n++; });
    if (!n) { toast('That does not look like an entry code'); return; }
    $('#pkPaste').value = '';
    renderBoard();
    toast(`${n} entr${n === 1 ? 'y' : 'ies'} added`);
  }

  /* ======================================================================
     HISTORY
     ====================================================================== */

  function renderHistory() {
    const wrap = $('#histBody');
    if (!wrap) return;
    wrap.innerHTML = '';

    const list = History.all();
    if (!list.length) {
      wrap.innerHTML =
        '<p class="dy-empty">Nothing archived yet. Finish the show and archive ' +
        'the season. Every playoff you run lands here — field, bracket and champion.</p>';
      $('#histRoll').innerHTML = '';
      return;
    }

    list.forEach(h => {
      const champSeed = h.champion;
      const cs = champSeed && h.seeds[champSeed - 1];

      const card = document.createElement('article');
      card.className = 'hist-card' + (cs ? ' crowned' : '');

      const head = document.createElement('div');
      head.className = 'hc-head';
      head.innerHTML = `<b>${esc(h.season)}</b><span>${esc(h.league)}</span>`;
      card.appendChild(head);

      if (cs) {
        const w = document.createElement('div');
        w.className = 'hc-champ';
        w.innerHTML = '<i>Champion</i>';
        w.appendChild(plate(cs.id, 46));
        card.appendChild(w);
      } else {
        const w = document.createElement('div');
        w.className = 'hc-champ pending';
        w.innerHTML = '<i>Champion</i><span>not played out</span>';
        card.appendChild(w);
      }

      const field = document.createElement('div');
      field.className = 'hc-field';
      h.seeds.filter(Boolean).slice(0, 12).forEach((s, i) => {
        const chip = document.createElement('span');
        chip.className = 'hc-chip' + (i < 4 ? ' bye' : '');
        const t = TEAM_BY_ID[s.id];
        chip.innerHTML = `<i>${i + 1}</i>${esc(t ? t.abbr : s.id)}`;
        field.appendChild(chip);
      });
      card.appendChild(field);

      const acts = document.createElement('div');
      acts.className = 'hc-acts';
      const load = document.createElement('button');
      load.className = 'btn ghost sm';
      load.textContent = 'Load this season';
      load.onclick = async event => {
        const before = fieldSnapshot();
        const accepted = await CFPFoundation.actions.confirm({
          title: `Load the ${h.season} field?`,
          message: 'This replaces the current working board and scores with the archived season. You can undo it afterward.',
          confirmLabel: 'Load season',
          trigger: event.currentTarget,
        });
        if (!accepted) return;
        History.restoreSeason(h.savedAt);
        persist(); renderPool(); renderSeeds(); Movement.refresh();
        toast(`${h.season} loaded`);
        CFPFoundation.actions.undo(`${h.season} loaded`, () => restoreFieldSnapshot(before));
        showScreen('room');
      };
      const del = document.createElement('button');
      del.className = 'btn ghost sm danger';
      del.textContent = 'Delete';
      del.onclick = async event => {
        const before = History.all();
        const accepted = await CFPFoundation.actions.confirm({
          title: `Delete ${h.season} from history?`,
          message: 'The archived season will be removed from Dynasty History. You can undo it afterward.',
          confirmLabel: 'Delete archive',
          trigger: event.currentTarget,
        });
        if (!accepted) return;
        History.remove(h.savedAt); renderHistory();
        CFPFoundation.live.announce(`${h.season} archive deleted`);
        CFPFoundation.actions.undo(`${h.season} archive deleted`, () => {
          History.replace(before); renderHistory();
        });
      };
      acts.append(load, del);
      card.appendChild(acts);

      wrap.appendChild(card);
    });

    /* roll of honour */
    const roll = History.rollOfHonour();
    const rw = $('#histRoll');
    rw.innerHTML = '';
    if (roll.length) {
      const h = document.createElement('h3');
      h.textContent = 'ROLL OF HONOUR';
      rw.appendChild(h);
      const g = document.createElement('div');
      g.className = 'roll-grid';
      roll.forEach(r => {
        const t = TEAM_BY_ID[r.id];
        const d = document.createElement('div');
        d.className = 'roll-row';
        d.appendChild(plate(r.id, 42));
        const n = document.createElement('span');
        n.className = 'roll-n';
        n.innerHTML = `<b>${r.n}</b>${r.n === 1 ? 'title' : 'titles'}` +
                      `<i>${r.titles.join(', ')}</i>`;
        d.appendChild(n);
        g.appendChild(d);
      });
      rw.appendChild(g);
    }
  }

  /* ======================================================================
     EXPORT
     ====================================================================== */

  async function openExport() {
    const m = $('#mExport');
    m.classList.add('on');
    const img = $('#exImg');
    const note = $('#exNote');
    img.removeAttribute('src');
    img.classList.remove('ready');
    note.textContent = 'Drawing the bracket…';
    $('#exSave').disabled = true;
    $('#exShare').hidden = !BracketImage.canShare();
    $('#exShare').disabled = true;

    try {
      const url = await BracketImage.preview();
      if (!url) throw new Error('tainted');
      img.src = url;
      img.classList.add('ready');
      note.textContent = '1920 × 1080 — ready to drop into the group chat.';
      $('#exSave').disabled = false;
      $('#exShare').disabled = false;
    } catch (e) {
      note.innerHTML = 'Could not build the image. If you are pulling logos ' +
        'from a URL pattern, that host has to allow cross-origin reads — ' +
        'importing the files instead always works.';
    }
  }

  /* ======================================================================
     PREMIERE — everybody presses play at the same moment
     ====================================================================== */

  let preTimer = null;

  /** ms until the premiere, or null when there isn't one / it has passed. */
  function untilPremiere() {
    if (!STATE.premiere) return null;
    const left = STATE.premiere - Date.now();
    return left > 0 ? left : null;
  }

  function fmtLeft(ms) {
    const s = Math.max(0, Math.round(ms / 1000));
    const d = Math.floor(s / 86400), h = Math.floor(s % 86400 / 3600);
    const m = Math.floor(s % 3600 / 60), sec = s % 60;
    if (d) return `${d}d ${h}h ${String(m).padStart(2, '0')}m`;
    if (h) return `${h}:${String(m).padStart(2, '0')}:${String(sec).padStart(2, '0')}`;
    return `${m}:${String(sec).padStart(2, '0')}`;
  }

  /** Drive the countdown that sits on the play gate. */
  function watchPremiere() {
    clearInterval(preTimer);
    const box = $('#preCount');
    if (!box) return;

    const paint = () => {
      const left = untilPremiere();
      const gate = $('#gate');
      if (left == null) {
        box.classList.remove('on');
        document.body.classList.remove('prelocked');
        clearInterval(preTimer);
        /* the moment it unlocks, say so — a countdown that just vanishes
           leaves people wondering whether they missed it */
        if (STATE.premiere && gate && gate.style.display !== 'none' && !prePopped) {
          prePopped = true;
          toast('It is time — press play');
          try { Show.sfx.stinger(659.25); } catch (e) {}
        }
        return;
      }
      document.body.classList.add('prelocked');
      box.classList.add('on');
      $('#preClock').textContent = fmtLeft(left);
      $('#preWhen').textContent = new Date(STATE.premiere)
        .toLocaleString([], { weekday: 'short', month: 'short', day: 'numeric',
                              hour: 'numeric', minute: '2-digit' });
    };
    let prePopped = false;
    paint();
    preTimer = setInterval(paint, 1000);
  }

  function savePremiere() {
    const v = $('#fPremiere').value;
    STATE.premiere = v ? new Date(v).getTime() : 0;
    persist();
    watchPremiere();
    toast(STATE.premiere ? 'Premiere set' : 'Premiere cleared');
  }

  /* ======================================================================
     THE CHROME — ESPN's scores strip and nav

     Their strip is a horizontal rail of small cells, each one two team
     rows with an abbreviation and a number, under a status line. Before
     anything has kicked off it carries the fixtures; afterwards it carries
     the scores. Ours does the same thing with the eleven playoff games,
     and falls back to the seeded field when the bracket is still empty.
     ====================================================================== */

  function renderStrip() {
    const track = $('#ssTrack');
    if (!track) return;
    const oldScroll = track.scrollLeft;
    const oldSignature = track.dataset.fieldSignature || '';
    const fieldSignature = STATE.seeds.map(s => s ? s.id : '-').join('|');
    track.innerHTML = '';

    const solved = Bracket.solve();
    const anySeeded = STATE.seeds.some(Boolean);

    if (!anySeeded) {
      track.dataset.fieldSignature = fieldSignature;
      track.innerHTML = '<span class="ss-empty">No field set &mdash; ' +
        'build one in the committee room</span>';
      return;
    }

    /* Until a playoff result exists, this is a live field ribbon—not a list
       of hypothetical games. Showing seeds in order means a new No. 1, No. 2,
       etc. appears immediately instead of being buried after the four opening
       round pairings. Two teams per cell keeps all twelve easy to scan. */
    if (!Bracket.played()) {
      let changedSeed = -1;
      if (oldSignature && oldSignature !== fieldSignature) {
        const before = oldSignature.split('|');
        const after = fieldSignature.split('|');
        changedSeed = after.findIndex((id, i) => id !== before[i]);
      }

      for (let first = 0; first < 12; first += 2) {
        const cell = document.createElement('button');
        cell.className = 'ss-cell field-cell';
        cell.dataset.firstSeed = first;
        cell.onclick = () => showScreen('room');
        cell.innerHTML = `<span class="ss-status">CURRENT FIELD · ${first + 1}—${first + 2}</span>`;

        [first, first + 1].forEach(seedIndex => {
          const selection = STATE.seeds[seedIndex];
          const t = selection && team(selection.id);
          const row = document.createElement('span');
          row.className = 'ss-row' + (selection ? ' filled' : ' empty');
          row.innerHTML =
            `<i class="ss-rank">${seedIndex + 1}</i>` +
            `<b class="ss-abbr">${t ? esc(t.abbr) : '&mdash;'}</b>` +
            `<u class="ss-num"></u>`;
          cell.appendChild(row);
        });
        track.appendChild(cell);
      }

      track.dataset.fieldSignature = fieldSignature;
      requestAnimationFrame(() => {
        if (changedSeed >= 0) {
          const cell = track.querySelector(
            `.field-cell[data-first-seed="${Math.floor(changedSeed / 2) * 2}"]`);
          if (cell) {
            cell.classList.add('updated');
            const left = cell.offsetLeft - track.offsetLeft -
              Math.max(0, (track.clientWidth - cell.offsetWidth) / 2);
            track.scrollTo({ left: Math.max(0, left), behavior: 'smooth' });
          }
        } else {
          track.scrollLeft = Math.min(oldScroll, Math.max(0, track.scrollWidth - track.clientWidth));
        }
      });
      return;
    }

    track.dataset.fieldSignature = fieldSignature;

    GAMES.forEach(g => {
      const st = solved[g.id];
      const cell = document.createElement('button');
      cell.className = 'ss-cell' + (st.winner ? ' final' : st.a && st.b ? ' ready' : '');
      cell.onclick = () => showScreen('results');

      const status = st.winner ? 'Final'
        : (st.a && st.b) ? ROUND_INFO[g.round].label
        : g.name;
      cell.innerHTML = `<span class="ss-status">${esc(status)}</span>`;

      ['a', 'b'].forEach(side => {
        const seedNo = st[side];
        const row = document.createElement('span');
        row.className = 'ss-row' +
          (st.winner ? (st.winner === seedNo ? ' w' : ' l') : '');
        const t = seedNo && seedTeam(seedNo);
        row.innerHTML =
          `<i class="ss-rank">${seedNo || ''}</i>` +
          `<b class="ss-abbr">${t ? esc(t.abbr) : '&mdash;'}</b>` +
          `<u class="ss-num">${st[side === 'a' ? 'sa' : 'sb'] ?? ''}</u>`;
        cell.appendChild(row);
      });

      track.appendChild(cell);
    });

    requestAnimationFrame(() => {
      track.scrollLeft = Math.min(oldScroll, Math.max(0, track.scrollWidth - track.clientWidth));
    });
  }

  /** Which nav item is lit. */
  function markNav(name) {
    $$('#enLinks button').forEach(b =>
      b.classList.toggle('on', b.dataset.go === name));
  }

  /* ======================================================================
     WIRING
     ====================================================================== */

  function init() {
    STATE.results = STATE.results || {};
    STATE.projectionScores = STATE.projectionScores || {};
    myPicks = Array.isArray(STATE.projectionPicks) && STATE.projectionPicks.length === GAMES.length
      ? STATE.projectionPicks.map(value => value === 0 || value === 1 ? value : null)
      : new Array(GAMES.length).fill(null);
    STATE.projectionPicks = myPicks.slice();

    /* ---- results ---- */
    $('#resClear').onclick = clearResults;
    $('#resRoom').onclick = () => showScreen('room');
    $('#resBracketBtn').onclick = () => showScreen('final');
    $('#resArchive').onclick = async event => {
      const before = History.all();
      const accepted = await CFPFoundation.actions.confirm({
        title: `Archive the ${STATE.season} season?`,
        message: 'This stores the current field, scores, and champion in Dynasty History. Re-archiving the same season replaces its earlier snapshot.',
        confirmLabel: 'Archive season',
        danger: false,
        trigger: event.currentTarget,
      });
      if (!accepted) return;
      History.save(); Movement.refresh();
      toast(`${STATE.season} archived`);
      CFPFoundation.live.announce(`${STATE.season} season archived`);
      CFPFoundation.actions.undo(`${STATE.season} archived`, () => History.replace(before));
    };

    /* ---- pick'em ---- */
    $$('#pickem .pk-tab').forEach(b => b.onclick = () => {
      pickMode = b.dataset.mode; renderPickem();
    });
    $('#pkName').oninput = updateCode;
    $('#pkCopy').onclick = async () => {
      const code = $('#pkCode').value;
      if (!code) return;
      try { await navigator.clipboard.writeText(code); toast('Entry copied — send it to your commissioner'); }
      catch (e) { $('#pkCode').select(); toast('Press Ctrl+C to copy'); }
    };
    $('#pkAdd').onclick = addEntry;
    $('#pkReset').onclick = async event => {
      if (!myPicks.some(value => value === 0 || value === 1) &&
          !Object.keys(STATE.projectionScores).length) return;
      const before = {
        picks: myPicks.slice(),
        scores: CFPFoundation.actions.clone(STATE.projectionScores),
      };
      const accepted = await CFPFoundation.actions.confirm({
        title: 'Reset this projection?',
        message: 'All predicted winners and scores in your projection will be cleared. You can undo it afterward.',
        confirmLabel: 'Reset projection',
        trigger: event.currentTarget,
      });
      if (!accepted) return;
      myPicks = new Array(GAMES.length).fill(null);
      STATE.projectionScores = {};
      saveProjection(); renderPickForm();
      toast('Projection reset');
      CFPFoundation.live.announce('Projection reset');
      CFPFoundation.actions.undo('Projection reset', () => {
        myPicks = before.picks.slice();
        STATE.projectionScores = CFPFoundation.actions.clone(before.scores);
        saveProjection(); renderPickForm();
      });
    };
    $('#pkClear').onclick = async event => {
      const before = Pickem.all();
      if (!before.length) return;
      const accepted = await CFPFoundation.actions.confirm({
        title: 'Remove every league entry?',
        message: 'All submitted projection entries will be removed from the leaderboard. You can undo it afterward.',
        confirmLabel: 'Clear entries',
        trigger: event.currentTarget,
      });
      if (!accepted) return;
      Pickem.clear(); renderBoard(); toast('Entries cleared');
      CFPFoundation.actions.undo('Projection entries cleared', () => {
        Pickem.replace(before); renderBoard();
      });
    };
    $('#pkRoom').onclick = () => showScreen(VIEWER ? 'show' : 'room');

    /* ---- history ---- */
    $('#histRoom').onclick = () => showScreen(VIEWER ? 'show' : 'room');
    $('#histSave').onclick = async event => {
      const before = History.all();
      const accepted = await CFPFoundation.actions.confirm({
        title: `Archive the ${STATE.season} season?`,
        message: 'This stores the current field, scores, and champion. Re-archiving the same season replaces its earlier snapshot.',
        confirmLabel: 'Archive season',
        danger: false,
        trigger: event.currentTarget,
      });
      if (!accepted) return;
      History.save(); Movement.refresh(); renderHistory();
      toast(`${STATE.season} archived`);
      CFPFoundation.live.announce(`${STATE.season} season archived`);
      CFPFoundation.actions.undo(`${STATE.season} archived`, () => {
        History.replace(before); renderHistory();
      });
    };

    /* ---- export ---- */
    $('#mExportClose').onclick = () => $('#mExport').classList.remove('on');
    $('#exSave').onclick = async () => {
      try { await BracketImage.download(); toast('Image saved'); }
      catch (e) { toast('Could not save the image'); }
    };
    $('#exShare').onclick = async () => {
      try { if (!await BracketImage.share()) toast('Sharing is not available here'); }
      catch (e) { if (!/abort/i.test(e.name || '')) toast('Could not share the image'); }
    };

    /* ---- premiere ---- */
    $('#fPremiere').onchange = savePremiere;
    $('#preClearBtn').onclick = () => { $('#fPremiere').value = ''; savePremiere(); };

    /* ---- chrome ---- */
    $$('#enLinks button').forEach(b => b.onclick = () => showScreen(b.dataset.go));
    $('#navBrand').onclick = () => showScreen('home');
    $('#ssLeague').onclick = () => showScreen('final');
    $('#navShow').onclick = () => { enterPremiere(); };
    $('#ssNext').onclick = () => {
      const t = $('#ssTrack');
      t.scrollBy({ left: t.clientWidth * 0.8, behavior: 'smooth' });
    };

    /* The strip is fixed above the commissioner room, so it must subscribe
       to board changes instead of waiting for a page navigation to repaint. */
    document.addEventListener('cfp:state', renderStrip);
    renderStrip();

    Movement.refresh();
  }

  return { init, renderResults, renderPickem, renderHistory, renderBoard,
           openExport, watchPremiere, untilPremiere, fmtLeft,
           renderStrip, markNav };
})();

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

  /* ======================================================================
     RESULTS — play the bracket out
     ====================================================================== */

  function renderResults() {
    const wrap = $('#resultsBody');
    if (!wrap) return;
    wrap.innerHTML = '';

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
                     (st.a && st.b && !st.winner ? ' live' : '');

    const h = document.createElement('div');
    h.className = 'g-head';
    const where = g.site === 'campus' && st.a
      ? `at ${(seedTeam(st.a) || {}).school || 'the higher seed'}`
      : g.site === 'campus' ? 'campus site' : '';
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

    const inp = document.createElement('input');
    inp.className = 'g-score';
    inp.type = 'text';
    inp.inputMode = 'numeric';
    inp.maxLength = 3;
    inp.placeholder = '—';
    inp.disabled = !seedNo;
    inp.value = (STATE.results[g.id] || {})[which] ?? '';
    inp.oninput = () => {
      inp.value = inp.value.replace(/[^0-9]/g, '');
      STATE.results[g.id] = Object.assign({}, STATE.results[g.id]);
      STATE.results[g.id][which] = inp.value;
      persist();
      scheduleResultsPaint();
    };
    row.appendChild(inp);

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
        ? [...document.querySelectorAll('.g-score')].indexOf(act) : -1;
      renderResults();
      if (mark >= 0) {
        const back = document.querySelectorAll('.g-score')[mark];
        if (back) { back.focus(); back.setSelectionRange(back.value.length, back.value.length); }
      }
    }, 420);
  }

  function clearResults() {
    if (!confirm('Clear every score and start the playoff again?')) return;
    STATE.results = {};
    persist(); renderResults();
    toast('Results cleared');
  }

  /* ======================================================================
     PICK'EM
     ====================================================================== */

  let myPicks = new Array(GAMES.length).fill(0);
  let pickMode = 'make';                 // 'make' | 'board'

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
    const mine = Pickem.resolve(myPicks);

    ['r1', 'qf', 'sf', 'nc'].forEach(r => {
      const games = GAMES.filter(g => g.round === r);
      const head = document.createElement('div');
      head.className = 'pk-round';
      head.innerHTML = `<b>${esc(ROUND_INFO[r].label)}</b>` +
        `<span>${ROUND_INFO[r].points} pt${ROUND_INFO[r].points === 1 ? '' : 's'} each</span>`;
      wrap.appendChild(head);

      games.forEach(g => {
        const i = GAMES.indexOf(g);
        const st = mine[g.id];
        const card = document.createElement('div');
        card.className = 'pk-card';
        card.innerHTML = `<div class="pk-name">${esc(g.name)}</div>`;

        ['a', 'b'].forEach(side => {
          const seedNo = st[side];
          const btn = document.createElement('button');
          btn.className = 'pk-pick' + (st.choice === side ? ' on' : '') +
                          (seedNo ? '' : ' blank');
          btn.disabled = !seedNo;
          if (seedNo && STATE.seeds[seedNo - 1]) {
            const sp = document.createElement('span');
            sp.className = 'pk-seed'; sp.textContent = seedNo;
            btn.append(sp, plate(STATE.seeds[seedNo - 1].id, 38));
          } else {
            btn.textContent = Bracket.slotName(seedNo, mine, g[side]);
          }
          btn.onclick = () => {
            myPicks[i] = side === 'b' ? 1 : 0;
            /* A change upstream can orphan a later pick — the team they had
               winning the final might not be in it any more. Leaving those
               alone is fine: resolve() always reads the live slots, so the
               bracket stays consistent whatever is stored. */
            renderPickForm();
            updateCode();
          };
          card.appendChild(btn);
        });
        wrap.appendChild(card);
      });
    });
    updateCode();
  }

  function updateCode() {
    const name = $('#pkName').value;
    const champ = Pickem.championOf(myPicks);
    const t = champ && seedTeam(champ);
    $('#pkChampion').innerHTML = t
      ? `Your champion: <b>${esc(t.school)}</b>`
      : 'Pick a winner in every game to finish your bracket.';
    $('#pkCode').value = name.trim() ? Pickem.encode(name, myPicks) : '';
    $('#pkCopy').disabled = !name.trim();
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
    const found = code.match(/[A-Z0-9_ ]{1,16}-[0-9A-Z]+/gi) || [];
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
        '<p class="dy-empty">Nothing archived yet. Finish a show, or press ' +
        '<b>Archive this season</b>, and every playoff you run lands here — ' +
        'field, bracket and champion.</p>';
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
      load.onclick = () => {
        if (!confirm(`Replace the board with the ${h.season} field?`)) return;
        History.restoreSeason(h.savedAt);
        persist(); renderPool(); renderSeeds(); Movement.refresh();
        toast(`${h.season} loaded`);
        showScreen('room');
      };
      const del = document.createElement('button');
      del.className = 'btn ghost sm danger';
      del.textContent = 'Delete';
      del.onclick = () => {
        if (!confirm(`Delete ${h.season} from the history?`)) return;
        History.remove(h.savedAt); renderHistory();
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
    track.innerHTML = '';

    const solved = Bracket.solve();
    const anySeeded = STATE.seeds.some(Boolean);

    if (!anySeeded) {
      track.innerHTML = '<span class="ss-empty">No field set &mdash; ' +
        'build one in the committee room</span>';
      return;
    }

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

    /* ---- results ---- */
    $('#resClear').onclick = clearResults;
    $('#resRoom').onclick = () => showScreen('room');
    $('#resBracketBtn').onclick = () => showScreen('final');
    $('#resArchive').onclick = () => {
      History.save(); Movement.refresh();
      toast(`${STATE.season} archived`);
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
    $('#pkClear').onclick = () => {
      if (!confirm('Remove every entry?')) return;
      Pickem.clear(); renderBoard(); toast('Entries cleared');
    };
    $('#pkRoom').onclick = () => showScreen(VIEWER ? 'show' : 'room');

    /* ---- history ---- */
    $('#histRoom').onclick = () => showScreen(VIEWER ? 'show' : 'room');
    $('#histSave').onclick = () => {
      History.save(); Movement.refresh(); renderHistory();
      toast(`${STATE.season} archived`);
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
    $('#navShow').onclick = () => { showScreen('show'); Show.arm(); };
    $('#ssNext').onclick = () => {
      const t = $('#ssTrack');
      t.scrollBy({ left: t.clientWidth * 0.8, behavior: 'smooth' });
    };

    Movement.refresh();
  }

  return { init, renderResults, renderPickem, renderHistory, renderBoard,
           openExport, watchPremiere, untilPremiere, fmtLeft,
           renderStrip, markNav };
})();

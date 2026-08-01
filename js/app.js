/* =====================================================================
   CFP SELECTION SHOW — home, committee room, banners, share, bracket
   ===================================================================== */

const $  = (s, r = document) => r.querySelector(s);
const $$ = (s, r = document) => [...r.querySelectorAll(s)];

/* ---------------------------------------------------------------- state */
const STATE = {
  league:   'Dynasty League',
  season:   '2027',
  title:    'College Football Playoff',
  subtitle: 'Selection Show',
  ticker:   '',
  order:    'asc',
  pace:     10000,
  cold:     'full',
  fx:       'max',
  volume:   55,
  record:   false,
  logoPattern: '',
  seeds: Array(12).fill(null)          // null | {id, record, champ}
};

let OVERRIDES = loadOverrides();

function team(id) {
  const base = TEAM_BY_ID[id];
  if (!base) return null;
  return Object.assign({}, base, OVERRIDES[id] || {});
}

/* ======================================================================
   BANNER — the split plate: [ABBR | team-colour crest]
   ====================================================================== */
function bannerEl(id, opts = {}) {
  const t = team(id);
  const el = document.createElement('div');
  el.className = 'banner' + (opts.flip ? ' flip' : '');
  el.dataset.team = id;

  const tag = document.createElement('div');
  tag.className = 'tag';
  tag.textContent = t.abbr;

  const crest = document.createElement('div');
  crest.className = 'crest';
  crest.style.background = t.primary;

  const mono = document.createElement('div');
  mono.className = 'mono';
  mono.style.color = readable(t.primary, t.secondary);
  mono.innerHTML = `${esc(t.school.toUpperCase())}<small>${esc(t.mascot.toUpperCase())}</small>`;
  crest.appendChild(mono);

  LogoStore.get(id, src => {
    const img = new Image();
    img.alt = t.school;
    img.onload = () => { crest.innerHTML = ''; crest.appendChild(img); };
    img.src = src;
  });

  const sheen = document.createElement('div');
  sheen.className = 'sheen';

  el.append(tag, crest, sheen);
  return el;
}

/* keep the wordmark legible against the primary colour */
function readable(bg, pref) {
  if (contrast(bg, pref) >= 2.4) return pref;
  return luma(bg) > 0.45 ? '#0a0a0a' : '#ffffff';
}
function hex2rgb(h) {
  h = (h || '#000').replace('#', '');
  if (h.length === 3) h = h.split('').map(c => c + c).join('');
  return [0, 2, 4].map(i => parseInt(h.substr(i, 2), 16) || 0);
}
function luma(h) {
  const [r, g, b] = hex2rgb(h).map(v => {
    v /= 255; return v <= .03928 ? v / 12.92 : Math.pow((v + .055) / 1.055, 2.4);
  });
  return .2126 * r + .7152 * g + .0722 * b;
}
function contrast(a, b) {
  const l1 = luma(a), l2 = luma(b);
  return (Math.max(l1, l2) + .05) / (Math.min(l1, l2) + .05);
}
const esc = s => String(s).replace(/[&<>"]/g, c =>
  ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));

/* ======================================================================
   TEAM POOL
   ====================================================================== */
function renderPool() {
  const q    = $('#search').value.trim().toLowerCase();
  const conf = $('#confFilter').value;
  const grid = $('#poolGrid');
  grid.innerHTML = '';

  const list = TEAMS.filter(t => {
    if (conf && t.conf !== conf) return false;
    if (!q) return true;
    return (t.school + ' ' + t.mascot + ' ' + t.abbr).toLowerCase().includes(q);
  }).sort((a, b) => a.school.localeCompare(b.school));

  list.forEach(t => {
    const card = document.createElement('div');
    card.className = 'pool-card' + (isSeeded(t.id) ? ' picked' : '');
    card.appendChild(bannerEl(t.id));
    const c = document.createElement('div');
    c.className = 'conf'; c.textContent = t.conf;
    card.appendChild(c);
    card.onclick = () => seedNext(t.id);
    card.oncontextmenu = e => { e.preventDefault(); openTeamModal(t.id); };
    grid.appendChild(card);
  });

  const filled = STATE.seeds.filter(Boolean).length;
  $('#poolCount').textContent = `${list.length} TEAMS · ${filled}/12 SEEDED`;
  $('#tabCount').textContent = `${filled}/12`;
}

const isSeeded = id => STATE.seeds.some(s => s && s.id === id);

/** Swap two seed slots — the touch-friendly way to reorder. */
function swapSeeds(a, b) {
  if (b < 0 || b > 11) return;
  const tmp = STATE.seeds[a];
  STATE.seeds[a] = STATE.seeds[b];
  STATE.seeds[b] = tmp;
  persist(); renderSeeds();
}

function seedNext(id) {
  if (isSeeded(id)) return;
  const i = STATE.seeds.findIndex(s => !s);
  if (i === -1) { toast('All 12 seeds are filled'); return; }
  STATE.seeds[i] = { id, record: '', champ: i < 4 };
  persist(); renderPool(); renderSeeds();
  if (i === 11) toast('That\'s all twelve — check the field');
}

/* ======================================================================
   SEED BOARD
   ====================================================================== */
let dragFrom = null;

function renderSeeds() {
  const list = $('#seedList');
  list.innerHTML = '';

  STATE.seeds.forEach((s, i) => {
    const row = document.createElement('div');
    row.className = 'seedrow' + (i < 4 ? ' bye' : '') + (s ? '' : ' empty');
    row.draggable = !!s;
    row.dataset.i = i;
    row.innerHTML = `<span class="grip">&#8942;&#8942;</span><span class="num">${i + 1}</span>`;

    if (s) {
      const wrap = document.createElement('div');
      wrap.className = 'banner-wrap';
      wrap.appendChild(bannerEl(s.id));
      row.appendChild(wrap);

      const meta = document.createElement('div');
      meta.className = 'meta';
      const rec = document.createElement('input');
      rec.placeholder = 'REC'; rec.value = s.record || '';
      rec.oninput = () => { s.record = rec.value; persist(); };
      meta.appendChild(rec);
      row.appendChild(meta);

      const move = document.createElement('div');
      move.className = 'move';
      move.innerHTML = `<button title="Move up" ${i === 0 ? 'disabled' : ''}>&#9650;</button>
                        <button title="Move down" ${i === 11 ? 'disabled' : ''}>&#9660;</button>`;
      move.children[0].onclick = () => swapSeeds(i, i - 1);
      move.children[1].onclick = () => swapSeeds(i, i + 1);
      row.appendChild(move);

      const acts = document.createElement('div');
      acts.className = 'acts';
      acts.innerHTML = `<button title="Edit team look">&#9998;</button>
                        <button title="Remove from field">&times;</button>`;
      acts.children[0].onclick = () => openTeamModal(s.id);
      acts.children[1].onclick = () => {
        STATE.seeds[i] = null; persist(); renderPool(); renderSeeds();
      };
      row.appendChild(acts);
    } else {
      const lbl = document.createElement('div');
      lbl.className = 'slot-lbl';
      lbl.textContent = i < 4 ? 'open — first-round bye' : 'open';
      row.appendChild(lbl);
    }

    row.addEventListener('dragstart', e => {
      dragFrom = i; e.dataTransfer.effectAllowed = 'move';
      e.dataTransfer.setData('text/plain', String(i));
    });
    row.addEventListener('dragover', e => { e.preventDefault(); row.classList.add('dragover'); });
    row.addEventListener('dragleave', () => row.classList.remove('dragover'));
    row.addEventListener('drop', e => {
      e.preventDefault(); row.classList.remove('dragover');
      if (dragFrom === null || dragFrom === i) return;
      const moved = STATE.seeds.splice(dragFrom, 1)[0];
      STATE.seeds.splice(i, 0, moved);
      while (STATE.seeds.length < 12) STATE.seeds.push(null);
      STATE.seeds.length = 12;
      dragFrom = null; persist(); renderSeeds(); renderPool();
    });

    list.appendChild(row);
  });

  $('#btnGo').disabled = STATE.seeds.filter(Boolean).length === 0;
}

/* 12-team CFP structure */
function firstRound() {
  return [
    { hi: 5, lo: 12 }, { hi: 6, lo: 11 }, { hi: 7, lo: 10 }, { hi: 8, lo: 9 }
  ];
}

/* ======================================================================
   SHARE LINK — the whole field encoded into the URL hash
   ====================================================================== */
function encodeState() {
  const payload = {
    l: STATE.league, y: STATE.season, t: STATE.title, s: STATE.subtitle,
    k: STATE.ticker, o: STATE.order, p: STATE.pace, c: STATE.cold, f: STATE.fx,
    g: STATE.logoPattern,
    d: STATE.seeds.map(x => x ? [x.id, x.record || ''] : null),
    v: Object.fromEntries(
      Object.entries(OVERRIDES).filter(([id]) => isSeeded(id))
        .map(([id, o]) => [id, { a: o.abbr, sc: o.school, m: o.mascot,
                                 p: o.primary, s: o.secondary, c: o.conf }]))
  };
  return btoa(unescape(encodeURIComponent(JSON.stringify(payload))))
    .replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

function decodeState(b64) {
  try {
    const s = b64.replace(/-/g, '+').replace(/_/g, '/');
    const p = JSON.parse(decodeURIComponent(escape(atob(s))));
    STATE.league   = p.l ?? STATE.league;
    STATE.season   = p.y ?? STATE.season;
    STATE.title    = p.t ?? STATE.title;
    STATE.subtitle = p.s ?? STATE.subtitle;
    STATE.ticker   = p.k ?? '';
    STATE.order    = p.o ?? 'asc';
    STATE.pace     = p.p ?? 10000;
    STATE.cold     = p.c ?? 'full';
    STATE.fx       = p.f ?? 'max';
    if (p.g) STATE.logoPattern = p.g;
    STATE.seeds = (p.d || []).map((x, i) =>
      x ? { id: x[0], record: x[1], champ: i < 4 } : null);
    while (STATE.seeds.length < 12) STATE.seeds.push(null);

    Object.entries(p.v || {}).forEach(([id, o]) => {
      if (!TEAM_BY_ID[id]) {
        TEAM_BY_ID[id] = { id, school: o.sc || id, mascot: o.m || '',
                           abbr: o.a || id, conf: o.c || '',
                           primary: o.p || '#222', secondary: o.s || '#fff' };
      }
      OVERRIDES[id] = Object.assign({}, OVERRIDES[id], {
        abbr: o.a, school: o.sc, mascot: o.m,
        primary: o.p, secondary: o.s, conf: o.c
      });
    });
    return true;
  } catch (e) { return false; }
}

const shareLink = () => `${location.href.split('#')[0]}#show=${encodeState()}`;

async function copyShare() {
  const url = shareLink();
  try {
    await navigator.clipboard.writeText(url);
    toast('Share link copied — send it to the league');
  } catch (e) {
    prompt('Copy this link:', url);
  }
}

/* ======================================================================
   FINAL BRACKET  (geometry in % of the 16:9 canvas)
   ====================================================================== */
const BK = {
  rows: { topA: 18.5, topB: 29.2, mid1: 45.4, mid2: 64.5, botA: 81.0, botB: 91.7 },
  r1Y: 23.85, qfTopY: 34.6, qfBotY: 75.4, r1BotY: 86.35,
  boxHalf: 4.15,
  x: { r1L: 23, qfL: 34, sf: 45.25, qfR: 56.5, r1R: 67.5,
       r1Lc: 27.75, qfLc: 38.75, qfRc: 61.25, r1Rc: 72.25 },
  boxW: 9.5
};

function renderBracket() {
  const bk = $('#bracket');
  bk.innerHTML = '';
  const R = BK.rows, X = BK.x;

  const trophy = document.createElement('div');
  trophy.className = 'trophy dim';
  bk.appendChild(trophy);

  const t = document.createElement('div');
  t.className = 'bk-title';
  t.innerHTML = `${esc(STATE.title)}<small>${esc(STATE.league)} &middot; ${esc(STATE.season)}</small>`;
  bk.appendChild(t);

  const line = (x, y, w, h) => {
    const d = document.createElement('div');
    d.className = 'bk-line';
    d.style.cssText = `left:${x}%;top:${y}%;width:${w}%;height:${h}%`;
    bk.appendChild(d);
  };
  const V = 0.2, H = 0.35;
  const vert = (cx, y1, y2) => line(cx - V / 2, y1, V, y2 - y1);
  const horz = (x1, x2, y)  => line(x1, y - H / 2, x2 - x1, H);

  vert(X.r1Lc, BK.r1Y + BK.boxHalf, R.mid1);
  horz(X.r1Lc, X.qfL, BK.qfTopY);
  vert(X.r1Lc, R.mid2, BK.r1BotY - BK.boxHalf);
  horz(X.r1Lc, X.qfL, BK.qfBotY);

  vert(X.r1Rc, BK.r1Y + BK.boxHalf, R.mid1);
  horz(X.qfR + BK.boxW, X.r1Rc, BK.qfTopY);
  vert(X.r1Rc, R.mid2, BK.r1BotY - BK.boxHalf);
  horz(X.qfR + BK.boxW, X.r1Rc, BK.qfBotY);

  vert(X.qfLc, BK.qfTopY + BK.boxHalf, 51.4);
  vert(X.qfLc, 58.0, BK.qfBotY - BK.boxHalf);
  horz(X.qfLc, X.sf, R.mid1);
  vert(X.qfRc, BK.qfTopY + BK.boxHalf, 51.4);
  vert(X.qfRc, 58.0, BK.qfBotY - BK.boxHalf);
  horz(X.sf + BK.boxW, X.qfRc, R.mid2);

  [[X.r1L, BK.r1Y], [X.r1L, BK.r1BotY],
   [X.qfL, BK.qfTopY], [X.qfL, BK.qfBotY],
   [X.sf,  R.mid1],    [X.sf,  R.mid2],
   [X.qfR, BK.qfTopY], [X.qfR, BK.qfBotY],
   [X.r1R, BK.r1Y],    [X.r1R, BK.r1BotY]].forEach(([x, y]) => {
    const d = document.createElement('div');
    d.className = 'bk-box';
    d.style.left = x + '%'; d.style.top = y + '%';
    d.style.transform = 'translateY(-50%)';
    bk.appendChild(d);
  });

  const LEFT  = [[9, R.topA], [8, R.topB], [1, R.mid1],
                 [4, R.mid2], [5, R.botA], [12, R.botB]];
  const RIGHT = [[7, R.topA], [10, R.topB], [2, R.mid1],
                 [3, R.mid2], [6, R.botA], [11, R.botB]];

  const place = (arr, side) => arr.forEach(([seed, y]) => {
    const s = STATE.seeds[seed - 1];
    const row = document.createElement('div');
    row.className = 'bk-seed' + (side === 'R' ? ' right' : '');
    row.style.top = y + '%';
    row.style[side === 'L' ? 'left' : 'right'] = '1.5%';
    row.style.transform = 'translateY(-50%)';

    const sn = document.createElement('div');
    sn.className = 'sn'; sn.textContent = seed;
    row.appendChild(sn);

    if (s) row.appendChild(bannerEl(s.id, { flip: side === 'R' }));
    else {
      const ph = document.createElement('div');
      ph.className = 'banner'; ph.style.flex = '1';
      ph.innerHTML = '<div class="tag" style="min-width:100%;color:#39414d">TBD</div>';
      row.appendChild(ph);
    }
    bk.appendChild(row);
  });
  place(LEFT, 'L'); place(RIGHT, 'R');

  [[23.5, BK.qfTopY + 1.2, 'ROSE<br>BOWL'],
   [23.5, BK.qfBotY - 1.2, 'COTTON<br>BOWL'],
   [X.qfLc, 54.7, 'FIESTA<br>BOWL'],
   [X.qfRc, 54.7, 'PEACH<br>BOWL'],
   [76.5, BK.qfTopY + 1.2, 'SUGAR<br>BOWL'],
   [76.5, BK.qfBotY - 1.2, 'ORANGE<br>BOWL']].forEach(([x, y, txt]) => {
    const d = document.createElement('div');
    d.className = 'bk-bowl';
    d.style.left = x + '%'; d.style.top = y + '%';
    d.style.transform = 'translate(-50%,-50%)';
    d.innerHTML = txt;
    bk.appendChild(d);
  });

  const nat = document.createElement('div');
  nat.className = 'bk-natty';
  nat.style.left = '50%'; nat.style.top = '54.7%';
  nat.style.transform = 'translate(-50%,-50%)';
  nat.innerHTML = 'NATIONAL<br>CHAMPIONSHIP';
  bk.appendChild(nat);

  renderFieldList();
}

/* ---- the phone-friendly version of the same information ------------- */
function renderFieldList() {
  const wrap = $('#fieldList');
  wrap.innerHTML = '';

  const head = document.createElement('div');
  head.className = 'fl-head';
  head.innerHTML = `<b>${esc(STATE.title)}</b>` +
    `<span>${esc(STATE.league)} &middot; ${esc(STATE.season)}</span>`;
  wrap.appendChild(head);

  const row = (seed, extra) => {
    const s = STATE.seeds[seed - 1];
    const r = document.createElement('div');
    r.className = 'fl-row' + (seed <= 4 ? ' bye' : '');
    r.innerHTML = `<span class="n">${seed}</span>`;
    if (s) r.appendChild(bannerEl(s.id));
    else {
      const ph = document.createElement('div');
      ph.className = 'banner'; ph.style.flex = '1';
      ph.innerHTML = '<div class="tag" style="min-width:100%;color:#39414d">TBD</div>';
      r.appendChild(ph);
    }
    if (extra) {
      const e = document.createElement('span');
      e.className = 'tagline'; e.innerHTML = extra;
      r.appendChild(e);
    }
    return r;
  };

  const h = txt => {
    const d = document.createElement('h4'); d.textContent = txt; wrap.appendChild(d);
  };

  h('FIRST-ROUND BYES');
  [1, 2, 3, 4].forEach(n => wrap.appendChild(row(n)));

  h('FIRST ROUND');
  const BOWL_FOR = { 5: 'Cotton', 6: 'Orange', 7: 'Sugar', 8: 'Rose' };
  firstRound().forEach(m => {
    const g = document.createElement('div');
    g.className = 'fl-game';
    g.innerHTML = `<div class="lbl">No. ${m.lo} at No. ${m.hi} ` +
      `&middot; winner to the ${BOWL_FOR[m.hi]} Bowl</div>`;
    g.appendChild(row(m.lo, 'AT'));
    g.appendChild(row(m.hi, 'HOME'));
    wrap.appendChild(g);
  });

  h('QUARTERFINALS');
  const qf = document.createElement('div');
  qf.className = 'fl-game';
  qf.innerHTML =
    `<div class="lbl">Rose Bowl &middot; No. 1 vs. winner of 8/9</div>` +
    `<div class="lbl">Sugar Bowl &middot; No. 2 vs. winner of 7/10</div>` +
    `<div class="lbl">Orange Bowl &middot; No. 3 vs. winner of 6/11</div>` +
    `<div class="lbl">Cotton Bowl &middot; No. 4 vs. winner of 5/12</div>` +
    `<div class="lbl" style="color:#8b93a1">Fiesta &amp; Peach Bowls &middot; semifinals</div>` +
    `<div class="lbl" style="color:var(--accent)">National Championship</div>`;
  wrap.appendChild(qf);
}

/* ======================================================================
   MODALS
   ====================================================================== */
let editingId = null;

function openTeamModal(id) {
  editingId = id;
  const t = team(id);
  $('#mTeamTitle').textContent = 'EDIT — ' + t.school.toUpperCase();
  $('#fSchool').value = t.school;
  $('#fMascot').value = t.mascot;
  $('#fAbbr').value   = t.abbr;
  $('#fConf').value   = t.conf;
  $('#fPrim').value   = normHex(t.primary);
  $('#fPrimHex').value = t.primary;
  $('#fSec').value    = normHex(t.secondary);
  $('#fSecHex').value = t.secondary;
  refreshTeamPreview();
  $('#mTeam').classList.add('on');
}

function normHex(h) {
  h = (h || '#000000').trim();
  if (!h.startsWith('#')) h = '#' + h;
  if (h.length === 4) h = '#' + h.slice(1).split('').map(c => c + c).join('');
  return /^#[0-9a-f]{6}$/i.test(h) ? h : '#000000';
}

function refreshTeamPreview() {
  const p = $('#mTeamPreview');
  p.innerHTML = '';
  const stash = OVERRIDES[editingId];
  OVERRIDES[editingId] = {
    school: $('#fSchool').value, mascot: $('#fMascot').value,
    abbr: $('#fAbbr').value, conf: $('#fConf').value,
    primary: normHex($('#fPrimHex').value), secondary: normHex($('#fSecHex').value)
  };
  p.appendChild(bannerEl(editingId));
  OVERRIDES[editingId] = stash;
}

function closeTeamModal() { $('#mTeam').classList.remove('on'); editingId = null; }

function saveTeamModal() {
  OVERRIDES[editingId] = {
    school: $('#fSchool').value.trim() || TEAM_BY_ID[editingId].school,
    mascot: $('#fMascot').value.trim(),
    abbr:  ($('#fAbbr').value.trim() || TEAM_BY_ID[editingId].abbr).toUpperCase(),
    conf:   $('#fConf').value.trim(),
    primary: normHex($('#fPrimHex').value),
    secondary: normHex($('#fSecHex').value)
  };
  saveOverrides(OVERRIDES);
  closeTeamModal(); renderPool(); renderSeeds();
  toast('Team saved');
}

function refreshLogoCount() {
  const n = LogoStore.count();
  $('#logoCount').textContent = n ? `(${n})` : '';
  const st = $('#bulkStatus');
  if (st) st.textContent = n
    ? `${n} logo${n === 1 ? '' : 's'} loaded on this device.`
    : 'No logos imported yet — teams show a colour plate with their wordmark.';
}

/* ======================================================================
   PERSISTENCE + BOOT
   ====================================================================== */
const persist = () => localStorage.setItem('cfp27.state', JSON.stringify(STATE));

function restore() {
  try {
    const s = JSON.parse(localStorage.getItem('cfp27.state') || 'null');
    if (s) Object.assign(STATE, s);
    if (!Array.isArray(STATE.seeds) || STATE.seeds.length !== 12)
      STATE.seeds = Array(12).fill(null);
  } catch (e) {}
}

function toast(msg) {
  const t = $('#toast');
  t.textContent = msg; t.classList.add('on');
  clearTimeout(t._h); t._h = setTimeout(() => t.classList.remove('on'), 2400);
}

function showScreen(name) {
  $$('.screen').forEach(s => s.classList.toggle('active', s.id === name));
  if (name === 'final') renderBracket();
  if (name !== 'show') Show.stop();
}

function applyFx() { document.body.classList.toggle('calm', STATE.fx === 'calm'); }

/* ---------------------------------------------------------------- wire */
async function boot() {
  restore();
  applyFx();

  await LogoStore.hydrate();

  const hash = location.hash.match(/^#show=(.+)$/);
  const shared = !!(hash && decodeState(hash[1]));

  CONFERENCES.forEach(c => {
    const o = document.createElement('option');
    o.value = c; o.textContent = c;
    $('#confFilter').appendChild(o);
  });

  /* ---------- home ---------- */
  $('#goCommish').onclick = () => showScreen('room');
  $('#goWatch').onclick   = () => { $('#fLink').value = ''; $('#mLink').classList.add('on'); };
  $('#navHowTo').onclick  = () => $('#mHow').classList.add('on');
  $('#mHowClose').onclick = () => $('#mHow').classList.remove('on');
  $('#roomHome').onclick  = () => showScreen('home');
  $('#mLinkCancel').onclick = () => $('#mLink').classList.remove('on');
  $('#mLinkGo').onclick = () => {
    const v = $('#fLink').value.trim();
    const m = v.match(/#show=(.+)$/);
    if (!m || !decodeState(m[1])) { toast('That link does not look right'); return; }
    $('#mLink').classList.remove('on');
    applyFx(); renderPool(); renderSeeds();
    showScreen('show'); Show.arm();
  };

  const n = STATE.seeds.filter(Boolean).length;
  $('#resumeNote').textContent = n
    ? `${n} of 12 seeds already on your board` : '';

  /* ---------- pool + settings ---------- */
  $('#search').oninput      = renderPool;
  $('#confFilter').onchange = renderPool;

  /* mobile tabs */
  $$('#roomTabs button').forEach(b => b.onclick = () => {
    $$('#roomTabs button').forEach(x => x.classList.toggle('on', x === b));
    $('#roomBody').dataset.tab = b.dataset.tab;
  });

  $('#optOrder').value = STATE.order;
  $('#optPace').value  = String(STATE.pace);
  $('#optCold').value  = STATE.cold;
  $('#optFx').value    = STATE.fx;
  $('#optVol').value   = STATE.volume;
  $('#volLbl').textContent = STATE.volume + '%';

  $('#optOrder').onchange = e => { STATE.order = e.target.value; persist(); };
  $('#optPace').onchange  = e => {
    STATE.pace = e.target.value === 'manual' ? 'manual' : +e.target.value; persist();
  };
  $('#optCold').onchange = e => { STATE.cold = e.target.value; persist(); };
  $('#optFx').onchange   = e => { STATE.fx = e.target.value; applyFx(); persist(); };
  $('#optVol').oninput   = e => {
    STATE.volume = +e.target.value;
    $('#volLbl').textContent = STATE.volume + '%';
    Show.setBedVolume();
    persist();
  };

  $('#btnClear').onclick = () => {
    if (!confirm('Clear all 12 seeds?')) return;
    STATE.seeds = Array(12).fill(null); persist(); renderPool(); renderSeeds();
  };
  $('#btnShare').onclick   = copyShare;
  $('#fShare').onclick     = copyShare;
  $('#btnBracket').onclick = () => showScreen('final');
  $('#fRoom').onclick      = () => showScreen('room');
  $('#fShow').onclick      = () => { showScreen('show'); Show.arm(); };
  $('#btnGo').onclick      = () => { showScreen('show'); Show.arm(); };
  $('#fView').onclick      = () => {
    const f = $('#final');
    f.classList.toggle('showbracket');
    $('#fView').textContent = f.classList.contains('showbracket')
      ? 'Team List' : 'Full Bracket';
  };
  $('#fVideo').onclick = () => {
    if (!Recorder.download()) toast('No recording to save');
    else toast('Saving ' + Recorder.filename());
  };

  /* ---------- recording ---------- */
  const recOpt = $('#optRecord');
  if (Recorder.supported()) {
    $('#recWhy').textContent =
      'You\'ll be asked to pick a window — choose this tab and tick "share tab audio". ' +
      'The file downloads when the show ends.';
  } else {
    recOpt.disabled = true;
    $('#recOpt').style.opacity = '.4';
    $('#recWhy').textContent = Recorder.reason();
  }
  recOpt.onchange = () => { STATE.record = recOpt.checked; persist(); };
  recOpt.checked = !!STATE.record && Recorder.supported();

  /* ---------- league modal ---------- */
  $('#btnLeague').onclick = () => {
    $('#fLeague').value = STATE.league; $('#fSeason').value = STATE.season;
    $('#fTitle').value = STATE.title;   $('#fSubtitle').value = STATE.subtitle;
    $('#fTicker').value = STATE.ticker;
    $('#mLeague').classList.add('on');
  };
  $('#mLeagueCancel').onclick = () => $('#mLeague').classList.remove('on');
  $('#mLeagueSave').onclick = () => {
    STATE.league   = $('#fLeague').value.trim()   || 'Dynasty League';
    STATE.season   = $('#fSeason').value.trim()   || '2027';
    STATE.title    = $('#fTitle').value.trim()    || 'College Football Playoff';
    STATE.subtitle = $('#fSubtitle').value.trim() || 'Selection Show';
    STATE.ticker   = $('#fTicker').value.trim();
    persist(); $('#mLeague').classList.remove('on'); toast('League saved');
  };

  /* ---------- logos modal ---------- */
  $('#btnLogos').onclick = () => {
    $('#fLogoPattern').value = STATE.logoPattern || '';
    refreshLogoCount();
    $('#mLogos').classList.add('on');
  };
  $('#mLogosCancel').onclick = () => $('#mLogos').classList.remove('on');
  $('#mLogosSave').onclick = () => {
    STATE.logoPattern = $('#fLogoPattern').value.trim();
    persist(); $('#mLogos').classList.remove('on');
    renderPool(); renderSeeds(); toast('Saved');
  };
  $('#bulkClear').onclick = async () => {
    if (!confirm('Remove every imported logo?')) return;
    await LogoStore.clear();
    refreshLogoCount(); renderPool(); renderSeeds(); toast('Logos removed');
  };

  const bulkDrop = $('#bulkDrop'), bulkFiles = $('#bulkFiles'), bulkBar = $('#bulkBar');
  try { bulkFiles.setAttribute('webkitdirectory', ''); bulkFiles.removeAttribute('webkitdirectory'); } catch (e) {}
  bulkDrop.onclick = () => bulkFiles.click();
  bulkDrop.ondragover = e => { e.preventDefault(); bulkDrop.classList.add('over'); };
  bulkDrop.ondragleave = () => bulkDrop.classList.remove('over');
  bulkDrop.ondrop = async e => {
    e.preventDefault(); bulkDrop.classList.remove('over');
    await runImport(await filesFromDrop(e.dataTransfer));
  };
  bulkFiles.onchange = async () => { await runImport([...bulkFiles.files]); bulkFiles.value = ''; };

  async function runImport(files) {
    if (!files.length) { toast('No image files found'); return; }
    bulkBar.style.width = '0%';
    const res = await LogoStore.importFiles(files, (done, total) => {
      bulkBar.style.width = Math.round(done / total * 100) + '%';
    });
    bulkBar.style.width = '100%';
    setTimeout(() => bulkBar.style.width = '0%', 900);
    refreshLogoCount(); renderPool(); renderSeeds();
    $('#bulkStatus').textContent =
      `Matched ${res.added} of ${res.total}. ` +
      (res.skipped.length
        ? `Couldn't place: ${res.skipped.slice(0, 5).join(', ')}` +
          (res.skipped.length > 5 ? ` +${res.skipped.length - 5} more` : '') +
          '. Rename those to the team id and drop them again.'
        : 'Every file found a team.');
    toast(`${res.added} logo${res.added === 1 ? '' : 's'} imported`);
  }

  /* walk dropped folders */
  async function filesFromDrop(dt) {
    const out = [];
    const items = [...(dt.items || [])];
    const entries = items.map(i => i.webkitGetAsEntry && i.webkitGetAsEntry()).filter(Boolean);
    if (!entries.length) return [...dt.files];
    const walk = entry => new Promise(res => {
      if (entry.isFile) entry.file(f => { out.push(f); res(); });
      else if (entry.isDirectory) {
        const rd = entry.createReader();
        const readAll = () => rd.readEntries(async es => {
          if (!es.length) return res();
          await Promise.all(es.map(walk));
          readAll();
        });
        readAll();
      } else res();
    });
    await Promise.all(entries.map(walk));
    return out;
  }

  /* ---------- custom team ---------- */
  $('#btnAddTeam').onclick = () => {
    const name = prompt('School name (e.g. a relocated or created team):');
    if (!name) return;
    const id = 'x' + name.toLowerCase().replace(/[^a-z0-9]/g, '');
    const t = { id, school: name, mascot: '', abbr: name.slice(0, 4).toUpperCase(),
                conf: 'Custom', primary: '#333333', secondary: '#ffffff', custom: true };
    TEAM_BY_ID[id] = t; TEAMS.push(t); saveCustomTeams();
    if (!CONFERENCES.includes('Custom')) {
      CONFERENCES.push('Custom');
      const o = document.createElement('option');
      o.value = 'Custom'; o.textContent = 'Custom'; $('#confFilter').appendChild(o);
    }
    renderPool(); openTeamModal(id);
  };

  /* ---------- team modal ---------- */
  $('#mTeamCancel').onclick = closeTeamModal;
  $('#mTeamSave').onclick   = saveTeamModal;
  ['fSchool', 'fMascot', 'fAbbr', 'fConf'].forEach(f =>
    $('#' + f).oninput = refreshTeamPreview);
  $('#fPrim').oninput = e => { $('#fPrimHex').value = e.target.value; refreshTeamPreview(); };
  $('#fSec').oninput  = e => { $('#fSecHex').value  = e.target.value; refreshTeamPreview(); };
  $('#fPrimHex').oninput = e => { $('#fPrim').value = normHex(e.target.value); refreshTeamPreview(); };
  $('#fSecHex').oninput  = e => { $('#fSec').value  = normHex(e.target.value); refreshTeamPreview(); };

  const drop = $('#logoDrop'), file = $('#logoFile');
  drop.onclick = () => file.click();
  drop.ondragover = e => { e.preventDefault(); drop.classList.add('over'); };
  drop.ondragleave = () => drop.classList.remove('over');
  drop.ondrop = e => {
    e.preventDefault(); drop.classList.remove('over');
    if (e.dataTransfer.files[0]) takeLogo(e.dataTransfer.files[0]);
  };
  file.onchange = () => { if (file.files[0]) takeLogo(file.files[0]); };
  $('#mTeamLogoClear').onclick = async () => {
    await LogoStore.del(editingId);
    refreshTeamPreview(); refreshLogoCount(); renderPool(); renderSeeds();
    toast('Logo removed');
  };
  async function takeLogo(f) {
    await LogoStore.put(editingId, f);
    refreshTeamPreview(); refreshLogoCount(); renderPool(); renderSeeds();
    toast('Logo added');
  }

  $$('.modal').forEach(m => m.addEventListener('click', e => {
    if (e.target === m) m.classList.remove('on');
  }));

  renderPool();
  renderSeeds();
  refreshLogoCount();
  Show.init();

  /* Music bed runs everywhere. Browsers need one gesture first. */
  const wake = () => { Show.startBed(); };
  ['pointerdown', 'keydown'].forEach(ev =>
    addEventListener(ev, wake, { once: true, capture: true }));

  if (shared) { applyFx(); showScreen('show'); Show.arm(); }
}

if (document.readyState === 'loading')
  document.addEventListener('DOMContentLoaded', boot);
else
  boot();

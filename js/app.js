/* =====================================================================
   CFP SELECTION SHOW — home, committee room, banners, share, bracket
   ===================================================================== */

const $  = (s, r = document) => r.querySelector(s);
const $$ = (s, r = document) => [...r.querySelectorAll(s)];

/* ---------------------------------------------------------------- state */
const STATE = {
  v:        2,                         // board format — see restore()
  league:   'Dynasty League',
  season:   '2027',
  title:    'College Football Playoff',
  subtitle: 'Selection Show',
  ticker:   '',
  order:    'asc',
  pace:     10000,
  cold:     'full',
  calls:    'on',
  seedTalk: 'lead',                    // build-up only; 'both' adds the reaction
  fx:       'max',
  volume:   55,
  musicUnderVoice: 55,                 // bed level while Pat or Boone talk
  voiceVol: 100,                       // both intro voices
  booneVol: 200,                       // Coach Boone on top of that
  callVol:  100,                       // the per-team announcer calls
  filmVol:  100,                       // the intro film's own soundtrack
  record:   false,
  outCount: 2,                         // 13 and 14, the way reveal day does it
  outLabel: '',                        // blank = derive it from the count
  roomFilm: 'on',                      // silent film behind the board
  logoPattern: '',
  premiere: 0,                         // epoch ms, or 0 for "whenever you like"
  results: {},                         // gameId -> {a,b} scores, once it is played
  projectionPicks: Array(11).fill(null), // null | 0 (top) | 1 (bottom), one per game
  projectionScores: {},                // gameId -> {a,b} optional predicted scores
  cloudEventId: '',                    // private id for updating a published event
  shareCode: '',                       // public short code for that event
  leagueRoomId: '',                    // shared Cloudflare league workspace currently loaded
  leagueRoomVersion: 0,                // optimistic version of that shared board
  seeds: Array(12).fill(null),         // null | {id, record, champ}
  out:   Array(4).fill(null)           // first four out — shown before the bracket
};
globalThis.STATE = STATE;

/* True when the page was opened from a share link. The committee room is
   sealed off in that mode — otherwise whoever you sent it to could just walk
   in and read the field before you ever pressed play. */
let VIEWER = false;

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
  const shouldLazy = opts.lazy !== false;
  const el = document.createElement('div');
  el.className = 'banner' + (opts.flip ? ' flip' : '');
  el.dataset.team = id;

  const tag = document.createElement('div');
  /* Long abbreviations (VANDY, UMASS) overrun the black panel at the size
     that suits a three-letter one, so the type steps down with length. */
  const abbrLen = String(t.abbr).replace(/[^A-Za-z0-9&]/g, '').length;
  tag.className = 'tag tag-' + Math.min(5, Math.max(2, abbrLen));
  tag.textContent = t.abbr;

  const crest = document.createElement('div');
  crest.className = 'crest';
  crest.style.background = t.primary;

  /* A school's own logo is usually its initials, so the fallback draws a
     monogram in the team's second colour rather than spelling the name out.
     It reads far closer to the real plate. */
  const ink = readable(t.primary, t.secondary);
  const mono = document.createElement('div');
  mono.className = 'mono';
  const markText = (OVERRIDES[id] && OVERRIDES[id].mark) || t.mark || t.abbr;
  mono.style.color = ink;
  mono.style.setProperty('--edge', contrast(ink, t.primary) < 3
    ? (luma(t.primary) > .45 ? 'rgba(0,0,0,.55)' : 'rgba(255,255,255,.5)')
    : 'transparent');
  mono.innerHTML =
    `<b class="mk mk-${Math.min(4, markText.replace(/[^A-Za-z0-9&]/g, '').length)}">` +
    `${esc(markText)}</b>` +
    `<small>${esc(t.school.toUpperCase())}</small>`;
  crest.appendChild(mono);

  /* thin second-colour rule where the two panels meet, like the real plate */
  const seam = document.createElement('i');
  seam.className = 'seam';
  seam.style.background = t.secondary;

  /* Paint a already-decoded logo in this same frame. Going through onload
     every time meant one frame of the monogram on every re-render, which is
     the flicker you see when a team is picked. */
  const ready = LogoStore.imageFor(id);
  if (ready) {
    ready.loading = shouldLazy ? 'lazy' : 'eager';
    ready.decoding = 'async';
    crest.innerHTML = '';
    crest.appendChild(ready);
  } else {
    const loadLogo = () => LogoStore.get(id, src => {
      const img = new Image();
      img.alt = t.school;
      img.loading = shouldLazy ? 'lazy' : 'eager';
      img.decoding = 'async';
      const swap = () => { crest.innerHTML = ''; crest.appendChild(img); };
      img.onload = swap;
      img.src = src;
      if (img.complete && img.naturalWidth) swap();
    });
    if (shouldLazy && 'IntersectionObserver' in window) {
      const observer = new IntersectionObserver(entries => {
        if (!entries.some(entry => entry.isIntersecting)) return;
        observer.disconnect();
        loadLogo();
      }, { rootMargin: '240px 80px' });
      observer.observe(el);
    } else loadLogo();
  }

  const sheen = document.createElement('div');
  sheen.className = 'sheen';

  el.append(tag, seam, crest, sheen);
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

/* Plenty of schools list grey, white or black as a colour. Those are right
   on a jersey and dead on a lighting rig, so anything that tints the stage
   asks for the livelier of the two and falls back to the show's orange. */
function saturation(hex) {
  const [r, g, b] = hex2rgb(hex).map(v => v / 255);
  const mx = Math.max(r, g, b), mn = Math.min(r, g, b);
  const l = (mx + mn) / 2;
  if (mx === mn) return { s: 0, l };
  const d = mx - mn;
  return { s: l > .5 ? d / (2 - mx - mn) : d / (mx + mn), l };
}
function vividness(hex) {
  const { s, l } = saturation(hex);
  if (l < .10 || l > .93) return 0;          // near black / near white
  return s * (1 - Math.abs(l - .52) * .7);
}
function accentOf(t) {
  const a = vividness(t.primary), b = vividness(t.secondary);
  const best = b > a ? t.secondary : t.primary;
  return Math.max(a, b) < .18 ? '#F56A00' : best;
}

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

  const nextSeed = STATE.seeds.findIndex(seed => !seed);
  const nextOut = STATE.out.slice(0, STATE.outCount).findIndex(candidate => !candidate);
  const boardFull = nextSeed < 0 && nextOut < 0;

  list.forEach(t => {
    const card = document.createElement('button');
    card.type = 'button';
    const picked = isSeeded(t.id);
    card.className = 'pool-card candidate-card' + (picked ? ' picked' : '');
    card.disabled = picked || boardFull;
    card.dataset.team = t.id;
    card.setAttribute('aria-label', picked
      ? `${t.school} is already on the board`
      : boardFull
        ? `${t.school} unavailable because the board is full`
        : nextSeed >= 0
          ? `Add ${t.school} as seed ${nextSeed + 1}`
          : `Place ${t.school} at number ${nextOut + 13} outside the field`);
    card.title = picked
      ? `${t.school} is already on the board`
      : boardFull
        ? 'The board is full'
        : nextSeed >= 0
          ? `Add ${t.school} as seed ${nextSeed + 1} · right-click to edit`
          : `Place ${t.school} outside the field · right-click to edit`;
    card.appendChild(bannerEl(t.id, { lazy: true }));
    const identity = document.createElement('span');
    identity.className = 'candidate-identity';
    const school = document.createElement('strong');
    school.textContent = t.school;
    const detail = document.createElement('small');
    detail.textContent = `${t.mascot || 'Football'} · ${t.conf || 'Independent'}`;
    identity.append(school, detail);
    const action = document.createElement('span');
    action.className = 'candidate-add';
    action.innerHTML = boardFull && !picked
      ? '<small>BOARD</small><b>FULL</b>'
      : `<small>${picked ? 'ON BOARD' : 'ADD TO'}</small><b>${picked ? 'LOCKED' : 'NEXT'}</b>`;
    card.append(identity, action);
    card.onclick = () => seedNext(t.id);
    card.oncontextmenu = e => { e.preventDefault(); openTeamModal(t.id); };
    grid.appendChild(card);
  });

  const filled = STATE.seeds.filter(Boolean).length;
  grid.dataset.visible = String(list.length);
  $('#poolCount').textContent = `${list.length} PROGRAM${list.length === 1 ? '' : 'S'} · ${filled}/12 ON BOARD`;
  $('#tabCount').textContent = `${filled}/12`;
  updatePoolCallouts();
}

const isSeeded = id => STATE.seeds.some(s => s && s.id === id) ||
                       STATE.out.some(s => s && s.id === id);

/** Results belong to the exact seed order that produced them. Changing that
    order makes every stored matchup ambiguous, so clear the old scores before
    publishing the new field and let the chrome repaint from one state event. */
function persistFieldChange() {
  if (STATE.results && Object.keys(STATE.results).length) STATE.results = {};
  STATE.projectionPicks = Array(11).fill(null);
  STATE.projectionScores = {};
  persist();
}

function fieldSnapshot() {
  return CFPFoundation.actions.clone({
    seeds: STATE.seeds,
    out: STATE.out,
    results: STATE.results,
    projectionPicks: STATE.projectionPicks,
    projectionScores: STATE.projectionScores,
  });
}

function restoreFieldSnapshot(snapshot) {
  Object.assign(STATE, CFPFoundation.actions.clone(snapshot));
  persist();
  renderPool();
  renderSeeds();
  refreshGameShell();
}

/** Swap two seed slots — the touch-friendly way to reorder. */
function swapSeeds(a, b) {
  if (b < 0 || b > 11) return;
  const tmp = STATE.seeds[a];
  STATE.seeds[a] = STATE.seeds[b];
  STATE.seeds[b] = tmp;
  persistFieldChange(); renderSeeds();
  const moved = STATE.seeds[b];
  if (moved) CFPFoundation.live.announce(`${team(moved.id).school} moved to seed ${b + 1}`);
}

/** Click a team: fills the next open seed, then the first four out. */
/** Grey out one card instead of rebuilding the whole grid. */
function markPicked(id) {
  const card = [...document.querySelectorAll('.pool-card')]
    .find(candidate => candidate.dataset.team === id);
  if (card) {
    const picked = isSeeded(id);
    card.classList.toggle('picked', picked);
    const boardFull = STATE.seeds.every(Boolean) &&
      STATE.out.slice(0, STATE.outCount).every(Boolean);
    card.disabled = picked || boardFull;
    const action = card.querySelector('.candidate-add');
    if (action) action.innerHTML = boardFull && !picked
      ? '<small>BOARD</small><b>FULL</b>'
      : `<small>${picked ? 'ON BOARD' : 'ADD TO'}</small><b>${picked ? 'LOCKED' : 'NEXT'}</b>`;
  }
  const filled = STATE.seeds.filter(Boolean).length;
  const visible = Number($('#poolGrid')?.dataset.visible || TEAMS.length);
  $('#poolCount').textContent =
    `${visible} PROGRAM${visible === 1 ? '' : 'S'} · ${filled}/12 ON BOARD`;
  $('#tabCount').textContent = `${filled}/12`;
  updatePoolCallouts();
}

function updatePoolCallouts() {
  const next = STATE.seeds.findIndex(seed => !seed);
  const out = STATE.out.slice(0, STATE.outCount).findIndex(candidate => !candidate);
  const target = next >= 0 ? `NO. ${next + 1}` : out >= 0 ? `NO. ${out + 13}` : 'FULL';
  $$('.candidate-card:not(.picked) .candidate-add b').forEach(label => { label.textContent = target; });
  $$('.candidate-card:not(.picked)').forEach(card => {
    const school = card.querySelector('.candidate-identity strong')?.textContent || 'team';
    const full = target === 'FULL';
    card.disabled = full;
    card.setAttribute('aria-label', full
      ? `${school} unavailable because the board is full`
      : next >= 0
        ? `Add ${school} as seed ${next + 1}`
        : `Place ${school} at number ${out + 13} outside the field`);
    const small = card.querySelector('.candidate-add small');
    if (small) small.textContent = full ? 'BOARD' : next >= 0 ? 'ADD TO' : 'OUTSIDE';
  });
}

let lastPlacedIndex = -1;

function seedNext(id) {
  if (isSeeded(id)) return;
  const i = STATE.seeds.findIndex(s => !s);
  if (i !== -1) {
    STATE.seeds[i] = { id, record: '', champ: false };
    lastPlacedIndex = i;
    persistFieldChange(); markPicked(id); renderSeeds();
    CFPFoundation.live.announce(`${team(id).school} added as seed ${i + 1}`);
    if (i === 11) toast('That\'s all twelve — now the four who missed');
    return;
  }
  const o = STATE.out.slice(0, STATE.outCount).findIndex(s => !s);
  if (o === -1) { toast('The board is full'); return; }
  STATE.out[o] = { id, record: '' };
  persist(); markPicked(id); renderSeeds();
  CFPFoundation.live.announce(`${team(id).school} added as number ${o + 13} outside the field`);
  if (o === STATE.outCount - 1) toast('Board complete');
}

/* ======================================================================
   SEED BOARD
   ====================================================================== */
let dragFrom = null;

const SELECTION_TIERS = [
  { key: 'bye', round: 'ROUND ONE', title: 'BYE LINE', note: 'Seeds 1–4 · straight to the quarterfinals', slot: 'BYE' },
  { key: 'host', round: 'ROUND TWO', title: 'HOME FIELD', note: 'Seeds 5–8 · first-round campus hosts', slot: 'HOST' },
  { key: 'road', round: 'ROUND THREE', title: 'ROAD TEAMS', note: 'Seeds 9–12 · first-round visitors', slot: 'ROAD' },
];

function updateDecisionDeck() {
  const filled = STATE.seeds.filter(Boolean).length;
  const champs = Champs.list().length;
  const nextSeed = STATE.seeds.findIndex(seed => !seed);
  const nextOut = STATE.out.slice(0, STATE.outCount).findIndex(candidate => !candidate);
  const tierIndex = nextSeed < 0 ? 3 : Math.floor(nextSeed / 4);
  const tier = SELECTION_TIERS[Math.min(tierIndex, 2)];
  const round = nextSeed < 0 ? 'ROUND FOUR' : tier.round;
  const roundNote = nextSeed < 0
    ? 'Name the first programs outside the field'
    : tier.note.split(' · ')[1];
  const next = nextSeed >= 0
    ? `NO. ${nextSeed + 1} · ${tier.slot} LINE`
    : nextOut >= 0 ? `NO. ${nextOut + 13} · BUBBLE` : 'BALLOT COMPLETE';
  const percent = Math.round((filled / 12) * 100);

  if ($('#decisionRound')) $('#decisionRound').textContent = round;
  if ($('#decisionRoundNote')) $('#decisionRoundNote').textContent = roundNote;
  if ($('#decisionFilled')) $('#decisionFilled').innerHTML = `${filled}<small>/12</small>`;
  if ($('#decisionAqs')) $('#decisionAqs').innerHTML = `${champs}<small>/5</small>`;
  if ($('#decisionNext')) $('#decisionNext').textContent = next;
  if ($('#decisionProgress')) $('#decisionProgress').style.width = `${percent}%`;
  if ($('#runwayProgress')) $('#runwayProgress').style.width = `${percent}%`;
  $('#room')?.setAttribute('data-decision-round', String(tierIndex + 1));
  updatePoolCallouts();
}

function renderSeeds() {
  const list = $('#seedList');
  list.innerHTML = '';

  const tierBodies = SELECTION_TIERS.map((tier, tierIndex) => {
    const section = document.createElement('section');
    section.className = `seed-tier tier-${tier.key}`;
    const selected = STATE.seeds.slice(tierIndex * 4, tierIndex * 4 + 4).filter(Boolean).length;
    section.innerHTML = `<header><span>${tier.round}</span><b>${tier.title}</b><small>${tier.note}</small><em>${selected}/4</em></header>`;
    const body = document.createElement('div');
    body.className = 'seed-tier-body';
    section.appendChild(body);
    list.appendChild(section);
    return body;
  });

  STATE.seeds.forEach((s, i) => {
    const row = document.createElement('div');
    const tier = SELECTION_TIERS[Math.floor(i / 4)];
    row.className = 'seedrow' + (i < 4 ? ' bye' : '') + (s ? '' : ' empty') +
      (i === lastPlacedIndex ? ' newly-filled' : '');
    row.draggable = !!s;
    row.dataset.i = i;
    row.innerHTML = `<span class="grip">&#8942;&#8942;</span><span class="seed-rank"><b class="num">${i + 1}</b><small>${tier.slot}</small></span>`;

    if (s) {
      const wrap = document.createElement('div');
      wrap.className = 'banner-wrap';
      wrap.appendChild(bannerEl(s.id));
      row.appendChild(wrap);

      const meta = document.createElement('div');
      meta.className = 'meta';
      const recLabel = document.createElement('small');
      recLabel.textContent = 'RECORD';
      const rec = document.createElement('input');
      rec.name = `seed-${i + 1}-record`;
      rec.autocomplete = 'off';
      rec.placeholder = '0-0'; rec.value = s.record || '';
      rec.setAttribute('aria-label', `${team(s.id).school} record`);
      rec.oninput = () => { s.record = rec.value; persist(); };
      meta.append(recLabel, rec);
      row.appendChild(meta);

      const cc = document.createElement('button');
      cc.className = 'ccbtn' + (s.champ ? ' on' : '');
      cc.textContent = 'AQ';
      cc.title = s.champ
        ? `${team(s.id).conf} champion — click to make at-large`
        : 'Mark as conference champion';
      cc.setAttribute('aria-label', cc.title);
      cc.onclick = () => {
        s.champ = !s.champ; persist(); renderSeeds();
      };
      row.appendChild(cc);

      const mv = Movement.of(i);
      if (mv) {
        const m = document.createElement('span');
        m.className = 'movetag ' + mv.dir;
        m.title = Movement.caption(i);
        m.textContent = mv.dir === 'new' ? 'NEW'
          : mv.dir === 'same' ? '—'
          : (mv.dir === 'up' ? '▲' : '▼') + mv.by;
        row.appendChild(m);
      }

      const move = document.createElement('div');
      move.className = 'move';
      move.innerHTML = `<button aria-label="Move ${team(s.id).school} up" title="Move up" ${i === 0 ? 'disabled' : ''}>&#9650;</button>
                        <button aria-label="Move ${team(s.id).school} down" title="Move down" ${i === 11 ? 'disabled' : ''}>&#9660;</button>`;
      move.children[0].onclick = () => swapSeeds(i, i - 1);
      move.children[1].onclick = () => swapSeeds(i, i + 1);
      row.appendChild(move);

      const acts = document.createElement('div');
      acts.className = 'acts';
      acts.innerHTML = `<button aria-label="Edit ${team(s.id).school} branding" title="Edit team look">&#9998;</button>
                        <button aria-label="Remove ${team(s.id).school} from the field" title="Remove from field">&times;</button>`;
      acts.children[0].onclick = () => openTeamModal(s.id);
      acts.children[1].onclick = async event => {
        const school = team(s.id).school;
        const before = fieldSnapshot();
        const accepted = await CFPFoundation.actions.confirm({
          title: `Remove ${school}?`,
          message: 'Removing this team also clears results and projections tied to the current seed order. You can undo the change afterward.',
          confirmLabel: 'Remove team',
          trigger: event.currentTarget,
        });
        if (!accepted) return;
        lastPlacedIndex = -1;
        STATE.seeds[i] = null; persistFieldChange(); renderPool(); renderSeeds();
        CFPFoundation.live.announce(`${school} removed from the field`);
        CFPFoundation.actions.undo(`${school} removed`, () => restoreFieldSnapshot(before));
      };
      row.appendChild(acts);
    } else {
      const lbl = document.createElement('div');
      lbl.className = 'slot-lbl';
      lbl.innerHTML = `<b>OPEN DECISION</b><small>${tier.note}</small>`;
      row.appendChild(lbl);
    }

    row.addEventListener('dragstart', event => {
      dragFrom = i; event.dataTransfer.effectAllowed = 'move';
      event.dataTransfer.setData('text/plain', String(i));
    });
    row.addEventListener('dragover', event => { event.preventDefault(); row.classList.add('dragover'); });
    row.addEventListener('dragleave', () => row.classList.remove('dragover'));
    row.addEventListener('drop', event => {
      event.preventDefault(); row.classList.remove('dragover');
      if (dragFrom === null || dragFrom === i) return;
      const moved = STATE.seeds.splice(dragFrom, 1)[0];
      STATE.seeds.splice(i, 0, moved);
      while (STATE.seeds.length < 12) STATE.seeds.push(null);
      STATE.seeds.length = 12;
      dragFrom = null; persistFieldChange(); renderSeeds(); renderPool();
    });

    tierBodies[Math.floor(i / 4)].appendChild(row);
  });

  lastPlacedIndex = -1;
  const readiness = fieldReadiness();
  const filled = readiness.filled;
  const ready = readiness.ready;
  $('#btnGo').disabled = !ready;
  $('#btnGo').classList.toggle('not-ready', !ready);
  $('#btnGo').setAttribute('aria-label', ready
    ? 'Enter the Selection Night premiere'
    : `Selection Night unavailable. ${readiness.reasons.join(' ')}`);
  $('#btnGo').title = ready ? 'Enter the Selection Night premiere' : readiness.reasons.join(' ');
  const review = $('#btnOverride');
  if (review) {
    review.hidden = ready;
    review.setAttribute('aria-label', `Review Selection Night requirements. ${readiness.reasons.join(' ')}`);
  }
  if ($('#roomReadyReason')) {
    $('#roomReadyReason').hidden = ready;
    $('#roomReadyReason').textContent = readiness.reasons.join(' ');
  }
  if ($('#roomReadyLabel')) $('#roomReadyLabel').textContent = ready
    ? 'FIELD READY TO AIR' : `${filled}/12 · FIELD IN PROGRESS`;
  $('#roomReadyLabel')?.parentElement?.classList.toggle('ready', ready);
  updateDecisionDeck();
  renderBidNote();
  renderOut();
}

/** Advisory line under the field: how the automatic bids are shaping up. */
function renderBidNote() {
  const box = $('#bidNote');
  if (!box) return;
  const champs = Champs.list();
  const problems = fieldReadiness().issues
    .filter(issue => issue.code !== 'field-incomplete')
    .map(CFPFoundation.validationMessage);

  if (!champs.length && !problems.length) {
    box.className = 'bid-note';
    box.innerHTML = 'Tap <b>CC</b> on a row to flag a conference champion. ' +
      'The five highest-ranked champions hold the automatic bids.';
    return;
  }

  const auto = champs.slice(0, 5).map(c => `No. ${c.seed}`).join(', ');
  box.className = 'bid-note' + (problems.length ? ' warn' : ' ok');
  box.innerHTML =
    `<b>${champs.length} conference champion${champs.length === 1 ? '' : 's'}</b> in the field` +
    (auto ? ` &mdash; automatic bids to ${auto}.` : '.') +
    (problems.length ? '<i>' + problems.map(esc).join(' ') + '</i>' : '');
}

/* ---- first four out ------------------------------------------------- */
function renderOut() {
  const list = $('#outList');
  if (!list) return;
  list.innerHTML = '';

  STATE.out.slice(0, STATE.outCount).forEach((s, i) => {
    const row = document.createElement('div');
    row.className = 'seedrow out' + (s ? '' : ' empty');
    row.innerHTML = `<span class="num">${i + 13}</span>`;

    if (s) {
      const wrap = document.createElement('div');
      wrap.className = 'banner-wrap';
      wrap.appendChild(bannerEl(s.id));
      row.appendChild(wrap);

      const meta = document.createElement('div');
      meta.className = 'meta';
      const rec = document.createElement('input');
      rec.name = `out-${i + 1}-record`;
      rec.autocomplete = 'off';
      rec.placeholder = 'REC'; rec.value = s.record || '';
      rec.setAttribute('aria-label', `${team(s.id).school} record`);
      rec.oninput = () => { s.record = rec.value; persist(); };
      meta.appendChild(rec);
      row.appendChild(meta);

      const move = document.createElement('div');
      move.className = 'move';
      move.innerHTML = `<button aria-label="Move ${team(s.id).school} up outside the field" title="Move up" ${i === 0 ? 'disabled' : ''}>&#9650;</button>
                        <button aria-label="Move ${team(s.id).school} down outside the field" title="Move down" ${i === STATE.outCount - 1 ? 'disabled' : ''}>&#9660;</button>`;
      move.children[0].onclick = () => swapOut(i, i - 1);
      move.children[1].onclick = () => swapOut(i, i + 1);
      row.appendChild(move);

      const acts = document.createElement('div');
      acts.className = 'acts';
      acts.innerHTML = `<button aria-label="Edit ${team(s.id).school} branding" title="Edit team look">&#9998;</button>
                        <button aria-label="Remove ${team(s.id).school} from outside the field" title="Remove">&times;</button>`;
      acts.children[0].onclick = () => openTeamModal(s.id);
      acts.children[1].onclick = async event => {
        const school = team(s.id).school;
        const before = fieldSnapshot();
        const accepted = await CFPFoundation.actions.confirm({
          title: `Remove ${school}?`,
          message: 'This removes the team from the just-missed list. You can undo the change afterward.',
          confirmLabel: 'Remove team',
          trigger: event.currentTarget,
        });
        if (!accepted) return;
        STATE.out[i] = null; persist(); renderPool(); renderSeeds();
        CFPFoundation.live.announce(`${school} removed from outside the field`);
        CFPFoundation.actions.undo(`${school} removed`, () => restoreFieldSnapshot(before));
      };
      row.appendChild(acts);
    } else {
      const lbl = document.createElement('div');
      lbl.className = 'slot-lbl';
      lbl.textContent = 'open — just missed';
      row.appendChild(lbl);
    }
    list.appendChild(row);
  });
}

function swapOut(a, b) {
  if (b < 0 || b >= STATE.outCount) return;
  const t = STATE.out[a]; STATE.out[a] = STATE.out[b]; STATE.out[b] = t;
  persist(); renderOut();
}

/* 12-team CFP structure */
function firstRound() {
  return [
    { hi: 5, lo: 12 }, { hi: 6, lo: 11 }, { hi: 7, lo: 10 }, { hi: 8, lo: 9 }
  ];
}

/* ======================================================================
   SHARE / PUBLISH — a portable preview or a permanent cloud event
   ====================================================================== */
function sharePayload() {
  const selected = [...STATE.seeds, ...STATE.out.slice(0, STATE.outCount)]
    .filter(Boolean).map(row => row.id);
  const identities = {};
  [...new Set(selected)].forEach(id => {
    const t = team(id);
    if (!t || (!t.custom && !OVERRIDES[id])) return;
    identities[id] = {
      a: t.abbr, sc: t.school, m: t.mascot, p: t.primary, s: t.secondary,
      c: t.conf, mk: t.mark || t.abbr
    };
  });
  return {
    l: STATE.league, y: STATE.season, t: STATE.title, s: STATE.subtitle,
    k: STATE.ticker, ol: STATE.outLabel, oc: STATE.outCount, o: STATE.order, p: STATE.pace, c: STATE.cold, f: STATE.fx,
    n: STATE.calls, st: STATE.seedTalk, rf: STATE.roomFilm, mv: STATE.musicUnderVoice, vv: STATE.voiceVol,
    cv: STATE.callVol, fv: STATE.filmVol, bv: STATE.booneVol,
    g: STATE.logoPattern,
    pm: STATE.premiere || 0,
    rs: STATE.results && Object.keys(STATE.results).length ? STATE.results : undefined,
    d: STATE.seeds.map(x => x ? [x.id, x.record || '', x.champ ? 1 : 0] : null),
    u: STATE.out.map(x => x ? [x.id, x.record || ''] : null),
    v: identities
  };
}

function encodePayload(payload) {
  return btoa(unescape(encodeURIComponent(JSON.stringify(payload))))
    .replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

function applySharedPayload(p) {
  try {
    if (!p || typeof p !== 'object' || !Array.isArray(p.d)) return false;
    STATE.league   = p.l ?? STATE.league;
    STATE.season   = p.y ?? STATE.season;
    STATE.title    = p.t ?? STATE.title;
    STATE.subtitle = p.s ?? STATE.subtitle;
    STATE.ticker   = p.k ?? '';
    STATE.outLabel = p.ol ?? '';
    STATE.outCount = p.oc ?? 2;
    STATE.order    = p.o ?? 'asc';
    STATE.pace     = p.p ?? 10000;
    STATE.cold     = p.c ?? 'full';
    STATE.fx       = p.f ?? 'max';
    STATE.calls    = p.n ?? 'on';
    STATE.seedTalk = p.st ?? 'lead';
    STATE.roomFilm = p.rf ?? 'on';
    STATE.musicUnderVoice = p.mv ?? 55;
    STATE.voiceVol = p.vv ?? 100;
    STATE.booneVol = p.bv ?? 200;
    STATE.callVol  = p.cv ?? 100;
    STATE.filmVol  = p.fv ?? 100;
    if (p.g) STATE.logoPattern = p.g;
    STATE.premiere = p.pm || 0;
    STATE.results  = p.rs || {};
    STATE.projectionPicks = Array(11).fill(null);
    STATE.projectionScores = {};
    STATE.seeds = (p.d || []).map(x =>
      x ? { id: x[0], record: x[1], champ: !!x[2] } : null);
    while (STATE.seeds.length < 12) STATE.seeds.push(null);
    STATE.out = (p.u || []).map(x => x ? { id: x[0], record: x[1] } : null);
    while (STATE.out.length < 4) STATE.out.push(null);

    Object.entries(p.v || {}).forEach(([id, o]) => {
      if (!TEAM_BY_ID[id]) {
        TEAM_BY_ID[id] = { id, school: o.sc || id, mascot: o.m || '',
                           abbr: o.a || id, conf: o.c || '',
                           primary: o.p || '#222', secondary: o.s || '#fff',
                           mark: o.mk || o.a || id, custom: true };
      }
      OVERRIDES[id] = Object.assign({}, OVERRIDES[id], {
        abbr: o.a, school: o.sc, mascot: o.m,
        primary: o.p, secondary: o.s, conf: o.c, mark: o.mk
      });
    });
    return true;
  } catch (e) { return false; }
}

function encodeState() { return encodePayload(sharePayload()); }

function decodeState(b64) {
  try {
    const encoded = b64.replace(/-/g, '+').replace(/_/g, '/');
    return applySharedPayload(JSON.parse(decodeURIComponent(escape(atob(encoded)))));
  } catch (e) { return false; }
}

const portableShareLink = () => `${location.origin}/#show=${encodeState()}`;
const publishedShareLink = () => STATE.shareCode
  ? `${location.origin}/watch/${STATE.shareCode}` : '';
const shareLink = () => publishedShareLink() || portableShareLink();

function fieldReadiness() {
  const champions = STATE.seeds
    .map((seed, index) => seed?.champ
      ? { seed: index + 1, conf: team(seed.id)?.conf || '' } : null)
    .filter(Boolean);
  return Object.assign(
    CFPFoundation.validatePlayoff({ seeds: STATE.seeds, champions }),
    { missing: STATE.seeds.map((seed, index) => seed ? null : index + 1).filter(Boolean) },
  );
}

function enterPremiere(allowPreview = false) {
  const status = fieldReadiness();
  if (!VIEWER && !status.ready && !allowPreview) {
    openReadiness('premiere');
    return false;
  }
  showScreen('show');
  Show.arm();
  return true;
}

function openReadiness(intent = 'premiere') {
  const status = fieldReadiness();
  const modal = $('#mReadiness');
  if (!modal) return;
  modal.dataset.intent = intent;
  $('#readyCount').textContent = `${status.filled}/12`;
  $('#readyBar').style.width = `${status.filled / 12 * 100}%`;
  $('#readyMissing').textContent = status.missing.length
    ? `Missing seeds: ${status.missing.map(seed => `No. ${seed}`).join(', ')}`
    : 'The field is complete.';
  const reasons = $('#readyReasons');
  reasons.innerHTML = '';
  status.reasons.forEach(reason => {
    const item = document.createElement('li');
    item.textContent = reason;
    reasons.appendChild(item);
  });
  $('#readyTitle').textContent = intent === 'publish'
    ? 'FINISH THE FIELD BEFORE IT GOES PUBLIC'
    : 'SELECTION NIGHT IS NOT READY TO AIR';
  CFPFoundation.modal.open(modal);
}

function closeReadiness() { CFPFoundation.modal.close($('#mReadiness')); }

async function loadPublishedEvent(code) {
  try {
    const response = await fetch(`/api/events/${encodeURIComponent(code)}`, {
      headers: { accept: 'application/json' }, credentials: 'same-origin'
    });
    const result = await response.json().catch(() => ({}));
    if (!response.ok || !result.event || !applySharedPayload(result.event.payload)) {
      throw new Error(result.error || 'This Selection Night event is unavailable');
    }
    STATE.shareCode = result.event.code;
    STATE.cloudEventId = '';
    window.CFP_PUBLISHED_EVENT = result.event;
    document.title = `${result.event.league} ${result.event.season} — Selection Night`;
    return true;
  } catch (error) {
    window.CFP_EVENT_ERROR = error.message || 'This Selection Night event is unavailable';
    return false;
  }
}

function loadDemoEvent() {
  const demo = [
    ['alabama', '13-0'], ['ohiostate', '12-1'], ['oregon', '12-1'], ['georgia', '11-2'],
    ['texas', '11-2'], ['pennstate', '11-2'], ['notredame', '11-1'], ['clemson', '10-3'],
    ['tennessee', '10-2'], ['lsu', '10-2'], ['miami', '10-2'], ['boisestate', '12-1']
  ];
  STATE.league = 'Saturday Night Dynasty';
  STATE.season = '2027';
  STATE.title = 'College Football Playoff';
  STATE.subtitle = 'Selection Night Demo';
  STATE.seeds = demo.map(([id, record]) => ({ id, record, champ: false }));
  STATE.out = [
    { id: 'floridastate', record: '9-3' }, { id: 'olemiss', record: '9-3' }, null, null
  ];
  STATE.outCount = 2;
  STATE.results = {};
  STATE.projectionPicks = Array(11).fill(null);
  STATE.projectionScores = {};
  STATE.shareCode = '';
  STATE.cloudEventId = '';
  VIEWER = true;
  document.body.classList.add('viewer', 'demo-viewer');
  applyFx();
  renderPool();
  renderSeeds();
  $('#mLink').classList.remove('on');
  showScreen('show');
  Show.arm();
}

/** Show the link, with a copy button and a fallback you can select by hand. */
function openShare() {
  const url = shareLink();
  const status = fieldReadiness();
  const seeded = status.filled;
  const outs = STATE.out.slice(0, STATE.outCount).filter(Boolean).length;

  $('#shareUrl').value = url;
  $('#shareCount').textContent = seeded + '/12';
  $('#shareOut').textContent = outs + '/' + STATE.outCount;
  $('#shareLen').textContent = url.length;

  const local = /^file:/.test(location.protocol) ||
                /^(localhost|127\.|0\.0\.0\.0|\[::1\])/.test(location.hostname);
  $('#shareNote').innerHTML = !status.ready
    ? `<b style="color:var(--accent2)">Draft preview: ${seeded} of 12 seeds.</b> ` +
      'You can copy a private preview, but a permanent public event cannot go live until the field is complete.'
    : (local
       ? '<b style="color:var(--accent2)">This is a local address.</b> ' +
         'It will only open on this computer. Publish the site first if you want ' +
         'the league to be able to use it.'
       : (STATE.shareCode
          ? '<b style="color:#67e8a5">Permanent event is live.</b> Publish an update whenever the field or production changes.'
          : 'The field is ready. Publish a short permanent event link, or copy the portable preview.'));

  const publish = $('#mSharePublish');
  if (publish) {
    publish.disabled = !status.ready;
    publish.textContent = !CloudSync.isSignedIn()
      ? 'Sign in to publish'
      : (STATE.cloudEventId ? 'Publish current update' : 'Publish permanent event');
  }
  const mode = $('#shareMode');
  if (mode) mode.textContent = STATE.shareCode ? 'PERMANENT CLOUD EVENT' : 'PORTABLE PREVIEW';

  $('#mShare').classList.add('on');
  setTimeout(() => { $('#shareUrl').focus(); $('#shareUrl').select(); }, 60);
}

async function copyShare() {
  const url = $('#shareUrl').value || shareLink();
  try {
    await navigator.clipboard.writeText(url);
    toast('Link copied — send it to the league');
  } catch (e) {
    $('#shareUrl').select();
    document.execCommand && document.execCommand('copy');
    toast('Link selected — press Ctrl+C');
  }
}

/* ======================================================================
   FINAL BRACKET  (geometry in % of the 16:9 canvas)
   ====================================================================== */
/** Draw the bracket in the same left-to-right tournament language used by
    College Football 27. The twelve original seed plates retain `.bk-seed`
    hooks because the selection show lands them here one at a time. */
function renderBracket(target) {
  const bk = target || $('#bracket');
  if (!bk) return;
  bk.innerHTML = '';
  bk.classList.add('game-bracket');
  const solved = Bracket.solve();

  const title = document.createElement('div');
  title.className = 'bk-title game-bracket-title';
  title.innerHTML = `<span>${esc(STATE.season)} COLLEGE FOOTBALL PLAYOFF</span>` +
    `<small>${esc(STATE.league)} &middot; THE ROAD TO THE NATIONAL CHAMPIONSHIP</small>`;
  bk.appendChild(title);

  const label = (text, x, cls = '') => {
    const node = document.createElement('div');
    node.className = `bk-bowl game-round-label ${cls}`;
    node.style.left = x + '%';
    node.innerHTML = text;
    bk.appendChild(node);
  };
  label('FIRST ROUND', 2);
  label('QUARTERFINAL', 29);
  label('SEMIFINAL', 54);
  label('NATIONAL CHAMPIONSHIP', 75, 'bk-natty');

  const line = (x, y, w, h, kind) => {
    const node = document.createElement('div');
    node.className = `bk-line ${kind || (w > h ? 'horizontal' : 'vertical')}`;
    node.style.cssText = `left:${x}%;top:${y}%;width:${w}%;height:${h}%`;
    bk.appendChild(node);
  };
  const h = (x1, x2, y) => line(x1, y, x2 - x1, .28, 'horizontal');
  const v = (x, y1, y2) => line(x, y1, .16, y2 - y1, 'vertical');

  const seedRow = (seedNo, gameState, side) => {
    const selection = STATE.seeds[seedNo - 1];
    const row = document.createElement('div');
    row.className = 'bk-seed game-bracket-team';
    row.dataset.seed = seedNo;
    if (gameState?.winner) row.classList.add(gameState.winner === seedNo ? 'winner' : 'eliminated');
    const rank = document.createElement('span');
    rank.className = 'sn'; rank.textContent = seedNo;
    row.appendChild(rank);
    if (selection) row.appendChild(bannerEl(selection.id));
    else {
      const placeholder = document.createElement('div');
      placeholder.className = 'game-slot-placeholder'; placeholder.textContent = 'TBD';
      row.appendChild(placeholder);
    }
    const score = document.createElement('b');
    score.className = 'game-bracket-score';
    score.textContent = gameState?.[side === 'a' ? 'sa' : 'sb'] ?? '';
    row.appendChild(score);
    return row;
  };

  const firstRound = [
    { id: 'fr2', seeds: [12, 5], y: 18 },
    { id: 'fr1', seeds: [9, 8], y: 38 },
    { id: 'fr4', seeds: [11, 6], y: 62 },
    { id: 'fr3', seeds: [10, 7], y: 82 }
  ];
  firstRound.forEach(item => {
    const state = solved[item.id];
    const game = document.createElement('div');
    game.className = 'game-bracket-match game-first-round' + (state.winner ? ' decided' : '');
    game.dataset.game = item.id;
    game.style.cssText = `left:2%;top:${item.y}%;width:20%`;
    game.append(seedRow(item.seeds[0], state, state.a === item.seeds[0] ? 'a' : 'b'));
    game.append(seedRow(item.seeds[1], state, state.a === item.seeds[1] ? 'a' : 'b'));
    bk.appendChild(game);
    h(22, 29, item.y);
  });

  const gameRow = (seedNo, placeholder, score, winner) => {
    const row = document.createElement('div');
    row.className = 'game-bracket-team game-advanced-team' +
      (winner && seedNo ? (winner === seedNo ? ' winner' : ' eliminated') : '');
    const rank = document.createElement('span');
    rank.className = 'sn'; rank.textContent = seedNo || '';
    row.appendChild(rank);
    if (seedNo && STATE.seeds[seedNo - 1]) row.appendChild(bannerEl(STATE.seeds[seedNo - 1].id));
    else {
      const waiting = document.createElement('div');
      waiting.className = 'game-slot-placeholder'; waiting.textContent = placeholder;
      row.appendChild(waiting);
    }
    const points = document.createElement('b');
    points.className = 'game-bracket-score'; points.textContent = score ?? '';
    row.appendChild(points);
    return row;
  };

  const bracketGame = (id, x, y, width) => {
    const g = GAME_BY_ID[id];
    const state = solved[id];
    const node = document.createElement('div');
    node.className = 'bk-box game-bracket-match game-advanced-match' +
      (state.winner ? ' decided' : '') + (state.a && state.b && !state.winner ? ' ready' : '');
    node.dataset.game = id;
    node.style.cssText = `left:${x}%;top:${y}%;width:${width}%`;
    node.appendChild(gameRow(state.a, Bracket.slotName(state.a, solved, g.a), state.sa, state.winner));
    node.appendChild(gameRow(state.b, Bracket.slotName(state.b, solved, g.b), state.sb, state.winner));
    const name = document.createElement('small');
    name.textContent = g.name.toUpperCase();
    node.appendChild(name);
    bk.appendChild(node);
    return node;
  };

  const qf = [
    { id: 'qf2', y: 18 }, { id: 'qf1', y: 38 },
    { id: 'qf4', y: 62 }, { id: 'qf3', y: 82 }
  ];
  qf.forEach(item => bracketGame(item.id, 29, item.y, 18));
  bracketGame('sf1', 54, 28, 17);
  bracketGame('sf2', 54, 72, 17);
  bracketGame('nc', 75, 50, 16);

  [[18, 38, 28], [62, 82, 72]].forEach(([a, b, mid]) => {
    h(47, 50.5, a); h(47, 50.5, b); v(50.5, a, b); h(50.5, 54, mid);
  });
  h(71, 73, 28); h(71, 73, 72); v(73, 28, 72); h(73, 75, 50);
  h(91, 94, 50);

  const champion = document.createElement('div');
  champion.className = 'game-bracket-champion';
  champion.innerHTML = '<div class="game-bracket-trophy"></div>';
  const champSeed = solved.nc.winner;
  const championCopy = document.createElement('span');
  if (champSeed && STATE.seeds[champSeed - 1]) {
    const selection = STATE.seeds[champSeed - 1];
    champion.classList.add('crowned');
    championCopy.innerHTML = `<b>${esc(team(selection.id).abbr)}</b><small>NATIONAL CHAMPION</small>`;
  } else championCopy.innerHTML = '<b>LAS VEGAS, NV</b><small>ONE CHAMPION</small>';
  champion.appendChild(championCopy);
  bk.appendChild(champion);

  if (bk.id === 'bracket') renderFieldList();
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
let editingNewTeam = false;

function openNewTeamModal() {
  const id = `xcustom${Date.now().toString(36)}`;
  const custom = { id, school: 'New Program', mascot: '', abbr: 'NEW',
    conf: 'Custom', primary: '#333333', secondary: '#ffffff', custom: true };
  TEAM_BY_ID[id] = custom;
  TEAMS.push(custom);
  editingNewTeam = true;
  openTeamModal(id);
  $('#mTeamTitle').textContent = 'ADD A CUSTOM PROGRAM';
  $('#fSchool').select();
}

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

function closeTeamModal() {
  if (editingNewTeam && editingId) {
    const index = TEAMS.findIndex(candidate => candidate.id === editingId);
    if (index >= 0) TEAMS.splice(index, 1);
    delete TEAM_BY_ID[editingId];
    delete OVERRIDES[editingId];
  }
  editingNewTeam = false;
  $('#mTeam').classList.remove('on');
  editingId = null;
}

function saveTeamModal() {
  OVERRIDES[editingId] = {
    school: $('#fSchool').value.trim() || TEAM_BY_ID[editingId].school,
    mascot: $('#fMascot').value.trim(),
    abbr:  ($('#fAbbr').value.trim() || TEAM_BY_ID[editingId].abbr).toUpperCase(),
    conf:   $('#fConf').value.trim(),
    primary: normHex($('#fPrimHex').value),
    secondary: normHex($('#fSecHex').value)
  };
  if (editingNewTeam) {
    Object.assign(TEAM_BY_ID[editingId], OVERRIDES[editingId]);
    saveCustomTeams();
    if (!CONFERENCES.includes('Custom')) {
      CONFERENCES.push('Custom');
      const option = document.createElement('option');
      option.value = 'Custom'; option.textContent = 'Custom';
      $('#confFilter').appendChild(option);
    }
    editingNewTeam = false;
  }
  saveOverrides(OVERRIDES);
  closeTeamModal(); renderPool(); renderSeeds(); Dynasty.renderStrip();
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
const persist = () => {
  if (VIEWER) return;          // never overwrite a guest's own board
  localStorage.setItem('cfp27.state', JSON.stringify(STATE));
  document.dispatchEvent(new CustomEvent('cfp:state', {
    detail: { seeded: STATE.seeds.filter(Boolean).length }
  }));
};

function restore() {
  try {
    const s = JSON.parse(localStorage.getItem('cfp27.state') || 'null');
    if (s) Object.assign(STATE, s);
    /* Older saves stored the heading as text. If it is just one of the names
       we generate anyway, treat it as automatic so it follows the count. */
    if (STATE.outLabel &&
        ['first two out', 'first four out'].includes(STATE.outLabel.toLowerCase()))
      STATE.outLabel = '';
    if (STATE.seedTalk === 'on') STATE.seedTalk = 'lead';   // was build-up + reaction
    if (!Array.isArray(STATE.seeds) || STATE.seeds.length !== 12)
      STATE.seeds = Array(12).fill(null);

    /* Format 1 stored `champ` as "has a first-round bye", which was only
       ever seeds 1-4 and was never read. It now means "won their
       conference", so an old board would arrive with four teams wrongly
       flagged — clear them and let the commissioner set the real five. */
    if ((s && s.v) !== 2) {
      STATE.seeds.forEach(x => { if (x) x.champ = false; });
      STATE.v = 2;
    }
    if (!STATE.results || typeof STATE.results !== 'object') STATE.results = {};
    if (!Array.isArray(STATE.projectionPicks) || STATE.projectionPicks.length !== 11)
      STATE.projectionPicks = Array(11).fill(null);
    else STATE.projectionPicks = STATE.projectionPicks.map(x => x === 0 || x === 1 ? x : null);
    if (!STATE.projectionScores || typeof STATE.projectionScores !== 'object' ||
        Array.isArray(STATE.projectionScores)) STATE.projectionScores = {};
  } catch (e) {}
}

function toast(msg) {
  const t = $('#toast');
  t.textContent = msg; t.classList.add('on');
  clearTimeout(t._h); t._h = setTimeout(() => t.classList.remove('on'), 2400);
}

/* A guest opened a share link: the committee room and the home hub are
   sealed off so the field cannot be read before the show plays. Everything
   downstream of the reveal — the bracket, pick'em, the history — is fine,
   because by then they have seen it. */
const VIEWER_BLOCKED = ['room', 'home'];

function showScreen(name, options = {}) {
  if (VIEWER && VIEWER_BLOCKED.includes(name)) name = 'show';
  const current = document.body.dataset.screen || $('.screen.active')?.id || 'home';
  if (current === 'show' && name !== 'show') Show.stop();
  const managed = CFPFoundation.activateScreen(name, { focus: options.focus !== false });
  if (!managed) {
    $$('.screen').forEach(screen => CFPFoundation.setScreenState(screen, screen.id === name));
  }
  document.body.dataset.screen = name;
  document.body.classList.toggle('premiere-active', name === 'show');
  const chrome = $('#chrome');
  if (chrome) {
    chrome.inert = name === 'show';
    chrome.setAttribute('aria-hidden', name === 'show' ? 'true' : 'false');
  }

  /* The show is the broadcast — it gets the whole glass. Everywhere else
     wears the ESPN chrome. A guest on a share link never sees it at all,
     because every link in it leads somewhere they are not allowed. */
  document.body.classList.toggle('chromed', name !== 'show' && !VIEWER);
  if (name !== 'show' && !VIEWER) { Dynasty.renderStrip(); Dynasty.markNav(name); }
  refreshGameShell();

  applyRoomFilm(name);
  if (name === 'final')   renderBracket();
  if (name === 'results') Dynasty.renderResults();
  if (name === 'pickem')  Dynasty.renderPickem();
  if (name === 'history') Dynasty.renderHistory();
  if (name === 'home')    refreshHub();
  if (!options.fromHistory)
    CFPFoundation.router.commit(name, { replace: !!options.replace, preservePath: VIEWER });
  else document.title = CFPFoundation.titleForScreen(name, STATE.league);
  document.dispatchEvent(new CustomEvent('cfp:screen', { detail: { name } }));
}

async function publishShare() {
  const status = fieldReadiness();
  if (!status.ready) { openReadiness('publish'); return; }
  if (!CloudSync.isSignedIn()) {
    $('#mShare').classList.remove('on');
    CloudSync.openAccount();
    toast('Sign in to publish a permanent Selection Night');
    return;
  }
  const button = $('#mSharePublish');
  const previous = button.textContent;
  button.disabled = true;
  button.textContent = 'Publishing securely…';
  try {
    const event = await CloudSync.publishEvent(sharePayload(), STATE.cloudEventId || '');
    STATE.cloudEventId = event.id;
    STATE.shareCode = event.code;
    persist();
    $('#shareUrl').value = event.url;
    $('#shareLen').textContent = event.url.length;
    $('#shareMode').textContent = 'PERMANENT CLOUD EVENT';
    $('#shareNote').innerHTML = '<b style="color:#67e8a5">Live nationwide.</b> This short link now opens a sealed spectator broadcast. Publish again to update the same URL.';
    button.textContent = 'Publish current update';
    toast(event.version > 1 ? `Event updated to version ${event.version}` : 'Permanent Selection Night published');
  } catch (error) {
    button.textContent = previous;
    toast(error.message || 'Could not publish this event');
  } finally { button.disabled = false; }
}

/** The counts on the home-screen hub cards. */
function refreshHub() {
  const set = (id, txt) => { const e = $('#' + id); if (e) e.textContent = txt; };
  const champ = Bracket.champion();
  const played = Bracket.played();
  set('hubResults', champ
    ? `${team(STATE.seeds[champ - 1].id).school} won it`
    : played ? `${played} of ${GAMES.length} games played` : 'Not started');

  const n = Pickem.all().length;
  set('hubPickem', n ? `${n} entr${n === 1 ? 'y' : 'ies'} in` : 'No entries yet');

  const h = History.all().length;
  set('hubHistory', h ? `${h} season${h === 1 ? '' : 's'} archived` : 'Nothing archived yet');

  const seeded = STATE.seeds.filter(Boolean).length;
  set('hubField', `${seeded} of 12 seeded`);
  refreshGameShell();
}

/** The installed game builds every management screen around the active
    program's identity. Our equivalent follows the No. 1 seed once one exists,
    then falls back to CFP navy and gold while the board is empty. */
function refreshGameShell() {
  const selection = STATE.seeds[0];
  const lead = selection && team(selection.id);
  const primary = lead?.primary || '#17345f';
  const secondary = lead?.secondary || '#d9a441';
  document.documentElement.style.setProperty('--game-team', primary);
  document.documentElement.style.setProperty('--game-team-2', secondary);

  const set = (id, value) => { const node = $('#' + id); if (node) node.textContent = value; };
  const seeded = STATE.seeds.filter(Boolean).length;
  const played = Bracket.played();
  const champion = Bracket.champion();
  const playoffReady = fieldReadiness().ready;
  const leadLabel = lead ? lead.school.toUpperCase() : 'THE PLAYOFF';
  const week = champion ? 'SEASON COMPLETE' : played ? 'PLAYOFF IN PROGRESS'
    : playoffReady ? 'FIELD LOCKED'
    : seeded === 12 ? 'CONFIGURATION REQUIRED' : 'COMMITTEE WEEK';

  set('gameProfileMark', lead?.abbr || 'CFP');
  set('gameLeagueName', String(STATE.league || 'Dynasty League').toUpperCase());
  set('gameSeasonLabel', `${STATE.season} · ${leadLabel}`);
  set('gameWeekState', week);
  set('gameHomeMark', lead?.abbr || 'CFP');
  set('gameHomeTeam', leadLabel);
  set('gameHomeRecord', selection
    ? [selection.record, lead?.conf].filter(Boolean).join(' · ').toUpperCase()
    : '12 TEAMS · 1 CHAMPION');
  set('gameHomeWeek', week);
  set('gameHomeField', `${seeded} / 12`);
  set('gameHomeLeague', String(STATE.league || 'Dynasty League').toUpperCase());
  set('finalFieldState', playoffReady ? 'FIELD LOCKED' : 'FIELD IN PROGRESS');

  const cloudState = typeof CloudSync !== 'undefined' ? CloudSync.state() : null;
  const cloudLabel = typeof CloudSync !== 'undefined' && CloudSync.isSignedIn()
    ? cloudState?.saving ? 'SAVING' : cloudState?.dirty ? 'PENDING' : 'SYNCED'
    : 'LOCAL';
  set('gameSaveLabel', cloudLabel);
}

const OUT_WORD = { 2: 'First Two Out', 4: 'First Four Out' };
const outLabelText = () =>
  STATE.outLabel || OUT_WORD[STATE.outCount] || 'Just Missed';

/* Every channel in the mix, in one place. The committee room and the live
   mixer both drive these, and both stay in step. */
const MIX = [
  { key: 'volume',          label: 'Music' },
  { key: 'musicUnderVoice', label: 'Under talk' },
  { key: 'voiceVol',        label: 'Pat & Boone' },
  { key: 'booneVol',        label: 'Boone extra', max: 300 },
  { key: 'callVol',         label: 'Team calls' },
  { key: 'filmVol',         label: 'Intro film' }
];

function setMix(key, v) {
  const top = (MIX.find(c => c.key === key) || {}).max || 100;
  STATE[key] = Math.max(0, Math.min(top, +v));
  const m = $('#mx_' + key), ml = $('#mxl_' + key);
  if (m) m.value = STATE[key];
  if (ml) ml.textContent = STATE[key] + '%';
  Show.applyLevels();
  persist();
}

/** Build the panel that sits over the show, so levels can be set live. */
function buildMixer() {
  const wrap = $('#mxRows');
  if (!wrap) return;
  wrap.innerHTML = '';
  MIX.forEach(c => {
    const row = document.createElement('label');
    row.className = 'mx-row';
    row.innerHTML =
      `<span>${esc(c.label)}</span>` +
      `<input type="range" id="mx_${c.key}" min="0" max="${c.max || 100}" ` +
      `value="${STATE[c.key]}">` +
      `<b id="mxl_${c.key}">${STATE[c.key]}%</b>`;
    row.querySelector('input').oninput = e => setMix(c.key, e.target.value);
    wrap.appendChild(row);
  });
}

function applyOutLabel() {
  const t = outLabelText().toUpperCase();
  const a = $('#outHead'), b = $('#foHead');
  if (a) a.textContent = t;
  if (b) b.textContent = t;
}

function applyFx() { document.body.classList.toggle('calm', STATE.fx === 'calm'); }

/* ----------------------------------------------------------------------
   The silent film behind the home page and the board.

   It is the same file the show opens with, so it is usually already cached.
   Even so it only loads when it is actually wanted and on screen, it pauses
   the moment you leave, and it never goes near the audio mixer — it is
   muted at the element and has no gain node, so it cannot make a sound.
   ------------------------------------------------------------------- */
const AmbientFilm = (() => {
  let video = null;
  let slot = null;

  function unmount() {
    if (!video) return;
    try { video.pause(); } catch (e) {}
    video.removeAttribute('src');
    try { video.load(); } catch (e) {}
    video.remove();
    video = null;
    slot = null;
  }

  function activate(screen) {
    const section = document.getElementById(screen);
    const nextSlot = section?.querySelector('[data-ambient-film]');
    const wanted = STATE.roomFilm !== 'off' && nextSlot;
    ['home', 'room'].forEach(id =>
      document.getElementById(id)?.classList.toggle('film-off', STATE.roomFilm === 'off'));
    if (!wanted) { unmount(); return; }
    if (!video) {
      video = document.createElement('video');
      video.muted = true;
      video.volume = 0;
      video.loop = true;
      video.playsInline = true;
      video.preload = 'metadata';
      video.poster = 'assets/room-bg.webp';
      video.tabIndex = -1;
      video.setAttribute('aria-hidden', 'true');
      video.src = mediaUrl(ROOM_FILM_FILE);
    }
    if (slot !== nextSlot) nextSlot.appendChild(video);
    slot = nextSlot;
    video.play().catch(() => {});
  }

  return { activate, unmount };
})();

function applyRoomFilm(active) {
  AmbientFilm.activate(active);
}

/* ---------------------------------------------------------------- wire */
async function boot() {
  restore();
  CFPFoundation.init(document);
  document.addEventListener('cfp:modal-closed', event => {
    if (event.detail?.modal?.id === 'mTeam' && editingId) closeTeamModal();
  });
  await CloudSync.bootstrap();
  applyFx();

  await LogoStore.hydrate();

  const eventPath = location.pathname.match(/^\/watch\/([A-HJ-NP-Z2-9]{10})\/?$/i);
  const hash = location.hash.match(/^#show=(.+)$/);
  const shared = eventPath
    ? await loadPublishedEvent(eventPath[1].toUpperCase())
    : !!(hash && decodeState(hash[1]));
  applyOutLabel();               // after decode — the count comes from the link
  VIEWER = shared;
  if (VIEWER) document.body.classList.add('viewer');

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
  const home = $('#roomHome');
  if (home) { home.style.cursor = 'pointer'; home.onclick = () => showScreen('home'); }
  $('#mLinkCancel').onclick = () => $('#mLink').classList.remove('on');
  $('#mLinkGo').onclick = () => {
    const v = $('#fLink').value.trim();
    try {
      const candidate = new URL(v, location.origin);
      if (candidate.origin === location.origin && /^\/watch\/[A-HJ-NP-Z2-9]{10}\/?$/i.test(candidate.pathname)) {
        location.assign(candidate.href);
        return;
      }
    } catch (error) {}
    const m = v.match(/#show=(.+)$/);
    if (!m || !decodeState(m[1])) { toast('That link does not look right'); return; }
    $('#mLink').classList.remove('on');
    applyFx(); renderPool(); renderSeeds();
    showScreen('show'); Show.arm();
  };
  $('#mLinkDemo').onclick = loadDemoEvent;

  if (eventPath && !shared) {
    $('#eventUnavailableMessage').textContent = window.CFP_EVENT_ERROR || 'This Selection Night event is unavailable.';
    $('#mEventUnavailable').classList.add('on');
  }

  const n = STATE.seeds.filter(Boolean).length;
  $('#resumeNote').textContent = n
    ? `${n} of 12 seeds already on your board` : '';

  /* ---------- pool + settings ---------- */
  $('#search').oninput      = renderPool;
  $('#confFilter').onchange = renderPool;
  document.addEventListener('keydown', event => {
    const target = event.target;
    const typing = target && ['INPUT', 'TEXTAREA', 'SELECT'].includes(target.tagName);
    if (event.key === '/' && !typing && document.body.dataset.screen === 'room') {
      event.preventDefault();
      const poolTab = $('#roomTabs button[data-tab="pool"]');
      if (poolTab && !poolTab.classList.contains('on')) poolTab.click();
      $('#search').focus();
    }
    if (event.key === 'Escape' && target === $('#search')) {
      target.value = '';
      target.blur();
      renderPool();
    }
  });

  /* mobile tabs */
  $$('#roomTabs button').forEach(b => b.onclick = () => {
    $$('#roomTabs button').forEach(x => x.classList.toggle('on', x === b));
    $('#roomBody').dataset.tab = b.dataset.tab;
    syncResponsiveAccessibility();
  });
  const roomTabsMedia = matchMedia('(max-width: 1050px)');
  const syncResponsiveAccessibility = () => {
    const mobile = roomTabsMedia.matches;
    const tabs = $('#roomTabs');
    if (tabs) {
      tabs.inert = !mobile;
      tabs.setAttribute('aria-hidden', mobile ? 'false' : 'true');
    }
    const activeTab = $('#roomBody')?.dataset.tab || 'pool';
    const pool = $('.candidate-vault');
    const board = $('.field-ledger');
    if (pool) {
      const hidden = mobile && activeTab !== 'pool';
      pool.inert = hidden;
      pool.setAttribute('aria-hidden', hidden ? 'true' : 'false');
    }
    if (board) {
      const hidden = mobile && activeTab !== 'board';
      board.inert = hidden;
      board.setAttribute('aria-hidden', hidden ? 'true' : 'false');
    }
    $$('.chrome-account, #ssNext, .game-footer a').forEach(control => {
      control.inert = mobile;
      control.setAttribute('aria-hidden', mobile ? 'true' : 'false');
    });
  };
  syncResponsiveAccessibility();
  roomTabsMedia.addEventListener?.('change', syncResponsiveAccessibility);

  $('#optOrder').value = STATE.order;
  $('#optPace').value  = String(STATE.pace);
  $('#optCold').value  = STATE.cold;
  $('#optCalls').value = STATE.calls;
  $('#optSeedTalk').value = STATE.seedTalk;
  $('#optRoomFilm').value = STATE.roomFilm;
  $('#optOutCount').value = String(STATE.outCount);
  $('#optFx').value    = STATE.fx;
  buildMixer();
  $('#btnMix').onclick = event => CFPFoundation.panel.open($('#mixer'), event.currentTarget);
  $('#btnSetup').onclick = () => $('#mSetup').classList.add('on');
  $('#mSetupClose').onclick = () => $('#mSetup').classList.remove('on');

  $('#optOrder').onchange = e => { STATE.order = e.target.value; persist(); };
  $('#optPace').onchange  = e => {
    STATE.pace = e.target.value === 'manual' ? 'manual' : +e.target.value; persist();
  };
  $('#optCold').onchange  = e => { STATE.cold  = e.target.value; persist(); };
  $('#optCalls').onchange = e => { STATE.calls = e.target.value; persist(); };
  $('#optSeedTalk').onchange = e => { STATE.seedTalk = e.target.value; persist(); };
  $('#optRoomFilm').onchange = e => {
    STATE.roomFilm = e.target.value;
    applyRoomFilm(document.querySelector('.screen.active')?.id);
    persist();
  };
  $('#optOutCount').onchange = e => {
    STATE.outCount = +e.target.value;
    applyOutLabel(); renderSeeds(); renderPool(); persist();
  };
  $('#optFx').onchange   = e => { STATE.fx = e.target.value; applyFx(); persist(); };


  $('#btnClear').onclick = async event => {
    if (!STATE.seeds.some(Boolean) && !STATE.out.some(Boolean)) return;
    const before = fieldSnapshot();
    const accepted = await CFPFoundation.actions.confirm({
      title: 'Clear the entire board?',
      message: 'This removes the seeded field and just-missed teams, and clears dependent scores and projections. You can undo it afterward.',
      confirmLabel: 'Clear board',
      trigger: event.currentTarget,
    });
    if (!accepted) return;
    STATE.seeds = Array(12).fill(null);
    STATE.out = Array(4).fill(null);
    persistFieldChange(); renderPool(); renderSeeds();
    CFPFoundation.live.announce('The playoff board was cleared');
    CFPFoundation.actions.undo('Board cleared', () => restoreFieldSnapshot(before));
  };
  $('#btnShare').onclick   = openShare;
  $('#fShare').onclick     = openShare;
  $('#mShareClose').onclick = () => $('#mShare').classList.remove('on');
  $('#mShareCopy').onclick  = copyShare;
  $('#mSharePublish').onclick = () => { void publishShare(); };
  $('#mShareOpen').onclick  = () => window.open($('#shareUrl').value, '_blank');
  $('#readyReturn').onclick = () => { closeReadiness(); showScreen('room'); };
  $('#btnOverride').onclick = () => openReadiness('premiere');
  $('#readyPreview').onclick = async event => {
    const trigger = event.currentTarget;
    const accepted = await CFPFoundation.actions.confirm({
      title: 'Rehearse an incomplete playoff?',
      message: 'Commissioner override starts a clearly incomplete rehearsal. It does not make the field valid and cannot be published as a permanent event.',
      confirmLabel: 'Start rehearsal',
      trigger,
    });
    if (accepted) {
      closeReadiness();
      enterPremiere(true);
    }
  };
  $('#mEventUnavailableClose').onclick = () => { location.assign('/'); };
  /* The destinations that used to live here are in the ESPN nav now. */
  $('#btnBracket').onclick = () => showScreen('final');
  $('#fResults').onclick   = () => showScreen('results');
  $('#fImage').onclick     = () => Dynasty.openExport();
  $$('.hub-card').forEach(c => c.onclick = () => showScreen(c.dataset.go));
  $('#fRoom').onclick      = () => showScreen('room');
  $('#fShow').onclick      = () => { enterPremiere(); };
  $('#btnGo').onclick      = () => { enterPremiere(); };
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
  /* On a phone the OS share sheet is how a video gets into Photos or sent
     on; on a desktop it hands off to AirDrop / Nearby Share / Messages. */
  $('#fVideoShare').onclick = async () => {
    try {
      await Recorder.share();
    } catch (e) {
      if (/abort/i.test(e.name || '')) return;          // they closed the sheet
      Recorder.download();
      toast('Shared it to your downloads instead');
    }
  };

  /* ---------- recording ---------- */
  const recOpt = $('#optRecord');
  if (Recorder.supported()) {
    $('#recWhy').textContent =
      'Pick this tab and tick "share tab audio". It downloads when the show ends.';
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
    $('#fOutLabel').value = STATE.outLabel;
    /* datetime-local wants local wall-clock time, not an ISO instant */
    $('#fPremiere').value = STATE.premiere
      ? new Date(STATE.premiere - new Date().getTimezoneOffset() * 60000)
          .toISOString().slice(0, 16)
      : '';
    $('#mLeague').classList.add('on');
  };
  $('#mLeagueCancel').onclick = () => $('#mLeague').classList.remove('on');
  $('#mLeagueSave').onclick = () => {
    STATE.league   = $('#fLeague').value.trim()   || 'Dynasty League';
    STATE.season   = $('#fSeason').value.trim()   || '2027';
    STATE.title    = $('#fTitle').value.trim()    || 'College Football Playoff';
    STATE.subtitle = $('#fSubtitle').value.trim() || 'Selection Show';
    STATE.ticker   = $('#fTicker').value.trim();
    STATE.outLabel = $('#fOutLabel').value.trim();
    applyOutLabel();
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
    if (!await CFPFoundation.actions.confirm({
      title: 'Remove every imported logo?',
      message: 'All custom team logo files stored on this device and in the signed-in cloud account will be removed.',
      confirmLabel: 'Remove logos',
    })) return;
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
  $('#btnAddTeam').onclick = openNewTeamModal;

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
    if (e.target === m && !m.classList.contains('conflict-modal')) m.classList.remove('on');
  }));

  /* The room header scrolls sideways on a phone, and a hidden scrollbar
     means nobody knows it does. Fade the right edge only while there is
     something still off-screen, so the hint disappears once you reach the
     end rather than permanently dimming the last button. */
  const rhead = $('.room-head');
  if (rhead) {
    const hint = () => rhead.classList.toggle('more',
      rhead.scrollWidth - rhead.clientWidth - rhead.scrollLeft > 8);
    rhead.addEventListener('scroll', hint, { passive: true });
    addEventListener('resize', hint);
    hint();
  }

  Dynasty.init();
  CloudSync.bind();
  document.addEventListener('cfp:state', refreshGameShell);
  document.addEventListener('cfp:cloud', refreshGameShell);
  renderPool();
  renderSeeds();
  refreshHub();
  refreshLogoCount();
  Show.init();

  /* The network remains the source of truth for pages, while a small service
     worker gives commissioners a resilient app shell if a venue connection
     drops. API, private logos, and R2 video are intentionally never cached. */
  if (location.protocol === 'https:' && 'serviceWorker' in navigator) {
    navigator.serviceWorker.register('/sw.js').catch(() => {});
  }

  /* Music bed runs everywhere. Browsers need one gesture first. */
  CFPFoundation.initScreens();

  const openRoute = (screen, options = {}) => {
    showScreen(screen, options);
    if (screen !== 'show') return;
    if (VIEWER || fieldReadiness().ready) Show.arm();
    else openReadiness('premiere');
  };
  addEventListener('popstate', () =>
    openRoute(CFPFoundation.router.screenFromLocation(), { fromHistory: true }));

  const initialScreen = shared ? 'show' : CFPFoundation.router.screenFromLocation();
  openRoute(initialScreen, {
    replace: !shared && location.pathname === '/',
    focus: false,
  });
  /* a browser pauses video on a hidden tab and does not resume it by itself */
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'visible')
      applyRoomFilm(document.body.dataset.screen || 'home');
  });

  if (shared) {
    applyFx();
    document.title = `${STATE.league} — ${STATE.subtitle}`;
  }
}

if (document.readyState === 'loading')
  document.addEventListener('DOMContentLoaded', boot);
else
  boot();

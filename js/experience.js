/* ======================================================================
   CFP DYNASTY STUDIO — premium experience layer

   State becomes show-night status, transitions and film control here,
   keeping the bracket engine separate from presentation effects.
   ====================================================================== */
(() => {
  'use strict';

  const $ = (q, root = document) => root.querySelector(q);
  const $$ = (q, root = document) => [...root.querySelectorAll(q)];
  const reduceMotion = matchMedia('(prefers-reduced-motion: reduce)');
  let currentScreen = '';
  let transitionTimer = 0;

  function setText(target, value) {
    const node = typeof target === 'string' ? $(target) : target;
    if (node && node.textContent !== value) node.textContent = value;
  }

  function safeState() {
    try { return typeof STATE !== 'undefined' ? STATE : null; }
    catch (_) { return null; }
  }

  function safePlayed() {
    try { return typeof Bracket !== 'undefined' ? Bracket.played() : 0; }
    catch (_) { return 0; }
  }

  function safeChampion(state) {
    try {
      const seed = typeof Bracket !== 'undefined' ? Bracket.champion() : 0;
      if (!seed || !state.seeds[seed - 1]) return '';
      return team(state.seeds[seed - 1].id).school;
    } catch (_) { return ''; }
  }

  function refreshStatus() {
    const state = safeState();
    if (!state || !Array.isArray(state.seeds)) return;

    const seeded = state.seeds.filter(Boolean).length;
    const played = safePlayed();
    const champion = safeChampion(state);
    document.documentElement.style.setProperty('--field-progress', `${Math.round((seeded / 12) * 100)}%`);

    const ready = $('#roomReadyLabel');
    if (ready) {
      ready.classList.toggle('ready', seeded === 12);
      setText(ready, seeded === 12 ? 'FIELD READY' : `${seeded} / 12 TEAMS SET`);
    }

    const eventRows = $$('.prime-event-card .pec-row em');
    if (eventRows[0]) setText(eventRows[0], seeded === 12 ? 'Field locked' : `${seeded} / 12 set`);
    if (eventRows[1]) {
      const cadence = state.pace === 'manual' ? 'Manual cue' : `${Math.round((+state.pace || 10000) / 1000)}s cadence`;
      setText(eventRows[1], cadence);
    }
    if (eventRows[2]) setText(eventRows[2], state.shareCode ? 'Invite live' : 'Private until shared');

    const workflow = $$('.studio-steps > div');
    workflow.forEach((step, index) => {
      const complete = index === 0 ? seeded === 12 : index === 1 ? seeded === 12 : false;
      const current = index === 0 ? seeded < 12 : index === 1 ? seeded === 12 : false;
      step.classList.toggle('complete', complete);
      step.classList.toggle('current', current);
      step.classList.toggle('on', complete || current);
    });

    let finalLine = `${seeded} teams · ${played} of 11 games complete`;
    if (champion) finalLine = `${champion} · national champion`;
    else if (seeded < 12) finalLine = `${seeded} of 12 teams selected · field in progress`;
    setText('#finalStatusMeta', finalLine);
  }

  function filmIsAtGate() {
    const gate = $('#gate');
    return gate && gate.style.display !== 'none' && currentScreen === 'show';
  }

  function syncGateFilm() {
    const film = $('#gateFilm');
    if (!film) return;
    const shouldPlay = filmIsAtGate() && !reduceMotion.matches;

    if (shouldPlay) {
      if (!film.dataset.ready) {
        film.src = mediaUrl('committee.mp4');
        film.dataset.ready = '1';
        film.load();
      }
      film.play().catch(() => {});
    } else {
      try { film.pause(); } catch (_) {}
    }
  }

  function announceScreen(name) {
    if (!name || name === currentScreen) {
      refreshStatus();
      syncGateFilm();
      return;
    }

    currentScreen = name;
    document.body.dataset.screen = name;
    if (!reduceMotion.matches) {
      document.body.classList.remove('screen-shifting');
      void document.body.offsetWidth;
      document.body.classList.add('screen-shifting');
      clearTimeout(transitionTimer);
      transitionTimer = setTimeout(() => document.body.classList.remove('screen-shifting'), 720);
    }

    const active = $('#' + CSS.escape(name));
    if (active) {
      active.classList.remove('prime-enter');
      void active.offsetWidth;
      active.classList.add('prime-enter');
    }

    refreshStatus();
    syncGateFilm();
  }

  const activeScreen = () => $('.screen.active')?.id || 'home';

  function init() {
    if (!$('.prime-page-wipe')) {
      const wipe = document.createElement('div');
      wipe.className = 'prime-page-wipe';
      wipe.setAttribute('aria-hidden', 'true');
      document.body.append(wipe);
    }

    currentScreen = activeScreen();
    document.body.dataset.screen = currentScreen;
    refreshStatus();
    syncGateFilm();

    document.addEventListener('cfp:screen', event => announceScreen(event.detail?.name));
    document.addEventListener('cfp:state', refreshStatus);
    document.addEventListener('click', () => requestAnimationFrame(refreshStatus), true);
    document.addEventListener('change', () => requestAnimationFrame(refreshStatus), true);
    reduceMotion.addEventListener?.('change', syncGateFilm);

    $$('.screen').forEach(screen => {
      new MutationObserver(() => {
        if (screen.classList.contains('active')) announceScreen(screen.id);
      }).observe(screen, { attributes: true, attributeFilter: ['class'] });
    });

    const gate = $('#gate');
    if (gate) {
      new MutationObserver(syncGateFilm)
        .observe(gate, { attributes: true, attributeFilter: ['class', 'style'] });
    }

    /* Restore and shared-link hydration finish after the first paint. */
    setTimeout(() => {
      announceScreen(activeScreen());
      refreshStatus();
    }, 250);
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init);
  else init();
})();

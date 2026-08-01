/* =====================================================================
   THE SHOW — cold open, reveal engine, effects
   ===================================================================== */

/* The cold open, in order. Drop replacements next to index.html and rename
   here. The mp3s are trimmed copies made by tools/trim_music.py, and the
   video is shrunk by tools/shrink_video.py — small enough to host. */
const VIDEO_FILE = 'intro-video.mp4';    // rolls first, full screen
const INTRO_FILE = 'patmac.mp3';         // then Pat
const BOONE_FILE = 'coachboone.mp3';     // then Coach Boone
const MUSIC_FILE = 'music.mp3';          // bed under everything

/* how far the music drops under the spoken intro */
const DUCK_UNDER_VOICE = 0.22;
/* how far it drops for a beat under each reveal hit */
const DUCK_UNDER_HIT   = 0.5;
/* how far it drops while the announcer calls a team */
const DUCK_UNDER_CALL  = 0.3;

/* Per-team announcer calls cut out of the conference files by
   tools/cut_voice.py. Missing file = that team just gets the sound effects. */
const VOICE_DIR = 'voice/';

const Show = (() => {

  let seq = [], cursor = -1, timer = null;
  let paused = false, running = false, phase = 'idle', filmGuard = null;
  let ctlHide = null, revealed = [];
  const el = {};

  const fxLevel = () => STATE.fx || 'max';
  const isMax   = () => fxLevel() === 'max';
  const isCalm  = () => fxLevel() === 'calm';

  /* =================================================== canvas effects */
  let cvs, ctx, parts = [], rings = [], embers = [], raf = null, ambient = false;

  function sizeCanvas() {
    if (!cvs) return;
    const d = Math.min(window.devicePixelRatio || 1, 2);
    cvs.width = innerWidth * d; cvs.height = innerHeight * d;
    cvs.style.width = innerWidth + 'px'; cvs.style.height = innerHeight + 'px';
    ctx.setTransform(d, 0, 0, d, 0, 0);
  }

  function seedEmbers() {
    embers = [];
    const n = isCalm() ? 18 : 46;
    for (let i = 0; i < n; i++) embers.push({
      x: Math.random() * innerWidth,
      y: Math.random() * innerHeight,
      r: .6 + Math.random() * 2.1,
      vy: -(.12 + Math.random() * .5),
      vx: (Math.random() - .5) * .28,
      a: .1 + Math.random() * .38,
      tw: Math.random() * 6.3
    });
  }

  function startAmbient() { ambient = true; seedEmbers(); kick(); }
  function stopAmbient()  { ambient = false; }

  function burst(colors) {
    if (isCalm()) { colors = colors.slice(0, 2); }
    const cx = innerWidth / 2, cy = innerHeight / 2;
    const n = isCalm() ? 60 : (isMax() ? 260 : 150);
    for (let i = 0; i < n; i++) {
      const a = Math.random() * Math.PI * 2, sp = 5 + Math.random() * 22;
      parts.push({
        x: cx + (Math.random() - .5) * 380, y: cy + (Math.random() - .5) * 140,
        vx: Math.cos(a) * sp * 1.75, vy: Math.sin(a) * sp - 6,
        w: 3 + Math.random() * 10, h: 5 + Math.random() * 16,
        rot: Math.random() * 6.3, vr: (Math.random() - .5) * .42,
        c: colors[(Math.random() * colors.length) | 0], life: 1
      });
    }
    if (!isCalm()) for (let i = 0; i < (isMax() ? 44 : 22); i++) {
      const left = Math.random() < .5;
      parts.push({
        x: left ? -20 : innerWidth + 20, y: Math.random() * innerHeight,
        vx: (left ? 1 : -1) * (26 + Math.random() * 34), vy: (Math.random() - .5) * 5,
        w: 30 + Math.random() * 70, h: 2, rot: 0, vr: 0,
        c: colors[(Math.random() * colors.length) | 0], life: 1
      });
    }
    kick();
  }

  function shockwave(color, count) {
    if (isCalm()) return;
    for (let i = 0; i < (count || 3); i++)
      rings.push({ r: 30 + i * 26, a: .85, w: 7 - i * 1.4, c: color, sp: 15 + i * 5 });
    kick();
  }

  function kick() { if (!raf) raf = requestAnimationFrame(tick); }

  function tick() {
    ctx.clearRect(0, 0, innerWidth, innerHeight);
    const cx = innerWidth / 2, cy = innerHeight / 2;

    if (ambient) {
      for (const e of embers) {
        e.y += e.vy; e.x += e.vx; e.tw += .05;
        if (e.y < -10) { e.y = innerHeight + 10; e.x = Math.random() * innerWidth; }
        ctx.globalAlpha = e.a * (.55 + .45 * Math.sin(e.tw));
        ctx.fillStyle = '#F5A24A';
        ctx.beginPath(); ctx.arc(e.x, e.y, e.r, 0, 6.284); ctx.fill();
      }
      ctx.globalAlpha = 1;
    }

    for (let i = rings.length - 1; i >= 0; i--) {
      const r = rings[i];
      r.r += r.sp; r.a -= .022; r.sp *= .985;
      if (r.a <= 0) { rings.splice(i, 1); continue; }
      ctx.globalAlpha = r.a; ctx.strokeStyle = r.c; ctx.lineWidth = Math.max(.5, r.w);
      ctx.beginPath(); ctx.arc(cx, cy, r.r, 0, 6.284); ctx.stroke();
    }
    ctx.globalAlpha = 1;

    for (let i = parts.length - 1; i >= 0; i--) {
      const p = parts[i];
      p.x += p.vx; p.y += p.vy; p.vy += .58; p.vx *= .985; p.rot += p.vr;
      p.life -= .0105;
      if (p.life <= 0 || p.y > innerHeight + 90) { parts.splice(i, 1); continue; }
      ctx.save();
      ctx.globalAlpha = Math.max(0, Math.min(1, p.life));
      ctx.translate(p.x, p.y); ctx.rotate(p.rot);
      ctx.fillStyle = p.c; ctx.fillRect(-p.w / 2, -p.h / 2, p.w, p.h);
      ctx.restore();
    }

    if (parts.length || rings.length || ambient) raf = requestAnimationFrame(tick);
    else { raf = null; ctx.clearRect(0, 0, innerWidth, innerHeight); }
  }

  /* ========================================================= synth sfx */
  let ac = null;
  const audio = () => (ac ||= new (window.AudioContext || window.webkitAudioContext)());
  const sfxGain = () => .8;

  function noise(dur, shape) {
    const a = audio(), n = Math.floor(a.sampleRate * dur);
    const buf = a.createBuffer(1, n, a.sampleRate), d = buf.getChannelData(0);
    for (let i = 0; i < n; i++) d[i] = (Math.random() * 2 - 1) * shape(i / n);
    const s = a.createBufferSource(); s.buffer = buf; return s;
  }

  function whoosh() {
    try {
      const a = audio(), s = noise(.7, k => 1 - k);
      const f = a.createBiquadFilter(); f.type = 'bandpass';
      f.frequency.setValueAtTime(320, a.currentTime);
      f.frequency.exponentialRampToValueAtTime(3400, a.currentTime + .5);
      f.Q.value = 1.1;
      const g = a.createGain();
      g.gain.setValueAtTime(.0001, a.currentTime);
      g.gain.exponentialRampToValueAtTime(.32 * sfxGain(), a.currentTime + .16);
      g.gain.exponentialRampToValueAtTime(.0001, a.currentTime + .68);
      s.connect(f).connect(g).connect(a.destination); s.start();
    } catch (e) {}
  }

  function impact() {
    try {
      const a = audio(), t = a.currentTime;
      const o = a.createOscillator(), g = a.createGain();
      o.type = 'sine';
      o.frequency.setValueAtTime(165, t);
      o.frequency.exponentialRampToValueAtTime(32, t + .45);
      g.gain.setValueAtTime(.9 * sfxGain(), t);
      g.gain.exponentialRampToValueAtTime(.0001, t + .58);
      o.connect(g).connect(a.destination); o.start(t); o.stop(t + .62);

      const s = noise(.25, k => Math.pow(1 - k, 2.4));
      const hp = a.createBiquadFilter(); hp.type = 'highpass'; hp.frequency.value = 1600;
      const hg = a.createGain(); hg.gain.value = .3 * sfxGain();
      s.connect(hp).connect(hg).connect(a.destination); s.start(t);
    } catch (e) {}
  }

  /* stadium roar swell */
  function crowd(dur = 2.2) {
    if (isCalm()) return;
    try {
      const a = audio(), t = a.currentTime;
      const s = noise(dur, k => Math.min(1, k * 4) * Math.pow(1 - k, .7));
      const bp = a.createBiquadFilter(); bp.type = 'bandpass';
      bp.frequency.setValueAtTime(500, t);
      bp.frequency.linearRampToValueAtTime(1500, t + dur * .4);
      bp.Q.value = .55;
      const g = a.createGain();
      g.gain.setValueAtTime(.0001, t);
      g.gain.exponentialRampToValueAtTime(.14 * sfxGain(), t + .35);
      g.gain.exponentialRampToValueAtTime(.0001, t + dur);
      s.connect(bp).connect(g).connect(a.destination); s.start(t);
    } catch (e) {}
  }

  function stinger(root = 523.25) {
    try {
      const a = audio(), t = a.currentTime;
      [1, 1.26, 1.5, 2].forEach((m, i) => {
        const o = a.createOscillator(), g = a.createGain();
        o.type = 'triangle'; o.frequency.value = root * m;
        const at = t + i * .055;
        g.gain.setValueAtTime(.0001, at);
        g.gain.exponentialRampToValueAtTime(.16 * sfxGain(), at + .03);
        g.gain.exponentialRampToValueAtTime(.0001, at + .7);
        o.connect(g).connect(a.destination); o.start(at); o.stop(at + .75);
      });
    } catch (e) {}
  }

  function beep(f = 880, len = .16) {
    try {
      const a = audio(), t = a.currentTime;
      const o = a.createOscillator(), g = a.createGain();
      o.type = 'square'; o.frequency.value = f;
      g.gain.setValueAtTime(.09 * sfxGain(), t);
      g.gain.exponentialRampToValueAtTime(.0001, t + len);
      o.connect(g).connect(a.destination); o.start(t); o.stop(t + len + .02);
    } catch (e) {}
  }

  /* ================================================== music bed control */
  let bedStarted = false, fadeRaf = null, fadeEnd = null, fadeSeq = 0;

  /* requestAnimationFrame stops in a hidden tab, which would strand the
     volume part-way through a fade. The timer guarantees it arrives. */
  function fadeTo(target, ms) {
    const m = el.music;
    if (!m) return;
    target = Math.max(0, Math.min(1, target));
    cancelAnimationFrame(fadeRaf);
    clearTimeout(fadeEnd);
    const mine = ++fadeSeq;
    const from = m.volume, t0 = performance.now();
    const step = () => {
      if (mine !== fadeSeq) return;
      const k = Math.min(1, (performance.now() - t0) / ms);
      m.volume = Math.max(0, Math.min(1, from + (target - from) * k));
      if (k < 1) fadeRaf = requestAnimationFrame(step);
    };
    step();
    fadeEnd = setTimeout(() => { if (mine === fadeSeq) m.volume = target; }, ms + 60);
  }

  const bedVol = () => (STATE.volume || 0) / 100;

  /* ============================================== announcer team calls */
  let callAudio = null;                 // the clip playing right now
  const callCache = {};                 // id -> HTMLAudioElement | false

  /** Preload the calls for the teams in this show so they land instantly. */
  function primeCalls() {
    STATE.seeds.forEach(s => {
      if (!s || callCache[s.id] !== undefined) return;
      const a = new Audio(VOICE_DIR + s.id + '.mp3');
      a.preload = 'auto';
      a.onerror = () => { callCache[s.id] = false; };
      callCache[s.id] = a;
    });
  }

  function stopCall() {
    if (!callAudio) return;
    try { callAudio.pause(); callAudio.currentTime = 0; } catch (e) {}
    callAudio.onended = null;
    callAudio = null;
  }

  /** Play a team's call, ducking the bed underneath it. */
  function playCall(id) {
    stopCall();
    if (STATE.calls === 'off') return false;
    const a = callCache[id];
    if (!a) return false;
    callAudio = a;
    try { a.currentTime = 0; } catch (e) {}
    a.volume = 1;
    const done = () => {
      if (callAudio === a) { callAudio = null; setBedVolume(); }
    };
    a.onended = done;
    a.play().then(() => {
      fadeTo(bedVol() * DUCK_UNDER_CALL, 220);
    }).catch(() => { callAudio = null; });
    return true;
  }

  /** Start the music bed and keep it running everywhere in the app. */
  function startBed() {
    const m = el.music;
    if (!m) return;
    if (!m.getAttribute('src')) m.src = MUSIC_FILE;
    if (bedStarted && !m.paused) return;
    m.volume = 0;
    m.play().then(() => { bedStarted = true; fadeTo(bedVol(), 2500); })
            .catch(() => { bedStarted = false; });
  }

  function setBedVolume() {
    if (phase === 'film') fadeTo(bedVol() * 0.10, 260);
    else if (phase === 'intro' || phase === 'boone')
      fadeTo(bedVol() * DUCK_UNDER_VOICE, 260);
    else if (callAudio) fadeTo(bedVol() * DUCK_UNDER_CALL, 260);
    else fadeTo(bedVol(), 260);
  }

  /* ========================================================== the rail */
  function buildRail() {
    const wrap = document.getElementById('railRows');
    wrap.innerHTML = '';
    STATE.seeds.forEach((s, i) => {
      const row = document.createElement('div');
      row.className = 'r-row'; row.dataset.seed = i;
      row.innerHTML = `<span class="n">${i + 1}</span>
        <span class="bar"><b>&nbsp;</b><i></i></span>`;
      wrap.appendChild(row);
    });
  }
  function litRail(i, just) {
    const row = document.querySelector(`#railRows .r-row[data-seed="${i}"]`);
    if (!row) return;
    const s = STATE.seeds[i];
    if (!s) return;
    const t = team(s.id);
    const b = row.querySelector('b');
    b.textContent = t.abbr; b.style.color = '#fff';
    row.querySelector('i').style.background = t.primary;
    row.classList.add('lit');
    if (just) { row.classList.remove('just'); void row.offsetWidth; row.classList.add('just'); }
  }
  function clearRail() {
    document.querySelectorAll('#railRows .r-row').forEach(r => {
      r.classList.remove('lit', 'just');
      r.querySelector('b').textContent = ' ';
      r.querySelector('i').style.background = 'transparent';
    });
  }

  /* ====================================================== SPOILER-FREE
     The ticker never names a team that has not been revealed on screen. */
  function hypeLines() {
    const n = seq.length || 12;
    return [
      `<span><b>${esc(STATE.league.toUpperCase())}</b> &nbsp;${esc(STATE.season)} SELECTION SHOW</span>`,
      `<span>THE COMMITTEE HAS MET &middot; <b>THE FIELD IS SET</b></span>`,
      `<span><b>${n}</b> TEAMS IN &middot; ONE TROPHY</span>`,
      `<span>TOP FOUR SEEDS RECEIVE A <b>FIRST-ROUND BYE</b></span>`,
      `<span>SEEDS 5 THROUGH 12 OPEN ON <b>CAMPUS SITES</b></span>`,
      `<span>ROSE &middot; SUGAR &middot; FIESTA &middot; PEACH &middot; ORANGE &middot; COTTON</span>`,
      `<span><b>WHO IS IN?</b> &nbsp;FIND OUT NEXT</span>`
    ];
  }

  function paintTicker() {
    const bits = revealed.length ? revealed.slice() : hypeLines();
    if (revealed.length) {
      bits.unshift(`<span><b>${esc(STATE.league.toUpperCase())}</b> &nbsp;${esc(STATE.season)} PLAYOFF FIELD</span>`);
      if (revealed.length < seq.length)
        bits.push(`<span><b>${seq.length - revealed.length}</b> STILL TO COME</span>`);
    }
    if (STATE.ticker) STATE.ticker.split('|').filter(x => x.trim())
      .forEach(x => bits.push(`<span>${esc(x.trim().toUpperCase())}</span>`));
    const line = bits.join('');
    el.tkRun.innerHTML = line + line;
    el.tkBadge.textContent = STATE.season;
  }

  function pushTickerTeam(i) {
    const s = STATE.seeds[i]; if (!s) return;
    const t = team(s.id);
    revealed.push(`<span><b>NO. ${i + 1}</b> ${esc(t.school.toUpperCase())}` +
      `${s.record ? ' (' + esc(s.record) + ')' : ''} &middot; ${esc(t.conf.toUpperCase())}` +
      `${i < 4 ? ' &middot; <b>BYE</b>' : ''}</span>`);
    paintTicker();
  }

  /* Everything, once the show is over. */
  function fullTicker() {
    revealed = [];
    STATE.seeds.forEach((s, i) => { if (s) pushTickerTeam(i); });
    firstRound().forEach(m => {
      const a = STATE.seeds[m.hi - 1], b = STATE.seeds[m.lo - 1];
      if (a && b) revealed.push(`<span>FIRST ROUND: <b>NO. ${m.lo}</b> ` +
        `${esc(team(b.id).school.toUpperCase())} AT <b>NO. ${m.hi}</b> ` +
        `${esc(team(a.id).school.toUpperCase())}</span>`);
    });
    paintTicker();
  }

  /* ==================================================== ARM (play gate) */
  function arm() {
    running = false; paused = false; cursor = -1; phase = 'gate';
    clearTimeout(timer);
    revealed = [];

    seq = STATE.seeds.map((s, i) => s ? i : null).filter(i => i !== null);
    if (STATE.order === 'desc') seq.reverse();

    buildRail(); clearRail(); paintTicker();

    hideCold();
    el.revealLayer.classList.remove('on');
    el.lower.classList.remove('on');
    el.rail.style.opacity = '0';
    el.glow.style.opacity = '0';
    el.floor.style.removeProperty('--floorc');
    el.gate.style.display = 'grid';

    const n = seq.length;
    el.gateKick.textContent = n === 12 ? 'The field is set'
      : `${n} team${n === 1 ? '' : 's'} selected`;
    el.gateTitle.innerHTML = `${esc(STATE.title)}<br>${esc(STATE.subtitle)}`;
    el.gateSub.innerHTML = `${esc(STATE.league)} &middot; ${esc(STATE.season)}` +
      ` &nbsp;&middot;&nbsp; press play when everyone is watching`;

    el.intro.src ||= INTRO_FILE;
    el.boone.src ||= BOONE_FILE;
    el.filmStage.classList.remove('on');
    try { el.film.pause(); el.film.currentTime = 0; } catch (e) {}
    stopCall();
    primeCalls();
    startBed();
    setBedVolume();
    startAmbient();
  }

  /* ======================================================== COLD OPEN */
  const SLATES = [
    { at: .07, kick: () => `${STATE.league} — ${STATE.season} season`,
      big: () => STATE.title, small: () => STATE.subtitle },
    { at: .23, kick: () => 'The committee has met',
      big: () => 'THE FIELD<br>IS SET', small: () => 'Nobody has seen it' },
    { at: .37, kick: () => 'Twelve get in', big: () => 'TWELVE TEAMS',
      small: () => 'One trophy' },
    { at: .50, grid: true },
    { at: .66, kick: () => 'Byes, campus sites, six bowls',
      big: () => "WHO'S IN?", small: () => STATE.league },
    { at: .80, kick: () => 'The wait is over', big: () => 'LET&rsquo;S<br>FIND OUT',
      small: () => `${STATE.season} Playoff` }
  ];

  let coldBeat = -1, countAt = -1;

  function showSlate(s) {
    el.coldMark.classList.remove('on');
    el.coldGrid.classList.remove('on');
    el.coldCount.classList.remove('on');

    if (s.grid) {
      el.coldSlate.classList.remove('on');
      el.coldGrid.innerHTML = '';
      const n = Math.max(seq.length, 4);
      for (let i = 0; i < n; i++) {
        const d = document.createElement('div');
        d.className = 'slot';
        d.style.animationDelay = (i * 0.06) + 's';
        d.innerHTML = `<b>${i + 1}</b><i></i>`;
        el.coldGrid.appendChild(d);
      }
      el.coldGrid.classList.add('on');
      beep(660, .1);
      return;
    }

    el.coldSlate.classList.add('on');
    el.csKick.innerHTML  = s.kick  ? s.kick()  : '';
    el.csBig.innerHTML   = s.big   ? s.big()   : '';
    el.csSmall.innerHTML = s.small ? s.small() : '';
    el.coldSlate.classList.remove('enter'); void el.coldSlate.offsetWidth;
    el.coldSlate.classList.add('enter');
    flare(); glitch(); stinger(392);
  }

  function showCount(n) {
    el.coldSlate.classList.remove('on');
    el.coldGrid.classList.remove('on');
    el.coldCount.classList.add('on');
    el.coldCount.innerHTML = `<span>${n}</span>`;
    beep(n === 1 ? 1320 : 760, .18);
    if (isMax()) pushStage();
  }

  function hideCold() {
    el.cold.classList.remove('on');
    el.coldMark.classList.remove('on');
    el.coldSlate.classList.remove('on');
    el.coldGrid.classList.remove('on');
    el.coldCount.classList.remove('on');
    coldBeat = -1; countAt = -1;
  }

  /* ---------------------------------------------------------- the film */
  function runFilm() {
    const mode = STATE.cold || 'full';
    if (mode !== 'full') { runVoiceOpen(); return; }

    phase = 'film';
    const v = el.film;
    if (!v.getAttribute('src')) v.src = VIDEO_FILE;

    el.filmStage.classList.add('on');
    /* the film carries its own sound — drop the bed right down under it */
    fadeTo(bedVol() * 0.10, 900);

    let handed = false;
    const go = () => {
      if (handed) return;
      handed = true;
      clearTimeout(filmGuard);
      phase = 'voice';
      el.filmStage.classList.remove('on');
      try { v.pause(); } catch (e) {}
      runVoiceOpen();
    };
    v.onended = go;
    v.onerror = go;
    el.filmSkip.onclick = e => { e.stopPropagation(); go(); };

    /* If 'ended' never arrives — a stalled download, a codec quirk — the show
       must not sit on a frozen frame. Watch the clock and hand off anyway. */
    const watch = () => {
      clearTimeout(filmGuard);
      const left = (v.duration || 0) - v.currentTime;
      filmGuard = setTimeout(() => {
        if (!handed && (v.ended || v.paused || v.currentTime >= (v.duration || 0) - 0.4))
          go();
        else watch();
      }, Math.max(1200, (isFinite(left) ? left * 1000 : 5000) + 1500));
    };
    v.onloadedmetadata = watch;
    if (v.readyState >= 1) watch();

    v.currentTime = 0;
    v.volume = 1;
    v.play().catch(go);
  }

  function runVoiceOpen() {
    phase = 'intro';
    el.cold.classList.add('on');
    el.coldMark.classList.add('on');
    setBedVolume();
    flare(); crowd(2.6); stinger();

    const mode = STATE.cold || 'full';

    if (mode === 'off') { endColdOpen(); return; }

    if (mode === 'short') {
      /* condensed 11s package, no voice track */
      phase = 'intro'; setBedVolume();
      const beats = [[0, SLATES[0]], [3400, SLATES[2]], [7000, SLATES[4]]];
      beats.forEach(([ms, s]) => setTimeout(() => { if (phase === 'intro') showSlate(s); }, ms));
      [3, 2, 1].forEach((n, i) =>
        setTimeout(() => { if (phase === 'intro') showCount(n); }, 10000 + i * 900));
      timer = setTimeout(endColdOpen, 13200);
      return;
    }

    /* full: the spoken intro is the clock */
    const a = el.intro;
    a.currentTime = 0;
    a.volume = 1;
    const started = a.play();

    const fallback = () => {
      /* audio blocked or missing — run the short package instead */
      STATE.cold = 'short'; runColdOpen(); STATE.cold = 'full';
    };
    if (started && started.catch) started.catch(fallback);
    a.onerror = fallback;

    a.ontimeupdate = () => {
      const d = a.duration;
      if (!isFinite(d) || d <= 0) return;
      const k = a.currentTime / d, left = d - a.currentTime;

      if (left <= 5.4) {
        const n = Math.max(1, Math.ceil(left - .4));
        if (n !== countAt && n <= 5) { countAt = n; showCount(n); }
        return;
      }
      let idx = -1;
      for (let i = 0; i < SLATES.length; i++) if (k >= SLATES[i].at) idx = i;
      if (idx >= 0 && idx !== coldBeat) { coldBeat = idx; showSlate(SLATES[idx]); }
    };
    a.onended = () => runBoone();
  }

  /* ------------------------------------------------- Coach Boone's turn */
  const BOONE_SLATES = [
    { at: .00, kick: () => 'A word before we begin',
      big: () => 'THE COMMITTEE<br>HAS SPOKEN', small: () => STATE.league },
    { at: .34, kick: () => 'Twelve teams left standing',
      big: () => 'EARN IT', small: () => STATE.season + ' Playoff' },
    { at: .68, kick: () => 'Here we go', big: () => 'LET&rsquo;S<br>FIND OUT',
      small: () => STATE.title }
  ];

  function runBoone() {
    if (phase !== 'intro') return;
    const a = el.intro;
    a.ontimeupdate = null; a.onended = null; a.onerror = null;
    try { a.pause(); } catch (e) {}

    const b = el.boone;
    if (!b.getAttribute('src')) b.src = BOONE_FILE;

    phase = 'boone';
    coldBeat = -1; countAt = -1;
    setBedVolume();

    const finish2 = () => endColdOpen();
    b.onerror = finish2;
    b.onended = finish2;
    b.ontimeupdate = () => {
      const d = b.duration;
      if (!isFinite(d) || d <= 0) return;
      const k = b.currentTime / d, left = d - b.currentTime;
      if (left <= 5.4) {
        const n = Math.max(1, Math.ceil(left - .4));
        if (n !== countAt && n <= 5) { countAt = n; showCount(n); }
        return;
      }
      let idx = -1;
      for (let i = 0; i < BOONE_SLATES.length; i++)
        if (k >= BOONE_SLATES[i].at) idx = i;
      if (idx >= 0 && idx !== coldBeat) { coldBeat = idx; showSlate(BOONE_SLATES[idx]); }
    };
    b.currentTime = 0; b.volume = 1;
    b.play().catch(finish2);
  }

  function endColdOpen() {
    if (phase !== 'intro' && phase !== 'boone' && phase !== 'film' &&
        phase !== 'voice') return;
    [el.intro, el.boone].forEach(a => {
      if (!a) return;
      a.ontimeupdate = null; a.onended = null; a.onerror = null;
      try { a.pause(); } catch (e) {}
    });
    clearTimeout(filmGuard);
    try { el.film.pause(); el.film.onended = null; } catch (e) {}
    el.filmStage.classList.remove('on');
    clearTimeout(timer);
    hideCold();
    phase = 'reveal';
    setBedVolume();
    el.rail.style.opacity = '1';
    crowd(2.2); flare();
    next();
  }

  /* ============================================================= PLAY */
  /* Recording has to be requested straight off the click, before anything
     async happens, or the browser refuses the capture prompt. */
  async function play() {
    if (STATE.record && Recorder.supported() && !Recorder.active) {
      try {
        await Recorder.start(onRecordingDone);
        el.recLamp.classList.add('on');
      } catch (e) {
        toast(/denied|not allowed/i.test(e.message || '')
          ? 'Recording cancelled — playing without it'
          : 'Could not start recording');
      }
    }
    begin();
  }

  function onRecordingDone(info) {
    el.recLamp.classList.remove('on');
    if (!info) return;
    const btn = document.getElementById('fVideo');
    btn.hidden = false;
    btn.textContent = `Save Video (${Math.round(info.size / 1e6)} MB)`;

    const share = document.getElementById('fVideoShare');
    share.hidden = !Recorder.canShare();

    Recorder.download();
    toast(share.hidden ? 'Video saved to your downloads'
                       : 'Video saved — "Send To Phone" to share it');
  }

  function begin() {
    el.gate.style.display = 'none';
    running = true; paused = false;
    revealed = []; cursor = -1;
    paintTicker();

    /* restart the bed from the top for the show */
    const m = el.music;
    if (!m.getAttribute('src')) m.src = MUSIC_FILE;
    try { m.currentTime = 0; } catch (e) {}
    m.volume = 0;
    m.play().then(() => { bedStarted = true; setBedVolume(); }).catch(() => {});

    startAmbient();
    runFilm();
  }

  /* ========================================================== REVEALS */
  const inColdOpen = () =>
    phase === 'film' || phase === 'voice' || phase === 'intro' || phase === 'boone';

  function next() {
    if (inColdOpen()) { endColdOpen(); return; }
    if (cursor >= seq.length - 1) { finish(); return; }
    goto(cursor + 1);
  }
  function prev() {
    if (inColdOpen()) return;
    if (cursor <= 0) return;
    goto(cursor - 1, true);
  }

  function goto(pos, rebuild) {
    clearTimeout(timer);
    phase = 'reveal';
    cursor = pos;
    reveal(seq[cursor]);

    if (rebuild) {
      clearRail(); revealed = [];
      for (let k = 0; k <= cursor; k++) { litRail(seq[k], false); pushTickerTeam(seq[k]); }
    }

    if (STATE.pace !== 'manual' && !paused)
      timer = setTimeout(next, +STATE.pace);
  }

  /** Auto-advance must never talk over the announcer. */
  function holdForCall(gen) {
    if (STATE.pace === 'manual' || paused || !callAudio) return;
    const a = callAudio;
    const wait = () => {
      const left = (a.duration || 0) - a.currentTime;
      if (!isFinite(left) || left <= 0) return;
      const needed = left * 1000 + 900;
      const already = +STATE.pace - 700;
      if (needed > already && gen === revealGen) {
        clearTimeout(timer);
        timer = setTimeout(next, needed);
      }
    };
    if (a.readyState >= 1) wait();
    else a.addEventListener('loadedmetadata', wait, { once: true });
  }

  /* --- individual effect triggers --- */
  function pushStage() {
    el.stage.classList.add('push');
    setTimeout(() => el.stage.classList.remove('push'), 900);
  }
  function flare() {
    if (isCalm()) return;
    el.flare.classList.remove('go'); void el.flare.offsetWidth;
    el.flare.classList.add('go');
  }
  function glitch() {
    if (!isMax()) return;
    el.glitch.classList.remove('go'); void el.glitch.offsetWidth;
    el.glitch.classList.add('go');
  }
  function wipe(color) {
    if (isCalm()) return;
    el.wipe.style.setProperty('--wipec', color);
    el.wipe.classList.remove('go'); void el.wipe.offsetWidth;
    el.wipe.classList.add('go');
    setTimeout(() => el.wipe.classList.remove('go'), 1000);
  }
  function shakeStage() {
    if (isCalm()) return;
    const s = document.getElementById('show');
    s.classList.remove('shake'); void s.offsetWidth; s.classList.add('shake');
  }
  function pulseVignette() {
    el.vig.classList.remove('pulse'); void el.vig.offsetWidth;
    el.vig.classList.add('pulse');
  }

  let revealGen = 0;

  function reveal(i) {
    const s = STATE.seeds[i];
    if (!s) { next(); return; }
    const t = team(s.id);
    const bye = i < 4;
    const gen = ++revealGen;          // stale timers from a skipped pick bail out

    el.revealLayer.classList.add('on');

    /* ---- pre-hit: wipe + glitch, then the banner lands ---- */
    wipe(t.primary);
    glitch();
    whoosh();
    if (isMax()) pushStage();

    el.bigNum.textContent = i + 1;
    el.bigNum.classList.remove('pop'); void el.bigNum.offsetWidth;
    el.bigNum.classList.add('pop');

    el.seedChip.textContent = `NO. ${i + 1} SEED`;
    el.seedChip.classList.remove('roll'); void el.seedChip.offsetWidth;
    el.seedChip.classList.add('roll');

    el.bannerStage.innerHTML = '';
    const b = bannerEl(s.id);
    el.bannerStage.appendChild(b);
    el.bannerStage.classList.remove('slam'); void el.bannerStage.offsetWidth;
    el.bannerStage.classList.add('slam');
    setTimeout(() => { if (gen === revealGen) b.classList.add('sweep'); }, 470);

    el.teamInfo.innerHTML =
      `<div class="school">${esc(t.school.toUpperCase())}</div>` +
      (s.record ? `<div class="rec">${esc(s.record)}</div>` : '') +
      `<div class="conf">${esc(t.conf.toUpperCase())}</div>` +
      (bye ? `<div class="bye">FIRST-ROUND BYE</div>` : opponentTag(i));
    el.teamInfo.classList.remove('in'); void el.teamInfo.offsetWidth;
    el.teamInfo.classList.add('in');

    /* ---- colour the whole stage in the team's palette ---- */
    el.glow.style.setProperty('--tglow', hexA(t.primary, .5));
    el.glow.style.opacity = '1';
    el.floor.style.setProperty('--floorc', hexA(t.secondary, .3));
    el.flash.style.background =
      `radial-gradient(60% 60% at 50% 50%, ${hexA(t.secondary, .95)}, ` +
      `${hexA(t.primary, .55)} 60%, transparent 78%)`;
    el.flash.classList.remove('go'); void el.flash.offsetWidth;
    el.flash.classList.add('go');

    /* ---- the hit ---- */
    setTimeout(() => {
      if (gen !== revealGen) return;
      shakeStage(); pulseVignette();
      impact(); crowd(1.9);
      shockwave(t.secondary, isMax() ? 4 : 2);
      burst([t.primary, t.secondary, '#ffffff', t.primary, '#F56A00']);
      flare();
      fadeTo(bedVol() * DUCK_UNDER_HIT, 180);
      setTimeout(() => { if (gen === revealGen) setBedVolume(); }, 850);
    }, 250);

    /* ---- the announcer's call, once the banner has landed ---- */
    stopCall();
    setTimeout(() => {
      if (gen !== revealGen) return;
      if (playCall(s.id)) holdForCall(gen);
    }, 700);

    /* ---- lower third ---- */
    el.lower.classList.remove('on');
    setTimeout(() => {
      if (gen !== revealGen) return;
      el.l3cap.textContent = i + 1;
      el.l3t1.textContent = `${t.school}${t.mascot ? ' ' + t.mascot : ''}`;
      el.l3t2.textContent = [s.record, t.conf, bye ? 'First-round bye' : matchupText(i)]
        .filter(Boolean).join('  ·  ');
      el.lower.classList.add('on');
    }, 640);

    litRail(i, true);
    pushTickerTeam(i);
  }

  function opponentTag(i) {
    const txt = matchupText(i);
    return txt ? `<div class="rec">${esc(txt.toUpperCase())}</div>` : '';
  }
  function matchupText(i) {
    const seed = i + 1;
    const m = firstRound().find(x => x.hi === seed || x.lo === seed);
    if (!m) return '';
    const otherSeed = m.hi === seed ? m.lo : m.hi;
    const other = STATE.seeds[otherSeed - 1];
    const home = m.hi === seed;
    if (!other) return `First round vs. No. ${otherSeed}`;
    /* never leak a team that hasn't been revealed yet */
    const shown = seq.slice(0, cursor + 1).includes(otherSeed - 1);
    if (!shown) return `${home ? 'Hosts the' : 'Plays the'} No. ${otherSeed} seed`;
    return `${home ? 'Hosts' : 'At'} No. ${otherSeed} ${team(other.id).school}`;
  }

  function hexA(h, a) { const [r, g, b] = hex2rgb(h); return `rgba(${r},${g},${b},${a})`; }

  /* ================================================== FIRST FOUR OUT */
  function runFourOut(then) {
    const outs = STATE.out.filter(Boolean);
    if (!outs.length || STATE.showOut === 'off') { then(); return; }

    phase = 'fourout';
    el.revealLayer.classList.remove('on');
    el.lower.classList.remove('on');
    el.glow.style.opacity = '0';
    el.floor.style.removeProperty('--floorc');

    el.cold.classList.add('on');
    showSlate({ kick: () => 'So close', big: () => 'FIRST FOUR OUT',
                small: () => 'The ones who just missed' });
    stinger(392); crowd(2);

    timer = setTimeout(() => {
      hideCold();
      el.fourOut.innerHTML = '';
      outs.forEach((s, i) => {
        const t = team(s.id);
        const row = document.createElement('div');
        row.className = 'fo-row';
        row.style.animationDelay = (i * 0.42) + 's';
        row.innerHTML = `<span class="fo-n">${13 + i}</span>`;
        const w = document.createElement('div');
        w.className = 'fo-banner';
        w.appendChild(bannerEl(s.id));
        row.appendChild(w);
        if (s.record) {
          const r = document.createElement('span');
          r.className = 'fo-rec'; r.textContent = s.record;
          row.appendChild(r);
        }
        el.fourOut.appendChild(row);
        setTimeout(() => { whoosh(); if (!isCalm()) shockwave(t.primary, 1); },
                   i * 420 + 120);
      });
      el.fourOutWrap.classList.add('on');

      timer = setTimeout(() => {
        el.fourOutWrap.classList.remove('on');
        setTimeout(then, 700);
      }, 2200 + outs.length * 900);
    }, 3200);
  }

  /* ============================================================ FINISH */
  function finish() {
    running = false;
    clearTimeout(timer);
    stopCall();
    el.revealLayer.classList.remove('on');
    el.lower.classList.remove('on');

    fullTicker();
    runFourOut(closingCard);
  }

  function closingCard() {
    phase = 'outro';
    el.glow.style.opacity = '0';
    el.floor.style.removeProperty('--floorc');

    el.cold.classList.add('on');
    showSlate({ kick: () => `${STATE.league} — ${STATE.season}`,
                big: () => 'THE FIELD<br>IS SET',
                small: () => STATE.title });
    crowd(3); stinger(659.25);
    burst(['#F56A00', '#FFB300', '#ffffff', '#D8B45A']);
    shockwave('#FFB300', 5);
    flare(); if (isMax()) pushStage();

    timer = setTimeout(() => {
      hideCold();
      fadeTo(bedVol() * 0.55, 1800);
      stopAmbient();
      showScreen('final');
      buildBracket();                    // the plates fly in one at a time
      /* let the bracket breathe, then close the recording and the music */
      timer = setTimeout(() => {
        fadeTo(0, 3000);
        setTimeout(() => { el.music.pause(); bedStarted = false; }, 3100);
        if (Recorder.active) Recorder.stop();
      }, 11000);
    }, 5000);
  }

  /** Animate the finished bracket together, seed by seed. */
  function buildBracket() {
    const bk = document.getElementById('bracket');
    if (!bk) return;
    bk.classList.add('building');
    const order = [1, 2, 3, 4, 5, 12, 6, 11, 7, 10, 8, 9];
    const plates = [...bk.querySelectorAll('.bk-seed')];
    const bySeed = {};
    plates.forEach(p => { bySeed[p.dataset.seed] = p; });

    plates.forEach(p => p.classList.add('pending'));
    bk.querySelectorAll('.bk-line').forEach(l => l.classList.add('pending'));
    bk.querySelectorAll('.bk-box,.bk-bowl,.bk-natty').forEach(l => l.classList.add('pending'));

    order.forEach((seed, i) => {
      setTimeout(() => {
        const p = bySeed[seed];
        if (!p) return;
        p.classList.remove('pending');
        p.classList.add('drop');
        beep(520 + i * 18, .07);
      }, 260 + i * 190);
    });
    setTimeout(() => {
      bk.querySelectorAll('.bk-line').forEach((l, i) =>
        setTimeout(() => l.classList.remove('pending'), i * 26));
    }, 260 + order.length * 190);
    setTimeout(() => {
      bk.querySelectorAll('.bk-box,.bk-bowl,.bk-natty')
        .forEach(l => l.classList.remove('pending'));
      stinger(523.25); crowd(2.4);
      if (!isCalm()) shockwave('#FFB300', 3);
    }, 700 + order.length * 190);
  }

  function togglePause() {
    if (!running) return;
    paused = !paused;
    el.cPlay.textContent = paused ? 'Resume' : 'Pause';
    if (paused) {
      clearTimeout(timer);
      el.music.pause();
      try { el.intro.pause(); el.boone.pause(); el.film.pause(); } catch (e) {}
      if (callAudio) try { callAudio.pause(); } catch (e) {}
    } else {
      el.music.play().catch(() => {});
      if (phase === 'film')  el.film.play().catch(() => {});
      else if (phase === 'intro') el.intro.play().catch(() => {});
      else if (phase === 'boone') el.boone.play().catch(() => {});
      else {
        if (callAudio) callAudio.play().catch(() => {});
        if (STATE.pace !== 'manual') timer = setTimeout(next, +STATE.pace);
      }
    }
  }

  /* ============================================================== init */
  function init() {
    ['cold', 'coldMark', 'coldSlate', 'csKick', 'csBig', 'csSmall', 'coldGrid',
     'coldCount', 'revealLayer', 'bigNum', 'seedChip', 'bannerStage', 'teamInfo',
     'flash', 'wipe', 'glitch', 'flare', 'vig', 'floor', 'stage', 'rail', 'lower',
     'l3cap', 'l3t1', 'l3t2', 'tkRun', 'tkBadge', 'tkClock', 'gate', 'gateKick',
     'gateTitle', 'gateSub', 'music', 'intro', 'boone', 'ctl', 'cPlay',
     'recLamp', 'film', 'filmStage', 'filmSkip', 'fourOut', 'fourOutWrap']
      .forEach(id => el[id] = document.getElementById(id));
    el.glow = document.getElementById('teamGlow');

    cvs = document.getElementById('fx');
    ctx = cvs.getContext('2d');
    sizeCanvas();
    addEventListener('resize', () => { sizeCanvas(); seedEmbers(); });

    document.getElementById('btnPlay').onclick = play;
    document.getElementById('cNext').onclick = next;
    document.getElementById('cPrev').onclick = prev;
    document.getElementById('cPlay').onclick = togglePause;
    document.getElementById('cSkip').onclick = () => { if (inColdOpen()) endColdOpen(); };
    document.getElementById('cRestart').onclick = arm;
    document.getElementById('cBracket').onclick = () => { stop(); showScreen('final'); };
    document.getElementById('cRoom').onclick = () => { stop(); showScreen('room'); };
    document.getElementById('cFull').onclick = toggleFull;

    const nudgeCtl = () => {
      el.ctl.classList.add('show');
      clearTimeout(ctlHide);
      ctlHide = setTimeout(() => el.ctl.classList.remove('show'), 2600);
    };
    const showEl = document.getElementById('show');
    showEl.addEventListener('mousemove', nudgeCtl);

    /* phones: tap the right side to advance, left to go back, long-press
       anywhere brings up the toolbar */
    document.getElementById('tapNext').onclick = () => {
      if (el.gate.style.display !== 'none') return;
      nudgeCtl(); next();
    };
    document.getElementById('tapPrev').onclick = () => {
      if (el.gate.style.display !== 'none') return;
      nudgeCtl(); prev();
    };

    setInterval(() => {
      el.tkClock.textContent = new Date()
        .toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' });
    }, 1000);

    addEventListener('keydown', e => {
      if (!document.getElementById('show').classList.contains('active')) return;
      if (/input|select|textarea/i.test(e.target.tagName)) return;
      if (e.code === 'Space') {
        e.preventDefault();
        if (el.gate.style.display !== 'none') play(); else next();
      }
      else if (e.code === 'ArrowRight') next();
      else if (e.code === 'ArrowLeft')  prev();
      else if (e.key === 's' || e.key === 'S') { if (inColdOpen()) endColdOpen(); }
      else if (e.key === 'p' || e.key === 'P') togglePause();
      else if (e.key === 'f' || e.key === 'F') toggleFull();
      else if (e.key === 'Escape') { stop(); showScreen('room'); }
    });
  }

  /* iOS Safari can't fullscreen an element — say so rather than doing nothing. */
  function toggleFull() {
    const de = document.documentElement;
    const req = de.requestFullscreen || de.webkitRequestFullscreen;
    if (!req) { toast('Rotate to landscape — this browser has no fullscreen'); return; }
    if (document.fullscreenElement || document.webkitFullscreenElement)
      (document.exitFullscreen || document.webkitExitFullscreen).call(document);
    else req.call(de).catch(() => {});
  }

  /** Leave the show — kill the voice track but keep the bed playing. */
  function stop() {
    running = false; phase = 'idle';
    clearTimeout(timer);
    [el.intro, el.boone].forEach(a => {
      try { a.pause(); a.ontimeupdate = null; a.onended = null; } catch (e) {}
    });
    clearTimeout(filmGuard);
    try { el.film.pause(); el.film.onended = null; el.film.onloadedmetadata = null; }
    catch (e) {}
    el.filmStage.classList.remove('on');
    stopCall();
    hideCold();
    stopAmbient();
    setBedVolume();
  }

  return { init, arm, play, next, prev, stop, startBed, setBedVolume, fadeTo,
           bedVol, sfx: { stinger, beep, whoosh } };
})();

/* =====================================================================
   THE SHOW — cold open, reveal engine, effects
   ===================================================================== */

/* The cold open, in order. Drop replacements next to index.html and rename
   here. The mp3s are trimmed copies made by tools/trim_music.py, and the
   video is shrunk by tools/shrink_video.py — small enough to host. */
/* =====================================================================
   WHERE THE BIG FILES LIVE

   Cloudflare's static asset pipeline will not accept the 55 MB intro film,
   so anything in CDN_FILES is served by the Worker from its private R2
   binding. The rest of the site stays in the static asset layer.

   The address comes from a meta tag rather than from this file so it can
   be changed without touching any JavaScript. Empty means "everything is
   local", which is useful for a self-contained local/GitHub Pages build.
   ===================================================================== */
const MEDIA_BASE = (() => {
  const m = document.querySelector('meta[name="media-base"]');
  return ((m && m.content) || '').trim().replace(/\/+$/, '');
})();

/* Only these are big enough to be worth hosting apart. Everything else is
   comfortably under the cap and stays with the site, where it needs no
   CORS and no second thing to go wrong. */
const CDN_FILES = new Set(['intro-video.mp4', 'selection-night-open.mp4']);

const mediaUrl = f => (MEDIA_BASE && CDN_FILES.has(f)) ? MEDIA_BASE + '/' + f : f;

/** True only when a file crosses origins. /media is same-origin in production. */
const isRemote = f => {
  try { return new URL(mediaUrl(f), document.baseURI).origin !== location.origin; }
  catch (e) { return false; }
};

const VIDEO_FILE = 'selection-night-open.mp4'; // the supplied 15-second committee film
const INTRO_FILE = 'patmac.mp3';         // then Pat
const BOONE_FILE = 'coachboone.mp3';     // then Coach Boone
const MUSIC_FILE = 'music.mp3';          // bed under everything

/* The committee room, looping silently behind the home page and the board.
   This used to be the intro film, which is 55 MB — an enormous download for
   something that is only ever wallpaper. This one is 1.4 MB and is actually
   a picture of a selection committee, which is the point. */
const ROOM_FILM_FILE = 'committee.mp4';

/* One card per seed: "PICK 5 — THE PICK IS IN". These carry the build-up
   beat on their own, so the reveal shows the card first and only brings the
   team in once it has landed. */
const PICK_DIR = 'assets/pick/';
const pickArt = i => PICK_DIR + String(i + 1).padStart(2, '0') + '.webp';

/* How much of the bed stays up while somebody is talking. Adjustable in the
   committee room — 0.22 was technically playing but far too quiet to hear
   under a voice, which reads as "the music stopped". */
const DUCK_UNDER_VOICE = () => (STATE.musicUnderVoice ?? 55) / 100;
/* The film carries its own full mix. The bed is stopped outright underneath
   it — even well down it was fighting the hype video — and starts again from
   the top when the voices take over. */
const DUCK_UNDER_FILM  = () => 0;
/* how far it drops for a beat under each reveal hit */
const DUCK_UNDER_HIT   = 0.5;
/* how far it drops while the announcer calls a team */
const DUCK_UNDER_CALL  = 0.3;

/* Per-team announcer calls cut out of the conference files by
   tools/cut_voice.py. Missing file = that team just gets the sound effects. */
const VOICE_DIR = 'voice/';

/* Per-seed commentary, cut by tools/cut_seeds.py. Each seed has a build-up
   played before the team is shown and a reaction played after it lands. */
const SEED_DIR = 'seedcall/';

const Show = (() => {

  let seq = [], cursor = -1, timer = null, suspenseTimer = null;
  let paused = false, running = false, phase = 'idle', filmGuard = null;
  let ctlHide = null, revealed = [];
  let chapterAdvance = null;
  const chaptersPlayed = new Set();
  const el = {};

  const PICK_CHAPTERS = {
    0: { kick: 'Chapter one', index: '01—04', title: 'THE FOUR BYES',
         sub: 'Four teams skip opening weekend. Every position changes the road.' },
    4: { kick: 'Chapter two', index: '05—08', title: 'CAMPUS LIGHTS',
         sub: 'Four hosts. Four home crowds. Opening-round football comes to campus.' },
    8: { kick: 'Chapter three', index: '09—12', title: 'THE CUT LINE',
         sub: 'The final four invitations. The bubble closes one name at a time.' }
  };

  /* Every selection has its own editorial role and camera language. The
     show still feels like one package, but it no longer repeats the same
     centered card twelve times. */
  const DIRECTOR_PICKS = [
    { camera: 'center', tier: 'bye', kicker: 'The standard',
      title: 'No. 1 in the nation', milestone: 'THE STANDARD' },
    { camera: 'left', tier: 'bye', kicker: 'Bye secured',
      title: 'Quarterfinal bound' },
    { camera: 'right', tier: 'bye', kicker: 'Championship position',
      title: 'A direct road forward' },
    { camera: 'center', tier: 'bye', kicker: 'The bye line closes',
      title: 'The final direct ticket', milestone: 'BYE LINE CLOSED' },
    { camera: 'center', tier: 'host', kicker: 'Opening weekend',
      title: 'The top campus host', milestone: 'CAMPUS LIGHTS ON' },
    { camera: 'right', tier: 'host', kicker: 'Home field',
      title: 'Protect this house' },
    { camera: 'left', tier: 'host', kicker: 'December football',
      title: 'One more game at home' },
    { camera: 'center', tier: 'host', kicker: 'The host line closes',
      title: 'The final home game', milestone: 'FINAL CAMPUS HOST' },
    { camera: 'center', tier: 'road', kicker: 'The cut line',
      title: 'The first road team', milestone: 'THE BUBBLE BREAKS' },
    { camera: 'right', tier: 'road', kicker: 'On the road',
      title: 'No easy way in' },
    { camera: 'left', tier: 'road', kicker: 'One win away',
      title: 'The road test' },
    { camera: 'center', tier: 'road', kicker: 'Last team in',
      title: 'The final invitation', milestone: 'THE FIELD IS COMPLETE' }
  ];

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
        kind: 'shard',
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
        kind: 'streak',
        x: left ? -20 : innerWidth + 20, y: Math.random() * innerHeight,
        vx: (left ? 1 : -1) * (26 + Math.random() * 34), vy: (Math.random() - .5) * 5,
        w: 30 + Math.random() * 70, h: 2, rot: 0, vr: 0,
        c: colors[(Math.random() * colors.length) | 0], life: 1
      });
    }
    /* Fast, short-lived light streaks make the impact read like camera
       flashes and pyro instead of relying on confetti alone. */
    if (!isCalm()) for (let i = 0; i < (isMax() ? 58 : 30); i++) {
      const a = Math.random() * Math.PI * 2, sp = 18 + Math.random() * 34;
      parts.push({
        kind: 'spark',
        x: cx + (Math.random() - .5) * 170,
        y: cy + (Math.random() - .5) * 80,
        vx: Math.cos(a) * sp, vy: Math.sin(a) * sp,
        w: 18 + Math.random() * 44, h: .7 + Math.random() * 1.5,
        rot: a, vr: 0,
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
      ctx.save();
      ctx.globalAlpha = r.a; ctx.strokeStyle = r.c; ctx.lineWidth = Math.max(.5, r.w);
      ctx.shadowColor = r.c; ctx.shadowBlur = 16;
      ctx.translate(cx, cy); ctx.scale(1, .42);
      ctx.beginPath(); ctx.arc(0, 0, r.r, 0, 6.284); ctx.stroke();
      ctx.restore();
    }
    ctx.globalAlpha = 1;

    for (let i = parts.length - 1; i >= 0; i--) {
      const p = parts[i];
      p.x += p.vx; p.y += p.vy;
      if (p.kind === 'spark') {
        p.vy *= .965; p.vx *= .965; p.life -= .034;
      } else {
        p.vy += .58; p.vx *= .985; p.rot += p.vr; p.life -= .0105;
      }
      if (p.life <= 0 || p.y > innerHeight + 90) { parts.splice(i, 1); continue; }
      ctx.save();
      ctx.globalAlpha = Math.max(0, Math.min(1, p.life));
      ctx.translate(p.x, p.y); ctx.rotate(p.rot);
      if (p.kind === 'spark') {
        const g = ctx.createLinearGradient(-p.w, 0, p.w / 2, 0);
        g.addColorStop(0, 'transparent'); g.addColorStop(.7, p.c); g.addColorStop(1, '#fff');
        ctx.strokeStyle = g; ctx.lineWidth = p.h; ctx.shadowColor = p.c; ctx.shadowBlur = 12;
        ctx.beginPath(); ctx.moveTo(-p.w, 0); ctx.lineTo(0, 0); ctx.stroke();
      } else {
        ctx.fillStyle = p.c; ctx.fillRect(-p.w / 2, -p.h / 2, p.w, p.h);
      }
      ctx.restore();
    }

    if (parts.length || rings.length || ambient) raf = requestAnimationFrame(tick);
    else { raf = null; ctx.clearRect(0, 0, innerWidth, innerHeight); }
  }

  /* ========================================================= synth sfx */
  let ac = null;
  const audio = () => (ac ||= new (window.AudioContext || window.webkitAudioContext)());
  const sfxGain = () => .8;

  /* =====================================================================
     AUDIO BUS

     Phones do not honour HTMLMediaElement.volume — on iOS it is read-only,
     so every duck and every slider was being silently thrown away — and
     starting a second element can stop the first, which is why the music
     died the moment Pat began talking.

     So every source is routed through one AudioContext with its own gain
     node. Gain is controllable everywhere and the sources genuinely mix.
     If any of that is unavailable we fall back to element.volume, which is
     what desktop was already doing successfully.
     ===================================================================== */
  const Bus = (() => {
    const nodes = new Map();          // element -> gain node
    let ok = true, master = null;

    /* Everything meets here first. A source can be pushed above unity —
       Boone is doubled by default — and this catches the peaks instead of
       letting them clip. */
    function bus() {
      const a = audio();
      if (!master) {
        master = a.createDynamicsCompressor();
        master.threshold.value = -3;
        master.knee.value = 6;
        master.ratio.value = 12;
        master.attack.value = .003;
        master.release.value = .18;
        master.connect(a.destination);
      }
      return master;
    }

    function attach(el) {
      if (!el || nodes.has(el)) return nodes.get(el);
      if (!ok) return null;
      try {
        const a = audio();
        wake();
        /* Once a source is routed through the graph its sound only comes out
           of the graph. If the context is not running that is silence, which
           is worse than no ducking — so leave the element alone. */
        if (a.state !== 'running') return null;
        const src = a.createMediaElementSource(el);
        const g = a.createGain();
        g.gain.value = 1;
        src.connect(g).connect(bus());
        nodes.set(el, g);
        return g;
      } catch (e) {
        /* already attached elsewhere, or unsupported — element volume it is */
        ok = false;
        return null;
      }
    }

    /** Set a source's level, ramped so it never clicks. */
    function set(el, v, ms) {
      if (!el) return;
      v = Math.max(0, Math.min(4, v));      // a gain node can amplify
      const g = nodes.get(el) || attach(el);
      if (g) {
        try {
          const a = audio(), t = a.currentTime;
          g.gain.cancelScheduledValues(t);
          g.gain.setValueAtTime(g.gain.value, t);
          g.gain.linearRampToValueAtTime(v, t + Math.max(.01, (ms || 0) / 1000));
          el.volume = 1;              // ignored on iOS, harmless elsewhere
          return;
        } catch (e) { /* fall through */ }
      }
      try { el.volume = Math.min(1, v); } catch (e) {}   // elements cannot
    }

    const level = el => {
      const g = nodes.get(el);
      if (g) return g.gain.value;
      return el ? el.volume : 1;
    };

    /** iOS starts the context suspended; only a gesture can wake it. */
    function wake() {
      try {
        const a = audio();
        if (a.state === 'suspended') a.resume();
      } catch (e) {}
    }

    /** Move sources onto the graph once the context is genuinely running.

        resume() is a promise: checking state on the very next line still
        reports 'suspended', so every attach was quietly bailing out and
        nothing ever reached the mixer. We must not await inside the click
        either — that spends the gesture that lets media start — so the
        playback call stays synchronous and the adoption lands after. */
    function adopt(els, level) {
      const finish = () => {
        els.forEach(e => { if (e && !nodes.has(e)) attach(e); });
        if (typeof level === 'function') level();
      };
      try {
        const a = audio();
        if (a.state === 'running') { finish(); return; }
        const p = a.resume();
        if (p && p.then) p.then(finish).catch(finish);
        else setTimeout(finish, 60);
        setTimeout(finish, 400);      // belt and braces if resume never settles
      } catch (e) { finish(); }
    }

    return { attach, set, level, wake, adopt,
             get usingWebAudio() { return ok && nodes.size > 0; },
             get routed() { return nodes.size; } };
  })();

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

  /* A square-wave bleep sounded like a games console and every one was the
     same. These are percussive instead: a woody transient over a short pitched
     body, with the pitch and colour moved slightly each time so a run of them
     does not turn into a drone. */
  function tick(pitch = 190, level = .10, len = .12) {
    try {
      const a = audio(), t = a.currentTime;

      const n = noise(.05, k => Math.pow(1 - k, 6));
      const bp = a.createBiquadFilter(); bp.type = 'bandpass';
      bp.frequency.value = 1400 + Math.random() * 900; bp.Q.value = .8;
      const ng = a.createGain(); ng.gain.value = level * 1.5 * sfxGain();
      n.connect(bp).connect(ng).connect(a.destination); n.start(t);

      const o = a.createOscillator(), g = a.createGain();
      o.type = 'triangle';
      o.frequency.setValueAtTime(pitch * 1.5, t);
      o.frequency.exponentialRampToValueAtTime(pitch, t + len * .7);
      g.gain.setValueAtTime(level * sfxGain(), t);
      g.gain.exponentialRampToValueAtTime(.0001, t + len);
      o.connect(g).connect(a.destination); o.start(t); o.stop(t + len + .02);
    } catch (e) {}
  }

  /** The countdown: a deep hit rather than a chirp, and the last one lands. */
  function countHit(last) {
    try {
      const a = audio(), t = a.currentTime;
      const o = a.createOscillator(), g = a.createGain();
      o.type = 'sine';
      o.frequency.setValueAtTime(last ? 320 : 190, t);
      o.frequency.exponentialRampToValueAtTime(last ? 70 : 60, t + (last ? .5 : .28));
      g.gain.setValueAtTime((last ? .62 : .38) * sfxGain(), t);
      g.gain.exponentialRampToValueAtTime(.0001, t + (last ? .6 : .34));
      o.connect(g).connect(a.destination); o.start(t); o.stop(t + .65);
      tick(last ? 520 : 300, last ? .12 : .07, .1);
      if (last) crowd(1.6);
    } catch (e) {}
  }

  /* kept so nothing else breaks if it is still referenced */
  const beep = (f, len) => tick(Math.max(90, (f || 440) / 3), .08, len || .12);

  /* ================================================== music bed control */
  let bedStarted = false, fadeRaf = null, fadeEnd = null, fadeSeq = 0;
  /* Whether the bed is *supposed* to be running. A phone's audio session
     interrupts and pauses the music element whenever new media starts —
     the video, then Pat, then Boone — and setting a volume cannot un-pause
     anything. So we track intent and put it back. */
  let bedWanted = false, bedWatch = null;

  function ensureBed(why) {
    const m = el.music;
    if (!m || !bedWanted) return;
    if (m.paused || m.ended) {
      const p = m.play();
      if (p && p.catch) p.catch(() => {});
      bedStarted = true;
      setBedVolume();
    }
  }

  function watchBed(on) {
    clearInterval(bedWatch);
    bedWatch = on ? setInterval(() => ensureBed('poll'), 1500) : null;
  }

  /* requestAnimationFrame stops in a hidden tab, which would strand the
     volume part-way through a fade. The timer guarantees it arrives. */
  function fadeTo(target, ms) {
    const m = el.music;
    if (!m) return;
    target = Math.max(0, Math.min(1, target));
    cancelAnimationFrame(fadeRaf);
    clearTimeout(fadeEnd);
    fadeSeq++;

    if (Bus.usingWebAudio) {          // the graph ramps it for us
      Bus.set(m, target, ms);
      return;
    }
    /* element-volume fallback: rAF stalls in a hidden tab, so a timer
       guarantees the level actually lands */
    const mine = fadeSeq, from = m.volume, t0 = performance.now();
    const step = () => {
      if (mine !== fadeSeq) return;
      const k = Math.min(1, (performance.now() - t0) / ms);
      m.volume = Math.max(0, Math.min(1, from + (target - from) * k));
      if (k < 1) fadeRaf = requestAnimationFrame(step);
    };
    step();
    fadeEnd = setTimeout(() => { if (mine === fadeSeq) m.volume = target; }, ms + 60);
  }

  const bedVol   = () => (STATE.volume   ?? 55) / 100;
  const voiceVol = () => (STATE.voiceVol ?? 100) / 100;
  const booneVol = () => voiceVol() * ((STATE.booneVol ?? 200) / 100);
  const callVol  = () => (STATE.callVol  ?? 100) / 100;
  const filmVol  = () => (STATE.filmVol  ?? 100) / 100;

  /** Push the current slider levels at whatever is playing right now. */
  function applyLevels() {
    Bus.set(el.intro, voiceVol(), 80);
    Bus.set(el.boone, booneVol(), 80);
    Bus.set(el.film,  filmVol(),  80);
    if (callAudio) Bus.set(callAudio, callVol(), 80);
    if (seedAudio) Bus.set(seedAudio, voiceVol(), 80);
    setBedVolume();
  }

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

  /* ------------------------------------------- the per-seed commentary */
  const seedCache = {};                 // 's01-before' -> Audio | false
  let seedAudio = null;

  function seedClip(i, half) {
    const mode = STATE.seedTalk || 'lead';
    if (mode === 'off') return null;
    /* 'lead' plays the build-up only — the reaction after the name landed
       stepped on the moment rather than adding to it. */
    if (half === 'after' && mode !== 'both') return null;
    const key = 's' + String(i + 1).padStart(2, '0') + '-' + half;
    if (seedCache[key] === false) return null;
    if (!seedCache[key]) {
      const a = new Audio(SEED_DIR + key + '.mp3');
      a.preload = 'auto';
      a.onerror = () => { seedCache[key] = false; };
      seedCache[key] = a;
    }
    return seedCache[key];
  }

  /** Warm the clips for the seeds in this show. */
  function primeSeedTalk() {
    STATE.seeds.forEach((s, i) => { if (s) { seedClip(i, 'before'); seedClip(i, 'after'); } });
  }

  function stopSeedTalk() {
    if (!seedAudio) return;
    try { seedAudio.pause(); seedAudio.currentTime = 0; } catch (e) {}
    seedAudio.onended = null;
    seedAudio = null;
  }

  /** Play one half and call `then` when it finishes — or straight away if
      there is no clip, so the show never stalls waiting on a missing file. */
  function playSeedTalk(clip, gen, then) {
    stopSeedTalk();
    if (!clip) { then(); return; }
    seedAudio = clip;
    try { clip.currentTime = 0; } catch (e) {}
    Bus.set(clip, voiceVol(), 0);

    let done = false;
    const finish = () => {
      if (done || gen !== revealGen) return;
      done = true;
      if (seedAudio === clip) { seedAudio = null; setBedVolume(); }
      then();
    };
    clip.onended = finish;
    clip.onerror = finish;
    clip.play().then(() => fadeTo(bedVol() * DUCK_UNDER_CALL, 200))
               .catch(finish);
    /* if the file never fires 'ended' the sequence still moves on */
    const wait = () => {
      const left = (clip.duration || 0) - clip.currentTime;
      if (!isFinite(left) || left <= 0) { setTimeout(finish, 400); return; }
      setTimeout(() => { if (!done) (clip.ended || clip.paused ? finish() : wait()); },
                 left * 1000 + 700);
    };
    if (clip.readyState >= 1) wait();
    else clip.addEventListener('loadedmetadata', wait, { once: true });
  }

  /** Play a team's call, ducking the bed underneath it. */
  function playCall(id) {
    stopCall();
    if (STATE.calls === 'off') return false;
    const a = callCache[id];
    if (!a) return false;
    callAudio = a;
    try { a.currentTime = 0; } catch (e) {}
    Bus.set(a, callVol(), 0);
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
    Bus.wake();
    if (!m.getAttribute('src')) m.src = MUSIC_FILE;
    if (bedStarted && !m.paused) return;
    Bus.set(m, 0, 0);
    m.play().then(() => { bedStarted = true; fadeTo(bedVol(), 2500); })
            .catch(() => { bedStarted = false; });
  }

  function setBedVolume() {
    if (phase === 'film') fadeTo(bedVol() * DUCK_UNDER_FILM(), 260);
    else if (phase === 'intro' || phase === 'boone')
      fadeTo(bedVol() * DUCK_UNDER_VOICE(), 260);
    else if (callAudio) fadeTo(bedVol() * DUCK_UNDER_CALL, 260);
    else fadeTo(bedVol(), 260);
  }

  /* ====================================================== the pick cards

     Twelve 1600x900 stills, one per seed. They are the build-up beat: the
     card owns the screen while the commentary runs, then falls back and
     blurs when the team lands on top of it.
     ==================================================================== */
  const pickWarm = {};                 // seed index -> Image, once decoded

  /** Pull the next few cards down early so a reveal never waits on one. */
  function primePickArt() {
    seq.slice(0, 3).forEach(warmPick);
  }
  function warmPick(i) {
    if (pickWarm[i]) return;
    const img = new Image();
    img.onload = () => { pickWarm[i] = img; };
    img.onerror = () => { pickWarm[i] = false; };
    img.src = pickArt(i);
    pickWarm[i] = pickWarm[i] || img;
  }

  /** mode: 'full' (the card is the shot) | 'back' (behind the team) | 'off' */
  function showPickArt(i, mode) {
    const el2 = el.pickBack;
    if (!el2) return;
    if (mode === 'off') { el2.classList.remove('on', 'back'); return; }

    if (i != null) {
      el2.style.backgroundImage = `url("${pickArt(i)}")`;
      /* keep the next one warm while this one is on screen */
      const at = seq.indexOf(i);
      if (at >= 0 && seq[at + 1] != null) warmPick(seq[at + 1]);
    }
    el2.classList.add('on');
    el2.classList.toggle('back', mode === 'back');
  }

  /* ================================================= the live bracket */
  let liveReady = false;

  function buildLiveBracket() {
    renderBracket(document.getElementById('liveBracket'));
    liveReady = true;
    document.querySelectorAll('#liveBracket .bk-seed')
      .forEach(p => p.classList.remove('placed', 'landing'));
    updateLiveCount();
  }

  function updateLiveCount() {
    const placed = document.querySelectorAll('#liveBracket .bk-seed.placed').length;
    if (el.lbCount) el.lbCount.textContent = placed + ' of ' + seq.length + ' in';
  }

  function showLiveBracket(on) {
    if (!el.liveWrap) return;
    el.liveWrap.classList.toggle('on', !!on);
  }

  /** Walk the team over to its slot and drop it in. */
  function placeOnBracket(i, gen, then) {
    if (!liveReady) buildLiveBracket();
    const s = STATE.seeds[i];
    const plate = document.querySelector(
      `#liveBracket .bk-seed[data-seed="${i + 1}"]`);
    if (!s || !plate) { then && then(); return; }

    setCinemaPhase('bracket-moment');
    el.revealLayer.classList.remove('on');
    el.lower.classList.remove('on');
    showPickArt(null, 'off');          // the card goes with the reveal
    showLiveBracket(true);

    setTimeout(() => {
      if (gen !== revealGen) return;
      const t = team(s.id);
      plate.style.setProperty('--land', accentOf(t));
      plate.classList.add('placed');
      plate.classList.remove('landing'); void plate.offsetWidth;
      plate.classList.add('landing');
      updateLiveCount();
      impact();
      if (!isCalm()) { shockwave(accentOf(t), 2); flare(); }
      then && then();
    }, 480);
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
    setCinemaPhase(null);
    clearTimeout(timer);
    clearTimeout(suspenseTimer);
    revealed = [];
    chaptersPlayed.clear();
    hideStoryLayers();

    seq = STATE.seeds.map((s, i) => s ? i : null).filter(i => i !== null);
    if (STATE.order === 'desc') seq.reverse();

    buildRail(); clearRail(); paintTicker();
    buildDirectorRundown();
    resetDirectorReveal();
    buildLiveBracket(); showLiveBracket(false);

    hideCold();
    hidePops();
    if (el.snubWrap) el.snubWrap.classList.remove('on');
    el.revealLayer.classList.remove('on');
    if (el.pickLock) el.pickLock.classList.remove('on');
    el.lower.classList.remove('on');
    el.rail.style.opacity = '0';
    el.glow.style.opacity = '0';
    el.floor.style.removeProperty('--floorc');
    el.gate.style.display = 'grid';
    el.bloom.classList.remove('go');

    const n = seq.length;
    el.gateKick.textContent = n === 12 ? 'The field is set'
      : `${n} team${n === 1 ? '' : 's'} selected`;
    el.gateTitle.innerHTML = `${esc(STATE.title)}<br>${esc(STATE.subtitle)}`;
    el.gateSub.innerHTML = `${esc(STATE.league)} &middot; ${esc(STATE.season)}` +
      ` &nbsp;&middot;&nbsp; 15-second opening film &nbsp;&middot;&nbsp; press play when everyone is watching`;

    el.intro.src ||= INTRO_FILE;
    el.boone.src ||= BOONE_FILE;
    el.filmStage.classList.remove('on', 'authored-open', 'second-act', 'final-beat');
    try { el.film.pause(); el.film.currentTime = 0; } catch (e) {}
    stopCall();
    stopSeedTalk();
    primeCalls();
    primeSeedTalk();
    primePickArt();
    showPickArt(null, 'off');
    startBed();
    setBedVolume();
    startAmbient();

    /* If a premiere time is set the gate holds until it arrives. */
    Dynasty.watchPremiere();
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

  /* The mark used to hang about until the first slate fired, and that is
     driven off an audio timestamp — throttled or late on a phone, it simply
     stayed on screen through Pat and Boone. It gets its own clock now. */
  let markTimer = null;

  function showMark() {
    clearTimeout(markTimer);
    const m = el.coldMark;
    if (!m) return;
    m.style.removeProperty('display');
    m.style.removeProperty('visibility');
    m.classList.add('on');
    markTimer = setTimeout(hideMark, 3600);
  }
  function hideMark() {
    clearTimeout(markTimer);
    markTimer = null;
    const m = el.coldMark;
    if (!m) return;
    m.classList.remove('on');
    /* Belt and braces for a phone: the class alone has proved unreliable, so
       take the element out of the layer stack outright. showMark puts it back. */
    m.style.display = 'none';
    m.style.visibility = 'hidden';
  }

  function showSlate(s) {
    hideMark();
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
      tick(150, .09, .16);
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
    hideMark();
    el.coldSlate.classList.remove('on');
    el.coldGrid.classList.remove('on');
    el.coldCount.classList.add('on');
    el.coldCount.innerHTML = `<span>${n}</span>`;
    countHit(n === 1);
    if (isMax()) pushStage();
  }

  function hideCold() {
    hideMark();
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
    /* Full and short shows both begin with the supplied committee film.
       "Off" is the only explicit opt-out. */
    if (mode === 'off') { runVoiceOpen(); return; }

    phase = 'film';
    const v = el.film;
    if (!v.getAttribute('src')) {
      /* The film goes through createMediaElementSource so the mixer can duck
         it. For a cross-origin element that call yields SILENCE unless the
         media was fetched with CORS — the picture plays and the soundtrack
         is simply gone, with no error anywhere. So the attribute goes on
         first (it has no effect once src is set) and only when the file is
         actually remote, because requesting CORS from a server that does not
         send the header fails the load outright. */
      if (isRemote(VIDEO_FILE)) v.crossOrigin = 'anonymous';
      v.src = mediaUrl(VIDEO_FILE);
    }

    el.filmStage.classList.remove('second-act', 'final-beat');
    el.filmStage.classList.add('on', 'authored-open');
    /* silence underneath, and stop the watchdog putting it back */
    bedWanted = false;
    watchBed(false);
    fadeTo(0, 220);
    setTimeout(() => { if (phase === 'film') { try { el.music.pause(); } catch (e) {} } }, 260);

    let handed = false;
    const go = () => {
      if (handed) return;
      handed = true;
      clearTimeout(filmGuard);
      phase = 'voice';
      el.filmStage.classList.remove('on', 'authored-open', 'second-act', 'final-beat');
      try { v.pause(); v.ontimeupdate = null; } catch (e) {}
      /* the bed comes back from the top, so the voices open over its start */
      bedWanted = true;
      watchBed(true);
      try { el.music.currentTime = 0; } catch (e) {}
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
    const fmt = t => {
      if (!isFinite(t) || t < 0) t = 0;
      const m = Math.floor(t / 60), s2 = Math.floor(t % 60);
      return m + ':' + String(s2).padStart(2, '0');
    };
    const paintBar = () => {
      const d = v.duration;
      if (!isFinite(d) || d <= 0) return;
      const k = Math.min(1, v.currentTime / d);
      if (el.fbFill)  el.fbFill.style.width = (k * 100).toFixed(2) + '%';
      if (el.fbNow)   el.fbNow.textContent = fmt(v.currentTime);
      if (el.fbTotal) el.fbTotal.textContent = fmt(d);
      if (el.fbLeft)  el.fbLeft.textContent = fmt(d - v.currentTime) + ' left';
      el.filmStage.classList.toggle('second-act', k > .36);
      el.filmStage.classList.toggle('final-beat', k > .76);
    };
    v.ontimeupdate = paintBar;

    v.onloadedmetadata = () => { paintBar(); watch(); };
    if (v.readyState >= 1) { paintBar(); watch(); }

    v.currentTime = 0;
    Bus.set(v, filmVol(), 0);
    v.play().catch(go);
  }

  function runVoiceOpen() {
    phase = 'intro';
    ensureBed('voice-open');
    el.cold.classList.add('on');
    showMark();
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
    Bus.set(a, voiceVol(), 0);
    const started = a.play();

    const fallback = () => {
      /* audio blocked or missing — run the short package instead */
      STATE.cold = 'short'; runColdOpen(); STATE.cold = 'full';
    };
    if (started && started.catch) started.catch(fallback);
    a.onerror = fallback;

    popDone.clear();
    showNameBar('Pat McAfee', 'Selection Show');

    a.ontimeupdate = () => {
      if (a.currentTime > 0.4) hideMark();   // Pat is audibly under way
      const d = a.duration;
      if (!isFinite(d) || d <= 0) return;
      const k = a.currentTime / d, left = d - a.currentTime;
      if (left > 6) runPops(POPS_PAT, k, 'p');

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

  /* =====================================================================
     Graphics for the monologues. A broadcast never leaves someone talking
     over a still frame — a name bar wipes in, then cards punch in and out
     across the speech. Each is placed as a fraction of the track, so they
     stay in step whatever length you swap in.
     ===================================================================== */
  const POPS_PAT = [
    { at: .16, kick: 'The field', big: '12 TEAMS',
      sub: () => `From ${TEAMS.length} programmes` },
    { at: .38, kick: 'Seeds one to four', big: 'FIRST-ROUND<br>BYES',
      sub: () => 'Straight to the quarter-finals' },
    { at: .60, kick: 'Seeds five to twelve', big: 'CAMPUS SITES',
      sub: () => 'The higher seed hosts' },
    { at: .82, kick: 'The road', big: 'SIX BOWLS',
      sub: () => 'Rose · Sugar · Fiesta · Peach · Orange · Cotton' }
  ];
  const POPS_BOONE = [
    { at: .20, kick: 'On the line', big: 'ONE TROPHY',
      sub: () => `${STATE.season} National Championship` },
    { at: .48, kick: 'The committee', big: 'THE FIELD<br>IS SET',
      sub: () => STATE.league },
    { at: .74, kick: 'Coming up', big: 'THE PICKS',
      sub: () => 'One at a time, in order' }
  ];

  let popTimer = null, popDone = new Set();

  function showNameBar(who, role) {
    el.nameWho.textContent = who;
    el.nameRole.textContent = role;
    el.nameBar.classList.add('on');
    setTimeout(() => el.nameBar.classList.remove('on'), 6500);
  }

  function showPop(p) {
    clearTimeout(popTimer);
    el.vpKick.textContent = p.kick;
    el.vpBig.innerHTML = p.big;
    el.vpSub.textContent = typeof p.sub === 'function' ? p.sub() : (p.sub || '');
    el.vPop.classList.remove('on');
    void el.vPop.offsetWidth;
    el.vPop.classList.add('on');
    tick(230, .07, .14);
    if (!isCalm()) flare();
    popTimer = setTimeout(() => el.vPop.classList.remove('on'), 5200);
  }

  function hidePops() {
    clearTimeout(popTimer);
    if (el.vPop) el.vPop.classList.remove('on');
    if (el.nameBar) el.nameBar.classList.remove('on');
  }

  /** Fire whichever card this point in the track has reached. */
  function runPops(list, k, tag) {
    for (let i = 0; i < list.length; i++) {
      const key = tag + i;
      if (k >= list[i].at && !popDone.has(key)) {
        popDone.add(key);
        showPop(list[i]);
      }
    }
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
    hideMark();
    ensureBed('boone');
    setBedVolume();

    const finish2 = () => endColdOpen();
    b.onerror = finish2;
    b.onended = finish2;
    popDone.clear();
    hidePops();
    showNameBar('Coach Boone', STATE.league);

    b.ontimeupdate = () => {
      if (b.currentTime > 0.4) hideMark();
      const d = b.duration;
      if (!isFinite(d) || d <= 0) return;
      const k = b.currentTime / d, left = d - b.currentTime;
      if (left > 6) runPops(POPS_BOONE, k, 'b');
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
    b.currentTime = 0; Bus.set(b, booneVol(), 0);
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
    el.filmStage.classList.remove('on', 'authored-open', 'second-act', 'final-beat');
    clearTimeout(timer);
    hidePops();
    hideCold();
    phase = 'reveal';
    ensureBed('reveals');
    setBedVolume();
    el.rail.style.opacity = '1';
    crowd(2.2); flare();
    next();
  }

  /* =====================================================================
     STORY BEATS

     A twelve-pick show needs shape, not twelve copies of the same animation.
     Three chapter cards reset the tension, every completed campus matchup
     gets a broadcast lockup, and the full field receives a final hero wall.
     ===================================================================== */
  function hideStoryLayers() {
    [el.pickChapter, el.matchMoment, el.fieldWall]
      .forEach(node => node && node.classList.remove('on'));
    chapterAdvance = null;
  }

  function runChapter(pos, then) {
    const card = PICK_CHAPTERS[pos];
    if (!card) { then(); return; }

    phase = 'chapter';
    chaptersPlayed.add(pos);
    setCinemaPhase('chapter-moment');
    el.revealLayer.classList.remove('on');
    if (el.pickLock) el.pickLock.classList.remove('on');
    el.lower.classList.remove('on');
    showPickArt(null, 'off');
    showLiveBracket(false);
    el.rail.style.opacity = '0';

    el.pcKicker.textContent = card.kick.toUpperCase();
    el.pcIndex.textContent = card.index;
    el.pcTitle.textContent = card.title;
    el.pcSub.textContent = card.sub;
    el.pickChapter.classList.remove('on');
    void el.pickChapter.offsetWidth;
    el.pickChapter.classList.add('on');
    stinger(pos === 8 ? 392 : 523.25);
    crowd(pos === 8 ? 2.5 : 1.8);
    flare();
    if (!isCalm()) shockwave(pos === 8 ? '#ef3824' : '#f4c25c', 3);

    let done = false;
    chapterAdvance = () => {
      if (done) return;
      done = true;
      phase = 'transition';
      clearTimeout(timer);
      el.pickChapter.classList.remove('on');
      chapterAdvance = null;
      setCinemaPhase(null);
      el.rail.style.opacity = '1';
      setTimeout(then, 460);
    };
    timer = setTimeout(chapterAdvance, 3400);
  }

  function matchTeam(target, selection, seed) {
    const t = team(selection.id);
    target.innerHTML = `<span class="mm-seed">NO. ${seed}</span>`;
    target.appendChild(bannerEl(selection.id, { flip: seed > 8 }));
    target.insertAdjacentHTML('beforeend',
      `<strong>${esc(t.school.toUpperCase())}</strong>` +
      `<small>${[esc(selection.record || ''), esc(t.conf || '')].filter(Boolean).join(' · ')}</small>`);
  }

  function runMatchupMoment(i, gen, then) {
    const seed = i + 1;
    const matchup = firstRound().find(m => m.lo === seed || m.hi === seed);
    if (!matchup || !STATE.seeds[matchup.hi - 1] || !STATE.seeds[matchup.lo - 1]) {
      then(); return;
    }
    const shown = seq.slice(0, cursor + 1);
    if (!shown.includes(matchup.hi - 1) || !shown.includes(matchup.lo - 1)) {
      then(); return;
    }

    phase = 'matchup';
    setCinemaPhase('matchup-moment');
    el.revealLayer.classList.remove('on');
    el.lower.classList.remove('on');
    showPickArt(null, 'off');
    showLiveBracket(false);
    el.rail.style.opacity = '0';

    const high = STATE.seeds[matchup.hi - 1];
    const low = STATE.seeds[matchup.lo - 1];
    el.matchMoment.style.setProperty('--mm-left', hexA(accentOf(team(high.id)), .24));
    el.matchMoment.style.setProperty('--mm-right', hexA(accentOf(team(low.id)), .22));
    matchTeam(el.mmLeft, high, matchup.hi);
    matchTeam(el.mmRight, low, matchup.lo);
    el.mmSite.textContent = `AT ${team(high.id).school.toUpperCase()} · CAMPUS SITE`;
    el.matchMoment.classList.remove('on');
    void el.matchMoment.offsetWidth;
    el.matchMoment.classList.add('on');
    stinger(659.25); crowd(2.4); flare();
    if (!isCalm()) {
      shockwave(accentOf(team(high.id)), 2);
      setTimeout(() => { if (gen === revealGen) shockwave(accentOf(team(low.id)), 2); }, 520);
    }

    let done = false;
    chapterAdvance = () => {
      if (done || gen !== revealGen) return;
      done = true;
      phase = 'transition';
      clearTimeout(timer);
      el.matchMoment.classList.remove('on');
      chapterAdvance = null;
      setCinemaPhase(null);
      el.rail.style.opacity = '1';
      setTimeout(then, 500);
    };
    timer = setTimeout(chapterAdvance, 4800);
  }

  function runFieldWall(then) {
    phase = 'fieldwall';
    setCinemaPhase('fieldwall-moment');
    el.revealLayer.classList.remove('on');
    el.lower.classList.remove('on');
    showPickArt(null, 'off');
    showLiveBracket(false);
    el.rail.style.opacity = '0';

    el.fieldWallGrid.innerHTML = '';
    STATE.seeds.forEach((selection, i) => {
      if (!selection) return;
      const card = document.createElement('div');
      card.className = 'fw-team';
      card.style.setProperty('--fw-i', i);
      card.innerHTML = `<span>${i + 1}</span>`;
      card.appendChild(bannerEl(selection.id));
      el.fieldWallGrid.appendChild(card);
    });
    el.fwMeta.textContent = `${STATE.league.toUpperCase()} · ${STATE.season} · ONE CHAMPION`;
    el.fieldWall.classList.remove('on');
    void el.fieldWall.offsetWidth;
    el.fieldWall.classList.add('on');
    crowd(3); stinger(523.25); flare();
    burst(['#f4c25c', '#ef3824', '#ffffff', '#d99328']);
    if (!isCalm()) shockwave('#f4c25c', 5);

    let done = false;
    chapterAdvance = () => {
      if (done) return;
      done = true;
      phase = 'transition';
      clearTimeout(timer);
      el.fieldWall.classList.remove('on');
      chapterAdvance = null;
      setCinemaPhase(null);
      setTimeout(then, 650);
    };
    timer = setTimeout(chapterAdvance, 5600);
  }

  function pickPrompt(i) {
    if (i < 4) return 'WHO CLAIMS A FIRST-ROUND BYE?';
    if (i < 8) return 'WHO BRINGS PLAYOFF FOOTBALL HOME?';
    return i === 11 ? 'WHO GETS THE FINAL INVITATION?' : 'WHO SURVIVES THE CUT LINE?';
  }

  function directorAct(i) {
    if (i < 4) return 'ACT I · THE FOUR BYES';
    if (i < 8) return 'ACT II · CAMPUS LIGHTS';
    return 'ACT III · THE CUT LINE';
  }

  function buildDirectorRundown() {
    if (!el.directorTrack) return;
    el.directorTrack.innerHTML = '';
    seq.forEach((seedIndex, orderIndex) => {
      const dot = document.createElement('i');
      dot.dataset.seed = seedIndex;
      dot.dataset.order = orderIndex;
      dot.innerHTML = `<b>${String(seedIndex + 1).padStart(2, '0')}</b>`;
      el.directorTrack.appendChild(dot);
    });
  }

  function updateDirectorRundown(i, landed) {
    if (el.directorAct) el.directorAct.textContent = directorAct(i);
    if (!el.directorTrack) return;
    [...el.directorTrack.children].forEach((dot, orderIndex) => {
      const seedIndex = +dot.dataset.seed;
      dot.classList.toggle('done', orderIndex < cursor ||
        (seedIndex === i && !!landed));
      dot.classList.toggle('current', seedIndex === i);
      dot.classList.toggle('locked', seedIndex === i && !!landed);
    });
  }

  function setDirectorTreatment(i) {
    const show = document.getElementById('show');
    const d = DIRECTOR_PICKS[i] || DIRECTOR_PICKS[0];
    show.classList.remove('camera-left', 'camera-right', 'camera-center',
      'tier-bye', 'tier-host', 'tier-road', 'is-milestone');
    show.classList.add(`camera-${d.camera}`, `tier-${d.tier}`);
    if (d.milestone) show.classList.add('is-milestone');
  }

  function resetDirectorReveal() {
    if (el.pickStory) el.pickStory.classList.remove('in');
    if (el.milestoneStamp) el.milestoneStamp.classList.remove('on');
    if (el.heroCrest) {
      el.heroCrest.classList.remove('in');
      el.heroCrest.removeAttribute('data-team');
      el.heroCrest.innerHTML = '';
    }
  }

  function directorStory(i, t) {
    const route = matchupText(i);
    switch (i) {
      case 0: return `${t.school} owns the top line and the shortest road to the championship.`;
      case 1: return `${t.school} skips opening weekend and enters on the quarterfinal stage.`;
      case 2: return `${t.school} has earned a bye. Two wins now separate this team from the title game.`;
      case 3: return `${t.school} takes the last first-round bye. Every direct ticket is now gone.`;
      case 4: return `${t.school} leads opening weekend. The playoff begins in front of its own crowd.`;
      case 5: return `${t.school} brings December football home with the season on the line.`;
      case 6: return `${t.school} gets one more night on its own field and one chance to defend it.`;
      case 7: return `${t.school} claims the final campus site. Every remaining team must travel.`;
      case 8: return `${t.school} is the first road invitation. ${route || 'The margin for error is gone.'}`;
      case 9: return `${t.school} is in, and the path starts away from home. ${route || 'Win or the season ends.'}`;
      case 10: return `${t.school} survived the room. ${route || 'The road is the only way forward.'}`;
      case 11: return `${t.school} takes the twelfth and final chair. The playoff field is complete.`;
      default: return `${t.school} is officially in the College Football Playoff.`;
    }
  }

  function paintHeroCrest(t) {
    if (!el.heroCrest) return;
    const host = el.heroCrest;
    host.dataset.team = t.id;
    host.innerHTML = `<span>${esc(t.mark || t.abbr || t.school.slice(0, 2))}</span>`;

    const install = img => {
      if (!img || host.dataset.team !== t.id) return;
      img.alt = '';
      host.innerHTML = '';
      host.appendChild(img);
    };
    const ready = LogoStore.imageFor(t.id);
    if (ready) install(ready);
    else LogoStore.get(t.id, url => {
      const img = new Image();
      img.onload = () => install(img);
      img.src = url;
    });
    host.classList.remove('in');
    void host.offsetWidth;
    host.classList.add('in');
  }

  function populateDirectorStory(i, t, gen) {
    const d = DIRECTOR_PICKS[i] || DIRECTOR_PICKS[0];
    if (el.pickStory) {
      el.pickStoryKicker.textContent = d.kicker.toUpperCase();
      el.pickStoryTitle.textContent = d.title.toUpperCase();
      el.pickStoryBody.textContent = directorStory(i, t);
      el.pickStory.classList.remove('in');
      void el.pickStory.offsetWidth;
      el.pickStory.classList.add('in');
    }
    if (!el.milestoneStamp) return;
    el.milestoneStamp.classList.remove('on');
    if (!d.milestone) return;
    el.milestoneNumber.textContent = String(i + 1).padStart(2, '0');
    el.milestoneText.textContent = d.milestone;
    setTimeout(() => {
      if (gen !== revealGen) return;
      el.milestoneStamp.classList.remove('on');
      void el.milestoneStamp.offsetWidth;
      el.milestoneStamp.classList.add('on');
    }, 920);
  }

  function minimumSuspense(i) {
    const milestone = !!(DIRECTOR_PICKS[i] && DIRECTOR_PICKS[i].milestone);
    if (isCalm()) return milestone ? 1500 : 1150;
    if (i === 11) return 2900;
    if (milestone) return 2450;
    return i >= 8 ? 2200 : 1950;
  }

  function runSuspense(i, gen, clip) {
    let voiceDone = false, clockDone = false, landed = false;
    const finish = () => {
      if (landed || !voiceDone || !clockDone || gen !== revealGen) return;
      landed = true;
      clearTimeout(suspenseTimer);
      landTeam(i, gen);
    };
    suspenseTimer = setTimeout(() => { clockDone = true; finish(); }, minimumSuspense(i));
    playSeedTalk(clip, gen, () => { voiceDone = true; finish(); });
  }

  /* ============================================================= PLAY */
  /* Recording has to be requested straight off the click, before anything
     async happens, or the browser refuses the capture prompt. */
  async function play() {
    /* A premiere that has not arrived yet holds everybody at the gate — the
       whole point is that the league watches the same thing at once. */
    const left = Dynasty.untilPremiere();
    if (left != null) {
      toast('The show starts in ' + Dynasty.fmtLeft(left));
      return;
    }
    /* A click is the only moment iOS lets the context start, so this is where
       every source moves onto the mixer. */
    Bus.adopt([el.music, el.intro, el.boone, el.film], applyLevels);
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
    bedWanted = true;
    watchBed(true);
    el.gate.style.display = 'none';
    running = true; paused = false;
    revealed = []; cursor = -1;
    paintTicker();


    /* restart the bed from the top for the show */
    const m = el.music;
    if (!m.getAttribute('src')) m.src = MUSIC_FILE;
    try { m.currentTime = 0; } catch (e) {}
    Bus.set(m, 0, 0);
    m.play().then(() => { bedStarted = true; setBedVolume(); }).catch(() => {});

    startAmbient();
    runFilm();
  }

  /* ========================================================== REVEALS */
  const inColdOpen = () =>
    phase === 'film' || phase === 'voice' || phase === 'intro' || phase === 'boone';

  function next() {
    if (chapterAdvance && ['chapter', 'matchup', 'fieldwall'].includes(phase)) {
      chapterAdvance();
      return;
    }
    if (inColdOpen()) { endColdOpen(); return; }
    if (cursor >= seq.length - 1) { finish(); return; }
    const pos = cursor + 1;
    if (PICK_CHAPTERS[pos] && !chaptersPlayed.has(pos)) {
      runChapter(pos, () => goto(pos));
      return;
    }
    goto(pos);
  }
  function prev() {
    if (inColdOpen()) return;
    if (cursor <= 0) return;
    goto(cursor - 1, true);
  }

  function goto(pos, rebuild) {
    clearTimeout(timer);
    clearTimeout(suspenseTimer);
    hideStoryLayers();
    phase = 'reveal';
    cursor = pos;
    reveal(seq[cursor]);

    if (rebuild) {
      clearRail(); revealed = [];
      buildLiveBracket();
      for (let k = 0; k <= cursor; k++) {
        litRail(seq[k], false);
        pushTickerTeam(seq[k]);
        const p = document.querySelector(
          `#liveBracket .bk-seed[data-seed="${seq[k] + 1}"]`);
        if (p && k < cursor) p.classList.add('placed');
      }
      updateLiveCount();
    }

    /* the sequence itself schedules the next pick when the reaction ends */
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

  /** One class owns the visual beat so layers never compete for emphasis. */
  function setCinemaPhase(name) {
    const show = document.getElementById('show');
    show.classList.remove('anticipating', 'landing', 'holding', 'bracket-moment',
      'chapter-moment', 'matchup-moment', 'fieldwall-moment');
    if (name) show.classList.add(name);
  }

  let revealGen = 0;

  /* A pick now runs in three beats, the way the broadcast does it: the
     build-up with only the seed number on screen, the team landing, then
     the reaction over the celebration. */
  function reveal(i) {
    const s = STATE.seeds[i];
    if (!s) { next(); return; }
    const gen = ++revealGen;
    clearTimeout(timer);
    clearTimeout(suspenseTimer);
    stopCall();
    stopSeedTalk();

    setDirectorTreatment(i);
    resetDirectorReveal();
    updateDirectorRundown(i, false);
    setCinemaPhase('anticipating');
    showLiveBracket(false);
    el.revealLayer.classList.add('on');
    el.bannerStage.innerHTML = '';       // no team yet — that is the point
    el.teamInfo.innerHTML = '';
    if (el.bidRow) el.bidRow.classList.remove('in');
    if (el.bidTag) el.bidTag.textContent = '';
    if (el.moveTag) { el.moveTag.textContent = ''; el.moveTag.hidden = true; }
    el.lower.classList.remove('on');
    el.bloom.classList.remove('go');
    el.glow.style.opacity = '0';
    if (el.revealEyebrow) el.revealEyebrow.textContent = 'COMMITTEE SELECTION';
    if (el.revealCount) el.revealCount.textContent =
      `PICK ${String(i + 1).padStart(2, '0')} / ${String(seq.length).padStart(2, '0')}`;
    if (el.pickLock) {
      el.pickLockSeed.textContent = String(i + 1).padStart(2, '0');
      el.pickLockPrompt.textContent = pickPrompt(i);
      el.pickLock.classList.remove('on');
      void el.pickLock.offsetWidth;
      el.pickLock.classList.add('on');
    }
    if (el.teamGhost) {
      el.teamGhost.textContent = '';
      el.teamGhost.classList.remove('in');
    }

    /* Beat one is the pick card, full bleed and on its own. It already says
       the number in three-foot gold letters, so the stage numeral stands
       down rather than competing with it. */
    showPickArt(i, 'full');
    el.bigNum.textContent = i + 1;
    el.bigNum.classList.remove('pop', 'show');
    el.seedChip.textContent = `NO. ${i + 1} SEED`;
    el.seedChip.classList.remove('roll'); void el.seedChip.offsetWidth;
    el.seedChip.classList.add('roll');
    whoosh();

    runSuspense(i, gen, seedClip(i, 'before'));
  }

  /** The name drops. Everything that used to be the whole reveal. */
  function landTeam(i, gen) {
    if (gen !== revealGen) return;
    const s = STATE.seeds[i];
    if (!s) return;
    const t = team(s.id);
    const bye = i < 4;
    const accent = accentOf(t);
    const show = document.getElementById('show');

    setCinemaPhase('landing');
    clearTimeout(suspenseTimer);
    if (el.pickLock) el.pickLock.classList.remove('on');
    show.style.setProperty('--team-a', t.primary);
    show.style.setProperty('--team-b', accent);
    if (el.revealEyebrow)
      el.revealEyebrow.textContent = bye ? 'TOP FOUR SEED · FIRST-ROUND BYE' : 'COMMITTEE SELECTION';
    if (el.teamGhost) {
      el.teamGhost.textContent = t.school;
      el.teamGhost.classList.remove('in'); void el.teamGhost.offsetWidth;
      el.teamGhost.classList.add('in');
    }
    paintHeroCrest(t);
    populateDirectorStory(i, t, gen);
    updateDirectorRundown(i, true);

    /* ---- pre-hit: wipe + glitch, then the banner lands ---- */
    wipe(t.primary);
    glitch();
    whoosh();
    if (isMax()) pushStage();

    /* The card drops back and blurs so the team owns the frame — the number
       is still legible behind it, which is what the broadcast does too. */
    showPickArt(i, 'back');
    el.bigNum.classList.remove('pop', 'show');

    el.seedChip.textContent = `NO. ${i + 1} SEED`;
    el.seedChip.classList.remove('roll'); void el.seedChip.offsetWidth;
    el.seedChip.classList.add('roll');

    el.bannerStage.innerHTML = '';
    el.bannerStage.style.setProperty('--team-halo', hexA(accent, .32));
    const b = bannerEl(s.id);
    el.bannerStage.appendChild(b);
    el.bannerStage.classList.remove('slam'); void el.bannerStage.offsetWidth;
    el.bannerStage.classList.add('slam');
    setTimeout(() => { if (gen === revealGen) b.classList.add('sweep'); }, 470);

    /* How they got here, the way the broadcast labels it: champion of a
       league and holding one of the five automatic bids, or an at-large. */
    if (el.bidTag) {
      const champ = !!s.champ;
      el.bidTag.textContent = Champs.tagFor(i) +
        (champ && Champs.isAutoBid(i) ? ' · AUTOMATIC BID' : '');
      el.bidTag.className = 'bid-tag' + (champ ? ' champ' : '');
    }
    if (el.moveTag) {
      const mv = Movement.of(i);
      el.moveTag.className = 'move-tag' + (mv ? ' ' + mv.dir : '');
      el.moveTag.textContent = mv ? Movement.caption(i) : '';
      el.moveTag.hidden = !mv;
    }
    if (el.bidRow) {
      el.bidRow.classList.remove('in'); void el.bidRow.offsetWidth;
      el.bidRow.classList.add('in');
    }

    el.teamInfo.innerHTML =
      `<div class="school">${esc(t.school.toUpperCase())}</div>` +
      (s.record ? `<div class="rec">${esc(s.record)}</div>` : '') +
      `<div class="conf">${esc(t.conf.toUpperCase())}</div>` +
      (bye ? `<div class="bye">FIRST-ROUND BYE</div>` : opponentTag(i));
    el.teamInfo.classList.remove('in'); void el.teamInfo.offsetWidth;
    el.teamInfo.classList.add('in');

    /* ---- colour the whole stage in the team's palette ---- */
    el.bloom.style.setProperty('--bl1', hexA(accent, .45));
    el.bloom.style.setProperty('--bl2', hexA(t.primary, .55));
    el.bloom.classList.remove('go'); void el.bloom.offsetWidth;
    el.bloom.classList.add('go');

    el.glow.style.setProperty('--tglow', hexA(t.primary, .5));
    el.glow.style.opacity = '1';
    el.floor.style.setProperty('--floorc', hexA(accent, .32));
    el.flash.style.background =
      `radial-gradient(60% 60% at 50% 50%, ${hexA(accent, .95)}, ` +
      `${hexA(t.primary, .55)} 60%, transparent 78%)`;
    el.flash.classList.remove('go'); void el.flash.offsetWidth;
    el.flash.classList.add('go');

    /* ---- the hit ---- */
    setTimeout(() => {
      if (gen !== revealGen) return;
      setCinemaPhase('holding');
      shakeStage(); pulseVignette();
      impact(); crowd(1.9);
      shockwave(accent, isMax() ? 4 : 2);
      burst([t.primary, accent, '#ffffff', t.primary, '#F56A00']);
      flare();
      fadeTo(bedVol() * DUCK_UNDER_HIT, 180);
      setTimeout(() => { if (gen === revealGen) setBedVolume(); }, 850);
    }, 300);

    /* ---- the announcer's call, once the banner has landed ---- */
    stopCall();
    setTimeout(() => {
      if (gen !== revealGen) return;
      playCall(s.id);
    }, 780);

    /* ---- lower third ---- */
    el.lower.classList.remove('on');
    setTimeout(() => {
      if (gen !== revealGen) return;
      el.l3cap.textContent = i + 1;
      el.lower.querySelector('.l3').style.setProperty('--l3c', accentOf(t));
      el.l3t1.textContent = `${t.school}${t.mascot ? ' ' + t.mascot : ''}`;
      el.l3t2.textContent = [s.record, t.conf, bye ? 'First-round bye' : matchupText(i)]
        .filter(Boolean).join('  ·  ');
      el.lower.classList.add('on');
    }, 880);

    litRail(i, true);
    pushTickerTeam(i);

    /* ---- the reaction, then over to the bracket ---- */
    const after = seedClip(i, 'after');
    const runAfter = () => {
      if (gen !== revealGen) return;
      playSeedTalk(after, gen, () => {
        if (gen !== revealGen) return;
        /* the pick is done: put them on the board, hold, then move on */
        placeOnBracket(i, gen, () => {
          if (gen !== revealGen) return;
          const advance = () => {
            if (gen !== revealGen) return;
            if (STATE.pace !== 'manual' && !paused)
              timer = setTimeout(next, 1900);
          };
          runMatchupMoment(i, gen, advance);
        });
      });
    };
    const call = callCache[s.id];
    const callLen = (call && isFinite(call.duration)) ? call.duration * 1000 : 0;
    setTimeout(runAfter, 700 + (STATE.calls === 'off' ? 300 : callLen + 500));
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

  /* =====================================================================
     LAST ONE IN vs FIRST ONE OUT

     The most argued-about thirty seconds of any selection show. Both teams
     are already on the board — the last seed and the first name on the
     just-missed list — so this is only a matter of putting them next to
     each other and letting the league shout at the screen.
     ===================================================================== */
  function snubCard(s, seedNo, label) {
    const t = team(s.id);
    const col = document.createElement('div');
    col.innerHTML = `<span class="sn-label">${esc(label)}</span>` +
                    `<span class="sn-seed">NO. ${seedNo}</span>`;
    const w = document.createElement('div');
    w.className = 'sn-banner';
    w.appendChild(bannerEl(s.id));
    col.appendChild(w);
    col.insertAdjacentHTML('beforeend',
      `<span class="sn-school">${esc(t.school.toUpperCase())}</span>` +
      `<span class="sn-meta">${[esc(s.record || ''), esc(t.conf || '')]
        .filter(Boolean).join(' · ')}</span>` +
      (s.champ ? `<span class="sn-cc">${esc((t.conf || '').toUpperCase())} CHAMPION</span>` : ''));
    return col;
  }

  function runSnub(then) {
    /* Needs both halves of the argument — no last team in, or nobody left
       out, and there is nothing to compare. */
    const lastIn = [...STATE.seeds].reverse().find(Boolean);
    const lastInSeed = STATE.seeds.lastIndexOf(lastIn) + 1;
    const firstOut = STATE.out.slice(0, STATE.outCount).find(Boolean);
    if (!lastIn || !firstOut || !el.snubWrap) { then(); return; }

    phase = 'snub';
    el.revealLayer.classList.remove('on');
    el.lower.classList.remove('on');
    showPickArt(null, 'off');
    showLiveBracket(false);
    el.glow.style.opacity = '0';

    el.snubIn.innerHTML = '';
    el.snubOut.innerHTML = '';
    el.snubIn.appendChild(snubCard(lastIn, lastInSeed, 'Last team in'));
    el.snubOut.appendChild(snubCard(firstOut, 13, 'First team out'));

    el.snubWrap.classList.add('on');
    stinger(392); crowd(2.2); flare();
    if (!isCalm()) shockwave(accentOf(team(lastIn.id)), 2);

    timer = setTimeout(() => {
      el.snubWrap.classList.remove('on');
      setTimeout(then, 620);
    }, 6200);
  }

  /* ================================================== FIRST FOUR OUT */
  function runFourOut(then) {
    const outs = STATE.out.slice(0, STATE.outCount).filter(Boolean);
    if (!outs.length) { then(); return; }

    phase = 'fourout';
    el.revealLayer.classList.remove('on');
    el.lower.classList.remove('on');
    el.glow.style.opacity = '0';
    el.floor.style.removeProperty('--floorc');

    const heading = outLabelText().toUpperCase();
    if (el.foHead) el.foHead.textContent = heading;

    el.cold.classList.add('on');
    showSlate({ kick: () => 'So close',
                big: () => esc(heading),
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
        setTimeout(() => { whoosh(); if (!isCalm()) shockwave(accentOf(t), 1); },
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
    setCinemaPhase(null);
    clearTimeout(timer);
    clearTimeout(suspenseTimer);
    stopCall();
    stopSeedTalk();
    el.revealLayer.classList.remove('on');
    el.lower.classList.remove('on');

    showLiveBracket(false);
    fullTicker();
    /* the argument first, then the names, the complete twelve, and the close */
    runSnub(() => runFourOut(() => runFieldWall(closingCard)));
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

      /* The field is now public, so it becomes history. Archiving here is
         also what gives next season's show its movement arrows — a guest
         watching a share link keeps their own archive, which is exactly
         right: it is their copy of the league's seasons. */
      try { History.save(); Movement.refresh(); } catch (e) {}

      showScreen('final');
      buildBracket();                    // the plates fly in one at a time
      /* let the bracket breathe, then close the recording and the music */
      timer = setTimeout(() => {
        fadeTo(0, 3000);
        setTimeout(() => {
          bedWanted = false; watchBed(false);
          el.music.pause(); bedStarted = false;
        }, 3100);
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
        tick(120 + i * 9, .06, .13);   // walks up, never the same twice
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
      bedWanted = false; watchBed(false);
      el.music.pause();
      try { el.intro.pause(); el.boone.pause(); el.film.pause(); } catch (e) {}
      if (callAudio) try { callAudio.pause(); } catch (e) {}
      if (seedAudio) try { seedAudio.pause(); } catch (e) {}
    } else {
      bedWanted = true; watchBed(true);
      el.music.play().catch(() => {});
      if (phase === 'film')  el.film.play().catch(() => {});
      else if (phase === 'intro') el.intro.play().catch(() => {});
      else if (phase === 'boone') el.boone.play().catch(() => {});
      else if (chapterAdvance && ['chapter', 'matchup', 'fieldwall'].includes(phase))
        timer = setTimeout(chapterAdvance, 1200);
      else {
        if (callAudio) callAudio.play().catch(() => {});
        if (seedAudio) seedAudio.play().catch(() => {});
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
     'recLamp', 'film', 'filmStage', 'filmCredit', 'filmSkip', 'fourOut', 'fourOutWrap',
     'bloom', 'l3bar', 'foHead',
     'nameBar', 'nameWho', 'nameRole', 'vPop', 'vpKick', 'vpBig', 'vpSub',
     'liveWrap', 'liveBracket', 'lbCount',
     'bidRow', 'bidTag', 'moveTag', 'snubWrap', 'snubIn', 'snubOut', 'pickBack',
     'revealEyebrow', 'revealCount', 'teamGhost', 'pickLock', 'pickLockSeed',
     'pickLockPrompt', 'pickChapter', 'pcKicker', 'pcIndex', 'pcTitle', 'pcSub',
     'matchMoment', 'mmLeft', 'mmRight', 'mmSite',
     'fieldWall', 'fieldWallGrid', 'fwMeta',
     'directorRundown', 'directorAct', 'directorTrack', 'pickMain',
     'heroCrest', 'pickStory', 'pickStoryKicker', 'pickStoryTitle', 'pickStoryBody',
     'milestoneStamp', 'milestoneNumber', 'milestoneText',
     'preCount', 'preClock', 'preWhen',
     'fbFill', 'fbNow', 'fbLeft', 'fbTotal']
      .forEach(id => el[id] = document.getElementById(id));
    el.glow = document.getElementById('teamGlow');

    /* An interruption arrives as a plain pause event on the element. */
    el.music.addEventListener('pause', () => {
      if (bedWanted) setTimeout(() => ensureBed('interrupted'), 120);
    });
    el.music.addEventListener('stalled', () => ensureBed('stalled'));

    cvs = document.getElementById('fx');
    ctx = cvs.getContext('2d');
    sizeCanvas();
    addEventListener('resize', () => { sizeCanvas(); seedEmbers(); });

    document.getElementById('btnPlay').onclick = play;
    document.getElementById('cNext').onclick = next;
    document.getElementById('cPrev').onclick = prev;
    document.getElementById('cPlay').onclick = togglePause;
    document.getElementById('cSkip').onclick = () => { if (inColdOpen()) endColdOpen(); };
    const mx = document.getElementById('mixer');
    document.getElementById('cMix').onclick = () => mx.classList.toggle('on');
    document.getElementById('mxClose').onclick = () => mx.classList.remove('on');
    document.getElementById('cRestart').onclick = arm;
    document.getElementById('cBracket').onclick = () => { stop(); showScreen('final'); };
    document.getElementById('cRoom').onclick = () => {
      stop(); showScreen(VIEWER ? 'show' : 'room'); if (VIEWER) arm();
    };
    document.getElementById('cFull').onclick = toggleFull;

    const nudgeCtl = () => {
      el.ctl.classList.add('show');
      clearTimeout(ctlHide);
      ctlHide = setTimeout(() => el.ctl.classList.remove('show'), 2600);
    };
    const showEl = document.getElementById('show');
    showEl.addEventListener('mousemove', nudgeCtl);

    /* A tap anywhere used to advance. With a pick now running as three
       timed beats, that lands mid-sequence and leaves the show in a mess —
       so advancing is the toolbar or the keyboard, deliberately. Touching
       the screen just brings the toolbar up. */
    showEl.addEventListener('pointerdown', () => {
      if (el.gate.style.display === 'none') nudgeCtl();
    });

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
      else if (e.key === 'm' || e.key === 'M')
        document.getElementById('mixer').classList.toggle('on');
      else if (e.key === 'f' || e.key === 'F') toggleFull();
      else if (e.key === 'Escape') {
        if (VIEWER) { stop(); arm(); }      // back to the play button, no further
        else { stop(); showScreen('room'); }
      }
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
    setCinemaPhase(null);
    bedWanted = false; watchBed(false);
    clearTimeout(timer); clearTimeout(markTimer); clearTimeout(suspenseTimer);
    [el.intro, el.boone].forEach(a => {
      try { a.pause(); a.ontimeupdate = null; a.onended = null; } catch (e) {}
    });
    stopSeedTalk();
    clearTimeout(filmGuard);
    try { el.film.pause(); el.film.onended = null; el.film.onloadedmetadata = null; }
    catch (e) {}
    el.filmStage.classList.remove('on', 'authored-open', 'second-act', 'final-beat');
    stopCall();
    stopSeedTalk();
    showPickArt(null, 'off');
    showLiveBracket(false);
    hideStoryLayers();
    resetDirectorReveal();
    if (el.pickLock) el.pickLock.classList.remove('on');
    hideCold();
    stopAmbient();
    setBedVolume();
  }

  return { init, arm, play, next, prev, stop, startBed, setBedVolume,
           applyLevels, fadeTo,
           get usingWebAudio() { return Bus.usingWebAudio; },
           get routedSources() { return Bus.routed; },
           bedVol, sfx: { stinger, beep, whoosh } };
})();

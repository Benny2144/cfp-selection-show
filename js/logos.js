/* =====================================================================
   LOGO STORE
   Three ways a team gets a real banner logo, checked in this order:
     1. a file you imported into the app        (IndexedDB, this browser)
     2. logos/<team-id>.png|svg|webp|jpg        (next to index.html)
     3. a logo URL pattern you configured       (League Setup)
   ===================================================================== */

const LogoStore = (() => {
  const DB = 'cfp27-logos', STORE = 'files';
  let db = null;
  const mem = {};                    // id -> objectURL / dataURL / path
  const decoded = {};                // id -> an <img> already loaded and ready
  const misses = {};                 // id -> true once every source has failed
  const waiting = {};                // id -> [callbacks]
  let bundledPaths = null;           // id -> one known file (no extension probing)
  const cloudIds = new Set();        // private account logos available via Worker

  function open() {
    return new Promise((res, rej) => {
      if (db) return res(db);
      const rq = indexedDB.open(DB, 1);
      rq.onupgradeneeded = () => rq.result.createObjectStore(STORE);
      rq.onsuccess = () => { db = rq.result; res(db); };
      rq.onerror = () => rej(rq.error);
    });
  }

  async function put(id, blob) {
    const d = await open();
    return new Promise((res, rej) => {
      const tx = d.transaction(STORE, 'readwrite');
      tx.objectStore(STORE).put(blob, id);
      tx.oncomplete = () => {
        if (mem[id] && mem[id].startsWith('blob:')) URL.revokeObjectURL(mem[id]);
        mem[id] = URL.createObjectURL(blob);
        delete misses[id]; delete decoded[id];
        res();
        if (typeof CloudSync !== 'undefined') {
          void CloudSync.logoChanged(id, blob).catch(() => {});
        }
      };
      tx.onerror = () => rej(tx.error);
    });
  }

  async function del(id) {
    const d = await open();
    return new Promise(res => {
      const tx = d.transaction(STORE, 'readwrite');
      tx.objectStore(STORE).delete(id);
      tx.oncomplete = () => {
        if (mem[id] && mem[id].startsWith('blob:')) URL.revokeObjectURL(mem[id]);
        delete mem[id]; delete misses[id]; delete decoded[id]; res();
        if (typeof CloudSync !== 'undefined') {
          void CloudSync.logoDeleted(id).catch(() => {});
        }
      };
    });
  }

  async function clear() {
    const d = await open();
    return new Promise(res => {
      const tx = d.transaction(STORE, 'readwrite');
      tx.objectStore(STORE).clear();
      tx.oncomplete = () => {
        Object.values(mem).forEach(u => u.startsWith('blob:') && URL.revokeObjectURL(u));
        Object.keys(mem).forEach(k => delete mem[k]);
        Object.keys(misses).forEach(k => delete misses[k]);
        res();
        if (typeof CloudSync !== 'undefined') {
          void CloudSync.clearLogos().catch(() => {});
        }
      };
    });
  }

  async function localBlobs() {
    let d;
    try { d = await open(); } catch (e) { return []; }
    return new Promise(res => {
      const tx = d.transaction(STORE, 'readonly');
      const st = tx.objectStore(STORE);
      const keys = st.getAllKeys(), vals = st.getAll();
      tx.oncomplete = () => res(keys.result.map((id, i) => ({ id, blob: vals.result[i] })));
      tx.onerror = () => res([]);
    });
  }

  async function refreshCloud() {
    try {
      const response = await fetch('/api/logos', { credentials: 'same-origin' });
      if (!response.ok) return 0;
      const body = await response.json();
      cloudIds.clear();
      (body.logos || []).forEach(x => cloudIds.add(x.team_id));
      return cloudIds.size;
    } catch (e) { return 0; }
  }

  async function loadManifest() {
    try {
      const response = await fetch('logos/manifest.json', { cache: 'force-cache' });
      if (!response.ok) return;
      const body = await response.json();
      bundledPaths = body && body.paths && typeof body.paths === 'object' ? body.paths : {};
    } catch (e) { bundledPaths = null; }
  }

  /* Pull every stored logo into memory once, at boot. */
  async function hydrate() {
    /* /api/logos is private. Anonymous visitors should never generate a
       predictable 401 in the console just to discover they are signed out. */
    const cloud = typeof CloudSync !== 'undefined' && CloudSync.isSignedIn()
      ? refreshCloud() : Promise.resolve(0);
    const manifests = Promise.all([loadManifest(), cloud]);
    let d;
    try { d = await open(); } catch (e) { await manifests; return 0; }
    const local = await new Promise(res => {
      const tx = d.transaction(STORE, 'readonly');
      const st = tx.objectStore(STORE);
      const keys = st.getAllKeys(), vals = st.getAll();
      tx.oncomplete = () => {
        keys.result.forEach((k, i) => { mem[k] = URL.createObjectURL(vals.result[i]); });
        res(keys.result.length);
      };
      tx.onerror = () => res(0);
    });
    await manifests;
    return local;
  }

  const count = () => Object.keys(mem).length;
  const has   = id => !!mem[id];

  /** A ready-to-use copy of a logo, or null if it is not decoded yet.
      Lets a banner paint its logo in the same frame it is built. */
  function imageFor(id) {
    const i = decoded[id];
    if (!i || !i.complete || !i.naturalWidth) return null;
    const c = i.cloneNode();
    c.alt = '';
    return c;
  }

  /* ------------------------------------------------------- resolution */
  const EXT = ['png', 'svg', 'webp', 'jpg', 'jpeg'];

  /** Ask for a team's logo. Calls back with a URL, or never calls back. */
  function get(id, cb) {
    if (mem[id]) {
      /* Restored from storage: we have the URL but nothing decoded yet, so
         warm one now and the next render paints without a blank frame. */
      if (!decoded[id]) {
        const w = new Image();
        w.onload = () => { decoded[id] = w; };
        w.src = mem[id];
      }
      cb(mem[id]);
      return;
    }
    if (misses[id]) return;
    if (waiting[id]) { waiting[id].push(cb); return; }
    waiting[id] = [cb];

    const done = url => {
      mem[id] = url;
      waiting[id].forEach(f => f(url));
      delete waiting[id];
    };
    const fail = () => {
      misses[id] = true;
      delete waiting[id];
    };

    /* One manifest lookup replaces up to five guaranteed 404 requests for a
       school without a bundled crest. Local source previews without a build
       retain the extension fallback. */
    const cands = [];
    if (cloudIds.has(id)) cands.push(`/api/logos/${encodeURIComponent(id)}`);
    if (bundledPaths && bundledPaths[id]) cands.push(bundledPaths[id]);
    else if (bundledPaths === null) cands.push(...EXT.map(e => `logos/${id}.${e}`));
    const pat = (typeof STATE !== 'undefined' && STATE.logoPattern) || '';
    if (pat.includes('{id}')) cands.push(pat.replace(/\{id\}/g, id));
    if (!cands.length) return fail();

    let i = 0;
    const tryNext = () => {
      if (i >= cands.length) return fail();
      const url = cands[i++];
      const img = new Image();
      img.crossOrigin = 'anonymous';
      img.onload  = () => { decoded[id] = img; done(url); };
      img.onerror = tryNext;
      img.src = url;
    };
    tryNext();
  }

  /* ------------------------------------------------ bulk file matching */
  /* "Ohio_State_Buckeyes_logo.png" -> ohiostate                          */
  const norm = s => s.toLowerCase()
    .replace(/\.[a-z0-9]+$/, '')                         // drop extension
    .replace(/\b(logo|logos|athletics|university|univ|primary|mark|alt|small|large|500|200|\d{2,4}px)\b/g, '')
    .replace(/[^a-z0-9]/g, '');

  function buildIndex() {
    const idx = new Map();
    const add = (key, id) => { if (key && !idx.has(key)) idx.set(key, id); };
    TEAMS.forEach(t => {
      add(norm(t.id), t.id);
      add(norm(t.school), t.id);
      add(norm(t.school + t.mascot), t.id);
      add(norm(t.abbr), t.id);
      add(norm(t.school.replace(/\bstate\b/i, 'st')), t.id);
      add(norm('university of ' + t.school), t.id);
    });
    return idx;
  }

  /** Match a filename to a team id. Exact-ish first, then containment. */
  function matchFile(name, idx) {
    const n = norm(name);
    if (!n) return null;
    if (idx.has(n)) return idx.get(n);

    let best = null, bestLen = 0;
    for (const [key, id] of idx) {
      if (key.length < 3) continue;
      if (n === key || n.startsWith(key) || n.endsWith(key) ||
          (key.length >= 5 && n.includes(key))) {
        if (key.length > bestLen) { best = id; bestLen = key.length; }
      }
    }
    return best;
  }

  /** Import a FileList / array of Files. Returns {added, skipped, names}. */
  async function importFiles(files, onProgress) {
    const idx = buildIndex();
    const list = [...files].filter(f => /^image\//.test(f.type) || /\.(png|svg|webp|jpe?g)$/i.test(f.name));
    let added = 0; const skipped = [];
    for (let i = 0; i < list.length; i++) {
      const f = list[i];
      const id = matchFile(f.name, idx);
      if (!id) { skipped.push(f.name); }
      else { await put(id, f); added++; }
      onProgress && onProgress(i + 1, list.length);
    }
    return { added, skipped, total: list.length };
  }

  return { hydrate, refreshCloud, localBlobs, get, put, del, clear, count, has, imageFor,
           importFiles, matchFile, buildIndex };
})();

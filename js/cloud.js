/* =====================================================================
   CFP CLOUD — Google identity, durable account data, multi-device sync.

   Local storage remains the instant/offline working copy. Cloudflare D1 is
   the signed-in source of truth, protected by optimistic version checks so
   one browser can never silently overwrite changes made on another.
   ===================================================================== */
const CloudSync = (() => {
  const VERSION_KEY = 'cfp27.cloudVersion';
  const RECOVERY_KEY = 'cfp27.recovery';
  const SAVE_DELAY = 850;
  let user = null;
  let googleClientId = '';
  let cloudAvailable = false;
  let version = 0;
  let updatedAt = 0;
  let dirty = false;
  let saving = false;
  let applying = false;
  let timer = null;
  let conflict = null;
  let googleReady = false;
  let bound = false;
  let channel = null;
  let accountReturnFocus = null;

  const $c = id => document.getElementById(id);

  function viewerMode() {
    return typeof VIEWER !== 'undefined' && VIEWER;
  }

  function emit(state, detail = {}) {
    document.dispatchEvent(new CustomEvent('cfp:cloud', {
      detail: { state, user, version, updatedAt, dirty, ...detail }
    }));
    renderAccount();
  }

  async function api(path, options = {}) {
    const method = options.method || 'GET';
    const headers = new Headers(options.headers || {});
    headers.set('accept', 'application/json');
    if (method !== 'GET' && method !== 'HEAD') headers.set('x-cfp-request', '1');
    const response = await fetch(path, {
      ...options,
      method,
      headers,
      credentials: 'same-origin'
    });
    let body = null;
    try { body = await response.json(); } catch (e) {}
    if (!response.ok) {
      const error = new Error((body && body.error) || `Request failed (${response.status})`);
      error.status = response.status;
      error.body = body;
      throw error;
    }
    return body || {};
  }

  function capture() {
    return {
      schema: 1,
      state: JSON.parse(JSON.stringify(STATE)),
      overrides: JSON.parse(JSON.stringify(OVERRIDES || {})),
      customTeams: typeof customTeams === 'function' ? customTeams() : [],
      history: typeof History !== 'undefined' ? History.all() : [],
      entries: typeof Pickem !== 'undefined' ? Pickem.all() : [],
      clientUpdatedAt: Date.now()
    };
  }

  function recoveryCopy() {
    try {
      const copies = JSON.parse(localStorage.getItem(RECOVERY_KEY) || '[]');
      copies.unshift({ savedAt: Date.now(), snapshot: capture() });
      localStorage.setItem(RECOVERY_KEY, JSON.stringify(copies.slice(0, 3)));
    } catch (e) {}
  }

  function applySnapshot(snapshot) {
    if (!snapshot || snapshot.schema !== 1 || !snapshot.state) return false;
    applying = true;
    try {
      recoveryCopy();
      Object.keys(STATE).forEach(key => {
        if (Object.prototype.hasOwnProperty.call(snapshot.state, key)) {
          STATE[key] = snapshot.state[key];
        }
      });
      if (!Array.isArray(STATE.seeds) || STATE.seeds.length !== 12)
        STATE.seeds = Array(12).fill(null);
      if (!Array.isArray(STATE.out) || STATE.out.length !== 4)
        STATE.out = Array(4).fill(null);
      if (!STATE.results || typeof STATE.results !== 'object') STATE.results = {};

      if (typeof replaceCustomTeams === 'function') replaceCustomTeams(snapshot.customTeams || []);
      OVERRIDES = snapshot.overrides && typeof snapshot.overrides === 'object'
        ? snapshot.overrides : {};
      localStorage.setItem('cfp27.overrides', JSON.stringify(OVERRIDES));
      if (typeof History !== 'undefined') History.replace(snapshot.history || []);
      if (typeof Pickem !== 'undefined') Pickem.replace(snapshot.entries || []);
      localStorage.setItem('cfp27.state', JSON.stringify(STATE));
      return true;
    } finally {
      applying = false;
    }
  }

  async function bootstrap() {
    try {
      const result = await api('/api/bootstrap');
      googleClientId = result.googleClientId || '';
      cloudAvailable = !!result.cloudAvailable;
      user = result.authenticated ? result.user : null;
      if (user && result.data) {
        applySnapshot(result.data.snapshot);
        version = result.data.version || 0;
        updatedAt = result.data.updatedAt || 0;
        localStorage.setItem(VERSION_KEY, String(version));
      } else if (user) {
        version = 0;
        updatedAt = 0;
        dirty = true;
      } else {
        version = 0;
        updatedAt = 0;
      }
      emit(user ? (dirty ? 'pending' : 'saved') : 'local');
      return result;
    } catch (error) {
      cloudAvailable = false;
      emit(navigator.onLine ? 'unavailable' : 'offline');
      return null;
    }
  }

  function schedule() {
    if (applying || !user || viewerMode()) return;
    dirty = true;
    emit(navigator.onLine ? 'saving' : 'offline');
    clearTimeout(timer);
    timer = setTimeout(() => { void flush(); }, SAVE_DELAY);
  }

  async function flush(force = false) {
    if (!user || viewerMode() || (!dirty && !force)) return false;
    if (saving) return false;
    if (!navigator.onLine) { emit('offline'); return false; }
    saving = true;
    clearTimeout(timer);
    emit('saving');
    try {
      const result = await api('/api/account/data', {
        method: 'PUT',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ snapshot: capture(), baseVersion: version, force })
      });
      version = result.version || version + 1;
      updatedAt = result.updatedAt || Date.now();
      dirty = false;
      conflict = null;
      localStorage.setItem(VERSION_KEY, String(version));
      emit('saved');
      if (channel) channel.postMessage({ type: 'saved', version, updatedAt });
      return true;
    } catch (error) {
      if (error.status === 409 && error.body && error.body.data) {
        conflict = error.body.data;
        emit('conflict');
        openConflict();
      } else {
        dirty = true;
        emit(navigator.onLine ? 'error' : 'offline', { message: error.message });
      }
      return false;
    } finally {
      saving = false;
    }
  }

  async function signIn(credential) {
    emit('signing-in');
    try {
      const result = await api('/api/auth/google', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ credential })
      });
      user = result.user;
      if (result.data) {
        applySnapshot(result.data.snapshot);
        version = result.data.version || 0;
        updatedAt = result.data.updatedAt || 0;
        dirty = false;
        localStorage.setItem(VERSION_KEY, String(version));
        emit('saved');
        await LogoStore.refreshCloud();
        toast('Cloud workspace restored');
        setTimeout(() => location.reload(), 550);
      } else {
        version = 0;
        updatedAt = 0;
        dirty = true;
        await flush();
        await migrateLocalLogos();
        emit('saved');
        toast('Your dynasty is now saved to Cloudflare');
      }
      renderAccount();
      return true;
    } catch (error) {
      emit('error', { message: error.message });
      toast(error.message || 'Google sign-in failed');
      return false;
    }
  }

  async function signOut() {
    if (dirty) await flush();
    try { await api('/api/auth/logout', { method: 'POST' }); } catch (e) {}
    user = null;
    version = 0;
    updatedAt = 0;
    dirty = false;
    localStorage.removeItem(VERSION_KEY);
    emit('local');
    if (window.google && google.accounts && google.accounts.id) google.accounts.id.disableAutoSelect();
    toast('Signed out — this device still has a local copy');
  }

  async function deleteAccount() {
    if (!user) return;
    if (!confirm('Delete your cloud account and every cloud save? Your current device copy will remain.')) return;
    if (!confirm('This cannot be undone. Delete the cloud account now?')) return;
    try {
      await api('/api/account', { method: 'DELETE' });
      user = null;
      version = 0;
      updatedAt = 0;
      dirty = false;
      localStorage.removeItem(VERSION_KEY);
      emit('local');
      toast('Cloud account deleted. Local board preserved.');
    } catch (error) { toast(error.message); }
  }

  async function resolveConflict(choice) {
    if (!conflict) return;
    if (choice === 'cloud') {
      applySnapshot(conflict.snapshot);
      version = conflict.version || 0;
      updatedAt = conflict.updatedAt || 0;
      dirty = false;
      localStorage.setItem(VERSION_KEY, String(version));
      conflict = null;
      closeConflict();
      toast('Cloud copy restored');
      setTimeout(() => location.reload(), 450);
      return;
    }
    version = conflict.version || version;
    conflict = null;
    closeConflict();
    dirty = true;
    await flush(true);
    toast('This device is now the cloud copy');
  }

  function openConflict() {
    const modal = $c('mSyncConflict');
    if (modal) modal.classList.add('on');
  }

  function closeConflict() {
    const modal = $c('mSyncConflict');
    if (modal) modal.classList.remove('on');
  }

  function relativeTime(time) {
    if (!time) return 'Not saved yet';
    const seconds = Math.max(0, Math.round((Date.now() - time) / 1000));
    if (seconds < 10) return 'Saved just now';
    if (seconds < 60) return `Saved ${seconds}s ago`;
    const minutes = Math.round(seconds / 60);
    if (minutes < 60) return `Saved ${minutes}m ago`;
    const hours = Math.round(minutes / 60);
    return hours < 24 ? `Saved ${hours}h ago` : new Date(time).toLocaleString();
  }

  function renderAccount() {
    document.querySelectorAll('.account-trigger').forEach(button => {
      button.classList.toggle('signed-in', !!user);
      button.innerHTML = user
        ? `<i class="cloud-dot"></i><span>Cloud saved</span>`
        : `<i class="cloud-icon">☁</i><span>Save & sign in</span>`;
      button.setAttribute('aria-label', user ? `Cloud account for ${user.name || user.email}` : 'Save with Google');
    });
    const signedOut = $c('accountSignedOut');
    const signedIn = $c('accountSignedIn');
    if (signedOut) signedOut.hidden = !!user;
    if (signedIn) signedIn.hidden = !user;
    if (!user) return;
    if ($c('accountName')) $c('accountName').textContent = user.name || 'Commissioner';
    if ($c('accountEmail')) $c('accountEmail').textContent = user.email;
    if ($c('accountAvatar')) {
      $c('accountAvatar').textContent = (user.name || user.email || 'C').trim().charAt(0).toUpperCase();
    }
    if ($c('accountSaveState')) {
      $c('accountSaveState').textContent = conflict ? 'Needs your choice'
        : saving ? 'Saving securely…'
        : dirty ? (navigator.onLine ? 'Changes waiting…' : 'Offline — saved on this device')
        : 'Protected in Cloudflare';
    }
    if ($c('accountLastSaved')) $c('accountLastSaved').textContent = relativeTime(updatedAt);
  }

  async function loadGoogleButton() {
    if (user || googleReady || !googleClientId) return;
    const host = $c('googleSignIn');
    if (!host) return;
    host.textContent = 'Loading secure sign-in…';
    const start = () => {
      if (!window.google || !google.accounts || !google.accounts.id) return;
      google.accounts.id.initialize({
        client_id: googleClientId,
        callback: response => { void signIn(response.credential); },
        auto_select: false,
        cancel_on_tap_outside: true,
        ux_mode: 'popup'
      });
      host.textContent = '';
      google.accounts.id.renderButton(host, {
        type: 'standard', theme: 'filled_black', size: 'large', shape: 'rectangular',
        text: 'continue_with', logo_alignment: 'left', width: Math.min(360, host.clientWidth || 360)
      });
      googleReady = true;
    };
    if (window.google && google.accounts) return start();
    const script = document.createElement('script');
    script.src = 'https://accounts.google.com/gsi/client';
    script.async = true;
    script.onload = start;
    script.onerror = () => { host.textContent = 'Google sign-in could not load. Check your connection.'; };
    document.head.appendChild(script);
  }

  function openAccount() {
    const modal = $c('mAccount');
    if (!modal) return;
    accountReturnFocus = document.activeElement;
    modal.classList.add('on');
    renderAccount();
    setTimeout(() => {
      const target = user ? $c('accountSyncNow') : $c('mAccountClose');
      if (target) target.focus();
    }, 0);
    if (!user) {
      if (!cloudAvailable || !googleClientId) {
        const host = $c('googleSignIn');
        if (host) host.textContent = 'Cloud sign-in is temporarily unavailable.';
      } else void loadGoogleButton();
    }
  }

  function closeAccount() {
    const modal = $c('mAccount');
    if (modal) modal.classList.remove('on');
    if (accountReturnFocus && typeof accountReturnFocus.focus === 'function') accountReturnFocus.focus();
    accountReturnFocus = null;
  }

  async function logoChanged(id, blob) {
    if (!user || !blob || blob.size > 1024 * 1024) return false;
    const type = String(blob.type || '').toLowerCase();
    if (!['image/png', 'image/jpeg', 'image/webp'].includes(type)) return false;
    const response = await fetch(`/api/logos/${encodeURIComponent(id)}`, {
      method: 'PUT', credentials: 'same-origin',
      headers: { 'content-type': type, 'x-cfp-request': '1' }, body: blob
    });
    if (!response.ok) throw new Error('Logo cloud upload failed');
    return true;
  }

  async function logoDeleted(id) {
    if (!user) return false;
    const response = await fetch(`/api/logos/${encodeURIComponent(id)}`, {
      method: 'DELETE', credentials: 'same-origin', headers: { 'x-cfp-request': '1' }
    });
    return response.ok;
  }

  async function clearLogos() {
    if (!user) return false;
    const result = await api('/api/logos');
    for (const logo of (result.logos || [])) await logoDeleted(logo.team_id);
    return true;
  }

  async function migrateLocalLogos() {
    if (!user || typeof LogoStore.localBlobs !== 'function') return;
    const logos = await LogoStore.localBlobs();
    for (let i = 0; i < logos.length; i += 3) {
      await Promise.all(logos.slice(i, i + 3).map(x => logoChanged(x.id, x.blob).catch(() => false)));
    }
    await LogoStore.refreshCloud();
  }

  function bind() {
    if (bound) return;
    bound = true;
    document.addEventListener('cfp:state', schedule);
    document.addEventListener('cfp:local-change', schedule);
    document.querySelectorAll('.account-trigger').forEach(button => button.onclick = openAccount);
    if ($c('mAccountClose')) $c('mAccountClose').onclick = closeAccount;
    if ($c('accountSyncNow')) $c('accountSyncNow').onclick = () => { dirty = true; void flush(true); };
    if ($c('accountSignOut')) $c('accountSignOut').onclick = () => { void signOut(); };
    if ($c('accountDelete')) $c('accountDelete').onclick = () => { void deleteAccount(); };
    if ($c('conflictCloud')) $c('conflictCloud').onclick = () => { void resolveConflict('cloud'); };
    if ($c('conflictLocal')) $c('conflictLocal').onclick = () => { void resolveConflict('local'); };
    window.addEventListener('online', () => { if (dirty) void flush(); else emit(user ? 'saved' : 'local'); });
    window.addEventListener('offline', () => emit('offline'));
    document.addEventListener('visibilitychange', () => {
      if (document.visibilityState === 'hidden' && dirty) void flush();
    });
    document.addEventListener('keydown', event => {
      if (event.key === 'Escape' && $c('mAccount')?.classList.contains('on')) closeAccount();
    });
    if ('BroadcastChannel' in window) {
      channel = new BroadcastChannel('cfp27-cloud');
      channel.onmessage = event => {
        if (!user || !event.data || event.data.type !== 'saved' || event.data.version <= version) return;
        conflict = { version: event.data.version, updatedAt: event.data.updatedAt };
        emit(dirty ? 'conflict' : 'newer-copy');
        if (dirty) openConflict();
      };
    }
    renderAccount();
    if (user && dirty) setTimeout(() => { void flush(); }, 100);
  }

  return {
    bootstrap, bind, flush, openAccount, logoChanged, logoDeleted, clearLogos,
    isSignedIn: () => !!user,
    account: () => user,
    state: () => ({ version, updatedAt, dirty, saving, conflict })
  };
})();

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
  let publishedEvents = [];
  let leagueRooms = [];
  let pendingJoinCode = '';
  let lastLeagueNotice = '';
  let leagueSocket = null;
  let leagueReconnectTimer = null;
  let leagueReconnectDelay = 5000;
  let liveMembers = [];
  const leagueDetailCache = new Map();

  const $c = id => document.getElementById(id);

  function viewerMode() {
    return typeof VIEWER !== 'undefined' && VIEWER;
  }

  function closeLeagueLive() {
    clearTimeout(leagueReconnectTimer);
    leagueReconnectTimer = null;
    const socket = leagueSocket;
    leagueSocket = null;
    liveMembers = [];
    if (socket && socket.readyState < WebSocket.CLOSING) socket.close(1000, 'Room changed');
  }

  function handleLeagueLive(data) {
    if (!data || typeof data !== 'object') return;
    if (data.type === 'presence') {
      liveMembers = Array.isArray(data.members) ? data.members.filter(member =>
        member && typeof member.id === 'string' && typeof member.name === 'string'
      ).slice(0, 32) : [];
      renderLeagues();
      return;
    }
    if (data.type !== 'board_published' || !Number.isInteger(data.version)) return;
    const roomId = typeof STATE !== 'undefined' ? STATE.leagueRoomId : '';
    const room = leagueRooms.find(item => item.id === roomId);
    if (room && data.version > Number(room.version || 0)) {
      room.version = data.version;
      room.updatedBy = String(data.actor || 'Commissioner');
      leagueDetailCache.delete(room.id);
    }
    if (roomId && data.version > Number(STATE.leagueRoomVersion || 0)) {
      const notice = `${roomId}:${data.version}`;
      if (lastLeagueNotice !== notice) {
        lastLeagueNotice = notice;
        toast(`${data.actor || 'A commissioner'} published board v${data.version}`);
      }
    }
    renderLeagues();
  }

  function connectLeagueLive() {
    const roomId = user && typeof STATE !== 'undefined' ? STATE.leagueRoomId : '';
    if (!roomId || viewerMode() || !navigator.onLine) {
      closeLeagueLive();
      return;
    }
    if (leagueSocket && leagueSocket.roomId === roomId && leagueSocket.readyState < WebSocket.CLOSING) return;
    closeLeagueLive();
    const protocol = location.protocol === 'https:' ? 'wss:' : 'ws:';
    const socket = new WebSocket(`${protocol}//${location.host}/api/leagues/${encodeURIComponent(roomId)}/live`);
    socket.roomId = roomId;
    leagueSocket = socket;
    socket.onopen = () => { leagueReconnectDelay = 5000; };
    socket.onmessage = event => {
      try { handleLeagueLive(JSON.parse(event.data)); } catch (error) {}
    };
    socket.onclose = () => {
      if (leagueSocket !== socket) return;
      leagueSocket = null;
      liveMembers = [];
      renderLeagues();
      leagueReconnectTimer = setTimeout(connectLeagueLive, leagueReconnectDelay);
      leagueReconnectDelay = Math.min(60000, leagueReconnectDelay * 2);
    };
    socket.onerror = () => {};
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
      if (!Array.isArray(STATE.projectionPicks) || STATE.projectionPicks.length !== 11)
        STATE.projectionPicks = Array(11).fill(null);
      else STATE.projectionPicks = STATE.projectionPicks.map(x => x === 0 || x === 1 ? x : null);
      if (!STATE.projectionScores || typeof STATE.projectionScores !== 'object' ||
          Array.isArray(STATE.projectionScores)) STATE.projectionScores = {};

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
      await Promise.all([loadEvents(), loadLeagues()]);
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
    closeLeagueLive();
    user = null;
    publishedEvents = [];
    leagueRooms = [];
    leagueDetailCache.clear();
    version = 0;
    updatedAt = 0;
    dirty = false;
    localStorage.removeItem(VERSION_KEY);
    emit('local');
    if (window.google && google.accounts && google.accounts.id) google.accounts.id.disableAutoSelect();
    toast('Signed out — this device still has a local copy');
  }

  async function signOutOtherDevices() {
    if (!user || !await CFPFoundation.actions.confirm({
      title: 'Sign out other devices?',
      message: 'Every other session connected to this cloud account will be signed out. This device will stay signed in.',
      confirmLabel: 'Sign out others',
    })) return;
    const button = $c('accountSignOutOthers');
    if (button) button.disabled = true;
    try {
      const result = await api('/api/auth/logout-others', { method: 'POST' });
      const count = Number(result.revoked || 0);
      toast(count ? `${count} other session${count === 1 ? '' : 's'} signed out` : 'No other signed-in devices found');
    } catch (error) {
      toast(error.message || 'Could not sign out other devices');
    } finally {
      if (button) button.disabled = false;
    }
  }

  async function downloadAccountExport() {
    if (!user) return;
    const button = $c('accountExport');
    const original = button ? button.textContent : '';
    if (button) { button.disabled = true; button.textContent = 'Preparing export...'; }
    try {
      await flush();
      const response = await fetch('/api/account/export', {
        method: 'GET', credentials: 'same-origin', headers: { accept: 'application/json' }
      });
      if (!response.ok) {
        let message = `Export failed (${response.status})`;
        try { message = (await response.json()).error || message; } catch (error) {}
        throw new Error(message);
      }
      const blob = await response.blob();
      const href = URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = href;
      link.download = `cfp-cloud-export-${new Date().toISOString().slice(0, 10)}.json`;
      document.body.appendChild(link);
      link.click();
      link.remove();
      setTimeout(() => URL.revokeObjectURL(href), 1000);
      toast('Account export downloaded');
    } catch (error) {
      toast(error.message || 'Could not download account data');
    } finally {
      if (button) { button.disabled = false; button.textContent = original || 'Download my data'; }
    }
  }

  async function deleteAccount() {
    if (!user) return;
    if (!await CFPFoundation.actions.confirm({
      title: 'Permanently delete the cloud account?',
      message: 'This cannot be undone. Every cloud save, uploaded logo, published event, and shared league owned by this account will be deleted. The current device copy remains local.',
      confirmLabel: 'Delete cloud account',
    })) return;
    try {
      await api('/api/account', { method: 'DELETE' });
      closeLeagueLive();
      user = null;
      publishedEvents = [];
      leagueRooms = [];
      leagueDetailCache.clear();
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

  function offerGoogleButton() {
    if (user || googleReady || !googleClientId) return;
    const host = $c('googleSignIn');
    if (!host || host.querySelector('.google-launch')) return;
    host.textContent = '';
    const button = document.createElement('button');
    button.type = 'button';
    button.className = 'google-launch';
    button.innerHTML = '<i>G</i><span><b>Continue with Google</b><small>Loads Google sign-in only when you choose it</small></span>';
    button.onclick = () => { void loadGoogleButton(); };
    host.appendChild(button);
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
      } else offerGoogleButton();
    } else void Promise.all([loadEvents(), loadLeagues()]);
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

  async function loadEvents() {
    if (!user) { publishedEvents = []; renderEvents(); return []; }
    try {
      const result = await api('/api/events');
      publishedEvents = Array.isArray(result.events) ? result.events : [];
      renderEvents();
      return publishedEvents;
    } catch (error) {
      const host = $c('accountEventsList');
      if (host) host.textContent = 'Published broadcasts could not be loaded.';
      return [];
    }
  }

  async function publishEvent(payload, eventId = '') {
    if (!user) throw new Error('Sign in with Google to publish a permanent event');
    await flush();
    const publish = id => api('/api/events', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ payload, eventId: id || undefined })
    });
    let result;
    try {
      result = await publish(eventId);
    } catch (error) {
      if (!eventId || error.status !== 404) throw error;
      result = await publish('');
    }
    await loadEvents();
    return result.event;
  }

  async function revokeEvent(eventId) {
    if (!user) return false;
    await api(`/api/events/${encodeURIComponent(eventId)}`, { method: 'DELETE' });
    if (typeof STATE !== 'undefined' && STATE.cloudEventId === eventId) {
      STATE.cloudEventId = '';
      STATE.shareCode = '';
      if (typeof persist === 'function') persist();
    }
    await loadEvents();
    return true;
  }

  function eventButton(label, className, action) {
    const button = document.createElement('button');
    button.type = 'button';
    button.className = className;
    button.textContent = label;
    button.onclick = action;
    return button;
  }

  async function copyText(value, message) {
    try {
      await navigator.clipboard.writeText(value);
      toast(message);
    } catch (error) {
      const field = $c('shareUrl');
      if (field) { field.value = value; field.select(); }
      toast('Link ready — press Ctrl+C to copy');
    }
  }

  function renderEvents() {
    const host = $c('accountEventsList');
    const count = $c('accountEventCount');
    if (!host) return;
    host.innerHTML = '';
    if (count) count.textContent = String(publishedEvents.length);
    if (!publishedEvents.length) {
      const empty = document.createElement('p');
      empty.className = 'account-event-empty';
      empty.textContent = 'No permanent broadcasts yet. Finish the field, then publish from Create League Link.';
      host.appendChild(empty);
      return;
    }
    publishedEvents.forEach(event => {
      const card = document.createElement('article');
      card.className = 'account-event';
      const copy = document.createElement('div');
      copy.className = 'account-event-copy';
      const title = document.createElement('b');
      title.textContent = event.title || 'Selection Night';
      const meta = document.createElement('span');
      meta.textContent = `${event.league} · ${event.season} · ${event.views} view${event.views === 1 ? '' : 's'} · v${event.version}`;
      copy.append(title, meta);
      const actions = document.createElement('div');
      actions.className = 'account-event-actions';
      actions.append(
        eventButton('Open', 'event-action', () => window.open(event.url, '_blank', 'noopener')),
        eventButton('Copy', 'event-action', () => { void copyText(event.url, 'Permanent event link copied'); }),
        eventButton('Activity', 'event-action', async () => {
          let activity = card.querySelector('.account-event-log');
          if (activity) { activity.remove(); return; }
          activity = document.createElement('div');
          activity.className = 'account-event-log';
          activity.textContent = 'Loading activity…';
          card.appendChild(activity);
          try {
            const result = await api(`/api/events/${encodeURIComponent(event.id)}/activity`);
            activity.innerHTML = '';
            (result.activity || []).slice(0, 8).forEach(item => {
              const row = document.createElement('span');
              row.textContent = `${String(item.type).replace(/_/g, ' ')} · ${relativeTime(item.at)}`;
              activity.appendChild(row);
            });
          } catch (error) { activity.textContent = 'Activity could not be loaded.'; }
        }),
        eventButton('Revoke', 'event-action danger', async () => {
          if (!await CFPFoundation.actions.confirm({
            title: `Revoke ${event.title || 'this event'}?`,
            message: 'Its public link will stop working immediately.',
            confirmLabel: 'Revoke event',
          })) return;
          try { await revokeEvent(event.id); toast('Public event revoked'); }
          catch (error) { toast(error.message || 'Could not revoke event'); }
        })
      );
      card.append(copy, actions);
      host.appendChild(card);
    });
  }

  function rememberLeague(league) {
    if (!league || !league.id) return;
    if (league.workspace || league.memberList) leagueDetailCache.set(league.id, league);
    const at = leagueRooms.findIndex(item => item.id === league.id);
    const summary = { ...(at >= 0 ? leagueRooms[at] : {}), ...league };
    delete summary.workspace;
    delete summary.memberList;
    if (at >= 0) leagueRooms[at] = summary;
    else leagueRooms.unshift(summary);
  }

  async function loadLeagues() {
    if (!user) {
      leagueRooms = [];
      leagueDetailCache.clear();
      renderLeagues();
      return [];
    }
    try {
      const result = await api('/api/leagues');
      leagueRooms = Array.isArray(result.leagues) ? result.leagues : [];
      const active = typeof STATE !== 'undefined'
        ? leagueRooms.find(item => item.id === STATE.leagueRoomId) : null;
      if (active && active.version > Number(STATE.leagueRoomVersion || 0)) {
        const notice = `${active.id}:${active.version}`;
        if (lastLeagueNotice !== notice) {
          lastLeagueNotice = notice;
          toast(`${active.name} board v${active.version} is ready to load`);
        }
      }
      renderLeagues();
      return leagueRooms;
    } catch (error) {
      const host = $c('accountLeaguesList');
      if (host) host.textContent = 'League rooms could not be loaded.';
      return [];
    }
  }

  function setActiveLeague(league) {
    if (typeof STATE === 'undefined' || !league) return;
    STATE.leagueRoomId = league.id;
    STATE.leagueRoomVersion = league.version;
    localStorage.setItem('cfp27.state', JSON.stringify(STATE));
    if (typeof persist === 'function') persist();
    connectLeagueLive();
  }

  async function createLeagueRoom() {
    if (!user) return openAccount();
    const name = String(STATE.league || '').trim() || 'Online Dynasty';
    const season = String(STATE.season || '').trim() || String(new Date().getFullYear());
    const button = $c('accountCreateLeague');
    if (button) button.disabled = true;
    try {
      await flush();
      const result = await api('/api/leagues', {
        method: 'POST', headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ name, season, workspace: capture() })
      });
      rememberLeague(result.league);
      setActiveLeague(result.league);
      renderLeagues();
      toast(`${name} league room created`);
    } catch (error) {
      toast(error.message || 'Could not create league room');
    } finally {
      if (button) button.disabled = false;
    }
  }

  async function joinLeagueRoom() {
    if (!user) return openAccount();
    const input = $c('accountJoinCode');
    const code = String((input && input.value) || pendingJoinCode || '').trim().toUpperCase();
    if (!/^[A-HJ-NP-Z2-9]{8}$/.test(code)) {
      toast('Enter the eight-character invite code');
      return;
    }
    const button = $c('accountJoinLeague');
    if (button) button.disabled = true;
    try {
      const result = await api('/api/leagues/join', {
        method: 'POST', headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ code })
      });
      rememberLeague(result.league);
      pendingJoinCode = '';
      if (input) input.value = '';
      if (/^\/join\//.test(location.pathname)) history.replaceState({}, '', '/');
      renderLeagues();
      toast(`Joined ${result.league.name}`);
    } catch (error) {
      toast(error.message || 'Could not join league room');
    } finally {
      if (button) button.disabled = false;
    }
  }

  async function fetchLeague(leagueId, fresh = false) {
    if (!fresh && leagueDetailCache.has(leagueId)) return leagueDetailCache.get(leagueId);
    const result = await api(`/api/leagues/${encodeURIComponent(leagueId)}`);
    leagueDetailCache.set(leagueId, result.league);
    rememberLeague(result.league);
    return result.league;
  }

  async function loadLeagueBoard(leagueId) {
    try {
      const league = await fetchLeague(leagueId, true);
      if (!league.workspace) throw new Error('This league board is unavailable');
      if (!await CFPFoundation.actions.confirm({
        title: `Load ${league.name} board v${league.version}?`,
        message: 'The shared workspace will replace this device view. A recovery copy of this device will be kept.',
        confirmLabel: 'Load shared board',
        danger: false,
      })) return;
      if (!applySnapshot(league.workspace)) throw new Error('The shared board could not be restored');
      setActiveLeague(league);
      toast(`${league.name} board loaded`);
      closeAccount();
      setTimeout(() => location.reload(), 450);
    } catch (error) { toast(error.message || 'Could not load league board'); }
  }

  async function publishLeagueBoard(leagueId) {
    const summary = leagueRooms.find(item => item.id === leagueId);
    if (!summary || !['owner', 'admin'].includes(summary.role)) return;
    try {
      const latest = await fetchLeague(leagueId, true);
      if (!await CFPFoundation.actions.confirm({
        title: `Publish ${latest.name} board v${latest.version + 1}?`,
        message: 'Members will be able to load this device state immediately.',
        confirmLabel: 'Publish board',
        danger: false,
      })) return;
      await flush();
      const result = await api(`/api/leagues/${encodeURIComponent(leagueId)}/workspace`, {
        method: 'PUT', headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ workspace: capture(), baseVersion: latest.version })
      });
      leagueDetailCache.set(leagueId, result.league);
      rememberLeague(result.league);
      setActiveLeague(result.league);
      renderLeagues();
      toast(`League board v${result.league.version} published`);
    } catch (error) {
      if (error.status === 409) leagueDetailCache.delete(leagueId);
      toast(error.message || 'Could not publish league board');
    }
  }

  async function removeLeague(league) {
    const owner = league.role === 'owner';
    const message = owner
      ? `Delete ${league.name}? The shared board, invite code and member access will be permanently removed.`
      : `Leave ${league.name}? You will need a new invite to rejoin.`;
    if (!await CFPFoundation.actions.confirm({
      title: owner ? `Delete ${league.name}?` : `Leave ${league.name}?`,
      message,
      confirmLabel: owner ? 'Delete league' : 'Leave league',
    })) return;
    try {
      if (owner) await api(`/api/leagues/${encodeURIComponent(league.id)}`, { method: 'DELETE' });
      else await api(`/api/leagues/${encodeURIComponent(league.id)}/members/${encodeURIComponent(user.id)}`, { method: 'DELETE' });
      leagueDetailCache.delete(league.id);
      if (typeof STATE !== 'undefined' && STATE.leagueRoomId === league.id) {
        STATE.leagueRoomId = '';
        STATE.leagueRoomVersion = 0;
        if (typeof persist === 'function') persist();
      }
      await loadLeagues();
      toast(owner ? 'League room deleted' : 'You left the league room');
    } catch (error) { toast(error.message || 'Could not update league membership'); }
  }

  async function rotateLeagueInvite(league) {
    if (league.role !== 'owner') return;
    if (!await CFPFoundation.actions.confirm({
      title: `Rotate the ${league.name} invite?`,
      message: 'The old invite code will stop working immediately.',
      confirmLabel: 'Rotate invite',
    })) return;
    try {
      const result = await api(`/api/leagues/${encodeURIComponent(league.id)}/invite`, { method: 'POST' });
      leagueDetailCache.set(league.id, result.league);
      rememberLeague(result.league);
      renderLeagues();
      await copyText(result.league.inviteUrl, 'New invite copied; the old code is disabled');
    } catch (error) { toast(error.message || 'Could not rotate invite'); }
  }

  async function changeMember(league, member, role) {
    try {
      if (role === 'remove') {
        if (!await CFPFoundation.actions.confirm({
          title: `Remove ${member.name}?`,
          message: `${member.name} will lose access to ${league.name}.`,
          confirmLabel: 'Remove member',
        })) return;
        await api(`/api/leagues/${encodeURIComponent(league.id)}/members/${encodeURIComponent(member.id)}`, { method: 'DELETE' });
      } else {
        await api(`/api/leagues/${encodeURIComponent(league.id)}/members/${encodeURIComponent(member.id)}`, {
          method: 'PATCH', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ role })
        });
      }
      leagueDetailCache.delete(league.id);
      await loadLeagues();
      toast(role === 'remove' ? `${member.name} removed` : `${member.name} is now ${role}`);
    } catch (error) { toast(error.message || 'Could not update member'); }
  }

  async function showLeagueActivity(card, league) {
    let host = card.querySelector('.league-activity');
    if (host) { host.remove(); return; }
    host = document.createElement('div');
    host.className = 'account-event-log league-activity';
    host.textContent = 'Loading league activity…';
    card.appendChild(host);
    try {
      const result = await api(`/api/leagues/${encodeURIComponent(league.id)}/activity`);
      host.innerHTML = '';
      (result.activity || []).slice(0, 12).forEach(item => {
        const row = document.createElement('span');
        row.textContent = `${item.actor} · ${String(item.type).replace(/_/g, ' ')} · ${relativeTime(item.at)}`;
        host.appendChild(row);
      });
    } catch (error) { host.textContent = 'League activity could not be loaded.'; }
  }

  async function toggleLeagueMembers(card, league) {
    const existing = card.querySelector('.league-members');
    if (existing) { existing.remove(); return; }
    const host = document.createElement('div');
    host.className = 'league-members';
    host.textContent = 'Loading members…';
    card.appendChild(host);
    try {
      const detail = await fetchLeague(league.id, true);
      host.innerHTML = '';
      (detail.memberList || []).forEach(member => {
        const row = document.createElement('div');
        row.className = 'league-member';
        const initial = document.createElement('i');
        initial.textContent = (member.name || 'M').charAt(0).toUpperCase();
        const copy = document.createElement('span');
        const name = document.createElement('b');
        name.textContent = member.name;
        const role = document.createElement('small');
        role.textContent = member.role;
        copy.append(name, role);
        row.append(initial, copy);
        if (detail.role === 'owner' && member.role !== 'owner') {
          const actions = document.createElement('div');
          actions.className = 'league-member-actions';
          actions.append(
            eventButton(member.role === 'admin' ? 'Make member' : 'Make admin', 'event-action', () => {
              void changeMember(detail, member, member.role === 'admin' ? 'member' : 'admin');
            }),
            eventButton('Remove', 'event-action danger', () => { void changeMember(detail, member, 'remove'); })
          );
          row.appendChild(actions);
        }
        host.appendChild(row);
      });
    } catch (error) { host.textContent = 'Members could not be loaded.'; }
  }

  function renderLeagues() {
    const host = $c('accountLeaguesList');
    const count = $c('accountLeagueCount');
    if (!host) return;
    host.innerHTML = '';
    if (count) count.textContent = String(leagueRooms.length);
    if (!leagueRooms.length) {
      const empty = document.createElement('p');
      empty.className = 'account-event-empty';
      empty.textContent = 'No league rooms yet. Create one from this board or enter an invite code.';
      host.appendChild(empty);
      return;
    }
    leagueRooms.forEach(league => {
      const card = document.createElement('article');
      const active = typeof STATE !== 'undefined' && STATE.leagueRoomId === league.id;
      const updateAvailable = active && league.version > Number(STATE.leagueRoomVersion || 0);
      card.className = 'account-league' + (active ? ' active' : '') + (updateAvailable ? ' newer' : '');
      const top = document.createElement('div');
      top.className = 'account-league-top';
      const copy = document.createElement('div');
      copy.className = 'account-event-copy';
      const title = document.createElement('b');
      title.textContent = league.name;
      const meta = document.createElement('span');
      meta.textContent = `${league.season} · ${league.members} member${league.members === 1 ? '' : 's'} · board v${league.version}`;
      if (updateAvailable) meta.textContent += ' - UPDATE READY';
      copy.append(title, meta);
      const role = document.createElement('em');
      role.className = `league-role ${league.role}`;
      role.textContent = league.role;
      top.appendChild(copy);
      if (active) {
        const presence = document.createElement('span');
        presence.className = `league-presence${liveMembers.length ? ' online' : ''}`;
        const dot = document.createElement('i');
        const label = document.createElement('b');
        label.textContent = liveMembers.length ? `${liveMembers.length} live` : 'Connecting';
        presence.append(dot, label);
        presence.title = liveMembers.length
          ? liveMembers.map(member => `${member.name} (${member.role})`).join(', ')
          : 'Opening the live league desk';
        top.appendChild(presence);
      }
      top.appendChild(role);
      const actions = document.createElement('div');
      actions.className = 'account-event-actions';
      actions.append(
        eventButton(updateAvailable ? `Load new v${league.version}` : 'Load board', updateAvailable ? 'event-action update-ready' : 'event-action', () => { void loadLeagueBoard(league.id); }),
        eventButton('Copy invite', 'event-action', () => { void copyText(league.inviteUrl, 'League invite copied'); }),
        eventButton('Members', 'event-action', () => { void toggleLeagueMembers(card, league); }),
        eventButton('Activity', 'event-action', () => { void showLeagueActivity(card, league); })
      );
      if (['owner', 'admin'].includes(league.role)) {
        actions.insertBefore(eventButton('Publish board', 'event-action publish-board', () => {
          void publishLeagueBoard(league.id);
        }), actions.children[1]);
      }
      if (league.role === 'owner') {
        actions.appendChild(eventButton('Rotate invite', 'event-action', () => {
          void rotateLeagueInvite(league);
        }));
      }
      actions.appendChild(eventButton(league.role === 'owner' ? 'Delete room' : 'Leave', 'event-action danger', () => {
        void removeLeague(league);
      }));
      card.append(top, actions);
      host.appendChild(card);
    });
  }

  function openJoin(code) {
    pendingJoinCode = String(code || '').trim().toUpperCase();
    const input = $c('accountJoinCode');
    if (input) input.value = pendingJoinCode;
    const notice = $c('accountInviteNotice');
    if (notice) {
      notice.hidden = !pendingJoinCode || !!user;
      notice.textContent = pendingJoinCode
        ? `You were invited to league room ${pendingJoinCode}. Sign in to review and join it.` : '';
    }
    openAccount();
    if (user) setTimeout(() => $c('accountJoinLeague')?.focus(), 50);
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
    if ($c('accountSignOutOthers')) $c('accountSignOutOthers').onclick = () => { void signOutOtherDevices(); };
    if ($c('accountExport')) $c('accountExport').onclick = () => { void downloadAccountExport(); };
    if ($c('accountDelete')) $c('accountDelete').onclick = () => { void deleteAccount(); };
    if ($c('accountCreateLeague')) $c('accountCreateLeague').onclick = () => { void createLeagueRoom(); };
    if ($c('accountJoinLeague')) $c('accountJoinLeague').onclick = () => { void joinLeagueRoom(); };
    if ($c('accountJoinCode')) {
      $c('accountJoinCode').oninput = event => {
        event.target.value = event.target.value.toUpperCase().replace(/[^A-HJ-NP-Z2-9]/g, '').slice(0, 8);
      };
      $c('accountJoinCode').onkeydown = event => {
        if (event.key === 'Enter') { event.preventDefault(); void joinLeagueRoom(); }
      };
    }
    if ($c('conflictCloud')) $c('conflictCloud').onclick = () => { void resolveConflict('cloud'); };
    if ($c('conflictLocal')) $c('conflictLocal').onclick = () => { void resolveConflict('local'); };
    window.addEventListener('online', () => {
      if (dirty) void flush(); else emit(user ? 'saved' : 'local');
      if (user) connectLeagueLive();
    });
    window.addEventListener('offline', () => emit('offline'));
    document.addEventListener('visibilitychange', () => {
      if (document.visibilityState === 'hidden' && dirty) void flush();
      if (document.visibilityState === 'visible' && user && typeof STATE !== 'undefined' && STATE.leagueRoomId) {
        void loadLeagues();
      }
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
    if (user) connectLeagueLive();
    setInterval(() => {
      if (user && navigator.onLine && document.visibilityState === 'visible' &&
          typeof STATE !== 'undefined' && STATE.leagueRoomId) void loadLeagues();
    }, 60000);
    const invite = location.pathname.match(/^\/join\/([A-HJ-NP-Z2-9]{8})\/?$/i);
    if (invite) setTimeout(() => openJoin(invite[1]), 150);
  }

  return {
    bootstrap, bind, flush, openAccount, logoChanged, logoDeleted, clearLogos,
    publishEvent, loadEvents, revokeEvent, loadLeagues, openJoin,
    isSignedIn: () => !!user,
    account: () => user,
    state: () => ({ version, updatedAt, dirty, saving, conflict })
  };
})();

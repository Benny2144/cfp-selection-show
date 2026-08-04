/* =====================================================================
   APPLICATION FOUNDATION

   Routing, view lifecycle, modal focus, live announcements, validation,
   and recoverable actions live here so product screens share one contract.
   This file deliberately has no dependency on STATE or the bracket engine.
   ===================================================================== */
globalThis.CFPFoundation = (() => {
  'use strict';

  const ROUTES = Object.freeze({
    home: '/hub',
    room: '/committee',
    final: '/bracket',
    results: '/results',
    pickem: '/projections',
    history: '/history',
    show: '/show',
  });
  const TITLES = Object.freeze({
    home: 'Postseason Hub',
    room: 'Committee Room',
    final: 'CFP Bracket',
    results: 'Playoff Results',
    pickem: 'Playoff Projections',
    history: 'Dynasty History',
    show: 'Selection Show',
  });
  const SCREEN_BY_ROUTE = Object.freeze(Object.fromEntries(
    Object.entries(ROUTES).map(([screen, route]) => [route, screen]),
  ));

  function normalizePath(pathname) {
    const raw = String(pathname || '/').split(/[?#]/)[0];
    if (raw === '/') return '/hub';
    return raw.length > 1 ? raw.replace(/\/+$/, '') : raw;
  }

  function screenForPath(pathname) {
    const path = normalizePath(pathname);
    if (/^\/watch\/[A-HJ-NP-Z2-9]{10}$/i.test(path)) return 'show';
    if (/^\/join\/[A-HJ-NP-Z2-9]{8}$/i.test(path)) return 'home';
    return SCREEN_BY_ROUTE[path] || 'home';
  }

  const routeForScreen = screen => ROUTES[screen] || ROUTES.home;
  const titleForScreen = (screen, league) =>
    `${TITLES[screen] || TITLES.home} | ${league || 'CFP Dynasty Studio'}`;

  function validationMessage(issue) {
    if (!issue) return '';
    if (issue.code === 'field-incomplete')
      return `${issue.missing} seed${issue.missing === 1 ? '' : 's'} still need a team.`;
    if (issue.code === 'automatic-bids')
      return `${issue.missing} more conference champion${issue.missing === 1 ? '' : 's'} must be marked for the five automatic bids.`;
    if (issue.code === 'duplicate-champion')
      return `${issue.conference} has multiple conference champions marked.`;
    return issue.message || 'The playoff configuration is incomplete.';
  }

  function validatePlayoff({ seeds = [], champions = [] } = {}) {
    const filled = seeds.filter(Boolean).length;
    const issues = [];
    if (filled < 12) issues.push({ code: 'field-incomplete', missing: 12 - filled });
    if (champions.length < 5)
      issues.push({ code: 'automatic-bids', missing: 5 - champions.length });

    const byConference = new Map();
    champions.forEach(champion => {
      const conference = String(champion?.conf || '').trim() || 'One conference';
      byConference.set(conference, (byConference.get(conference) || 0) + 1);
    });
    byConference.forEach((count, conference) => {
      if (count > 1) issues.push({ code: 'duplicate-champion', conference, count });
    });
    return {
      ready: issues.length === 0,
      filled,
      champions: champions.length,
      issues,
      reasons: issues.map(validationMessage),
    };
  }

  function setScreenState(screen, active) {
    if (!screen) return;
    screen.classList?.toggle?.('active', !!active);
    screen.hidden = !active;
    screen.inert = !active;
    screen.setAttribute?.('aria-hidden', active ? 'false' : 'true');
  }

  class ScreenRegistry {
    constructor(root) {
      this.root = root;
      this.records = new Map();
      this.ready = false;
    }

    init() {
      if (this.ready || !this.root?.querySelectorAll) return;
      this.root.querySelectorAll('.screen').forEach(screen => {
        const marker = this.root.createComment(`screen:${screen.id}`);
        screen.parentNode.insertBefore(marker, screen);
        this.records.set(screen.id, { screen, marker });
      });
      this.ready = true;
    }

    activate(name, { focus = true } = {}) {
      if (!this.ready) return false;
      const target = this.records.get(name);
      if (!target) return false;
      this.records.forEach(({ screen, marker }, id) => {
        const active = id === name;
        if (active && !screen.isConnected)
          marker.parentNode.insertBefore(screen, marker.nextSibling);
        setScreenState(screen, active);
        if (!active && screen.isConnected) screen.remove();
      });
      if (focus && name !== 'show') {
        const heading = target.screen.querySelector('h1, [data-route-heading]') || target.screen;
        if (!heading.hasAttribute('tabindex')) heading.setAttribute('tabindex', '-1');
        requestAnimationFrame(() => heading.focus({ preventScroll: true }));
      }
      return true;
    }
  }

  function restoreFocus(trigger, fallback) {
    const target = trigger?.isConnected && typeof trigger.focus === 'function'
      ? trigger : fallback;
    if (!target || typeof target.focus !== 'function') return false;
    target.focus({ preventScroll: true });
    return true;
  }

  class ModalManager {
    constructor(root) {
      this.root = root;
      this.openModal = null;
      this.trigger = null;
      this.background = new Map();
      this.observer = null;
    }

    init() {
      if (!this.root?.querySelectorAll) return;
      this.root.querySelectorAll('.modal').forEach(modal => this.sync(modal));
      this.observer = new MutationObserver(records => records.forEach(record => {
        if (record.target.classList?.contains('modal')) this.sync(record.target);
      }));
      this.root.querySelectorAll('.modal').forEach(modal =>
        this.observer.observe(modal, { attributes: true, attributeFilter: ['class'] }));
      this.root.addEventListener('keydown', event => this.onKeydown(event), true);
    }

    sync(modal) {
      const open = modal.classList.contains('on');
      modal.inert = !open;
      modal.setAttribute('aria-hidden', open ? 'false' : 'true');
      if (open && this.openModal !== modal) this.didOpen(modal);
      else if (!open && this.openModal === modal) this.didClose(modal);
    }

    didOpen(modal) {
      this.trigger = this.trigger || this.root.activeElement;
      this.openModal = modal;
      this.background.clear();
      [...this.root.body.children].forEach(child => {
        if (child === modal || child.id === 'appLiveStatus' || child.id === 'undoBar') return;
        this.background.set(child, {
          inert: !!child.inert,
          hadAriaHidden: child.hasAttribute('aria-hidden'),
          ariaHidden: child.getAttribute('aria-hidden'),
        });
        child.inert = true;
        child.setAttribute('aria-hidden', 'true');
      });
      const first = this.focusables(modal)[0] || modal.querySelector('[role="dialog"], .card, .modal-card') || modal;
      if (!first.hasAttribute('tabindex')) first.setAttribute('tabindex', '-1');
      requestAnimationFrame(() => first.focus({ preventScroll: true }));
    }

    didClose(modal) {
      this.background.forEach((state, child) => {
        child.inert = state.inert;
        if (state.hadAriaHidden) child.setAttribute('aria-hidden', state.ariaHidden);
        else child.removeAttribute('aria-hidden');
      });
      this.background.clear();
      const fallback = this.root.querySelector('.screen.active h1, #navBrand');
      restoreFocus(this.trigger, fallback);
      this.trigger = null;
      this.openModal = null;
      if (modal.id === 'mConfirm' && confirmResolver) {
        const done = confirmResolver;
        confirmResolver = null;
        done(false);
      }
      this.root.dispatchEvent(new CustomEvent('cfp:modal-closed', { detail: { modal } }));
    }

    focusables(modal) {
      return [...modal.querySelectorAll(
        'button:not([disabled]), [href], input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])',
      )].filter(node => !node.hidden && node.getAttribute('aria-hidden') !== 'true');
    }

    onKeydown(event) {
      const modal = this.openModal;
      if (!modal) return;
      if (event.key === 'Escape' && !modal.classList.contains('conflict-modal')) {
        event.preventDefault();
        this.close(modal);
        return;
      }
      if (event.key !== 'Tab') return;
      const items = this.focusables(modal);
      if (!items.length) { event.preventDefault(); return; }
      const first = items[0], last = items[items.length - 1];
      if (event.shiftKey && this.root.activeElement === first) {
        event.preventDefault(); last.focus();
      } else if (!event.shiftKey && this.root.activeElement === last) {
        event.preventDefault(); first.focus();
      }
    }

    open(modal, trigger = this.root.activeElement) {
      const node = typeof modal === 'string' ? this.root.querySelector(modal) : modal;
      if (!node) return false;
      this.trigger = trigger;
      node.classList.add('on');
      this.sync(node);
      return true;
    }

    close(modal = this.openModal) {
      const node = typeof modal === 'string' ? this.root.querySelector(modal) : modal;
      if (!node) return false;
      node.classList.remove('on');
      this.sync(node);
      return true;
    }
  }

  let modalManager = null;
  let confirmResolver = null;
  let undoTimer = 0;
  let undoCallback = null;
  const panelTriggers = new WeakMap();
  const managedHidden = new WeakSet();
  let hiddenObserver = null;

  function syncHiddenState(node) {
    if (!node || !('hidden' in node)) return;
    if (node.hidden) {
      if (!node.inert) {
        node.inert = true;
        managedHidden.add(node);
      }
    } else if (managedHidden.has(node)) {
      node.inert = false;
      managedHidden.delete(node);
    }
  }

  function setPanelOpen(panel, open, trigger = document.activeElement) {
    const node = typeof panel === 'string' ? document.querySelector(panel) : panel;
    if (!node) return false;
    if (open) {
      panelTriggers.set(node, trigger);
      node.classList.add('on');
      node.inert = false;
      node.setAttribute('aria-hidden', 'false');
      const close = node.querySelector('[data-panel-close], button, [href], [tabindex]:not([tabindex="-1"])');
      requestAnimationFrame(() => close?.focus?.({ preventScroll: true }));
    } else {
      node.classList.remove('on');
      node.inert = true;
      node.setAttribute('aria-hidden', 'true');
      restoreFocus(panelTriggers.get(node), document.querySelector('.screen.active h1, #navBrand'));
      panelTriggers.delete(node);
    }
    return true;
  }

  function announce(message, priority = 'polite') {
    if (typeof document === 'undefined' || !message) return;
    const region = document.getElementById('appLiveStatus');
    if (!region) return;
    region.setAttribute('aria-live', priority);
    region.textContent = '';
    requestAnimationFrame(() => { region.textContent = String(message); });
  }

  function confirmAction({
    title = 'Confirm action',
    message = 'Are you sure?',
    confirmLabel = 'Continue',
    cancelLabel = 'Cancel',
    danger = true,
    trigger = typeof document !== 'undefined' ? document.activeElement : null,
  } = {}) {
    if (typeof document === 'undefined') return Promise.resolve(false);
    const modal = document.getElementById('mConfirm');
    if (!modal) return Promise.resolve(false);
    if (confirmResolver) confirmResolver(false);
    document.getElementById('confirmTitle').textContent = title;
    document.getElementById('confirmMessage').textContent = message;
    const accept = document.getElementById('confirmAccept');
    const cancel = document.getElementById('confirmCancel');
    accept.textContent = confirmLabel;
    cancel.textContent = cancelLabel;
    accept.classList.toggle('danger', !!danger);
    modalManager.open(modal, trigger);
    return new Promise(resolve => {
      confirmResolver = resolve;
      const finish = answer => {
        if (!confirmResolver) return;
        const done = confirmResolver;
        confirmResolver = null;
        modalManager.close(modal);
        done(answer);
      };
      accept.onclick = () => finish(true);
      cancel.onclick = () => finish(false);
    });
  }

  function showUndo(message, callback, timeout = 8000) {
    if (typeof document === 'undefined') return;
    const bar = document.getElementById('undoBar');
    if (!bar) return;
    clearTimeout(undoTimer);
    undoCallback = typeof callback === 'function' ? callback : null;
    bar.querySelector('span').textContent = message;
    bar.hidden = false;
    bar.inert = false;
    bar.classList.add('on');
    const button = bar.querySelector('button');
    button.onclick = () => {
      clearTimeout(undoTimer);
      const undo = undoCallback;
      undoCallback = null;
      bar.classList.remove('on');
      bar.hidden = true;
      bar.inert = true;
      if (undo) undo();
      announce('Action undone');
    };
    undoTimer = setTimeout(() => {
      undoCallback = null;
      bar.classList.remove('on');
      bar.hidden = true;
      bar.inert = true;
    }, timeout);
  }

  const cloneData = value => {
    if (typeof structuredClone === 'function') return structuredClone(value);
    return JSON.parse(JSON.stringify(value));
  };

  async function runConfirmed(confirmFn, actionFn) {
    if (typeof confirmFn !== 'function' || typeof actionFn !== 'function') return false;
    if (!await confirmFn()) return false;
    await actionFn();
    return true;
  }

  const router = {
    commit(screen, { replace = false, preservePath = false } = {}) {
      if (typeof window === 'undefined') return;
      document.title = titleForScreen(screen, globalThis.STATE?.league);
      if (preservePath) return;
      const route = routeForScreen(screen);
      const current = normalizePath(location.pathname);
      if (current === route) return;
      history[replace ? 'replaceState' : 'pushState']({ screen }, '', route);
    },
    screenFromLocation() {
      return typeof location === 'undefined' ? 'home' : screenForPath(location.pathname);
    },
  };

  let screens = null;
  function init(root = typeof document !== 'undefined' ? document : null) {
    if (!root || screens) return;
    screens = new ScreenRegistry(root);
    modalManager = new ModalManager(root);
    modalManager.init();
    root.querySelectorAll('[hidden]').forEach(syncHiddenState);
    hiddenObserver = new MutationObserver(records => records.forEach(record => syncHiddenState(record.target)));
    hiddenObserver.observe(root.documentElement, {
      subtree: true,
      attributes: true,
      attributeFilter: ['hidden'],
    });
  }
  function initScreens() { screens?.init(); }
  function activateScreen(name, options) { return screens?.activate(name, options) || false; }

  return Object.freeze({
    ROUTES,
    TITLES,
    normalizePath,
    screenForPath,
    routeForScreen,
    titleForScreen,
    validatePlayoff,
    validationMessage,
    setScreenState,
    ScreenRegistry,
    restoreFocus,
    ModalManager,
    init,
    initScreens,
    activateScreen,
    router,
    modal: {
      open: (node, trigger) => modalManager?.open(node, trigger),
      close: node => modalManager?.close(node),
    },
    panel: {
      open: (node, trigger) => setPanelOpen(node, true, trigger),
      close: node => setPanelOpen(node, false),
      toggle: (node, trigger) => {
        const target = typeof node === 'string' ? document.querySelector(node) : node;
        return target ? setPanelOpen(target, !target.classList.contains('on'), trigger) : false;
      },
    },
    actions: { confirm: confirmAction, undo: showUndo, clone: cloneData, runConfirmed },
    live: { announce },
  });
})();

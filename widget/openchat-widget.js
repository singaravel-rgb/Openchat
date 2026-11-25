(function () {
  console.log('[OpenChat Widget] Script loaded.');
  if (window.__openchatWidgetLoaded) {
    console.log('[OpenChat Widget] Already loaded, skipping duplicate execution.');
    return;
  }
  window.__openchatWidgetLoaded = true;

  var currentScript = document.currentScript || (function () {
    var scripts = document.getElementsByTagName('script');
    return scripts[scripts.length - 1];
  })();
  var backendBase = (window.OpenChatConfig && (window.OpenChatConfig.backendUrl || window.OpenChatConfig.apiUrl)) ||
    (currentScript && currentScript.getAttribute('data-backend-url')) ||
    (typeof window !== 'undefined' && window.location && window.location.origin ? window.location.origin : "http://localhost:8000");
  backendBase = backendBase.replace(/\/+$/, '');
  backendBase = backendBase.replace(/\/api\/v1(?:\/widget)?$/, '');
  var API_BASE = backendBase + "/api/v1/widget";
  var STORAGE_KEY = "openchat_widget_session";

  var DEFAULT_CONFIG = {
    widget_title: "OpenChat Support",
    brand_name: "OpenChat",
    logo_url: null,
    primary_color: "#2563eb",
    launcher_position: "bottom-right",
    welcome_message: "Hello! Welcome to OpenChat Support. How can we help you today?",
    greeting_text: "Start a conversation with our team.",
    widget_visibility: true,
    widget_availability: true,
    hide_launcher_on_help_page: false,
    show_agent_avatar: true,
    require_email: false
  };

  var state = {
    config: DEFAULT_CONFIG,
    backendConfigLoaded: false,
    sessionToken: null,
    expiresAt: null,
    conversations: [],
    activeId: null,
    detail: null,
    open: false,
    minimized: false,
    loading: false,
    sending: false,
    error: null,
    info: null,
    poll: null,
    retryCount: 0,
    offline: !navigator.onLine,
    activeTab: 'chat',
    selectedAttachment: null,
    showEmojiPicker: false,
    emojiCategory: 'all',
    emojiSearch: ''
  };
  window.__openchatState = state;

  var EMOJI_CATEGORIES = {
    smileys: [
      { char: '😀', name: 'grinning face' },
      { char: '😃', name: 'smiling face' },
      { char: '😄', name: 'smiling face open mouth' },
      { char: '😁', name: 'grinning face smiling eyes' },
      { char: '😆', name: 'laughing face' },
      { char: '😅', name: 'sweat smile' },
      { char: '😂', name: 'joy tears' },
      { char: '🤣', name: 'rofl' },
      { char: '😊', name: 'smiling eyes' },
      { char: '😇', name: 'halo angel' },
      { char: '🙂', name: 'slightly smiling' },
      { char: '😉', name: 'wink' },
      { char: '😌', name: 'relieved' },
      { char: '😍', name: 'heart eyes' },
      { char: '🥰', name: 'smiling hearts' },
      { char: '😘', name: 'kiss' },
      { char: '😋', name: 'yum delicious' },
      { char: '😛', name: 'tongue' },
      { char: '😜', name: 'wink tongue' },
      { char: '🤔', name: 'thinking' },
      { char: '🤫', name: 'shush quiet' },
      { char: '🤐', name: 'zipper' },
      { char: '😎', name: 'cool sunglasses' },
      { char: '🤓', name: 'nerd' },
      { char: '🧐', name: 'monocle' },
      { char: '😐', name: 'neutral' },
      { char: '😑', name: 'expressionless' },
      { char: '😶', name: 'no mouth' },
      { char: '😏', name: 'smirk' },
      { char: '😒', name: 'unamused' },
      { char: '🙄', name: 'rolling eyes' },
      { char: '😬', name: 'grimace' },
      { char: '😔', name: 'pensive sad' },
      { char: '😴', name: 'sleep' },
      { char: '😷', name: 'mask sick' },
      { char: '🤒', name: 'thermometer fever' },
      { char: '🥺', name: 'pleading eyes' },
      { char: '😢', name: 'crying' },
      { char: '😭', name: 'sob loud crying' },
      { char: '😱', name: 'scream shock' },
      { char: '😤', name: 'steam nose proud' },
      { char: '😡', name: 'rage angry' },
      { char: '😠', name: 'mad angry' }
    ],
    gestures: [
      { char: '👍', name: 'thumbs up ok yes' },
      { char: '👎', name: 'thumbs down no' },
      { char: '👌', name: 'ok hand' },
      { char: '✌️', name: 'peace victory' },
      { char: '🤞', name: 'crossed fingers hope' },
      { char: '🤟', name: 'love you' },
      { char: '🤘', name: 'rock on horns' },
      { char: '🤙', name: 'call me' },
      { char: '👈', name: 'point left' },
      { char: '👉', name: 'point right' },
      { char: '👆', name: 'point up' },
      { char: '👇', name: 'point down' },
      { char: '☝️', name: 'one point' },
      { char: '👏', name: 'applause clapping' },
      { char: '🙌', name: 'raising hands praise' },
      { char: '👐', name: 'open hands' },
      { char: '🤲', name: 'palms together' },
      { char: '🤝', name: 'handshake deal' },
      { char: '🙏', name: 'praying folded hands thank you' },
      { char: '✍️', name: 'writing hand' },
      { char: '💅', name: 'nail polish' },
      { char: '🤳', name: 'selfie' },
      { char: '💪', name: 'muscle strong flex' },
      { char: '👋', name: 'wave hello bye' }
    ],
    hearts: [
      { char: '❤️', name: 'red heart love' },
      { char: '🧡', name: 'orange heart' },
      { char: '💛', name: 'yellow heart' },
      { char: '💚', name: 'green heart' },
      { char: '💙', name: 'blue heart' },
      { char: '💜', name: 'purple heart' },
      { char: '🖤', name: 'black heart' },
      { char: '🤍', name: 'white heart' },
      { char: '🤎', name: 'brown heart' },
      { char: '💔', name: 'broken heart' },
      { char: '❣️', name: 'heart exclamation' },
      { char: '💕', name: 'two hearts' },
      { char: '💞', name: 'revolving hearts' },
      { char: '💓', name: 'beating heart' },
      { char: '💗', name: 'growing heart' },
      { char: '💖', name: 'sparkle heart' },
      { char: '💘', name: 'heart arrow cupid' },
      { char: '💝', name: 'gift heart' }
    ],
    objects: [
      { char: '🎉', name: 'party popper celebrate' },
      { char: '🎊', name: 'confetti' },
      { char: '🎈', name: 'balloon' },
      { char: '🎁', name: 'gift present' },
      { char: '🏆', name: 'trophy winner' },
      { char: '🥇', name: 'first place gold' },
      { char: '⚽️', name: 'soccer football' },
      { char: '🏀', name: 'basketball' },
      { char: '☕️', name: 'coffee tea' },
      { char: '🍻', name: 'beer cheer' },
      { char: '🍕', name: 'pizza food' },
      { char: '📦', name: 'package box delivery' },
      { char: '💳', name: 'credit card payment' },
      { char: '💡', name: 'lightbulb idea' },
      { char: '📌', name: 'pushpin note' },
      { char: '📎', name: 'paperclip attach' },
      { char: '🔥', name: 'fire hot lit' },
      { char: '✨', name: 'sparkles magic shiny' },
      { char: '⭐', name: 'star favorite' },
      { char: '💯', name: 'hundred percent perfect' },
      { char: '⚠️', name: 'warning alert' },
      { char: 'ℹ️', name: 'info information' },
      { char: '❓', name: 'question mark help' },
      { char: '❗️', name: 'exclamation mark' },
      { char: '✅', name: 'check mark done yes' },
      { char: '❌', name: 'cross mark cancel no' }
    ]
  };

  function getFilteredEmojis(cat, search) {
    var all = [];
    if (!cat || cat === 'all') {
      Object.keys(EMOJI_CATEGORIES).forEach(function (k) {
        all = all.concat(EMOJI_CATEGORIES[k]);
      });
    } else if (EMOJI_CATEGORIES[cat]) {
      all = EMOJI_CATEGORIES[cat];
    }
    if (!search || !search.trim()) return all;
    var q = search.toLowerCase().trim();
    return all.filter(function (e) {
      return e.name.toLowerCase().indexOf(q) !== -1 || e.char.indexOf(q) !== -1;
    });
  }

  var shadowRoot = null;
  var rootHostEl = null;

  var diagnostics = {
    status: 'script_loaded',
    scriptLoaded: true,
    initStarted: false,
    configRequested: false,
    configReceived: false,
    sessionRequested: false,
    sessionReady: false,
    launcherRendered: false,
    launcherVisible: false,
    isInsideViewport: false,
    viewport: { width: window.innerWidth, height: window.innerHeight },
    launcherRect: null,
    shadowDomActive: false,
    lastError: null,
    logs: []
  };
  window.__openchatDiagnostics = diagnostics;

  function diag(stage, data) {
    var msg = '[OpenChat Widget] ' + stage + (data ? ' ' + JSON.stringify(data) : '');
    console.log(msg);
    diagnostics.logs.push({ time: new Date().toISOString(), stage: stage, data: data });
    if (window.__onOpenChatDiagUpdate && typeof window.__onOpenChatDiagUpdate === 'function') {
      try { window.__onOpenChatDiagUpdate(diagnostics); } catch (e) { }
    }
  }

  function logError(stage, err) {
    var errMsg = err ? (err.message || String(err)) : 'Unknown error';
    console.error('[OpenChat Widget Error] Failure at ' + stage + ':', err);
    if (err && err.stack) {
      console.error(err.stack);
    }
    diagnostics.lastError = { stage: stage, message: errMsg, stack: err ? err.stack : null };
    diagnostics.logs.push({ time: new Date().toISOString(), stage: 'ERROR:' + stage, error: errMsg });
    if (window.__onOpenChatDiagUpdate && typeof window.__onOpenChatDiagUpdate === 'function') {
      try { window.__onOpenChatDiagUpdate(diagnostics); } catch (e) { }
    }
  }

  function $(sel, root) {
    if (root) return root.querySelector(sel);
    if (shadowRoot) return shadowRoot.querySelector(sel);
    return document.querySelector(sel);
  }
  function $$(sel, root) {
    if (root) return root.querySelectorAll(sel);
    if (shadowRoot) return shadowRoot.querySelectorAll(sel);
    return document.querySelectorAll(sel);
  }

  function esc(s) { return String(s == null ? '' : s).replace(/[&<>"]/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]; }); }
  function fmtTime(iso) { try { var d = new Date(iso); return d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }); } catch (e) { return ''; } }
  function nowId() { return 'c_' + Date.now() + '_' + Math.random().toString(36).slice(2, 8); }

  function saveSession() {
    try {
      if (state.sessionToken) {
        localStorage.setItem(STORAGE_KEY, JSON.stringify({ token: state.sessionToken, expiresAt: state.expiresAt }));
      }
    } catch (e) { }
  }

  function loadSession() {
    try {
      var v = JSON.parse(localStorage.getItem(STORAGE_KEY) || 'null');
      if (v && v.token) {
        state.sessionToken = v.token;
        state.expiresAt = v.expiresAt;
      }
    } catch (e) { }
  }

  function clearSession() {
    try { localStorage.removeItem(STORAGE_KEY); } catch (e) { }
    state.sessionToken = null;
    state.expiresAt = null;
  }

  function headers(json) {
    var h = {};
    if (json) h['Content-Type'] = 'application/json';
    if (state.sessionToken) h['X-Widget-Session'] = state.sessionToken;
    return h;
  }

  async function api(path, opts) {
    opts = opts || {};
    opts.headers = Object.assign({}, headers(opts.json), opts.headers || {});
    var res = await fetch(API_BASE + path, opts);
    var text = await res.text();
    var data = null;
    try { data = text ? JSON.parse(text) : null; } catch (e) { data = { detail: text }; }
    if (!res.ok) {
      var msg = (data && data.detail) || (res.status === 429 ? 'Too many requests. Please slow down.' : 'Request failed (' + res.status + ')');
      var err = new Error(msg);
      err.status = res.status;
      err.data = data;
      throw err;
    }
    return data;
  }

  function isHelpPage(cfg) {
    if (!cfg || !cfg.hide_launcher_on_help_page) return false;
    try {
      var p = location.pathname || '';
      return p === '/help' || p.indexOf('/help/') === 0;
    } catch (e) { return false; }
  }

  function getHostRoot() {
    if (rootHostEl && shadowRoot) return rootHostEl;
    rootHostEl = document.getElementById('openchat-widget-root');
    if (!rootHostEl) {
      rootHostEl = document.createElement('div');
      rootHostEl.id = 'openchat-widget-root';
      rootHostEl.style.cssText = 'position:fixed!important;bottom:0!important;right:0!important;width:0!important;height:0!important;overflow:visible!important;z-index:2147483000!important;margin:0!important;padding:0!important;border:none!important;pointer-events:none!important;';
      var parent = document.body || document.documentElement;
      if (!parent) return null;
      parent.appendChild(rootHostEl);
    }
    if (!shadowRoot) {
      shadowRoot = rootHostEl.shadowRoot || rootHostEl.attachShadow({ mode: 'open' });
      window.__openchatShadowRoot = shadowRoot;
      window.__openchatWidgetRoot = rootHostEl;
      diagnostics.shadowDomActive = true;
      diag('Shadow DOM created and attached to host container.');
    }
    return rootHostEl;
  }

  function injectStyles(primary) {
    if (!shadowRoot) return;
    var existing = shadowRoot.querySelector('#openchat-widget-style');
    if (existing) {
      return;
    }
    var st = document.createElement('style');
    st.id = 'openchat-widget-style';
    st.textContent = ':host { all: initial; } ' +
      '.ocw-root { font-family: system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif; pointer-events: none; } ' +
      '.ocw-launcher { position: fixed !important; bottom: 24px !important; width: 60px !important; height: 60px !important; border-radius: 9999px !important; border: none !important; cursor: pointer !important; box-shadow: 0 4px 14px rgba(0,0,0,0.25), 0 0 0 1px rgba(0,0,0,0.08) !important; display: flex !important; align-items: center !important; justify-content: center !important; color: #fff !important; transition: transform .18s cubic-bezier(.4, 0, .2, 1), box-shadow .18s ease !important; outline: none !important; z-index: 2147483001 !important; pointer-events: auto !important; padding: 0 !important; margin: 0 !important; box-sizing: border-box !important; opacity: 1 !important; visibility: visible !important; transform: none !important; } ' +
      '.ocw-launcher:hover { transform: scale(1.08) !important; box-shadow: 0 8px 24px rgba(0,0,0,0.32) !important; } ' +
      '.ocw-launcher.ocw-right { right: 24px !important; left: auto !important; } ' +
      '.ocw-launcher.ocw-left { left: 24px !important; right: auto !important; } ' +
      '.ocw-launcher svg { width: 28px !important; height: 28px !important; stroke: currentColor !important; fill: none !important; display: block !important; pointer-events: none !important; } ' +
      '.ocw-panel { position: fixed !important; bottom: 96px !important; width: 380px !important; max-width: calc(100vw - 32px) !important; height: 580px !important; max-height: calc(100vh - 120px) !important; background: #fff !important; border: 1px solid #e2e8f0 !important; border-radius: 16px !important; box-shadow: 0 20px 48px rgba(0,0,0,0.22) !important; display: flex !important; flex-direction: column !important; overflow: hidden !important; z-index: 2147483002 !important; pointer-events: auto !important; box-sizing: border-box !important; font-family: inherit !important; } ' +
      '.ocw-panel.ocw-right { right: 24px !important; left: auto !important; } ' +
      '.ocw-panel.ocw-left { left: 24px !important; right: auto !important; } ' +
      '.ocw-header { padding: 14px 16px; color: #fff; display: flex; align-items: center; justify-content: space-between; box-sizing: border-box; } ' +
      '.ocw-title { font-weight: 600; font-size: 15px; } .ocw-sub { font-size: 12px; opacity: .92; margin-top: 2px; } ' +
      '.ocw-body { flex: 1; overflow-y: auto; background: #f8fafc; padding: 14px; display: flex; flex-direction: column; box-sizing: border-box; } ' +
      '.ocw-footer { padding: 12px; border-top: 1px solid #e5e7eb; background: #fff; box-sizing: border-box; } ' +
      '.ocw-input { width: 100%; min-height: 44px; max-height: 100px; resize: none; border: 1px solid #cbd5e1; border-radius: 10px; padding: 8px 12px; font: inherit; box-sizing: border-box; } ' +
      '.ocw-row { display: flex; gap: 8px; margin-top: 8px; } ' +
      '.ocw-btn { border: none; border-radius: 10px; padding: 8px 14px; cursor: pointer; font: inherit; font-weight: 500; font-size: 13px; } ' +
      '.ocw-btn-primary { color: #fff; } .ocw-btn-ghost { background: #e2e8f0; color: #0f172a; } ' +
      '.ocw-msg { margin: 8px 0; display: flex; flex-direction: column; } ' +
      '.ocw-msg.ocw-user { align-items: flex-end; } .ocw-msg.ocw-agent,.ocw-msg.ocw-ai,.ocw-msg.ocw-system { align-items: flex-start; } ' +
      '.ocw-bubble { max-width: 85%; padding: 9px 12px; border-radius: 12px; font-size: 13px; line-height: 1.4; white-space: pre-wrap; word-break: break-word; } ' +
      '.ocw-user .ocw-bubble { color: #fff; border-bottom-right-radius: 3px; } ' +
      '.ocw-agent .ocw-bubble,.ocw-ai .ocw-bubble,.ocw-system .ocw-bubble { background: #fff; border: 1px solid #e2e8f0; color: #0f172a; border-bottom-left-radius: 3px; } ' +
      '.ocw-meta { font-size: 10px; color: #64748b; margin-top: 3px; padding: 0 2px; } ' +
      '.ocw-list button { width: 100%; text-align: left; background: #fff; border: 1px solid #e2e8f0; border-radius: 10px; padding: 12px; margin-bottom: 8px; cursor: pointer; transition: border-color .15s ease; font: inherit; } ' +
      '.ocw-list button:hover { border-color: #94a3b8; } ' +
      '.ocw-badge { display: inline-block; font-size: 10px; padding: 2px 7px; border-radius: 9999px; background: #e2e8f0; color: #334155; margin-left: 6px; font-weight: 600; } ' +
      '.ocw-error { background: #fef2f2; color: #991b1b; border: 1px solid #fecaca; padding: 10px; border-radius: 8px; font-size: 12px; margin-bottom: 10px; line-height: 1.4; } ' +
      '.ocw-empty { color: #64748b; font-size: 13px; text-align: center; padding: 32px 12px; } ' +
      '.ocw-topbar { display: flex; gap: 6px; align-items: center; } ' +
      '.ocw-iconbtn { background: rgba(255,255,255,.2); border: none; color: #fff; width: 30px; height: 30px; border-radius: 8px; cursor: pointer; display: flex; align-items: center; justify-content: center; font-size: 14px; } ' +
      '.ocw-iconbtn:hover { background: rgba(255,255,255,.3); } ' +
      '@media (max-width: 480px) { .ocw-panel { right: 8px !important; left: 8px !important; bottom: 84px !important; width: auto !important; height: 75vh !important; } .ocw-launcher.ocw-right { right: 16px !important; bottom: 16px !important; } .ocw-launcher.ocw-left { left: 16px !important; bottom: 16px !important; } }';
    shadowRoot.appendChild(st);
  }

  function setError(msg) { state.error = msg; render(); }
  function clearError() { state.error = null; }

  function getHostIdentityToken() {
    try {
      if (window.OpenChatHostIdentityToken && typeof window.OpenChatHostIdentityToken === 'string') return window.OpenChatHostIdentityToken;
      if (typeof window.OpenChatHostIdentityTokenFn === 'function') {
        var t = window.OpenChatHostIdentityTokenFn();
        if (t && typeof t === 'string') return t;
      }
      var tag = document.querySelector('script[data-openchat-host-token]');
      if (tag && tag.getAttribute('data-openchat-host-token')) return tag.getAttribute('data-openchat-host-token');
    } catch (e) { }
    return null;
  }

  async function createSession() {
    diag('Session creation started.');
    diagnostics.sessionRequested = true;
    var body = { page_url: location.href, is_help_page: (location.pathname === '/help' || (location.pathname || '').indexOf('/help/') === 0) };
    var hostToken = getHostIdentityToken();
    if (hostToken) body.host_identity_token = hostToken;
    var s = await api('/session', { method: 'POST', json: true, body: JSON.stringify(body) });
    state.sessionToken = s.session_token;
    state.expiresAt = s.expires_at;
    saveSession();
    state.conversations = [];
    diagnostics.sessionReady = true;
    diagnostics.sessionToken = s.session_token;
    diag('Session creation completed. is_guest=' + s.is_guest);
  }

  async function ensureSession() {
    loadSession();
    if (!state.sessionToken) {
      await createSession();
      return;
    }
    try {
      diag('Restoring existing session...');
      var info = await api('/session');
      state.conversations = info.conversations || [];
      state.expiresAt = info.expires_at;
      saveSession();
      diagnostics.sessionReady = true;
      diag('Existing session restored. Conversations=' + state.conversations.length);
    } catch (e) {
      if (e.status === 401) {
        clearSession();
        await createSession();
      } else {
        throw e;
      }
    }
  }

  async function loadConversations() {
    try {
      state.conversations = await api('/conversations');
      render();
    } catch (e) {
      logError('loadConversations', e);
    }
  }

  async function loadDetail(id) {
    state.loading = true;
    state.activeId = id;
    render();
    try {
      var shouldMarkRead = Boolean(state.open && !state.minimized && state.activeTab === 'chat');
      state.detail = await api('/conversations/' + id + (shouldMarkRead ? '?mark_read=true' : ''));
      if (shouldMarkRead) {
        api('/conversations/' + id + '/read', { method: 'POST' }).catch(function () { });
      }
      await loadConversations();
      clearError();
    } catch (e) {
      logError('loadDetail', e);
      setError(e.message || 'Failed to load conversation');
    } finally {
      state.loading = false;
      render();
    }
  }

  function getWidgetStatusBadge(status) {
    var s = (status || 'open').toLowerCase();
    var label = 'Open';
    var style = 'background:#e0f2fe;color:#0369a1;border:1px solid #bae6fd;'; // Open: Sky/Cyan
    if (s === 'resolved') {
      label = 'Resolved';
      style = 'background:#dcfce7;color:#166534;border:1px solid #bbf7d0;'; // Resolved: Green
    } else if (s === 'pending' || s === 'waiting_on_customer' || s === 'on_hold') {
      label = 'Pending';
      style = 'background:#fef3c7;color:#92400e;border:1px solid #fde68a;'; // Pending: Amber/Orange
    } else if (s === 'assigned' || s === 'human_handling' || s === 'ai_handling') {
      label = 'Active';
      style = 'background:#dbeafe;color:#1e40af;border:1px solid #bfdbfe;'; // Active: Blue (do not expose internal AI/assignment status)
    } else if (s === 'closed') {
      label = 'Closed';
      style = 'background:#f1f5f9;color:#475569;border:1px solid #e2e8f0;'; // Closed: Slate/Gray
    }
    return '<span style="font-size:10px;padding:2px 8px;border-radius:9999px;font-weight:600;' + style + '">' + esc(label) + '</span>';
  }

  async function startConversation(initialMessage) {
    if (state.startingChat || state.loading) return;
    state.startingChat = true;
    state.loading = true;
    state.activeTab = 'chat';
    render();
    try {
      var body = { subject: 'Website chat' };
      if (initialMessage) {
        body.initial_message = initialMessage;
        body.client_message_id = 'client_' + nowId();
      }
      var d = await api('/conversations', { method: 'POST', json: true, body: JSON.stringify(body) });
      state.detail = d;
      state.activeId = d.id;
      await loadConversations();
      clearError();
    } catch (e) {
      logError('startConversation', e);
      setError(e.message || 'Failed to start conversation');
    } finally {
      state.startingChat = false;
      state.loading = false;
      render();
    }
  }

  async function sendMessage(explicitContent, explicitClientId) {
    if (!state.detail || state.sending) return;
    var ta = $('#ocw-text');
    var content = (explicitContent !== undefined && explicitContent !== null) ? String(explicitContent).trim() : (ta ? ta.value.trim() : '');
    if (!content) return;

    var clientId = explicitClientId || ('client_' + nowId());
    state.sending = true;
    clearError();

    // Check if message already in detail
    var existingIdx = -1;
    for (var i = 0; i < (state.detail.messages || []).length; i++) {
      var m = state.detail.messages[i];
      if (m.client_message_id === clientId || m.id === 'tmp_' + clientId || m.id === clientId) {
        existingIdx = i;
        break;
      }
    }

    var optimistic = {
      id: 'tmp_' + clientId,
      sender_type: 'customer',
      message_type: 'text',
      content: content,
      created_at: new Date().toISOString(),
      delivery_status: 'sending',
      client_message_id: clientId,
      failed_content: content
    };

    if (existingIdx >= 0) {
      state.detail.messages[existingIdx] = optimistic;
    } else {
      state.detail.messages.push(optimistic);
    }

    if (ta && explicitContent === undefined) {
      ta.value = '';
      state.draft = '';
    }

    render();

    try {
      var msg = await api('/conversations/' + state.detail.id + '/messages', {
        method: 'POST',
        json: true,
        body: JSON.stringify({ content: content, client_message_id: clientId })
      });
      state.detail.messages = state.detail.messages.map(function (m) {
        if (m.client_message_id === clientId || m.id === optimistic.id || m.id === 'tmp_' + clientId) {
          return Object.assign({}, msg, { delivery_status: 'delivered' });
        }
        return m;
      });
      state.sending = false;
      await loadDetail(state.detail.id);
    } catch (e) {
      logError('sendMessage', e);
      state.detail.messages = state.detail.messages.map(function (m) {
        if (m.client_message_id === clientId || m.id === optimistic.id || m.id === 'tmp_' + clientId) {
          return Object.assign({}, m, { delivery_status: 'failed', failed_content: content });
        }
        return m;
      });
      state.sending = false;
      setError((e && e.message) ? e.message : 'Failed to send message. Please click Retry.');
      render();
      return;
    }
    state.sending = false;
    render();
  }

  async function requestHuman() {
    if (!state.detail) return;
    clearError();
    try {
      var r = await api('/conversations/' + state.detail.id + '/request-human', { method: 'POST' });
      await loadDetail(state.detail.id);
      if (r && r.message) {
        state.info = r.message;
        render();
        setTimeout(function () { state.info = null; render(); }, 4000);
      }
    } catch (e) {
      logError('requestHuman', e);
      setError(e.message || 'Failed to request human support');
    }
  }

  function startPolling() {
    stopPolling();
    state.poll = setInterval(async function () {
      if (!state.open || state.minimized) return;
      try {
        if (state.detail && state.activeId) {
          var shouldMark = Boolean(state.open && !state.minimized && state.activeTab === 'chat');
          var d = await api('/conversations/' + state.activeId + (shouldMark ? '?mark_read=true' : ''));
          // Preserve any in-flight or failed optimistic messages
          var localPending = (state.detail.messages || []).filter(function (m) {
            return m.delivery_status === 'sending' || m.delivery_status === 'failed';
          });
          var confirmedClientIds = {};
          (d.messages || []).forEach(function (m) {
            if (m.client_message_id) confirmedClientIds[m.client_message_id] = true;
          });
          var unconfirmed = localPending.filter(function (m) {
            return !confirmedClientIds[m.client_message_id];
          });
          d.messages = (d.messages || []).concat(unconfirmed);
          state.detail = d;
        }
        await loadConversations();
        if (state.offline) { state.offline = false; }
        render();
      } catch (e) {
        if (e && e.status === 401) {
          try { clearSession(); await createSession(); } catch (_) { }
        }
      }
    }, 3000);
  }

  function stopPolling() {
    if (state.poll) { clearInterval(state.poll); state.poll = null; }
  }

  function render() {
    diag('Render function called. Open=' + state.open);
    var host = getHostRoot();
    if (!host || !shadowRoot) {
      console.warn('[OpenChat Widget] Cannot render: Shadow host container not ready.');
      return;
    }

    var cfg = state.config || DEFAULT_CONFIG;
    var pos = (cfg.launcher_position === 'bottom-left') ? 'ocw-left' : 'ocw-right';
    var primary = cfg.primary_color || '#2563eb';

    var hide = isHelpPage(cfg) && !state.open;
    var contentDiv = shadowRoot.querySelector('#ocw-content');
    if (!contentDiv) {
      contentDiv = document.createElement('div');
      contentDiv.id = 'ocw-content';
      contentDiv.className = 'ocw-root';
      shadowRoot.appendChild(contentDiv);
    }

    if (hide) {
      contentDiv.innerHTML = '';
      diagnostics.launcherRendered = false;
      diagnostics.launcherVisible = false;
      diagnostics.isInsideViewport = false;
      return;
    }

    var existingInput = shadowRoot.querySelector('#ocw-text');
    var savedDraft = existingInput ? existingInput.value : (state.draft || '');
    var isInputFocused = existingInput && (shadowRoot.activeElement === existingInput || document.activeElement === existingInput);
    var cursorStart = existingInput ? existingInput.selectionStart : 0;
    var cursorEnd = existingInput ? existingInput.selectionEnd : 0;

    var totalUnread = 0;
    if (state.conversations && state.conversations.length) {
      state.conversations.forEach(function (c) { if (c.unread_count) totalUnread += c.unread_count; });
    }
    var unreadBadgeHtml = '';
    if (totalUnread > 0) {
      unreadBadgeHtml = '<span class="ocw-launcher-badge" style="position:absolute;top:-4px;right:-4px;background:#25D366;color:#fff;font-size:11px;font-weight:700;border-radius:9999px;padding:2px 6px;min-width:20px;height:20px;display:flex;align-items:center;justify-content:center;box-shadow:0 2px 5px rgba(0,0,0,0.2);border:2px solid #fff;">' + (totalUnread > 99 ? '99+' : totalUnread) + '</span>';
    }

    var launcher = !state.open ?
      '<button class="ocw-launcher ' + pos + '" id="ocw-launch" style="background:' + esc(primary) + ';position:relative;" aria-label="Open chat">' +
      '<svg viewBox="0 0 24 24" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">' +
      '<path d="M21 15a4 4 0 0 1-4 4H8l-5 3V7a4 4 0 0 1 4-4h10a4 4 0 0 1 4 4z"/></svg>' +
      unreadBadgeHtml +
      '</button>' : '';

    var panel = '';
    if (state.open) {
      panel += '<div class="ocw-panel ' + pos + '">';
      panel += '<div class="ocw-header" style="background:' + esc(primary) + '"><div><div class="ocw-title">' + esc(cfg.widget_title || cfg.brand_name || 'Support') + '</div><div class="ocw-sub">' + esc(cfg.greeting_text || 'We are here to help') + '</div></div><div class="ocw-topbar">' + (state.detail ? '<button class="ocw-iconbtn" id="ocw-back" title="Back">←</button>' : '') + '<button class="ocw-iconbtn" id="ocw-min" title="Minimize">_</button><button class="ocw-iconbtn" id="ocw-close" title="Close">×</button></div></div>';
      if (state.minimized) {
        panel += '<div class="ocw-body"><div class="ocw-empty">Chat minimized. Click below or launcher to restore.</div></div></div>';
      } else {
        var isChatActive = state.activeTab !== 'chats';
        var isChatsActive = state.activeTab === 'chats';
        panel += '<div class="ocw-nav-bar" style="display:flex;align-items:center;justify-content:space-between;background:#f8fafc;border-bottom:1px solid #e2e8f0;padding:6px 12px;font-size:12px;">';
        panel += '<div style="display:flex;gap:4px;">';
        panel += '<button type="button" id="ocw-tab-chat" style="border:none;background:' + (isChatActive ? '#ffffff' : 'transparent') + ';color:' + (isChatActive ? esc(primary) : '#64748b') + ';font-weight:600;padding:4px 10px;border-radius:6px;cursor:pointer;box-shadow:' + (isChatActive ? '0 1px 2px rgba(0,0,0,0.06)' : 'none') + ';">Chat</button>';
        panel += '<button type="button" id="ocw-tab-chats" style="border:none;background:' + (isChatsActive ? '#ffffff' : 'transparent') + ';color:' + (isChatsActive ? esc(primary) : '#64748b') + ';font-weight:600;padding:4px 10px;border-radius:6px;cursor:pointer;display:inline-flex;align-items:center;gap:4px;box-shadow:' + (isChatsActive ? '0 1px 2px rgba(0,0,0,0.06)' : 'none') + ';">My Chats' + (totalUnread > 0 ? '<span style="background:#25D366;color:#fff;font-size:9px;font-weight:700;border-radius:9999px;padding:1px 5px;line-height:1.2;">' + (totalUnread > 99 ? '99+' : totalUnread) + '</span>' : '') + '</button>';
        panel += '</div>';
        panel += '<button type="button" id="ocw-nav-new-chat-btn" style="background:' + esc(primary) + ';color:#ffffff;border:none;padding:4px 10px;border-radius:6px;font-size:11px;font-weight:600;cursor:pointer;display:inline-flex;align-items:center;gap:3px;"' + (state.startingChat ? ' disabled' : '') + '>+ New Chat</button>';
        panel += '</div>';

        panel += '<div class="ocw-body">';
        if (cfg.is_business_open === false && cfg.out_of_hours_message) {
          panel += '<div style="background:#fffbeb;border:1px solid #fde68a;color:#92400e;border-radius:8px;padding:8px 10px;font-size:11px;margin-bottom:8px;line-height:1.4;">🕒 ' + esc(cfg.out_of_hours_message) + '</div>';
        }
        if (state.error) panel += '<div class="ocw-error">' + esc(state.error) + '</div>';
        if (state.info) panel += '<div class="ocw-error" style="background:#ecfeff;color:#155e75;border-color:#a5f3fc">' + esc(state.info) + '</div>';
        if (state.offline) panel += '<div class="ocw-error">You appear to be offline. Messages will send when connection is restored.</div>';
        if (state.activeTab === 'chats') {
          panel += '<div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:12px;"><span style="font-size:13px;font-weight:600;color:#1e293b;">Your Conversations</span><button type="button" id="ocw-new-chat-btn" style="background:' + esc(primary) + ';color:#fff;border:none;padding:5px 10px;border-radius:6px;font-size:11px;font-weight:600;cursor:pointer;">+ New Chat</button></div>';
          if (state.conversations && state.conversations.length) {
            panel += '<div class="ocw-list" style="display:flex;flex-direction:column;gap:8px;">';
            state.conversations.forEach(function (c) {
              var isResolved = c.status === 'resolved' || c.status === 'closed';
              var chatIdBadge = c.chat_id ? '<span style="font-family:monospace;font-size:10px;padding:2px 6px;border-radius:4px;background:#f1f5f9;color:#475569;font-weight:600;">' + esc(c.chat_id) + '</span>' : '';
              var statusBadge = getWidgetStatusBadge(c.status);
              var hasUnread = (c.unread_count && c.unread_count > 0);
              var unreadBadge = hasUnread ? '<span style="background:#25D366;color:#fff;font-size:10px;font-weight:700;border-radius:9999px;padding:2px 6px;margin-left:6px;min-width:18px;text-align:center;">' + (c.unread_count > 99 ? '99+' : c.unread_count) + '</span>' : '';
              var cardBorder = hasUnread ? 'border:1.5px solid #86efac;background:#f0fdf4;' : 'background:#fff;border:1px solid #e2e8f0;';
              var lastMsgStyle = hasUnread ? 'font-weight:700;color:#0f172a;' : 'color:#64748b;';

              panel += '<div class="ocw-chat-item" style="' + cardBorder + 'border-radius:10px;padding:10px 12px;display:flex;flex-direction:column;gap:4px;">';
              panel += '<div style="display:flex;justify-content:space-between;align-items:center;"><div style="display:flex;align-items:center;gap:4px;">' + chatIdBadge + unreadBadge + '</div>' + statusBadge + '</div>';
              panel += '<div style="font-weight:600;font-size:12px;color:#1e293b;cursor:pointer;" class="ocw-conv-open" data-id="' + c.id + '">' + esc(c.subject || 'Support Conversation') + '</div>';
              panel += '<div style="font-size:11px;' + lastMsgStyle + 'overflow:hidden;text-overflow:ellipsis;white-space:nowrap;cursor:pointer;" class="ocw-conv-open" data-id="' + c.id + '">' + esc(c.last_message || 'No messages yet') + '</div>';
              panel += '<div style="display:flex;justify-content:space-between;align-items:center;margin-top:4px;border-top:1px solid #f8fafc;padding-top:4px;">';
              panel += '<span style="font-size:10px;color:#94a3b8;">' + fmtTime(c.updated_at || c.created_at) + '</span>';
              if (isResolved) {
                panel += '<button type="button" class="ocw-reopen-btn" data-id="' + c.id + '" style="background:#eff6ff;color:#2563eb;border:1px solid #bfdbfe;border-radius:4px;padding:3px 8px;font-size:10px;font-weight:600;cursor:pointer;">Reopen Chat</button>';
              } else {
                panel += '<button type="button" class="ocw-conv-open" data-id="' + c.id + '" style="background:none;border:none;font-size:11px;color:' + esc(primary) + ';font-weight:600;cursor:pointer;padding:0;">Continue →</button>';
              }
              panel += '</div>';
              panel += '</div>';
            });
            panel += '</div>';
          } else {
            panel += '<div class="ocw-empty">No previous conversations.</div>';
          }
        } else if (!state.detail) {
          panel += '<div style="margin-bottom:12px;color:#334155;font-size:13px">' + esc(cfg.welcome_message || (cfg.bot_flow && cfg.bot_flow.initial_greeting) || 'Hello! Welcome to OpenChat Support. How can we help you today?') + '</div>';
          panel += '<button class="ocw-btn ocw-btn-primary" id="ocw-start" style="background:' + esc(primary) + ';width:100%">' + (state.loading ? 'Connecting...' : 'Start new conversation') + '</button>';
          panel += '<div style="margin:14px 0 6px;font-size:12px;color:#475569;font-weight:600">Quick Assistance & Topics</div>';
          panel += '<div class="ocw-topics" style="display:flex;flex-direction:column;gap:6px;margin-bottom:14px">';
          var topics = (cfg.bot_flow && cfg.bot_flow.issues && cfg.bot_flow.issues.length)
            ? cfg.bot_flow.issues
            : [
              { title: "📦 Order or Booking" },
              { title: "💳 Payment Issues" },
              { title: "🔄 Refund or Cancellation" },
              { title: "ℹ️ Product Information" },
              { title: "🛠️ Technical Support" },
              { title: "❓ Other Questions" }
            ];
          topics.forEach(function (top) {
            var title = esc(top.title || top);
            panel += '<button type="button" class="ocw-topic-btn" data-topic="' + title + '" style="text-align:left;padding:8px 10px;background:#f8fafc;border:1px solid #e2e8f0;border-radius:8px;cursor:pointer;font-size:12px;display:flex;align-items:center;justify-content:space-between"><span>' + title + '</span><span style="color:#94a3b8">→</span></button>';
          });
          panel += '</div>';
          panel += '<div style="margin:14px 0 8px;font-size:12px;color:#64748b;font-weight:600">Your conversations</div>';
          if (state.conversations && state.conversations.length) {
            panel += '<div class="ocw-list">';
            state.conversations.forEach(function (c) {
              var badge = '';
              if (c.status) badge = '<span class="ocw-badge">' + esc(c.status) + '</span>';
              panel += '<button data-id="' + c.id + '"><strong>' + esc(c.subject || 'Conversation') + '</strong>' + badge + '<div style="font-size:11px;color:#64748b;margin-top:2px">' + esc(c.last_message || 'No messages yet') + '</div></button>';
            });
            panel += '</div>';
          } else {
            panel += '<div class="ocw-empty">No previous conversations.</div>';
          }
        } else {
          var chatCode = state.detail.chat_id || ('CHT-' + state.detail.id);
          panel += '<div class="ocw-chat-subheader" style="display:flex;align-items:center;justify-content:space-between;padding:6px 12px;background:#f8fafc;border-bottom:1px solid #e2e8f0;font-size:11px;">';
          panel += '<div style="display:flex;align-items:center;gap:6px;">';
          panel += '<span style="font-family:monospace;font-weight:700;color:#334155;background:#e2e8f0;padding:1px 5px;border-radius:4px;">#' + esc(chatCode) + '</span>';
          panel += getWidgetStatusBadge(state.detail.status);
          panel += '</div>';
          panel += '<button type="button" id="ocw-detail-new-chat" style="background:#ffffff;border:1px solid #cbd5e1;color:#1e293b;padding:3px 8px;border-radius:6px;font-size:10px;font-weight:600;cursor:pointer;"' + (state.startingChat ? ' disabled' : '') + '>+ New Chat</button>';
          panel += '</div>';
          panel += '<div class="ocw-list" style="flex:1;overflow-y:auto">';
          if (state.detail.messages && state.detail.messages.length) {
            state.detail.messages.forEach(function (m) {
              var cls = 'ocw-msg';
              if (m.sender_type === 'customer') cls += ' ocw-user';
              else if (m.sender_type === 'agent') cls += ' ocw-agent';
              else if (m.sender_type === 'ai') cls += ' ocw-ai';
              else cls += ' ocw-system';
              var content = esc(m.content);
              var status = m.delivery_status || 'delivered';
              var bubbleStyle = '';
              if (m.sender_type === 'customer') bubbleStyle += 'background:' + esc(primary) + ';';
              if (status === 'sending') bubbleStyle += 'opacity:0.6;';
              if (status === 'failed') bubbleStyle += 'background:#fee2e2;color:#991b1b;border:1px solid #f87171;';

              var statusBadge = '';
              if (m.sender_type === 'customer') {
                if (status === 'sending') {
                  statusBadge = ' <span class="ocw-status-badge" style="color:#64748b;font-size:10px;margin-left:4px;">• Sending…</span>';
                } else if (status === 'failed') {
                  var retryText = esc(m.failed_content || m.content);
                  var retryCid = esc(m.client_message_id || m.id);
                  statusBadge = ' <span class="ocw-status-badge" style="color:#dc2626;font-size:10px;font-weight:600;margin-left:4px;">• Failed</span> <button type="button" class="ocw-retry-btn" data-content="' + retryText + '" data-cid="' + retryCid + '" style="background:none;border:none;color:#2563eb;font-size:11px;font-weight:600;cursor:pointer;text-decoration:underline;padding:0 2px;">Retry</button>';
                } else {
                  var isReadByAgent = state.detail.agent_last_read_at && m.created_at && (new Date(state.detail.agent_last_read_at).getTime() >= new Date(m.created_at).getTime());
                  if (isReadByAgent) {
                    statusBadge = ' <span class="ocw-status-badge" style="color:#0284c7;font-size:10px;font-weight:600;margin-left:4px;">✓✓ Read</span>';
                  } else if (status === 'delivered') {
                    statusBadge = ' <span class="ocw-status-badge" style="color:#64748b;font-size:10px;margin-left:4px;">✓ Delivered</span>';
                  } else {
                    statusBadge = ' <span class="ocw-status-badge" style="color:#64748b;font-size:10px;margin-left:4px;">✓ Sent</span>';
                  }
                }
              }

              var senderLabel = (m.sender_type === 'customer') ? 'You' : 'OpenChat Support';
              panel += '<div class="' + cls + '"><div class="ocw-bubble" style="' + bubbleStyle + '">' + content + '</div><div class="ocw-meta">' + senderLabel + ' • ' + fmtTime(m.created_at) + statusBadge + '</div></div>';

              // Contextual multi-level bot flow options
              if (m.sender_type !== 'customer' && m.ai_metadata && m.ai_metadata.options && m.ai_metadata.options.length) {
                panel += '<div class="ocw-options-group" style="display:flex;flex-wrap:wrap;gap:6px;margin:6px 0 12px;padding-left:4px">';
                m.ai_metadata.options.forEach(function (opt) {
                  var optLabel = esc(opt.label || opt.value || opt);
                  var optVal = esc(opt.value || opt.label || opt);
                  panel += '<button type="button" class="ocw-qr-btn" data-qr="' + optVal + '" style="font-size:12px;padding:6px 12px;border-radius:14px;background:#eff6ff;color:#1d4ed8;border:1px solid #bfdbfe;cursor:pointer;font-weight:500;box-shadow:0 1px 2px rgba(0,0,0,0.04);transition:all 0.15s ease;text-align:left">' + optLabel + '</button>';
                });
                panel += '</div>';
              }
            });
          } else {
            panel += '<div class="ocw-empty">Send a message to begin chatting.</div>';
          }
          panel += '</div>';
          panel += '<div class="ocw-footer">';
          if (state.selectedAttachment) {
            panel += '<div class="ocw-attach-preview" style="display:flex;align-items:center;gap:8px;padding:6px 10px;background:#f1f5f9;border-radius:8px;margin-bottom:8px;border:1px solid #e2e8f0;">';
            panel += '<img src="' + state.selectedAttachment.previewUrl + '" style="height:36px;width:36px;object-fit:cover;border-radius:4px;border:1px solid #cbd5e1;"/>';
            panel += '<span style="flex:1;font-size:11px;color:#334155;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;font-weight:500;">' + esc(state.selectedAttachment.file.name) + '</span>';
            panel += '<button type="button" id="ocw-remove-attach" style="background:none;border:none;cursor:pointer;font-size:14px;color:#ef4444;padding:2px 6px;" title="Remove image">✕</button>';
            panel += '</div>';
          }
          panel += '<div style="display:flex;gap:6px;align-items:flex-end;position:relative;">';
          panel += '<button type="button" id="ocw-attach-btn" title="Attach image (PNG, JPG, max 10MB)" style="background:#f1f5f9;border:1px solid #cbd5e1;border-radius:8px;padding:8px 10px;cursor:pointer;font-size:14px;color:#475569;height:42px;display:flex;align-items:center;justify-content:center;">📎</button>';
          panel += '<button type="button" id="ocw-emoji-btn" title="Add emoji" style="background:#f1f5f9;border:1px solid #cbd5e1;border-radius:8px;padding:8px 10px;cursor:pointer;font-size:16px;color:#475569;height:42px;display:flex;align-items:center;justify-content:center;">😀</button>';
          panel += '<input type="file" id="ocw-file-input" accept="image/png,image/jpeg,image/jpg,image/gif,image/webp" style="display:none;"/>';
          panel += '<textarea id="ocw-text" class="ocw-input" placeholder="Type a message or /help…" style="flex:1;min-height:42px;height:42px;"></textarea>';
          panel += '<button class="ocw-btn ocw-btn-primary" id="ocw-send" style="background:' + esc(primary) + (state.sending ? ';opacity:0.6;cursor:not-allowed;' : '') + ';height:42px;padding:0 14px;font-weight:600;"' + (state.sending ? ' disabled' : '') + '>' + (state.sending ? '...' : 'Send') + '</button>';

          if (state.showEmojiPicker) {
            panel += '<div id="ocw-emoji-picker" style="position:absolute;bottom:48px;left:0;right:0;background:#ffffff;border:1px solid #e2e8f0;border-radius:12px;box-shadow:0 10px 25px rgba(0,0,0,0.18);padding:10px;z-index:2147483010;display:flex;flex-direction:column;gap:6px;">';
            panel += '<div style="display:flex;align-items:center;justify-content:space-between;gap:6px;border-bottom:1px solid #f1f5f9;padding-bottom:6px;">';
            panel += '<input type="text" id="ocw-emoji-search" placeholder="Search emojis..." value="' + esc(state.emojiSearch || '') + '" style="flex:1;border:1px solid #cbd5e1;border-radius:6px;padding:4px 8px;font-size:12px;outline:none;" />';
            panel += '<button type="button" id="ocw-emoji-close" style="background:none;border:none;font-size:16px;cursor:pointer;color:#64748b;line-height:1;padding:2px 4px;">✕</button>';
            panel += '</div>';
            panel += '<div style="display:flex;gap:4px;overflow-x:auto;padding-bottom:4px;border-bottom:1px solid #f8fafc;">';
            var cats = [
              { id: "all", label: "All" },
              { id: "smileys", label: "😀 Smileys" },
              { id: "gestures", label: "👍 Gestures" },
              { id: "hearts", label: "❤️ Hearts" },
              { id: "objects", label: "🎉 Objects" }
            ];
            cats.forEach(function (cat) {
              var isCat = (state.emojiCategory || 'all') === cat.id;
              panel += '<button type="button" class="ocw-emoji-cat" data-cat="' + cat.id + '" style="border:none;background:' + (isCat ? '#e0f2fe;color:#0369a1;' : '#f1f5f9;color:#475569;') + 'border-radius:4px;padding:3px 6px;font-size:11px;font-weight:600;cursor:pointer;white-space:nowrap;">' + cat.label + '</button>';
            });
            panel += '</div>';
            panel += '<div id="ocw-emoji-grid" style="display:grid;grid-template-columns:repeat(8, 1fr);gap:4px;max-height:150px;overflow-y:auto;padding-top:4px;">';
            var emList = getFilteredEmojis(state.emojiCategory || 'all', state.emojiSearch || '');
            emList.forEach(function (em) {
              panel += '<button type="button" class="ocw-emoji-item" data-emoji="' + em.char + '" title="' + esc(em.name) + '" style="background:none;border:none;cursor:pointer;font-size:18px;padding:4px;border-radius:6px;text-align:center;">' + em.char + '</button>';
            });
            panel += '</div>';
            panel += '</div>';
          }
          panel += '</div>';
          panel += '</div>';
        }
        panel += '</div>';
      }
      panel += '</div>';
    }

    contentDiv.innerHTML = launcher + panel;
    injectStyles(primary);

    diag('DOM updated in Shadow Root with markup.');

    var launchBtn = $('#ocw-launch');
    if (launchBtn) {
      diag('Launcher element created in Shadow Root.');
      var rect = launchBtn.getBoundingClientRect();
      var winW = window.innerWidth;
      var winH = window.innerHeight;
      var style = window.getComputedStyle ? window.getComputedStyle(launchBtn) : null;
      var isInside = (rect.top >= 0 && rect.left >= 0 && rect.bottom <= winH && rect.right <= winW && rect.width > 0 && rect.height > 0);
      var isVis = isInside && (style ? style.display !== 'none' && style.visibility !== 'hidden' && parseFloat(style.opacity || '1') > 0 : true);

      diagnostics.launcherRendered = true;
      diagnostics.launcherVisible = isVis;
      diagnostics.isInsideViewport = isInside;
      diagnostics.viewport = { width: winW, height: winH };
      diagnostics.launcherRect = {
        top: Math.round(rect.top),
        right: Math.round(rect.right),
        bottom: Math.round(rect.bottom),
        left: Math.round(rect.left),
        width: Math.round(rect.width),
        height: Math.round(rect.height),
        spacingBottom: Math.round(winH - rect.bottom),
        spacingRight: Math.round(winW - rect.right)
      };

      diag('Launcher visibility and dimensions checked.', {
        visible: isVis,
        insideViewport: isInside,
        dimensions: { width: rect.width, height: rect.height },
        position: { bottom: rect.bottom, right: rect.right, top: rect.top, left: rect.left },
        spacing: { bottom: winH - rect.bottom, right: winW - rect.right },
        zIndex: style ? style.zIndex : null
      });

      launchBtn.onclick = function () {
        state.open = true;
        render();
        ensureSession().then(async function () {
          await loadConversations();
          render();
          startPolling();
        }).catch(function (err) {
          logError('Launcher open -> ensureSession', err);
          setError(err.message || 'Failed to initialize session');
        });
      };
    } else if (state.open) {
      diagnostics.launcherRendered = false;
      diagnostics.launcherVisible = false;
      diag('Chat panel is currently open.');
    }

    var closeBtn = $('#ocw-close');
    if (closeBtn) {
      closeBtn.onclick = function () { state.open = false; stopPolling(); render(); };
    }
    var minBtn = $('#ocw-min');
    if (minBtn) {
      minBtn.onclick = function () { state.minimized = !state.minimized; render(); };
    }
    var backBtn = $('#ocw-back');
    if (backBtn) {
      backBtn.onclick = function () { state.detail = null; state.activeId = null; render(); };
    }
    var startBtn = $('#ocw-start');
    if (startBtn) {
      startBtn.onclick = function () {
        ensureSession().then(function () {
          return startConversation();
        }).catch(function (err) {
          logError('startBtn -> ensureSession', err);
          setError(err.message || 'Cannot start conversation without session');
        });
      };
    }
    var tabChat = $('#ocw-tab-chat');
    if (tabChat) {
      tabChat.onclick = function () { state.activeTab = 'chat'; render(); };
    }
    var tabChats = $('#ocw-tab-chats');
    if (tabChats) {
      tabChats.onclick = function () { state.activeTab = 'chats'; loadConversations().then(render); };
    }
    var triggerNewChat = function () {
      state.activeTab = 'chat';
      state.detail = null;
      state.activeId = null;
      startConversation();
    };
    var newChatBtn = $('#ocw-new-chat-btn');
    if (newChatBtn) newChatBtn.onclick = triggerNewChat;
    var navNewChatBtn = $('#ocw-nav-new-chat-btn');
    if (navNewChatBtn) navNewChatBtn.onclick = triggerNewChat;
    var detailNewChatBtn = $('#ocw-detail-new-chat');
    if (detailNewChatBtn) detailNewChatBtn.onclick = triggerNewChat;
    var attachBtn = $('#ocw-attach-btn');
    var fileInput = $('#ocw-file-input');
    if (attachBtn && fileInput) {
      attachBtn.onclick = function () { fileInput.click(); };
      fileInput.onchange = function (e) {
        var file = e.target.files && e.target.files[0];
        e.target.value = '';
        if (!file) return;
        if (file.size > 10 * 1024 * 1024) {
          setError('Image exceeds maximum allowed size of 10MB.');
          return;
        }
        var previewUrl = URL.createObjectURL(file);
        state.selectedAttachment = { file: file, previewUrl: previewUrl };
        render();
      };
    }
    var removeAttachBtn = $('#ocw-remove-attach');
    if (removeAttachBtn) {
      removeAttachBtn.onclick = function () {
        state.selectedAttachment = null;
        render();
      };
    }
    var emojiBtn = $('#ocw-emoji-btn');
    if (emojiBtn) {
      emojiBtn.onclick = function (e) {
        e.preventDefault();
        e.stopPropagation();
        state.showEmojiPicker = !state.showEmojiPicker;
        render();
      };
    }
    var emojiClose = $('#ocw-emoji-close');
    if (emojiClose) {
      emojiClose.onclick = function (e) {
        e.preventDefault();
        e.stopPropagation();
        state.showEmojiPicker = false;
        render();
      };
    }
    var emojiSearchInput = $('#ocw-emoji-search');
    if (emojiSearchInput) {
      emojiSearchInput.oninput = function (e) {
        state.emojiSearch = e.target.value;
        var grid = $('#ocw-emoji-grid');
        if (grid) {
          var emList = getFilteredEmojis(state.emojiCategory || 'all', state.emojiSearch || '');
          var gh = '';
          emList.forEach(function (em) {
            gh += '<button type="button" class="ocw-emoji-item" data-emoji="' + em.char + '" title="' + esc(em.name) + '" style="background:none;border:none;cursor:pointer;font-size:18px;padding:4px;border-radius:6px;text-align:center;">' + em.char + '</button>';
          });
          grid.innerHTML = gh;
          bindEmojiItems();
        }
      };
    }
    var catBtns = $$('.ocw-emoji-cat');
    catBtns.forEach(function (btn) {
      btn.onclick = function (e) {
        e.preventDefault();
        e.stopPropagation();
        state.emojiCategory = btn.getAttribute('data-cat');
        render();
      };
    });
    function bindEmojiItems() {
      var emojiBtns = $$('.ocw-emoji-item');
      emojiBtns.forEach(function (btn) {
        btn.onclick = function (e) {
          e.preventDefault();
          e.stopPropagation();
          var em = btn.getAttribute('data-emoji');
          var ta = $('#ocw-text');
          if (ta && em) {
            var start = ta.selectionStart || 0;
            var end = ta.selectionEnd || 0;
            var val = ta.value;
            ta.value = val.substring(0, start) + em + val.substring(end);
            ta.selectionStart = ta.selectionEnd = start + em.length;
            state.draft = ta.value;
            ta.focus();
          }
        };
      });
    }
    bindEmojiItems();
    var reopenBtns = $$('.ocw-reopen-btn');
    reopenBtns.forEach(function (btn) {
      btn.onclick = function (e) {
        e.stopPropagation();
        var cid = parseInt(btn.getAttribute('data-id'), 10);
        reopenConversation(cid);
      };
    });
    var convOpenLinks = $$('.ocw-conv-open');
    convOpenLinks.forEach(function (el) {
      el.onclick = function (e) {
        e.stopPropagation();
        var cid = parseInt(el.getAttribute('data-id'), 10);
        state.activeTab = 'chat';
        loadDetail(cid);
      };
    });

    var sendBtn = $('#ocw-send');
    if (sendBtn) {
      sendBtn.onclick = function () {
        if (!state.sending) {
          sendMessage();
        }
      };
    }
    var textInput = $('#ocw-text');
    if (textInput) {
      if (savedDraft) {
        textInput.value = savedDraft;
      }
      if (isInputFocused) {
        textInput.focus();
        try { textInput.setSelectionRange(cursorStart, cursorEnd); } catch (_) { }
      }
      textInput.oninput = function () {
        state.draft = textInput.value;
      };
      textInput.onkeydown = function (e) {
        if (e.key === 'Enter' && !e.shiftKey) {
          e.preventDefault();
          if (!state.sending) {
            sendMessage();
          }
        }
      };
    }
    var retryButtons = $$('.ocw-retry-btn');
    retryButtons.forEach(function (btn) {
      btn.onclick = function (e) {
        e.stopPropagation();
        var c = btn.getAttribute('data-content');
        var cid = btn.getAttribute('data-cid');
        sendMessage(c, cid);
      };
    });
    var topicButtons = $$('.ocw-topic-btn');
    topicButtons.forEach(function (btn) {
      btn.onclick = function (e) {
        e.stopPropagation();
        var topic = btn.getAttribute('data-topic');
        ensureSession().then(function () {
          return startConversation(topic);
        }).catch(function (err) {
          logError('topicBtn -> ensureSession', err);
          setError(err.message || 'Cannot start conversation');
        });
      };
    });
    var qrButtons = $$('.ocw-qr-btn');
    qrButtons.forEach(function (btn) {
      btn.onclick = function (e) {
        e.stopPropagation();
        var qr = btn.getAttribute('data-qr');
        if (!state.sending) {
          sendMessage(qr);
        }
      };
    });
    var messagesContainer = shadowRoot.querySelector('.ocw-list');
    if (messagesContainer) {
      messagesContainer.scrollTop = messagesContainer.scrollHeight;
    }
    var humanBtn = $('#ocw-human');
    if (humanBtn) {
      humanBtn.onclick = requestHuman;
    }
    var listButtons = $$('.ocw-list button[data-id]');
    listButtons.forEach(function (btn) {
      btn.onclick = function () {
        var id = btn.getAttribute('data-id');
        loadDetail(parseInt(id, 10));
      };
    });
  }

  async function init() {
    diag('Initialization started.');
    diagnostics.initStarted = true;
    render();

    try {
      diag('Configuration request started.');
      diagnostics.configRequested = true;
      var remoteConfig = await api('/config');
      state.config = Object.assign({}, DEFAULT_CONFIG, remoteConfig);
      state.backendConfigLoaded = true;
      diagnostics.configReceived = true;
      diagnostics.config = state.config;
      diag('Configuration response received.', { title: state.config.widget_title, primary: state.config.primary_color });
      render();
    } catch (e) {
      logError('Configuration request', e);
      state.error = 'Backend config unavailable: ' + (e.message || 'unknown error');
      render();
    }

    try {
      diag('Pre-warming session check...');
      await ensureSession();
      diag('Pre-warming session check succeeded.');
    } catch (e) {
      logError('Session check during init', e);
    }
  }

  window.OpenChat = {
    open: function () {
      state.open = true;
      render();
      ensureSession().then(async function () {
        await loadConversations();
        render();
        startPolling();
      }).catch(function (err) {
        logError('OpenChat.open', err);
      });
    },
    close: function () {
      state.open = false;
      stopPolling();
      render();
    },
    newChat: function () {
      state.open = true;
      state.activeTab = 'chat';
      state.detail = null;
      state.activeId = null;
      render();
      startConversation();
    }
  };

  try {
    window.addEventListener('openchat:open', function () {
      window.OpenChat.open();
    });
  } catch (e) { }

  function startWhenReady() {
    if (document.readyState === 'loading') {
      document.addEventListener('DOMContentLoaded', init);
    } else {
      init();
    }
  }

  startWhenReady();
})();

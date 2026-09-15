const $ = (s) => document.querySelector(s);
let currentUser = null;
let currentChatId = null;
let chats = [];
let streaming = false;
let abortCtrl = null;
let pendingDeleteId = null;
let tempMode = localStorage.getItem('tempMode') === '1';
let chatLean = false; // per-chat lean (no-history token saver) — loaded with openChat
let focusMode = localStorage.getItem('focusMode') === '1'; // lean global for temp chat too (persisted)

// ---------- i18n (default: English) ----------
const I18N = window.I18N; // dictionaries live in i18n.js (shared with server share pages)
// server error code -> localized message
const ERR_MAP = window.ERR_MAP; // see i18n.js
function terr(code) {
  if (ERR_MAP[code]) return ERR_MAP[code][lang] || ERR_MAP[code].en;
  return code; // raw message passthrough (e.g. 9Router relay)
}

let lang = localStorage.getItem('lang') || 'en';
function t(key, ...args) {
  const v = I18N[lang][key] !== undefined ? I18N[lang][key] : I18N.en[key];
  return typeof v === 'function' ? v(...args) : v;
}

function applyI18N() {
  try {
    const qs = (s) => document.querySelector(s);
    document.documentElement.lang = lang;
    const $ = (s) => qs(s);
    $('#lang-label').textContent = lang.toUpperCase();
    const setT = (sel, txt) => { const e = $(sel); if(e) e.textContent = txt; };
    const setP = (sel, txt) => { const e = $(sel); if(e) e.placeholder = txt; };
    const setA = (sel, attr, txt) => { const e = $(sel); if(e) e.setAttribute(attr, txt); };
    const setTitle = (sel, txt) => { const e = $(sel); if(e) e.title = txt; };
    setT('#login-title', t('login_title'));
    setT('#login-sub', t('login_sub'));
    setT('label[for="login-user"]', t('login_user'));
    document.querySelectorAll('[data-ph]').forEach(el => { el.placeholder = t(el.dataset.ph); });
    setP('#login-user', t('login_user_ph'));
    setT('label[for="login-pass"]', t('login_pass'));
    setP('#login-pass', t('login_pass_ph'));
    setT('#login-btn-el', t('login_btn'));
    setT('#login-foot-el', t('login_foot'));
    setT('#btn-new-chat .txt', '\u00A0' + t('new_chat'));
    setT('#side-history-label', t('history'));
    setP('#chat-search', t('search_ph'));
    setTitle('#btn-settings', t('settings')); setA('#btn-settings', 'aria-label', t('settings'));
    setTitle('#btn-admin', t('admin')); setA('#btn-admin', 'aria-label', t('admin'));
    setTitle('#btn-logout', t('logout')); setA('#btn-logout', 'aria-label', t('logout'));
    setT('#model-label', t('model_label'));
    setA('#model-select', 'aria-label', t('aria_model'));
    setA('#btn-toggle-sidebar', 'aria-label', t('aria_sidebar'));
    setTitle('#btn-new-chat', t('new_chat')); setA('#btn-new-chat', 'aria-label', t('aria_new_chat'));
    setTitle('#btn-minimize', t('aria_minimize')); setA('#btn-minimize', 'aria-label', t('aria_minimize'));
    setP('#add-username', t('add_user_ph'));
    setP('#input-msg', t('input_ph'));
    setT('#hint-inner-el', t('hint'));
    setT('#empty-title-el', t('empty_title'));
    setT('#empty-sub-el', t('empty_sub'));
    setT('#logout-title', t('logout_title'));
    setT('#logout-sub', t('logout_sub'));
    setT('#logout-cancel', t('logout_cancel'));
    setT('#logout-ok', t('logout_ok'));
    setT('#confirm-title', t('confirm_title'));
    setT('#confirm-cancel', t('cancel'));
    setT('#confirm-ok', t('del_ok'));
    setT('#admin-title-el', t('admin_title'));
    setT('#admin-sub-el', t('admin_sub'));
    setT('#admin-users-title', t('admin_users_title'));
    setT('#admin-users-sub', t('admin_users_sub'));
    setT('#admin-global-title', t('admin_global'));
    setT('#admin-global-sub', t('admin_global_sub'));
    setT('#global-model-save', t('admin_save'));
    setT('#admin-add-title', t('admin_add'));
    setT('label[for="add-username"]', t('login_user'));
    setP('#add-username', t('admin_user_ph'));
    setT('label[for="add-password"]', t('login_pass'));
    setP('#add-password', t('admin_pass_ph'));
    setT('label[for="add-role"]', t('admin_role'));
    setT('label[for="add-quota"]', t('admin_quota'));
    setT('#admin-close', t('admin_close'));
    setT('#admin-stat-title', t('stat_title'));
    setT('#stat-purge-now', t('stat_purge_now'));
    setT('#stat-reset-usage', t('stat_reset_usage'));
    setT('#admin-stat-sub', t('stat_sub', Number($('#stat-days .seg-btn.active') ? $('#stat-days .seg-btn.active').dataset.days : 1)));
    setT('#lbl-guest-purge', t('guest_purge_hour'));
    setTitle('#btn-theme', t('theme_toggle')); setA('#btn-theme', 'aria-label', t('theme_toggle'));
    setT('#form-add-user button[type="submit"]', t('admin_add_btn'));
    setT('#settings-title-el', t('settings_title'));
    setT('#avatar-title-el', t('avatar'));
    setT('#avatar-pick-label', t('avatar_pick'));
    setT('#avatar-remove', t('avatar_remove'));
    setT('#pw-title-el', t('pw_title'));
    setT('label[for="pw-current"]', t('pw_current'));
    setT('label[for="pw-next"]', t('pw_new'));
    setT('#pw-save-btn', t('pw_save'));
    setT('#wallpaper-title-el', t('wallpaper_title'));
    setT('#wallpaper-sub-el', t('wallpaper_sub'));
    setT('#memory-title-el', t('memory_title'));
    setT('#memory-sub-el', t('memory_sub'));
    setT('#memory-clear-btn', t('memory_clear'));
    setP('#memory-add-input', t('memory_add_ph'));
    setT('#admin-token-title', t('token_title'));
    setT('#admin-router-title', t('router_title'));
    setT('#admin-router-sub', t('router_sub'));
    setT('label[for="router-base"]', t('router_base_lbl'));
    setT('label[for="router-key"]', t('router_key_lbl'));
    setT('#router-test', t('router_test_btn'));
    setT('#router-save', t('router_save_btn'));
    if (routerCfg) {
      $('#router-key').placeholder = routerCfg.api_key_masked ? t('router_key_ph', routerCfg.api_key_masked) : t('router_key_ph_none');
      renderRouterStatus();
    }
    setT('label[for="set-hist-budget"]', t('hist_budget'));
    setT('label[for="set-max-reply"]', t('max_reply'));
    setT('label[for="set-timeout"]', t('timeout_lbl'));
    setT('#admin-ai-avatar-title', t('ai_avatar_title'));
    setT('#admin-ai-avatar-sub', t('ai_avatar_sub'));
    setT('#admin-ai-avatar-pick', t('ai_avatar_pick'));
    setT('#admin-ai-avatar-reset', t('ai_avatar_reset'));
    setT('#admin-reset-usage', t('admin_reset_all'));
    setT('#lbl-memory-enabled', t('memory_enabled_lbl'));
    setT('#lbl-memory-enabled-sub', t('memory_enabled_sub'));
    setT('#admin-guest-title', t('guest_admin_title'));
    setT('#admin-ops-title', t('ops_admin_title'));
    setT('#admin-ops-sub', t('ops_admin_sub'));
    setT('#ops-backup', t('ops_backup'));
    setT('#ops-audit-title', t('ops_audit'));
    setT('#ops-audit-more', t('ops_audit_more'));
    setT('#lbl-guest-enabled', t('guest_enabled_lbl'));
    setT('#lbl-guest-enabled-sub', t('guest_enabled_sub'));
    setT('label[for="set-guest-chats"]', t('guest_max_chats_lbl'));
    setT('label[for="set-guest-minutes"]', t('guest_minutes_lbl'));
    setT('label[for="set-gen-max"]', t('gen_max_lbl'));
    setT('label[for="set-gen-window"]', t('gen_window_lbl'));
    setT('#lbl-gen-note', t('gen_note_lbl'));
    setT('#guest-btn-label', t('guest_btn'));
    setT('#guest-save', t('router_save_btn'));
    setT('#token-reset', t('reset_btn'));
    setT('#guest-reset', t('reset_btn'));
    if (isGuest()) {
      $('#guest-modal-title').textContent = t('guest_title');
    }
    applyLeanUI();
    setT('#wallpaper-pick-label', t('wallpaper_upload'));
    setT('#wallpaper-reset', t('wallpaper_reset'));
    setT('#settings-close', t('admin_close'));
    updateQuota();
    applyModelLockUI(document.querySelector('#model-select').disabled);
    applyTempUI();
    if (currentUser) loadChats();
    const es = $('#empty-state');
    if (es) {
      const et = es.querySelector('#empty-title-el');
      const es2 = es.querySelector('#empty-sub-el');
      if(et) et.textContent = t('empty_title');
      if(es2) es2.textContent = t('empty_sub');
    }
  } catch (e) {
    console.warn('applyI18N partial:', e.message);
  }
}

// ---------- theme (dark default / light) ----------
let theme = localStorage.getItem('theme') || 'dark';
function applyTheme() {
  document.body.classList.toggle('light', theme === 'light');
  const hl = document.getElementById('hljs-css');
  if (hl) hl.href = theme === 'light' ? '/vendor/github.min.css' : '/vendor/github-dark.min.css';
  const btn = document.getElementById('btn-theme');
  if (btn) {
    btn.querySelector('.ic-moon').style.display = theme === 'light' ? '' : 'none';
    btn.querySelector('.ic-sun').style.display = theme === 'light' ? 'none' : '';
    btn.title = t(theme === 'light' ? 'theme_dark' : 'theme_light');
    btn.setAttribute('aria-label', btn.title);
  }
  try { if (typeof renderStatChart === 'function' && statCache) renderStatChart(); } catch (_) {}
}
document.getElementById('btn-theme').addEventListener('click', () => {
  theme = theme === 'light' ? 'dark' : 'light';
  localStorage.setItem('theme', theme);
  applyTheme();
});
applyTheme();

$('#btn-lang').addEventListener('click', () => {
  lang = lang === 'en' ? 'id' : 'en';
  localStorage.setItem('lang', lang);
  applyI18N();
  toast(lang === 'en' ? 'Language: English' : 'Bahasa: Indonesia', 'success');
});

const ICON_CHAT = '<svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"/></svg>';
const SEND_ICON = '<svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M22 2 11 13"/><path d="M22 2 15 22 11 13 2 9 22 2z"/></svg>';
const STOP_ICON = '<svg width="15" height="15" viewBox="0 0 24 24" fill="currentColor"><rect x="6" y="6" width="12" height="12" rx="2"/></svg>';
const ICON_EDIT = '<svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"/><path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"/></svg>';
const ICON_COPY = '<svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="9" y="9" width="13" height="13" rx="2" ry="2"/><path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"/></svg>';
const ICON_REFRESH = '<svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="23 4 23 10 17 10"/><path d="M20.49 15a9 9 0 1 1-2.12-9.36L23 10"/></svg>';
const ICON_UPLOAD = '<svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="17 8 12 3 7 8"/><line x1="12" y1="3" x2="12" y2="15"/></svg>';
const ICON_TRASH = '<svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="3 6 5 6 21 6"/><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"/></svg>';
const ICON_X = '<svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>';

function toast(msg, type = '', ms = 4000) {
  const t = $('#toast');
  if (!t) return;
  // anchor: a centered dialog when one is open, otherwise the chat main area.
  // (centering on .main while the admin modal is up looks off-center, because
  //  .main shifts with the sidebar; the dialog is always viewport-centered)
  const dlg = document.querySelector('.modal-backdrop.active .modal');
  const ref = dlg || document.querySelector('.main');
  if (ref) {
    const rc = ref.getBoundingClientRect();
    t.style.left = Math.round(rc.left + rc.width / 2) + 'px';
  }
  t.textContent = msg;
  t.className = type;
  t.classList.add('show');
  clearTimeout(t._timer);
  t._timer = setTimeout(() => hideToast(), ms);
}
function hideToast() {
  const t = $('#toast');
  if (!t) return;
  clearTimeout(t._timer);
  t.classList.remove('show');
}
$('#toast').addEventListener('click', hideToast);

function esc(s) {
  const d = document.createElement('div');
  d.textContent = s;
  return d.innerHTML;
}

function getStreamBubble(box) {
  const list = box.querySelectorAll('.stream-target');
  return list.length ? list[list.length - 1] : null;
}

function renderMarkdown(text) {
  let html = esc(text);
  html = html.replace(/```(\w*)\n([\s\S]*?)```/g, (m, lang, code) =>
    `<pre><code>${code}</code></pre>`);
  // streaming: auto-close unterminated code fence so python code renders as block, not raw
  const openFence = html.match(/```(\w*)\n?([\s\S]*)$/);
  if (openFence) {
    html = html.slice(0, openFence.index) + `<pre><code>${openFence[2]}</code></pre>`;
  }
  html = html.replace(/`([^`\n]+)`/g, '<code>$1</code>');
  html = html.replace(/\*\*([^*\n]+)\*\*/g, '<strong>$1</strong>');
  html = html.replace(/<pre>/g, '<pre><button type="button" class="code-copy" tabindex="-1">' + ICON_COPY + ' copy</button>');
  if (typeof hljs !== 'undefined') {
    const tmp = document.createElement('div');
    tmp.innerHTML = html;
    tmp.querySelectorAll('pre > code').forEach(el => {
      try { hljs.highlightElement(el); } catch (_) {}
    });
    html = tmp.innerHTML;
  }
  return html;
}

// ---------- global image paste/drop guard (document level) ----------
function blockImagePaste(e) {
  const dt = e.clipboardData || (e.originalEvent && e.clipboardData);
  if (!dt) return;
  if (dt.items && dt.items.length) {
    for (const item of dt.items) {
      if (item.type && item.type.startsWith('image/')) {
        e.preventDefault();
        e.stopPropagation();
        toast(t('err_image_only'), 'error');
        return;
      }
    }
  }
  const text = dt.getData ? dt.getData('text/plain') : '';
  if (text && /[^\s]*\.(jpe?g|png|gif|webp|bmp|heic)\b/i.test(text)) {
    e.preventDefault();
    e.stopPropagation();
    if (inputMsg) {
      const cleaned = text.replace(/[^\s]*\.(jpe?g|png|gif|webp|bmp|heic)\b/gi, '').replace(/\s{2,}/g, ' ').trim();
      inputMsg.value = cleaned;
      inputMsg.focus();
    }
    toast(t('err_image_only'), 'error');
  }
}
document.addEventListener('paste', blockImagePaste, true); // capture phase: beats all
document.addEventListener('drop', (e) => {
  if (e.dataTransfer && e.dataTransfer.files && e.dataTransfer.files.length) {
    for (const f of e.dataTransfer.files) {
      if (f.type.startsWith('image/')) {
        e.preventDefault();
        e.stopPropagation();
        toast(t('err_image_only'), 'error');
        return;
      }
    }
  }
}, true);
window.addEventListener('dragover', (e) => e.preventDefault()); // stop browser opening image

// ---------- show password (press & hold, Gmail style) ----------
(function () {
  const eye = document.getElementById('pw-eye');
  const input = document.getElementById('login-pass');
  if (!eye || !input) return;
  const show = (e) => {
    if (e) e.preventDefault();
    input.type = 'text';
    const o = eye.querySelector('.eye-open');
    const c = eye.querySelector('.eye-closed');
    if (o) o.style.display = 'none';
    if (c) c.style.display = 'block';
  };
  const hide = () => {
    input.type = 'password';
    const o = eye.querySelector('.eye-open');
    const c = eye.querySelector('.eye-closed');
    if (o) o.style.display = 'block';
    if (c) c.style.display = 'none';
  };
  eye.addEventListener('mousedown', show);
  eye.addEventListener('touchstart', show, { passive: false });
  ['mouseup', 'mouseleave', 'touchend', 'touchcancel'].forEach(ev => eye.addEventListener(ev, hide));
  eye.addEventListener('keydown', (e) => { if (e.key === 'Enter' || e.key === ' ') show(e); });
  eye.addEventListener('keyup', hide);
})();

// ---------- auth ----------
let guestAllowed = false;
async function refreshGuestButton() {
  const btn = $('#btn-guest'); if (!btn) return;
  try {
    const cfg = await (await fetch('/api/guest-config')).json();
    guestAllowed = !!(cfg && cfg.enabled);
  } catch (_) { guestAllowed = false; }
  btn.hidden = !guestAllowed;
  const lbl = $('#guest-btn-label'); if (lbl) lbl.textContent = t('guest_btn');
}
$('#btn-guest').addEventListener('click', async () => {
  const btn = $('#btn-guest');
  btn.disabled = true;
  try {
    const r = await fetch('/api/guest', { method: 'POST' });
    const data = await r.json().catch(() => ({}));
    if (!r.ok) { $('#login-error').textContent = terr(data.error) || data.error || 'Error'; return; }
    await enterApp();
  } catch (e) {
    $('#login-error').textContent = 'Guest error: ' + e.message;
  } finally {
    btn.disabled = false;
  }
});
refreshGuestButton();

$('#login-form').addEventListener('submit', async (e) => {
  e.preventDefault();
  $('#login-error').textContent = '';
  try {
  const r = await fetch('/api/login', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ username: $('#login-user').value, password: $('#login-pass').value })
  });
  const data = await r.json();
  const errEl = $('#login-error');
  if (!r.ok) {
    if (data.error === 'ERR_RATE_LIMITED') {
      const sec = data.retryAfterSec || 120;
      errEl.textContent = terr('ERR_RATE_LIMITED') + ' ' + sec + ' ' + terr('ERR_RATE_LIMITED_SEC');
      let left = sec;
      const iv = setInterval(() => {
        left--;
        if (left <= 0) { clearInterval(iv); errEl.textContent = ''; return; }
        errEl.textContent = terr('ERR_RATE_LIMITED') + ' ' + left + ' ' + terr('ERR_RATE_LIMITED_SEC');
      }, 1000);
    } else if (data.error === 'ERR_LOGIN' && typeof data.remainingAttempts === 'number' && data.remainingAttempts > 0 && data.remainingAttempts < 5) {
      errEl.textContent = terr(data.error) + ' (' + t('login_remaining', data.remainingAttempts) + ')';
    } else {
      errEl.textContent = terr(data.error) || t('err_login');
    }
    const card = $('#login-view .login-card');
    if (card) { card.classList.remove('shake'); void card.offsetWidth; card.classList.add('shake'); }
    return;
  }
  await enterApp();
  try { routeFromURL(); } catch (e) { console.warn('post-login route:', e); }
  } catch (err) {
    console.error('[TT] login flow error:', err);
    const el = $('#login-error');
    if (el) el.textContent = 'Login error: ' + err.message;
  }
});

$('#btn-logout').addEventListener('click', () => {
  $('#modal-logout').classList.add('active');
  $('#logout-ok').focus();
});
$('#logout-cancel').addEventListener('click', () => $('#modal-logout').classList.remove('active'));
$('#logout-ok').addEventListener('click', async () => {
  $('#modal-logout').classList.remove('active');
  if (abortCtrl) abortCtrl.abort(); // stop stream berjalan
  await fetch('/api/logout', { method: 'POST' });
  leavingToLogin(() => {
    stopGuestTimer();
    currentUser = null;
    currentChatId = null;
    chats = [];
    allModelsCache = [];
    $('#btn-admin').classList.remove('show');
    $('#login-user').value = '';
    $('#login-pass').value = '';
    $('#login-error').textContent = '';
    $('#model-select').innerHTML = '';
    $('#chat-list').innerHTML = '';
    $('#chat-search').value = '';
    $('#messages').innerHTML = '';
    $('#modal-admin').classList.remove('active');
    history.replaceState({}, '', '/');
    document.title = 'Teman Tanyamu';
  });
  setTimeout(() => { refreshGuestButton(); $('#login-user').focus(); }, 180);
});

function showLoginViewAnimated() {
  $('#app-view').classList.remove('ready', 'active', 'leaving');
  const lv = $('#login-view');
  lv.style.display = '';
  lv.classList.add('ready');
  // re-trigger entrance on the card + footer (element was visible:hidden before -> force restart)
  const lc = lv.querySelector('.login-card');
  if (lc) lc.classList.remove('shake');
  for (const sel of ['.login-card', '#login-foot-el', '#login-btn-el']) {
    const el = lv.querySelector(sel);
    if (el) { el.style.animation = 'none'; void el.offsetWidth; el.style.animation = ''; }
  }
}
function leavingToLogin(after) {
  const av = $('#app-view');
  av.classList.add('leaving');
  setTimeout(() => { after(); showLoginViewAnimated(); }, 160);
}

async function enterApp() {
  let r;
  try {
    r = await fetch('/api/me');
  } catch (e) { return; }
  if (!r.ok) return;
  currentUser = await r.json();
  const lv = $('#login-view');
  lv.classList.add('leaving');
  setTimeout(() => { lv.style.display = 'none'; lv.classList.remove('ready', 'leaving'); }, 160);
  $('#app-view').classList.add('ready', 'active');
  $('#lbl-user').textContent = currentUser.username;
  renderSideAvatar();
  updateQuota();
  syncGuestState();
  if (currentUser.role === 'admin') $('#btn-admin').classList.add('show');
  await Promise.all([loadModels(), loadChats()]); // parallel boot: no serial gateway wait
  updateModelBadge();
  await applyWallpaper();
}

function effectiveChatModel() {
  // what the next message will actually use: open chat's model > user override > global default
  const sel = $('#model-select');
  return (sel && sel.value) || currentUser.model_override || currentUser.effective_model || currentUser.global_model || '';
}
function updateModelBadge() {
  const el = $('#lbl-quota');
  if (!currentUser || !el) return;
  let chip = el.querySelector('.qmodel');
  const model = effectiveChatModel();
  if (model) {
    if (!chip) {
      chip = document.createElement('span');
      chip.className = 'qmodel';
      chip.innerHTML = '<span class="qk"></span><b></b>';
      el.appendChild(chip);
    }
    chip.querySelector('.qk').textContent = t('quota_chip_model');
    chip.querySelector('b').textContent = model;
    chip.querySelector('b').title = model;
  } else if (chip) {
    chip.remove();
  }
}

function isGuest() { return !!(currentUser && currentUser.guest); }

// ---------- SPA router: / , /c/:id , /account , /admin (Open WebUI style URLs) ----------
function closePanels() {
  $('#modal-admin').classList.remove('active');
  $('#modal-settings').classList.remove('active');
}
function openSettingsPage() {
  if (isGuest()) { toast(terr('ERR_GUEST_NOPE'), 'error'); return; }
  $('#modal-settings').classList.add('active');
  $('#settings-username').textContent = t('settings_as', currentUser.username);
  renderSettingsAvatar();
  renderWallpaperPresets();
  renderMemoryFacts();
}
function openAdminPage() {
  if (isGuest() || !currentUser || currentUser.role !== 'admin') { toast(t('nav_off_guest'), 'error'); goReplace('/'); return; }
  $('#modal-admin').classList.add('active');
  loadRouterConfig();
  loadAdminPanel();
  loadOpsPanel(true);
}
function routeFromURL() {
  const p = location.pathname;
  if (!currentUser) return; // login view stays; after login we re-route
  if (isGuest() && p !== '/') { toast(t('nav_off_guest'), 'error'); goReplace('/'); return; }
  if (p === '/login') { goReplace('/'); return; }
  const m = p.match(/^\/c\/(\d+)$/);
  if (m) {
    closePanels();
    const id = Number(m[1]);
    if (id === currentChatId) return;
    if (isGuest()) { toast(t('nav_off_guest'), 'error'); goReplace('/'); return; }
    if (!chats.some(c => c.id === id)) { toast(t('share_notfound'), 'error'); goReplace('/'); return; }
    openChat(id).catch(() => { toast(t('share_notfound'), 'error'); goReplace('/'); });
    return;
  }
  if (p === '/account') {
    $('#modal-admin').classList.remove('active');
    if (!$('#modal-settings').classList.contains('active')) openSettingsPage();
    return;
  }
  if (p === '/admin') {
    $('#modal-settings').classList.remove('active');
    if (!$('#modal-admin').classList.contains('active')) openAdminPage();
    return;
  }
  closePanels();
}
function go(path) {
  if (location.pathname !== path) history.pushState({}, '', path);
  routeFromURL();
}
function goReplace(path) {
  if (location.pathname !== path) history.replaceState({}, '', path);
  routeFromURL();
}
window.addEventListener('popstate', () => { try { routeFromURL(); } catch (e) { console.warn('popstate route:', e); } });
async function copyText(txt) {
  try { await navigator.clipboard.writeText(txt); return true; } catch (_) {}
  try {
    const ta = document.createElement('textarea');
    ta.value = txt; ta.style.position = 'fixed'; ta.style.opacity = '0';
    document.body.appendChild(ta); ta.select();
    const ok = document.execCommand('copy');
    ta.remove(); return !!ok;
  } catch (_) { return false; }
}

let guestCountdownIv = null;
function fmtMMSS(sec) {
  sec = Math.max(0, Math.floor(sec));
  const m = Math.floor(sec / 60), s = sec % 60;
  return m + ':' + String(s).padStart(2, '0');
}
function stopGuestTimer() {
  if (guestCountdownIv) { clearInterval(guestCountdownIv); guestCountdownIv = null; }
}
function startGuestTimer() {
  stopGuestTimer();
  if (!isGuest()) return;
  guestCountdownIv = setInterval(() => {
    if (!currentUser || !currentUser.guest) { stopGuestTimer(); return; }
    currentUser.seconds_left = (currentUser.seconds_left || 0) - 1;
    updateQuota();
    if (currentUser.seconds_left <= 0) {
      stopGuestTimer();
      openGuestModal('time');
    }
  }, 1000);
}

function afterGuestRefresh() {
  if (!currentUser || !currentUser.guest) return;
  if (currentUser.expired || currentUser.seconds_left <= 0) openGuestModal('time');
  else if (currentUser.quota_used >= currentUser.quota_max) openGuestModal('chats');
}
function syncGuestState() {
  if (!currentUser) { stopGuestTimer(); return; }
  if (!currentUser.guest) { stopGuestTimer(); return; }
  startGuestTimer();
  if (currentUser.expired || currentUser.seconds_left <= 0) openGuestModal('time');
  else if (currentUser.quota_used >= currentUser.quota_max) openGuestModal('chats');
}
function handleGuestError(code, box) {
  if (code !== 'ERR_GUEST_CHATS' && code !== 'ERR_GUEST_TIME') return false;
  // undo the optimistic user+assistant bubbles: server stored nothing
  const blocks = box ? [...box.querySelectorAll(':scope .msg-block')] : [];
  for (let k = 0; k < 2 && blocks.length; k++) {
    const b = blocks[blocks.length - 1 - k];
    if (b) b.remove();
  }
  openGuestModal(code === 'ERR_GUEST_TIME' ? 'time' : 'chats');
  return true;
}
function openGuestModal(reason) {
  $('#guest-modal-title').textContent = t('guest_title');
  $('#guest-modal-text').textContent = reason === 'time' ? t('guest_text_time') : t('guest_text_chats');
  $('#guest-later').textContent = t('guest_later');
  $('#guest-login-now').textContent = t('guest_login_now');
  $('#modal-guest').classList.add('active');
  $('#guest-login-now').focus();
}
function goLoginFromGuest() {
  $('#modal-guest').classList.remove('active');
  fetch('/api/logout', { method: 'POST' }).catch(() => {});
  stopGuestTimer();
  currentUser = null;
  currentChatId = null;
  chats = [];
  allModelsCache = [];
  $('#app-view').classList.remove('ready', 'active');
  $('#btn-admin').classList.remove('show');
  $('#login-view').style.display = '';
  $('#login-view').classList.add('ready');
  $('#login-user').value = '';
  $('#login-pass').value = '';
  $('#login-error').textContent = '';
  $('#model-select').innerHTML = '';
  $('#chat-list').innerHTML = '';
  $('#chat-search').value = '';
  $('#messages').innerHTML = '';
  $('#modal-admin').classList.remove('active');
  $('#modal-settings').classList.remove('active');
  history.replaceState({}, '', '/');
  document.title = 'Teman Tanyamu';
  refreshGuestButton();
  $('#login-user').focus();
}
$('#guest-login-now').addEventListener('click', goLoginFromGuest);
$('#guest-later').addEventListener('click', () => {
  $('#modal-guest').classList.remove('active');
  toast(t('guest_ended_toast'), 'error');
});

function updateQuota() {
  if (!currentUser) return;
  const el = $('#lbl-quota');
  let text;
  if (currentUser.guest) {
    text = t('guest_quota', currentUser.quota_used, currentUser.quota_max) + t('guest_time', fmtMMSS(currentUser.seconds_left));
    el.className = 'uquota' + (currentUser.quota_used >= currentUser.quota_max || currentUser.seconds_left <= 0 ? ' warn' : '');
    el.innerHTML = `<span class="qtext">${esc(text)}</span>`;
    updateModelBadge();
    return;
  }
  if (currentUser.role === 'admin') {
    text = `${t('quota_admin_role')} — ${t('quota_admin_unlimited')}`;
    el.className = 'uquota';
  } else {
    const warn = currentUser.quota_used >= currentUser.quota_max;
    text = t('quota_user', currentUser.quota_used, currentUser.quota_max);
    el.className = 'uquota' + (warn ? ' warn' : '');
  }
  el.innerHTML = `<span class="qtext">${esc(text)}</span>`;
  updateModelBadge();
}

// ---------- models ----------
let headerModels = [];
function setSelectDisabled(sel, disabled) {
  sel.disabled = disabled;
  const combo = sel.closest('.model-combo');
  if (combo) {
    const btn = combo.querySelector('.model-combo-btn');
    if (btn) btn.disabled = disabled;
    if (disabled) closeModelCombo(combo);
  }
  if (sel.id === 'model-select') applyModelLockUI(disabled);
}

function applyModelLockUI(locked) {
  const wrap = document.querySelector('.model-picker-wrap');
  if (!wrap) return;
  wrap.classList.toggle('is-locked', !!locked);
  const chip = $('#model-lock');
  if (!chip) return;
  if (locked) {
    chip.hidden = false;
    const txt = chip.querySelector('.model-lock-text');
    if (txt) txt.textContent = t('model_lock_short');
    chip.title = t('model_locked') + '. ' + t('model_locked_hint');
  } else {
    chip.hidden = true;
  }
}

async function loadModels() {
  try {
    const r = await fetch('/api/models');
    if (!r.ok) throw new Error('fetch failed');
    headerModels = await r.json();
    const sel = $('#model-select');
    setSelectDisabled(sel, false); // re-enable (mis. setelah logout dari akun non-admin)
    sel.innerHTML = headerModels.map(m => `<option value="${esc(m)}">${esc(m)}</option>`).join('');
    const preferred = currentUser && currentUser.effective_model;
    if (preferred && headerModels.includes(preferred)) sel.value = preferred;
    else {
      const saved = localStorage.getItem('model');
      if (saved && headerModels.includes(saved)) sel.value = saved;
    }
    updateModelCombo();
    if (currentUser && currentUser.role !== 'admin') {
      setSelectDisabled(sel, true);
      sel.title = t('model_locked');
      const combo = sel.closest('.model-combo');
      const btn = combo && combo.querySelector('.model-combo-btn');
      if (btn) btn.title = t('model_locked');
      const lbl = document.querySelector('.model-label');
      if (lbl) lbl.textContent = t('model_label');
    }
  } catch (e) {
    toast(t('conn_offline'), 'error');
  }
}

// ---------- searchable model combobox (Open WebUI style) ----------
const ICON_SEARCH = '<svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="11" cy="11" r="8"/><line x1="21" y1="21" x2="16.65" y2="16.65"/></svg>';
const ICON_CHEV = '<svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><polyline points="6 9 12 15 18 9"/></svg>';
const ICON_CHECK = '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><polyline points="20 6 9 17 4 12"/></svg>';
const comboState = { list: [], filter: '', hl: 0, sel: '', srcSel: null };

function enhanceModelSelects() {
  document.querySelectorAll('select[data-combo]').forEach(sel => {
    if (sel.dataset.enhanced) return;
    sel.dataset.enhanced = '1';
    sel.classList.add('combo-source');
    const combo = document.createElement('div');
    combo.className = 'model-combo';
    if (sel.hasAttribute('data-combo-stretch')) combo.classList.add('combo-stretch');
    combo.innerHTML = `
      <button type="button" class="model-combo-btn" aria-haspopup="listbox" aria-expanded="false">
        <span class="combo-val"></span>
        <span class="combo-chev">${ICON_CHEV}</span>
      </button>`;
    sel.parentNode.insertBefore(combo, sel);
    combo.appendChild(sel);
    combo.querySelector('.model-combo-btn').addEventListener('click', (e) => {
      e.stopPropagation();
      toggleModelCombo(combo, sel);
    });
  });
  updateAllModelCombos();
}

function updateAllModelCombos() {
  document.querySelectorAll('select[data-combo]').forEach(updateModelCombo);
}

function updateModelCombo(sel) {
  sel = sel || $('#model-select');
  if (!sel) return;
  const combo = sel.closest('.model-combo');
  if (!combo) return;
  const val = combo.querySelector('.combo-val');
  const opt = sel.options[sel.selectedIndex];
  val.textContent = (opt && opt.textContent) || sel.value || '';
}

function toggleModelCombo(combo, sel) {
  if (combo.classList.contains('open')) { closeModelCombo(combo); return; }
  closeModelCombo();
  const list = [...sel.options].map(o => ({ value: o.value, label: o.textContent.trim() }));
  comboState.srcSel = sel; comboState.list = list; comboState.filter = ''; comboState.hl = 0; comboState.sel = sel.value;
  const pop = document.createElement('div');
  pop.className = 'model-combo-pop';
  pop.innerHTML = `
    <div class="model-combo-search">${ICON_SEARCH}<input type="text" autocomplete="off"></div>
    <div class="model-combo-list" role="listbox"></div>`;
  document.body.appendChild(pop);
  const rect = combo.getBoundingClientRect();
  const pw = Math.min(Math.max(rect.width, 260), window.innerWidth - 16);
  pop.style.left = Math.max(8, Math.min(rect.left, window.innerWidth - pw - 8)) + 'px';
  pop.style.width = pw + 'px';
  const below = rect.bottom + 6;
  const ph = pop.offsetHeight;
  pop.style.top = (below + ph > window.innerHeight && rect.top - 6 - ph > 0)
    ? (rect.top - 6 - ph) + 'px' : below + 'px';
  combo.classList.add('open');
  setTimeout(() => pop.classList.add('open'), 20);
  combo._pop = pop;
  const search = pop.querySelector('input');
  search.placeholder = t('combo_search_ph');
  renderComboItems();
  setTimeout(() => search.focus(), 30);
  search.addEventListener('input', () => { comboState.filter = search.value.trim().toLowerCase(); comboState.hl = 0; renderComboItems(); });
  search.addEventListener('keydown', comboKeys);
  pop.addEventListener('click', (e) => e.stopPropagation());
}

function comboMatches() {
  const f = comboState.filter;
  return comboState.list.filter(o => !f || o.label.toLowerCase().includes(f) || (o.value || '').toLowerCase().includes(f));
}

function renderComboItems() {
  const pop = comboState.srcSel && comboState.srcSel.closest('.model-combo')._pop;
  if (!pop) return;
  const box = pop.querySelector('.model-combo-list');
  const matches = comboMatches();
  if (!matches.length) { box.innerHTML = `<div class="model-combo-empty">${esc(t('combo_no_results'))}</div>`; return; }
  box.innerHTML = matches.map((o, i) => `
    <button type="button" class="model-combo-item ${i === comboState.hl ? 'hl' : ''} ${o.value === comboState.sel ? 'sel' : ''}" data-value="${esc(o.value)}" data-label="${esc(o.label)}" role="option">
      <span>${esc(o.label)}</span>${o.value === comboState.sel ? `<span class="combo-check">${ICON_CHECK}</span>` : ''}
    </button>`).join('');
  box.querySelectorAll('.model-combo-item').forEach(btn => {
    btn.addEventListener('click', () => pickComboModel(btn.dataset.value));
  });
}

function comboKeys(e) {
  const matches = comboMatches();
  if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
    e.preventDefault();
    comboState.hl = Math.max(0, Math.min(matches.length - 1, comboState.hl + (e.key === 'ArrowDown' ? 1 : -1)));
    renderComboItems();
    const hl = comboState.srcSel.closest('.model-combo')._pop.querySelector('.model-combo-item.hl');
    if (hl) hl.scrollIntoView({ block: 'nearest' });
  } else if (e.key === 'Enter') {
    e.preventDefault();
    if (matches[comboState.hl]) pickComboModel(matches[comboState.hl].value);
  } else if (e.key === 'Escape') {
    e.preventDefault(); e.stopPropagation();
    closeModelCombo();
    if (comboState.srcSel) comboState.srcSel.closest('.model-combo').querySelector('.model-combo-btn').focus();
  }
}

function pickComboModel(model) {
  const sel = comboState.srcSel;
  if (!sel) return;
  closeModelCombo();
  if (sel.value === model) { updateModelCombo(sel); return; }
  sel.value = model;
  updateModelCombo(sel);
  if (sel === $('#model-select')) {
    sel.dispatchEvent(new Event('change'));
  } else {
    sel.dispatchEvent(new Event('change', { bubbles: true }));
  }
}

function closeModelCombo(combo) {
  combo = combo || document.querySelector('.model-combo.open');
  if (!combo || !combo._pop) { document.querySelectorAll('.model-combo.open').forEach(c => { c.classList.remove('open'); }); return; }
  combo.classList.remove('open');
  combo._pop.classList.remove('open');
  const pop = combo._pop;
  combo._pop = null;
  setTimeout(() => pop.remove(), 170);
}

document.addEventListener('click', () => closeModelCombo());
document.addEventListener('scroll', (e) => {
  // scrolling INSIDE the open popup (model list / chat menu) must not close it
  const el = e.target;
  if (el && el.nodeType === 1 && el.closest && (el.closest('.model-combo-pop') || el.closest('.chat-menu'))) return;
  closeModelCombo(); closeChatMenu();
}, true);

$('#model-select').addEventListener('change', async (e) => {
  const model = e.target.value;
  localStorage.setItem('model', model);
  updateModelBadge();
  if (currentChatId) {
    await fetch(`/api/chats/${currentChatId}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ model })
    });
  }
  if (currentUser && currentUser.role === 'admin') {
    await fetch('/api/me/model', {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ model })
    });
    const me = await (await fetch('/api/me')).json();
    if (me.username) { currentUser = me; updateQuota(); updateModelBadge(); afterGuestRefresh(); }
  }
  toast(t('model_changed', model), 'success');
});

// ---------- chats ----------
let showArchived = false;
const ICON_DOTS = '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><circle cx="12" cy="5" r="1"/><circle cx="12" cy="12" r="1"/><circle cx="12" cy="19" r="1"/></svg>';
function chatItemHTML(c) {
  return `
    <div class="chat-item ${c.id === currentChatId ? 'active' : ''} ${c.pinned ? 'pinned' : ''}" data-id="${c.id}" role="button" tabindex="0">
      <span class="ico">${c.lean ? '<span class="lean-dot" title="' + esc(t('lean_badge')) + '">⚡</span>' : ICON_CHAT}</span>
      <span class="title">${c.pinned ? '<span class="pin-mark"><svg width="10" height="10" viewBox="0 0 24 24" fill="currentColor"><path d="M14 4l6 6-3.5 1-3.5 5-2-2-5 3.5L3 22l1-1 1-1 4.5-3.5-2-2 5-3.5L16 7z"/></svg></span>' : ''}${esc(c.title)}${c.shared ? '<span class="share-mark" title="' + esc(t('unshare_chat')) + '">🔗</span>' : ''}${c.tag ? ' <span class="chat-tag">#' + esc(c.tag) + '</span>' : ''}</span>
      <button class="del" data-menu="${c.id}" aria-label="…" title="…">${ICON_DOTS}</button>
      <button class="del" data-rename="${c.id}" aria-label="${esc(t('rename_chat'))} ${esc(c.title)}" title="${esc(t('rename_chat'))}">✎</button>
      <button class="del" data-del="${c.id}" aria-label="${esc(t('del_chat'))} ${esc(c.title)}" title="${esc(t('del_chat'))}">✕</button>
    </div>`;
}
let chatMenuEl = null;
function closeChatMenu() { if (chatMenuEl) { chatMenuEl.remove(); chatMenuEl = null; } }
function openChatMenu(id, anchor) {
  closeChatMenu();
  const c = chats.find(x => x.id === id);
  if (!c) return;
  const menu = document.createElement('div');
  menu.className = 'chat-menu';
  const svg = (d) => `<svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">${d}</svg>`;
  const items = [
    ['pin', c.pinned ? t('unpin_chat') : t('pin_chat'), svg('<path d="M12 17v5"/><path d="M9 10.76a2 2 0 0 1-1.11 1.79l-1.78.9A2 2 0 0 0 5 15.24V16a1 1 0 0 0 1 1h12a1 1 0 0 0 1-1v-.76a2 2 0 0 0-1.11-1.79l-1.78-.9A2 2 0 0 1 15 10.76V7a1 1 0 0 1 1-1 2 2 0 0 0 0-4H8a2 2 0 0 0 0 4 1 1 0 0 1 1 1z"/>')],
    ['tag', t('tag_chat'), svg('<path d="M20.59 13.41l-7.17 7.17a2 2 0 0 1-2.83 0L2 12V2h10l8.59 8.59a2 2 0 0 1 0 2.82z"/><line x1="7" y1="7" x2="7.01" y2="7"/>')],
    ['fork', t('fork_chat'), svg('<circle cx="6" cy="6" r="3"/><circle cx="18" cy="6" r="3"/><circle cx="12" cy="18" r="3"/><path d="M6 9v1a2 2 0 0 0 2 2h8a2 2 0 0 0 2-2V9"/><line x1="12" y1="12" x2="12" y2="15"/>')],
    ['arch', c.archived ? t('unarchive_chat') : t('archive_chat'), c.archived
      ? svg('<polyline points="20.5 11 12 3 3.5 11"/><path d="M4 15v4a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2v-4"/>')
      : svg('<rect x="2" y="3" width="20" height="5" rx="1"/><path d="M4 8v11a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8"/><line x1="10" y1="12" x2="14" y2="12"/>')],
    [c.shared ? 'unshare' : 'share', c.shared ? t('unshare_chat') : t('share_chat'), svg('<circle cx="18" cy="5" r="3"/><circle cx="6" cy="12" r="3"/><circle cx="18" cy="19" r="3"/><line x1="8.59" y1="13.51" x2="15.42" y2="17.49"/><line x1="15.41" y1="6.51" x2="8.59" y2="10.49"/>')]
  ];
  menu.innerHTML = items.map(([act, label, ic]) =>
    `<button class="cm-item" data-cm="${act}" data-cmid="${id}"><span class="cm-ic">${ic}</span>${esc(label)}</button>`).join('');
  document.body.appendChild(menu);
  const r = anchor.getBoundingClientRect();
  const mw = 190, mh = menu.offsetHeight || 150;
  menu.style.left = Math.max(8, Math.min(r.right - mw, innerWidth - mw - 8)) + 'px';
  menu.style.top = (r.bottom + mh > innerHeight - 8 ? Math.max(8, r.top - mh - 4) : r.bottom + 4) + 'px';
  chatMenuEl = menu;
}
document.addEventListener('click', (e) => {
  const mb = e.target.closest('[data-menu]');
  if (mb) { e.stopPropagation(); openChatMenu(Number(mb.dataset.menu), mb); return; }
  const cm = e.target.closest('[data-cm]');
  if (cm) {
    e.stopPropagation();
    const id = Number(cm.dataset.cmid), act = cm.dataset.cm;
    closeChatMenu();
    chatMenuAction(id, act);
    return;
  }
  if (!e.target.closest('.chat-menu')) closeChatMenu();
});
async function chatMenuAction(id, act) {
  const c = chats.find(x => x.id === id);
  if (!c) return;
  if (act === 'pin') {
    await fetch(`/api/chats/${id}`, { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ pinned: !c.pinned }) });
    await loadChats();
  } else if (act === 'arch') {
    await fetch(`/api/chats/${id}`, { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ archived: !c.archived }) });
    if (id === currentChatId && !c.archived) { currentChatId = null; $('#messages').innerHTML = emptyStateHTML(); }
    await loadChats();
    toast(t(c.archived ? 'unarchive_chat' : 'archive_chat'), 'success');
  } else if (act === 'fork') {
    const r = await fetch(`/api/chats/${id}/fork`, { method: 'POST' });
    if (!r.ok) { toast(terr((await r.json()).error), 'error'); return; }
    const nc = await r.json();
    await loadChats();
    openChat(nc.id);
    toast(t('fork_chat'), 'success');
  } else if (act === 'tag') {
    openTagModal(id);
  } else if (act === 'share') {
    try {
      const r = await fetch(`/api/chats/${id}/share`, { method: 'POST' });
      if (!r.ok) { toast(terr((await r.json().catch(() => ({}))).error) || t('share_fail'), 'error'); return; }
      const d = await r.json();
      const url = location.origin + '/s/' + d.token;
      const copied = await copyText(url);
      await loadChats();
      toast(copied ? t('share_copied') : t('share_on'), 'success');
      if (!copied) setTimeout(() => toast(url, 'success', 6000), 400);
    } catch (_) { toast(t('share_fail'), 'error'); }
  } else if (act === 'unshare') {
    openWarn({
      title: t('warn_unshare_title'),
      text: t('warn_unshare_text'),
      okLabel: t('warn_do_revoke'),
      onOk: async () => {
        await fetch(`/api/chats/${id}/share`, { method: 'DELETE' });
        await loadChats();
        toast(t('share_off'), 'success');
      }
    });
  }
}
async function loadChats() {
  chats = await (await fetch('/api/chats')).json();
  const list = $('#chat-list');
  const live = chats.filter(c => !c.archived);
  const arch = chats.filter(c => c.archived);
  if (!chats.length) {
    list.innerHTML = '<div class="chat-empty-hint" style="padding:10px 8px; font-size:12.5px; color:var(--text-3);">' + t('chat_empty') + '</div>';
    return;
  }
  let html = live.map(chatItemHTML).join('');
  if (arch.length) {
    html += `<div class="side-section arch-toggle" id="arch-toggle" role="button" tabindex="0">${esc(t('archived_section'))} (${arch.length})</div>`;
    if (showArchived) html += arch.map(chatItemHTML).join('');
  }
  list.innerHTML = html;
}

// ---------- chat search filter ----------
$('#chat-search').addEventListener('input', () => {
  const q = $('#chat-search').value.trim().toLowerCase();
  document.querySelectorAll('#chat-list .chat-item').forEach(el => {
    const title = el.querySelector('.title');
    el.style.display = (!q || (title && title.textContent.toLowerCase().includes(q))) ? '' : 'none';
  });
});

$('#chat-list').addEventListener('click', async (e) => {
  const ren = e.target.closest('[data-rename]');
  if (ren) {
    e.stopPropagation();
    const id = Number(ren.dataset.rename);
    const chat = chats.find(c => c.id === id);
    openRenameModal(id, chat ? chat.title : '');
    return;
  }
  const del = e.target.closest('[data-del]');
  if (del) {
    e.stopPropagation();
    pendingDeleteId = Number(del.dataset.del);
    const chat = chats.find(c => c.id === pendingDeleteId);
    $('#confirm-title').textContent = t('confirm_title');
    $('#confirm-text').textContent = t('confirm_del', chat ? chat.title : '');
    $('#confirm-ok').textContent = t('del_ok');
    $('#modal-confirm').classList.add('active');
    $('#confirm-ok').focus();
    return;
  }
  if (e.target.closest('#arch-toggle')) { showArchived = !showArchived; loadChats(); return; }
  const item = e.target.closest('.chat-item');
  if (item) {
    const id = Number(item.dataset.id);
    await openChat(id);
    if (!isGuest() && e.target.closest('.title')) go('/c/' + id);
  }
});

// tag editor: small inline row inside the chat item (no new modal needed)
function openTagModal(id) {
  const item = document.querySelector(`.chat-item[data-id="${id}"]`);
  if (!item || item.querySelector('.tag-edit')) return;
  const c = chats.find(x => x.id === id);
  const row = document.createElement('div');
  row.className = 'tag-edit';
  const inp = document.createElement('input');
  inp.type = 'text'; inp.maxLength = 32; inp.placeholder = t('tag_ph'); inp.value = c && c.tag ? c.tag : '';
  const ok = document.createElement('button');
  ok.className = 'btn-primary'; ok.textContent = t('tag_save');
  row.append(inp, ok);
  item.after(row);
  inp.focus();
  const save = async () => {
    const v = inp.value.trim();
    await fetch(`/api/chats/${id}`, { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ tag: v }) });
    row.remove();
    await loadChats();
  };
  ok.addEventListener('click', save);
  inp.addEventListener('keydown', (e) => { if (e.key === 'Enter') save(); if (e.key === 'Escape') row.remove(); });
}

$('#chat-list').addEventListener('keydown', (e) => {
  if (e.key === 'Enter' && e.target.classList.contains('chat-item')) {
    openChat(Number(e.target.dataset.id));
  }
});

// ---------- rename chat modal (no native prompt) ----------
let pendingRenameId = null;
function openRenameModal(id, currentTitle) {
  pendingRenameId = id;
  $('#rename-title').textContent = t('rename_title');
  $('#rename-label').textContent = t('rename_label');
  $('#rename-cancel').textContent = t('cancel');
  $('#rename-ok').textContent = t('rename_save');
  const inp = $('#rename-input');
  inp.value = currentTitle || '';
  $('#modal-rename').classList.add('active');
  setTimeout(() => { inp.focus(); inp.select(); }, 60);
}
function closeRenameModal() {
  $('#modal-rename').classList.remove('active');
  pendingRenameId = null;
}
async function submitRename() {
  if (pendingRenameId == null) return;
  const id = pendingRenameId;
  const title = $('#rename-input').value.trim();
  if (!title) return;
  closeRenameModal();
  const r = await fetch(`/api/chats/${id}`, {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ title })
  });
  if (!r.ok) { toast(terr((await r.json()).error) || terr('ERR_GENERIC'), 'error'); return; }
  await loadChats();
  toast(t('chat_renamed'), 'success');
}
$('#rename-cancel').addEventListener('click', closeRenameModal);
$('#rename-ok').addEventListener('click', submitRename);
$('#rename-input').addEventListener('keydown', (e) => {
  if (e.key === 'Enter') { e.preventDefault(); submitRename(); }
});
$('#modal-rename').addEventListener('click', (e) => { if (e.target === e.currentTarget) closeRenameModal(); });

// ---------- edit quota modal (admin) ----------
let pendingQuotaUserId = null;
function openQuotaModal(userId, uname, current) {
  pendingQuotaUserId = userId;
  $('#quota-title').textContent = t('quota_edit_title') + ' — ' + uname;
  $('#quota-label').textContent = t('quota_edit_label');
  $('#quota-cancel').textContent = t('cancel');
  $('#quota-ok').textContent = t('rename_save');
  $('#quota-input').value = current;
  $('#modal-quota').classList.add('active');
  setTimeout(() => { $('#quota-input').focus(); $('#quota-input').select(); }, 60);
}
function closeQuotaModal() {
  $('#modal-quota').classList.remove('active');
  pendingQuotaUserId = null;
}
async function submitQuota() {
  if (pendingQuotaUserId == null) return;
  const id = pendingQuotaUserId;
  const n = Math.floor(Number($('#quota-input').value));
  if (!Number.isFinite(n) || n < 1 || n > 999999) { toast(terr('ERR_FIELDS_REQUIRED'), 'error'); return; }
  closeQuotaModal();
  const r = await fetch(`/api/admin/users/${id}/quota`, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ daily_quota: n })
  });
  const data = await r.json();
  if (!r.ok) { toast(terr(data.error) || terr('ERR_GENERIC'), 'error'); return; }
  toast(t('quota_saved'), 'success');
  await loadAdminUsers();
}
$('#quota-cancel').addEventListener('click', closeQuotaModal);
$('#quota-ok').addEventListener('click', submitQuota);
$('#quota-input').addEventListener('keydown', (e) => {
  if (e.key === 'Enter') { e.preventDefault(); submitQuota(); }
});
$('#modal-quota').addEventListener('click', (e) => { if (e.target === e.currentTarget) closeQuotaModal(); });

// ---------- generic warn/danger confirm (Open WebUI style, i18n) ----------
const ICON_WARN_TRI = '<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M10.29 3.86 1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z"/><line x1="12" y1="9" x2="12" y2="13"/><line x1="12" y1="17" x2="12.01" y2="17"/></svg>';
const ICON_USER_UP = '<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M16 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"/><circle cx="8.5" cy="7" r="4"/><line x1="10" y1="11" x2="16" y2="11"/></svg>';
let pendingWarn = null;
function openWarn(opts) {
  $('#warn-title').textContent = opts.title;
  $('#warn-text').textContent = opts.text;
  $('#warn-cancel').textContent = t('warn_cancel');
  $('#warn-ok').textContent = opts.okLabel || t('warn_confirm');
  $('#warn-ic').innerHTML = opts.danger === false ? ICON_USER_UP : ICON_WARN_TRI;
  $('#warn-ic').className = 'warn-ic' + (opts.danger === false ? ' blue' : '');
  $('#warn-ok').className = opts.danger === false ? 'btn-primary' : 'btn-danger';
  pendingWarn = opts.onOk || null;
  $('#modal-warn').classList.add('active');
  setTimeout(() => $('#warn-ok').focus(), 60);
}
function closeWarn() { $('#modal-warn').classList.remove('active'); pendingWarn = null; }
$('#warn-cancel').addEventListener('click', closeWarn);
$('#modal-warn').addEventListener('click', (e) => { if (e.target === e.currentTarget) closeWarn(); });
$('#warn-ok').addEventListener('click', async () => {
  const fn = pendingWarn;
  closeWarn();
  if (fn) await fn();
});

// ---------- admin: reset password modal (no native prompt) ----------
let pendingPwUserId = null;
function openPwResetModal(id, uname) {
  pendingPwUserId = id;
  $('#pwreset-title').textContent = t('pwreset_title') + ' — ' + uname;
  $('#pwreset-label').textContent = t('pwreset_label');
  $('#pwreset-hint').textContent = t('pwreset_hint');
  $('#pwreset-cancel').textContent = t('cancel');
  $('#pwreset-ok').textContent = t('pwreset_ok');
  $('#pwreset-input').value = '';
  $('#modal-pwreset').classList.add('active');
  setTimeout(() => { $('#pwreset-input').focus(); }, 60);
}
function closePwResetModal() { $('#modal-pwreset').classList.remove('active'); pendingPwUserId = null; }
async function submitPwReset() {
  if (pendingPwUserId == null) return;
  const id = pendingPwUserId;
  const pw = $('#pwreset-input').value;
  if (!pw) { toast(terr('ERR_FIELDS_REQUIRED'), 'error'); return; }
  if (pw.length < 4) { toast(terr('ERR_PW_SHORT'), 'error'); return; }
  closePwResetModal();
  const r = await fetch(`/api/admin/users/${id}/password`, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ password: pw })
  });
  const data = await r.json();
  if (!r.ok) { toast(terr(data.error) || terr('ERR_GENERIC'), 'error'); return; }
  toast(t('admin_pw_reset_ok'), 'success');
}
$('#pwreset-cancel').addEventListener('click', closePwResetModal);
$('#pwreset-ok').addEventListener('click', submitPwReset);
$('#pwreset-input').addEventListener('keydown', (e) => { if (e.key === 'Enter') { e.preventDefault(); submitPwReset(); } });
$('#modal-pwreset').addEventListener('click', (e) => { if (e.target === e.currentTarget) closePwResetModal(); });

$('#confirm-cancel').addEventListener('click', () => {
  $('#modal-confirm').classList.remove('active');
  pendingDeleteId = null;
  pendingResetAll = false;
});
$('#confirm-ok').addEventListener('click', async () => {
  if (pendingResetAll) {
    pendingResetAll = false;
    $('#modal-confirm').classList.remove('active');
    const r = await fetch('/api/admin/reset-usage', { method: 'PUT' });
    const data = await r.json();
    if (!r.ok) { toast(terr(data.error) || data.error, 'error'); return; }
    toast(t('admin_reset_all_ok'), 'success');
    await loadAdminPanel();
    return;
  }
  await fetch(`/api/chats/${pendingDeleteId}`, { method: 'DELETE' });
  $('#modal-confirm').classList.remove('active');
  if (pendingDeleteId === currentChatId) {
    currentChatId = null;
    $('#messages').innerHTML = emptyStateHTML();
  }
  pendingDeleteId = null;
  await loadChats();
  toast(t('chat_deleted'), 'success');
});

function emptyStateHTML() {
  const tempBanner = tempMode ? `<div class="temp-banner"><svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" style="vertical-align:-2px; margin-right:6px;"><circle cx="12" cy="12" r="10"/><line x1="2" y1="12" x2="22" y2="12"/><path d="M12 2a15.3 15.3 0 0 1 4 10 15.3 15.3 0 0 1-4 10 15.3 15.3 0 0 1-4-10 15.3 15.3 0 0 1 4-10z"/></svg>${esc(t('temp_badge'))} — ${esc(t('temp_on'))}</div>` : '';
  return `<div class="empty-state" id="empty-state">
    <div class="big-logo"><img src="/logo.svg" alt="" style="width:100%; height:100%; border-radius:15px;"></div>
    ${tempBanner}
    <h3 id="empty-title-el">${esc(t('empty_title'))}</h3>
    <p id="empty-sub-el">${esc(t('empty_sub'))}</p>
  </div>`;
}

$('#btn-new-chat').addEventListener('click', async () => {
  const r = await fetch('/api/chats', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ model: $('#model-select').value })
  });
  const chat = await r.json();
  currentChatId = chat.id;
  chatLean = false;
  applyLeanUI();
  $('#messages').innerHTML = emptyStateHTML();
  await loadChats();
  closeMobileSidebar();
  if (!isGuest() && location.pathname !== '/') goReplace('/');
  $('#input-msg').focus();
});

async function openChat(id) {
  currentChatId = id;
  const r = await fetch(`/api/chats/${id}`);
  const chat = await r.json();
  $('#model-select').value = chat.model;
  updateModelCombo($('#model-select'));
  localStorage.setItem('model', chat.model);
  updateModelBadge();
  const row = chats.find(c => c.id === id);
  document.title = (row ? row.title : chat.title || 'Chat') + ' · Teman Tanyamu';
  chatLean = !!(row && row.lean);
  applyLeanUI();
  renderMessages(chat.messages);
  await loadChats();
  closeMobileSidebar();
}

let lastRendered = [];
let pendingNote = null; // {why, until} — stream note (e.g. ERR_LENGTH) must survive route re-render AND the silent refresh that races it
function renderMessages(messages, quiet) {
  lastRendered = messages || [];
  const box = $('#messages');
  if (!lastRendered.length) { box.innerHTML = emptyStateHTML(); return; }
  let lastUserId = null;
  const parts = lastRendered.map(m => {
    if (m.role === 'user') lastUserId = m.id;
    return messageHTML(m.role, m.content, false, m.id, lastUserId);
  });
  box.innerHTML = `<div class="msg-col${quiet ? ' no-anim' : ''}">${parts.join('')}</div>`;
  box.scrollTop = box.scrollHeight;
  if (pendingNote && lastRendered.length && lastRendered[lastRendered.length - 1].role === 'assistant') {
    if (Date.now() < pendingNote.until) {
      const b = box.querySelector('.msg-col > .msg-block:last-child .m-content');
      if (b) noteStreamInterrupt(b, pendingNote.why); // idempotent: won't stack
    } else pendingNote = null;
  } else if (pendingNote && Date.now() >= pendingNote.until) pendingNote = null;
}

const DEFAULT_USER_AVATAR = '/img/default-avatar.png';
function userAvatarSrc(u) { return (u && u.avatar) ? u.avatar : DEFAULT_USER_AVATAR; }

function renderSideAvatar() {
  const side = $('#avatar-init');
  if (!side || !currentUser) return;
  side.innerHTML = `<img src="${esc(userAvatarSrc(currentUser))}" alt="">`;
}

function messageHTML(role, content, streaming, mid, prevUserId) {
  const isUser = role === 'user';
  const initial = 'AI';
  const userAva = isUser ? `<img src="${esc(userAvatarSrc(currentUser))}" alt="">` : initial;
  const aiAvatar = (!isUser && currentUser && currentUser.assistant_avatar) ? `<img src="${esc(currentUser.assistant_avatar)}" alt="">` : initial;
  const saved = !!mid; // temp-chat bubbles have no DB id -> no edit/truncate actions
  return `<div class="msg-block ${isUser ? 'user' : 'ai'}" ${saved ? `data-msg="${mid}"` : ''}>
    <div class="m-avatar">${isUser ? userAva : aiAvatar}</div>
    <div class="m-body">
      <div class="m-role">${isUser ? esc(t('you')) : esc(t('assistant'))}</div>
      <div class="m-content ${streaming ? 'stream-target' : ''}">${streaming && !content ? '<span class="typing-dots"><span></span><span></span><span></span></span>' : (isUser ? esc(content) : renderMarkdown(content))}</div>
      ${isUser && saved && !streaming ? `<div class="m-actions">
        <button data-edit="${mid}">${ICON_EDIT} ${esc(t('edit_msg'))}</button>
      </div>` : ''}
      ${!isUser && !streaming ? `<div class="m-actions">
        <button data-copy>${ICON_COPY} ${esc(t('copy'))}</button>
        <button data-regen="${prevUserId || ''}">${ICON_REFRESH} ${esc(t('regen'))}</button>
      </div>` : ''}
    </div>
  </div>`;
}

document.addEventListener('click', async (e) => {
  const cc = e.target.closest('.code-copy');
  if (cc) {
    const pre = cc.closest('pre');
    const code = pre ? pre.querySelector('code') : null;
    if (code) {
      await navigator.clipboard.writeText(code.textContent);
      const old = cc.innerHTML; cc.innerHTML = ICON_COPY + ' ok';
      setTimeout(() => { cc.innerHTML = old; }, 1200);
    }
    return;
  }
  const copyBtn = e.target.closest('[data-copy]');
  if (copyBtn) {
    const body = copyBtn.closest('.m-body');
    const content = body.querySelector('.m-content');
    if (content) {
      await navigator.clipboard.writeText(content.textContent);
      toast(t('copied'), 'success');
    }
    return;
  }
  const regenBtn = e.target.closest('[data-regen]');
  if (regenBtn && !streaming && !tempMode && currentChatId) {
    const anchor = Number(regenBtn.dataset.regen) || null;
    await truncateAndResend(anchor);
    return;
  }
  const editBtn = e.target.closest('[data-edit]');
  if (editBtn && !streaming && !tempMode && currentChatId) {
    openInlineEdit(Number(editBtn.dataset.edit));
    return;
  }
});

// edit / regenerate: cut the chat at the anchor user message, then re-send (optimistic or new text)
async function truncateAndResend(anchorId, textOverride) {
  let text = textOverride;
  if (anchorId) {
    if (text == null) {
      const anchorPos = lastRendered.findIndex(m => m.id === Number(anchorId));
      const prevUser = anchorPos > 0 ? [...lastRendered.slice(0, anchorPos)].reverse().find(m => m.role === 'user') : null;
      text = prevUser ? prevUser.content : null;
    }
    const r = await fetch(`/api/chats/${currentChatId}/messages/${anchorId}`, { method: 'DELETE' });
    if (!r.ok) { toast(terr((await r.json()).error) || t('err_generic'), 'error'); return; }
  }
  if (text == null) {
    const lastUser = [...lastRendered].reverse().find(m => m.role === 'user');
    text = lastUser ? lastUser.content : null;
  }
  if (!text) { toast(t('err_generic'), 'error'); return; }
  const chat = await (await fetch(`/api/chats/${currentChatId}`)).json(); // view = server truth minus cut tail
  renderMessages(chat.messages);
  inputMsg.value = text;
  await send();
}

function openInlineEdit(mid) {
  const block = document.querySelector(`.msg-block[data-msg="${mid}"]`);
  if (!block || block.querySelector('.m-edit')) return;
  const content = block.querySelector('.m-content');
  const original = content.textContent;
  const wrap = document.createElement('div');
  wrap.className = 'm-edit';
  const ta = document.createElement('textarea');
  ta.rows = Math.min(8, Math.max(2, original.split('\n').length + 1));
  ta.value = original;
  const row = document.createElement('div');
  row.className = 'm-edit-row';
  const save = document.createElement('button');
  save.className = 'btn-primary'; save.textContent = t('edit_save');
  const cancel = document.createElement('button');
  cancel.className = 'btn-ghost'; cancel.textContent = t('edit_cancel');
  row.append(cancel, save);
  wrap.append(ta, row);
  content.style.display = 'none';
  content.after(wrap);
  ta.focus();
  ta.setSelectionRange(ta.value.length, ta.value.length);
  cancel.addEventListener('click', () => { wrap.remove(); content.style.display = ''; });
  const submit = async () => {
    const val = ta.value.trim();
    if (!val) return;
    wrap.remove(); content.style.display = '';
    await truncateAndResend(mid, val);
  };
  save.addEventListener('click', submit);
  ta.addEventListener('keydown', (e) => {
    if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); submit(); }
    if (e.key === 'Escape') { wrap.remove(); content.style.display = ''; }
  });
}

// ---------- streaming chat ----------
const inputMsg = $('#input-msg');
const btnSend = $('#btn-send');

inputMsg.addEventListener('keydown', (e) => {
  if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); send(); }
});
inputMsg.addEventListener('input', () => {
  inputMsg.style.height = 'auto';
  inputMsg.style.height = Math.min(inputMsg.scrollHeight, 170) + 'px';
});




btnSend.addEventListener('click', () => streaming ? stopStream() : send());

function stopStream() {
  if (abortCtrl) abortCtrl.abort();
}

async function ensureChat() {
  if (currentChatId) return;
  const r = await fetch('/api/chats', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ model: $('#model-select').value })
  });
  const chat = await r.json();
  currentChatId = chat.id;
  await loadChats();
}

async function sendTemp(text) {
  const box = $('#messages');
  let col = box.querySelector('.msg-col');
  if (!col) { box.innerHTML = '<div class="msg-col"></div>'; col = box.querySelector('.msg-col'); }
  const es = $('#empty-state');
  if (es) es.remove();

  const prev = box.querySelector('.stream-target');
  if (prev) prev.classList.remove('stream-target');

  col.insertAdjacentHTML('beforeend', messageHTML('user', text));
  col.insertAdjacentHTML('beforeend', messageHTML('assistant', '', true));
  box.scrollTop = box.scrollHeight;

  inputMsg.value = '';
  inputMsg.style.height = 'auto';
  abortCtrl = new AbortController();

  try {
    const res = await fetch('/api/temp-chat', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ message: text, model: $('#model-select').value, lean: focusMode }),
      signal: abortCtrl.signal
    });
    if (!res.ok) {
      const err = await res.json();
      if (handleGuestError(err.error, box)) return;
      if (err.error === 'ERR_QUOTA') throw new Error(t('err_quota'));
      throw new Error(terr(err.error) || 'HTTP ' + res.status);
    }
    const reader = res.body.getReader();
    const decoder = new TextDecoder();
    let aiText = '';
    let buffer = '';
    const bubble = getStreamBubble(box);
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      buffer += decoder.decode(value, { stream: true });
      const lines = buffer.split('\n');
      buffer = lines.pop();
      for (const line of lines) {
        if (!line.startsWith('data: ') || line.includes('[DONE]')) continue;
        try {
          const chunk = JSON.parse(line.slice(6));
          if (chunk.error) throw new Error(chunk.error);
          if (chunk.partial) { noteStreamInterrupt(bubble, chunk.partial); continue; }
          if (chunk.content) {
            aiText += chunk.content;
            bubble.innerHTML = renderMarkdown(aiText);
            box.scrollTop = box.scrollHeight;
          }
        } catch (e) { if (e.message && !e.message.includes('JSON')) throw e; }
      }
    }
  } catch (e) {
    if (e.name === 'AbortError') {
      toast(t('stream_stopped'));
    } else {
      const msg = ERR_MAP[e.message] ? terr(e.message) : e.message;
      toast(msg, 'error');
      const b = getStreamBubble(box);
      if (b && b.querySelector('.typing-dots')) b.innerHTML = `<span style="color:var(--danger)">${esc(t('err_generic'))}: ${esc(msg)}</span>`;
      else if (b) noteStreamInterrupt(b, msg);
    }
  } finally {
    streaming = false;
    btnSend.classList.remove('stop');
    btnSend.innerHTML = SEND_ICON;
    abortCtrl = null;
    try {
      const me = await (await fetch('/api/me')).json();
      if (me.username) { currentUser = me; updateQuota(); afterGuestRefresh(); }
    } catch (_) {}
  }
}

async function send() {
  const text = inputMsg.value.trim();
  if (!text || streaming) return;

  streaming = true; // guard re-entry BEFORE async ensureChat
  btnSend.classList.add('stop');
  btnSend.innerHTML = STOP_ICON;

  if (tempMode) return sendTemp(text);

  try {
    await ensureChat();
  } catch (e) {
    streaming = false;
    btnSend.classList.remove('stop');
    btnSend.innerHTML = SEND_ICON;
    toast(t('err_generic') + ': ' + e.message, 'error');
    return;
  }
  if (!currentChatId) {
    streaming = false;
    btnSend.classList.remove('stop');
    btnSend.innerHTML = SEND_ICON;
    return;
  }

  const box = $('#messages');
  let col = box.querySelector('.msg-col');
  if (!col) { box.innerHTML = '<div class="msg-col"></div>'; col = box.querySelector('.msg-col'); }
  const empty = $('#empty-state');
  if (empty) empty.remove();

  const prev = box.querySelector('.stream-target');
  if (prev) prev.classList.remove('stream-target');

  col.insertAdjacentHTML('beforeend', messageHTML('user', text));
  col.insertAdjacentHTML('beforeend', messageHTML('assistant', '', true));
  box.scrollTop = box.scrollHeight;

  inputMsg.value = '';
  inputMsg.style.height = 'auto';
  abortCtrl = new AbortController();

  try {
    const res = await fetch('/api/chat', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ chatId: currentChatId, message: text }),
      signal: abortCtrl.signal
    });

    if (!res.ok) {
      const err = await res.json();
      if (handleGuestError(err.error, box)) return;
      if (err.error === 'ERR_QUOTA') throw new Error(t('err_quota'));
      throw new Error(terr(err.error) || 'HTTP ' + res.status);
    }

    const reader = res.body.getReader();
    const decoder = new TextDecoder();
    let aiText = '';
    let lastUsage = null;
    let interruptNote = null;
    let buffer = '';
    const bubble = getStreamBubble(box);
    pendingNote = null;

    while (true) {
      const { done, value } = await reader.read();
      if (done || aborted) break;
      buffer += decoder.decode(value, { stream: true });
      const lines = buffer.split('\n');
      buffer = lines.pop();
      for (const line of lines) {
        if (!line.startsWith('data: ') || line.includes('[DONE]')) continue;
        try {
          const chunk = JSON.parse(line.slice(6));
          if (chunk.error) throw new Error(chunk.error);
          if (chunk.partial) { interruptNote = chunk.partial; noteStreamInterrupt(bubble, chunk.partial); continue; } // reply saved & visible: soft note only
          if (chunk.note === 'ERR_LENGTH') { const n = { why: 'ERR_LENGTH', until: Date.now() + 15000 }; pendingNote = n; interruptNote = 'ERR_LENGTH'; noteStreamInterrupt(bubble, 'ERR_LENGTH'); continue; } // cap hit: note survives route re-render + racing silent refresh
          if (chunk.usage) { lastUsage = chunk.usage; continue; }
          if (chunk.content) {
            aiText += chunk.content;
            bubble.innerHTML = renderMarkdown(aiText);
            box.scrollTop = box.scrollHeight;
          }
        } catch (e) { if (e.message && !e.message.includes('JSON')) throw e; }
      }
    }
    if (lastUsage && bubble) {
      bubble.classList.remove('stream-target');
      const note = document.createElement('div');
      note.className = 'm-usage';
      note.textContent = t('usage_tooltip', lastUsage);
      note.title = note.textContent;
      const bodyEl = bubble.closest('.m-body');
      if (bodyEl) bodyEl.appendChild(note);
    }
  } catch (e) {
    if (e.name === 'AbortError') {
      toast(t('stream_stopped'));
    } else {
      const msg = ERR_MAP[e.message] ? terr(e.message) : e.message;
      toast(msg, 'error');
      const b = getStreamBubble(box);
      if (b && b.querySelector('.typing-dots')) b.innerHTML = `<span style="color:var(--danger)">${esc(t('err_generic'))}: ${esc(msg)}</span>`;
      else if (b) noteStreamInterrupt(b, msg); // keep what's on screen, append a quiet warning
    }
  } finally {
    streaming = false;
    btnSend.classList.remove('stop');
    btnSend.innerHTML = SEND_ICON;
    abortCtrl = null;
    // like ChatGPT/Gemini: URL lands in the bar once the reply is finished
    if (currentChatId && !isGuest()) { try { go('/c/' + currentChatId); } catch (_) {} }
    const cid = currentChatId;
    // server-truth refresh happens OFF the critical path: bubbles already show the answer;
    // message ids (edit/truncate actions) are patched in silently when it arrives.
    const pull = () => fetch(`/api/chats/${cid}`).then((r) => (r.ok ? r.json() : null));
    const paint = (chat) => {
      if (chat && chat.messages && chat.messages.length && currentChatId === cid && !streaming) {
        renderMessages(chat.messages, true);
        if (interruptNote) { const b = box.querySelector('.msg-col > .msg-block:last-child .m-content'); if (b) noteStreamInterrupt(b, interruptNote); }
        return chat.messages.some((m) => m.role === 'assistant');
      }
      return true; // someone else already owns the view — don't fight it
    };
    pull().then((chat) => {
      if (!paint(chat)) {
        // assistant row not visible yet (server still finishing the INSERT) — one quiet retry
        setTimeout(() => { pull().then(paint).catch(() => {}); }, 1500);
      }
    }).catch(() => {});
    loadChats().catch(() => {});
    fetch('/api/me').then((r) => r.json()).then((me) => {
      if (me.username) { currentUser = me; updateQuota(); afterGuestRefresh(); }
    }).catch(() => {});
  }
}

// quiet "connection dropped after the answer" marker — never destroys visible content
function noteStreamInterrupt(bubble, why) {
  if (!bubble || bubble.querySelector('.m-interrupted')) return;
  const note = document.createElement('div');
  note.className = 'm-interrupted';
  note.textContent = '⚠ ' + (ERR_MAP[why] ? terr(why) : why);
  note.title = String(why);
  const bodyEl = bubble.closest('.m-body') || bubble.parentElement;
  if (bodyEl) bodyEl.appendChild(note); else bubble.after(note);
}

// ---------- temporary chat toggle ----------
function applyTempUI() {
  const btn = $('#btn-temp');
  if (!btn) return;
  btn.classList.toggle('active', tempMode);
  const lbl = $('#temp-label');
  if (lbl) lbl.textContent = t('temp_label');
  btn.title = tempMode ? t('temp_badge') + ' — ' + t('temp_on') : t('temp_label');
  const es = $('#empty-state');
  if (es) {
    const box = $('#messages');
    if (box) box.innerHTML = emptyStateHTML();
  }
}
$('#btn-temp').addEventListener('click', () => {
  tempMode = !tempMode;
  localStorage.setItem('tempMode', tempMode ? '1' : '0');
  applyTempUI();
  toast(tempMode ? t('temp_on') : t('temp_off'));
  if (tempMode) {
    currentChatId = null;
    const box = $('#messages');
    const es = $('#empty-state');
    if (!es) box.innerHTML = emptyStateHTML();
  }
  closeMobileSidebar();
});

// ---------- lean (per-chat token saver) + global focus for temp chat ----------
function applyLeanUI() {
  const btn = $('#btn-lean');
  if (!btn) return;
  const active = tempMode ? focusMode : chatLean;
  btn.classList.toggle('active', active);
  const lbl = $('#lean-label');
  if (lbl) lbl.textContent = t('lean_label');
  btn.title = (tempMode ? (focusMode ? t('lean_on') : t('lean_off')) : (chatLean ? t('lean_on') : t('lean_off'))) + (tempMode ? ' — ' + t('lean_temp_on') : '');
}
$('#btn-lean').addEventListener('click', async () => {
  if (tempMode) {
    focusMode = !focusMode;
    localStorage.setItem('focusMode', focusMode ? '1' : '0');
    applyLeanUI();
    toast(focusMode ? t('lean_on') : t('lean_off'));
    return;
  }
  if (!currentChatId) { toast(t('new_chat')); return; }
  chatLean = !chatLean;
  applyLeanUI();
  toast(chatLean ? t('lean_on') : t('lean_off'));
  await fetch(`/api/chats/${currentChatId}/lean`, {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ lean: chatLean })
  });
  await loadChats();
});

// ---------- memory (settings modal) ----------
async function renderMemoryFacts() {
  const box = $('#memory-facts');
  if (!box) return;
  let data;
  try { data = await (await fetch('/api/memory')).json(); } catch (_) { return; }
  if (!data.facts || !data.facts.length) {
    box.innerHTML = `<div style="font-size:12.5px; color:var(--text-3); padding:4px 2px;">${esc(t('memory_empty'))}</div>`;
    return;
  }
  box.innerHTML = data.facts.map(f => `
    <div class="memory-row" style="display:flex; align-items:center; gap:8px; font-size:13px; padding:7px 10px; border:1px solid var(--border); border-radius:9px;">
      <span style="flex:1; word-break:break-word;">${esc(f.content)}</span>
      <button class="icon-btn danger" data-del-fact="${f.id}" title="${esc(t('memory_del'))}" aria-label="${esc(t('memory_del'))}" style="width:26px;height:26px;">✕</button>
    </div>`).join('');
}
$('#memory-facts').addEventListener('click', async (e) => {
  const btn = e.target.closest('[data-del-fact]');
  if (!btn) return;
  await fetch(`/api/memory/${btn.dataset.delFact}`, { method: 'DELETE' });
  toast(t('memory_saved'), 'success');
  await renderMemoryFacts();
});
async function addMemoryFact() {
  const inp = $('#memory-add-input');
  const text = inp.value.trim();
  if (!text) return;
  let data;
  try {
    const cur = await (await fetch('/api/memory')).json();
    const facts = cur.facts.map(f => f.content).concat(text).slice(0, 20);
    const r = await fetch('/api/memory', {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ facts })
    });
    data = await r.json();
  } catch (_) { return; }
  if (data.ok) { inp.value = ''; toast(t('memory_saved'), 'success'); await renderMemoryFacts(); }
}
$('#memory-add-btn').addEventListener('click', addMemoryFact);
$('#memory-add-input').addEventListener('keydown', (e) => { if (e.key === 'Enter') { e.preventDefault(); addMemoryFact(); } });
$('#memory-clear-btn').addEventListener('click', () => {
  openWarn({
    title: t('warn_mem_title'),
    text: t('warn_mem_text'),
    okLabel: t('warn_do_clear'),
    onOk: async () => {
      await fetch('/api/memory/clear', { method: 'POST' });
      toast(t('memory_cleared'), 'success');
      await renderMemoryFacts();
    }
  });
});

// ---------- sidebar minimize/maximize toggle (desktop) ----------
const SIDEBAR_KEY = 'sidebarMinimized';
const isMobile = () => window.matchMedia('(max-width: 768px)').matches;
function setSidebarMinimized(min) {
  if (isMobile()) {
    // di mobile: minimize = tutup drawer (sidebar mobile selalu full)
    $('#sidebar').classList.remove('minimized');
    localStorage.setItem(SIDEBAR_KEY, '0');
    if (min) closeMobileSidebar();
    return;
  }
  $('#sidebar').classList.toggle('minimized', min);
  localStorage.setItem(SIDEBAR_KEY, min ? '1' : '0');
}
window.addEventListener('resize', () => {
  if (isMobile() && $('#sidebar').classList.contains('minimized')) {
    setSidebarMinimized(false);
  }
});
$('#btn-minimize').addEventListener('click', (e) => {
  e.stopPropagation();
  setSidebarMinimized(true);
});
$('#sidebar').addEventListener('click', (e) => {
  if (!$('#sidebar').classList.contains('minimized')) return;
  if (e.target.closest('[data-del], [data-rename], .user-model-select, .icon-btn, button')) return;
  setSidebarMinimized(false);
});
if (localStorage.getItem(SIDEBAR_KEY) === '1') {
  $('#sidebar').classList.add('minimized');
}

// ---------- mobile sidebar ----------
$('#btn-toggle-sidebar').addEventListener('click', () => {
  $('#sidebar').classList.toggle('open');
  $('#sidebar-backdrop').classList.toggle('active');
});
function closeMobileSidebar() {
  $('#sidebar').classList.remove('open');
  $('#sidebar-backdrop').classList.remove('active');
}
$('#sidebar-backdrop').addEventListener('click', closeMobileSidebar);

// ---------- admin ----------
let allModelsCache = [];

$('#btn-admin').addEventListener('click', async () => {
  go('/admin');
});
$('#admin-close').addEventListener('click', () => { $('#modal-admin').classList.remove('active'); if (location.pathname === '/admin') goReplace('/'); });

let routerCfg = null;
function renderRouterStatus() {
  const box = $('#router-status'); if (!box || !routerCfg) return;
  box.classList.toggle('rs-bad', !routerCfg.configured);
  box.classList.toggle('rs-ok', !!routerCfg.configured);
  $('#router-status-text').textContent = routerCfg.configured
    ? t('router_status_ok', t('router_source_' + (routerCfg.source || 'none')))
    : t('router_status_bad');
}
async function loadRouterConfig() {
  try {
    routerCfg = await (await fetch('/api/admin/router-config')).json();
    if (!routerCfg || routerCfg.error) return;
    $('#router-base').value = routerCfg.base_url || '';
    $('#router-key').value = '';
    $('#router-key').placeholder = routerCfg.api_key_masked ? t('router_key_ph', routerCfg.api_key_masked) : t('router_key_ph_none');
    $('#router-result').hidden = true;
    renderRouterStatus();
  } catch (_) { /* keep last state */ }
}
$('#router-key-eye').addEventListener('click', () => {
  const k = $('#router-key');
  k.type = k.type === 'password' ? 'text' : 'password';
});
$('#router-save').addEventListener('click', async () => {
  const body = { base_url: $('#router-base').value.trim() };
  const key = $('#router-key').value.trim();
  if (key) body.api_key = key;
  const r = await fetch('/api/admin/router-config', {
    method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body)
  });
  const data = await r.json().catch(() => ({}));
  if (!r.ok) { toast(terr(data.error) || data.error || 'Error', 'error'); return; }
  routerCfg = Object.assign(routerCfg || {}, data);
  $('#router-key').value = '';
  $('#router-key').placeholder = routerCfg.api_key_masked ? t('router_key_ph', routerCfg.api_key_masked) : t('router_key_ph_none');
  renderRouterStatus();
  toast(t('router_saved'), 'success');
  allModelsCache = [];
  loadAdminPanel().catch(() => {});
});
$('#router-test').addEventListener('click', async () => {
  const btn = $('#router-test'); const out = $('#router-result');
  const body = {};
  const b = $('#router-base').value.trim(); if (b) body.base_url = b;
  const k = $('#router-key').value.trim(); if (k) body.api_key = k;
  btn.disabled = true; btn.textContent = t('router_testing');
  out.hidden = false; out.className = 'router-result'; out.textContent = '';
  try {
    const r = await fetch('/api/admin/router-test', {
      method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body)
    });
    const data = await r.json().catch(() => ({}));
    if (!r.ok) {
      out.classList.add('rr-bad');
      out.textContent = terr(data.error) || data.error || 'Error';
    } else if (data.ok) {
      out.classList.add('rr-ok');
      out.textContent = t('router_test_ok', data.latency_ms, data.models);
    } else {
      out.classList.add('rr-bad');
      out.textContent = t('router_test_bad', data.status);
    }
  } catch (e) {
    out.classList.add('rr-bad');
    out.textContent = String(e.message || e);
  } finally {
    btn.disabled = false; btn.textContent = t('router_test_btn');
  }
});

const ADMIN_POLL_MS = 5000;
setInterval(() => {
  if (!$('#modal-admin').classList.contains('active')) return;
  if ($('#modal-admin').querySelector(':hover')) return;
  if (document.querySelector('.modal-backdrop.active:not(#modal-admin)')) return;
  if (document.querySelector('.model-combo.open, .avatar-popover')) return;
  if ($('#modal-admin').contains(document.activeElement) && ['INPUT', 'SELECT', 'TEXTAREA'].includes(document.activeElement.tagName)) return;
  loadAdminPanel().catch(() => {});
}, ADMIN_POLL_MS);

async function loadAdminPanel() {
  if (!allModelsCache.length) {
    allModelsCache = await (await fetch('/api/models')).json();
  }
  const settings = await (await fetch('/api/admin/settings')).json();
  const gmSel = $('#global-model-select');
  gmSel.innerHTML = allModelsCache.map(m => `<option value="${esc(m)}" ${m === settings.default_model ? 'selected' : ''}>${esc(m)}</option>`).join('');
  enhanceModelSelects();
  $('#set-hist-budget').value = settings.history_token_budget || 1600;
  $('#set-max-reply').value = settings.max_reply_tokens || 4096;
  $('#set-timeout').value = settings.timeout_ms || 120;
  $('#set-gen-max').value = settings.gen_limit_max || 30;
  $('#set-gen-window').value = settings.gen_limit_window_sec || 90;
  $('#set-memory-enabled').checked = !!settings.memory_enabled;
  $('#set-guest-enabled').checked = !!settings.guest_enabled;
  $('#set-guest-chats').value = settings.guest_max_chats || 10;
  $('#set-guest-minutes').value = settings.guest_max_minutes || 5;
  {
    const ph = $('#set-guest-purge');
    if (ph && !ph.options.length) {
      for (let i = 0; i < 24; i++) {
        const o = document.createElement('option');
        o.value = String(i); o.textContent = String(i).padStart(2, '0') + ':00';
        ph.appendChild(o);
      }
    }
    if (ph) ph.value = String(Math.min(23, Math.max(0, Number(settings.guest_purge_hour) || 0)));
  }
  if (settings.today_usage) $('#admin-today-usage').textContent = t('today_usage', settings.today_usage.t, settings.today_usage.p, settings.today_usage.c);
  loadAdminStats();
  renderAdminAI();
  await loadAdminUsers();
}

async function loadAdminUsers() {
  const users = await (await fetch('/api/admin/users')).json();
  $('#admin-users').innerHTML = `
  <table class="admin-table">
    <thead><tr>
      <th>${esc(t('admin_col_avatar'))}</th>
      <th>${esc(t('admin_col_username'))}</th>
      <th>${esc(t('admin_col_role'))}</th>
      <th>${esc(t('admin_col_status'))}</th>
      <th>${esc(t('admin_col_model'))}</th>
      <th>${esc(t('admin_col_usage'))}</th>
      <th>${esc(t('admin_col_actions'))}</th>
    </tr></thead>
    <tbody>
    ${users.map(u => {
    const avatarHTML = `<img src="${esc(userAvatarSrc(u))}" alt="">`;
    const opts = [`<option value="" ${!u.model_override ? 'selected' : ''}>${esc(t('admin_global_tag'))}</option>`]
      .concat(allModelsCache.map(m => `<option value="${esc(m)}" ${m === u.model_override ? 'selected' : ''}>${esc(m)}</option>`))
      .join('');
    const isSelf = currentUser && currentUser.id === u.id;
    const statusDot = u.active
      ? `<span style="display:inline-block; width:7px; height:7px; border-radius:50%; background:var(--success);"></span>`
      : `<span style="display:inline-block; width:7px; height:7px; border-radius:50%; background:var(--danger);"></span>`;
    const roleTag = u.role === 'admin'
      ? `<span class="role-tag">${esc(t('admin_role_admin'))}</span>`
      : `<span class="role-tag" style="background:rgba(139,92,246,0.12); color:var(--purple, #a78bfa);">${esc(t('admin_role_user'))}</span>`;
    return `
    <tr class="${u.active ? '' : 'inactive'}">
      <td data-label="${esc(t('admin_col_avatar'))}">
        <div class="avatar admin-avatar-edit" data-admin-avatar="${u.id}" data-avatar-has="${u.avatar ? 1 : 0}" title="${esc(t('avatar'))}">${avatarHTML}</div>
      </td>
      <td data-label="${esc(t('admin_col_username'))}"><span class="uname">${esc(u.username)}</span></td>
      <td data-label="${esc(t('admin_col_role'))}">${roleTag}</td>
      <td data-label="${esc(t('admin_col_status'))}">${statusDot}</td>
      <td data-label="${esc(t('admin_col_model'))}"><select class="user-model-select" data-combo data-user="${u.id}">${opts}</select></td>
      <td data-label="${esc(t('admin_col_usage'))}"><div class="uusage">${esc(t('admin_today', u.used_today, u.daily_quota))}</div></td>
      <td data-label="${esc(t('admin_col_actions'))}">
        <div class="td-actions">
          <button class="btn-ghost admin-action" data-quota="${u.id}" data-quota-val="${u.daily_quota}" data-uname="${esc(u.username)}">${esc(t('admin_edit_quota'))}</button>
          <button class="btn-ghost admin-action" data-resetpw="${u.id}" data-uname="${esc(u.username)}">${esc(t('admin_resetpw'))}</button>
          <button class="btn-ghost admin-action" data-resetquota="${u.id}" data-uname="${esc(u.username)}">${esc(t('admin_reset_quota'))}</button>
          <button class="btn-ghost admin-action" data-toggle-active="${u.id}" data-uname="${esc(u.username)}" data-active="${u.active ? 1 : 0}" ${isSelf ? 'disabled title="' + esc(t('admin_self_deactivate')) + '"' : ''}>${u.active ? esc(t('admin_deactivate')) : esc(t('admin_activate'))}</button>
          ${u.username !== 'admin' ? `<button class="icon-btn danger" data-del-user="${u.id}" data-uname="${esc(u.username)}" title="${esc(t('admin_user_deleted'))}" aria-label="Delete ${esc(u.username)}">
            <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="3 6 5 6 21 6"/><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"/></svg>
          </button>` : ''}
        </div>
      </td>
    </tr>`;
  }).join('')}
    </tbody>
  </table>`;
  enhanceModelSelects();
}

$('#admin-users').addEventListener('click', async (e) => {
  const resetBtn = e.target.closest('[data-resetpw]');
  if (resetBtn) {
    openPwResetModal(Number(resetBtn.dataset.resetpw), resetBtn.dataset.uname);
    return;
  }
  const quotaEditBtn = e.target.closest('[data-quota]');
  if (quotaEditBtn) {
    openQuotaModal(Number(quotaEditBtn.dataset.quota), quotaEditBtn.dataset.uname, quotaEditBtn.dataset.quotaVal);
    return;
  }
  const quotaBtn = e.target.closest('[data-resetquota]');
  if (quotaBtn) {
    const uid = Number(quotaBtn.dataset.resetquota);
    const uname = quotaBtn.dataset.uname;
    openWarn({
      danger: false,
      title: t('warn_qreset_title'),
      text: t('warn_qreset_text', uname),
      okLabel: t('warn_do_reset'),
      onOk: async () => {
        const r = await fetch(`/api/admin/users/${uid}/reset-quota`, {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json' }
        });
        const data = await r.json();
        if (!r.ok) { toast(terr(data.error), 'error'); return; }
        toast(t('admin_quota_reset_ok'), 'success');
        await loadAdminUsers();
      }
    });
    return;
  }
  const toggleBtn = e.target.closest('[data-toggle-active]');
  if (toggleBtn) {
    const uid = Number(toggleBtn.dataset.toggleActive);
    const uname = toggleBtn.dataset.uname;
    const active = toggleBtn.dataset.active === '1';
    openWarn({
      danger: !active ? false : true,
      title: active ? t('warn_deact_title') : t('warn_act_title'),
      text: (active ? t('warn_deact_text') : t('warn_act_text')).replace(/USER/g, uname),
      onOk: async () => {
        const r = await fetch(`/api/admin/users/${uid}/active`, {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ active: !active })
        });
        const data = await r.json();
        if (!r.ok) { toast(terr(data.error) || data.error, 'error'); return; }
        toast(!active ? t('admin_activated') : t('admin_deactivated'), 'success');
        await loadAdminUsers();
      }
    });
    return;
  }
});

$('#global-model-save').addEventListener('click', async () => {
  const model = $('#global-model-select').value;
  const r = await fetch('/api/admin/settings', {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ default_model: model })
  });
  const data = await r.json();
  if (!r.ok) { toast(terr(data.error), 'error'); return; }
  toast(t('model_changed', model), 'success');
  try { const me = await (await fetch('/api/me')).json(); if (me.username) { currentUser = me; updateModelBadge(); } } catch (_) {}
});

$('#token-save').addEventListener('click', async () => {
  const r = await fetch('/api/admin/settings', {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      history_token_budget: Number($('#set-hist-budget').value),
      max_reply_tokens: Number($('#set-max-reply').value),
      memory_enabled: $('#set-memory-enabled').checked,
      timeout_ms: Number($('#set-timeout').value),
      gen_limit_max: Number($('#set-gen-max').value),
      gen_limit_window_sec: Number($('#set-gen-window').value)
    })
  });
  const data = await r.json();
  if (!r.ok) { toast(terr(data.error) || data.error, 'error'); return; }
  toast(t('token_saved'), 'success');
});

$('#guest-save').addEventListener('click', async () => {
  const r = await fetch('/api/admin/settings', {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      guest_enabled: $('#set-guest-enabled').checked,
      guest_max_chats: Number($('#set-guest-chats').value),
      guest_max_minutes: Number($('#set-guest-minutes').value),
      guest_purge_hour: Number($('#set-guest-purge').value)
    })
  });
  const data = await r.json().catch(() => ({}));
  if (!r.ok) { toast(terr(data.error) || data.error, 'error'); return; }
  toast(t('guest_saved'), 'success');
  if ($('#login-view').classList.contains('ready')) refreshGuestButton();
});

// ---------- admin: usage statistics (canvas chart, zero dependency) ----------
let statCache = null;
async function loadAdminStats() {
  const days = ($('#stat-days .seg-btn.active') || {}).dataset ? Number($('#stat-days .seg-btn.active').dataset.days) : 1;
  const sub = $('#admin-stat-sub'); if (sub) sub.textContent = t('stat_sub', Number(days));
  try { statCache = await (await fetch('/api/admin/stats?days=' + days)).json(); } catch (_) { statCache = null; }
  renderAdminStats();
}
$('#stat-days').addEventListener('click', (e) => {
  const b = e.target.closest('.seg-btn');
  if (!b) return;
  $('#stat-days').querySelectorAll('.seg-btn').forEach(x => { x.classList.toggle('active', x === b); x.setAttribute('aria-selected', x === b ? 'true' : 'false'); });
  const sub = $('#admin-stat-sub'); if (sub) sub.textContent = t('stat_sub', Number(b.dataset.days));
  loadAdminStats();
});
$('#stat-reset-usage').addEventListener('click', () => {
  openWarn({
    title: t('stat_reset_usage'),
    text: t('stat_reset_confirm'),
    okLabel: t('stat_reset_usage'),
    onOk: async () => {
      const r = await fetch('/api/admin/reset-usage', { method: 'PUT' });
      const data = await r.json().catch(() => ({}));
      if (!r.ok) { toast(terr(data.error) || t('err_generic'), 'error'); return; }
      toast(t('admin_reset_all_ok'), 'success');
      loadAdminPanel();
    }
  });
});
$('#stat-purge-now').addEventListener('click', () => {
  openWarn({
    title: t('warn_purge_title'),
    text: t('warn_purge_text'),
    okLabel: t('warn_do_purge'),
    onOk: async () => {
      try {
        const r = await fetch('/api/admin/guest-purge-now', { method: 'POST' });
        if (!r.ok) throw new Error();
        const d = await r.json();
        toast(`${t('stat_purged')} (${d.cleared})`, 'success');
        loadAdminStats();
      } catch (_) { toast(t('err_generic'), 'error'); }
    }
  });
});
function fmtK(n) { n = Number(n) || 0; return n >= 1e6 ? (n/1e6).toFixed(1)+'M' : n >= 1e3 ? (n/1e3).toFixed(1)+'k' : String(n); }
let statsSig = '';
function renderAdminStats() {
  const cards = $('#stat-cards'), charts = $('#stat-chart'), models = $('#stat-models'), users = $('#stat-users');
  if (!cards || !charts || !statCache) return;
  const tt = statCache.totals || {};
  // admin poll every 5 s: skip re-render when the numbers are identical (no flicker / no replayed cascade anim)
  const sig = JSON.stringify(statCache) + (document.body.classList.contains('light') ? 'L' : 'D');
  if (sig === statsSig) return;
  statsSig = sig;
  cards.innerHTML = [
    [t('stat_reqs'), fmtK(tt.reqs), t('stat_card_hint_reqs'), 'violet'],
    [t('stat_tok'), fmtK(tt.tok), t('stat_card_hint_tok'), 'blue'],
    [t('stat_prompt'), fmtK(tt.p), t('stat_card_hint_prompt'), 'amber'],
    [t('stat_completion'), fmtK(tt.c), t('stat_card_hint_completion'), 'green'],
    [t('stat_active_users'), statCache.active_users, t('stat_card_hint_users'), 'cyan'],
    [t('stat_guest_sessions'), statCache.guest_sessions, t('stat_card_hint_guests'), 'pink'],
  ].map(([k, v, hint, color]) => `<div class="stat-card c-${color}" title="${esc(hint)}"><span class="sv">${esc(String(v))}</span><span class="sk">${esc(k)}</span><span class="sh">${esc(hint)}</span></div>`).join('');
  renderStatChart();
  const barList = (rows, nameKey, label, colorCls, extra) => {
    const mx = rows.reduce((a, m) => Math.max(a, m.tok || 0), 1);
    const head = `<div class="stat-list-head"><span class="stat-list-title">${esc(label)}</span><span class="stat-list-meta">${rows.length}</span></div>`;
    if (!rows.length) return head + `<div class="stat-list-empty">${esc(t('stat_no_data'))}</div>`;
    return head + '<div class="stat-bars">' + rows.map((m, i) => `
      <div class="sb-row">
        <span class="sb-rank">${i + 1}</span>
        <span class="sb-name" title="${esc(m[nameKey])}">${esc(m[nameKey])}</span>
        <span class="sb-track"><span class="sb-fill ${colorCls}" style="width:${Math.max(2, (m.tok || 0) / mx * 100)}%"></span></span>
        <span class="sb-val">${fmtK(m.tok)}<em>${esc(extra(m))}</em></span>
      </div>`).join('') + '</div>';
  };
  models.innerHTML = barList(statCache.by_model || [], 'model', t('stat_by_model'), 'm', m => `${m.msgs || 0} req`);
  renderModeStats();
  users.innerHTML = barList(statCache.by_user || [], 'username', t('stat_by_user'), 'u', u => `${u.reqs} req`);
}
function renderModeStats() {
  const el = $('#stat-modes');
  if (!el) return;
  const modes = statCache.per_mode || [];
  if (!modes.length) { el.innerHTML = ''; return; }
  const order = { normal: 0, eco: 1, temp: 2, guest: 3 };
  const sorted = [...modes].sort((a, b) => (order[a.mode] ?? 9) - (order[b.mode] ?? 9));
  const totReqs = (statCache.totals || {}).reqs || 0;
  const rows = sorted.map(m => {
    const pct = totReqs ? Math.round((m.reqs / totReqs) * 100) : 0;
    return `<div class="mode-row"><span class="mode-ic" data-m="${esc(m.mode)}" title="${esc(m.mode)}"></span><span class="mode-name">${esc(t('mode_' + m.mode) || m.mode)}</span><span class="mode-val">${fmtK(m.reqs)} req · ${fmtK(m.tok)} tok</span><span class="mode-bar"><i data-m="${esc(m.mode)}" style="width:${pct}%"></i></span></div>`;
  }).join('');
  el.innerHTML = `<div class="stat-list-head"><span class="stat-list-title">${esc(t('stat_by_mode'))}</span><span class="stat-list-meta">${modes.length}</span></div><div class="mode-rows">${rows}</div><p class="stat-list-note">${esc(t('stat_mode_note'))}</p>`;
}
function renderStatChart() {
  const cv = $('#stat-chart');
  if (!cv || !statCache) return;
  const cs = getComputedStyle(document.body);
  const days = statCache.days || 30;
  const hourMode = days === 1 && Array.isArray(statCache.per_hour) && statCache.per_hour.length === 24;
  const title = $('#stat-chart-title');
  if (title) title.textContent = hourMode ? t('stat_per_hour') : t('stat_per_day');
  const series = [];
  if (hourMode) {
    statCache.per_hour.forEach(r => series.push({ label: r.h + ':00', tick: r.h + ':00', reqs: Number(r.reqs) || 0, tok: Number(r.tok) || 0, showTick: Number(r.h) % 3 === 0 }));
  } else {
    const byDate = {}; (statCache.per_day || []).forEach(r => { byDate[r.date] = r; });
    const today = new Date();
    const step = days <= 7 ? 1 : days <= 31 ? 5 : 10;
    for (let i = days - 1; i >= 0; i--) {
      const d = new Date(today); d.setDate(d.getDate() - i);
      const key = d.toISOString().slice(0, 10);
      const row = byDate[key];
      series.push({
        label: key,
        tick: days <= 31 ? `${String(d.getDate()).padStart(2, '0')}/${String(d.getMonth() + 1).padStart(2, '0')}` : key.slice(5),
        reqs: row ? Number(row.reqs) || 0 : 0,
        tok: row ? Number(row.tok) || 0 : 0,
        showTick: (i % step === 0)
      });
    }
  }
  const dpr = window.devicePixelRatio || 1;
  const W = cv.clientWidth || 320, H = 128;
  cv.width = W * dpr; cv.height = H * dpr;
  const g = cv.getContext('2d');
  g.setTransform(dpr, 0, 0, dpr, 0, 0);
  g.clearRect(0, 0, W, H);
  const maxR = Math.max(1, ...series.map(s => s.reqs));
  const maxT = Math.max(1, ...series.map(s => s.tok));
  const padT = 6, axisY = H - 22;
  const slot = (W - 6) / series.length;
  const bw = Math.max(2, slot - 3);
  g.strokeStyle = cs.getPropertyValue('--border') || '#333';
  g.beginPath(); g.moveTo(0, axisY + 0.5); g.lineTo(W, axisY + 0.5); g.stroke();
  const colA = cs.getPropertyValue('--accent').trim() || '#3b82f6';
  const colT = cs.getPropertyValue('--success').trim() || '#22c55e';
  series.forEach((s, i) => {
    const x = 3 + i * slot;
    const hR = Math.round((s.reqs / maxR) * (axisY - padT));
    g.fillStyle = colA;
    g.fillRect(x, axisY - hR, bw, hR);
    if (s.tok > 0) {
      g.fillStyle = colT + 'AA';
      const x2 = x + bw + 1;
      if (x2 + 2 < W) g.fillRect(x2, axisY - Math.round((s.tok / maxT) * (axisY - padT)), 2, Math.max(1, Math.round((s.tok / maxT) * (axisY - padT))));
    }
  });
  // x labels
  g.fillStyle = cs.getPropertyValue('--text-3') || '#777';
  g.font = '9px Inter, sans-serif';
  g.textAlign = 'center';
  series.forEach((s, i) => {
    if (!s.showTick) return;
    const x = 3 + i * slot + bw / 2;
    if (x > W - 12) return;
    g.fillText(s.tick, x, axisY + 11);
  });
  g.textAlign = 'left';
  g.font = '10px Inter, sans-serif';
  g.fillText(t('stat_reqs') + ' ▮ ' + t('stat_tok') + ' ▮', 2, H - 3);
}

$('#guest-reset').addEventListener('click', async () => {
  $('#set-guest-enabled').checked = true;
  $('#set-guest-chats').value = 10;
  $('#set-guest-minutes').value = 5;
  $('#guest-save').dispatchEvent(new MouseEvent('click', { bubbles: false }));
});

// ---------- admin: System & Operations (#1 backup + #7 audit trail) ----------
let auditOffset = 0;
const AUDIT_PAGE = 25;
const AUDIT_ICON = { login: '🔑', login_fail: '⛔', login_inactive: '⛔', user_add: '➕', user_delete: '🗑', user_pwreset: '🔒', user_activate: '✅', user_deactivate: '🚫', settings_update: '⚙', guest_purge_manual: '🧹', guest_purge_auto: '🌙', backup: '💾', rate_limit_hit: '🚦', share_create: '🔗', share_revoke: '✂️' };
function auditRow(a) {
  const d = new Date(a.at);
  const pad = (n) => String(n).padStart(2, '0');
  const when = `${pad(d.getDate())}/${pad(d.getMonth() + 1)} ${pad(d.getHours())}:${pad(d.getMinutes())}`;
  const who = a.actor === '-' ? 'system' : a.actor;
  const extra = a.target ? ' → ' + a.target : (a.detail ? ' · ' + a.detail : '');
  return `<div class="audit-row"><span class="audit-ic">${AUDIT_ICON[a.action] || '•'}</span><span class="audit-when">${esc(when)}</span><span class="audit-actor">${esc(who)}</span><span class="audit-act">${esc(a.action)}${esc(extra)}</span></div>`;
}
async function loadOpsPanel(reset) {
  if (isGuest() || !currentUser || currentUser.role !== 'admin') return;
  if (reset) auditOffset = 0;
  try {
    const r = await fetch('/api/admin/audit?limit=' + AUDIT_PAGE + '&offset=' + auditOffset);
    if (!r.ok) return;
    const { rows } = await r.json();
    const box = $('#ops-audit');
    if (box) {
      if (reset) box.innerHTML = rows.length ? rows.map(auditRow).join('') : `<div class="audit-empty">${esc(t('ops_audit_empty'))}</div>`;
      else box.insertAdjacentHTML('beforeend', rows.map(auditRow).join(''));
    }
    const more = $('#ops-audit-more');
    if (more) more.style.display = rows.length === AUDIT_PAGE ? '' : 'none';
  } catch (e) { console.warn('ops panel:', e.message); }
}
$('#ops-backup').addEventListener('click', async () => {
  const btn = $('#ops-backup');
  btn.disabled = true;
  try {
    const r = await fetch('/api/admin/backup', { method: 'POST' });
    const d = await r.json();
    if (!r.ok) throw new Error(terr(d.error) || 'HTTP ' + r.status);
    toast(t('ops_backup_ok') + ': ' + d.file);
    loadOpsPanel(true);
  } catch (e) { toast(String(e.message || e), 'error'); }
  btn.disabled = false;
});
$('#ops-audit-more').addEventListener('click', () => { auditOffset += AUDIT_PAGE; loadOpsPanel(false); });

$('#token-reset').addEventListener('click', async () => {
  const body = {
    history_token_budget: 1600,
    max_reply_tokens: 4096,
    timeout_ms: 120,
    gen_limit_max: 30,
    gen_limit_window_sec: 90,
    memory_enabled: true
  };
  const r = await fetch('/api/admin/settings', {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body)
  });
  const data = await r.json();
  if (!r.ok) { toast(terr(data.error) || data.error, 'error'); return; }
  $('#set-hist-budget').value = 1600;
  $('#set-max-reply').value = 4096;
  $('#set-timeout').value = 120;
  $('#set-gen-max').value = 30;
  $('#set-gen-window').value = 90;
  $('#set-memory-enabled').checked = true;
  toast(t('token_reset'), 'success');
});

let pendingResetAll = false;
$('#admin-reset-usage').addEventListener('click', () => {
  $('#confirm-title').textContent = t('admin_reset_all');
  $('#confirm-text').textContent = t('admin_reset_all_confirm');
  $('#confirm-ok').textContent = t('admin_reset_all');
  $('#modal-confirm').classList.add('active');
  pendingResetAll = true;
  $('#confirm-ok').focus();
});

// ---------- admin: AI Assistant avatar (global via server settings) ----------
function renderAdminAI() {
  const el = $('#admin-ai-avatar-preview');
  if (!el) return;
  const stored = (currentUser && currentUser.assistant_avatar) || null;
  if (stored) {
    el.innerHTML = `<img src="${esc(stored)}" alt="">`;
  } else {
    el.textContent = 'AI';
  }
}
$('#admin-ai-avatar-file').addEventListener('change', async (e) => {
  const file = e.target.files[0];
  if (!file) return;
  try {
    const dataUrl = await fileToDataURL(file, 300000);
    const r = await fetch('/api/admin/assistant-avatar', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ avatar: dataUrl })
    });
    const data = await r.json();
    if (!r.ok) { toast(terr(data.error), 'error'); return; }
    currentUser.assistant_avatar = data.avatar;
    renderAdminAI();
    document.dispatchEvent(new CustomEvent('tt:ai-avatar', { detail: data.avatar }));
    toast(t('avatar_pick'), 'success');
  } catch (err) {
    toast(err.message || t('err_generic'), 'error');
  }
  e.target.value = '';
});
$('#admin-ai-avatar-reset').addEventListener('click', async () => {
  const r = await fetch('/api/admin/assistant-avatar', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ avatar: null })
  });
  const data = await r.json();
  if (!r.ok) { toast(terr(data.error), 'error'); return; }
  currentUser.assistant_avatar = null;
  renderAdminAI();
  document.dispatchEvent(new CustomEvent('tt:ai-avatar', { detail: null }));
  toast(t('avatar_remove'), 'success');
});

document.addEventListener('tt:ai-avatar', () => {
  renderMessages(lastRendered);
});

// ---------- admin: user rows (delegated) ----------
$('#admin-users').addEventListener('change', async (e) => {
  const sel = e.target.closest('.user-model-select');
  if (!sel) return;
  const userId = sel.dataset.user;
  const model = sel.value || null;
  const r = await fetch(`/api/admin/users/${userId}/model`, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ model })
  });
  const data = await r.json();
  if (!r.ok) { toast(data.error, 'error'); return; }
  toast(model ? `Override model user #${userId}: ${model}` : `User #${userId} kembali ke global default`, 'success');
  if (currentUser && String(currentUser.id) === String(userId)) {
    try { const me = await (await fetch('/api/me')).json(); if (me.username) { currentUser = me; updateModelBadge(); } } catch (_) {}
  }
});

$('#admin-users').addEventListener('click', async (e) => {
  const avatarBtn = e.target.closest('[data-admin-avatar]');
  if (avatarBtn) {
    const userId = Number(avatarBtn.dataset.adminAvatar);
    const hasAvatar = avatarBtn.dataset.avatarHas === '1';
    e.stopPropagation();
    const rect = avatarBtn.getBoundingClientRect();
    const pop = document.createElement('div');
    pop.className = 'avatar-popover';
    pop.style.top = `${rect.bottom + 6}px`;
    pop.style.left = `${Math.max(8, Math.min(rect.left, window.innerWidth - 200))}px`;
    pop.innerHTML = `
      <div class="avatar-popover-title">${esc(t('admin_avatar_title'))}</div>
      <button class="avatar-popover-btn" data-act="upload">${ICON_UPLOAD}<span>${esc(t('admin_avatar_upload_label'))}</span></button>
      ${hasAvatar ? `<button class="avatar-popover-btn danger" data-act="reset">${ICON_TRASH}<span>${esc(t('admin_avatar_reset_label'))}</span></button>` : ''}
      <button class="avatar-popover-btn muted" data-act="cancel">${ICON_X}<span>${esc(t('admin_avatar_cancel'))}</span></button>
    `;
    document.body.appendChild(pop);
    setTimeout(() => pop.classList.add('open'), 20);
    const closePop = () => { pop.remove(); document.removeEventListener('click', onDocClick); };
    const onDocClick = (ev) => { if (!pop.contains(ev.target) && ev.target !== avatarBtn) closePop(); };
    setTimeout(() => document.addEventListener('click', onDocClick), 0);
    pop.querySelectorAll('.avatar-popover-btn').forEach(btn => {
      btn.addEventListener('click', async () => {
        const act = btn.dataset.act;
        closePop();
        if (act === 'cancel') return;
        if (act === 'reset') {
          const r = await fetch('/api/admin/avatar', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ userId, avatar: null }) });
          const data = await r.json();
          if (!r.ok) { toast(terr(data.error), 'error'); return; }
          if (userId === (currentUser && currentUser.id)) {
            currentUser.avatar = null;
            renderSideAvatar();
            renderMessages(lastRendered);
            if ($('#modal-settings').classList.contains('active')) renderSettingsAvatar();
          }
          toast(t('admin_avatar_reset'), 'success');
          await loadAdminUsers();
          return;
        }
        if (act === 'upload') {
          const fileInput = document.createElement('input');
          fileInput.type = 'file';
          fileInput.accept = 'image/*';
          fileInput.onchange = async () => {
            const file = fileInput.files[0];
            if (!file) return;
            try {
              const dataUrl = await fileToDataURL(file, 300000);
              const r = await fetch('/api/admin/avatar', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ userId, avatar: dataUrl }) });
              const data = await r.json();
              if (!r.ok) { toast(terr(data.error), 'error'); return; }
              if (userId === (currentUser && currentUser.id)) {
                currentUser.avatar = dataUrl;
                renderSideAvatar();
                renderMessages(lastRendered);
                if ($('#modal-settings').classList.contains('active')) renderSettingsAvatar();
              }
              toast(t('admin_avatar_uploaded'), 'success');
              await loadAdminUsers();
            } catch (err) { toast(err.message || t('err_generic'), 'error'); }
          };
          fileInput.click();
        }
      });
    });
    return;
  }
  const btn = e.target.closest('[data-del-user]');
  if (!btn) return;
  const uid = Number(btn.dataset.delUser);
  const uname = btn.dataset.uname || '';
  openWarn({
    title: t('warn_del_title'),
    text: t('warn_del_text').replace(/USER/g, uname),
    okLabel: t('admin_del_user'),
    onOk: async () => {
      await fetch(`/api/admin/users/${uid}`, { method: 'DELETE' });
      await loadAdminUsers();
      toast(t('admin_user_deleted'), 'success');
    }
  });
});

$('#form-add-user').addEventListener('submit', async (e) => {
  e.preventDefault();
  const r = await fetch('/api/admin/users', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      username: $('#add-username').value,
      password: $('#add-password').value,
      role: $('#add-role').value,
      daily_quota: Number($('#add-quota').value)
    })
  });
  const data = await r.json();
  if (!r.ok) { toast(data.error, 'error'); return; }
  toast('User ditambahkan', 'success');
  $('#form-add-user').reset();
  $('#add-quota').value = 50;
  await loadAdminUsers();
});

// ---------- settings akun ----------
const WALLPAPER_PRESETS = [
  { key: 'wp_default', value: null },
  { key: 'wp_senja', value: 'linear-gradient(180deg, #0c1524 0%, #09090b 100%)' },
  { key: 'wp_hutan', value: 'linear-gradient(180deg, #0b1a12 0%, #09090b 100%)' },
  { key: 'wp_ungu', value: 'linear-gradient(180deg, #150d24 0%, #09090b 100%)' },
  { key: 'wp_marun', value: 'linear-gradient(180deg, #240d10 0%, #09090b 100%)' },
  { key: 'wp_abu', value: '#101012' },
];

$('#btn-settings').addEventListener('click', async () => {
  if (isGuest()) { toast(terr('ERR_GUEST_NOPE'), 'error'); return; }
  go('/account');
});

$('#avatar-init').addEventListener('click', () => $('#btn-settings').click());
$('#settings-close').addEventListener('click', () => { $('#modal-settings').classList.remove('active'); if (location.pathname === '/account') goReplace('/'); });
// click outside (backdrop) closes admin + settings panels, like other modals
$('#modal-admin').addEventListener('click', (e) => { if (e.target === e.currentTarget) { $('#modal-admin').classList.remove('active'); if (location.pathname === '/admin') goReplace('/'); } });
$('#modal-settings').addEventListener('click', (e) => { if (e.target === e.currentTarget) { $('#modal-settings').classList.remove('active'); if (location.pathname === '/account') goReplace('/'); } });

function renderSettingsAvatar() {
  const el = $('#settings-avatar-preview');
  if (el) {
    el.innerHTML = `<img src="${esc(userAvatarSrc(currentUser))}" alt="">`;
  }
  renderSideAvatar();
}

function fileToDataURL(file, maxSize) {
  return new Promise((resolve, reject) => {
    if (!file.type.startsWith('image/')) { reject(new Error('File bukan gambar')); return; }
    const img = new Image();
    const url = URL.createObjectURL(file);
    img.onload = () => {
      // downscale to keep storage small
      const scale = Math.min(1, 256 / Math.max(img.width, img.height));
      const canvas = document.createElement('canvas');
      canvas.width = Math.round(img.width * scale);
      canvas.height = Math.round(img.height * scale);
      canvas.getContext('2d').drawImage(img, 0, 0, canvas.width, canvas.height);
      URL.revokeObjectURL(url);
      resolve(canvas.toDataURL('image/jpeg', 0.85));
    };
    img.onerror = () => { URL.revokeObjectURL(url); reject(new Error(t('err_generic'))); };
    img.src = url;
  });
}

$('#avatar-file').addEventListener('change', async (e) => {
  const file = e.target.files[0];
  if (!file) return;
  try {
    const dataUrl = await fileToDataURL(file);
    const r = await fetch('/api/me/avatar', {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ avatar: dataUrl })
    });
    const data = await r.json();
    if (!r.ok) { toast(terr(data.error), 'error'); return; }
    currentUser.avatar = dataUrl;
    renderSettingsAvatar();
    renderMessages(lastRendered);
    toast(t('admin_avatar_uploaded'), 'success');
  } catch (err) { toast(terr(err.message), 'error'); }
  e.target.value = '';
});

$('#avatar-remove').addEventListener('click', async () => {
  const r = await fetch('/api/me/avatar', {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ avatar: null })
  });
  if (!r.ok) { toast(terr('ERR_GENERIC'), 'error'); return; }
  currentUser.avatar = null;
  renderSettingsAvatar();
  renderMessages(lastRendered);
  toast(t('avatar_remove') + ' ✓', 'success');
});

$('#form-password').addEventListener('submit', async (e) => {
  e.preventDefault();
  const r = await fetch('/api/me/password', {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ current: $('#pw-current').value, next: $('#pw-next').value })
  });
  const data = await r.json();
  if (!r.ok) { toast(terr(data.error), 'error'); return; }
  toast(t('pw_ok'), 'success');
  $('#form-password').reset();
});

function renderWallpaperPresets() {
  const box = $('#wallpaper-presets');
  const current = box.dataset.current || '';
  box.innerHTML = WALLPAPER_PRESETS.map((p, i) => `
    <button class="wp-preset" data-wp="${i}" style="height:52px; border-radius:9px; border:1px solid var(--border); font-size:10.5px; color:var(--text-2); background:${p.value || 'var(--panel-2)'}; cursor:pointer; position:relative; overflow:hidden;">
      <span style="position:relative; z-index:1; background:rgba(0,0,0,0.35); padding:2px 6px; border-radius:5px;">${esc(t(p.key))}</span>
      ${current === String(p.value) ? '<span style="position:absolute; top:4px; right:4px; width:8px; height:8px; border-radius:50%; background:var(--accent);"></span>' : ''}
    </button>`).join('');
}

async function applyWallpaper() {
  const r = await fetch('/api/wallpaper');
  const data = await r.json();
  const msgArea = document.querySelector('.main');
  const isImg = !!data.wallpaper && data.wallpaper.startsWith('data:image/');
  msgArea.classList.toggle('has-wallpaper', !!data.wallpaper);
  msgArea.classList.toggle('has-wallpaper-img', isImg); // overlay gelap hanya untuk gambar
  if (data.wallpaper) {
    if (isImg) {
      msgArea.style.background = `url("${data.wallpaper}") center/cover no-repeat`;
    } else {
      msgArea.style.background = data.wallpaper;
    }
  } else {
    msgArea.style.background = '';
  }
  const box = $('#wallpaper-presets');
  box.dataset.current = data.wallpaper || '';
  const activePreset = WALLPAPER_PRESETS.find(p => p.value === data.wallpaper);
  if (activePreset) box.dataset.current = activePreset.value;
  renderWallpaperPresets();
}

$('#wallpaper-presets').addEventListener('click', async (e) => {
  const btn = e.target.closest('.wp-preset');
  if (!btn) return;
  const preset = WALLPAPER_PRESETS[Number(btn.dataset.wp)];
  const value = preset.value; // null = default
  const r = await fetch('/api/wallpaper', {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ wallpaper: value })
  });
  const data = await r.json();
  if (!r.ok) { toast(data.error, 'error'); return; }
  toast(t('wallpaper_set', t(preset.key)), 'success');
  await applyWallpaper();
});

$('#wallpaper-file').addEventListener('change', async (e) => {
  const file = e.target.files[0];
  if (!file) return;
  try {
    const img = new Image();
    const url = URL.createObjectURL(file);
    img.onload = async () => {
      const scale = Math.min(1, 1280 / Math.max(img.width, img.height));
      const canvas = document.createElement('canvas');
      canvas.width = Math.round(img.width * scale);
      canvas.height = Math.round(img.height * scale);
      canvas.getContext('2d').drawImage(img, 0, 0, canvas.width, canvas.height);
      URL.revokeObjectURL(url);
      const dataUrl = canvas.toDataURL('image/jpeg', 0.8);
      const r = await fetch('/api/wallpaper', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ wallpaper: dataUrl })
      });
      const data = await r.json();
      if (!r.ok) { toast(data.error, 'error'); return; }
      toast(t('wallpaper_custom_ok'), 'success');
      await applyWallpaper();
    };
    img.onerror = () => { URL.revokeObjectURL(url); toast(t('err_generic'), 'error'); };
    img.src = url;
  } catch (err) { toast(err.message, 'error'); }
  e.target.value = '';
});

$('#wallpaper-reset').addEventListener('click', async () => {
  const r = await fetch('/api/wallpaper', {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ wallpaper: null })
  });
  if (!r.ok) { toast(terr('ERR_GENERIC'), 'error'); return; }
  toast(t('wallpaper_reset_ok'), 'success');
  await applyWallpaper();
});

document.addEventListener('keydown', (e) => {
  if (e.key === 'Escape') {
    $('#modal-confirm').classList.remove('active');
    $('#modal-admin').classList.remove('active');
    $('#modal-logout').classList.remove('active');
    $('#modal-rename').classList.remove('active');
    $('#modal-quota').classList.remove('active');
    $('#modal-guest').classList.remove('active');
    $('#modal-settings').classList.remove('active');
    $('#modal-warn').classList.remove('active'); pendingWarn = null;
    $('#modal-pwreset').classList.remove('active'); pendingPwUserId = null;
    if (location.pathname === '/account' || location.pathname === '/admin') goReplace('/');
    closeModelCombo();
    closeChatMenu();
  }
});

// ---------- global error trap (debug) ----------
window.addEventListener('error', (e) => {
  console.error('[TT] JS ERROR:', e.message, 'at', e.filename + ':' + e.lineno);
});
window.addEventListener('unhandledrejection', (e) => {
  console.error('[TT] UNHANDLED:', e.reason);
});

// ---------- boot ----------
console.log('[TT] app v1.0-beta.6 fresh-load');
(async () => {
  let user = null;
  try {
    const r = await fetch('/api/me');
    if (r.ok) user = await r.json();
  } catch(e) { console.warn('boot /api/me:', e); }

  if (user) {
    currentUser = user;
    $('#app-view').classList.add('ready', 'active');
  } else {
    $('#login-view').classList.add('ready');
  }

  try { applyI18N(); } catch(e) { console.warn('i18n boot:', e); }
  try { enhanceModelSelects(); } catch(e) { console.warn('combo boot:', e); }
  try { applyTempUI(); } catch(e) { console.warn('temp boot:', e); }

  if (user) { await enterApp(); try { routeFromURL(); } catch (e) { console.warn('boot route:', e); } }
  else refreshGuestButton();
})();

// fallback: jangan pernah blank screen
setTimeout(() => {
  const lv = document.getElementById('login-view');
  const av = document.getElementById('app-view');
  if (lv && !lv.classList.contains('ready') && !av.classList.contains('ready')) {
    console.error('[TT] BOOT STUCK - forcing login view');
    lv.classList.add('ready');
  }
}, 4000);

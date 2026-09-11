const $ = (s) => document.querySelector(s);
let currentUser = null;
let currentChatId = null;
let chats = [];
let streaming = false;
let abortCtrl = null;
let pendingDeleteId = null;
let tempMode = localStorage.getItem('tempMode') === '1';

// ---------- i18n (default: English) ----------
const I18N = {
  en: {
    login_title: 'Welcome to Teman Tanyamu',
    login_sub: 'Sign in to continue your conversation',
    login_user: 'Username',
    login_user_ph: 'Enter username',
    login_pass: 'Password',
    login_pass_ph: 'Enter password',
    login_btn: 'Sign in',
    login_remaining: (n) => (n > 1 ? `${n} attempts remaining` : '1 attempt remaining'),
    login_foot: 'Teman Tanyamu · your personal AI assistant',
    new_chat: 'New Chat',
    history: 'Chat History',
    chat_empty: 'No chats yet. Start with "New Chat".',
    settings: 'Account Settings',
    admin: 'Admin Panel',
    logout: 'Log out',
    logout_title: 'Log out?',
    logout_sub: 'You will need to sign in again to continue.',
    logout_ok: 'Log out',
    logout_cancel: 'Cancel',
    empty_title: 'How can I help you today?',
    empty_sub: 'Pick a model, type your question, answers stream in real time.',
    model_label: 'Model:',
    model_locked: 'Only admins can change the model',
    aria_model: 'Select model',
    temp_on: 'Temporary Chat ON. History will not be saved.',
    temp_off: 'Temporary Chat OFF. History is saved again.',
    temp_badge: 'Temporary',
    temp_label: 'Temp',
    aria_sidebar: 'Toggle chat list',
    aria_new_chat: 'New chat',
    aria_minimize: 'Hide sidebar',
    del_chat: 'Delete',
    rename_chat: 'Rename',
    add_user_ph: 'misal: budi',
    aria_sidebar: 'Toggle chat list',
    aria_new_chat: 'New chat',
    aria_minimize: 'Hide sidebar',
    del_chat: 'Delete',
    rename_chat: 'Rename',
    add_user_ph: 'e.g. budi',
    conn_offline: '9Router offline',
    conn_loading: 'loading models...',
    input_ph: 'Send a message...',
    hint: 'Teman Tanyamu can make mistakes. Check important info.',
    you: 'You',
    assistant: 'Assistant',
    copy: 'Copy',
    regen: 'Retry',
    typing: 'thinking...',
    quota_admin: 'Admin · unlimited',
    quota_user: (u, m) => `Quota: ${u}/${m} today`,
    model_changed: (m) => 'Model: ' + m,
    copied: 'Copied to clipboard',
    chat_deleted: 'Chat deleted',
    chat_renamed: 'Chat renamed',
    confirm_del: (t) => `"${t}" will be permanently deleted with all its messages.`,
    del_ok: 'Delete',
    cancel: 'Cancel',
    confirm_title: 'Delete chat?',
    stream_stopped: 'Streaming stopped',
    admin_title: 'Admin Panel',
    admin_sub: 'Manage Teman Tanyamu users & models',
    admin_global: 'Global Default Model',
    admin_global_sub: 'Used by all users without an override.',
    admin_save: 'Save',
    admin_add: 'Add User',
    admin_lbl_username: 'Username',
    admin_lbl_password: 'Password',
    admin_lbl_role: 'Role',
    admin_lbl_quota: 'Daily quota (chats)',
    admin_pass_ph: 'min 4 characters',
    admin_user_ph: 'e.g. budi',
    admin_pass_ph: 'min 4 characters',
    admin_role: 'Role',
    admin_quota: 'Daily quota (chats)',
    admin_add_btn: 'Add',
    admin_close: 'Close',
    admin_today: (u, q) => `Today: ${u}/${q} chats`,
    admin_resetpw: 'Reset Password',
    admin_reset_quota: 'Reset Kuota',
    admin_quota_reset_ok: 'Kuota harian direset',
    admin_global_tag: 'Default global',
    admin_role_admin: 'Admin',
    admin_role_user: 'User',
    admin_reset_quota: 'Reset Quota',
    admin_quota_reset_ok: 'Daily quota reset',
    admin_global_tag: 'Global default',
    admin_role_admin: 'Admin',
    admin_role_user: 'User',
    admin_deactivate: 'Deactivate',
    admin_activate: 'Activate',
    admin_pw_reset_ok: 'Password reset. User must log in again.',
    admin_user_added: 'User added',
    admin_user_deleted: 'User deleted',
    admin_activated: 'Account activated',
    admin_deactivated: 'Account deactivated',
    settings_title: 'Account Settings',
    settings_as: (u) => 'Signed in as ' + u,
    avatar: 'Avatar',
    avatar_pick: 'Choose Image',
    avatar_remove: 'Remove Avatar',
    pw_title: 'Change Password',
    pw_current: 'Current password',
    pw_new: 'New password',
    pw_save: 'Save Password',
    pw_ok: 'Password changed successfully',
    wallpaper_title: 'Chat Wallpaper',
    wallpaper_sub: 'Quick presets or a custom image (only for you).',
    wallpaper_upload: 'Upload Custom Image',
    wallpaper_reset: 'Reset to Default',
    wallpaper_set: (n) => 'Wallpaper: ' + n,
    wallpaper_custom_ok: 'Custom wallpaper applied',
    wallpaper_reset_ok: 'Wallpaper reset to default',
    err_login: 'Wrong username or password',
    err_old_pw: 'Old password is wrong',
    err_quota: 'Daily quota reached. Try again tomorrow.',
    err_image_only: 'This model supports text only. Paste the text, not the image.',
    err_timeout: 'AI took too long (over 2 minutes). Try a faster model via model picker.',
    err_generic: 'Failed',
    thinking_label: 'thinking...',
    rename_prompt: 'New chat name:',
    search_ph: 'Search chats...',
    search_none: 'No chats match',
  },
  id: {
    login_title: 'Selamat datang di Teman Tanyamu',
    login_sub: 'Masuk untuk melanjutkan percakapan',
    login_user: 'Username',
    login_user_ph: 'Masukkan username',
    login_pass: 'Password',
    login_pass_ph: 'Masukkan password',
    login_btn: 'Masuk',
    login_remaining: (n) => (n > 1 ? `${n} percobaan tersisa` : '1 percobaan tersisa'),
    login_foot: 'Teman Tanyamu · asisten AI pribadimu',
    new_chat: 'Chat Baru',
    history: 'Riwayat Chat',
    chat_empty: 'Belum ada chat. Mulai dengan "Chat Baru".',
    settings: 'Pengaturan Akun',
    admin: 'Panel Admin',
    logout: 'Keluar',
    logout_title: 'Keluar?',
    logout_sub: 'Kamu perlu login lagi untuk melanjutkan.',
    logout_ok: 'Keluar',
    logout_cancel: 'Batal',
    empty_title: 'Halo, ada yang bisa kubantu?',
    empty_sub: 'Pilih model, tulis pertanyaanmu, jawaban mengalir langsung.',
    model_label: 'Model:',
    model_locked: 'Hanya admin yang dapat mengganti model',
    aria_model: 'Pilih model',
    temp_on: 'Chat Sementara AKTIF. Riwayat tidak disimpan.',
    temp_off: 'Chat Sementara MATI. Riwayat disimpan kembali.',
    temp_badge: 'Sementara',
    temp_label: 'Sementara',
    aria_sidebar: 'Buka daftar chat',
    aria_new_chat: 'Chat baru',
    aria_minimize: 'Sembunyikan sidebar',
    del_chat: 'Hapus',
    rename_chat: 'Ganti nama',
    add_user_ph: 'misal: budi',
    conn_offline: '9Router offline',
    conn_loading: 'memuat model...',
    input_ph: 'Kirim pesan...',
    hint: 'Teman Tanyamu bisa keliru. Periksa info penting.',
    you: 'Kamu',
    assistant: 'Asisten',
    copy: 'Salin',
    regen: 'Ulangi',
    typing: 'mengetik...',
    quota_admin: 'Admin · tanpa batas',
    quota_user: (u, m) => `Kuota: ${u}/${m} hari ini`,
    model_changed: (m) => 'Model: ' + m,
    copied: 'Tersalin ke clipboard',
    chat_deleted: 'Chat dihapus',
    chat_renamed: 'Chat diganti nama',
    confirm_del: (t) => `"${t}" akan dihapus permanen beserta seluruh pesannya.`,
    del_ok: 'Hapus',
    cancel: 'Batal',
    confirm_title: 'Hapus chat?',
    stream_stopped: 'Streaming dihentikan',
    admin_title: 'Panel Admin',
    admin_sub: 'Kelola pengguna & model Teman Tanyamu',
    admin_global: 'Model Global Default',
    admin_global_sub: 'Dipakai semua user tanpa override.',
    admin_save: 'Simpan',
    admin_add: 'Tambah Pengguna',
    admin_lbl_username: 'Username',
    admin_lbl_password: 'Password',
    admin_lbl_role: 'Peran',
    admin_lbl_quota: 'Kuota harian (chat)',
    admin_pass_ph: 'minimal 4 karakter',
    admin_user_ph: 'misal: budi',
    admin_pass_ph: 'minimal 4 karakter',
    admin_role: 'Peran',
    admin_quota: 'Kuota harian (chat)',
    admin_add_btn: 'Tambah',
    admin_close: 'Tutup',
    admin_today: (u, q) => `Hari ini: ${u}/${q} chat`,
    admin_resetpw: 'Reset Password',
    admin_reset_quota: 'Reset Quota',
    admin_quota_reset_ok: 'Daily quota reset',
    admin_global_tag: 'Global default',
    admin_role_admin: 'Admin',
    admin_role_user: 'User',
    admin_deactivate: 'Nonaktifkan',
    admin_activate: 'Aktifkan',
    admin_pw_reset_ok: 'Password direset. User diminta login ulang.',
    admin_user_added: 'User ditambahkan',
    admin_user_deleted: 'User dihapus',
    admin_activated: 'Akun diaktifkan',
    admin_deactivated: 'Akun dinonaktifkan',
    settings_title: 'Pengaturan Akun',
    settings_as: (u) => 'Masuk sebagai ' + u,
    avatar: 'Avatar',
    avatar_pick: 'Pilih Gambar',
    avatar_remove: 'Hapus Avatar',
    pw_title: 'Ganti Password',
    pw_current: 'Password saat ini',
    pw_new: 'Password baru',
    pw_save: 'Simpan Password',
    pw_ok: 'Password berhasil diganti',
    wallpaper_title: 'Wallpaper Chat',
    wallpaper_sub: 'Preset cepat atau gambar custom (hanya untukmu).',
    wallpaper_upload: 'Unggah Gambar Custom',
    wallpaper_reset: 'Reset ke Default',
    wallpaper_set: (n) => 'Wallpaper: ' + n,
    wallpaper_custom_ok: 'Wallpaper custom terpasang',
    wallpaper_reset_ok: 'Wallpaper direset ke default',
    err_login: 'Username atau password salah',
    err_old_pw: 'Password lama salah',
    err_quota: 'Kuota harian habis. Coba lagi besok.',
    err_image_only: 'Model ini hanya mendukung teks. Tempel teksnya saja, bukan gambarnya.',
    err_timeout: 'AI memproses terlalu lama (lebih dari 2 menit). Coba model lebih cepat lewat pemilih model.',
    err_generic: 'Gagal',
    thinking_label: 'mengetik...',
    rename_prompt: 'Nama baru chat:',
  }
};
// server error code -> localized message
const ERR_MAP = {
  ERR_UNAUTH: { en: 'Not signed in', id: 'Belum login' },
  ERR_ADMIN_ONLY: { en: 'Admin only', id: 'Khusus admin' },
  ERR_FIELDS_REQUIRED: { en: 'All fields are required', id: 'Semua kolom wajib diisi' },
  ERR_LOGIN: { en: 'Wrong username or password', id: 'Username atau password salah' },
  ERR_INACTIVE: { en: 'Account disabled. Contact admin.', id: 'Akun dinonaktifkan. Hubungi admin.' },
  ERR_PW_SHORT: { en: 'Password must be at least 4 characters', id: 'Password minimal 4 karakter' },
  ERR_OLD_PW: { en: 'Old password is wrong', id: 'Password lama salah' },
  ERR_AVATAR_FORMAT: { en: 'Avatar must be an image', id: 'Avatar harus berupa gambar' },
  ERR_TOO_BIG: { en: 'Image too large (max ~300KB)', id: 'Gambar terlalu besar (maks ~300KB)' },
  ERR_WALLPAPER_FORMAT: { en: 'Wallpaper format not supported', id: 'Format wallpaper tidak didukung' },
  ERR_NOT_FOUND: { en: 'Not found', id: 'Tidak ditemukan' },
  ERR_SELF_DELETE: { en: "Cannot delete yourself", id: 'Tidak bisa hapus diri sendiri' },
  ERR_SELF_DEACTIVATE: { en: 'Cannot deactivate yourself', id: 'Tidak bisa menonaktifkan diri sendiri' },
  ERR_USERNAME_TAKEN: { en: 'Username already taken', id: 'Username sudah dipakai' },
  ERR_BAD_BODY: { en: 'Invalid request', id: 'Request tidak valid' },
  ERR_MODEL_LOCKED: { en: 'Only admins can change the model', id: 'Hanya admin yang dapat mengganti model' },
  ERR_QUOTA: { en: 'Daily quota reached. Try again tomorrow.', id: 'Kuota harian habis. Coba lagi besok.' },
  ERR_RATE_LIMITED: { en: 'Too many attempts. Try again in', id: 'Terlalu banyak percobaan. Coba lagi dalam' },
  ERR_RATE_LIMITED_SEC: { en: 'seconds.', id: 'detik.' },
  LOGIN_REMAINING: { en: (n) => (n > 1 ? `${n} attempts remaining` : '1 attempt remaining'), id: (n) => (n > 1 ? `${n} percobaan tersisa` : '1 percobaan tersisa') },
};
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
    // admin modal
    setT('#admin-title-el', t('admin_title'));
    setT('#admin-sub-el', t('admin_sub'));
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
    setT('#form-add-user button[type="submit"]', t('admin_add_btn'));
    // settings modal
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
    setT('#wallpaper-pick-label', t('wallpaper_upload'));
    setT('#wallpaper-reset', t('wallpaper_reset'));
    setT('#settings-close', t('admin_close'));
    updateQuota();
    applyTempUI();
    // re-render dynamic lists (only when logged in)
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

$('#btn-lang').addEventListener('click', () => {
  lang = lang === 'en' ? 'id' : 'en';
  localStorage.setItem('lang', lang);
  applyI18N();
  toast(lang === 'en' ? 'Language: English' : 'Bahasa: Indonesia', 'success');
});

const ICON_CHAT = '<svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"/></svg>';
const SEND_ICON = '<svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M22 2 11 13"/><path d="M22 2 15 22 11 13 2 9 22 2z"/></svg>';
const STOP_ICON = '<svg width="15" height="15" viewBox="0 0 24 24" fill="currentColor"><rect x="6" y="6" width="12" height="12" rx="2"/></svg>';
const ICON_COPY = '<svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="9" y="9" width="13" height="13" rx="2" ry="2"/><path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"/></svg>';
const ICON_REFRESH = '<svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="23 4 23 10 17 10"/><path d="M20.49 15a9 9 0 1 1-2.12-9.36L23 10"/></svg>';

function toast(msg, type = '') {
  const t = $('#toast');
  if (!t) return;
  t.textContent = msg;
  t.className = type;
  t.style.display = 'block';
  clearTimeout(t._timer);
  t._timer = setTimeout(() => t.style.display = 'none', 3500);
}

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
  return html;
}

// ---------- global image paste/drop guard (document level) ----------
function blockImagePaste(e) {
  const dt = e.clipboardData || (e.originalEvent && e.clipboardData);
  if (!dt) return;
  // 1) any image file item
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
  // 2) text containing image filename
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
    return;
  }
  await enterApp();
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
  // reset state SPA tanpa reload
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
  $('#login-user').focus();
});

async function enterApp() {
  let r;
  try {
    r = await fetch('/api/me');
  } catch (e) { return; }
  if (!r.ok) return;
  currentUser = await r.json();
  $('#login-view').style.display = 'none';
  $('#app-view').classList.add('ready', 'active');
  $('#lbl-user').textContent = currentUser.username;
  $('#avatar-init').textContent = currentUser.username.slice(0, 1).toUpperCase();
  updateQuota();
  if (currentUser.role === 'admin') $('#btn-admin').classList.add('show');
  await loadModels();
  await loadChats();
  updateModelBadge();
  await applyWallpaper();
}

function updateModelBadge() {
  // show override status next to quota
  const el = $('#lbl-quota');
  if (!currentUser) return;
  if (currentUser.model_override) {
    el.dataset.override = currentUser.model_override;
  } else {
    delete el.dataset.override;
  }
}

function updateQuota() {
  if (!currentUser) return;
  const el = $('#lbl-quota');
  if (currentUser.role === 'admin') { el.textContent = t('quota_admin'); el.className = 'uquota'; return; }
  el.textContent = t('quota_user', currentUser.quota_used, currentUser.quota_max);
  el.className = 'uquota' + (currentUser.quota_used >= currentUser.quota_max ? ' warn' : '');
}

// ---------- models ----------
async function loadModels() {
  try {
    const r = await fetch('/api/models');
    if (!r.ok) throw new Error('fetch failed');
    const models = await r.json();
    const sel = $('#model-select');
    sel.disabled = false; // re-enable (mis. setelah logout dari akun non-admin)
    sel.innerHTML = models.map(m => `<option value="${esc(m)}">${esc(m)}</option>`).join('');
    // priority: user override (from /api/me) > saved local > global default (server order in list)
    const preferred = currentUser && currentUser.effective_model;
    if (preferred && models.includes(preferred)) sel.value = preferred;
    else {
      const saved = localStorage.getItem('model');
      if (saved && models.includes(saved)) sel.value = saved;
    }
    // admin-only: lock selector for regular users
    if (currentUser && currentUser.role !== 'admin') {
      sel.disabled = true;
      sel.title = t('model_locked');
      const lbl = document.querySelector('.model-label');
      if (lbl) lbl.textContent = t('model_label');
    }
  } catch (e) {
    toast(t('conn_offline'), 'error');
  }
}

$('#model-select').addEventListener('change', async (e) => {
  const model = e.target.value;
  localStorage.setItem('model', model);
  if (currentChatId) {
    await fetch(`/api/chats/${currentChatId}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ model })
    });
  }
  // persist as per-user preference (admin only; selector is disabled for regular users)
  if (currentUser && currentUser.role === 'admin') {
    await fetch('/api/me/model', {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ model })
    });
    const me = await (await fetch('/api/me')).json();
    if (me.username) { currentUser = me; updateQuota(); updateModelBadge(); }
  }
  toast(t('model_changed', model), 'success');
});

// ---------- chats ----------
async function loadChats() {
  chats = await (await fetch('/api/chats')).json();
  const list = $('#chat-list');
  if (!chats.length) {
    list.innerHTML = '<div class="chat-empty-hint" style="padding:10px 8px; font-size:12.5px; color:var(--text-3);">' + t('chat_empty') + '</div>';
    return;
  }
  list.innerHTML = chats.map(c => `
    <div class="chat-item ${c.id === currentChatId ? 'active' : ''}" data-id="${c.id}" role="button" tabindex="0">
      <span class="ico">${ICON_CHAT}</span>
      <span class="title">${esc(c.title)}</span>
      <button class="del" data-rename="${c.id}" aria-label="${esc(t('rename_chat'))} ${esc(c.title)}" title="${esc(t('rename_chat'))}">✎</button>
      <button class="del" data-del="${c.id}" aria-label="${esc(t('del_chat'))} ${esc(c.title)}" title="${esc(t('del_chat'))}">✕</button>
    </div>`).join('');
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
    const title = prompt(t('rename_prompt'), chat ? chat.title : '');
    if (title && title.trim()) {
      await fetch(`/api/chats/${id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ title: title.trim() })
      });
      await loadChats();
      toast(t('chat_renamed'), 'success');
    }
    return;
  }
  const del = e.target.closest('[data-del]');
  if (del) {
    e.stopPropagation();
    pendingDeleteId = Number(del.dataset.del);
    const chat = chats.find(c => c.id === pendingDeleteId);
    $('#confirm-text').textContent = t('confirm_del', chat ? chat.title : '');
    $('#modal-confirm').classList.add('active');
    $('#confirm-ok').focus();
    return;
  }
  const item = e.target.closest('.chat-item');
  if (item) await openChat(Number(item.dataset.id));
});

$('#chat-list').addEventListener('keydown', (e) => {
  if (e.key === 'Enter' && e.target.classList.contains('chat-item')) {
    openChat(Number(e.target.dataset.id));
  }
});

$('#confirm-cancel').addEventListener('click', () => {
  $('#modal-confirm').classList.remove('active');
  pendingDeleteId = null;
});
$('#confirm-ok').addEventListener('click', async () => {
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
  const tempBanner = tempMode ? `<div class="temp-banner">👻 ${esc(t('temp_badge'))} — ${esc(t('temp_on'))}</div>` : '';
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
  $('#messages').innerHTML = emptyStateHTML();
  await loadChats();
  closeMobileSidebar();
  $('#input-msg').focus();
});

async function openChat(id) {
  currentChatId = id;
  const r = await fetch(`/api/chats/${id}`);
  const chat = await r.json();
  $('#model-select').value = chat.model;
  localStorage.setItem('model', chat.model);
  renderMessages(chat.messages);
  await loadChats();
  closeMobileSidebar();
}

function renderMessages(messages) {
  const box = $('#messages');
  if (!messages.length) { box.innerHTML = emptyStateHTML(); return; }
  box.innerHTML = `<div class="msg-col">${messages.map(m => messageHTML(m.role, m.content)).join('')}</div>`;
  box.scrollTop = box.scrollHeight;
}

function messageHTML(role, content, streaming) {
  const isUser = role === 'user';
  const initial = isUser ? (currentUser ? currentUser.username.slice(0,1).toUpperCase() : 'U') : 'AI';
  return `<div class="msg-block ${isUser ? 'user' : 'ai'}">
    <div class="m-avatar">${initial}</div>
    <div class="m-body">
      <div class="m-role">${isUser ? esc(t('you')) : esc(t('assistant'))}</div>
      <div class="m-content ${streaming ? 'stream-target' : ''}">${streaming && !content ? '<span class="typing-dots"><span></span><span></span><span></span></span>' : (isUser ? esc(content) : renderMarkdown(content))}</div>
      ${!isUser && !streaming ? `<div class="m-actions">
        <button data-copy>${ICON_COPY} ${esc(t('copy'))}</button>
        <button data-regen>${ICON_REFRESH} ${esc(t('regen'))}</button>
      </div>` : ''}
    </div>
  </div>`;
}

// copy & regenerate (delegated)
document.addEventListener('click', async (e) => {
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
  if (regenBtn && !streaming) {
    const block = regenBtn.closest('.msg-block');
    const body = block.querySelector('.m-content');
    // find preceding user message text from chat storage via API: simpler = use stored chats? Use last user msg from server history
    const r = await fetch(`/api/chats/${currentChatId}`);
    const chat = await r.json();
    const lastUser = [...chat.messages].reverse().find(m => m.role === 'user');
    if (!lastUser) { toast(t('err_generic'), 'error'); return; }
    // delete last assistant message is complex; simplest: re-send same user prompt (creates new turn)
    inputMsg.value = lastUser.content;
    send();
  }
});

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

// paste handler: image pasted -> inform model text-only (R-27 error state)


// drop handler: same friendly guard

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
      body: JSON.stringify({ message: text, model: $('#model-select').value }),
      signal: abortCtrl.signal
    });
    if (!res.ok) {
      const err = await res.json();
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
      toast(e.message, 'error');
      const b = getStreamBubble(box);
      if (b) b.innerHTML = `<span style="color:var(--danger)">${esc(t('err_generic'))}: ${esc(e.message)}</span>`;
    }
  } finally {
    streaming = false;
    btnSend.classList.remove('stop');
    btnSend.innerHTML = SEND_ICON;
    abortCtrl = null;
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

  // finalize any previous streaming bubble first
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
      toast(e.message, 'error');
      const b = getStreamBubble(box);
      if (b && !b.querySelector('.typing-dots')) b.innerHTML = `<span style="color:var(--danger)">${esc(t('err_generic'))}: ${esc(e.message)}</span>`;
    }
  } finally {
    streaming = false;
    btnSend.classList.remove('stop');
    btnSend.innerHTML = SEND_ICON;
    abortCtrl = null;
    await loadChats();
    const me = await (await fetch('/api/me')).json();
    if (me.username) { currentUser = me; updateQuota(); }
  }
}

// ---------- temporary chat toggle ----------
function applyTempUI() {
  const btn = $('#btn-temp');
  if (!btn) return;
  btn.classList.toggle('active', tempMode);
  const lbl = $('#temp-label');
  if (lbl) lbl.textContent = t('temp_label');
  btn.title = tempMode ? t('temp_badge') + ' — ' + t('temp_on') : t('temp_label');
  // refresh empty state banner if visible
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

// ---------- sidebar minimize/maximize toggle (desktop) ----------
const SIDEBAR_KEY = 'sidebarMinimized';
const isMobile = () => window.matchMedia('(max-width: 768px)').matches;
function setSidebarMinimized(min) {
  if (isMobile()) min = false; // mobile drawer never minimizes
  $('#sidebar').classList.toggle('minimized', min);
  localStorage.setItem(SIDEBAR_KEY, min ? '1' : '0');
}
// if resized to mobile, force expand
window.addEventListener('resize', () => {
  if (isMobile() && $('#sidebar').classList.contains('minimized')) {
    setSidebarMinimized(false);
  }
});
$('#btn-minimize').addEventListener('click', (e) => {
  e.stopPropagation();
  setSidebarMinimized(true);
});
// click anywhere on collapsed rail expands (except interactive elements)
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
  $('#modal-admin').classList.add('active');
  await loadAdminPanel();
});
$('#admin-close').addEventListener('click', () => $('#modal-admin').classList.remove('active'));

async function loadAdminPanel() {
  // fetch models once for dropdowns
  if (!allModelsCache.length) {
    allModelsCache = await (await fetch('/api/models')).json();
  }
  // global default model setting
  const settings = await (await fetch('/api/admin/settings')).json();
  const gmSel = $('#global-model-select');
  gmSel.innerHTML = allModelsCache.map(m => `<option value="${esc(m)}" ${m === settings.default_model ? 'selected' : ''}>${esc(m)}</option>`).join('');
  await loadAdminUsers();
}

async function loadAdminUsers() {
  const users = await (await fetch('/api/admin/users')).json();
  $('#admin-users').innerHTML = users.map(u => {
    const avatarHTML = u.avatar
      ? `<img src="${esc(u.avatar)}" style="width:100%; height:100%; object-fit:cover; border-radius:50%;" alt="">`
      : esc(u.username.slice(0,1).toUpperCase());
    const opts = [`<option value="" ${!u.model_override ? 'selected' : ''}>${esc(t('admin_global_tag'))}</option>`]
      .concat(allModelsCache.map(m => `<option value="${esc(m)}" ${m === u.model_override ? 'selected' : ''}>${esc(m)}</option>`))
      .join('');
    const statusDot = u.active
      ? '<span style="display:inline-block; width:7px; height:7px; border-radius:50%; background:var(--success); margin-left:6px;"></span>'
      : '<span style="display:inline-block; width:7px; height:7px; border-radius:50%; background:var(--danger); margin-left:6px;"></span>';
    return `
    <div class="admin-user-row" style="${u.active ? '' : 'opacity:0.55;'}">
      <div class="avatar" style="width:28px; height:28px; font-size:11.5px; overflow:hidden;">${avatarHTML}</div>
      <div class="udetail">
        <div><strong>${esc(u.username)}</strong>${u.role === 'admin' ? `<span class="role-tag">${esc(t('admin_role_admin'))}</span>` : ''}${statusDot}</div>
        <div class="uusage">${esc(t('admin_today', u.used_today, u.daily_quota))}</div>
        <select class="user-model-select" data-user="${u.id}" style="margin-top:5px; font-size:11.5px; padding:4px 8px;">${opts}</select>
        <div style="display:flex; gap:6px; margin-top:6px; flex-wrap:wrap;">
          <button class="btn-ghost admin-action" style="padding:4px 10px; font-size:11px; border-radius:6px;" data-resetpw="${u.id}" data-uname="${esc(u.username)}">${esc(t('admin_resetpw'))}</button>
          <button class="btn-ghost admin-action" style="padding:4px 10px; font-size:11px; border-radius:6px;" data-resetquota="${u.id}">${esc(t('admin_reset_quota'))}</button>
          <button class="btn-ghost admin-action" style="padding:4px 10px; font-size:11px; border-radius:6px;" data-toggle-active="${u.id}" data-active="${u.active ? 1 : 0}">${u.active ? esc(t('admin_deactivate')) : esc(t('admin_activate'))}</button>
        </div>
      </div>
      ${u.username !== 'admin' ? `<button class="icon-btn danger" data-del-user="${u.id}" title="${esc(t('admin_user_deleted'))}" aria-label="Delete ${esc(u.username)}">
        <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="3 6 5 6 21 6"/><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"/></svg>
      </button>` : ''}
    </div>`;
  }).join('');
}

// admin actions: reset password & toggle active (delegated)
$('#admin-users').addEventListener('click', async (e) => {
  const resetBtn = e.target.closest('[data-resetpw]');
  if (resetBtn) {
    const newPw = prompt(`[${resetBtn.dataset.uname}] ` + t('pw_new') + ' (min 4):');
    if (!newPw) return;
    if (newPw.length < 4) { toast(terr('ERR_PW_SHORT'), 'error'); return; }
    const r = await fetch(`/api/admin/users/${resetBtn.dataset.resetpw}/password`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ password: newPw })
    });
    const data = await r.json();
    if (!r.ok) { toast(terr(data.error), 'error'); return; }
    toast(t('admin_pw_reset_ok'), 'success');
    return;
  }
  const quotaBtn = e.target.closest('[data-resetquota]');
  if (quotaBtn) {
    const r = await fetch(`/api/admin/users/${quotaBtn.dataset.resetquota}/reset-quota`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' }
    });
    const data = await r.json();
    if (!r.ok) { toast(terr(data.error), 'error'); return; }
    toast(t('admin_quota_reset_ok'), 'success');
    await loadAdminUsers();
    return;
  }
  const toggleBtn = e.target.closest('[data-toggle-active]');
  if (toggleBtn) {
    const active = toggleBtn.dataset.active === '1';
    const r = await fetch(`/api/admin/users/${toggleBtn.dataset.toggleActive}/active`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ active: !active })
    });
    const data = await r.json();
    if (!r.ok) { toast(data.error, 'error'); return; }
    toast(!active ? t('admin_activated') : t('admin_deactivated'), 'success');
    await loadAdminUsers();
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
});

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
});

$('#admin-users').addEventListener('click', async (e) => {
  const btn = e.target.closest('[data-del-user]');
  if (!btn) return;
  if (!confirm(t('confirm_title'))) return;
  await fetch(`/api/admin/users/${btn.dataset.delUser}`, { method: 'DELETE' });
  await loadAdminUsers();
  toast(t('admin_user_deleted'), 'success');
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
  { name: 'Default', value: null },
  { name: 'Biru Senja', value: 'linear-gradient(180deg, #0c1524 0%, #09090b 100%)' },
  { name: 'Hutan Gelap', value: 'linear-gradient(180deg, #0b1a12 0%, #09090b 100%)' },
  { name: 'Ungu Malam', value: 'linear-gradient(180deg, #150d24 0%, #09090b 100%)' },
  { name: 'Marun', value: 'linear-gradient(180deg, #240d10 0%, #09090b 100%)' },
  { name: 'Abu Solid', value: '#101012' },
];

$('#btn-settings').addEventListener('click', async () => {
  $('#modal-settings').classList.add('active');
  $('#settings-username').textContent = t('settings_as', currentUser.username);
  renderSettingsAvatar();
  renderWallpaperPresets();
});

$('#settings-close').addEventListener('click', () => $('#modal-settings').classList.remove('active'));

function renderSettingsAvatar() {
  const el = $('#settings-avatar-preview');
  if (currentUser.avatar) {
    el.innerHTML = `<img src="${esc(currentUser.avatar)}" style="width:100%; height:100%; object-fit:cover;" alt="">`;
  } else {
    el.textContent = currentUser.username.slice(0, 1).toUpperCase();
  }
  // also update sidebar avatar
  const side = $('#avatar-init');
  if (currentUser.avatar) {
    side.innerHTML = `<img src="${esc(currentUser.avatar)}" style="width:100%; height:100%; object-fit:cover; border-radius:50%;" alt="">`;
  } else {
    side.textContent = currentUser.username.slice(0, 1).toUpperCase();
  }
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
    toast('Avatar diperbarui', 'success');
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
      <span style="position:relative; z-index:1; background:rgba(0,0,0,0.35); padding:2px 6px; border-radius:5px;">${p.name}</span>
      ${current === String(p.value) ? '<span style="position:absolute; top:4px; right:4px; width:8px; height:8px; border-radius:50%; background:var(--accent);"></span>' : ''}
    </button>`).join('');
}

async function applyWallpaper() {
  const r = await fetch('/api/wallpaper');
  const data = await r.json();
  const msgArea = document.querySelector('.main');
  if (data.wallpaper) {
    msgArea.classList.add('has-wallpaper');
    if (data.wallpaper.startsWith('data:image/')) {
      msgArea.style.background = `url("${data.wallpaper}") center/cover no-repeat`;
    } else {
      msgArea.style.background = data.wallpaper;
    }
  } else {
    msgArea.classList.remove('has-wallpaper');
    msgArea.style.background = '';
  }
  // mark active preset
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
  toast(t('wallpaper_set', preset.name), 'success');
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

// escape closes modals (R-32)
document.addEventListener('keydown', (e) => {
  if (e.key === 'Escape') {
    $('#modal-confirm').classList.remove('active');
    $('#modal-admin').classList.remove('active');
    $('#modal-logout').classList.remove('active');
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
console.log('[TT] app v1.1.3 fresh-load');
(async () => {
  let user = null;
  try {
    const r = await fetch('/api/me');
    if (r.ok) user = await r.json();
  } catch(e) { console.warn('boot /api/me:', e); }

  // reveal correct view BEFORE heavy init (no flash)
  if (user) {
    currentUser = user;
    $('#app-view').classList.add('ready', 'active');
  } else {
    $('#login-view').classList.add('ready');
  }

  try { applyI18N(); } catch(e) { console.warn('i18n boot:', e); }
  try { applyTempUI(); } catch(e) { console.warn('temp boot:', e); }

  if (user) await enterApp();
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

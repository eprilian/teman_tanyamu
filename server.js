// Teman Tanyamu: lightweight AI chat web app (Express + SQLite + SSE relay to 9Router)
const express = require('express');
const Database = require('better-sqlite3');
const crypto = require('crypto');
const path = require('path');
const dns = require('node:dns/promises');

// Model gateway config lives in the settings table (editable in Admin Dashboard).
// Env vars ROUTER_BASE / ROUTER_KEY act as boot fallback only (used when DB is empty).
const ROUTER_BASE_FALLBACK = process.env.ROUTER_BASE || '';
const ROUTER_KEY_FALLBACK = process.env.ROUTER_KEY || '';
const PORT = process.env.PORT || 3000;
const SESSION_DAYS = 7;
const DAILY_QUOTA_DEFAULT = 50;

const db = new Database(path.join(__dirname, 'chat.db'));
db.pragma('journal_mode = WAL');
db.exec(`
CREATE TABLE IF NOT EXISTS users (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  username TEXT UNIQUE NOT NULL,
  password_hash TEXT NOT NULL,
  role TEXT NOT NULL DEFAULT 'user',
  daily_quota INTEGER NOT NULL DEFAULT ${DAILY_QUOTA_DEFAULT},
  model_override TEXT,
  avatar TEXT,
  active INTEGER NOT NULL DEFAULT 1,
  created_at TEXT DEFAULT (datetime('now'))
);
CREATE TABLE IF NOT EXISTS sessions (
  token TEXT PRIMARY KEY,
  user_id INTEGER NOT NULL,
  expires_at INTEGER NOT NULL
);
CREATE TABLE IF NOT EXISTS chats (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id INTEGER NOT NULL,
  title TEXT NOT NULL,
  model TEXT NOT NULL,
  created_at TEXT DEFAULT (datetime('now')),
  updated_at TEXT DEFAULT (datetime('now'))
);
CREATE TABLE IF NOT EXISTS messages (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  chat_id INTEGER NOT NULL,
  role TEXT NOT NULL,
  content TEXT NOT NULL,
  tokens INTEGER DEFAULT 0,
  created_at TEXT DEFAULT (datetime('now'))
);
CREATE TABLE IF NOT EXISTS usage (
  user_id INTEGER NOT NULL,
  date TEXT NOT NULL,
  request_count INTEGER DEFAULT 0,
  tokens_used INTEGER DEFAULT 0,
  PRIMARY KEY (user_id, date)
);
CREATE TABLE IF NOT EXISTS settings (
  key TEXT PRIMARY KEY,
  value TEXT
);
`);

// migrations
try { db.exec('ALTER TABLE users ADD COLUMN model_override TEXT'); } catch (_) {}
try { db.exec('ALTER TABLE users ADD COLUMN avatar TEXT'); } catch (_) {}
try { db.exec('ALTER TABLE users ADD COLUMN active INTEGER NOT NULL DEFAULT 1'); } catch (_) {}
try { db.exec('ALTER TABLE chats ADD COLUMN lean INTEGER NOT NULL DEFAULT 0'); } catch (_) {}
try { db.exec('ALTER TABLE chats ADD COLUMN summary TEXT'); } catch (_) {}
try { db.exec('ALTER TABLE chats ADD COLUMN summary_upto_id INTEGER NOT NULL DEFAULT 0'); } catch (_) {}
try { db.exec('ALTER TABLE usage ADD COLUMN prompt_tokens INTEGER NOT NULL DEFAULT 0'); } catch (_) {}
try { db.exec('ALTER TABLE usage ADD COLUMN completion_tokens INTEGER NOT NULL DEFAULT 0'); } catch (_) {}
db.exec(`CREATE TABLE IF NOT EXISTS memories (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id INTEGER NOT NULL,
  content TEXT NOT NULL,
  source TEXT NOT NULL DEFAULT 'auto',
  updated_at TEXT DEFAULT (datetime('now'))
);`);

db.exec(`CREATE TABLE IF NOT EXISTS guest_sessions (
  token TEXT PRIMARY KEY,
  guest_id INTEGER NOT NULL,
  msgs_used INTEGER NOT NULL DEFAULT 0,
  started_at INTEGER NOT NULL DEFAULT 0,
  expires_at INTEGER NOT NULL
);`);
db.exec(`CREATE INDEX IF NOT EXISTS idx_guest_sessions_gid ON guest_sessions (guest_id);`);
try { db.exec('DROP TABLE IF EXISTS guest_policy'); } catch (_) {}
try { db.exec('ALTER TABLE guest_sessions ADD COLUMN msgs_used INTEGER NOT NULL DEFAULT 0'); } catch (_) {}
try { db.exec('ALTER TABLE guest_sessions ADD COLUMN started_at INTEGER NOT NULL DEFAULT 0'); } catch (_) {}

// seed admin
if (db.prepare('SELECT COUNT(*) c FROM users').get().c === 0) {
  const adminPass = process.env.ADMIN_PASSWORD || 'admin123';
  const hash = crypto.scryptSync(adminPass, 'salt-dash-ai-me', 64).toString('hex');
  db.prepare("INSERT INTO users (username, password_hash, role, daily_quota) VALUES (?, ?, 'admin', 999999)").run('admin', hash);
  console.log('Admin awal: admin/admin123 (ganti segera)');
}

const app = express();
app.set('trust proxy', true); // behind Cloudflare Tunnel / reverse proxy
app.use(express.json({ limit: '2mb' }));
app.use((req, res, next) => {
  res.setHeader('X-Content-Type-Options', 'nosniff');
  res.setHeader('X-Frame-Options', 'DENY');
  res.setHeader('Referrer-Policy', 'no-referrer');
  next();
});
app.use(express.static(path.join(__dirname, 'public'), {
  setHeaders: (res, filePath) => {
    if (filePath.endsWith('.html')) {
      res.setHeader('Cache-Control', 'no-cache, no-store, must-revalidate');
    } else if (/\.(css|js)$/.test(filePath)) {
      res.setHeader('Cache-Control', 'no-cache');
    }
  }
}));

// ---------- helpers ----------
const SCRYPT_LEGACY = 'salt-dash-ai-me';

// per-user random salt: stored as "scrypt1:<saltHex>:<hashHex>"
function hashPassword(pw, saltHex) {
  const salt = saltHex || crypto.randomBytes(16).toString('hex');
  const hash = crypto.scryptSync(String(pw), salt, 64).toString('hex');
  return `scrypt1:${salt}:${hash}`;
}

function verifyPassword(pw, stored) {
  if (typeof stored !== 'string') return false;
  if (stored.startsWith('scrypt1:')) {
    const [, salt, hash] = stored.split(':');
    if (!salt || !hash) return false;
    const candidate = crypto.scryptSync(String(pw), salt, 64);
    const expected = Buffer.from(hash, 'hex');
    return candidate.length === expected.length && crypto.timingSafeEqual(candidate, expected);
  }
  // legacy static-salt hash (pre-migration)
  const legacy = crypto.scryptSync(String(pw), SCRYPT_LEGACY, 64);
  const expected = Buffer.from(stored, 'hex');
  return legacy.length === expected.length && crypto.timingSafeEqual(legacy, expected);
}

// upgrade legacy hashes to per-user salt on successful login
function maybeUpgradeHash(userId, pw, stored) {
  if (!String(stored).startsWith('scrypt1:')) {
    db.prepare('UPDATE users SET password_hash = ? WHERE id = ?').run(hashPassword(pw), userId);
  }
}

function getSessionUser(req) {
  const token = (req.headers.cookie || '').match(/session=([a-f0-9]+)/);
  if (!token) return null;
  const row = db.prepare('SELECT s.token, s.expires_at, u.id, u.username, u.role, u.daily_quota, u.model_override, u.avatar, u.active FROM sessions s JOIN users u ON u.id = s.user_id WHERE s.token = ?').get(token[1]);
  if (!row || row.expires_at < Date.now()) return null;
  if (!row.active) return null;
  return { id: row.id, username: row.username, role: row.role, daily_quota: row.daily_quota, model_override: row.model_override, avatar: row.avatar };
}

function requireAuth(req, res, next) {
  const user = getSessionUser(req);
  if (user) { req.user = user; req.guest = null; return next(); }
  if (guestEnabled()) {
    const gs = guestSession(req);
    if (gs) { req.user = gs.user; req.guest = gs; return next(); }
  }
  return res.status(401).json({ error: 'ERR_UNAUTH' });
}

function requireRegistered(req, res, next) {
  if (req.guest) return res.status(403).json({ error: 'ERR_GUEST_NOPE' });
  next();
}
function requireAdmin(req, res, next) {
  if (req.user.role !== 'admin') return res.status(403).json({ error: 'ERR_ADMIN_ONLY' });
  next();
}

function today() { return new Date().toISOString().slice(0, 10); }

function checkQuota(user) {
  if (user.role === 'admin') return { ok: true };
  const row = db.prepare('SELECT request_count FROM usage WHERE user_id = ? AND date = ?').get(user.id, today());
  const used = row ? row.request_count : 0;
  if (used >= user.daily_quota) return { ok: false, used, quota: user.daily_quota };
  return { ok: true, used, quota: user.daily_quota };
}

function countRequest(user, tokens, promptTokens, completionTokens) {
  if (user.guest) { bumpGuestMsg(user.guest_id); return; }
  bumpUsage(user, tokens, promptTokens, completionTokens);
}
function bumpUsage(user, tokens, promptTokens, completionTokens) {
  const p = promptTokens || 0, c = completionTokens || 0;
  db.prepare(`INSERT INTO usage (user_id, date, request_count, tokens_used, prompt_tokens, completion_tokens) VALUES (?, ?, 1, ?, ?, ?)
    ON CONFLICT(user_id, date) DO UPDATE SET request_count = request_count + 1, tokens_used = tokens_used + excluded.tokens_used, prompt_tokens = prompt_tokens + excluded.prompt_tokens, completion_tokens = completion_tokens + excluded.completion_tokens`)
    .run(user.id, today(), tokens, p, c);
}

// ---------- model gateway (base URL + API key) ----------
function getRouterBase() {
  return getSetting('router_base') || ROUTER_BASE_FALLBACK;
}
function getRouterKey() {
  return getSetting('router_key') || ROUTER_KEY_FALLBACK;
}
function maskKey(k) {
  if (!k) return '';
  if (k.length <= 10) return '****';
  return k.slice(0, 6) + '…' + k.slice(-4);
}
// SSRF guard: block link-local/metadata addresses; localhost & LAN allowed (self-hosted gateway)
const BLOCKED_V4 = [/^169\.254\./, /^0\./];
async function isBlockedHost(host) {
  if (/^\[?[fF][c-d][0-9a-fA-F:]*\]?$/.test(host)) return true;
  if (/^\d+\.\d+\.\d+\.\d+$/.test(host)) return BLOCKED_V4.some(re => re.test(host));
  if (/^[0-9a-fA-F:]*:[0-9a-fA-F:]*$/.test(host)) return /^\[?(fe80|fc|fd|::1)/i.test(host);
  try {
    const addrs = await dns.lookup(host, { all: true });
    return addrs.some(a => BLOCKED_V4.some(re => re.test(a.address)) || /^(fe80|fc|fd)/i.test(a.address));
  } catch (_) { return false; }
}
// returns null if ok, else ERR_* code
async function validateRouterBase(v) {
  if (typeof v !== 'string' || !v.trim()) return 'ERR_BASE_REQUIRED';
  let u;
  try { u = new URL(v.trim()); } catch (_) { return 'ERR_BASE_INVALID'; }
  if (u.protocol !== 'http:' && u.protocol !== 'https:') return 'ERR_BASE_INVALID';
  if (!u.hostname) return 'ERR_BASE_INVALID';
  if (await isBlockedHost(u.hostname)) return 'ERR_BASE_BLOCKED_HOST';
  return null;
}
function routerConfigured() {
  return Boolean(getRouterBase() && getRouterKey());
}

// ---------- guest mode ----------
const GUEST_MIN = 1; const GUEST_MAX = 200;
function guestEnabled() { return getSetting('guest_enabled') === '1'; }
function guestPolicy() {
  const n = Number(getSetting('guest_max_chats'));
  const m = Number(getSetting('guest_max_minutes'));
  return {
    max_chats: Math.max(GUEST_MIN, Math.min(GUEST_MAX, Number.isFinite(n) && n > 0 ? Math.round(n) : 10)),
    max_minutes: Math.max(1, Math.min(720, Number.isFinite(m) && m > 0 ? Math.round(m) : 5))
  };
}
function readCookie(req, name) {
  const m = (req.headers.cookie || '').match(new RegExp('(?:^|; )' + name + '=([a-f0-9]+)'));
  return m ? m[1] : null;
}
function guestRowByToken(token) {
  return db.prepare('SELECT guest_id, token, msgs_used, started_at, expires_at FROM guest_sessions WHERE token = ?').get(token);
}
// returns { user, row, pol, expired, msgs_left, seconds_left } or null if no/bad token
function guestSession(req) {
  const token = readCookie(req, 'gtoken');
  if (!token) return null;
  const row = guestRowByToken(token);
  if (!row || row.expires_at < Date.now()) return null;
  const pol = guestPolicy();
  const elapsed = Math.floor((Date.now() - row.started_at) / 1000);
  const seconds_left = Math.max(0, pol.max_minutes * 60 - elapsed);
  const expired = seconds_left <= 0;
  const user = { id: -row.guest_id, guest_id: row.guest_id, username: 'Guest', role: 'user', daily_quota: 999999, model_override: null, avatar: null, guest: true };
  return { user, row, pol, expired, msgs_left: Math.max(0, pol.max_chats - row.msgs_used), seconds_left };
}
function guestBlockReason(gs) {
  if (!gs) return 'ERR_UNAUTH';
  if (gs.expired) return 'ERR_GUEST_TIME';
  if (gs.row.msgs_used >= gs.pol.max_chats) return 'ERR_GUEST_CHATS';
  return null;
}
function bumpGuestMsg(guestId) {
  db.prepare('UPDATE guest_sessions SET msgs_used = msgs_used + 1 WHERE guest_id = ?').run(guestId);
}
// 403/429 for guests that hit their limits; returns true if response was sent
function guestLimitHit(req, res) {
  if (!req.guest) return false;
  const reason = guestBlockReason(req.guest);
  if (!reason) return false;
  res.status(reason === 'ERR_UNAUTH' ? 401 : 429).json({ error: reason });
  return true;
}
function purgeOldGuests() {
  // remove chats/messages of guest sessions dead for > 1 day (runs at new guest login)
  const cutoff = Date.now() - 86400e3;
  const dead = db.prepare('SELECT guest_id FROM guest_sessions WHERE expires_at < ?').all(cutoff);
  const delMsgs = db.prepare('DELETE FROM messages WHERE chat_id IN (SELECT id FROM chats WHERE user_id = ?)');
  const delChats = db.prepare('DELETE FROM chats WHERE user_id = ?');
  const delSess = db.prepare('DELETE FROM guest_sessions WHERE guest_id = ?');
  for (const d of dead) {
    delMsgs.run(-d.guest_id);
    delChats.run(-d.guest_id);
    delSess.run(d.guest_id);
  }
}

async function routerFetch(pathname, opts = {}) {
  const base = getRouterBase();
  const key = getRouterKey();
  if (!base || !key) { const e = new Error('router-not-configured'); e.code = 'ERR_ROUTER_NOT_CONFIGURED'; throw e; }
  return fetch(base + pathname, {
    ...opts,
    headers: { 'Content-Type': 'application/json', 'Authorization': 'Bearer ' + key, ...(opts.headers || {}) }
  });
}

const DEFAULT_MODEL = 'ag/gemini-3.7-flash-medium';
const WALLPAPER_IMG_RE = /^data:image\/(png|jpe?g|gif|webp);base64,[A-Za-z0-9+/=]+$/;
const WALLPAPER_CSS_RE = /^(linear-gradient\([^;{}]*\)|#[0-9a-fA-F]{3,8})$/;
function isValidWallpaper(w) {
  if (typeof w !== 'string' || w.length > 1500000) return false;
  return WALLPAPER_IMG_RE.test(w) || WALLPAPER_CSS_RE.test(w);
}
function getGlobalModel() {
  const row = db.prepare("SELECT value FROM settings WHERE key = 'default_model'").get();
  return (row && row.value) || DEFAULT_MODEL;
}
function resolveUserModel(user) {
  return user.model_override || getGlobalModel();
}
function getSetting(key) {
  const row = db.prepare('SELECT value FROM settings WHERE key = ?').get(key);
  return row ? row.value : null;
}
function setSetting(key, value) {
  db.prepare('INSERT INTO settings (key, value) VALUES (?, ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value').run(key, value);
}

// strip image filenames / clipboard junk that breaks text-only models
function sanitizeMessage(msg) {
  const out = msg
    .replace(/[^\s]*\.(jpe?g|png|gif|webp|bmp|heic)\b/gi, '')
    .replace(/Cannot read\s+"[^"]*"[^. ]*/gi, '')
    .replace(/\s{2,}/g, ' ')
    .trim();
  return out || msg;
}

// ---------- token saver helpers ----------
function estTokens(s) { return Math.ceil(String(s || '').length / 4); }

// compress an old message: keep head+tail so code/paste junk shrinks but gist stays
function compressOld(text) {
  const t = String(text || '');
  if (t.length <= 420) return t;
  return t.slice(0, 200) + '\n…[dipotong hemat token]…\n' + t.slice(-200);
}

function getSettingInt(key, dflt) {
  const v = getSetting(key);
  const n = Number(v);
  return Number.isFinite(n) && n > 0 ? n : dflt;
}

// model/provider timeout: admin-configurable (default 120s, min 30s, max 600s)
function getTimeoutMs() {
  const v = getSetting('timeout_ms');
  const n = Number(v);
  if (!Number.isFinite(n)) return 120000;
  return Math.min(600000, Math.max(30000, Math.round(n) * 1000));
}

// Build model-bound history under a token budget:
// - newest messages first, full content within budget
// - older-but-kept messages compressed (head+tail)
// - everything before summary_upto_id is represented by the stored summary instead
function buildHistory(chatId, summaryUptoId, budget) {
  const rows = db.prepare('SELECT id, role, content FROM messages WHERE chat_id = ? ORDER BY id DESC LIMIT 200').all(chatId);
  const kept = [];
  let used = 0;
  for (const m of rows) {
    const cost = estTokens(m.content);
    if (used + cost > budget) break;
    kept.push(m);
    used += cost;
  }
  kept.reverse(); // back to chronological
  return kept.map((m, i) => {
    const isRecent = i >= kept.length - 6;
    // older messages: compress long content (head+tail) to save repeated prompt tokens
    const content = (!isRecent && m.content.length > 420) ? compressOld(m.content) : m.content;
    return { role: m.role, content };
  });
}

// ---------- per-user memory (cross-chat) ----------
const MEMORY_MAX_FACTS = 20;
const MEMORY_MAX_CHARS = 2400;
function memoryEnabled(user) {
  // global kill-switch (admin), default on
  return getSetting('memory_enabled') !== '0';
}
function getMemoryBlock(user) {
  if (!memoryEnabled(user)) return '';
  const rows = db.prepare('SELECT content FROM memories WHERE user_id = ? ORDER BY id DESC LIMIT ?').all(user.id, MEMORY_MAX_FACTS);
  if (!rows.length) return '';
  return rows.map(r => '- ' + r.content).join('\n');
}
function memorySyncChatId(user) { try { return Number(getSetting('memory_sync_chat') || 0); } catch (_) { return 0; } }

function saveMemoryList(user, facts) {
  const clean = (Array.isArray(facts) ? facts : [])
    .map(f => String(f).replace(/\s+/g, ' ').trim().slice(0, 240))
    .filter(Boolean)
    .slice(0, MEMORY_MAX_FACTS);
  const tx = db.transaction(() => {
    db.prepare('DELETE FROM memories WHERE user_id = ?').run(user.id);
    const ins = db.prepare('INSERT INTO memories (user_id, content, source) VALUES (?, ?, ?)');
    for (const f of clean) ins.run(user.id, f, 'auto');
  });
  tx();
  return clean.length;
}

async function nonStreamChat(model, messages, maxTokens, timeoutMs) {
  const r = await routerFetch('/chat/completions', {
    method: 'POST',
    body: JSON.stringify({ model, messages, stream: false, max_tokens: maxTokens }),
    signal: AbortSignal.timeout(timeoutMs)
  });
  if (!r.ok) throw new Error('upstream ' + r.status);
  const j = await r.json();
  return (j.choices && j.choices[0] && j.choices[0].message && j.choices[0].message.content) || '';
}

// fire-and-forget background LLM task: never breaks the main reply
async function bgTask(label, fn) {
  try { await fn(); } catch (e) { console.error('[bg:' + label + ']', e.message); }
}

const MEMORY_SYSTEM = 'Kamu adalah modul memori. Dari percakapan, tulis fakta PERSONAL tentang user yang berguna di chat mendatang (nama/ panggilan, oshi/preferensi, proyek, bahasa, gaya jawab, larangan). BUKAN topik chat sementara, BUKAN jawaban asisten. Keluaran: maksimal 20 baris, tiap baris diawali "- " lalu satu fakta singkat (<=200 karakter), bahasa Indonesia. Jika tidak ada fakta baru dari percakapan, kembalikan daftar lama apa adanya.';

function scheduleMemoryUpdate(user, chat, history) {
  if (!memoryEnabled(user)) return;
  // throttle: every 6 user turns per user (count stored memories' implicit turns via usage of bg flag)
  const turns = db.prepare('SELECT COUNT(*) c FROM messages WHERE chat_id = ? AND role = ?').get(chat.id, 'user').c;
  const last = Number(getSetting('memory:last:' + user.id) || 0);
  if (turns - last < 6) return;
  db.prepare('INSERT INTO settings (key, value) VALUES (?, ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value').run('memory:last:' + user.id, String(turns));
  const recent = history.slice(-12).map(m => (m.role === 'user' ? 'USER' : 'AI') + ': ' + m.content.slice(0, 400)).join('\n');
  const existing = getMemoryBlock(user);
  const task = async () => {
    const out = await nonStreamChat(resolveUserModel(user), [
      { role: 'system', content: MEMORY_SYSTEM },
      { role: 'user', content: 'DAFTAR MEMORI LAMA:\n' + (existing || '(kosong)') + '\n\nPERCAKAPAN TERAKHIR:\n' + recent + '\n\nTulis daftar memori final (gabungkan, hapus yang kadaluarsa/kontradiktif, maksimal 20 baris "- "):' }
    ], 500, 60000);
    const facts = out.split('\n').map(l => l.replace(/^[-*•\d.\s]+/, '').trim()).filter(l => l && l.length > 6);
    if (facts.length) saveMemoryList(user, facts);
  };
  bgTask('memory', task);
}

const SUMMARY_SYSTEM = 'Ringkas percakapan lama ke dalam catatan konteks padat (maks 1200 karakter) yang menyatukan ringkasan lama + pesan baru. Simpan: topik, keputusan, fakta, tugas belum selesai, preferensi gaya. Bahasa Indonesia. Keluaran hanya ringkasan, tanpa preamble.';

function scheduleSummary(chat, newUptoId) {
  const summary = chat.summary || '';
  const rows = db.prepare('SELECT id, role, content FROM messages WHERE chat_id = ? AND id > ? ORDER BY id LIMIT 100').all(chat.id, chat.summary_upto_id || 0);
  const outside = rows.filter(r => r.id <= newUptoId - 10); // only compress the clearly-old part
  if (outside.length < 12) return; // not enough to bother
  const cut = outside[outside.length - 1].id;
  const lines = outside.map(r => (r.role === 'user' ? 'USER' : 'AI') + ': ' + compressOld(r.content).slice(0, 500)).join('\n');
  const task = async () => {
    const out = await nonStreamChat(chat.model, [
      { role: 'system', content: SUMMARY_SYSTEM },
      { role: 'user', content: 'RINGKASAN LAMA:\n' + (summary || '(belum ada)') + '\n\nPERCAKAPAN LAMA YANG HARUS DIMASUKKAN:\n' + lines + '\n\nRingkasan final:' }
    ], 400, 60000);
    if (out && out.trim()) {
      db.prepare('UPDATE chats SET summary = ?, summary_upto_id = ? WHERE id = ?').run(out.trim().slice(0, 2400), cut, chat.id);
    }
  };
  bgTask('summary', task);
}

function buildSystemPrompt(user, chat) {
  const parts = ['Kamu asisten AI pribadi di app ringan. Jawab relevan, hemat, dalam bahasa user (default Indonesia).'];
  const mem = getMemoryBlock(user);
  if (mem) parts.push('MEMORI TENTANG USER (ingat lintas chat, jangan sebut modul ini kecuali ditanya):\n' + mem);
  if (chat.summary) parts.push('RINGKASAN POBROLAN SEBELUMNYA DI CHAT INI:\n' + chat.summary);
  return parts.join('\n\n');
}

// ---------- auth ----------
// login rate limiting: max 5 failed attempts per IP, then 2 minute block
const loginAttempts = new Map(); // ip -> { count, firstAt, blockedUntil }
const LOGIN_MAX = 5;
const LOGIN_BLOCK_MS = 2 * 60 * 1000; // 2 minutes

function get_client_ip(req) {
  return (req.headers['cf-connecting-ip'] || req.headers['x-forwarded-for'] || '').split(',')[0].trim() || req.socket.remoteAddress || 'unknown';
}

function getLoginState(ip) {
  const rec = loginAttempts.get(ip);
  if (!rec) return { blocked: false, remaining: LOGIN_MAX, retryAfterSec: 0 };
  // still in block period?
  if (rec.blockedUntil && Date.now() < rec.blockedUntil) {
    return { blocked: true, remaining: 0, retryAfterSec: Math.ceil((rec.blockedUntil - Date.now()) / 1000) };
  }
  // block expired -> reset
  if (rec.blockedUntil && Date.now() >= rec.blockedUntil) {
    loginAttempts.delete(ip);
    return { blocked: false, remaining: LOGIN_MAX, retryAfterSec: 0 };
  }
  return { blocked: false, remaining: Math.max(0, LOGIN_MAX - rec.count), retryAfterSec: 0 };
}

function recordFailedLogin(ip) {
  const rec = loginAttempts.get(ip) || { count: 0, firstAt: Date.now(), blockedUntil: 0 };
  rec.count++;
  if (rec.count >= LOGIN_MAX) {
    rec.blockedUntil = Date.now() + LOGIN_BLOCK_MS;
  }
  loginAttempts.set(ip, rec);
  // periodic cleanup
  if (loginAttempts.size > 1000) {
    const now = Date.now();
    for (const [k, v] of loginAttempts) {
      if (v.blockedUntil && now >= v.blockedUntil) loginAttempts.delete(k);
    }
  }
}

app.post('/api/login', (req, res) => {
  const ip = get_client_ip(req);
  const state = getLoginState(ip);
  if (state.blocked) {
    return res.status(429).json({ error: 'ERR_RATE_LIMITED', retryAfterSec: state.retryAfterSec });
  }
  const { username, password } = req.body || {};
  if (!username || !password) return res.status(400).json({ error: 'ERR_FIELDS_REQUIRED' });
  const user = db.prepare('SELECT * FROM users WHERE username = ?').get(username);
  if (!user || !verifyPassword(password, user.password_hash)) {
    recordFailedLogin(ip);
    const st = getLoginState(ip);
    return res.status(401).json({ error: 'ERR_LOGIN', remainingAttempts: st.remaining });
  }
  if (!user.active) return res.status(403).json({ error: 'ERR_INACTIVE' });
  loginAttempts.delete(ip); // successful login clears failures
  maybeUpgradeHash(user.id, password, user.password_hash);
  db.prepare('DELETE FROM sessions WHERE expires_at < ?').run(Date.now()); // purge expired sessions
  const token = crypto.randomBytes(32).toString('hex');
  const expires = Date.now() + SESSION_DAYS * 86400e3;
  db.prepare('INSERT INTO sessions (token, user_id, expires_at) VALUES (?, ?, ?)').run(token, user.id, expires);
  const isHttps = req.headers['x-forwarded-proto'] === 'https' || req.secure;
  const cookieFlags = `session=${token}; HttpOnly; Path=/; Max-Age=${SESSION_DAYS * 86400}; SameSite=Lax${isHttps ? '; Secure' : ''}`;
  res.setHeader('Set-Cookie', cookieFlags);
  res.json({ ok: true, role: user.role, username: user.username });
});

// Guest sign-in: create/reuse guest session. No credentials; rate-limited by same IP guard as login.
app.post('/api/guest', (req, res) => {
  if (!guestEnabled()) return res.status(403).json({ error: 'ERR_GUEST_DISABLED' });
  const ip = get_client_ip(req);
  const st = getLoginState(ip);
  if (st.blocked) return res.status(429).json({ error: 'ERR_RATE_LIMITED', retryAfterSec: st.retryAfterSec });
  purgeOldGuests();
  const token = readCookie(req, 'gtoken');
  let row = token ? guestRowByToken(token) : null;
  const now = Date.now();
  if (!(row && row.expires_at > now)) {
    row = null;
    const gid = db.prepare('SELECT COALESCE(MAX(guest_id), 0) m FROM guest_sessions').get().m + 1;
    const t2 = crypto.randomBytes(32).toString('hex');
    const isHttps = req.headers['x-forwarded-proto'] === 'https' || req.secure;
    const secure = isHttps ? '; Secure' : '';
    db.prepare('INSERT INTO guest_sessions (token, guest_id, msgs_used, started_at, expires_at) VALUES (?,?,?,?,?)')
      .run(t2, gid, 0, now, now + 86400e3);
    res.setHeader('Set-Cookie', `gtoken=${t2}; HttpOnly; Path=/; Max-Age=86400; SameSite=Lax${secure}`);
    row = { guest_id: gid, msgs_used: 0, started_at: now, expires_at: now + 86400e3 };
  }
  const pol = guestPolicy();
  const elapsed = Math.floor((Date.now() - row.started_at) / 1000);
  res.json({
    ok: true, guest: true,
    msgs_left: Math.max(0, pol.max_chats - row.msgs_used),
    seconds_left: Math.max(0, pol.max_minutes * 60 - elapsed),
    max_chats: pol.max_chats
  });
});

app.post('/api/logout', (req, res) => {
  const token = (req.headers.cookie || '').match(/session=([a-f0-9]+)/);
  if (token) db.prepare('DELETE FROM sessions WHERE token = ?').run(token[1]);
  const gtoken = readCookie(req, 'gtoken');
  if (gtoken) {
    const row = guestRowByToken(gtoken);
    if (row) {
      const delMsgs = db.prepare('DELETE FROM messages WHERE chat_id IN (SELECT id FROM chats WHERE user_id = ?)');
      const delChats = db.prepare('DELETE FROM chats WHERE user_id = ?');
      delMsgs.run(-row.guest_id);
      delChats.run(-row.guest_id);
      db.prepare('DELETE FROM guest_sessions WHERE guest_id = ?').run(row.guest_id);
    }
  }
  res.setHeader('Set-Cookie', ['session=; HttpOnly; Path=/; Max-Age=0', 'gtoken=; HttpOnly; Path=/; Max-Age=0']);
  res.json({ ok: true });
});

app.get('/api/me', requireAuth, (req, res) => {
  if (req.guest) {
    return res.json({
      id: req.user.id,
      username: 'Guest',
      role: 'user',
      guest: true,
      quota_used: req.guest.row.msgs_used,
      quota_max: req.guest.pol.max_chats,
      msgs_left: req.guest.msgs_left,
      seconds_left: req.guest.seconds_left,
      expired: req.guest.expired,
      effective_model: getGlobalModel(),
      model_override: null,
      global_model: getGlobalModel(),
      avatar: null,
      assistant_avatar: getSetting('assistant_avatar') || null
    });
  }
  const q = checkQuota(req.user);
  const usedRow = db.prepare('SELECT request_count FROM usage WHERE user_id = ? AND date = ?').get(req.user.id, today());
  res.json({
    id: req.user.id,
    username: req.user.username,
    role: req.user.role,
    quota_used: usedRow ? usedRow.request_count : 0,
    quota_max: req.user.role === 'admin' ? null : (q.quota || null),
    effective_model: resolveUserModel(req.user),
    model_override: req.user.model_override,
    global_model: getGlobalModel(),
    avatar: req.user.avatar || null,
    assistant_avatar: getSetting('assistant_avatar') || null
  });
});

// account
app.put('/api/me/password', requireAuth, requireRegistered, (req, res) => {
  const { current, next } = req.body || {};
  if (!current || !next) return res.status(400).json({ error: 'ERR_FIELDS_REQUIRED' });
  if (String(next).length < 4) return res.status(400).json({ error: 'ERR_PW_SHORT' });
  const row = db.prepare('SELECT password_hash FROM users WHERE id = ?').get(req.user.id);
  if (!verifyPassword(current, row.password_hash)) return res.status(401).json({ error: 'ERR_OLD_PW' });
  db.prepare('UPDATE users SET password_hash = ? WHERE id = ?').run(hashPassword(next), req.user.id);
  res.json({ ok: true });
});

app.put('/api/me/avatar', requireAuth, requireRegistered, (req, res) => {
  const { avatar } = req.body || {};
  if (avatar !== null) {
    if (typeof avatar !== 'string' || !/^data:image\/(png|jpe?g|gif|webp);base64,[A-Za-z0-9+/=]+$/.test(avatar)) return res.status(400).json({ error: 'ERR_AVATAR_FORMAT' });
    if (avatar.length > 400000) return res.status(400).json({ error: 'ERR_TOO_BIG' });
  }
  db.prepare('UPDATE users SET avatar = ? WHERE id = ?').run(avatar, req.user.id);
  res.json({ ok: true, avatar });
});

// model override (admin only)
app.put('/api/me/model', requireAuth, requireRegistered, requireAdmin, (req, res) => {
  const { model } = req.body || {};
  if (!model || typeof model !== 'string') return res.status(400).json({ error: 'ERR_FIELDS_REQUIRED' });
  db.prepare('UPDATE users SET model_override = ? WHERE id = ?').run(model, req.user.id);
  res.json({ ok: true, model_override: model });
});
app.delete('/api/me/model', requireAuth, requireRegistered, requireAdmin, (req, res) => {
  db.prepare('UPDATE users SET model_override = NULL WHERE id = ?').run(req.user.id);
  res.json({ ok: true, model_override: null, effective_model: getGlobalModel() });
});

// ---------- chats ----------
app.get('/api/chats', requireAuth, (req, res) => {
  res.json(db.prepare('SELECT id, title, model, updated_at, lean, (summary IS NOT NULL AND summary != \'\') AS has_summary FROM chats WHERE user_id = ? ORDER BY updated_at DESC').all(req.user.id));
});

app.post('/api/chats', requireAuth, (req, res) => {
  const { title, model } = req.body || {};
  const effectiveModel = req.user.role === 'admin' ? (model || resolveUserModel(req.user)) : resolveUserModel(req.user);
  const info = db.prepare('INSERT INTO chats (user_id, title, model) VALUES (?, ?, ?)').run(req.user.id, (title || 'New Chat').slice(0, 120), effectiveModel);
  res.json(db.prepare('SELECT id, title, model FROM chats WHERE id = ?').get(info.lastInsertRowid));
});

app.get('/api/chats/:id', requireAuth, (req, res) => {
  const chat = db.prepare('SELECT * FROM chats WHERE id = ? AND user_id = ?').get(req.params.id, req.user.id);
  if (!chat) return res.status(404).json({ error: 'ERR_NOT_FOUND' });
  res.json({ ...chat, messages: db.prepare('SELECT id, role, content, created_at FROM messages WHERE chat_id = ? ORDER BY id').all(chat.id) });
});

app.delete('/api/chats/:id', requireAuth, (req, res) => {
  const chat = db.prepare('SELECT id FROM chats WHERE id = ? AND user_id = ?').get(req.params.id, req.user.id);
  if (!chat) return res.status(404).json({ error: 'ERR_NOT_FOUND' });
  db.prepare('DELETE FROM messages WHERE chat_id = ?').run(chat.id);
  db.prepare('DELETE FROM chats WHERE id = ?').run(chat.id);
  res.json({ ok: true });
});

app.patch('/api/chats/:id', requireAuth, (req, res) => {
  const { title, model } = req.body || {};
  const chat = db.prepare('SELECT id FROM chats WHERE id = ? AND user_id = ?').get(req.params.id, req.user.id);
  if (!chat) return res.status(404).json({ error: 'ERR_NOT_FOUND' });
  if (title) db.prepare("UPDATE chats SET title = ?, updated_at = datetime('now') WHERE id = ?").run(title.slice(0, 120), chat.id);
  if (model) {
    if (req.user.role !== 'admin') return res.status(403).json({ error: 'ERR_ADMIN_ONLY' });
    db.prepare("UPDATE chats SET model = ?, updated_at = datetime('now') WHERE id = ?").run(model, chat.id);
  }
  res.json({ ok: true });
});

// ---------- models ----------
app.get('/api/models', requireAuth, async (req, res) => {
  if (!routerConfigured()) return res.status(503).json({ error: 'ERR_ROUTER_NOT_CONFIGURED' });
  try {
    const r = await routerFetch('/models');
    const data = await r.json();
    res.json(data.data.map(m => m.id));
  } catch (e) {
    res.status(502).json({ error: e.code === 'ERR_ROUTER_NOT_CONFIGURED' ? e.code : 'ERR_ROUTER_DOWN' });
  }
});

// ---------- wallpaper ----------
app.get('/api/wallpaper', requireAuth, (req, res) => {
  const own = getSetting('user:' + req.user.id + ':wallpaper');
  const global = getSetting('wallpaper');
  res.json({ wallpaper: own !== null ? own : global, is_custom: own !== null, has_global: global !== null });
});

app.put('/api/wallpaper', requireAuth, requireRegistered, (req, res) => {
  const { wallpaper } = req.body || {};
  if (wallpaper !== null && !isValidWallpaper(wallpaper)) return res.status(400).json({ error: 'ERR_WALLPAPER_FORMAT' });
  setSetting('user:' + req.user.id + ':wallpaper', wallpaper);
  res.json({ ok: true, wallpaper });
});

// ---------- chat streaming ----------
app.post('/api/chat', requireAuth, async (req, res) => {
  const { chatId, message } = req.body || {};
  if (!chatId || !message || !message.trim()) return res.status(400).json({ error: 'ERR_FIELDS_REQUIRED' });

  const chat = db.prepare('SELECT * FROM chats WHERE id = ? AND user_id = ?').get(chatId, req.user.id);
  if (!chat) return res.status(404).json({ error: 'ERR_NOT_FOUND' });

  // enforce model policy for non-admin
  if (req.user.role !== 'admin') {
    const allowed = resolveUserModel(req.user);
    if (chat.model !== allowed) {
      db.prepare('UPDATE chats SET model = ? WHERE id = ?').run(allowed, chat.id);
      chat.model = allowed;
    }
  }

  if (guestLimitHit(req, res)) return;
  const quota = checkQuota(req.user);
  if (!quota.ok) return res.status(429).json({ error: 'ERR_QUOTA' });

  const cleanMessage = sanitizeMessage(message.trim());

  // --- token-saving context builder ---
  const HISTORY_BUDGET = getSettingInt('history_token_budget', 1600); // ~window lama, tapi berdasarkan token
  const MAX_REPLY_TOKENS = getSettingInt('max_reply_tokens', 1024);  // cap output
  const lean = !!chat.lean;
  const history = lean ? [] : buildHistory(chat.id, chat.summary_upto_id || 0, HISTORY_BUDGET);
  const systemPrompt = buildSystemPrompt(req.user, chat);

  db.prepare('INSERT INTO messages (chat_id, role, content) VALUES (?, ?, ?)').run(chat.id, 'user', cleanMessage);
  if (chat.title === 'New Chat' || chat.title === 'Chat baru') {
    db.prepare("UPDATE chats SET title = ?, updated_at = datetime('now') WHERE id = ?").run(cleanMessage.slice(0, 60), chat.id);
  }

  res.setHeader('Content-Type', 'text/event-stream');
  res.setHeader('Cache-Control', 'no-cache');
  res.setHeader('Connection', 'keep-alive');
  res.flushHeaders();

  let aiReply = '';
  let tokens = 0;
  let promptTokens = 0;
  let completionTokens = 0;
  let aborted = false;
  res.on('close', () => { if (!res.writableEnded) aborted = true; });

  try {
    const upstream = await routerFetch('/chat/completions', {
      method: 'POST',
      body: JSON.stringify({
        model: chat.model,
        messages: [{ role: 'system', content: systemPrompt }, ...history, { role: 'user', content: cleanMessage }],
        stream: true,
        max_tokens: MAX_REPLY_TOKENS
      }),
      signal: AbortSignal.timeout(getTimeoutMs())
    });

    if (!upstream.ok) {
      const errText = await upstream.text();
      res.write(`data: ${JSON.stringify({ error: '9Router ' + upstream.status + ': ' + errText.slice(0, 200) })}\n\n`);
      res.end();
      return;
    }

    const reader = upstream.body.getReader();
    const decoder = new TextDecoder();
    let buffer = '';
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
          const delta = chunk.choices?.[0]?.delta;
          if (delta && delta.content) {
            aiReply += delta.content;
            // intercept vision-error responses mid-stream: replace with friendly note once
            if (/Cannot read\s+"/.test(aiReply) || /does not support image input/.test(aiReply)) {
              const friendly = 'Your message looked like it contained an image. This model supports text only.';
              if (!aiReply._replaced) {
                aiReply._replaced = true;
                aiReply = friendly;
                res.write(`data: ${JSON.stringify({ content: friendly })}\n\n`);
              }
              continue; // swallow model error text
            }
            res.write(`data: ${JSON.stringify({ content: delta.content })}\n\n`);
          }
          if (chunk.usage) {
            tokens = (chunk.usage.total_tokens || tokens);
            promptTokens = chunk.usage.prompt_tokens || promptTokens;
            completionTokens = chunk.usage.completion_tokens || completionTokens;
          }
        } catch (_) {}
      }
    }

    if (aiReply) {
      db.prepare('INSERT INTO messages (chat_id, role, content, tokens) VALUES (?, ?, ?, ?)').run(chat.id, 'assistant', aiReply, tokens);
      db.prepare("UPDATE chats SET updated_at = datetime('now') WHERE id = ?").run(chat.id);
      countRequest(req.user, tokens, promptTokens, completionTokens);
      // background: refresh rolling summary + cross-chat memory (lean mode = no context, skip both)
      if (!lean) {
        const uptoId = db.prepare('SELECT MAX(id) m FROM messages WHERE chat_id = ?').get(chat.id).m || 0;
        scheduleSummary(chat, uptoId);
        if (!req.guest) scheduleMemoryUpdate(req.user, chat, [...history, { role: 'user', content: cleanMessage }, { role: 'assistant', content: aiReply }]);
      }
    }
    res.write(`data: ${JSON.stringify({ usage: { total: tokens, prompt: promptTokens, completion: completionTokens } })}\n\n`);
    res.write('data: [DONE]\n\n');
    res.end();
  } catch (e) {
    if (aiReply) {
      db.prepare('INSERT INTO messages (chat_id, role, content, tokens) VALUES (?, ?, ?, ?)').run(chat.id, 'assistant', aiReply, tokens);
      countRequest(req.user, tokens, promptTokens, completionTokens);
    }
    const friendly = e.code === 'ERR_ROUTER_NOT_CONFIGURED' ? e.code
      : (e.name === 'TimeoutError' || /timed? ?out/i.test(String(e.message || '')))
        ? 'ERR_TIMEOUT'
        : ('9Router/failed: ' + (e.message || 'unknown error')).slice(0, 300);
    res.write(`data: ${JSON.stringify({ error: friendly })}\n\n`);
    res.end();
  }
});

// ---------- per-chat lean (hemat token) toggle ----------
app.patch('/api/chats/:id/lean', requireAuth, (req, res) => {
  const { lean } = req.body || {};
  if (typeof lean !== 'boolean') return res.status(400).json({ error: 'ERR_FIELDS_REQUIRED' });
  const chat = db.prepare('SELECT id FROM chats WHERE id = ? AND user_id = ?').get(req.params.id, req.user.id);
  if (!chat) return res.status(404).json({ error: 'ERR_NOT_FOUND' });
  db.prepare('UPDATE chats SET lean = ? WHERE id = ?').run(lean ? 1 : 0, chat.id);
  res.json({ ok: true, lean });
});

// ---------- memory (cross-chat) ----------
app.get('/api/memory', requireAuth, requireRegistered, (req, res) => {
  const rows = db.prepare('SELECT id, content, source, updated_at FROM memories WHERE user_id = ? ORDER BY id').all(req.user.id);
  res.json({ facts: rows, enabled: getSetting('memory_enabled') !== '0', max: MEMORY_MAX_FACTS });
});

app.put('/api/memory', requireAuth, requireRegistered, (req, res) => {
  const { facts } = req.body || {};
  if (!Array.isArray(facts)) return res.status(400).json({ error: 'ERR_FIELDS_REQUIRED' });
  const n = saveMemoryList(req.user, facts);
  res.json({ ok: true, count: n });
});

app.delete('/api/memory/:factId', requireAuth, requireRegistered, (req, res) => {
  db.prepare('DELETE FROM memories WHERE id = ? AND user_id = ?').run(req.params.factId, req.user.id);
  res.json({ ok: true });
});

app.post('/api/memory/clear', requireAuth, requireRegistered, (req, res) => {
  db.prepare('DELETE FROM memories WHERE user_id = ?').run(req.user.id);
  res.json({ ok: true });
});

// ---------- temp chat (no history saved) ----------
app.post('/api/temp-chat', requireAuth, async (req, res) => {
  const { message, model, lean } = req.body || {};
  if (!message || !message.trim()) return res.status(400).json({ error: 'ERR_FIELDS_REQUIRED' });

  if (guestLimitHit(req, res)) return;
  const quota = checkQuota(req.user);
  if (!quota.ok) return res.status(429).json({ error: 'ERR_QUOTA' });

  const effectiveModel = req.user.role === 'admin' ? (model || resolveUserModel(req.user)) : resolveUserModel(req.user);

  res.setHeader('Content-Type', 'text/event-stream');
  res.setHeader('Cache-Control', 'no-cache');
  res.setHeader('Connection', 'keep-alive');
  res.flushHeaders();

  let tokens = 0;
  let aiTempReply = '';
  let aborted = false;
  res.on('close', () => { if (!res.writableEnded) aborted = true; });

  const systemPrompt = buildSystemPrompt(req.user, {});
  const messages = lean
    ? [{ role: 'user', content: sanitizeMessage(message.trim()) }]
    : [{ role: 'system', content: systemPrompt }, { role: 'user', content: sanitizeMessage(message.trim()) }];

  try {
    const upstream = await routerFetch('/chat/completions', {
      method: 'POST',
      body: JSON.stringify({
        model: effectiveModel,
        messages,
        stream: true,
        max_tokens: getSettingInt('max_reply_tokens', 1024)
      }),
      signal: AbortSignal.timeout(getTimeoutMs())
    });

    if (!upstream.ok) {
      const errText = await upstream.text();
      res.write(`data: ${JSON.stringify({ error: '9Router ' + upstream.status + ': ' + errText.slice(0, 200) })}\n\n`);
      res.end();
      return;
    }

    const reader = upstream.body.getReader();
    const decoder = new TextDecoder();
    let buffer = '';
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
          const delta = chunk.choices?.[0]?.delta;
          if (delta && delta.content) {
            aiTempReply = (aiTempReply || '') + delta.content;
            if (/Cannot read\s+"/.test(aiTempReply) || /does not support image input/.test(aiTempReply)) {
              if (!aiTempReply._replaced) {
                aiTempReply._replaced = true;
                res.write(`data: ${JSON.stringify({ content: 'Your message looked like it contained an image. This model supports text only.' })}\n\n`);
              }
              continue;
            }
            res.write(`data: ${JSON.stringify({ content: delta.content })}\n\n`);
          }
          if (chunk.usage) tokens = (chunk.usage.total_tokens || tokens);
        } catch (_) {}
      }
    }
    countRequest(req.user, tokens);
    res.write('data: [DONE]\n\n');
    res.end();
  } catch (e) {
    const friendly = e.code === 'ERR_ROUTER_NOT_CONFIGURED' ? e.code
      : (e.name === 'TimeoutError' || /timed? ?out/i.test(String(e.message || '')))
        ? 'ERR_TIMEOUT'
        : ('9Router/failed: ' + (e.message || 'unknown error')).slice(0, 300);
    res.write(`data: ${JSON.stringify({ error: friendly })}\n\n`);
    res.end();
  }
});

// ---------- admin ----------
app.get('/api/admin/users', requireAuth, requireAdmin, (req, res) => {
  res.json(db.prepare(`
    SELECT u.id, u.username, u.role, u.daily_quota, u.model_override, u.avatar, u.active,
      COALESCE((SELECT request_count FROM usage WHERE user_id = u.id AND date = ?), 0) AS used_today
    FROM users u ORDER BY u.id`).all(today()));
});

app.get('/api/admin/settings', requireAuth, requireAdmin, (req, res) => {
  res.json({
    default_model: getGlobalModel(),
    history_token_budget: getSettingInt('history_token_budget', 1600),
    max_reply_tokens: getSettingInt('max_reply_tokens', 1024),
    memory_enabled: getSetting('memory_enabled') !== '0',
    timeout_ms: getTimeoutMs() / 1000,
    guest_enabled: guestEnabled(),
    guest_max_chats: guestPolicy().max_chats,
    guest_max_minutes: guestPolicy().max_minutes,
    today_usage: db.prepare('SELECT COALESCE(SUM(tokens_used),0) t, COALESCE(SUM(prompt_tokens),0) p, COALESCE(SUM(completion_tokens),0) c FROM usage WHERE date = ?').get(today())
  });
});

app.put('/api/admin/settings', requireAuth, requireAdmin, (req, res) => {
  const { default_model, history_token_budget, max_reply_tokens, memory_enabled, timeout_ms, guest_enabled, guest_max_chats, guest_max_minutes } = req.body || {};
  if (default_model !== undefined) {
    if (!default_model || typeof default_model !== 'string') return res.status(400).json({ error: 'ERR_FIELDS_REQUIRED' });
    setSetting('default_model', default_model);
  }
  if (history_token_budget !== undefined) {
    const n = Number(history_token_budget);
    if (!Number.isFinite(n) || n < 200 || n > 32000) return res.status(400).json({ error: 'ERR_BAD_BUDGET' });
    setSetting('history_token_budget', String(Math.round(n)));
  }
  if (max_reply_tokens !== undefined) {
    const n = Number(max_reply_tokens);
    if (!Number.isFinite(n) || n < 64 || n > 8192) return res.status(400).json({ error: 'ERR_BAD_MAXTOK' });
    setSetting('max_reply_tokens', String(Math.round(n)));
  }
  if (memory_enabled !== undefined) setSetting('memory_enabled', memory_enabled ? '1' : '0');
  if (guest_enabled !== undefined) setSetting('guest_enabled', guest_enabled ? '1' : '0');
  if (guest_max_chats !== undefined) {
    const n = Number(guest_max_chats);
    if (!Number.isFinite(n) || n < GUEST_MIN || n > GUEST_MAX) return res.status(400).json({ error: 'ERR_BAD_GUEST_CHATS' });
    setSetting('guest_max_chats', String(Math.round(n)));
  }
  if (guest_max_minutes !== undefined) {
    const n = Number(guest_max_minutes);
    if (!Number.isFinite(n) || n < 1 || n > 720) return res.status(400).json({ error: 'ERR_BAD_GUEST_MINUTES' });
    setSetting('guest_max_minutes', String(Math.round(n)));
  }
  if (timeout_ms !== undefined) {
    const n = Number(timeout_ms);
    if (!Number.isFinite(n) || n < 30 || n > 600) return res.status(400).json({ error: 'ERR_BAD_TIMEOUT' });
    setSetting('timeout_ms', String(Math.round(n)));
  }
  res.json({ ok: true, default_model: getGlobalModel(), history_token_budget: getSettingInt('history_token_budget', 1600), max_reply_tokens: getSettingInt('max_reply_tokens', 1024), memory_enabled: getSetting('memory_enabled') !== '0', timeout_ms: getTimeoutMs() / 1000, guest_enabled: guestEnabled(), guest_max_chats: guestPolicy().max_chats, guest_max_minutes: guestPolicy().max_minutes });
});

// ---------- admin: model gateway (Open WebUI style: base URL + API key) ----------
app.get('/api/admin/router-config', requireAuth, requireAdmin, (req, res) => {
  res.json({
    base_url: getRouterBase() || '',
    api_key_masked: maskKey(getRouterKey()),
    configured: routerConfigured(),
    source: getSetting('router_base') ? 'database' : (ROUTER_BASE_FALLBACK ? 'env' : 'none')
  });
});

app.put('/api/admin/router-config', requireAuth, requireAdmin, async (req, res) => {
  const { base_url, api_key } = req.body || {};
  if (base_url !== undefined) {
    const bad = await validateRouterBase(base_url);
    if (bad) return res.status(400).json({ error: bad });
    setSetting('router_base', String(base_url).trim().replace(/\/+$/, ''));
  }
  if (api_key !== undefined) {
    if (api_key === null) {
      db.prepare('DELETE FROM settings WHERE key = ?').run('router_key');
    } else {
      if (typeof api_key !== 'string') return res.status(400).json({ error: 'ERR_BAD_BODY' });
      const k = api_key.trim();
      if (k.length > 400) return res.status(400).json({ error: 'ERR_TOO_BIG' });
      setSetting('router_key', k);
    }
  }
  res.json({ ok: true, base_url: getRouterBase() || '', api_key_masked: maskKey(getRouterKey()), configured: routerConfigured() });
});

// live connectivity probe: GET {base}/models with saved or posted (pre-save) credentials
app.post('/api/admin/router-test', requireAuth, requireAdmin, async (req, res) => {
  const { base_url, api_key } = req.body || {};
  let base = getRouterBase(), key = getRouterKey();
  if (base_url !== undefined && String(base_url).trim() !== '') {
    const bad = await validateRouterBase(base_url);
    if (bad) return res.status(400).json({ error: bad });
    base = String(base_url).trim().replace(/\/+$/, '');
  }
  if (api_key !== undefined && String(api_key).trim() !== '') key = String(api_key).trim();
  if (!base || !key) return res.status(400).json({ error: 'ERR_ROUTER_NOT_CONFIGURED' });
  const t0 = Date.now();
  try {
    const r = await fetch(base + '/models', {
      headers: { 'Authorization': '***' + key },
      signal: AbortSignal.timeout(15000)
    });
    if (!r.ok) return res.json({ ok: false, status: r.status, latency_ms: Date.now() - t0, models: 0 });
    const data = await r.json().catch(() => null);
    const n = Array.isArray(data && data.data) ? data.data.length : 0;
    res.json({ ok: true, status: r.status, latency_ms: Date.now() - t0, models: n });
  } catch (e) {
    res.status(502).json({ error: (e && e.name === 'TimeoutError') ? 'ERR_TIMEOUT' : 'ERR_ROUTER_DOWN' });
  }
});

app.put('/api/admin/wallpaper', requireAuth, requireAdmin, (req, res) => {
  const { wallpaper } = req.body || {};
  if (wallpaper !== null && !isValidWallpaper(wallpaper)) return res.status(400).json({ error: 'ERR_WALLPAPER_FORMAT' });
  setSetting('wallpaper', wallpaper);
  res.json({ ok: true });
});

app.post('/api/admin/users', requireAuth, requireAdmin, (req, res) => {
  const { username, password, role, daily_quota } = req.body || {};
  if (!username || !password) return res.status(400).json({ error: 'ERR_FIELDS_REQUIRED' });
  try {
    db.prepare('INSERT INTO users (username, password_hash, role, daily_quota) VALUES (?, ?, ?, ?)').run(username, hashPassword(password), role === 'admin' ? 'admin' : 'user', daily_quota || DAILY_QUOTA_DEFAULT);
    res.json({ ok: true });
  } catch (e) {
    res.status(400).json({ error: 'ERR_USERNAME_TAKEN' });
  }
});

app.delete('/api/admin/users/:id', requireAuth, requireAdmin, (req, res) => {
  if (Number(req.params.id) === req.user.id) return res.status(400).json({ error: 'ERR_SELF_DELETE' });
  db.prepare('DELETE FROM sessions WHERE user_id = ?').run(req.params.id);
  db.prepare('DELETE FROM users WHERE id = ?').run(req.params.id);
  res.json({ ok: true });
});

// admin: change/reset the AI assistant avatar (global, applies to everyone)
app.post('/api/admin/assistant-avatar', requireAuth, requireAdmin, (req, res) => {
  const { avatar } = req.body || {};
  if (avatar !== null) {
    if (typeof avatar !== 'string' || !WALLPAPER_IMG_RE.test(avatar)) return res.status(400).json({ error: 'ERR_AVATAR_FORMAT' });
    if (avatar.length > 400000) return res.status(400).json({ error: 'ERR_TOO_BIG' });
  }
  setSetting('assistant_avatar', avatar);
  res.json({ ok: true, avatar });
});

// admin: change/reset avatar of ANY user (including self)
app.post('/api/admin/avatar', requireAuth, requireAdmin, (req, res) => {
  const { userId, avatar } = req.body || {};
  if (!userId) return res.status(400).json({ error: 'ERR_FIELDS_REQUIRED' });
  const target = db.prepare('SELECT id FROM users WHERE id = ?').get(userId);
  if (!target) return res.status(404).json({ error: 'ERR_NOT_FOUND' });
  if (avatar !== null) {
    if (typeof avatar !== 'string' || !WALLPAPER_IMG_RE.test(avatar)) return res.status(400).json({ error: 'ERR_AVATAR_FORMAT' });
    if (avatar.length > 400000) return res.status(400).json({ error: 'ERR_TOO_BIG' });
  }
  db.prepare('UPDATE users SET avatar = ? WHERE id = ?').run(avatar, userId);
  if (Number(userId) === req.user.id) req.user.avatar = avatar || null;
  res.json({ ok: true, avatar });
});

// admin: reset password / activate user
app.put('/api/admin/users/:id/password', requireAuth, requireAdmin, (req, res) => {
  const { password } = req.body || {};
  if (!password || String(password).length < 4) return res.status(400).json({ error: 'ERR_PW_SHORT' });
  if (!db.prepare('SELECT id FROM users WHERE id = ?').get(req.params.id)) return res.status(404).json({ error: 'ERR_NOT_FOUND' });
  db.prepare('UPDATE users SET password_hash = ? WHERE id = ?').run(hashPassword(password), req.params.id);
  db.prepare('DELETE FROM sessions WHERE user_id = ?').run(req.params.id);
  res.json({ ok: true });
});

app.put('/api/admin/users/:id/active', requireAuth, requireAdmin, (req, res) => {
  const { active } = req.body || {};
  if (typeof active !== 'boolean') return res.status(400).json({ error: 'ERR_FIELDS_REQUIRED' });
  // never allow deactivating yourself (or any admin) — keep at least one active admin
  if (Number(req.params.id) === req.user.id) return res.status(400).json({ error: 'ERR_SELF_DEACTIVATE' });
  if (!db.prepare('SELECT id FROM users WHERE id = ?').get(req.params.id)) return res.status(404).json({ error: 'ERR_NOT_FOUND' });
  db.prepare('UPDATE users SET active = ? WHERE id = ?').run(active ? 1 : 0, req.params.id);
  if (!active) db.prepare('DELETE FROM sessions WHERE user_id = ?').run(req.params.id);
  res.json({ ok: true, active });
});

app.put('/api/admin/users/:id/reset-quota', requireAuth, requireAdmin, (req, res) => {
  if (!db.prepare('SELECT id FROM users WHERE id = ?').get(req.params.id)) return res.status(404).json({ error: 'ERR_NOT_FOUND' });
  db.prepare('DELETE FROM usage WHERE user_id = ? AND date = ?').run(req.params.id, today());
  res.json({ ok: true });
});

// set a user's daily quota
app.put('/api/admin/users/:id/quota', requireAuth, requireAdmin, (req, res) => {
  const n = Math.floor(Number((req.body || {}).daily_quota));
  if (!Number.isFinite(n) || n < 1 || n > 999999) return res.status(400).json({ error: 'ERR_FIELDS_REQUIRED' });
  if (!db.prepare('SELECT id FROM users WHERE id = ?').get(req.params.id)) return res.status(404).json({ error: 'ERR_NOT_FOUND' });
  db.prepare('UPDATE users SET daily_quota = ? WHERE id = ?').run(n, req.params.id);
  res.json({ ok: true, daily_quota: n });
});

// reset ALL usage (every user, every date) — admin only
app.put('/api/admin/reset-usage', requireAuth, requireAdmin, (req, res) => {
  db.prepare('DELETE FROM usage').run();
  res.json({ ok: true });
});

app.put('/api/admin/users/:id/model', requireAuth, requireAdmin, (req, res) => {
  const { model } = req.body || {};
  if (model !== null && typeof model !== 'string') return res.status(400).json({ error: 'ERR_FIELDS_REQUIRED' });
  if (model === null || model === '') {
    db.prepare('UPDATE users SET model_override = NULL WHERE id = ?').run(req.params.id);
    return res.json({ ok: true, model_override: null });
  }
  db.prepare('UPDATE users SET model_override = ? WHERE id = ?').run(model, req.params.id);
  res.json({ ok: true, model_override: model });
});

// ---------- health (no auth, for uptime monitoring) ----------
app.get('/api/guest-config', (req, res) => {
  res.json({ enabled: guestEnabled() });
});

app.get('/api/health', (req, res) => {
  let db_ok = true;
  try { db.prepare('SELECT 1').get(); } catch (_) { db_ok = false; }
  res.status(db_ok ? 200 : 503).json({ ok: db_ok, uptime_s: Math.round(process.uptime()) });
});

// ---------- health end ----------

// JSON parse error handler
app.use((err, req, res, next) => {
  if (err && err.type === 'entity.parse.failed') return res.status(400).json({ error: 'ERR_BAD_BODY' });
  if (err) {
    console.error(err);
    return res.status(500).json({ error: 'Server error: ' + err.message });
  }
  next();
});

app.listen(PORT, () => {
  console.log(`dash_ai_me running on http://localhost:${PORT}`);
});

// graceful shutdown: close DB cleanly on stop/restart
function shutdown() {
  try { db.close(); } catch (_) {}
  process.exit(0);
}
process.on('SIGTERM', shutdown);
process.on('SIGINT', shutdown);

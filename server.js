// Teman Tanyamu: lightweight AI chat web app (Express + SQLite + SSE relay to 9Router)
const express = require('express');
const Database = require('better-sqlite3');
const crypto = require('crypto');
const path = require('path');
const fs = require('fs');
const dns = require('node:dns/promises');

// #9: the single source of truth for the app version (git tags point here too)
const APP_VERSION = '1.0-beta.41';

// Model gateway config lives in the settings table (editable in Admin Dashboard).
// Env vars ROUTER_BASE / ROUTER_KEY act as boot fallback only (used when DB is empty).
const ROUTER_BASE_FALLBACK = process.env.ROUTER_BASE || '';
const ROUTER_KEY_FALLBACK = process.env.ROUTER_KEY || '';
const PORT = process.env.PORT || 3000;
const SESSION_DAYS = 7;
const DAILY_QUOTA_DEFAULT = 50;

const db = new Database(path.join(__dirname, 'chat.db'));
const { log, info: logInfo } = require('./lib/logger');
const { makeLimiter } = require('./lib/ratelimit');
const { shareHTML, notFoundHTML, acceptLang } = require('./lib/share');
const startedAt = Date.now();
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
try { db.exec('ALTER TABLE messages ADD COLUMN meta TEXT'); } catch (_) {}
// per-request mode ledger (normal/eco/temp/guest) incl. model — usage table alone can't split modes
db.exec(`CREATE TABLE IF NOT EXISTS usage_events (
  date TEXT NOT NULL, hour INTEGER NOT NULL, mode TEXT NOT NULL, model TEXT NOT NULL,
  reqs INTEGER DEFAULT 0, tok INTEGER DEFAULT 0,
  PRIMARY KEY (date, hour, mode, model)
);`)
try {
  if (db.prepare('SELECT COUNT(*) c FROM usage_events').get().c === 0) {
    db.prepare(`INSERT OR IGNORE INTO usage_events
      SELECT substr(m.created_at,1,10), CAST(strftime('%H', m.created_at, 'localtime') AS INTEGER),
             CASE WHEN c.lean = 1 THEN 'eco' ELSE 'normal' END, c.model, COUNT(*), COALESCE(SUM(m.tokens),0)
      FROM messages m JOIN chats c ON c.id = m.chat_id
      WHERE m.role='assistant' AND c.user_id > 0 GROUP BY 1,2,3,4`).run();
  }
} catch (_) {}
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
// chat experience: pin / archive / tag
try { db.exec('ALTER TABLE chats ADD COLUMN pinned INTEGER NOT NULL DEFAULT 0'); } catch (_) {}
try { db.exec('ALTER TABLE chats ADD COLUMN archived INTEGER NOT NULL DEFAULT 0'); } catch (_) {}
try { db.exec('ALTER TABLE chats ADD COLUMN tag TEXT'); } catch (_) {}
// CSRF token column migrations
try { db.exec('ALTER TABLE sessions ADD COLUMN csrf_token TEXT'); } catch (_) {}
try { db.exec('ALTER TABLE guest_sessions ADD COLUMN csrf_token TEXT'); } catch (_) {}

// seed admin
if (db.prepare('SELECT COUNT(*) c FROM users').get().c === 0) {
  const adminPass = process.env.ADMIN_PASSWORD || 'admin123';
  const hash = crypto.scryptSync(adminPass, 'salt-dash-ai-me', 64).toString('hex');
  db.prepare("INSERT INTO users (username, password_hash, role, daily_quota) VALUES (?, ?, 'admin', 999999)").run('admin', hash);
  log('warn', 'seed_admin', { note: 'Admin awal dibuat dengan password default — ganti segera' });
}

const app = express();
app.set('trust proxy', true); // behind Cloudflare Tunnel / reverse proxy

// --- Dual-Mode Security Suite (CORS & CSRF Guard) ---
const ALLOWED_ORIGINS = [
  'http://localhost:3000',
  'http://127.0.0.1:3000',
  'https://tanya.frmnspace.my.id'
];

app.use((req, res, next) => {
  const origin = req.headers.origin;
  if (!origin || ALLOWED_ORIGINS.includes(origin)) {
    res.setHeader('Access-Control-Allow-Origin', origin || '*');
    res.setHeader('Access-Control-Allow-Credentials', 'true');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type, X-CSRF-Token, Authorization');
    res.setHeader('Access-Control-Allow-Methods', 'GET, POST, PUT, PATCH, DELETE, OPTIONS');
  }
  if (req.method === 'OPTIONS') {
    return res.sendStatus(204);
  }
  next();
});

// Middleware verifikasi CSRF Token untuk request mutasi data (POST, PUT, PATCH, DELETE)
function csrfGuard(req, res, next) {
  // Abaikan request GET, HEAD, OPTIONS
  if (['GET', 'HEAD', 'OPTIONS'].includes(req.method)) return next();
  if (req.path === '/api/login' || req.path === '/api/guest') return next(); // Skip rute pembentukan session awal

  let dbToken = null;
  const sessionCookie = (req.headers.cookie || '').match(/session=([a-f0-9]+)/);
  if (sessionCookie) {
    const row = db.prepare('SELECT csrf_token FROM sessions WHERE token = ?').get(sessionCookie[1]);
    dbToken = row ? row.csrf_token : null;
  } else {
    const gtokenCookie = (req.headers.cookie || '').match(/gtoken=([a-f0-9]+)/);
    if (gtokenCookie) {
      const row = db.prepare('SELECT csrf_token FROM guest_sessions WHERE token = ?').get(gtokenCookie[1]);
      dbToken = row ? row.csrf_token : null;
    }
  }

  const clientToken = req.headers['x-csrf-token'];
  if (dbToken && clientToken === dbToken) {
    return next();
  }

  // Fallback: Jika diakses murni dari localhost tanpa domain luar, kita bisa toleransi agar testing tidak terhambat
  const isLocalHost = req.hostname === 'localhost' || req.hostname === '127.0.0.1';
  if (isLocalHost && !clientToken) {
    return next(); // Toleransi dev mode murni localhost tanpa client token
  }

  log('warn', 'csrf_blocked', { path: req.path, m: req.method, ip: req.ip });
  return res.status(403).json({ error: 'ERR_CSRF_INVALID' });
}

app.use(express.json({ limit: '2mb' }));
app.use(csrfGuard);
// #10: structured request log (API calls only, static assets skipped)
app.use((req, res, next) => {
  if (req.path.startsWith('/api/')) {
    const t0 = Date.now();
    res.on('finish', () => {
      if (req.path === '/api/health') return; // noise
      log('info', 'request', { m: req.method, p: req.path, s: res.statusCode, ms: Date.now() - t0 });
    });
  }
  next();
});
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
// ---------- #5: generation throttle — configurable in Admin (default 30 calls / 90 s); guest: per IP ----------
function genPolicy() {
  let max = getSettingInt('gen_limit_max', 30);
  if (!(max >= 5 && max <= 1000)) max = 30;
  let win = getSettingInt('gen_limit_window_sec', 90);
  if (!(win >= 10 && win <= 600)) win = 90;
  return { max, windowMs: win * 1000 };
}
const chatLimiter = makeLimiter(genPolicy());
function startSse(req, res) {
  res.setHeader('Content-Type', 'text/event-stream');
  res.setHeader('Cache-Control', 'no-cache');
  res.setHeader('Connection', 'keep-alive');
  res.flushHeaders();
  // keepalive: proxies/browsers drop idle connections; comment lines are ignored by parsers
  const hb = setInterval(() => { try { res.write(': hb\n\n'); } catch (_) {} }, 10000);
  const stop = () => clearInterval(hb);
  res.on('finish', stop); res.on('close', stop);
  return stop;
}

function requireGenLimit(req, res, next) {
  const key = req.guest ? ('g:' + get_client_ip(req)) : ('u:' + req.user.id);
  if (!chatLimiter.allow(key)) {
    audit(req.user, 'rate_limit_hit', null, req.path);
    return res.status(429).json({ error: 'ERR_GEN_LIMITED', retryAfterSec: Math.ceil(chatLimiter.windowMs / 1000) });
  }
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

function countRequest(user, tokens, promptTokens, completionTokens, mode, model) {
  if (user.guest) bumpGuestMsg(user.guest_id);
  bumpUsage(user, tokens, promptTokens, completionTokens);
  bumpEvent(mode || (user.guest ? 'guest' : 'normal'), model, tokens);
}
// one row per (day, local hour, mode, model) — cheap aggregate, powers per-mode & per-model stats for ALL modes
function bumpEvent(mode, model, tokens) {
  try {
    db.prepare(`INSERT INTO usage_events (date, hour, mode, model, reqs, tok) VALUES (?, ?, ?, ?, 1, ?)
      ON CONFLICT(date, hour, mode, model) DO UPDATE SET reqs = reqs + 1, tok = tok + excluded.tok`)
      .run(today(), new Date().getHours(), mode, String(model || 'unknown').slice(0, 120), tokens || 0);
  } catch (_) { /* stats must never break a reply */ }
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

// stream-friendly watchdog: abort only after `ms` WITHOUT bytes (not after ms of total
// streaming — long replies were being killed mid-flight by the old whole-request timeout)
function idleSignal(ms) {
  const ctrl = new AbortController();
  let timer = setTimeout(() => ctrl.abort(), ms);
  ctrl.kick = () => { clearTimeout(timer); timer = setTimeout(() => ctrl.abort(), ms); };
  ctrl.done = () => clearTimeout(timer);
  return ctrl;
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

// fire-and-forget background LLM task: never breaks the main reply.
// #perf: runs after a short grace period AND one-at-a-time, so hidden
// title/summary/memory calls never steal gateway bandwidth from the
// user's next visible message.
let bgChain = Promise.resolve();
function bgTask(label, fn) {
  bgChain = bgChain
    .then(() => new Promise((r) => setTimeout(r, 2500)))
    .then(fn)
    .catch((e) => log('warn', 'bg_task_failed', { task: label, msg: String(e.message || e) }));
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

const TITLE_SYSTEM = 'Beri judul sangat pendek (2-5 kata) untuk percakapan berikut, dalam bahasa percakapan. Hanya keluaran judulnya, tanpa tanda kutip, tanpa titik di akhir.';
// smart chat title: background call once; only replaces the provisional auto-title
function scheduleTitle(chat, question, answer, provisional) {
  const task = async () => {
    const out = await nonStreamChat(chat.model, [
      { role: 'system', content: TITLE_SYSTEM },
      { role: 'user', content: 'USER: ' + question.slice(0, 500) + '\nAI: ' + answer.slice(0, 500) }
    ], 24, 20000);
    const title = String(out || '').replace(/["'“”‘’`.*]/g, '').replace(/\s+/g, ' ').trim().slice(0, 60);
    if (!title) return;
    // only overwrite the provisional title (user may have renamed meanwhile)
    db.prepare('UPDATE chats SET title = ? WHERE id = ? AND title = ?').run(title, chat.id, provisional);
  };
  bgTask('title', task);
}

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
    audit(null, 'login_fail', String(username).slice(0, 40), 'ip=' + ip);
    const st = getLoginState(ip);
    return res.status(401).json({ error: 'ERR_LOGIN', remainingAttempts: st.remaining });
  }
  if (!user.active) { audit(null, 'login_inactive', String(username).slice(0, 40), 'ip=' + ip); return res.status(403).json({ error: 'ERR_INACTIVE' }); }
  loginAttempts.delete(ip); // successful login clears failures
  audit(user, 'login', null, 'ip=' + ip);
  maybeUpgradeHash(user.id, password, user.password_hash);
  db.prepare('DELETE FROM sessions WHERE expires_at < ?').run(Date.now()); // purge expired sessions
  const token = crypto.randomBytes(32).toString('hex');
  const csrfToken = crypto.randomBytes(16).toString('hex');
  const expires = Date.now() + SESSION_DAYS * 86400e3;
  db.prepare('INSERT INTO sessions (token, user_id, expires_at, csrf_token) VALUES (?, ?, ?, ?)').run(token, user.id, expires, csrfToken);
  const isHttps = req.headers['x-forwarded-proto'] === 'https' || req.secure;
  const cookieFlags = `session=${token}; HttpOnly; Path=/; Max-Age=${SESSION_DAYS * 86400}; SameSite=Lax${isHttps ? '; Secure' : ''}`;
  res.setHeader('Set-Cookie', cookieFlags);
  res.json({ ok: true, role: user.role, username: user.username, csrf_token: csrfToken });
});

// Guest sign-in: create/reuse guest session. No credentials; rate-limited by same IP guard as login.
const guestLimiter = makeLimiter({ windowMs: 60000, max: 12 });
app.post('/api/guest', (req, res) => {
  if (!guestEnabled()) return res.status(403).json({ error: 'ERR_GUEST_DISABLED' });
  const ip = get_client_ip(req);
  const st = getLoginState(ip);
  if (st.blocked) return res.status(429).json({ error: 'ERR_RATE_LIMITED', retryAfterSec: st.retryAfterSec });
  if (!guestLimiter.allow(ip)) return res.status(429).json({ error: 'ERR_RATE_LIMITED', retryAfterSec: 60 });
  purgeOldGuests();
  const token = readCookie(req, 'gtoken');
  let row = token ? guestRowByToken(token) : null;
  const now = Date.now();
  if (!(row && row.expires_at > now)) {
    row = null;
    const gid = db.prepare('SELECT COALESCE(MAX(guest_id), 0) m FROM guest_sessions').get().m + 1;
    const t2 = crypto.randomBytes(32).toString('hex');
    const csrfToken = crypto.randomBytes(16).toString('hex');
    const isHttps = req.headers['x-forwarded-proto'] === 'https' || req.secure;
    const secure = isHttps ? '; Secure' : '';
    db.prepare('INSERT INTO guest_sessions (token, guest_id, msgs_used, started_at, expires_at, csrf_token) VALUES (?,?,?,?,?,?)')
      .run(t2, gid, 0, now, now + 86400e3, csrfToken);
    res.setHeader('Set-Cookie', `gtoken=${t2}; HttpOnly; Path=/; Max-Age=86400; SameSite=Lax${secure}`);
    row = { guest_id: gid, msgs_used: 0, started_at: now, expires_at: now + 86400e3, csrf_token: csrfToken };
  }
  const pol = guestPolicy();
  const elapsed = Math.floor((Date.now() - row.started_at) / 1000);
  
  // Baca csrf_token dari database jika session-nya re-used
  let csrfToken = row.csrf_token;
  if (!csrfToken && t2) {
    const sRow = db.prepare('SELECT csrf_token FROM guest_sessions WHERE token = ?').get(t2);
    csrfToken = sRow ? sRow.csrf_token : null;
  }

  res.json({
    ok: true, guest: true,
    msgs_left: Math.max(0, pol.max_chats - row.msgs_used),
    seconds_left: Math.max(0, pol.max_minutes * 60 - elapsed),
    max_chats: pol.max_chats,
    csrf_token: csrfToken
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
  let csrfToken = null;
  if (req.guest) {
    const gtoken = readCookie(req, 'gtoken');
    const sRow = db.prepare('SELECT csrf_token FROM guest_sessions WHERE token = ?').get(gtoken);
    csrfToken = sRow ? sRow.csrf_token : null;
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
      assistant_avatar: getSetting('assistant_avatar') || null,
      csrf_token: csrfToken
    });
  }
  const sessionCookie = (req.headers.cookie || '').match(/session=([a-f0-9]+)/);
  if (sessionCookie) {
    const sRow = db.prepare('SELECT csrf_token FROM sessions WHERE token = ?').get(sessionCookie[1]);
    csrfToken = sRow ? sRow.csrf_token : null;
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
    assistant_avatar: getSetting('assistant_avatar') || null,
    history_token_budget: getSettingInt('history_token_budget', 1600),
    csrf_token: csrfToken
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
  const q = req.query.q ? String(req.query.q).trim() : '';
  if (q) {
    // Pencarian Teks Global: Ambil chat yang cocok judulnya ATAU isi pesonanya mengandung keyword
    // Kita return juga snippet pencocokan pesan pertama yang ketemu agar keren di UI!
    const query = `
      SELECT DISTINCT c.id, c.title, c.model, c.updated_at, c.lean, c.pinned, c.archived, c.tag,
        (c.summary IS NOT NULL AND c.summary != '') AS has_summary,
        (EXISTS (SELECT 1 FROM shared_chats sc WHERE sc.chat_id = c.id)) AS shared,
        (SELECT m.content FROM messages m WHERE m.chat_id = c.id AND m.content LIKE ? LIMIT 1) AS match_snippet
      FROM chats c
      LEFT JOIN messages m ON m.chat_id = c.id
      WHERE c.user_id = ? AND (c.title LIKE ? OR m.content LIKE ?)
      ORDER BY c.pinned DESC, c.updated_at DESC
    `;
    const wildcard = '%' + q + '%';
    return res.json(db.prepare(query).all(wildcard, req.user.id, wildcard, wildcard));
  }
  res.json(db.prepare('SELECT id, title, model, updated_at, lean, pinned, archived, tag, (summary IS NOT NULL AND summary != \'\') AS has_summary, (EXISTS (SELECT 1 FROM shared_chats sc WHERE sc.chat_id = chats.id)) AS shared FROM chats WHERE user_id = ? ORDER BY pinned DESC, updated_at DESC').all(req.user.id));
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
  res.json({ ...chat, messages: db.prepare('SELECT id, role, content, created_at, meta FROM messages WHERE chat_id = ? ORDER BY id').all(chat.id) });
});

app.delete('/api/chats/:id', requireAuth, (req, res) => {
  const chat = db.prepare('SELECT id FROM chats WHERE id = ? AND user_id = ?').get(req.params.id, req.user.id);
  if (!chat) return res.status(404).json({ error: 'ERR_NOT_FOUND' });
  db.prepare('DELETE FROM messages WHERE chat_id = ?').run(chat.id);
  db.prepare('DELETE FROM shared_chats WHERE chat_id = ?').run(chat.id);
  db.prepare('DELETE FROM chats WHERE id = ?').run(chat.id);
  res.json({ ok: true });
});

app.patch('/api/chats/:id', requireAuth, (req, res) => {
  const { title, model, pinned, archived, tag } = req.body || {};
  const chat = db.prepare('SELECT id FROM chats WHERE id = ? AND user_id = ?').get(req.params.id, req.user.id);
  if (!chat) return res.status(404).json({ error: 'ERR_NOT_FOUND' });
  if (title) db.prepare("UPDATE chats SET title = ?, updated_at = datetime('now') WHERE id = ?").run(title.slice(0, 120), chat.id);
  if (model) {
    if (req.user.role !== 'admin') return res.status(403).json({ error: 'ERR_ADMIN_ONLY' });
    db.prepare("UPDATE chats SET model = ?, updated_at = datetime('now') WHERE id = ?").run(model, chat.id);
  }
  if (pinned !== undefined) db.prepare('UPDATE chats SET pinned = ? WHERE id = ?').run(pinned ? 1 : 0, chat.id);
  if (archived !== undefined) db.prepare("UPDATE chats SET archived = ?, updated_at = datetime('now') WHERE id = ?").run(archived ? 1 : 0, chat.id);
  if (tag !== undefined) {
    const clean = tag === null || tag === '' ? null : String(tag).replace(/\s+/g, ' ').trim().slice(0, 32);
    db.prepare('UPDATE chats SET tag = ? WHERE id = ?').run(clean, chat.id);
  }
  res.json({ ok: true });
});

// fork a chat: copy all messages into a new chat branch
app.post('/api/chats/:id/fork', requireAuth, (req, res) => {
  const chat = db.prepare('SELECT * FROM chats WHERE id = ? AND user_id = ?').get(req.params.id, req.user.id);
  if (!chat) return res.status(404).json({ error: 'ERR_NOT_FOUND' });
  const msgs = db.prepare('SELECT role, content, tokens FROM messages WHERE chat_id = ? ORDER BY id').all(chat.id);
  const t = db.transaction(() => {
    const info = db.prepare('INSERT INTO chats (user_id, title, model, lean) VALUES (?, ?, ?, ?)').run(
      req.user.id, (chat.title + ' (fork)').slice(0, 120), chat.model, chat.lean);
    const ins = db.prepare('INSERT INTO messages (chat_id, role, content, tokens) VALUES (?, ?, ?, ?)');
    for (const m of msgs) ins.run(info.lastInsertRowid, m.role, m.content, m.tokens);
    return info.lastInsertRowid;
  });
  const newId = t();
  res.json({ id: newId, title: (chat.title + ' (fork)').slice(0, 120) });
});

// truncate a chat: delete the given message AND everything after it
// (client then re-sends for edit/regenerate flows)
app.delete('/api/chats/:id/messages/:msgId', requireAuth, (req, res) => {
  const chat = db.prepare('SELECT id FROM chats WHERE id = ? AND user_id = ?').get(req.params.id, req.user.id);
  if (!chat) return res.status(404).json({ error: 'ERR_NOT_FOUND' });
  const msg = db.prepare('SELECT id FROM messages WHERE id = ? AND chat_id = ?').get(req.params.msgId, chat.id);
  if (!msg) return res.status(404).json({ error: 'ERR_NOT_FOUND' });
  db.prepare('DELETE FROM messages WHERE chat_id = ? AND id >= ?').run(chat.id, msg.id);
  db.prepare("UPDATE chats SET updated_at = datetime('now'), summary = NULL, summary_upto_id = 0 WHERE id = ?").run(chat.id);
  res.json({ ok: true });
});

// ---------- models ----------
// model list cache: gateway /models is slow (2-6 s) and boot-blocking; cache 60 s, serve stale on failure
let modelsCache = { at: 0, base: '', key: '', ids: null, meta: null };
function invalidateModelsCache() { modelsCache.ids = null; modelsCache.meta = null; }
// warm the model+context map once per boot so chat streams resolve window sizes without waiting on first /api/models
async function warmModelsCache() {
  try {
    if (!routerConfigured()) return;
    const r = await routerFetch('/models', { signal: AbortSignal.timeout(20000) });
    const data = await r.json();
    if (!Array.isArray(data.data)) return;
    const ids = data.data.map((m) => m.id);
    const meta = {};
    for (const m of data.data) {
      const c = m.context_length || (m.capabilities && m.capabilities.contextWindow) || 0;
      const o = m.max_completion_tokens || (m.capabilities && m.capabilities.maxOutput) || 0;
      if (c || o) meta[m.id] = { ctx: c || 0, out: o || 0 };
    }
    modelsCache = { at: Date.now(), base: getRouterBase(), key: getRouterKey(), ids, meta };
  } catch (_) { /* cold start without gateway is fine: chips fall back to the admin setting */ }
}
// gateway /models carries per-model context_length & max_completion_tokens for most providers —
// map of id -> {ctx, out}. Admin's context_window setting is only the FALLBACK for models missing here.
function ctxForModel(id) {
  const m = modelsCache.meta && modelsCache.meta[id];
  return { ctx: (m && m.ctx) || 0, out: (m && m.out) || 0 };
}
app.get('/api/models', requireAuth, async (req, res) => {
  if (!routerConfigured()) return res.status(503).json({ error: 'ERR_ROUTER_NOT_CONFIGURED' });
  const base = getRouterBase(), key = getRouterKey();
  if (modelsCache.ids && modelsCache.base === base && modelsCache.key === key && Date.now() - modelsCache.at < 60000) {
    return res.json(modelsCache.ids);
  }
  try {
    const r = await routerFetch('/models', { signal: AbortSignal.timeout(15000) });
    const data = await r.json();
    const ids = data.data.map(m => m.id);
    const meta = {};
    for (const m of data.data) {
      const c = m.context_length || (m.capabilities && m.capabilities.contextWindow) || 0;
      const o = m.max_completion_tokens || (m.capabilities && m.capabilities.maxOutput) || 0;
      if (c || o) meta[m.id] = { ctx: c || 0, out: o || 0 };
    }
    modelsCache = { at: Date.now(), base, key, ids, meta };
    res.json(ids);
  } catch (e) {
    if (modelsCache.ids) { // gateway down/slow: last known good list beats an error toast
      log('warn', 'models_stale_cache', { age_ms: Date.now() - modelsCache.at });
      return res.json(modelsCache.ids);
    }
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
app.post('/api/chat', requireAuth, requireGenLimit, async (req, res) => {
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
  const MODEL_INFO = ctxForModel(chat.model); // from gateway metadata when known
  const CONTEXT_WINDOW = MODEL_INFO.ctx || getSettingInt('context_window', 8192); // manual setting = fallback
  const MAX_REPLY_TOKENS = getSettingInt('max_reply_tokens', 4096);  // cap output
  const lean = !!chat.lean;
  const history = lean ? [] : buildHistory(chat.id, chat.summary_upto_id || 0, HISTORY_BUDGET);
  const systemPrompt = buildSystemPrompt(req.user, chat);

  db.prepare('INSERT INTO messages (chat_id, role, content) VALUES (?, ?, ?)').run(chat.id, 'user', cleanMessage);
  let provisionalTitle = null;
  if (chat.title === 'New Chat' || chat.title === 'Chat baru') {
    provisionalTitle = cleanMessage.slice(0, 60);
    db.prepare("UPDATE chats SET title = ?, updated_at = datetime('now') WHERE id = ?").run(provisionalTitle, chat.id);
  } else {
    db.prepare("UPDATE chats SET updated_at = datetime('now') WHERE id = ?").run(chat.id);
  }

  startSse(req, res);

  let aiReply = '';
  let tokens = 0;
  let promptTokens = 0;
  let completionTokens = 0;
  let aborted = false;
  res.on('close', () => { if (!res.writableEnded) aborted = true; });

  let truncated = false;
  const t0 = Date.now(); let tFirst = 0; // wall-clock stream + first-token latency
  const idle = idleSignal(getTimeoutMs());
  try {
    const upstream = await routerFetch('/chat/completions', {
      method: 'POST',
      body: JSON.stringify({
        model: chat.model,
        messages: [{ role: 'system', content: systemPrompt }, ...history, { role: 'user', content: cleanMessage }],
        stream: true,
        max_tokens: MAX_REPLY_TOKENS
      }),
      signal: idle.signal
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
      idle.kick();
      buffer += decoder.decode(value, { stream: true });
      const lines = buffer.split('\n');
      buffer = lines.pop();
      for (const line of lines) {
        if (!line.startsWith('data: ') || line.includes('[DONE]')) continue;
        try {
          const chunk = JSON.parse(line.slice(6));
          if (!tFirst) tFirst = Date.now();
          if (chunk.choices?.[0]?.finish_reason === 'length') truncated = true;
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
      db.prepare('INSERT INTO messages (chat_id, role, content, tokens, meta) VALUES (?, ?, ?, ?, ?)').run(chat.id, 'assistant', aiReply, tokens, JSON.stringify({ p: promptTokens, c: completionTokens, t: tokens, ms: Date.now() - t0, tt: tFirst ? tFirst - t0 : 0, ctx: CONTEXT_WINDOW, out: MODEL_INFO.out }));
      db.prepare("UPDATE chats SET updated_at = datetime('now') WHERE id = ?").run(chat.id);
      countRequest(req.user, tokens, promptTokens, completionTokens, req.guest ? 'guest' : (lean ? 'eco' : 'normal'), chat.model);
      // background: refresh rolling summary + cross-chat memory (lean mode = no context, skip both)
      if (provisionalTitle && !req.guest) scheduleTitle(chat, cleanMessage, aiReply, provisionalTitle);
      if (!lean) {
        const uptoId = db.prepare('SELECT MAX(id) m FROM messages WHERE chat_id = ?').get(chat.id).m || 0;
        scheduleSummary(chat, uptoId);
        if (!req.guest) scheduleMemoryUpdate(req.user, chat, [...history, { role: 'user', content: cleanMessage }, { role: 'assistant', content: aiReply }]);
      }
    }
    idle.done();
    if (truncated && aiReply) res.write(`data: ${JSON.stringify({ note: 'ERR_LENGTH' })}\n\n`);
    res.write(`data: ${JSON.stringify({ usage: { total: tokens, prompt: promptTokens, completion: completionTokens, ms: Date.now() - t0, tt: tFirst ? tFirst - t0 : 0, ctx: CONTEXT_WINDOW, out: MODEL_INFO.out } })}\n\n`);
    res.write('data: [DONE]\n\n');
    res.end();
  } catch (e) {
    idle.done();
    if (aiReply) {
      db.prepare('INSERT INTO messages (chat_id, role, content, tokens, meta) VALUES (?, ?, ?, ?, ?)').run(chat.id, 'assistant', aiReply, tokens, JSON.stringify({ p: promptTokens, c: completionTokens, t: tokens, ms: Date.now() - t0, tt: tFirst ? tFirst - t0 : 0, ctx: CONTEXT_WINDOW, out: MODEL_INFO.out }));
      countRequest(req.user, tokens, promptTokens, completionTokens, req.guest ? 'guest' : (lean ? 'eco' : 'normal'), chat.model);
    }
    const friendly = e.code === 'ERR_ROUTER_NOT_CONFIGURED' ? e.code
      : (e.name === 'TimeoutError' || e.name === 'AbortError' || /timed? ?out|abort/i.test(String(e.message || '')))
        ? 'ERR_TIMEOUT' // includes idle-stream watchdog firing
        : ('9Router/failed: ' + (e.message || 'unknown error')).slice(0, 300);
    // reply already streamed & saved -> soft 'partial' note; never erase what the user can see
    if (aiReply && !aborted) res.write(`data: ${JSON.stringify({ partial: friendly })}\n\n`);
    else if (!aborted) res.write(`data: ${JSON.stringify({ error: friendly })}\n\n`);
    res.write('data: [DONE]\n\n');
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
app.post('/api/temp-chat', requireAuth, requireGenLimit, async (req, res) => {
  const { message, model, lean } = req.body || {};
  if (!message || !message.trim()) return res.status(400).json({ error: 'ERR_FIELDS_REQUIRED' });

  if (guestLimitHit(req, res)) return;
  const quota = checkQuota(req.user);
  if (!quota.ok) return res.status(429).json({ error: 'ERR_QUOTA' });

  const effectiveModel = req.user.role === 'admin' ? (model || resolveUserModel(req.user)) : resolveUserModel(req.user);

  startSse(req, res);

  let tokens = 0; let promptTokens = 0; let completionTokens = 0;
  const t0 = Date.now(); let tFirst = 0;
  const MODEL_INFO = ctxForModel(effectiveModel);
  const CONTEXT_WINDOW = MODEL_INFO.ctx || getSettingInt('context_window', 8192);
  let aiTempReply = '';
  let aborted = false;
  res.on('close', () => { if (!res.writableEnded) aborted = true; });

  const systemPrompt = buildSystemPrompt(req.user, {});
  const messages = lean
    ? [{ role: 'user', content: sanitizeMessage(message.trim()) }]
    : [{ role: 'system', content: systemPrompt }, { role: 'user', content: sanitizeMessage(message.trim()) }];

  const idle = idleSignal(getTimeoutMs());
  try {
    const upstream = await routerFetch('/chat/completions', {
      method: 'POST',
      body: JSON.stringify({
        model: effectiveModel,
        messages,
        stream: true,
        max_tokens: getSettingInt('max_reply_tokens', 4096)
      }),
      signal: idle.signal
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
      idle.kick();
      buffer += decoder.decode(value, { stream: true });
      const lines = buffer.split('\n');
      buffer = lines.pop();
      for (const line of lines) {
        if (!line.startsWith('data: ') || line.includes('[DONE]')) continue;
        try {
          const chunk = JSON.parse(line.slice(6));
          if (!tFirst) tFirst = Date.now();
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
          if (chunk.usage) { tokens = (chunk.usage.total_tokens || tokens); promptTokens = chunk.usage.prompt_tokens || promptTokens; completionTokens = chunk.usage.completion_tokens || completionTokens; }
        } catch (_) {}
      }
    }
    idle.done();
    countRequest(req.user, tokens, promptTokens, completionTokens, req.guest ? 'guest' : (lean ? 'eco' : 'temp'), effectiveModel);
    res.write(`data: ${JSON.stringify({ usage: { total: tokens, prompt: promptTokens, completion: completionTokens, ms: Date.now() - t0, tt: tFirst ? tFirst - t0 : 0, ctx: CONTEXT_WINDOW, out: MODEL_INFO.out } })}\n\n`);
    res.write('data: [DONE]\n\n');
    res.end();
  } catch (e) {
    const friendly = e.code === 'ERR_ROUTER_NOT_CONFIGURED' ? e.code
      : (e.name === 'TimeoutError' || e.name === 'AbortError' || /timed? ?out|abort/i.test(String(e.message || '')))
        ? 'ERR_TIMEOUT' // includes idle-stream watchdog firing
        : ('9Router/failed: ' + (e.message || 'unknown error')).slice(0, 300);
    if (aiTempReply && !aborted) res.write(`data: ${JSON.stringify({ partial: friendly })}\n\n}`);
    else if (!aborted) res.write(`data: ${JSON.stringify({ error: friendly })}\n\n`);
    res.write('data: [DONE]\n\n');
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
    max_reply_tokens: getSettingInt('max_reply_tokens', 4096),
    context_window: getSettingInt('context_window', 8192),
    memory_enabled: getSetting('memory_enabled') !== '0',
    timeout_ms: getTimeoutMs() / 1000,
    guest_enabled: guestEnabled(),
    guest_max_chats: guestPolicy().max_chats,
    guest_max_minutes: guestPolicy().max_minutes,
    guest_purge_hour: purgeHour(),
    gen_limit_max: genPolicy().max,
    gen_limit_window_sec: Math.round(genPolicy().windowMs / 1000),
    today_usage: db.prepare('SELECT COALESCE(SUM(tokens_used),0) t, COALESCE(SUM(prompt_tokens),0) p, COALESCE(SUM(completion_tokens),0) c FROM usage WHERE date = ?').get(today())
  });
});

app.put('/api/admin/settings', requireAuth, requireAdmin, (req, res) => {
  const { default_model, history_token_budget, max_reply_tokens, context_window, memory_enabled, timeout_ms, guest_enabled, guest_max_chats, guest_max_minutes, guest_purge_hour, gen_limit_max, gen_limit_window_sec } = req.body || {};
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
    if (!Number.isFinite(n) || n < 64 || n > 16384) return res.status(400).json({ error: 'ERR_BAD_MAXTOK' });
    setSetting('max_reply_tokens', String(Math.round(n)));
  }
  if (context_window !== undefined) {
    const n = Number(context_window);
    if (!Number.isFinite(n) || n < 1024 || n > 1048576) return res.status(400).json({ error: 'ERR_BAD_CTXWIN' });
    setSetting('context_window', String(Math.round(n)));
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
  if (guest_purge_hour !== undefined) {
    const n = Number(guest_purge_hour);
    if (!Number.isInteger(n) || n < 0 || n > 23) return res.status(400).json({ error: 'ERR_BAD_PURGE_HOUR' });
    setSetting('guest_purge_hour', String(n));
  }
  if (gen_limit_max !== undefined) {
    const n = Number(gen_limit_max);
    if (!Number.isInteger(n) || n < 5 || n > 1000) return res.status(400).json({ error: 'ERR_BAD_GEN_LIMIT' });
    setSetting('gen_limit_max', String(n));
  }
  if (gen_limit_window_sec !== undefined) {
    const n = Number(gen_limit_window_sec);
    if (!Number.isInteger(n) || n < 10 || n > 600) return res.status(400).json({ error: 'ERR_BAD_GEN_LIMIT' });
    setSetting('gen_limit_window_sec', String(n));
  }
  chatLimiter.setLimits(genPolicy()); // apply live, no restart needed
  audit(req.user, 'settings_update', null, Object.keys(req.body || {}).join(','));
  res.json({ ok: true, default_model: getGlobalModel(), history_token_budget: getSettingInt('history_token_budget', 1600), max_reply_tokens: getSettingInt('max_reply_tokens', 4096), context_window: getSettingInt('context_window', 8192), memory_enabled: getSetting('memory_enabled') !== '0', timeout_ms: getTimeoutMs() / 1000, guest_enabled: guestEnabled(), guest_max_chats: guestPolicy().max_chats, guest_max_minutes: guestPolicy().max_minutes, guest_purge_hour: purgeHour(), gen_limit_max: genPolicy().max, gen_limit_window_sec: Math.round(genPolicy().windowMs / 1000) });
});

// ---------- admin: usage statistics ----------
app.get('/api/admin/stats', requireAuth, requireAdmin, (req, res) => {
  const days = Math.min(365, Math.max(1, Number(req.query.days) || 30));
  // last N days calendar (local date labels)
  const perDay = db.prepare(`
    SELECT date, SUM(request_count) reqs, SUM(tokens_used) tok, SUM(prompt_tokens) p, SUM(completion_tokens) c
    FROM usage WHERE date >= date('now', ?)
    GROUP BY date ORDER BY date`).all('-' + (days - 1) + ' day');
  const byUser = db.prepare(`
    SELECT u.username, SUM(v.request_count) reqs, SUM(v.tokens_used) tok
    FROM usage v JOIN users u ON u.id = v.user_id WHERE v.date >= date('now',?)
    GROUP BY v.user_id ORDER BY tok DESC LIMIT 10`).all('-' + (days - 1) + ' day');
  // per-model: join messages->chats (only saved chats; temp chat excluded)
  const byModel = db.prepare(`
    SELECT model, SUM(reqs) msgs, SUM(tok) tok
    FROM usage_events WHERE date >= date('now',?)
    GROUP BY model ORDER BY tok DESC LIMIT 10`).all('-' + (days - 1) + ' day');
  const totals = db.prepare(`
    SELECT COALESCE(SUM(request_count),0) reqs, COALESCE(SUM(tokens_used),0) tok,
      COALESCE(SUM(prompt_tokens),0) p, COALESCE(SUM(completion_tokens),0) c
    FROM usage WHERE date >= date('now',?)`).get('-' + (days - 1) + ' day');
  // mode ledger: every AI call from every mode lands here (normal/eco/temp/guest)
  const perMode = db.prepare(`
    SELECT mode, SUM(reqs) reqs, SUM(tok) tok FROM usage_events
    WHERE date >= date('now',?) GROUP BY mode`).all('-' + (days - 1) + ' day');
  const activeUsers = db.prepare(`
    SELECT COUNT(DISTINCT user_id) n FROM usage WHERE date >= date('now',?) AND user_id > 0`).get('-' + (days - 1) + ' day');
  const guestSessions = db.prepare(`
    SELECT COUNT(*) n FROM guest_sessions WHERE started_at >= (strftime('%s', 'now', ?) * 1000)`).get('-' + (days - 1) + ' day');
  let perHour = null;
  if (days === 1) {
    // hourly buckets of TODAY (local time), one assistant message = one request
    const rows = db.prepare(`
      SELECT printf('%02d', hour) h, SUM(reqs) reqs, SUM(tok) tok
      FROM usage_events WHERE date = date('now') GROUP BY hour`).all();
    const byH = {}; rows.forEach(x => { byH[x.h] = x; });
    perHour = [];
    for (let i = 0; i < 24; i++) {
      const key = String(i).padStart(2, '0');
      perHour.push({ h: key, reqs: byH[key] ? Number(byH[key].reqs) : 0, tok: byH[key] ? Number(byH[key].tok) : 0 });
    }
  }
  res.json({ days, per_day: perDay, per_hour: perHour, by_user: byUser, by_model: byModel, per_mode: perMode, totals, active_users: activeUsers.n, guest_sessions: guestSessions.n });
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
  invalidateModelsCache(); // new gateway -> refetch list next call
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
    audit(req.user, 'user_add', username, 'role=' + (role === 'admin' ? 'admin' : 'user'));
    res.json({ ok: true });
  } catch (e) {
    res.status(400).json({ error: 'ERR_USERNAME_TAKEN' });
  }
});

app.delete('/api/admin/users/:id', requireAuth, requireAdmin, (req, res) => {
  if (Number(req.params.id) === req.user.id) return res.status(400).json({ error: 'ERR_SELF_DELETE' });
  const tu = db.prepare('SELECT username FROM users WHERE id = ?').get(req.params.id);
  db.prepare('DELETE FROM sessions WHERE user_id = ?').run(req.params.id);
  db.prepare('DELETE FROM users WHERE id = ?').run(req.params.id);
  audit(req.user, 'user_delete', tu ? tu.username : req.params.id);
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
  audit(req.user, 'user_pwreset', String(req.params.id));
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
  audit(req.user, active ? 'user_activate' : 'user_deactivate', String(req.params.id));
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
  db.prepare('DELETE FROM usage_events').run();
  audit(req.user, 'usage_reset', null, null);
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
    log('error', 'unhandled_request_error', { path: req.path, msg: String(err.message || err), stack: String(err.stack || '').split('\n').slice(0, 4).join(' | ') });
    return res.status(500).json({ error: 'Server error: ' + err.message });
  }
  next();
});

// ---------- public share links (read-only snapshots) ----------
db.exec(`CREATE TABLE IF NOT EXISTS shared_chats (
  token TEXT PRIMARY KEY,
  chat_id INTEGER NOT NULL,
  user_id INTEGER NOT NULL,
  created_at INTEGER NOT NULL
)`);
const SHARE_RE = /^[a-f0-9]{16}$/;

// ---------- audit trail (#7): who did what when (admin actions, auth events) ----------
db.exec(`CREATE TABLE IF NOT EXISTS audit (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  at INTEGER NOT NULL,
  actor_id INTEGER,
  actor TEXT,
  action TEXT NOT NULL,
  target TEXT,
  detail TEXT
)`);
db.exec('CREATE INDEX IF NOT EXISTS idx_audit_at ON audit(at)');
function audit(actorUser, action, target, detail) {
  try {
    db.prepare('INSERT INTO audit (at, actor_id, actor, action, target, detail) VALUES (?,?,?,?,?,?)')
      .run(Date.now(), actorUser ? actorUser.id : null, actorUser ? actorUser.username : '-', String(action).slice(0, 64), target == null ? null : String(target).slice(0, 120), detail == null ? null : String(detail).slice(0, 300));
    // keep last 2000 rows
    const n = db.prepare('SELECT COUNT(*) n FROM audit').get().n;
    if (n > 2000) db.prepare('DELETE FROM audit WHERE id NOT IN (SELECT id FROM audit ORDER BY id DESC LIMIT 2000)').run();
  } catch (e) { log('warn', 'audit_write_failed', { msg: String(e.message || e) }); }
}
function shareLookup(token) {
  if (!SHARE_RE.test(String(token))) return null;
  const row = db.prepare('SELECT chat_id FROM shared_chats WHERE token = ?').get(token);
  if (!row) return null;
  const chat = db.prepare('SELECT c.id, c.title, c.model, c.updated_at, u.username FROM chats c JOIN users u ON u.id = c.user_id WHERE c.id = ? AND c.user_id > 0').get(row.chat_id);
  if (!chat) { db.prepare('DELETE FROM shared_chats WHERE token = ?').run(token); return null; }
  const messages = db.prepare('SELECT role, content, created_at FROM messages WHERE chat_id = ? ORDER BY id').all(chat.id);
  if (!messages.length) return null;
  return { title: chat.title, owner: chat.username, model: chat.model, updated_at: chat.updated_at, messages };
}
function getShareToken(chatId, userId) {
  const row = db.prepare('SELECT token FROM shared_chats WHERE chat_id = ? AND user_id = ?').get(chatId, userId);
  return row ? row.token : null;
}

app.post('/api/chats/:id/share', requireAuth, requireRegistered, (req, res) => {
  const chat = db.prepare('SELECT id FROM chats WHERE id = ? AND user_id = ?').get(req.params.id, req.user.id);
  if (!chat) return res.status(404).json({ error: 'ERR_NOT_FOUND' });
  if (!db.prepare('SELECT 1 FROM messages WHERE chat_id = ? LIMIT 1').get(chat.id)) return res.status(400).json({ error: 'ERR_EMPTY_SHARE' });
  let token = getShareToken(chat.id, req.user.id);
  if (!token) {
    token = crypto.randomBytes(8).toString('hex');
    db.prepare('INSERT INTO shared_chats (token, chat_id, user_id, created_at) VALUES (?, ?, ?, ?)').run(token, chat.id, req.user.id, Date.now());
    audit(req.user, 'share_create', 'chat=' + chat.id, 'token=' + token.slice(0, 4) + '…');
  }
  res.json({ ok: true, token });
});
app.get('/api/chats/:id/share', requireAuth, requireRegistered, (req, res) => {
  const chat = db.prepare('SELECT id FROM chats WHERE id = ? AND user_id = ?').get(req.params.id, req.user.id);
  if (!chat) return res.status(404).json({ error: 'ERR_NOT_FOUND' });
  res.json({ token: getShareToken(chat.id, req.user.id) });
});
app.delete('/api/chats/:id/share', requireAuth, requireRegistered, (req, res) => {
  const chat = db.prepare('SELECT id FROM chats WHERE id = ? AND user_id = ?').get(req.params.id, req.user.id);
  if (!chat) return res.status(404).json({ error: 'ERR_NOT_FOUND' });
  const n = db.prepare('DELETE FROM shared_chats WHERE chat_id = ? AND user_id = ?').run(chat.id, req.user.id).changes;
  if (n > 0) audit(req.user, 'share_revoke', 'chat=' + chat.id);
  res.json({ ok: true, revoked: n > 0 });
});

// public read-only share page -> renderer lives in lib/share.js (#11)
app.get('/s/:token', (req, res) => {
  const lang = acceptLang(req);
  const d = shareLookup(req.params.token);
  res.setHeader('Cache-Control', 'no-store');
  if (!d) return res.status(404).type('html').send(notFoundHTML(lang));
  res.type('html').send(shareHTML(d, lang));
});

// ---------- #7 audit trail view (admin) ----------
app.get('/api/admin/audit', requireAuth, requireAdmin, (req, res) => {
  const limit = Math.min(500, Math.max(1, Number(req.query.limit) || 100));
  const offset = Math.min(1975, Math.max(0, Number(req.query.offset) || 0));
  const rows = db.prepare('SELECT id, at, actor, action, target, detail FROM audit ORDER BY id DESC LIMIT ? OFFSET ?').all(limit, offset);
  res.json({ rows });
});

// ---------- #10 metrics (admin, Prometheus text format) ----------
app.get('/api/admin/metrics', requireAuth, requireAdmin, (req, res) => {
  const up = db.prepare("SELECT COALESCE(SUM(request_count),0) reqs, COALESCE(SUM(tokens_used),0) tok FROM usage WHERE date >= date('now','-1 day')").get();
  const all = db.prepare("SELECT COALESCE(SUM(request_count),0) reqs, COALESCE(SUM(tokens_used),0) tok FROM usage").get();
  const counts = {
    users: db.prepare('SELECT COUNT(*) n FROM users').get().n,
    chats: db.prepare('SELECT COUNT(*) n FROM chats').get().n,
    messages: db.prepare('SELECT COUNT(*) n FROM messages').get().n,
    guests: db.prepare('SELECT COUNT(*) n FROM guest_sessions').get().n,
    shares: db.prepare('SELECT COUNT(*) n FROM shared_chats').get().n,
    audit: db.prepare('SELECT COUNT(*) n FROM audit').get().n,
  };
  const mem = process.memoryUsage();
  res.type('text/plain').send([
    '# HELP dashaim_uptime_seconds Process uptime',
    '# TYPE dashaim_uptime_seconds gauge',
    'dashaim_uptime_seconds ' + Math.round((Date.now() - startedAt) / 1000),
    'dashaim_process_rss_bytes ' + mem.rss,
    'dashaim_http_heap_bytes ' + mem.heapUsed,
    'dashaim_requests_24h ' + up.reqs,
    'dashaim_tokens_24h ' + up.tok,
    'dashaim_requests_total ' + all.reqs,
    'dashaim_tokens_total ' + all.tok,
    ...Object.entries(counts).map(([k, v]) => 'dashaim_' + k + ' ' + v),
    ''
  ].join('\n'));
});

// ---------- #1 admin: DB backup on demand ----------
app.post('/api/admin/backup', requireAuth, requireAdmin, (req, res) => {
  try {
    fs.mkdirSync(BACKUP_DIR, { recursive: true });
    const ts = new Date().toISOString().replace(/[:.]/g, '-');
    const file = path.join(BACKUP_DIR, 'chat-' + ts + '.db');
    db.backup(file).then(() => {
      pruneBackups();
      audit(req.user, 'backup', path.basename(file));
      logInfo('backup_done', { file: path.basename(file) });
      res.json({ ok: true, file: path.basename(file) });
    }).catch((e) => res.status(500).json({ error: 'ERR_BACKUP', msg: String(e.message || e) }));
  } catch (e) {
    res.status(500).json({ error: 'ERR_BACKUP', msg: String(e.message || e) });
  }
});

// ---------- scheduled guest-chat purge (admin-configurable local time, default 00:00) ----------
app.post('/api/admin/guest-purge-now', requireAuth, requireAdmin, (req, res) => {
  const n = runGuestPurge(req.user, 'manual');
  audit(req.user, 'guest_purge_manual', null, 'cleared=' + n);
  res.json({ ok: true, cleared: n });
});
function purgeHour() {
  const n = Number(getSetting('guest_purge_hour'));
  return Number.isFinite(n) ? Math.min(23, Math.max(0, Math.round(n))) : 0;
}

// ---------- SPA fallback: unknown non-API GET -> index.html (client router decides) ----------
app.use('/api', (req, res) => res.status(404).json({ error: 'ERR_NOT_FOUND' }));
app.get('/{*splat}', (req, res) => {
  res.setHeader('Cache-Control', 'no-cache, no-store, must-revalidate');
  res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

app.listen(PORT, () => {
  logInfo('server_start', { port: PORT, version: APP_VERSION });
  setTimeout(runAutoBackup, 3000).unref();   // one backup per boot, then daily
  setInterval(runAutoBackup, 24 * 3600 * 1000).unref();
  setTimeout(warmModelsCache, 8000).unref(); // context-window map for reply stats chips (staggered after backup)
});

// ---------- #1 automatic backups (30 days retention, safe: better-sqlite3 online backup) ----------
const BACKUP_DIR = process.env.BACKUP_DIR || path.join(__dirname, 'backups');
const KEEP_DAYS = Number(process.env.BACKUP_KEEP_DAYS || 30);
function pruneBackups() {
  try {
    fs.mkdirSync(BACKUP_DIR, { recursive: true });
    const cutoff = Date.now() - KEEP_DAYS * 86400000;
    let removed = 0;
    for (const f of fs.readdirSync(BACKUP_DIR)) {
      if (!/^chat-.*\.db$/.test(f)) continue;
      const st = fs.statSync(path.join(BACKUP_DIR, f));
      if (st.mtimeMs < cutoff) { fs.unlinkSync(path.join(BACKUP_DIR, f)); removed++; }
    }
    if (removed) logInfo('backups_pruned', { removed, keep_days: KEEP_DAYS });
  } catch (e) { log('warn', 'backup_prune_failed', { msg: String(e.message || e) }); }
}
let lastBackupDay = '';
function runAutoBackup() {
  const key = new Date().toISOString().slice(0, 10);
  if (lastBackupDay === key) { pruneBackups(); return; }
  lastBackupDay = key;
  try {
    fs.mkdirSync(BACKUP_DIR, { recursive: true });
    const file = path.join(BACKUP_DIR, 'chat-' + key + '.db');
    db.backup(file).then(() => { pruneBackups(); logInfo('auto_backup', { file: path.basename(file) }); })
      .catch((e) => log('error', 'auto_backup_failed', { msg: String(e.message || e) }));
  } catch (e) { log('error', 'auto_backup_failed', { msg: String(e.message || e) }); }
}

function runGuestPurge(actor, reason) {
  // wipe ALL guest data: expired or not — this is the scheduled cleanup
  const ids = db.prepare('SELECT DISTINCT guest_id FROM guest_sessions').all();
  const delMsgs = db.prepare('DELETE FROM messages WHERE chat_id IN (SELECT id FROM chats WHERE user_id = ?)');
  const delChats = db.prepare('DELETE FROM chats WHERE user_id = ?');
  let n = 0;
  const tx = db.transaction(() => {
    for (const g of ids) { delMsgs.run(-g.guest_id); delChats.run(-g.guest_id); n++; }
    db.prepare('DELETE FROM guest_sessions').run();
  });
  tx();
  log('info', 'guest_purge', { cleared: n, via: reason || 'manual' });
  if (reason === 'auto') setSetting('guest_last_purge_day', keyOf(now0()));
  return n;
}
function keyOf(d) { return d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') + '-' + String(d.getDate()).padStart(2, '0'); }
function now0() { return new Date(); }
setInterval(() => {
  const now = new Date();
  if (now.getHours() !== purgeHour()) return;
  const key = keyOf(now); // once per calendar day, persisted in settings (survives restarts)
  if (getSetting('guest_last_purge_day') === key) return;
  const n = runGuestPurge(null, 'auto');
  audit(null, 'guest_purge_auto', null, 'cleared=' + n);
}, 60000);

// graceful shutdown: close DB cleanly on stop/restart
function shutdown() {
  try { db.close(); } catch (_) {}
  process.exit(0);
}
process.on('SIGTERM', shutdown);
process.on('SIGINT', shutdown);

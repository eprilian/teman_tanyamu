// Teman Tanyamu: lightweight AI chat web app (Express + SQLite + SSE relay to 9Router)
const express = require('express');
const Database = require('better-sqlite3');
const crypto = require('crypto');
const path = require('path');

const ROUTER_BASE = process.env.ROUTER_BASE || 'http://localhost:20128/v1';
const ROUTER_KEY = process.env.ROUTER_KEY || 'sk-a777cdb383c7ae1c-xgfpfa-f8512e83';
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
  if (!user) return res.status(401).json({ error: 'ERR_UNAUTH' });
  req.user = user;
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

function bumpUsage(user, tokens) {
  db.prepare('INSERT INTO usage (user_id, date, request_count, tokens_used) VALUES (?, ?, 1, ?) ON CONFLICT(user_id, date) DO UPDATE SET request_count = request_count + 1, tokens_used = tokens_used + ?').run(user.id, today(), tokens, tokens);
}

async function routerFetch(pathname, opts = {}) {
  return fetch(ROUTER_BASE + pathname, {
    ...opts,
    headers: { 'Content-Type': 'application/json', 'Authorization': 'Bearer ' + ROUTER_KEY, ...(opts.headers || {}) }
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
    .replace(/Cannot read\s+"[^"]*"[^.]*/gi, '')
    .replace(/\s{2,}/g, ' ')
    .trim();
  return out || msg;
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

app.post('/api/logout', (req, res) => {
  const token = (req.headers.cookie || '').match(/session=([a-f0-9]+)/);
  if (token) db.prepare('DELETE FROM sessions WHERE token = ?').run(token[1]);
  res.setHeader('Set-Cookie', 'session=; HttpOnly; Path=/; Max-Age=0');
  res.json({ ok: true });
});

app.get('/api/me', requireAuth, (req, res) => {
  const q = checkQuota(req.user);
  const usedRow = db.prepare('SELECT request_count FROM usage WHERE user_id = ? AND date = ?').get(req.user.id, today());
  res.json({
    username: req.user.username,
    role: req.user.role,
    quota_used: usedRow ? usedRow.request_count : 0,
    quota_max: req.user.role === 'admin' ? null : (q.quota || null),
    effective_model: resolveUserModel(req.user),
    model_override: req.user.model_override,
    global_model: getGlobalModel(),
    avatar: req.user.avatar || null
  });
});

// account
app.put('/api/me/password', requireAuth, (req, res) => {
  const { current, next } = req.body || {};
  if (!current || !next) return res.status(400).json({ error: 'ERR_FIELDS_REQUIRED' });
  if (String(next).length < 4) return res.status(400).json({ error: 'ERR_PW_SHORT' });
  const row = db.prepare('SELECT password_hash FROM users WHERE id = ?').get(req.user.id);
  if (!verifyPassword(current, row.password_hash)) return res.status(401).json({ error: 'ERR_OLD_PW' });
  db.prepare('UPDATE users SET password_hash = ? WHERE id = ?').run(hashPassword(next), req.user.id);
  res.json({ ok: true });
});

app.put('/api/me/avatar', requireAuth, (req, res) => {
  const { avatar } = req.body || {};
  if (avatar !== null) {
    if (typeof avatar !== 'string' || !/^data:image\/(png|jpe?g|gif|webp);base64,[A-Za-z0-9+/=]+$/.test(avatar)) return res.status(400).json({ error: 'ERR_AVATAR_FORMAT' });
    if (avatar.length > 400000) return res.status(400).json({ error: 'ERR_TOO_BIG' });
  }
  db.prepare('UPDATE users SET avatar = ? WHERE id = ?').run(avatar, req.user.id);
  res.json({ ok: true, avatar });
});

// model override (admin only)
app.put('/api/me/model', requireAuth, requireAdmin, (req, res) => {
  const { model } = req.body || {};
  if (!model || typeof model !== 'string') return res.status(400).json({ error: 'ERR_FIELDS_REQUIRED' });
  db.prepare('UPDATE users SET model_override = ? WHERE id = ?').run(model, req.user.id);
  res.json({ ok: true, model_override: model });
});
app.delete('/api/me/model', requireAuth, requireAdmin, (req, res) => {
  db.prepare('UPDATE users SET model_override = NULL WHERE id = ?').run(req.user.id);
  res.json({ ok: true, model_override: null, effective_model: getGlobalModel() });
});

// ---------- chats ----------
app.get('/api/chats', requireAuth, (req, res) => {
  res.json(db.prepare('SELECT id, title, model, updated_at FROM chats WHERE user_id = ? ORDER BY updated_at DESC').all(req.user.id));
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
  try {
    const r = await routerFetch('/models');
    const data = await r.json();
    res.json(data.data.map(m => m.id));
  } catch (e) {
    res.status(502).json({ error: 'ERR_ROUTER_DOWN' });
  }
});

// ---------- wallpaper ----------
app.get('/api/wallpaper', requireAuth, (req, res) => {
  const own = getSetting('user:' + req.user.id + ':wallpaper');
  const global = getSetting('wallpaper');
  res.json({ wallpaper: own !== null ? own : global, is_custom: own !== null, has_global: global !== null });
});

app.put('/api/wallpaper', requireAuth, (req, res) => {
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

  const quota = checkQuota(req.user);
  if (!quota.ok) return res.status(429).json({ error: 'ERR_QUOTA' });

  const cleanMessage = sanitizeMessage(message.trim());
  const history = db.prepare('SELECT role, content FROM messages WHERE chat_id = ? ORDER BY id DESC LIMIT 10').all(chat.id).reverse();

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
  let aborted = false;
  res.on('close', () => { if (!res.writableEnded) aborted = true; });

  try {
    const upstream = await routerFetch('/chat/completions', {
      method: 'POST',
      body: JSON.stringify({ model: chat.model, messages: [...history, { role: 'user', content: cleanMessage }], stream: true }),
      signal: AbortSignal.timeout(120000)
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
          if (chunk.usage) tokens = (chunk.usage.total_tokens || tokens);
        } catch (_) {}
      }
    }

    if (aiReply) {
      db.prepare('INSERT INTO messages (chat_id, role, content, tokens) VALUES (?, ?, ?, ?)').run(chat.id, 'assistant', aiReply, tokens);
      db.prepare("UPDATE chats SET updated_at = datetime('now') WHERE id = ?").run(chat.id);
      bumpUsage(req.user, tokens);
    }
    res.write('data: [DONE]\n\n');
    res.end();
  } catch (e) {
    if (aiReply) {
      db.prepare('INSERT INTO messages (chat_id, role, content, tokens) VALUES (?, ?, ?, ?)').run(chat.id, 'assistant', aiReply, tokens);
      bumpUsage(req.user, tokens);
    }
    res.write(`data: ${JSON.stringify({ error: 'Timeout/failed: ' + e.message })}\n\n`);
    res.end();
  }
});

// ---------- temp chat (no history saved) ----------
app.post('/api/temp-chat', requireAuth, async (req, res) => {
  const { message, model } = req.body || {};
  if (!message || !message.trim()) return res.status(400).json({ error: 'ERR_FIELDS_REQUIRED' });

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

  try {
    const upstream = await routerFetch('/chat/completions', {
      method: 'POST',
      body: JSON.stringify({ model: effectiveModel, messages: [{ role: 'user', content: sanitizeMessage(message.trim()) }], stream: true }),
      signal: AbortSignal.timeout(120000)
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
    bumpUsage(req.user, tokens);
    res.write('data: [DONE]\n\n');
    res.end();
  } catch (e) {
    res.write(`data: ${JSON.stringify({ error: 'Timeout/failed: ' + e.message })}\n\n`);
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
  res.json({ default_model: getGlobalModel() });
});

app.put('/api/admin/settings', requireAuth, requireAdmin, (req, res) => {
  const { default_model } = req.body || {};
  if (!default_model || typeof default_model !== 'string') return res.status(400).json({ error: 'ERR_FIELDS_REQUIRED' });
  setSetting('default_model', default_model);
  res.json({ ok: true, default_model });
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

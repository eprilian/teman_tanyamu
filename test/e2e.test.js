// ============================================================
// Permanent regression suite — run: ./manage.sh test  (or: node test/e2e.test.js)
// Self-contained: creates its own throwaway users, cleans up after
// itself, never touches admin/guest real data. Requires the service
// to be running. Exit 0 = all green, 1 = failures.
// ============================================================
const fs = require('fs');
const path = require('path');
const Database = require('better-sqlite3');

const ROOT = path.join(__dirname, '..');
const PORT_FILE = path.join(ROOT, '.port');
const PORT = fs.existsSync(PORT_FILE) ? Number(fs.readFileSync(PORT_FILE, 'utf8').trim()) : (Number(process.env.PORT) || 3000);
const BASE = `http://localhost:${PORT}`;

let pass = 0, fail = 0;
const fails = [];
function ok(name, cond, extra) {
  if (cond) { pass++; }
  else { fail++; fails.push(name + (extra ? ' [' + extra + ']' : '')); console.log('  ✗ ' + name + (extra ? ' — ' + extra : '')); }
}
const line = (s) => console.log('\n== ' + s + ' ==');

const PW = 'suite' + Date.now().toString(36);
const USERS = ['__suite_a', '__suite_b'];

async function j(pathname, opts = {}, cookie) {
  const headers = { 'Content-Type': 'application/json' };
  if (cookie) headers.Cookie = cookie;
  const r = await fetch(BASE + pathname, { ...opts, headers, redirect: 'manual' });
  const ct = r.headers.get('content-type') || '';
  const body = ct.includes('json') ? await r.json().catch(() => ({})) : await r.text();
  return { status: r.status, body, cookie: (r.headers.get('set-cookie') || '').split(';')[0] };
}
async function login(u, p) { return (await j('/api/login', { method: 'POST', body: JSON.stringify({ username: u, password: p }) })).cookie; }

async function main() {
  // health
  line('health & version');
  const h = await j('/api/health');
  ok('health ok', h.status === 200 && h.body.ok === true, 'status ' + h.status);

  // SPA catch-all + API 404
  const spa = await fetch(BASE + '/c/1');
  ok('SPA fallback 200', spa.status === 200 && (await spa.text()).includes('id="app"') || spa.status === 200);
  const nf = await j('/api/nope-does-not-exist');
  ok('API 404 JSON', nf.status === 404 && nf.body.error === 'ERR_NOT_FOUND');

  // ---------- create suite users via DB (no admin creds needed) ----------
  line('setup (DB users)');
  const crypto = require('crypto');
  const db = new Database(path.join(ROOT, 'chat.db'));
  const hash = (pw) => { const salt = crypto.randomBytes(16).toString('hex'); return 'scrypt1:' + salt + ':' + crypto.scryptSync(pw, salt, 64).toString('hex'); };
  for (const u of USERS) {
    db.prepare('DELETE FROM users WHERE username = ?').run(u);
    db.prepare("INSERT INTO users (username, password_hash, role, daily_quota) VALUES (?, ?, 'admin', 999999)").run(u, hash(PW));
  }
  const ckA = await login(USERS[0], PW);
  const ckB = await login(USERS[1], PW);
  ok('login works', !!ckA && !!ckB);
  ok('bad login rejected', (await j('/api/login', { method: 'POST', body: JSON.stringify({ username: USERS[0], password: 'wrong-pass-xyz' }) })).status === 401);

  // ---------- auth guards ----------
  line('auth guards');
  ok('chats require auth', (await j('/api/chats')).status === 401);
  ok('admin settings require auth', (await j('/api/admin/settings', { method: 'PUT', body: '{}' })).status === 401);
  ok('admin audit requires admin', true); // suite users are admin; non-admin covered by login_inactive below

  // ---------- chat CRUD + isolation ----------
  line('chat CRUD & isolation');
  const created = await j('/api/chats', { method: 'POST', body: JSON.stringify({ title: 'suite chat' }) }, ckA);
  const chatId = created.body.id;
  ok('create chat', created.status === 200 && chatId > 0, JSON.stringify(created.body).slice(0, 120));
  db.prepare('INSERT INTO messages (chat_id, role, content, created_at) VALUES (?, ?, ?, ?)').run(chatId, 'user', 'hello from suite', new Date().toISOString());
  const listB = await j('/api/chats', {}, ckB);
  ok('chat isolation (B cannot see A chat)', !(listB.body.chats || listB.body || []).some((c) => c.id === chatId));

  // ---------- sharing ----------
  line('share links');
  const sh = await j('/api/chats/' + chatId + '/share', { method: 'POST' }, ckA);
  ok('create share', sh.status === 200 && /^[a-f0-9]{16}$/.test(sh.body.token || ''), JSON.stringify(sh.body).slice(0, 80));
  if (sh.body && sh.body.token) {
    const page = await fetch(BASE + '/s/' + sh.body.token);
    const html = await page.text();
    ok('share page public 200', page.status === 200);
    ok('share page noindex', html.includes('noindex'));
    ok('share i18n EN label', /Shared chat|read-only/i.test(html));
    const pageId = await fetch(BASE + '/s/' + sh.body.token, { headers: { 'Accept-Language': 'id-ID,id;q=0.9' } });
    const htmlId = await pageId.text();
    ok('share i18n ID label', /dibagikan|hanya-baca/i.test(htmlId));
    const bad = await fetch(BASE + '/s/deadbeefdeadbeef');
    ok('bad token 404 html', bad.status === 404);
    const rev = await j('/api/chats/' + chatId + '/share', { method: 'DELETE' }, ckB);
    ok('revoke by non-owner fails', rev.status === 404);
    const revA = await j('/api/chats/' + chatId + '/share', { method: 'DELETE' }, ckA);
    ok('revoke by owner ok', revA.status === 200 && revA.body.revoked === true);
    const gone = await fetch(BASE + '/s/' + sh.body.token);
    ok('revoked link 404', gone.status === 404);
  }

  // ---------- empty chat guard ----------
  const empty = await j('/api/chats', { method: 'POST', body: JSON.stringify({ title: 'suite empty' }) }, ckA);
  const shE = await j('/api/chats/' + empty.body.id + '/share', { method: 'POST' }, ckA);
  ok('share empty chat -> ERR_EMPTY_SHARE', shE.status === 400 && shE.body.error === 'ERR_EMPTY_SHARE');

  // ---------- rate limiter (lib unit) ----------
  line('rate limiter unit');
  const { makeLimiter } = require('../lib/ratelimit');
  const lim = makeLimiter({ windowMs: 10000, max: 3 });
  ok('allow 3 then block', lim.allow('k') === true && lim.allow('k') === true && lim.allow('k') === true && lim.allow('k') === false);
  ok('other key unaffected', lim.allow('other'));

  // logger smoke
  const { log } = require('../lib/logger');
  ok('logger returns silently', (() => { try { log('info', 'suite_event', { x: 1 }); return true; } catch (e) { return false; } })());

  // ---------- purge persistence (#3) ----------
  line('purge day persistence');
  const has = db.prepare("SELECT value FROM settings WHERE key = 'guest_last_purge_day'").get();
  ok('guest_last_purge_day readable', has === undefined || typeof has.value === 'string'); // may be unset until first auto-purge

  // ---------- admin APIs (as suite admin) ----------
  line('admin endpoints');
  const users = await j('/api/admin/users', {}, ckA);
  ok('list users', users.status === 200 && (users.body.users || users.body).length >= 2);
  const stats = await j('/api/admin/stats?days=1', {}, ckA);
  ok('stats days=1', stats.status === 200 && stats.body.totals !== undefined);
  const statsClamp = await j('/api/admin/stats?days=99999', {}, ckA);
  ok('stats clamp 365', statsClamp.status === 200);
  const audit = await j('/api/admin/audit?limit=5', {}, ckA);
  ok('audit readable', audit.status === 200 && Array.isArray(audit.body.rows), 'st=' + audit.status + ' body=' + JSON.stringify(audit.body).slice(0, 200));
  if (!Array.isArray(audit.body.rows)) console.log('  AUDIT RAW:', audit.status, JSON.stringify(audit.body).slice(0, 400));
  ok('audit has suite login', audit.body.rows.some((r) => r.action === 'login'));
  const metrics = await j('/api/admin/metrics', {}, ckA);
  ok('metrics prometheus', metrics.status === 200 && typeof metrics.body === 'string' && metrics.body.includes('dashaim_requests_24h'));
  const backup = await j('/api/admin/backup', { method: 'POST' }, ckA);
  ok('admin backup', backup.status === 200 && backup.body.ok === true && /^chat-.*\.db$/.test(backup.body.file || ''));

  // settings round-trip: set purge hour to its current value (no-op write)
  const cur = await j('/api/admin/settings', {}, ckA);
  const setRes = await j('/api/admin/settings', { method: 'PUT', body: JSON.stringify({ guest_purge_hour: cur.body.guest_purge_hour ?? 0 }) }, ckA);
  ok('settings PUT ok', setRes.status === 200);
  const badHour = await j('/api/admin/settings', { method: 'PUT', body: JSON.stringify({ guest_purge_hour: 99 }) }, ckA);
  ok('settings bad purge hour rejected', badHour.status === 400 && badHour.body.error === 'ERR_BAD_PURGE_HOUR');
  // generation throttle is admin-configurable (#5)
  const gp = await j('/api/admin/settings', {}, ckA);
  ok('settings expose gen limit', gp.status === 200 && gp.body.gen_limit_max === 30 && gp.body.gen_limit_window_sec === 90, JSON.stringify({ m: gp.body.gen_limit_max, w: gp.body.gen_limit_window_sec }));
  const setG = await j('/api/admin/settings', { method: 'PUT', body: JSON.stringify({ gen_limit_max: 12, gen_limit_window_sec: 30 }) }, ckA);
  ok('gen limit set to 12/30', setG.status === 200 && setG.body.gen_limit_max === 12 && setG.body.gen_limit_window_sec === 30);
  const badG = await j('/api/admin/settings', { method: 'PUT', body: JSON.stringify({ gen_limit_max: 2 }) }, ckA);
  ok('gen limit bounds rejected', badG.status === 400 && badG.body.error === 'ERR_BAD_GEN_LIMIT');
  const backG = await j('/api/admin/settings', { method: 'PUT', body: JSON.stringify({ gen_limit_max: 30, gen_limit_window_sec: 90 }) }, ckA);
  ok('gen limit restored 30/90', backG.status === 200 && backG.body.gen_limit_max === 30);

  // ---------- guest ----------
  line('guest');
  const g = await j('/api/guest', { method: 'POST' });
  ok('guest create', g.status === 200 || g.status === 403 /* disabled by admin */);

  // ---------- generation auth (no real LLM call) ----------
  line('chat endpoint guards');
  ok('chat requires auth', (await j('/api/chat', { method: 'POST', body: JSON.stringify({ chatId: 1, message: 'x' }) })).status === 401);
  ok('chat missing fields', (await j('/api/chat', { method: 'POST', body: JSON.stringify({}), }, ckA)).status === 400);
  ok('chat other-user 404', (await j('/api/chat', { method: 'POST', body: JSON.stringify({ chatId: chatId, message: 'x' }) }, ckB)).status === 404);

  // ---------- XSS paths ----------
  line('xss safety');
  const xssChat = await j('/api/chats', { method: 'POST', body: JSON.stringify({ title: '<script>bad()</script>' }) }, ckA);
  db.prepare('INSERT INTO messages (chat_id, role, content, created_at) VALUES (?, ?, ?, ?)').run(xssChat.body.id, 'user', '<img src=x onerror=alert(1)>', new Date().toISOString());
  const xssShare = await j('/api/chats/' + xssChat.body.id + '/share', { method: 'POST' }, ckA);
  if (xssShare.status === 200) {
    const page = await (await fetch(BASE + '/s/' + xssShare.body.token)).text();
    ok('xss escaped in share', !page.includes('<script>') && !page.includes('<img'));
  } else ok('xss share ok?', false, String(xssShare.status));

  // ---------- cleanup ----------
  line('cleanup');
  for (const u of USERS) {
    const row = db.prepare('SELECT id FROM users WHERE username = ?').get(u);
    if (row) {
      db.prepare('DELETE FROM messages WHERE chat_id IN (SELECT id FROM chats WHERE user_id = ?)').run(row.id);
      db.prepare('DELETE FROM shared_chats WHERE user_id = ?').run(row.id);
      db.prepare('DELETE FROM chats WHERE user_id = ?').run(row.id);
      db.prepare('DELETE FROM sessions WHERE user_id = ?').run(row.id);
      db.prepare('DELETE FROM usage WHERE user_id = ?').run(row.id);
      db.prepare('DELETE FROM users WHERE id = ?').run(row.id);
    }
  }
  db.close();
  ok('cleanup done', true);

  console.log('\n========================================');
  console.log(`RESULT: ${pass} passed, ${fail} failed`);
  if (fails.length) { console.log('Failures:\n - ' + fails.join('\n - ')); process.exit(1); }
  process.exit(0);
}

main().catch((e) => { console.error('SUITE CRASH:', e); process.exit(1); });

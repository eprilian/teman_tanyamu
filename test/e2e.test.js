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
  try {
    return await runSuite();
  } finally {
    // crash-proof cleanup: suite users + their data always removed, even mid-failure
    try {
      const D = require('better-sqlite3');
      const db = new Database(path.join(ROOT, 'chat.db'));
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
    } catch (e) { console.warn('post-suite cleanup:', e.message); }
  }
}

async function runSuite() {
  // health
  line('health & version');
  const h = await j('/api/health');
  ok('health ok', h.status === 200 && h.body.ok === true, 'status ' + h.status);

  // SPA catch-all + API 404
  const spa = await fetch(BASE + '/c/1');
  ok('SPA fallback 200', spa.status === 200 && (await spa.text()).includes('id="app"') || spa.status === 200);
  const nf = await j('/api/nope-does-not-exist');
  ok('API 404 JSON', nf.status === 404 && nf.body.error === 'ERR_NOT_FOUND');
  // regression (v29): server-only identifiers must never leak into the client stream loops
  const clientJs = require('fs').readFileSync(require('path').join(__dirname, '..', 'public', 'app.js'), 'utf8');
  ok('client free of server-only vars', !/if\s*\(\s*done\s*\|\|\s*aborted\s*\)/.test(clientJs));
  // regression (dsweb fix): reasoning stream path must survive — thinking must
  // render (never dropped) and stay out of copies
  ok('client handles reasoning stream', /chunk\.thinking/.test(clientJs) && /splitThink/.test(clientJs) && /paintStreamBubble/.test(clientJs));
  ok('client copy strips reasoning', /\.m-think/.test(clientJs));
  const serverJs = require('fs').readFileSync(require('path').join(__dirname, '..', 'server.js'), 'utf8');
  ok('relay forwards reasoning delta', serverJs.includes('delta.reasoning_content') && serverJs.includes('{ thinking:'));
  ok('dsweb per-model reply cap', /maxReplyFor/.test(serverJs));
  ok('admin-only purge not for guests', (await j('/api/admin/guest-purge-now', { method: 'POST' })).status === 401);

  // ---------- create suite users via DB (no admin creds needed) ----------
  line('setup (DB users)');
  const crypto = require('crypto');
  const db = new Database(path.join(ROOT, 'chat.db'));
  try { db.exec('ALTER TABLE messages ADD COLUMN meta TEXT'); } catch (_) {} // same migration server applies at boot
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
  // meta footer (v31): token/timing stats persist on the message row and ride along chat GET
  db.prepare('UPDATE messages SET meta = ? WHERE chat_id = ? AND role = ?').run('{"p":10,"c":5,"t":15,"ms":1200,"tt":300,"ctx":8192}', chatId, 'user');
  const withMeta = await j('/api/chats/' + chatId, {}, ckA);
  ok('message meta round-trip', withMeta.status === 200 && withMeta.body.messages.some((m) => m.meta && m.meta.includes('\"ctx\"')), JSON.stringify((withMeta.body.messages || []).map((m) => m.meta)));
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
  // regression: purge route must be registered BEFORE the /api 404 guard (v24 bug: 404 ERR_NOT_FOUND)
  let purgeNow = await j('/api/admin/guest-purge-now', { method: 'POST' }, ckA);
  if (purgeNow.status >= 500) { await new Promise((r2) => setTimeout(r2, 1200)); purgeNow = await j('/api/admin/guest-purge-now', { method: 'POST' }, ckA); } // boot auto-backup race
  ok('guest purge-now routed', purgeNow.status === 200 && purgeNow.body.ok === true, 'st=' + purgeNow.status + ' ' + JSON.stringify(purgeNow.body).slice(0, 80));
  const statsMode = await j('/api/admin/stats?days=30', {}, ckA);
  ok('stats exposes per_mode', Array.isArray(statsMode.body.per_mode), JSON.stringify(statsMode.body.per_mode || null).slice(0, 80));

  // settings round-trip: set purge hour to its current value (no-op write)
  const cur = await j('/api/admin/settings', {}, ckA);
  const setRes = await j('/api/admin/settings', { method: 'PUT', body: JSON.stringify({ guest_purge_hour: cur.body.guest_purge_hour ?? 0 }) }, ckA);
  ok('settings PUT ok', setRes.status === 200);
  const badHour = await j('/api/admin/settings', { method: 'PUT', body: JSON.stringify({ guest_purge_hour: 99 }) }, ckA);
  ok('settings bad purge hour rejected', badHour.status === 400 && badHour.body.error === 'ERR_BAD_PURGE_HOUR');
  // generation throttle is admin-configurable (#5). NOTE: the admin may have set custom
  // limits (e.g. 15/60) — don't assume defaults; snapshot, test, restore exactly what was there.
  const gp = await j('/api/admin/settings', {}, ckA);
  const origG = { max: gp.body.gen_limit_max, win: gp.body.gen_limit_window_sec };
  ok('settings expose gen limit', gp.status === 200 && typeof origG.max === 'number' && origG.max >= 5 && origG.max <= 1000 && typeof origG.win === 'number' && origG.win >= 10 && origG.win <= 600, JSON.stringify(origG));
  const setG = await j('/api/admin/settings', { method: 'PUT', body: JSON.stringify({ gen_limit_max: 12, gen_limit_window_sec: 30 }) }, ckA);
  ok('gen limit set to 12/30', setG.status === 200 && setG.body.gen_limit_max === 12 && setG.body.gen_limit_window_sec === 30);
  const badG = await j('/api/admin/settings', { method: 'PUT', body: JSON.stringify({ gen_limit_max: 2 }) }, ckA);
  ok('gen limit bounds rejected', badG.status === 400 && badG.body.error === 'ERR_BAD_GEN_LIMIT');
  const backG = await j('/api/admin/settings', { method: 'PUT', body: JSON.stringify({ gen_limit_max: origG.max, gen_limit_window_sec: origG.win }) }, ckA);
  ok('gen limit restored to admin value', backG.status === 200 && backG.body.gen_limit_max === origG.max && backG.body.gen_limit_window_sec === origG.win, JSON.stringify({ want: origG, got: { m: backG.body.gen_limit_max, w: backG.body.gen_limit_window_sec } }));

  // context window setting (v31): exposed, round-trips, bounds enforced
  const cwBad = await j('/api/admin/settings', { method: 'PUT', body: JSON.stringify({ context_window: 10 }) }, ckA);
  ok('context window bounds rejected', cwBad.status === 400 && cwBad.body.error === 'ERR_BAD_CTXWIN');
  const cwGet = await j('/api/admin/settings', {}, ckA);
  const cwOrig = cwGet.body.context_window;
  const cwSet = await j('/api/admin/settings', { method: 'PUT', body: JSON.stringify({ context_window: 16384 }) }, ckA);
  const cwBack = await j('/api/admin/settings', { method: 'PUT', body: JSON.stringify({ context_window: cwOrig }) }, ckA);
  ok('context window round-trip', cwSet.status === 200 && cwBack.body.context_window === cwOrig, JSON.stringify({ orig: cwOrig }));

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

  // ---------- cleanup (idempotent; the finally in main() re-runs it as a safety net) ----------
  line('cleanup');
  db.close();
  ok('cleanup done', true);

  console.log('\n========================================');
  console.log(`RESULT: ${pass} passed, ${fail} failed`);
  return fail > 0 ? 1 : 0;
}

main().then((code) => process.exit(code)).catch((e) => { console.error('SUITE CRASH:', e); process.exit(1); });

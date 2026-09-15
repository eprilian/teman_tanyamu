// ============================================================
// Server-rendered share page (#11): labels come from the SAME
// i18n dictionary the browser uses (public/i18n.js), so shared
// chats read consistently. Loaded via a small VM sandbox to keep
// one source of truth instead of a copy-pasted dict.
// ============================================================
const fs = require('fs');
const path = require('path');
const vm = require('vm');

let SHARE_I18N = { en: {}, id: {} };
try {
  const src = fs.readFileSync(path.join(__dirname, '..', 'public', 'i18n.js'), 'utf8');
  const sandbox = { window: {} };
  vm.runInNewContext(src, sandbox);
  if (sandbox.window.I18N && sandbox.window.I18N.share) SHARE_I18N = sandbox.window.I18N.share;
} catch (e) {
  console.log(JSON.stringify({ level: 'warn', ev: 'share_i18n_load_failed', msg: String(e.message || e) }));
}

const escH = (s) => String(s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

function md(t) {
  let html = escH(t);
  html = html.replace(/```(\w*)\n([\s\S]*?)```/g, (m, lang, code) => `<pre><code>${code}</code></pre>`);
  html = html.replace(/`([^`\n]+)`/g, '<code>$1</code>');
  html = html.replace(/\*\*([^*\n]+)\*\*/g, '<strong>$1</strong>');
  html = html.replace(/\n/g, '<br>');
  return html;
}

function acceptLang(req) {
  const h = String(req.headers['accept-language'] || '');
  return /(^|[,;-])id\b/i.test(h) ? 'id' : 'en';
}

function shareHTML(d, lang = 'en') {
  const L = SHARE_I18N[lang] || SHARE_I18N.en;
  const msgs = d.messages.map((m) => {
    const who = m.role === 'user' ? L.you : L.ai;
    return `<div class="msg ${m.role === 'user' ? 'user' : 'ai'}"><div class="who">${escH(who)}</div><div class="body">${md(m.content)}</div></div>`;
  }).join('\n');
  return `<!DOCTYPE html><html lang="${lang}"><head><meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<meta name="robots" content="noindex">
<title>${escH(d.title)} · Teman Tanyamu</title>
<style>
:root{color-scheme:dark}
body{margin:0;background:#09090b;color:#fafafa;font:15px/1.6 -apple-system,'Segoe UI',Roboto,Helvetica,Arial,sans-serif}
.wrap{max-width:760px;margin:0 auto;padding:32px 18px 64px}
.badge{display:inline-flex;align-items:center;gap:8px;background:rgba(59,130,246,.12);border:1px solid rgba(59,130,246,.4);color:#93c5fd;border-radius:99px;padding:5px 14px;font-size:12.5px;margin-bottom:14px}
h1{font-size:21px;margin:6px 0 2px}
.sub{color:#a1a1aa;font-size:13px;margin-bottom:26px}
.msg{border:1px solid #27272a;border-radius:14px;padding:14px 16px;margin-bottom:12px;background:#101013}
.msg.user{background:rgba(59,130,246,.07);border-color:rgba(59,130,246,.25)}
.who{font-size:11px;font-weight:700;letter-spacing:.6px;text-transform:uppercase;color:#71717a;margin-bottom:6px}
.msg.user .who{color:#93c5fd}.msg.ai .who{color:#86efac}
pre{background:#18181b;border:1px solid #27272a;border-radius:10px;padding:12px;overflow-x:auto}
code{font:13px/1.5 ui-monospace,'Cascadia Mono',Consolas,monospace}
.body code:not(pre code){background:#18181b;padding:2px 6px;border-radius:5px}
.foot{margin-top:34px;color:#52525b;font-size:12.5px;text-align:center}
a{color:#60a5fa}
</style></head><body><div class="wrap">
<div class="badge">🔗 ${escH(L.badge)}</div>
<h1>${escH(d.title)}</h1>
<div class="sub">${escH(L.from)} <b>${escH(d.owner)}</b>'s Teman Tanyamu${d.model ? ' · ' + escH(d.model) : ''}</div>
${msgs}
<div class="foot">${escH(L.foot)} <a href="/">Teman Tanyamu</a> · ${escH(L.foot2)}</div>
</div></body></html>`;
}

function notFoundHTML(lang = 'en') {
  const L = SHARE_I18N[lang] || SHARE_I18N.en;
  return `<!DOCTYPE html><html lang="${lang}"><meta charset="utf-8"><meta name="robots" content="noindex"><title>Teman Tanyamu</title><body style="background:#09090b;color:#fafafa;font-family:-apple-system,'Segoe UI',sans-serif;display:grid;place-items:center;height:100vh;margin:0"><div style="text-align:center;padding:20px"><h2>${escH(L.notfound_t)}</h2><p style="color:#a1a1aa">${escH(L.notfound_s)}</p></div></body></html>`;
}

module.exports = { shareHTML, notFoundHTML, acceptLang };

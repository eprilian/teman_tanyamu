// structured single-line JSON logging (machine-parseable; captured by journalctl)
function log(level, ev, fields = {}) {
  try {
    console.log(JSON.stringify({ ts: new Date().toISOString(), level, ev, ...fields }));
  } catch (_) { /* never crash on logging */ }
}
module.exports = {
  log,
  info: (ev, f) => log('info', ev, f),
  warn: (ev, f) => log('warn', ev, f),
  error: (ev, f) => log('error', ev, f),
};

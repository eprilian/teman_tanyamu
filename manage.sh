#!/usr/bin/env bash
# ============================================================
#  Teman Tanyamu (dash_ai_me) - Management Script
#  Usage: ./manage.sh <command>
#  Commands: start|stop|restart|status|port|clear-cache|
#            enable-boot|disable-boot|logs|password|help
# ============================================================
set -euo pipefail

APP_NAME="teman-tanyamu"
APP_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
SERVICE_FILE="$HOME/.config/systemd/user/${APP_NAME}.service"
PORT_FILE="$APP_DIR/.port"

RED='\033[0;31m'; GREEN='\033[0;32m'; YELLOW='\033[1;33m'; BLUE='\033[0;34m'; NC='\033[0m'

info()  { echo -e "${GREEN}[INFO]${NC} $1"; }
warn()  { echo -e "${YELLOW}[WARN]${NC} $1"; }
err()   { echo -e "${RED}[ERROR]${NC} $1"; }

get_port() {
  if [[ -f "$PORT_FILE" ]]; then
    cat "$PORT_FILE"
  else
    echo "3000"
  fi
}

service_running() {
  systemctl --user is-active --quiet "${APP_NAME}.service" 2>/dev/null
}

ensure_service_file() {
  if [[ ! -f "$SERVICE_FILE" ]]; then
    info "Membuat systemd user service..."
    mkdir -p "$(dirname "$SERVICE_FILE")"
    cat > "$SERVICE_FILE" <<EOF
[Unit]
Description=Teman Tanyamu lightweight AI chat
After=network.target

[Service]
WorkingDirectory=${APP_DIR}
ExecStart=/usr/bin/node server.js
Restart=always
RestartSec=3

[Install]
WantedBy=default.target
EOF
    systemctl --user daemon-reload
    info "Service dibuat: $SERVICE_FILE"
  fi
}

cmd_start() {
  ensure_service_file
  if service_running; then
    warn "Service sudah berjalan."
    cmd_status
    return 0
  fi
  systemctl --user enable --now "${APP_NAME}.service" >/dev/null 2>&1 || systemctl --user start "${APP_NAME}.service"
  sleep 2
  if service_running; then
    info "Service dimulai di http://localhost:$(get_port)"
  else
    err "Gagal memulai service. Cek: ./manage.sh logs 30"
    exit 1
  fi
}

cmd_stop() {
  if ! service_running; then
    warn "Service tidak sedang berjalan."
    return 0
  fi
  systemctl --user stop "${APP_NAME}.service"
  info "Service dihentikan."
}

cmd_restart() {
  ensure_service_file
  systemctl --user restart "${APP_NAME}.service"
  sleep 2
  if service_running; then
    info "Service di-restart di http://localhost:$(get_port)"
  else
    err "Gagal restart. Cek: ./manage.sh logs 30"
    exit 1
  fi
}

cmd_status() {
  echo -e "${BLUE}=== Status ${APP_NAME} ===${NC}"
  if service_running; then
    info "Status : RUNNING"
  else
    err "Status : STOPPED"
  fi
  echo "Port   : $(get_port)"
  echo "URL    : http://localhost:$(get_port)"
  echo "Dir    : $APP_DIR"
  echo ""
  systemctl --user status "${APP_NAME}.service" --no-pager -l 2>/dev/null | grep -E "Active|Memory|Main PID" || true
}

cmd_port() {
  local new_port="${1:-}"
  if ! [[ "$new_port" =~ ^[0-9]+$ ]] || [[ "$new_port" -lt 1 || "$new_port" -gt 65535 ]]; then
    err "Usage: ./manage.sh port <1-65535>"
    exit 1
  fi
  echo "$new_port" > "$PORT_FILE"
  info "Port diset ke $new_port (tersimpan di $PORT_FILE)"
  # inject PORT env via service override drop-in
  mkdir -p "$HOME/.config/systemd/user/${APP_NAME}.service.d"
  cat > "$HOME/.config/systemd/user/${APP_NAME}.service.d/port.conf" <<EOF
[Service]
Environment=PORT=${new_port}
EOF
  systemctl --user daemon-reload
  if service_running; then
    cmd_restart
    info "Service di-restart dengan port baru."
  else
    warn "Service tidak berjalan. Jalankan './manage.sh start' untuk mulai."
  fi
  info "Akses: http://localhost:${new_port}"
}

cmd_clear_cache() {
  info "Membersihkan cache..."
  local removed=0
  # SQLite WAL/SHM (aman saat service berjalan; WAL akan di-checkpoint)
  if service_running; then
    warn "Service berjalan. Melewati pembersihan WAL (bisa merusak DB aktif)."
  else
    for f in "$APP_DIR/chat.db-shm" "$APP_DIR/chat.db-wal"; do
      if [[ -f "$f" ]]; then
        rm -f "$f"
        removed=$((removed+1))
      fi
    done
  fi
  # npm cache
  if command -v npm >/dev/null 2>&1; then
    npm cache clean --force >/dev/null 2>&1 || true
    info "npm cache dibersihkan."
  fi
  # log journal vacuum (user)
  journalctl --user --vacuum-time=3d >/dev/null 2>&1 || true
  info "Journal lama (>3 hari) dibersihkan."
  info "Selesai. Item dihapus: $removed"
}

cmd_enable_boot() {
  ensure_service_file
  systemctl --user enable "${APP_NAME}.service" >/dev/null 2>&1
  # linger agar jalan tanpa login aktif
  loginctl enable-linger "$USER" >/dev/null 2>&1 || sudo loginctl enable-linger "$USER" >/dev/null 2>&1 || true
  info "Autostart saat boot DIAKTIFKAN (linger enabled)."
}

cmd_disable_boot() {
  systemctl --user disable "${APP_NAME}.service" >/dev/null 2>&1 || true
  info "Autostart saat boot DINONAKTIFKAN."
  warn "Catatan: service masih berjalan sekarang. Gunakan './manage.sh stop' untuk menghentikan."
}

cmd_logs() {
  local n="${1:-50}"
  journalctl --user -u "${APP_NAME}.service" -n "$n" --no-pager
}

cmd_password() {
  warn "Ini akan mereset password admin ke 'admin123'. Lanjutkan? (y/N)"
  read -r answer
  if [[ "$answer" != "y" && "$answer" != "Y" ]]; then
    info "Dibatalkan."
    return 0
  fi
  if service_running; then cmd_stop; fi
  node - <<'NODEEOF'
const Database = require('better-sqlite3');
const crypto = require('crypto');
const db = new Database('chat.db');
const hash = crypto.scryptSync('admin123', 'salt-dash-ai-me', 64).toString('hex');
db.prepare('UPDATE users SET password_hash = ? WHERE username = ?').run(hash, 'admin');
db.prepare('DELETE FROM sessions WHERE user_id = (SELECT id FROM users WHERE username = ?)').run('admin');
console.log('[INFO] Password admin direset ke admin123. Semua session admin dicabut.');
NODEEOF
  cmd_start
  warn "Segera ganti password lewat UI: Pengaturan Akun -> Ganti Password"
}

cmd_test() {
  if ! service_running; then
    err "Service harus berjalan untuk regression suite: ./manage.sh start"
    exit 1
  fi
  node "$APP_DIR/test/e2e.test.js"
}

cmd_deploy() {
  local target_dir="$HOME/docker/teman_tanyamu"
  info "Memulai deployment produksi ke $target_dir..."
  
  # 1) Buat folder target jika belum ada
  mkdir -p "$target_dir"
  
  # 2) Salin file-file utama
  info "Menyalin aset kode terstabil ke folder Docker..."
  cp -rf "$APP_DIR/server.js" "$target_dir/"
  cp -rf "$APP_DIR/package.json" "$target_dir/"
  cp -rf "$APP_DIR/package-lock.json" "$target_dir/"
  cp -rf "$APP_DIR/Dockerfile" "$target_dir/"
  cp -rf "$APP_DIR/docker-compose.yml" "$target_dir/"
  cp -rf "$APP_DIR/production.env" "$target_dir/"
  
  # 3) Salin folder aset pendukung
  mkdir -p "$target_dir/public" "$target_dir/lib"
  cp -rf "$APP_DIR/public/"* "$target_dir/public/"
  cp -rf "$APP_DIR/lib/"* "$target_dir/lib/"
  
  # 4) Salin database awal hanya jika belum ada di target (agar data asli prod tidak tertimpa!)
  if [[ ! -f "$target_dir/chat.db" ]]; then
    info "Menginisialisasi database produksi awal..."
    cp -rf "$APP_DIR/chat.db" "$target_dir/"
  else
    warn "Database produksi sudah ada di $target_dir/chat.db (tidak ditimpa)."
  fi
  
  # 5) Build dan nyalakan container Docker di folder target secara diam-diam (detached)
  info "Membangun ulang container Docker produksi..."
  cd "$target_dir"
  if command -v docker-compose >/dev/null 2>&1; then
    docker-compose up -d --build
  elif docker compose version >/dev/null 2>&1; then
    docker compose up -d --build
  else
    err "Perintah docker-compose atau docker compose tidak ditemukan. Pastikan Docker sudah terinstall!"
    exit 1
  fi
  
  info "Deployment selesai! Versi produksi kini tayang secara stabil di http://localhost:3001"
  info "Tujuan Cloudflare Tunnel bisa diarahkan ke http://localhost:3001"
}

cmd_backup() {
  local dest="$APP_DIR/backups"
  mkdir -p "$dest"
  local ts file
  ts=$(date +%F-%H%M%S)
  file="$dest/chat-manual-$ts.db"
  info "Mencadangkan chat.db -> $file"
  node -e '
    const Database = require("better-sqlite3");
    const db = new Database("chat.db", { readonly: false });
    db.backup(process.argv[1]).then(() => { console.log("[INFO] Backup OK"); db.close(); })
      .catch((e) => { console.error("[ERROR] " + e.message); process.exit(1); });
  ' "$file" || exit 1
  # prune manual+auto backups older than 30 days
  find "$dest" -name 'chat-*.db' -mtime +30 -print -delete | sed 's/^/[INFO] hapus lama: /' || true
  ls -1t "$dest" | head -3 | sed 's/^/[INFO] terbaru: /'
}

cmd_restore() {
  local src="${1:-}"
  if [[ -z "$src" ]]; then
    err "Usage: ./manage.sh restore <path-backup.db>"
    ls -1t "$APP_DIR/backups" 2>/dev/null | head -5 | sed 's/^/  tersedia: /'
    exit 1
  fi
  [[ -f "$src" ]] || { err "File tidak ditemukan: $src"; exit 1; }
  warn "RESTORE akan MENIMPA chat.db saat ini dengan: $src"
  warn "Backup kondisi sekarang dulu? (Y/n)"
  read -r ans
  [[ "$ans" == "n" || "$ans" == "N" ]] || cmd_backup
  if service_running; then cmd_stop; fi
  cp -a "$APP_DIR/chat.db" "$APP_DIR/chat.db.pre-restore"
  cp -a "$src" "$APP_DIR/chat.db"
  rm -f "$APP_DIR/chat.db-wal" "$APP_DIR/chat.db-shm"
  node -e 'const D=require("better-sqlite3");const db=new D("chat.db");const n=db.prepare("SELECT COUNT(*) c FROM chats").get().c;console.log("[INFO] Restore OK. Validasi: " + n + " chats.");db.close();'
  cmd_start
}

cmd_vacuum() {
  if service_running; then
    warn "Service berjalan — vacuum tetap aman (online), tapi mungkin lebih lambat."
  fi
  local before after
  before=$(stat -c%s "$APP_DIR/chat.db" 2>/dev/null || stat -f%z "$APP_DIR/chat.db")
  node -e 'const D=require("better-sqlite3");new D("chat.db").exec("VACUUM;");console.log("[INFO] VACUUM selesai.");'
  after=$(stat -c%s "$APP_DIR/chat.db" 2>/dev/null || stat -f%z "$APP_DIR/chat.db")
  info "Ukuran DB: $before -> $after bytes ($(( (before-after)/1024 )) KiB dihemat)"
}

cmd_help() {
  echo -e "${BLUE}Teman Tanyamu Management Script${NC}"
  echo ""
  echo "Usage: ./manage.sh <command> [args]"
  echo ""
  echo "Commands:"
  echo "  start            Mulai service"
  echo "  stop             Hentikan service"
  echo "  restart          Restart service"
  echo "  status           Lihat status service"
  echo "  port <1-65535>   Ubah port (persisten, auto-restart)"
  echo "  backup           Cadangkan chat.db ke ./backups (retensi 30 hari)"
  echo "  restore <file>   Pulihkan chat.db dari file backup (auto-backup dulu)"
  echo "  vacuum           Kompaksi database (hemat ruang)"
  echo "  clear-cache      Bersihkan SQLite WAL + npm cache + journal lama"
  echo "  enable-boot      Aktifkan autostart saat boot"
  echo "  disable-boot     Nonaktifkan autostart saat boot"
  echo "  logs [n]         Lihat n baris log terakhir (default 50)"
  echo "  password         Reset password admin ke admin123"
  echo "  test             Jalankan regression suite"
  echo "  deploy           Deploy versi produksi stabil ke Docker (port 3001)"
  echo "  help             Tampilkan bantuan ini"
}

# ---- main dispatcher ----
case "${1:-help}" in
  start)        cmd_start ;;
  stop)         cmd_stop ;;
  restart)      cmd_restart ;;
  status)       cmd_status ;;
  port)         cmd_port "${2:-}" ;;
  clear-cache)  cmd_clear_cache ;;
  enable-boot)  cmd_enable_boot ;;
  disable-boot) cmd_disable_boot ;;
  logs)         cmd_logs "${2:-50}" ;;
  password)     cmd_password ;;
  backup)       cmd_backup ;;
  restore)      cmd_restore "${2:-}" ;;
  vacuum)       cmd_vacuum ;;
  test)         cmd_test ;;
  deploy)       cmd_deploy ;;
  help|--help|-h) cmd_help ;;
  *)
    err "Perintah tidak dikenal: $1"
    cmd_help
    exit 1
    ;;
esac

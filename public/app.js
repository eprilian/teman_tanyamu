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
const I18N = {
  en: {
    pwreset_title: 'Reset password', pwreset_label: 'New password', pwreset_hint: 'At least 4 characters', pwreset_ok: 'Reset',
    warn_del_title: 'Delete user?',
    warn_del_text: 'USER and all their chats, messages and usage data are permanently removed. This cannot be undone.',
    admin_del_user: 'Delete user',
    warn_deact_title: 'Deactivate account?', warn_deact_text: 'USER will no longer be able to sign in until reactivated. Existing chats are kept.',
    warn_act_title: 'Reactivate account?', warn_act_text: 'USER will be able to sign in again.',
    warn_confirm: 'Confirm', warn_cancel: 'Cancel',
    stat_reset_usage: 'Reset usage stats', stat_reset_confirm: 'This erases the usage counters of ALL users for ALL days (the statistics dashboard will be empty). Chats and accounts are not touched.',
    theme_toggle: 'Toggle theme',
    theme_dark: 'Dark',
    theme_light: 'Light',
    pin_chat: 'Pin chat',
    unpin_chat: 'Unpin',
    archive_chat: 'Archive chat',
    unarchive_chat: 'Unarchive',
    fork_chat: 'Fork chat',
    tag_chat: 'Tag',
    tag_ph: 'e.g. coding',
    tag_save: 'Set tag',
    archived_section: 'Archived',
    show_archived: 'Archived',
    edit_msg: 'Edit',
    edit_save: 'Send',
    edit_cancel: 'Cancel',
    delete_msg: 'Delete & regenerate',
    stat_purge_now: 'Purge guest chats now',
    stat_purged: 'Guest chats purged',
    stat_title: 'Usage Statistics',
    stat_sub: (n) => `Last ${n} days across all users.`,
    stat_days: 'Period (days)',
    stat_reqs: 'Requests',
    stat_tok: 'Tokens',
    stat_prompt: 'Prompt',
    stat_completion: 'Completion',
    stat_active_users: 'Active users',
    stat_guest_sessions: 'Guest sessions',
    stat_per_day: 'Requests & tokens per day',
    stat_by_model: 'Tokens by model',
    stat_by_user: 'Top users by tokens',
    stat_no_data: 'No usage data in this period.',
    guest_purge_hour: 'Auto-delete guest chats daily at',
    guest_purge_sub: 'Hour (0-23) in server local time',
    guest_purged_toast: 'Guest cleanup settings saved',
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
    model_lock_short: 'Locked',
    model_locked_hint: 'Ask an admin to set your model, or it follows the global default.',
    aria_model: 'Select model',
    temp_on: 'Temporary Chat ON. History will not be saved.',
    temp_off: 'Temporary Chat OFF. History is saved again.',
    temp_badge: 'Temporary',
    temp_label: 'Temp',
    lean_label: 'Eco',
    lean_on: 'Eco ON: answers without history (big token saving).',
    lean_off: 'Eco OFF: context history is used again.',
    lean_badge: 'Eco · no history',
    lean_temp_on: 'Eco works in Temp Chat too',
    lean_temp_off: 'Eco disabled while Temp Chat is ON',
    memory_title: 'Memory About You',
    memory_sub: 'Facts the AI remembers across all chats. Auto-updated; you can edit.',
    memory_empty: 'No memory yet. It builds itself as you chat.',
    memory_add_ph: 'e.g. user suka strawberry',
    memory_clear: 'Clear all memory',
    memory_cleared: 'Memory cleared',
    memory_saved: 'Memory updated',
    memory_del: 'Delete fact',
    usage_tooltip: (u) => `tokens: ${u.total} (prompt ${u.prompt}, reply ${u.completion})`,
    token_title: 'Token Saver',
    token_sub: 'Context budget, reply cap & timeout for all chats.',
    hist_budget: 'History budget (tokens)',
    max_reply: 'Max reply (tokens)',
    timeout_lbl: 'Timeout (seconds)',
    ai_avatar_title: 'AI Assistant Avatar',
    ai_avatar_sub: 'Set or reset the assistant avatar shown in chat (applies to everyone).',
    ai_avatar_pick: 'Choose Image',
    ai_avatar_reset: 'Reset to Default',
    memory_enabled_lbl: 'Cross-chat memory',
    memory_enabled_sub: 'Share learned facts across all chats',
    token_saved: 'Token saver settings saved',
    token_reset: 'Token saver reset to defaults',
    router_title: 'Model Connection',
    router_sub: 'OpenAI-compatible base URL & API key for all providers.',
    router_base_lbl: 'Base URL',
    router_key_lbl: 'API Key',
    router_key_ph: (m) => `Saved: ${m} — leave empty to keep`,
    router_key_ph_none: 'e.g. sk-abc123...',
    router_saved: 'Gateway settings saved',
    router_testing: 'Testing…',
    router_test_ok: (ms, n) => `Connected in ${ms} ms — ${n} models found`,
    router_test_bad: (s) => `Reached server, but HTTP ${s}. Check the base URL path & key.`,
    router_status_ok: (src) => `Configured (${src})`,
    router_status_bad: 'Not configured — chat is disabled until a valid key & URL are set',
    router_source_database: 'dashboard',
    router_source_env: 'env',
    router_source_none: 'none',
    router_test_btn: 'Test',
    router_save_btn: 'Save',
    guest_btn: 'Try as guest',
    guest_title: 'Guest access ended',
    guest_text_chats: 'You have used all guest messages. Sign in to keep chatting — your chats stay on this device until you log out.',
    guest_text_time: 'The guest session time is up. Sign in to continue the conversation.',
    guest_later: 'Later',
    guest_login_now: 'Sign in now',
    guest_quota: (u, m) => `Guest — ${u}/${m} messages`,
    guest_time: (mm) => ` · ${mm} left`,
    guest_saved: 'Guest settings saved',
    guest_reset_done: 'Guest settings reset to defaults',
    guest_enabled_lbl: 'Allow guest access',
    guest_enabled_sub: 'Show "Try as guest" button on login page',
    guest_max_chats_lbl: 'Max messages per guest',
    guest_minutes_lbl: 'Session time (minutes)',
    guest_admin_title: 'Guest Mode',
    guest_ended_toast: 'Guest limit reached — please sign in',
    reset_btn: 'Reset',
    today_usage: (t, p, c) => `today ${t} tokens (prompt ${p} / reply ${c})`,
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
    quota_admin_role: 'Admin',
    quota_admin_unlimited: 'unlimited',
    quota_user: (u, m) => `Quota: ${u}/${m} today`,
    quota_chip_model: 'Model',
    rename_title: 'Rename chat',
    rename_label: 'Name',
    rename_save: 'Save',
    quota_edit_title: 'Edit daily quota',
    quota_edit_label: 'Chats per day (1 - 999999)',
    quota_saved: 'Quota updated',
    combo_search_ph: 'Search models...',
    combo_no_results: 'No models found',
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
    admin_reset_quota: 'Reset Quota',
    admin_edit_quota: 'Edit Quota',
    admin_quota_reset_ok: 'Daily quota reset',
    admin_reset_all: 'Reset All Usage',
    admin_reset_all_ok: 'All usage reset',
    admin_reset_all_confirm: 'Reset all usage for every user? This cannot be undone.',
    admin_global_tag: 'Global default',
    admin_users_title: 'Users List',
    admin_users_sub: 'Manage user accounts, roles & model access.',
    admin_col_user: 'User',
    admin_col_username: 'Username',
    admin_col_avatar: 'Avatar',
    admin_col_role: 'Role',
    admin_col_status: 'Status',
    admin_col_model: 'Model',
    admin_col_usage: 'Usage',
    admin_col_actions: 'Actions',
    admin_role_admin: 'Admin',
    admin_role_user: 'User',
    admin_deactivate: 'Deactivate',
    admin_activate: 'Activate',
    admin_self_deactivate: 'You cannot deactivate your own active admin account',
    admin_avatar_prompt: 'Avatar: type "upload" to change or "reset" to remove',
    admin_avatar_reset: 'Avatar reset',
    admin_avatar_upload: 'Choose image for this user avatar',
    admin_avatar_uploaded: 'Avatar updated',
    admin_avatar_title: 'Avatar Actions',
    admin_avatar_upload_label: 'Upload Image',
    admin_avatar_reset_label: 'Reset to Default',
    admin_avatar_cancel: 'Cancel',
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
    wp_default: 'Default',
    wp_senja: 'Blue Dusk',
    wp_hutan: 'Dark Forest',
    wp_ungu: 'Night Purple',
    wp_marun: 'Maroon',
    wp_abu: 'Solid Gray',
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
    pwreset_title: 'Reset kata sandi', pwreset_label: 'Kata sandi baru', pwreset_hint: 'Minimal 4 karakter', pwreset_ok: 'Reset',
    warn_del_title: 'Hapus user?',
    warn_del_text: 'USER beserta semua chat, pesan, dan data penggunaannya hilang permanen. Tidak bisa dibatalkan.',
    admin_del_user: 'Hapus user',
    warn_deact_title: 'Nonaktifkan akun?', warn_deact_text: 'USER tidak akan bisa masuk sampai diaktifkan lagi. Chat yang ada tetap tersimpan.',
    warn_act_title: 'Aktifkan kembali akun?', warn_act_text: 'USER akan bisa masuk lagi seperti biasa.',
    warn_confirm: 'Ya, lanjutkan', warn_cancel: 'Batal',
    stat_reset_usage: 'Reset statistik penggunaan', stat_reset_confirm: 'Ini menghapus counter penggunaan SEMUA user untuk SEMUA hari (dashboard statistik akan kosong). Chat dan akun tidak tersentuh.',
    theme_toggle: 'Ganti tema',
    theme_dark: 'Gelap',
    theme_light: 'Terang',
    pin_chat: 'Sematkan chat',
    unpin_chat: 'Lepas sematan',
    archive_chat: 'Arsipkan chat',
    unarchive_chat: 'Keluarkan dari arsip',
    fork_chat: 'Cabang chat (fork)',
    tag_chat: 'Tag',
    tag_ph: 'mis. coding',
    tag_save: 'Pasang tag',
    archived_section: 'Diarsipkan',
    show_archived: 'Arsip',
    edit_msg: 'Ubah',
    edit_save: 'Kirim',
    edit_cancel: 'Batal',
    delete_msg: 'Hapus & buat ulang',
    stat_purge_now: 'Hapus chat tamu sekarang',
    stat_purged: 'Chat tamu dihapus',
    stat_title: 'Statistik Penggunaan',
    stat_sub: (n) => `Terakhir ${n} hari untuk semua user.`,
    stat_days: 'Periode (hari)',
    stat_reqs: 'Permintaan',
    stat_tok: 'Token',
    stat_prompt: 'Prompt',
    stat_completion: 'Completion',
    stat_active_users: 'User aktif',
    stat_guest_sessions: 'Sesi tamu',
    stat_per_day: 'Permintaan & token per hari',
    stat_by_model: 'Token per model',
    stat_by_user: 'Top user by token',
    stat_no_data: 'Belum ada data pada periode ini.',
    guest_purge_hour: 'Hapus chat tamu otomatis tiap hari pukul',
    guest_purge_sub: 'Jam (0-23) waktu lokal server',
    guest_purged_toast: 'Pengaturan hapus tamu tersimpan',
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
    model_lock_short: 'Terkunci',
    model_locked_hint: 'Minta admin memilihkan model, atau ikuti model default global.',
    aria_model: 'Pilih model',
    temp_on: 'Chat Sementara AKTIF. Riwayat tidak disimpan.',
    temp_off: 'Chat Sementara MATI. Riwayat disimpan kembali.',
    temp_badge: 'Sementara',
    temp_label: 'Sementara',
    lean_label: 'Eco',
    lean_on: 'Eco AKTIF: jawab tanpa riwayat (hemat token besar).',
    lean_off: 'Eco MATI: konteks riwayat dipakai lagi.',
    lean_badge: 'Eco · tanpa riwayat',
    lean_temp_on: 'Eco juga aktif di Chat Sementara',
    lean_temp_off: 'Eco nonaktif saat Chat Sementara AKTIF',
    memory_title: 'Memori Tentang Kamu',
    memory_sub: 'Fakta yang diingat AI di semua chat. Terisi otomatis; bisa kamu edit.',
    memory_empty: 'Belum ada memori. Terisi sendiri sambil ngobrol.',
    memory_add_ph: 'misal: user suka strawberry',
    memory_clear: 'Hapus semua memori',
    memory_cleared: 'Memori dihapus',
    memory_saved: 'Memori diperbarui',
    memory_del: 'Hapus fakta',
    usage_tooltip: (u) => `token: ${u.total} (prompt ${u.prompt}, balasan ${u.completion})`,
    token_title: 'Penghemat Token',
    token_sub: 'Budget konteks, batas balasan & timeout untuk semua chat.',
    hist_budget: 'Budget riwayat (token)',
    max_reply: 'Maks balasan (token)',
    timeout_lbl: 'Timeout (detik)',
    ai_avatar_title: 'Avatar Asisten AI',
    ai_avatar_sub: 'Atur/reset avatar asisten yang tampil di chat (berlaku untuk semua).',
    ai_avatar_pick: 'Pilih Gambar',
    ai_avatar_reset: 'Reset ke Default',
    memory_enabled_lbl: 'Memori lintas chat',
    memory_enabled_sub: 'Bagikan fakta yang dipelajari ke semua chat',
    token_saved: 'Pengaturan penghemat token disimpan',
    token_reset: 'Penghemat token direset ke bawaan',
    router_title: 'Koneksi Model',
    router_sub: 'Base URL & API key kompatibel OpenAI untuk semua provider.',
    router_base_lbl: 'Base URL',
    router_key_lbl: 'API Key',
    router_key_ph: (m) => `Tersimpan: ${m} — kosongkan jika tidak diganti`,
    router_key_ph_none: 'mis. sk-abc123...',
    router_saved: 'Pengaturan gateway disimpan',
    router_testing: 'Menguji…',
    router_test_ok: (ms, n) => `Terhubung dalam ${ms} ms — ${n} model ditemukan`,
    router_test_bad: (s) => `Server terjangkau, tapi HTTP ${s}. Cek path base URL & key.`,
    router_status_ok: (src) => `Terkonfigurasi (${src})`,
    router_status_bad: 'Belum dikonfigurasi — chat dinonaktifkan sampai key & URL valid diisi',
    router_source_database: 'dashboard',
    router_source_env: 'env',
    router_source_none: 'kosong',
    router_test_btn: 'Uji',
    router_save_btn: 'Simpan',
    guest_btn: 'Coba sebagai tamu',
    guest_title: 'Akses tamu berakhir',
    guest_text_chats: 'Kuota pesan tamu sudah habis. Masuk untuk lanjut ngobrol — chat tetap tersimpan di perangkat ini sampai kamu logout.',
    guest_text_time: 'Waktu sesi tamu sudah habis. Masuk untuk melanjutkan percakapan.',
    guest_later: 'Nanti',
    guest_login_now: 'Masuk sekarang',
    guest_quota: (u, m) => `Tamu — ${u}/${m} pesan`,
    guest_time: (mm) => ` · sisa ${mm}`,
    guest_saved: 'Pengaturan tamu disimpan',
    guest_reset_done: 'Pengaturan tamu direset ke bawaan',
    guest_enabled_lbl: 'Izinkan akses tamu',
    guest_enabled_sub: 'Tampilkan tombol "Coba sebagai tamu" di halaman login',
    guest_max_chats_lbl: 'Maks pesan per tamu',
    guest_minutes_lbl: 'Durasi sesi (menit)',
    guest_admin_title: 'Mode Tamu',
    guest_ended_toast: 'Kuota tamu habis — silakan masuk',
    reset_btn: 'Atur Ulang',
    today_usage: (t, p, c) => `hari ini ${t} token (prompt ${p} / balasan ${c})`,
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
    quota_admin_role: 'Admin',
    quota_admin_unlimited: 'tanpa batas',
    quota_user: (u, m) => `Kuota: ${u}/${m} hari ini`,
    quota_chip_model: 'Model',
    rename_title: 'Ganti nama chat',
    rename_label: 'Nama',
    rename_save: 'Simpan',
    quota_edit_title: 'Edit kuota harian',
    quota_edit_label: 'Chat per hari (1 - 999999)',
    quota_saved: 'Kuota diperbarui',
    combo_search_ph: 'Cari model...',
    combo_no_results: 'Model tidak ditemukan',
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
    admin_reset_quota: 'Reset Kuota',
    admin_edit_quota: 'Edit Kuota',
    admin_quota_reset_ok: 'Kuota harian direset',
    admin_reset_all: 'Reset Semua Pemakaian',
    admin_reset_all_ok: 'Semua pemakaian direset',
    admin_reset_all_confirm: 'Reset semua pemakaian untuk semua user? Tindakan ini tidak bisa dibatalkan.',
    admin_global_tag: 'Default global',
    admin_users_title: 'Daftar Pengguna',
    admin_users_sub: 'Kelola akun pengguna, peran & akses model.',
    admin_col_user: 'Pengguna',
    admin_col_username: 'Username',
    admin_col_avatar: 'Avatar',
    admin_col_role: 'Peran',
    admin_col_status: 'Status',
    admin_col_model: 'Model',
    admin_col_usage: 'Pemakaian',
    admin_col_actions: 'Aksi',
    admin_role_admin: 'Admin',
    admin_role_user: 'User',
    admin_deactivate: 'Nonaktifkan',
    admin_activate: 'Aktifkan',
    admin_self_deactivate: 'Kamu tidak bisa menonaktifkan akun admin sendiri yang aktif',
    admin_avatar_prompt: 'Avatar: ketik "upload" untuk ganti atau "reset" untuk hapus',
    admin_avatar_reset: 'Avatar direset',
    admin_avatar_upload: 'Pilih gambar untuk avatar user ini',
    admin_avatar_uploaded: 'Avatar diperbarui',
    admin_avatar_title: 'Aksi Avatar',
    admin_avatar_upload_label: 'Unggah Gambar',
    admin_avatar_reset_label: 'Reset ke Default',
    admin_avatar_cancel: 'Batal',
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
    wp_default: 'Default',
    wp_senja: 'Biru Senja',
    wp_hutan: 'Hutan Gelap',
    wp_ungu: 'Ungu Malam',
    wp_marun: 'Marun',
    wp_abu: 'Abu Solid',
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
  ERR_ROUTER_DOWN: { en: 'Cannot reach the model server. Check the gateway (9Router) and base URL in Admin Dashboard.', id: 'Server model tidak bisa dihubungi. Cek gateway (9Router) dan Base URL di Dashboard Admin.' },
  ERR_ROUTER_NOT_CONFIGURED: { en: 'Model gateway not configured yet. Ask the admin to set base URL & API key in Admin Dashboard.', id: 'Gateway model belum dikonfigurasi. Minta admin mengisi Base URL & API key di Dashboard Admin.' },
  ERR_BASE_REQUIRED: { en: 'Base URL is required', id: 'Base URL wajib diisi' },
  ERR_BASE_INVALID: { en: 'Invalid URL — use http:// or https:// with a valid address', id: 'URL tidak valid — gunakan http:// atau https:// dengan alamat yang benar' },
  ERR_BASE_BLOCKED_HOST: { en: 'That host is not allowed (metadata/link-local addresses are blocked)', id: 'Host itu tidak diizinkan (alamat metadata/link-local diblokir)' },
  ERR_GUEST_CHATS: { en: 'Guest message limit reached. Sign in to continue.', id: 'Kuota pesan tamu habis. Masuk untuk melanjutkan.' },
  ERR_GUEST_TIME: { en: 'Guest session expired. Sign in to continue.', id: 'Sesi tamu berakhir. Masuk untuk melanjutkan.' },
  ERR_GUEST_DISABLED: { en: 'Guest access is disabled', id: 'Akses tamu sedang dinonaktifkan' },
  ERR_GUEST_NOPE: { en: 'This feature needs a real account. Sign in first.', id: 'Fitur ini butuh akun asli. Masuk dulu, ya.' },
  ERR_BAD_GUEST_CHATS: { en: 'Guest max messages must be 1–200', id: 'Maks pesan tamu harus 1–200' },
  ERR_BAD_GUEST_MINUTES: { en: 'Guest session time must be 1–720 minutes', id: 'Durasi sesi tamu harus 1–720 menit' },
  ERR_INACTIVE: { en: 'Account disabled. Contact admin.', id: 'Akun dinonaktifkan. Hubungi admin.' },
  ERR_PW_SHORT: { en: 'Password must be at least 4 characters', id: 'Password minimal 4 karakter' },
  ERR_OLD_PW: { en: 'Old password is wrong', id: 'Password lama salah' },
  ERR_AVATAR_FORMAT: { en: 'Avatar must be an image', id: 'Avatar harus berupa gambar' },
  ERR_TOO_BIG: { en: 'Image too large (max ~300KB)', id: 'Gambar terlalu besar (maks ~300KB)' },
  ERR_BAD_TIMEOUT: { en: 'Timeout must be 30–600 seconds', id: 'Timeout harus 30–600 detik' },
  ERR_WALLPAPER_FORMAT: { en: 'Wallpaper format not supported', id: 'Format wallpaper tidak didukung' },
  ERR_NOT_FOUND: { en: 'Not found', id: 'Tidak ditemukan' },
  ERR_TIMEOUT: { en: 'The model/provider took too long. Check that the model & provider are online and your connection is stable, then try again.', id: 'Model/provider terlalu lama merespons. Pastikan model & provider online dan koneksimu stabil, lalu coba lagi.' },
  ERR_SELF_DELETE: { en: "Cannot delete yourself", id: 'Tidak bisa hapus diri sendiri' },
  ERR_SELF_DEACTIVATE: { en: 'Cannot deactivate yourself', id: 'Tidak bisa menonaktifkan diri sendiri' },
  ERR_USERNAME_TAKEN: { en: 'Username already taken', id: 'Username sudah dipakai' },
  ERR_BAD_BODY: { en: 'Invalid request', id: 'Request tidak valid' },
  ERR_MODEL_LOCKED: { en: 'Only admins can change the model', id: 'Hanya admin yang dapat mengganti model' },
  ERR_QUOTA: { en: 'Daily quota reached. Try again tomorrow.', id: 'Kuota harian habis. Coba lagi besok.' },
  ERR_RATE_LIMITED: { en: 'Too many attempts. Try again in', id: 'Terlalu banyak percobaan. Coba lagi dalam' },
  ERR_RATE_LIMITED_SEC: { en: 'seconds.', id: 'detik.' },
  ERR_BAD_PURGE_HOUR: { en: 'Purge hour must be 0-23', id: 'Jam hapus harus 0-23' },
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
    setT('#admin-stat-sub', t('stat_sub', Number($('#stat-days') ? $('#stat-days').value : 30)));
    setT('#lbl-stat-days', t('stat_days'));
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
    setT('#lbl-guest-enabled', t('guest_enabled_lbl'));
    setT('#lbl-guest-enabled-sub', t('guest_enabled_sub'));
    setT('label[for="set-guest-chats"]', t('guest_max_chats_lbl'));
    setT('label[for="set-guest-minutes"]', t('guest_minutes_lbl'));
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
  refreshGuestButton();
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
  renderSideAvatar();
  updateQuota();
  syncGuestState();
  if (currentUser.role === 'admin') $('#btn-admin').classList.add('show');
  await loadModels();
  await loadChats();
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
      <span class="title">${c.pinned ? '<span class="pin-mark"><svg width="10" height="10" viewBox="0 0 24 24" fill="currentColor"><path d="M14 4l6 6-3.5 1-3.5 5-2-2-5 3.5L3 22l1-1 1-1 4.5-3.5-2-2 5-3.5L16 7z"/></svg></span>' : ''}${esc(c.title)}${c.tag ? ' <span class="chat-tag">#' + esc(c.tag) + '</span>' : ''}</span>
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
      : svg('<rect x="2" y="3" width="20" height="5" rx="1"/><path d="M4 8v11a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8"/><line x1="10" y1="12" x2="14" y2="12"/>')]
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
  if (item) await openChat(Number(item.dataset.id));
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
  chatLean = !!(row && row.lean);
  applyLeanUI();
  renderMessages(chat.messages);
  await loadChats();
  closeMobileSidebar();
}

let lastRendered = [];
function renderMessages(messages) {
  lastRendered = messages || [];
  const box = $('#messages');
  if (!lastRendered.length) { box.innerHTML = emptyStateHTML(); return; }
  let lastUserId = null;
  const parts = lastRendered.map(m => {
    if (m.role === 'user') lastUserId = m.id;
    return messageHTML(m.role, m.content, false, m.id, lastUserId);
  });
  box.innerHTML = `<div class="msg-col">${parts.join('')}</div>`;
  box.scrollTop = box.scrollHeight;
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
      if (b) b.innerHTML = `<span style="color:var(--danger)">${esc(t('err_generic'))}: ${esc(msg)}</span>`;
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
      if (b && !b.querySelector('.typing-dots')) b.innerHTML = `<span style="color:var(--danger)">${esc(t('err_generic'))}: ${esc(msg)}</span>`;
    }
  } finally {
    streaming = false;
    btnSend.classList.remove('stop');
    btnSend.innerHTML = SEND_ICON;
    abortCtrl = null;
    await loadChats();
    // rebuild bubbles from server truth so they carry message ids (edit/truncate actions)
    try {
      const chat = await (await fetch(`/api/chats/${currentChatId}`)).json();
      if (chat.messages && chat.messages.length) {
        renderMessages(chat.messages);
      }
    } catch (_) {}
    const me = await (await fetch('/api/me')).json();
    if (me.username) { currentUser = me; updateQuota(); afterGuestRefresh(); }
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
$('#memory-clear-btn').addEventListener('click', async () => {
  await fetch('/api/memory/clear', { method: 'POST' });
  toast(t('memory_cleared'), 'success');
  await renderMemoryFacts();
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
  $('#modal-admin').classList.add('active');
  loadRouterConfig();
  await loadAdminPanel();
});
$('#admin-close').addEventListener('click', () => $('#modal-admin').classList.remove('active'));

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
  $('#set-max-reply').value = settings.max_reply_tokens || 1024;
  $('#set-timeout').value = settings.timeout_ms || 120;
  $('#set-memory-enabled').checked = !!settings.memory_enabled;
  $('#set-guest-enabled').checked = !!settings.guest_enabled;
  $('#set-guest-chats').value = settings.guest_max_chats || 10;
  $('#set-guest-minutes').value = settings.guest_max_minutes || 5;
  $('#set-guest-purge').value = settings.guest_purge_hour ?? 0;
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
          <button class="btn-ghost admin-action" data-resetquota="${u.id}">${esc(t('admin_reset_quota'))}</button>
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
      timeout_ms: Number($('#set-timeout').value)
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
  const days = $('#stat-days').value || 30;
  const sub = $('#admin-stat-sub'); if (sub) sub.textContent = t('stat_sub', Number(days));
  try { statCache = await (await fetch('/api/admin/stats?days=' + days)).json(); } catch (_) { statCache = null; }
  renderAdminStats();
}
$('#stat-days').addEventListener('change', () => loadAdminStats());
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
$('#stat-purge-now').addEventListener('click', async () => {
  try {
    const r = await fetch('/api/admin/guest-purge-now', { method: 'POST' });
    if (!r.ok) throw new Error();
    const d = await r.json();
    toast(`${t('stat_purged')} (${d.cleared})`, 'success');
    loadAdminStats();
  } catch (_) { toast(t('err_generic'), 'error'); }
});
function fmtK(n) { n = Number(n) || 0; return n >= 1e6 ? (n/1e6).toFixed(1)+'M' : n >= 1e3 ? (n/1e3).toFixed(1)+'k' : String(n); }
function renderAdminStats() {
  const cards = $('#stat-cards'), charts = $('#stat-chart'), models = $('#stat-models'), users = $('#stat-users');
  if (!cards || !charts || !statCache) return;
  const tt = statCache.totals || {};
  cards.innerHTML = [
    [t('stat_reqs'), fmtK(tt.reqs)],
    [t('stat_tok'), fmtK(tt.tok)],
    [t('stat_prompt'), fmtK(tt.p)],
    [t('stat_completion'), fmtK(tt.c)],
    [t('stat_active_users'), statCache.active_users],
    [t('stat_guest_sessions'), statCache.guest_sessions],
  ].map(([k, v]) => `<div class="stat-card"><span class="sv">${esc(String(v))}</span><span class="sk">${esc(k)}</span></div>`).join('');
  renderStatChart();
  const mx = (statCache.by_model || []).reduce((a, m) => Math.max(a, m.tok || 0), 1);
  models.innerHTML = '<div class="stat-list-title">' + esc(t('stat_by_model')) + '</div>' +
    (statCache.by_model || []).map(m => `<div class="stat-bar-row"><span class="sb-name" title="${esc(m.model)}">${esc(m.model)}</span><span class="sb-track"><span class="sb-fill" style="width:${Math.max(2, (m.tok || 0) / mx * 100)}%"></span></span><span class="sb-val">${fmtK(m.tok)}</span></div>`).join('')
    || '';
  const ux = (statCache.by_user || []).reduce((a, m) => Math.max(a, m.tok || 0), 1);
  users.innerHTML = '<div class="stat-list-title">' + esc(t('stat_by_user')) + '</div>' +
    (statCache.by_user || []).map(u => `<div class="stat-bar-row"><span class="sb-name">${esc(u.username)}</span><span class="sb-track"><span class="sb-fill u" style="width:${Math.max(2, (u.tok || 0) / ux * 100)}%"></span></span><span class="sb-val">${fmtK(u.tok)} · ${u.reqs}×</span></div>`).join('');
  if (!(statCache.per_day || []).length && !(statCache.by_model || []).length) {
    models.innerHTML = '<div class="stat-list-title">' + esc(t('stat_no_data')) + '</div>';
  }
}
function renderStatChart() {
  const cv = $('#stat-chart');
  if (!cv || !statCache) return;
  const cs = getComputedStyle(document.body);
  const days = statCache.days || 30;
  const byDate = {}; (statCache.per_day || []).forEach(r => { byDate[r.date] = r; });
  const series = [];
  const today = new Date();
  for (let i = days - 1; i >= 0; i--) {
    const d = new Date(today); d.setDate(d.getDate() - i);
    const key = d.toISOString().slice(0, 10);
    const row = byDate[key];
    series.push({ date: key, reqs: row ? Number(row.reqs) || 0 : 0, tok: row ? Number(row.tok) || 0 : 0 });
  }
  const dpr = window.devicePixelRatio || 1;
  const W = cv.clientWidth || 320, H = 120;
  cv.width = W * dpr; cv.height = H * dpr;
  const g = cv.getContext('2d');
  g.setTransform(dpr, 0, 0, dpr, 0, 0);
  g.clearRect(0, 0, W, H);
  const maxR = Math.max(1, ...series.map(s => s.reqs));
  const padB = 16, padT = 6;
  const bw = Math.max(2, (W - 8) / days - 3);
  // grid baseline
  g.strokeStyle = cs.getPropertyValue('--border') || '#333';
  g.beginPath(); g.moveTo(0, H - padB + 0.5); g.lineTo(W, H - padB + 0.5); g.stroke();
  const colA = cs.getPropertyValue('--accent').trim() || '#3b82f6';
  const colT = cs.getPropertyValue('--success').trim() || '#22c55e';
  series.forEach((s, i) => {
    const x = 4 + i * ((W - 8) / days);
    const hR = Math.round((s.reqs / maxR) * (H - padB - padT));
    g.fillStyle = colA;
    g.fillRect(x, H - padB - hR, bw, hR);
    if (s.tok > 0) {
      const maxT = Math.max(1, ...series.map(q => q.tok));
      g.fillStyle = colT + 'AA';
      const x2 = x + bw + 1;
      if (x2 + 2 < W) g.fillRect(x2, H - padB - Math.round((s.tok / maxT) * (H - padB - padT)), 2, Math.max(1, Math.round((s.tok / maxT) * (H - padB - padT))));
    }
  });
  g.fillStyle = cs.getPropertyValue('--text-3') || '#777';
  g.font = '10px Inter, sans-serif';
  g.fillText(t('stat_reqs') + ' ▮ ' + t('stat_tok') + ' ▮', 2, H - 3);
}

$('#guest-reset').addEventListener('click', async () => {
  $('#set-guest-enabled').checked = true;
  $('#set-guest-chats').value = 10;
  $('#set-guest-minutes').value = 5;
  $('#guest-save').dispatchEvent(new MouseEvent('click', { bubbles: false }));
});

$('#token-reset').addEventListener('click', async () => {
  const body = {
    history_token_budget: 1600,
    max_reply_tokens: 1024,
    timeout_ms: 120,
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
  $('#set-max-reply').value = 1024;
  $('#set-timeout').value = 120;
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
  $('#modal-settings').classList.add('active');
  $('#settings-username').textContent = t('settings_as', currentUser.username);
  renderSettingsAvatar();
  renderWallpaperPresets();
  renderMemoryFacts();
});

$('#settings-close').addEventListener('click', () => $('#modal-settings').classList.remove('active'));

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

  if (user) await enterApp();
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

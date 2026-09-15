# Teman Tanyamu (dash_ai_me)

> Lightweight self-hosted AI chat web app. An Open WebUI alternative with **under 100 MB RAM**.
> No Docker. No build step. One Node.js process + one SQLite file.

| | |
|---|---|
| **Stack** | Node.js + Express 5 + better-sqlite3 + vanilla JS |
| **AI Backend** | 9Router (`http://localhost:20128/v1`, OpenAI-compatible) |
| **Providers** | AG, Groq, BAI, OpenRouter, Nvidia, Cline — 497+ models |
| **Frontend** | `index.html` + `style.css` + `app.js`, zero framework, dark theme |
| **Language** | English (default) / Indonesian — runtime toggle |
| **Version** | v1.0-beta |
| **License** | Private / personal use |

---

## Table of Contents

1. [Features](#features)
2. [System Architecture](#system-architecture)
3. [Request Flow Diagrams](#request-flow-diagrams)
4. [Requirements](#requirements)
5. [Installation](#installation)
6. [Management Script](#management-script-managesh)
7. [Configuration](#configuration)
8. [API Reference](#api-reference)
9. [Database Schema](#database-schema)
10. [Access from Other Devices](#access-from-other-devices)
11. [Performance](#performance)
12. [Security Notes](#security-notes)
13. [Troubleshooting](#troubleshooting)
14. [Changelog](#changelog)

---

## Features

### Chat

| Feature | Description |
|---|---|
| Real-time streaming | SSE relay, word-by-word from 9Router |
| Multi-session history | Per-user isolation in SQLite |
| Chat memory | Token-budget context window (default 1600 tokens ≈ 15–30 msgs, oldest auto-compressed) + rolling background summary of older turns |
| **Cross-chat memory** | Auto-extracted personal facts per user (max 20), injected into every chat; editable in Settings → Memory |
| **Token saver** | `max_tokens` reply cap (default 1024), history budget, per-chat **Lean ⚡** toggle (answers without history) |
| Per-reply usage badge | prompt / completion / total tokens shown under each AI reply |
| Rename / Delete chats | Via sidebar hover buttons; rename uses custom in-app dialog (bilingual, no native prompt) |
| **Deep-link URLs** | SPA router (History API): `/c/:id` lands in the address bar automatically when a reply finishes (ChatGPT/Gemini style; clicking a chat title also reveals it) · `/account` settings · `/admin` dashboard — refresh, bookmark & browser back all work (server catch-all → app; unknown `/api/*` stays JSON 404) |
| **Share link (public)** | Chat "⋯" → Share: read-only page at `/s/<token>` (`noindex`, XSS-safe snapshot); revoke via warn modal; delete chat = revoke; empty chats blocked (`ERR_EMPTY_SHARE`) |
| **Pin / Archive / Tag / Fork** | Chat "⋯" menu: pin to top, archive to a collapsible "Archived (n)" section, inline #tag, fork = branch copy of the conversation (`(fork)` suffix) |
| **Chat search** | Instant client-side filter by title (sidebar) |
| Markdown + code blocks | With streaming auto-close fence fix |
| Copy & Retry | Per-message actions |
| **Smart chat title** | After the first reply a short 3–6 word title is generated in the background (never overwrites a manual rename) |
| **Edit & regenerate** | Pencil on any user message → inline edit → save truncates everything after it; ↻ button regenerates from the last user message |
| **Code highlight + copy** | fenced blocks get language colouring (bundled hljs, no CDN) + per-block copy button |
| Stop generation | Abort mid-stream |
| Provider timeout | Admin-configurable 30–600 s (default 120 s), applies to all upstream calls |
| Typing indicator | Animated dots while waiting |
| **Temporary Chat** | Zero history saved (endpoint: `/api/temp-chat`); honours Lean mode (skip history + memory = zero context) |
| **Realtime quota UI** | Sidebar quota + admin dashboard refresh automatically after every reply (dashboard auto-polls every 5 s while open) |

### Users & Access

| Feature | Description |
|---|---|
| Login | scrypt per-user salt (`scrypt1:salt:hash`), timing-safe compare; legacy static-salt hashes auto-upgrade on login |
| Session purge | Expired sessions deleted on every login |
| Roles | `admin` (full control) and `user` (chat only) |
| Daily quota | Per-user limit (default 50/day), admin unlimited; quota bar shown in sidebar with model chip |
| User management | Admin: add / delete / reset password / activate / deactivate (self-deletion & self-deactivation blocked server-side) |
| Instant session revoke | Deactivate or password reset kills sessions immediately |
| Quota edit & reset | Admin edits any user's daily quota (1–999999) and resets one or all users' usage |
| **Reset password (admin)** | Custom in-app modal with validation (min 4 chars, clear on short) — no native `prompt()` anywhere |
| **Deactivate/Activate/Delete guard** | Open WebUI-style warn modals with user name + consequence text (red danger for deactivate/delete, blue/info for activate); actions only run after confirm |

### Guest Mode (no login)

| Feature | Description |
|---|---|
| **Try as guest** | Button under Login on the login screen (only shown when guest mode is enabled + gateway configured); clicks straight into the chat dashboard |
| Configurable limits | Admin sets **max messages per guest** (1–200, default 10) and **session time limit** (1–60 min, default 5) |
| Live guest chip | Sidebar shows `Guest — n/max messages · mm:ss left` (turns red under 60 s) |
| Login popup on exhaustion | When chats or time run out, an in-app modal asks to sign in; "Continue as guest" dismisses it, "Sign in now" goes to login |
| Server-enforced | Limits checked before the AI call; rejected sends roll back their bubbles (nothing stored); expired sessions can't post to any account endpoint (`ERR_GUEST_NOPE`) |
| Session persistence | Cookie `gtoken` (HttpOnly, 24 h); chat history kept during the session, survives reload; re-clicking guest mints a fresh session |
| Clean stats | Guest messages never touch the `usage` table — admin statistics stay per-real-user |
| **Auto-delete (nightly purge)** | Scheduler wipes ALL guest data — sessions, chats, messages — once per day at an admin-configurable local hour picked from a clock-style **HH:00 dropdown** (default 00:00, `guest_purge_hour`); plus a manual "Purge guest chat" button (warn-confirm) in Admin → Usage Statistics |

### Chat Experience

| Feature | Description |
|---|---|
| **Smart title** | After the first reply, a short 3–6-word title is generated in the background (never overwrites manual renames; guests excluded) |
| **Edit message** | Pencil on user bubbles → inline textarea → save = rewrite + truncate everything after, resend automatically |
| **Regenerate** | ↻ on AI bubbles truncates from the last user message and resends |
| **Code highlighting** | Fenced blocks coloured via bundled highlight.js (v11.9, served from `/vendor/`, no CDN) + per-block copy button; theme-aware (github-dark/github swap with the UI theme) |
| **Pin / Tag / Fork / Archive** | Chat "⋯" menu — pin keeps chats at top, `#tag` shown as chip, fork copies the whole conversation as `(fork)`, archive hides chats into a collapsible "Archived (n)" section |

### Usage Statistics (Admin)

Compact dashboard: period as segmented pills (1d/7d/30d/90d, default 1d) beside Purge/Reset action buttons. Card row (requests, total/prompt/completion tokens, active users, guest sessions) + a canvas bar chart (no chart library, re-themes light/dark) whose x-axis shows **hour labels (00:00–21:00) for 1d** and **date labels (dd/mm) for 7/30/90d**. Top-10 model & user rankings sit side by side in a 2-column grid with rank numbers, inline bars and token+request meta per row. Endpoints: `GET /api/admin/stats?days=N` (1–365), `POST /api/admin/guest-purge-now`, `PUT /api/admin/reset-usage`.

### Reply Stats Strip (v1.0-beta.31)
- **Open-WebUI-style meta chips** under every finished answer: ⏱ generation time (tooltip shows first-token latency), ⚡ output speed (tokens/s), ◔ context-window usage %, ↑ prompt tokens (sent), ↓ completion tokens (received), ∑ total — each chip has an ID/EN tooltip.
- **Persistent**: stored in `messages.meta` (JSON) → survives refresh/reload, rendered for old replies too, and shown live for temp/guest streams.
- **Context window is AUTO-DETECTED per model** (v1.0-beta.33): the gateway's `/v1/models` metadata
  (`context_length`, `max_completion_tokens`) feeds the % chip — switch models and the % follows each
  model's real window. The admin **Fallback context window** setting (validated 1,024-1,048,576,
  `ERR_BAD_CTXWIN`) is only used for models with no provider metadata (e.g. combo routes).

### Models

| Feature | Description |
|---|---|
| **Model Connection (gateway)** | Base URL + API key set in Admin Dashboard (Open WebUI style): masked key display, show/hide eye, Test button (live latency + model count), instant hot-reload, no restart |
| Auto-fetch | Model list pulled live from 9Router (or any OpenAI-compatible endpoint) |
| **Searchable picker** | Custom combobox with instant filter + keyboard nav (↑/↓/Enter/Esc), works for admin & locked users |
| Global default | Admin setting, applies to all users |
| Per-user override | Admin sets specific model per user |
| Per-chat model | Each chat remembers its model |
| Locked for users | Regular users cannot change model (server-enforced); UI shows a red "Terkunci / Locked" chip |

### Appearance

| Feature | Description |
|---|---|
| **Light / dark theme** | Toggle in the sidebar (sun/moon); dark = Open WebUI palette, light derived from it. Persisted per browser; highlight.js CSS theme swaps with it |
| Chat wallpaper | 6 presets + custom image upload (per-user, optional global); dark overlay only for image wallpapers, gradient presets render as-is |
| Custom avatar | Auto-downscaled upload, strict base64 validation; rendered in chat bubbles, sidebar and admin list |
| **Global assistant avatar** | Admin uploads one AI avatar for everyone (`/api/admin/assistant-avatar`), or resets to default mask icon |
| **Admin avatar popover** | Click any avatar row in the admin user table → upload / reset / cancel (no native prompts anywhere) |
| Sidebar minimize | Desktop: icon rail (user-row collapses to avatar + stacked actions), state persisted · Mobile: closes the drawer |
| Bilingual UI | English / Indonesian, all strings translated — dialogs, toasts, admin panel, error codes |
| Custom dialogs | All confirm/rename/quota dialogs are in-app modals (i18n + consistent style), never native `alert/confirm/prompt` |
| Responsive | Mobile drawer sidebar, 44px+ tap targets, admin tables become card stacks, verified 1920→320 px with no horizontal overflow |

---

## System Architecture

```
┌─────────────────────────────────────────────────────────────────┐
│                        CLIENT (Browser)                         │
│   Desktop / Mobile · split html/css/js · zero framework         │
└───────────────┬─────────────────────────────────────────────────┘
                │ fetch (cookie session)
                ▼
┌─────────────────────────────────────────────────────────────────┐
│                    TEMAN TANYAMU (Node.js)                      │
│                     http://0.0.0.0:3000                         │
│                                                                 │
│  ┌──────────┐  ┌──────────┐  ┌───────────┐  ┌───────────────┐   │
│  │  Auth    │  │  Chats   │  │  Admin    │  │  Settings     │   │
│  │  /login  │  │  CRUD    │  │  users    │  │  model/wall   │   │
│  │  /me     │  │  memory  │  │  quota    │  │  global/per-u │   │
│  └────┬─────┘  └────┬─────┘  └────┬──────┘  └──────┬────────┘   │
│       │             │             │                 │           │
│  ┌────▼─────────────▼─────────────▼─────────────────▼────────┐  │
│  │                SQLite (chat.db, WAL mode)                 │  │
│  │  users · sessions · chats · messages · usage · settings   │  │
│  └───────────────────────────────────────────────────────────┘  │
│                                                                 │
│  ┌───────────────────────────────────────────────────────────┐  │
│  │           SSE Relay (streaming passthrough)               │  │
│  │  /api/chat · /api/temp-chat · timeout 30-600s (admin)      │ │
│  └───────────────────────────┬───────────────────────────────┘  │
└──────────────────────────────┼──────────────────────────────────┘
                               │ HTTP + Bearer key (server-side only)
                               ▼
┌─────────────────────────────────────────────────────────────────┐
│                  9Router (localhost:20128)                      │
│        OpenAI-compatible local gateway · 497+ models            │
└───────────────┬──────────────┬──────────────┬──────────────────┘
                ▼              ▼              ▼
            ┌───────┐     ┌─────────┐    ┌──────────┐
            │ AG /  │     │  Groq / │    │ OpenRtr/               │
            │  BAI  │     │ Nvidia  │    │  Cline                 │
            └───────┘     └─────────┘    └──────────┘
```

### Key Design Decisions

| Decision | Reason |
|---|---|
| Single file backend (`server.js`) | Easy audit, zero complexity |
| SQLite over Postgres | Zero-config, WAL mode, single file backup |
| Server-side API key proxy | Key never reaches the browser |
| SSE relay (not direct) | Streaming works cross-device, CORS-free |
| Error codes (`ERR_*`) | Translated client-side per language |
| no-cache delivery + versioned assets | HTML: no-store · CSS/JS: no-cache + `?v=` query (updates always fresh, stale caches bust on release) |
| Split frontend (`style.css` + `app.js`) | Cacheable assets, lintable JS, CSP-ready |

---

## Request Flow Diagrams

### 1. Login Flow

```
Browser                          Server                         SQLite
   │  POST /api/login               │                              │
   │  {username, password}          │                              │
   │ ─────────────────────────────► │  lookup user                 │
   │                                │ ───────────────────────────► │
   │                                │  verify scrypt hash          │
   │                                │  check active=1              │
   │                                │  insert session token        │
   │  ◄───── Set-Cookie ──────────  │ ◄─────────────────────────── │
   │  session=<token> (HttpOnly)    │                              │
   │                                │                              │
   │  GET /api/me (cookie)          │                              │
   │ ─────────────────────────────► │  validate token+expiry       │
   │  ◄── user info + quota ──────  │                              │
```

### 2. Streaming Chat Flow

```
Browser                Node Server                    9Router              Provider
   │  POST /api/chat        │                            │                   │
   │  {chatId, message}     │                            │                   │
   │ ─────────────────────► │                            │                   │
   │                        │ 1. validate session        │                   │
   │                        │ 2. check daily quota       │                   │
   │                        │ 3. enforce model policy    │                   │
   │                        │ 4. save user msg ──────────┼──► SQLite         │
   │                        │ 5. build context (last 10) │                   │
   │                        │ ──── POST /chat/completions (stream:true) ────►│
   │                        │                            │                   │
   │   ◄═══ SSE chunks ═════│◄═══ delta.content ═════════│◄══════════════════│
   │   word-by-word         │  (relay + accumulate)      │                   │
   │                        │                            │                   │
   │   ◄── data:[DONE] ──── │                            │                   │
   │                        │ 6. save AI reply ──────────┼──► SQLite         │
   │                        │ 7. bump usage counter      │                   │
```

### 3. Temporary Chat Flow

```
Browser                Node Server                    9Router
   │  POST /api/temp-chat   │                            │
   │  {message, model}      │                            │
   │ ─────────────────────► │  1. validate + quota       │
   │                        │  2. NO DB WRITE            │
   │                        │ ──── POST (stream:true) ──►│
   │   ◄═══ SSE chunks ════ │◄═══ delta.content ═════════│
   │                        │  3. bump usage only        │
   │                        │  (memory: nothing saved)   │
```

### 4. Admin Model Policy

```
User (non-admin) changes model?
   │
   ├─► UI: selector disabled
   └─► Server (double check):
         PUT /api/me/model ────────► 403 ERR_ADMIN_ONLY
         PATCH /api/chats model ───► 403 ERR_ADMIN_ONLY
         POST /api/chats {model} ──► forced to resolveUserModel()
         POST /api/chat ───────────► chat.model auto-corrected

Admin sets global default ──► settings.default_model
Admin sets user override ───► users.model_override

Resolution order:  user override  >  global default
```

---

## Requirements

| Component | Minimum |
|---|---|
| OS | Linux (tested: Ubuntu 24.04) |
| Node.js | >= 20 (tested: v24.21) |
| 9Router | Running, OpenAI-compatible, default port 20128 |
| Disk | ~50 MB (incl. node_modules) |

## Installation

```bash
cd dash_ai_me
npm install        # express + better-sqlite3
node server.js     # http://localhost:3000
```

First run creates the admin account automatically:

```
username: admin
password: admin123      # change immediately via UI
```

## Management Script (`manage.sh`)

All-in-one service manager (systemd user service):

```bash
./manage.sh start            # Start service
./manage.sh stop             # Stop service
./manage.sh restart          # Restart service
./manage.sh status           # Status, port, RAM
./manage.sh port <1-65535>   # Change port (persistent, auto-restart)
./manage.sh clear-cache      # Clean SQLite WAL + npm cache + old journal
./manage.sh enable-boot      # Auto-start at boot (enables linger)
./manage.sh disable-boot     # Disable boot autostart
./manage.sh logs [n]         # Last n log lines (default 50)
./manage.sh password         # Reset admin password to admin123
./manage.sh help             # Show help
```

> `enable-boot` runs `loginctl enable-linger` so the service runs
> without an active desktop session.

---

## Configuration

### Environment Variables

| Variable | Default | Description |
|---|---|---|
| `PORT` | `3000` | Web server port |
| `ROUTER_BASE` | – | Boot fallback base URL (used only until set in Admin Dashboard) |
| `ROUTER_KEY` | – | Boot fallback API key (same; DB settings take precedence) |
| `ADMIN_PASSWORD` | `admin123` | Initial admin password (first run only) |

Example:

```bash
PORT=8080 ROUTER_BASE=http://192.168.1.10:20128/v1 ROUTER_KEY=*** node server.js
```

> Once set via **Admin Dashboard → Model Connection**, values in the `settings` table win
> over env vars — you can change gateway/key anytime from the browser without restart.

### File Locations

| Path | Description |
|---|---|
| `chat.db` | SQLite database (WAL mode) |
| `public/index.html` | Struktur halaman SPA (login + app shell) |
| `public/style.css` | Seluruh styling frontend |
| `public/app.js` | Seluruh logika frontend |
| `server.js` | Backend (single file) |
| `.port` | Persisted port number (created by `manage.sh port`) |
| `~/.config/systemd/user/dash-ai-me.service` | systemd unit |

---

## API Reference

All endpoints require the session cookie except `/api/login` and `/api/health`.
Errors return `{"error": "ERR_*"}` codes, translated client-side.

### Auth

| Method | Endpoint | Body | Description |
|---|---|---|---|
| POST | `/api/login` | `{username, password}` | Sign in |
| POST | `/api/logout` | - | Destroy session (user + guest cookies) |
| GET | `/api/me` | - | User info + quota + effective model + global assistant avatar (guest: `guest, quota_used/max, seconds_left, expired`) |
| POST | `/api/guest` | - | Start/reuse guest session (cookie `gtoken`; 403 when guest mode off) |
| GET | `/api/guest-config` | - | `{enabled}` — login screen show/hide for the guest button (no auth) |
| GET | `/api/health` | - | Liveness + DB check (no auth, for uptime monitors) |

### Account

| Method | Endpoint | Body | Description |
|---|---|---|---|
| PUT | `/api/me/password` | `{current, next}` | Change own password |
| PUT | `/api/me/avatar` | `{avatar: dataURL\|null}` | Set/remove avatar |
| PUT | `/api/me/model` | `{model}` | Own model override (**admin**) |
| DELETE | `/api/me/model` | - | Clear override (**admin**) |

### Chats

| Method | Endpoint | Body | Description |
|---|---|---|---|
| GET | `/api/chats` | - | List own chats |
| POST | `/api/chats` | `{title?, model?}` | Create chat |
| GET | `/api/chats/:id` | - | Chat + full messages |
| PATCH | `/api/chats/:id` | `{title?, model?, pinned?, archived?, tag?}` | Rename / lock model (admin) / pin / archive / tag |
| POST | `/api/chats/:id/fork` | - | Copy chat + messages into a new `(fork)` chat |
| PUT | `/api/chats/:id/messages/:msgId` | `{content}` | Edit message content (user messages only) |
| DELETE | `/api/chats/:id/messages/:msgId` | - | Truncate chat: delete that message + everything after it |
| PATCH | `/api/chats/:id/lean` | `{lean: bool}` | Toggle lean (no-history) token saver per chat |
| DELETE | `/api/chats/:id` | - | Delete chat + messages (auto-revokes share links) |
| POST | `/api/chats/:id/share` | - | Create/read-only share token (400 `ERR_EMPTY_SHARE` on chats with no messages; idempotent) |
| GET | `/api/chats/:id/share` | - | Current share token or `null` |
| DELETE | `/api/chats/:id/share` | - | Revoke share link |

### Public pages (no auth)

| Method | Endpoint | Description |
|---|---|---|
| GET | `/s/:token` | Read-only shared-chat HTML page (`noindex`, `no-store`, content escaped) |
| GET | `/{any SPA path}` | Unknown non-API paths serve the app (client router: `/c/:id`, `/account`, `/admin`); unknown `/api/*` stays JSON 404 |

### Memory (cross-chat, per user)

| Method | Endpoint | Body | Description |
|---|---|---|---|
| GET | `/api/memory` | - | List own memory facts + enabled flag |
| PUT | `/api/memory` | `{facts: string[]}` | Replace full fact list (max 20, 240 chars each) |
| DELETE | `/api/memory/:factId` | - | Delete one fact |
| POST | `/api/memory/clear` | - | Wipe own memory |

### Chat & Preferences

| Method | Endpoint | Body | Description |
|---|---|---|---|
| GET | `/api/models` | - | Model list from 9Router |
| POST | `/api/chat` | `{chatId, message}` | Streamed chat (SSE); token-budget context + system memory injected; final `usage` event with prompt/completion split |
| POST | `/api/temp-chat` | `{message, model?, lean?}` | Streamed temp chat (SSE, not saved); `lean:true` = zero context (no system prompt/memory) |
| GET | `/api/wallpaper` | - | Effective wallpaper |
| PUT | `/api/wallpaper` | `{wallpaper\|null}` | Own wallpaper |

### Admin

| Method | Endpoint | Body | Description |
|---|---|---|---|
| GET | `/api/admin/users` | - | Users + today's usage + effective model + `me` id |
| POST | `/api/admin/users` | `{username, password, role, daily_quota}` | Create user |
| DELETE | `/api/admin/users/:id` | - | Delete user (self-delete blocked) |
| PUT | `/api/admin/users/:id/password` | `{password}` | Reset password (revokes sessions) |
| PUT | `/api/admin/users/:id/active` | `{active: bool}` | Activate / deactivate (self-deactivate blocked) |
| PUT | `/api/admin/users/:id/quota` | `{daily_quota}` | Edit daily quota (1–999999) |
| PUT | `/api/admin/users/:id/reset-quota` | - | Reset one user's daily usage |
| PUT | `/api/admin/reset-usage` | - | Reset **all** users' usage (`DELETE FROM usage`) |
| PUT | `/api/admin/users/:id/model` | `{model\|null}` | Per-user model override |
| POST | `/api/admin/avatar` | `{userId, avatar\|null}` | Upload / reset any user's avatar (self-sync immediate) |
| POST | `/api/admin/assistant-avatar` | `{avatar\|null}` | Global assistant (AI) avatar for all users |
| GET | `/api/admin/stats` | `?days=1..365` (def 30) | Usage statistics: totals, per-day series, top models/users, guest sessions |
| POST | `/api/admin/guest-purge-now` | - | Purge all guest data immediately |
| GET | `/api/admin/settings` | - | Global settings + today's token totals (prompt/completion) |
| PUT | `/api/admin/settings` | `{default_model?, history_token_budget?, max_reply_tokens?, memory_enabled?, timeout_ms?, guest_enabled?, guest_max_chats?, guest_max_minutes?, guest_purge_hour?}` | Update settings (budget 200–32000, reply cap 64–8192, timeout 30–600 s, guest chats 1–200, guest minutes 1–60, purge hour 0–23) |
| GET | `/api/admin/router-config` | - | Model gateway base URL + masked key + source (`database`/`env`) |
| PUT | `/api/admin/router-config` | `{base_url?, api_key?}` | Set gateway base URL & API key (hot-reload, no restart; empty key = keep) |
| POST | `/api/admin/router-test` | `{base_url?, api_key?}` | Probe `GET {base}/models` with saved **or** posted (pre-save) creds → latency + model count |
| PUT | `/api/admin/wallpaper` | `{wallpaper\|null}` | Set global wallpaper |

### Error Codes

| Code | Meaning |
|---|---|
| `ERR_UNAUTH` | Not signed in |
| `ERR_ADMIN_ONLY` | Admin-only action |
| `ERR_FIELDS_REQUIRED` | Missing fields |
| `ERR_LOGIN` | Wrong credentials |
| `ERR_INACTIVE` | Account deactivated |
| `ERR_PW_SHORT` | Password under 4 chars |
| `ERR_OLD_PW` | Old password wrong |
| `ERR_QUOTA` | Daily quota exceeded |
| `ERR_RATE_LIMITED` | Too many failed logins: 5 attempts, then 2-minute IP block |
| `ERR_NOT_FOUND` | Resource not found |
| `ERR_USERNAME_TAKEN` | Username exists |
| `ERR_TOO_BIG` | Image too large |
| `ERR_AVATAR_FORMAT` | Avatar not an image |
| `ERR_WALLPAPER_FORMAT` | Wallpaper format invalid |
| `ERR_SELF_DELETE` | Cannot delete own account |
| `ERR_SELF_DEACTIVATE` | Cannot deactivate own account |
| `ERR_BAD_BODY` | Malformed JSON body |
| `ERR_BAD_BUDGET` | History budget out of range (200–32000) |
| `ERR_BAD_MAXTOK` | Reply token cap out of range (64–8192) |
| `ERR_BAD_TIMEOUT` | Upstream timeout out of range (30–600 s) |
| `ERR_ROUTER_DOWN` | 9Router unreachable |
| `ERR_ROUTER_NOT_CONFIGURED` | Base URL / API key not set yet (Admin Dashboard → Model Connection) |
| `ERR_BASE_REQUIRED` | Base URL field empty |
| `ERR_BASE_INVALID` | Base URL not a valid http(s) URL |
| `ERR_BASE_BLOCKED_HOST` | Base URL host blocked (link-local / metadata addresses) |
| `ERR_TIMEOUT` | Upstream model call timed out |
| `ERR_GUEST_DISABLED` | Guest mode is turned off |
| `ERR_GUEST_CHATS` | Guest message limit reached |
| `ERR_GUEST_TIME` | Guest session time limit reached |
| `ERR_GUEST_NOPE` | Account feature unavailable in guest mode |

---

## Database Schema

```sql
users     (id, username, password_hash, role, daily_quota,
           model_override, avatar, active, created_at)
          -- password_hash: "scrypt1:<salt>:<hash>" (per-user salt);
          -- legacy static-salt hex auto-upgrades on next login
sessions  (token, user_id, expires_at)             -- expired rows purged on login
chats     (id, user_id, title, model, lean, pinned, archived, tag,
           summary, created_at, updated_at)        -- lean: 1 = no-history token saver
          -- pinned/archived: 0/1; tag: free text (<= 24 chars)
messages  (id, chat_id, role, content, tokens, created_at)
usage     (user_id, date, request_count, tokens_used)  -- PK (user_id, date)
shared_chats (token, chat_id, user_id, created_at)
          -- token = 16 hex chars, random; read-only public snapshots; revoked on chat delete
guest_sessions (token, guest_id, msgs_used, started_at, expires_at)
          -- guest chats stored under user_id = -guest_id; wiped on logout / purge
memories  (id, user_id, content, source, updated_at)  -- cross-chat facts (max 20/user)
settings  (key, value)
          -- keys: default_model, wallpaper, assistant_avatar, router_base, router_key,
          --         user:<id>:wallpaper, history_token_budget, max_reply_tokens,
          --         memory_enabled, timeout_ms, memory_sync_chat, memory:last:<id>,
          --         guest_enabled, guest_max_chats, guest_max_minutes, guest_purge_hour
```

---

## Access from Other Devices

Server binds to all interfaces. From phones / LAN devices:

```
http://<laptop-ip>:3000        e.g. http://20.20.100.6:3000
```

For access over the internet, a Cloudflare Tunnel works out of the box:
`trust proxy` is enabled and `cf-connecting-ip` is honored for login
rate limiting; the session cookie gets the `Secure` flag automatically
when the request arrives via HTTPS.

---

## Performance

| Metric | Measured |
|---|---|
| RAM idle | 20-30 MB |
| RAM peak (streaming) | 50-65 MB |
| CPU idle | ~0% |
| Boot time | < 3 s |
| Streaming first token | ~0.5-2 s (provider dependent) |

---

## Security Notes

- Passwords: scrypt with per-user random salt, stored as `scrypt1:<salt>:<hash>`,
  verified with `crypto.timingSafeEqual`; legacy static-salt hashes upgrade
  automatically on the next successful login
- Sessions: HttpOnly cookie, SameSite=Lax, 7-day expiry; expired rows purged on login
- **Secure cookie flag**: auto-enabled when behind HTTPS (Cloudflare Tunnel sets `X-Forwarded-Proto`)
- **Login rate limiting**: 5 failed attempts per IP, then a 2-minute block (`ERR_RATE_LIMITED`)
- `trust proxy` enabled: client IP correctly detected behind Cloudflare (`CF-Connecting-IP`)
- **Security headers** on every response: `X-Content-Type-Options: nosniff`,
  `X-Frame-Options: DENY`, `Referrer-Policy: no-referrer`
- **XSS hardening**: avatar & wallpaper validated server-side against strict
  formats (base64 image types / `linear-gradient(...)` / `#hex` only — no
  `svg+xml`, no attribute breakout); all user-supplied values escaped at render
- 9Router API key never sent to browser (server-side proxy only)
- Per-user chat isolation enforced in every SQL query
- **Share links**: random 16-hex tokens (unguessable), no auth leakage (server-rendered static HTML,
  no cookies needed), `noindex` for search engines, `no-store`, chat content HTML-escaped (no script
  injection); revoke + delete-chat cleanup keep zero orphan rows; empty chats cannot be shared
- **SPA fallback** serves only a constant file path (`public/index.html`) — no user input reaches
  `sendFile`; API namespace protected with explicit JSON 404 before the catch-all
- Model policy enforced server-side (not just hidden in UI)
- Guest mode: chat/time limits enforced server-side **before** the AI call; guests blocked from all
  account endpoints (`ERR_GUEST_NOPE`); guest chats isolated under negative user ids and excluded
  from the `usage` stats table
- Quota checked before every AI call; failed/aborted streams do not consume quota
- Deactivate / password reset revokes all sessions instantly
- Caching: HTML `no-store`, CSS/JS `no-cache` + `?v=` asset version in `index.html` (bump on each release so old client caches invalidate automatically)

---

## Troubleshooting

| Problem | Fix |
|---|---|
| "9Router offline" | Verify gateway: `curl http://localhost:20128/v1/models -H "Authorization: Bearer ***"` — or click **Test** in Admin Dashboard → Model Connection |
| Moved gateway / new key | Admin Dashboard → Model Connection: set Base URL + API key, Test, Save. Applies instantly, no restart |
| Forgot admin password | `./manage.sh password` |
| Port already in use | `./manage.sh port 3001` |
| Not auto-starting at boot | `./manage.sh enable-boot`, verify `loginctl show-user $USER \| grep Linger` |
| Stale UI after update | Hard refresh: `Ctrl+Shift+R` (HTML/CSS/JS are all no-cache; rarely needed) |
| Full reset (nuclear) | `./manage.sh stop && rm -f chat.db* && ./manage.sh start` — all data gone |

---

### Night of Reliability (v1.0-beta.21 → .24)
Fitur operasional level produksi:
- **Backup otomatis**: tiap boot + harian ke `backups/` (retensi 30 hari), plus tombol "Back up database now" di panel **Sistem & Operasi** pada Admin Dashboard. CLI: `./manage.sh backup` / `restore <file>` / `vacuum`.
- **Audit trail**: login, aksi admin, purge, share, rate-limit tercatat ke tabel `audit` (maks 2000 baris) dan tampil di panel Ops (paginated).
- **Throttle generasi**: default 30 panggilan AI / 90 detik per user (tamu: per IP) → `ERR_GEN_LIMITED`; pembuatan sesi tamu 12/menit/IP. **Bisa disetel live** di Admin → Token Saver: "Anti-spam: maks panggilan AI" (5–1000) + "…per rentang detik" (10–600), tersimpan di settings, langsung berlaku tanpa restart, tercatat di audit trail.
- **Log terstruktur JSON** (`lib/logger.js`) + request log API + endpoint `/api/admin/metrics` (Prometheus text, admin-only).
- **Purge-day persisten**: guard hari purge sekarang disimpan di `settings` (`guest_last_purge_day`), aman restart, pakai tanggal lokal.
- **Regression suite permanen**: `test/e2e.test.js` — 46 assertion (auth, isolasi chat, share+XSS+i18n, guard admin, limiter unit, metrics, backup, purge-route, mode ledger). Jalankan: `./manage.sh test` atau `npm test`.
- **i18n bersama**: `public/i18n.js` dipakai browser DAN server (halaman share ikut bahasa `Accept-Language`).
- **Throttle configurable (v1.0-beta.22)** — Admin → Token Saver: "Max calls" + "per seconds"
  side-by-side with an inline explainer note (5–1000 / 10–600); stored in settings, applied live
  without restart, audit-tracked.
- **Motion layer (v1.0-beta.23 → .24)** — chat bubbles rise-in, history & audit rows stagger, stat
  cards cascade, send button pulses while streaming, login card + footer + form staggered entrance,
  app↔login cross-fade on login/logout, wrong-password shake, focus glow rings, theme cross-fade,
  button press feedback — all honoring `prefers-reduced-motion`.
- **Fast chat path (v1.0-beta.24)** — measured login 2–6 s → **0.5 s**: `/api/models` cached 60 s
  server-side (stale-on-error), boot parallelized (models ∥ chats), post-reply refresh moved
  off the critical path (non-blocking silent re-render, no animation replay), hidden background
  LLM tasks (title/summary/memory) queued + delayed 2.5 s so they never steal gateway bandwidth
  from the next visible message.
- **Never lose a visible reply (v1.0-beta.24)** — if the upstream drops AFTER the answer was
  streamed & saved, you now get a soft "⚠ interrupted" note instead of the answer being replaced
  by an error; SSE heartbeat every 10 s prevents idle connection drops; server always emits
  `[DONE]` so the client never hangs.
- **Ledger mode statistik (v1.0-beta.25)** — tabel baru `usage_events` mencatat SETIAP panggilan AI
  per (hari, jam, mode, model) — mode normal/eco/temp/guest kini TERHITUNG SEMUA di kartu, chart
  per-jam, per-model, dan blok baru "Requests by mode" (bar berwarna + keterangan cara catat;
  historis normal+eco di-seed otomatis dari messages lama). Verified end-to-end: normal ✓ eco ✓
  temp ✓ guest ✓. `Reset usage stats` sekarang menyapu kedua ledger (tidak ada ghost chart lagi).
- **Purge guest chat fixed (v1.0-beta.25)** — tombol "Purge guest chat" selalu "failed": rute
  `/api/admin/guest-purge-now` ternyata terdaftar SETELAH guard 404 SPA-fallback (regresi senyap
  dari v17) → 404 ERR_NOT_FOUND. Blok dipindah sebelum guard; 2 assertion regresi baru ditambahkan
  ke suite agar bug kelas "route after the 404 wall" tidak pernah balik lagi.
- **Toast anchor aware (v1.0-beta.25)** — popup (purge, save settings, dsb.) kini dipusat ke dialog
  yang sedang terbuka kalau ada (sebelumnya selalu ke `.main`, jadi terlihat mepet kiri saat panel
  Admin aktif + sidebar maximize/minimize). Terukur off-center **0px** di kedua posisi sidebar.
- **Poll admin anti-flicker (v1.0-beta.26)** — re-render statistik tiap 5 s dilewati kalau angkanya
  sama (signature JSON + tema aktif), cascade animasi tidak replay terus-menerus.
- **Long answers fixed (v1.0-beta.27–.29)** — "jawaban terpotong lalu berhenti" caused by two silent
  killers: total 120 s hard timeout (killed healthy long streams) and the 1024-token reply cap.
  Timeout is now an *idle* watchdog (bytes flowing = alive; only dead connections abort), max-reply
  default raised to 4096 (slider up to 16384, live-apply), and a reply that still hits the cap shows
  a soft hint "⚠ …max reply…" instead of dying quietly. Verified end-to-end: the user's exact
  question "sejarah indonesia abad 15 - hari ini" streams 3 718 chars / 3 346 completion tokens, clean [DONE].
- **Composer border regression (v1.0-beta.27)** — the v23 global focus-glow leaked into the chat
  textarea and drew a ring around it; `#input-msg:focus` is explicitly borderless again, the composer
  keeps its subtle `:focus-within` highlight only. Measured: border 0px, shadow none, while typing.
- **"Idle timeout" labels** — Timeout setting renamed (EN/ID) so admins understand it no longer
  limits total answer length/time, only silent-stall detection.
- **HOTFIX fatal (v1.0-beta.30)** — v29 left a ReferenceError in the client stream loop (`aborted`,
  a SERVER-side variable, leaked into `send()`): every AI chat died on the first chunk with
  "aborted is not defined", output invisible until refresh (the server finished & saved anyway).
  Loop now breaks on `done` only; static regression assertion added to the suite (47 total) so
  server-only identifiers in client reader loops can never ship again.
- **Reply Stats Strip (v1.0-beta.31-32)** — Open-WebUI-style meta chips under every finished answer
  (time, tok/s, context %, ↑ prompt / ↓ completion / ∑ total tokens) with ID/EN tooltips; persisted in the
  new `messages.meta` column so they survive refresh; live for temp & guest streams too; admin
  Token Saver gains a validated **Model context window** setting (`ERR_BAD_CTXWIN`). Suite now 50.
- **Meta chip arrows swapped (v1.0-beta.32)** — ↑ = prompt sent, ↓ = reply received (chat/network
  convention everyone reads intuitively; the old well-metaphor read backwards to users).
- **Context window AUTO-DETECT per model (v1.0-beta.33)** — gateway `/v1/models` metadata
  (`context_length`, `max_completion_tokens`) is cached with the model list (plus an 8s-after-boot
  warm fetch) and feeds the ◔ chip live: each reply's % uses the window of the model that generated
  it (gemini-3.5-flash → 1.049k → 6.2k prompt = 1%, not the scary 50% of the old fixed 8k).
  Models without metadata (e.g. `auto-change` combo) fall back to the admin setting, now honestly
  labelled **Fallback context window**; tooltip also shows the model's max output. Verified
  end-to-end on both paths; temp/guest streams included.
- **Versi konsisten**: `package.json` `1.0.0-beta.33` = `APP_VERSION` server = cache-buster aset; git tag per rilis.

## Changelog

### v1.0-beta (current)

- **Deep-link URLs** — click a chat title for `/c/:id` (address bar stays clean otherwise);
  `/account` & `/admin` deep links; browser back/refresh/bookmark work (SPA fallback; `/api/*` 404 JSON)
- **Stats polish** — segmented period pills (1/7/30/90d) with hour/date chart axis labels,
  2-column ranked model+user panels, purge-hour as a clock-style HH:00 dropdown
- **Share links** — read-only public chat pages at `/s/:token` (create/revoke from chat ⋯ menu,
  clipboard copy, `noindex`, XSS-safe snapshot; empty chats blocked; deleting a chat revokes links)

- **Chat Experience** — smart auto-title after first reply, inline edit & regenerate (truncate +
  resend), highlight.js code blocks with copy button, pin / tag / fork / archive chat menu
- **Light / dark theme** — sidebar toggle, persisted per browser, hljs + stats chart re-theme live
- **Usage Statistics (admin)** — 1/7/30/90-day cards, canvas daily-token chart, top models/users
  bars, purge-now + reset-stats buttons
- **Scheduled guest purge** — wipes all guest data daily at an admin-set hour (`guest_purge_hour`,
  default 00:00) + manual "Purge guest chats now" button
- **Guest Mode** — login-free access via a "Try as guest" button; per-guest message limit (1–200)
  and session time limit (1–60 min) configurable in Admin Dashboard; live countdown chip;
  in-app login popup on chats/time exhaustion; server-enforced quota + endpoint lockdown;
  bilingual (EN/ID); guest data purged on logout
- **Model Connection in Admin Dashboard** — gateway Base URL + API key stored in DB (no more
  hardcode), masked key + eye toggle, live Test button (latency + model count), hot-reload,
  SSRF guard on base URL
- Searchable model combobox, per-user quota edit, realtime quota UI (post-reply + 5 s admin poll),
  global assistant avatar, custom dialogs (confirm/rename/quota), red model-lock chip,
  minimized sidebar fixes, versioned asset cache-busting

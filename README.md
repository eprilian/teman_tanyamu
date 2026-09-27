# Teman Tanyamu

> Lightweight self-hosted AI chat web app. An Open WebUI alternative with **under 100 MB RAM**.
> One Node.js process + one SQLite file for development — with an optional single-command Docker deploy for production.

| | |
|---|---|
| **Stack** | Node.js + Express 5 + better-sqlite3 + vanilla JS |
| **AI Backend** | 9Router (`http://localhost:20128/v1`, OpenAI-compatible) |
| **Providers** | AG, Groq, BAI, OpenRouter, Nvidia, Cline — 497+ models |
| **Frontend** | `index.html` + `style.css` + `app.js`, zero framework, dark theme |
| **Rich replies** | GPT/Gemini-grade Markdown via bundled `marked` + `DOMPurify` (tables, lists, code, blockquotes) |
| **Language** | English (default) / Indonesian — runtime toggle |
| **Version** | v1.0-beta.47 |
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
11. [Production Deploy (Docker)](#production-deploy-docker-port-3001)
12. [Performance](#performance)
13. [Security Notes](#security-notes)
14. [Troubleshooting](#troubleshooting)
15. [Changelog](#changelog)

---

## Features

### Chat

| Feature | Description |
|---|---|
| Real-time streaming | SSE relay, word-by-word from 9Router |
| Multi-session history | Per-user isolation in SQLite |
| Chat memory | Token-budget context window (default 1600 tokens ≈ 15–30 msgs, oldest auto-compressed) + rolling background summary of older turns |
| **Cross-chat memory** | Auto-extracted personal facts per user (max 20), injected into every chat; editable in Settings → Memory |
| **Token saver** | `max_tokens` reply cap (default 4096, slider up to 16384), history budget, per-chat **Lean ⚡** toggle (answers without history) |
| Per-reply usage badge | prompt / completion / total tokens shown under each AI reply |
| Rename / Delete chats | Via sidebar hover buttons; rename uses custom in-app dialog (bilingual, no native prompt) |
| **Deep-link URLs** | SPA router (History API): `/c/:id` lands in the address bar automatically when a reply finishes (ChatGPT/Gemini style; clicking a chat title also reveals it) · `/account` settings · `/admin` dashboard — refresh, bookmark & browser back all work (server catch-all → app; unknown `/api/*` stays JSON 404) |
| **Share link (public)** | Chat "⋯" → Share: read-only page at `/s/<token>` (`noindex`, XSS-safe snapshot); revoke via warn modal; delete chat = revoke; empty chats blocked (`ERR_EMPTY_SHARE`) |
| **Pin / Archive / Tag / Fork** | Chat "⋯" menu: pin to top, archive to a collapsible "Archived (n)" section, inline #tag, fork = branch copy of the conversation (`(fork)` suffix) |
| **Global Chat Search** | Real-time server-side full-text search (`?q=keyword`) of messages and titles, returning exact snippets in the sidebar with debounced inputs. |
| **Chat Exporter** | One-click downloads of entire conversations to clean Markdown (`.md` with YAML frontmatter), raw JSON arrays, or pristine PDF prints (cleared of sidebars/composers via `@media print`). |
| **Token Estimator** | Real-time visual estimator in the composer showing estimated prompt tokens (1 tok ≈ 3 ID chars) against the active chat's remaining database-driven history budget, warning in red on overrun. |
| **Dual-Mode Security Suite** | Adaptively secure architecture offering strict HTTPS Secure/SameSite cookie locks, precise CORS domain restrictions, and secure full-handshake CSRF token guards over public domains, while keeping localhost free for smooth local development. |
| **Single-Command Docker Deploy** | Modern Dockerization template (Alpine-based, ~35MB RAM footprint) managed using `./manage.sh deploy` with automated rolling restarters and persistent DB volumes. |
| Rich Markdown replies | GPT/Gemini-grade rendering (see [Reply Rendering](#reply-rendering-v10-beta44-47)) |
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

### Reply Rendering (v1.0-beta.44-47)
How AI answers are turned into rich, ChatGPT/Gemini-style output:
- **Markdown engine**: replies are parsed with bundled **`marked`** (GFM, line breaks) then sanitized with **`DOMPurify`** — both served from `/vendor/` (no CDN, safe on a low-bandwidth host). Supported: headings, ordered/unordered/**nested** lists, GFM task-list checkboxes (`- [x]`), blockquotes, horizontal rules, inline `code`/**bold**/*italic*, and links (external links get `target="_blank"` + `rel="noopener noreferrer"`).
- **Unified tables**: Markdown tables render as one continuous rounded grid — a single collapsed border (via the `.md-table-wrap` wrapper), header divider, zebra striping, row hover, and horizontal scroll on narrow screens. No more separated per-cell borders.
- **Code blocks**: each fenced block gets a header bar (language label + copy button) and is syntax-highlighted by highlight.js; copying confirms with a bilingual "Copied/Tersalin".
- **Clean copy**: the per-message Copy action strips the injected code-header labels and the streaming caret, so what you paste is the verbatim answer.
- **Throttled streaming**: during streaming the DOM is re-rendered at most ~every 80 ms (via `requestAnimationFrame`) with a single final flush — this fixes the O(n²) freeze that used to lock the tab on long replies with many code blocks.
- **Streaming caret**: a blinking cursor follows the live text and disappears when the reply completes.
- **Smart auto-scroll**: auto-follow pauses the moment you scroll up to read and resumes when you return to the bottom.

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
cd teman_tanyamu
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
./manage.sh backup           # Snapshot chat.db into backups/ (timestamped)
./manage.sh restore <file>   # Restore a backup file over chat.db (stops first)
./manage.sh vacuum           # Compact + checkpoint the SQLite database
./manage.sh test             # Run the end-to-end regression suite (50 assertions)
./manage.sh deploy           # Build & (re)start the production Docker stack on port 3001
./manage.sh help             # Show help
```

> `enable-boot` runs `loginctl enable-linger` so the service runs
> without an active desktop session.
>
> `deploy` copies the app into `~/docker/teman_tanyamu/`, migrates the persistent
> database volume, and rebuilds/restarts the container (see **Production Deploy** below).

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
| `public/index.html` | SPA page structure (login + app shell) |
| `public/style.css` | All frontend styling |
| `public/app.js` | All frontend logic |
| `public/vendor/` | Bundled libraries (highlight.js, marked, DOMPurify) — no CDN |
| `server.js` | Backend (single file) |
| `.port` | Persisted port number (created by `manage.sh port`) |
| `~/.config/systemd/user/teman-tanyamu.service` | systemd unit |

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
| PUT | `/api/admin/settings` | `{default_model?, history_token_budget?, max_reply_tokens?, context_window?, memory_enabled?, timeout_ms?, guest_enabled?, guest_max_chats?, guest_max_minutes?, guest_purge_hour?, gen_limit_max?, gen_limit_window_sec?}` | Update settings (budget 200–32000, reply cap 64–16384, fallback context window 1024–1048576, timeout 30–600 s, guest chats 1–200, guest minutes 1–60, purge hour 0–23, gen limit 5–1000 calls / 10–600 s window) |
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
| `ERR_BAD_MAXTOK` | Reply token cap out of range (64–16384) |
| `ERR_BAD_CTXWIN` | Fallback context window out of range (1024–1048576) |
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
sessions  (token, user_id, expires_at, csrf_token)   -- expired rows purged on login; csrf_token used by the Dual-Mode CSRF guard
chats     (id, user_id, title, model, lean, summary, summary_upto_id,
           pinned, archived, tag, created_at, updated_at)
          -- lean: 1 = no-history token saver; summary_upto_id = last message folded into the rolling summary
          -- pinned/archived: 0/1; tag: free text (<= 24 chars)
messages  (id, chat_id, role, content, tokens, meta, created_at)
          -- meta: JSON reply-stats strip (time, tok/s, context %, prompt/completion/total tokens)
usage     (user_id, date, request_count, tokens_used, prompt_tokens, completion_tokens)  -- PK (user_id, date)
usage_events (date, hour, mode, model, reqs, tok)      -- ledger: every AI call by (day, hour, mode, model); powers all admin charts
shared_chats (token, chat_id, user_id, created_at)
          -- token = 16 hex chars, random; read-only public snapshots; revoked on chat delete
guest_sessions (token, guest_id, expires_at, msgs_used, started_at, csrf_token)
          -- guest chats stored under user_id = -guest_id; wiped on logout / purge
memories  (id, user_id, content, source, updated_at)  -- cross-chat facts (max 20/user)
audit     (id, at, actor_id, actor, action, target, detail)  -- audit trail (max 2000 rows)
settings  (key, value)
          -- keys: default_model, wallpaper, assistant_avatar, router_base, router_key,
          --         user:<id>:wallpaper, history_token_budget, max_reply_tokens, context_window,
          --         memory_enabled, timeout_ms, memory_sync_chat, memory:last:<id>,
          --         guest_enabled, guest_max_chats, guest_max_minutes, guest_purge_hour,
          --         guest_last_purge_day, gen_limit_max, gen_limit_window_sec
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

## Production Deploy (Docker, port 3001)

The app is **dual-mode single-codebase**: the same `server.js` behaves as a relaxed
dev server on `localhost` and as a hardened production server behind HTTPS. There is
nothing to fork — production behavior is auto-selected at request time.

| Signal | Effect |
|---|---|
| Request arrives via HTTPS (`X-Forwarded-Proto: https`) **or** host is the public tunnel domain | Cookies become `Secure` + `SameSite=Strict`, strict CORS whitelist + CSRF guard apply |
| Request from `localhost` / `127.0.0.1` | Relaxed cookies (`SameSite=Lax`), CSRF bypassed, permissive CORS — smooth local dev |

**Topology used here:** dev runs on the host (systemd, port 3000); production runs in
Docker (port 3001). Both can run at once (~70–80 MB RAM total on an Intel i3), so
public traffic on the tunnel is isolated from whatever you are editing on 3000.

### One command

```bash
./manage.sh deploy
```

This copies the current app into `~/docker/teman_tanyamu/` (the master Docker config
lives in the dev directory and is version-controlled), preserves the persistent
`chat.db` volume, then builds the image (`node:24-alpine`, `npm ci --only=production`)
and (re)starts the container mapped as `3001:3000`.

### Wiring the tunnel

Point a Cloudflare Tunnel (or any HTTPS reverse proxy) at `http://localhost:3001`.
Because production is detected from `X-Forwarded-Proto`/host, no extra flags are needed —
the cookie `Secure` flag and CSRF/CORS locks switch on automatically for tunnel traffic
while `http://localhost:3000` (and `:3001`) stay reachable directly.

### Production config

`production.env` (copied into the Docker dir) carries production guidance and a dummy
`ROUTER_KEY` placeholder — set the real gateway base URL + key from the running
container's **Admin Dashboard → Model Connection** (DB settings win over env vars), so
no secret is baked into the image.

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
- Sessions: HttpOnly cookie, `SameSite=Lax` in dev / `SameSite=Strict` in production, 7-day expiry; expired rows purged on login
- **Secure cookie flag**: auto-enabled when behind HTTPS (Cloudflare Tunnel sets `X-Forwarded-Proto`)
- **Dual-Mode CSRF guard**: production (HTTPS / tunnel host) requires a per-session CSRF token — the server mints it, ships it via `/api/me`, and the browser's global fetch interceptor echoes it on every mutating request; `localhost` bypasses it for frictionless dev
- **CORS**: dynamic whitelist (localhost / 127.0.0.1 / the configured tunnel domain); everything else is rejected in production
- **Rich replies sanitized**: AI Markdown is rendered through `DOMPurify` before it touches the DOM, so model output cannot inject script/HTML; external links are forced to `rel="noopener noreferrer"`
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
| Tables/code look unstyled after an update | The asset `?v=` version bumps on each release; if a proxy cached old CSS, hard-refresh (`Ctrl+F5`) and, if serving through Docker, redeploy (`./manage.sh deploy`) |
| Rich Markdown not rendering (plain text) | Confirm `/vendor/marked.min.js` + `/vendor/purify.min.js` load (200, not 404); they are bundled locally — no CDN — so a missing `public/vendor/` file is the usual cause |
| Full reset (nuclear) | `./manage.sh stop && rm -f chat.db* && ./manage.sh start` — all data gone |

---

### Night of Reliability (v1.0-beta.21 → .24)
Production-grade operational features:
- **Automatic backups**: on every boot + daily to `backups/` (30-day retention), plus a "Back up database now" button in the **System & Operations** panel of the Admin Dashboard. CLI: `./manage.sh backup` / `restore <file>` / `vacuum`.
- **Audit trail**: logins, admin actions, purges, shares and rate-limit hits are recorded to the `audit` table (max 2000 rows) and shown in the Ops panel (paginated).
- **Generation throttle**: default 30 AI calls / 90 seconds per user (guests: per IP) → `ERR_GEN_LIMITED`; guest session creation 12/min/IP. **Live-configurable** in Admin → Token Saver: "Anti-spam: max AI calls" (5–1000) + "…per seconds window" (10–600), stored in settings, applied instantly without restart, recorded in the audit trail.
- **Structured JSON logs** (`lib/logger.js`) + API request log + `/api/admin/metrics` endpoint (Prometheus text, admin-only).
- **Persistent purge-day**: the purge-day guard is now stored in `settings` (`guest_last_purge_day`), restart-safe, using the local date.
- **Permanent regression suite**: `test/e2e.test.js` — 50 assertions (auth, chat isolation, share+XSS+i18n, admin guards, limiter unit, metrics, backup, purge-route, mode ledger). Run: `./manage.sh test` or `npm test`.
- **Shared i18n**: `public/i18n.js` is used by BOTH browser AND server (the share page follows the `Accept-Language` header).
- **Configurable throttle (v1.0-beta.22)** — Admin → Token Saver: "Max calls" + "per seconds"
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
- **Ledger-mode statistics (v1.0-beta.25)** — a new `usage_events` table records EVERY AI call
  per (day, hour, mode, model) — normal/eco/temp/guest modes are now ALL counted in the cards, the
  per-hour chart, the per-model chart, and a new "Requests by mode" block (colored bars + a note on
  how each is recorded; historical normal+eco are auto-seeded from old messages). Verified end-to-end:
  normal ✓ eco ✓ temp ✓ guest ✓. `Reset usage stats` now sweeps both ledgers (no more ghost charts).
- **Purge guest chat fixed (v1.0-beta.25)** — the "Purge guest chat" button always "failed": the
  `/api/admin/guest-purge-now` route was registered AFTER the SPA-fallback 404 guard (a silent
  regression from v17) → 404 ERR_NOT_FOUND. The block was moved before the guard; 2 new regression
  assertions were added to the suite so the "route after the 404 wall" bug class can never return.
- **Toast anchor aware (v1.0-beta.25)** — popups (purge, save settings, etc.) are now centered on
  the currently open dialog if any (previously always on `.main`, so they looked stuck to the left
  when the Admin panel was open + the sidebar maximized/minimized). Measured off-center **0px** in
  both sidebar positions.
- **Admin poll anti-flicker (v1.0-beta.26)** — the 5 s statistics re-render is skipped when the
  numbers are unchanged (JSON signature + active theme), so the animation cascade no longer replays
  constantly.
- **Long answers fixed (v1.0-beta.27–.29)** — "answer cut off then stopped" was caused by two silent
  killers: a total 120 s hard timeout (killed healthy long streams) and the 1024-token reply cap.
  The timeout is now an *idle* watchdog (bytes flowing = alive; only dead connections abort), the
  max-reply default was raised to 4096 (slider up to 16384, live-apply), and a reply that still hits
  the cap shows a soft hint "⚠ …max reply…" instead of dying quietly. Verified end-to-end: the
  user's exact question "sejarah indonesia abad 15 - hari ini" streams 3,718 chars / 3,346 completion
  tokens, clean [DONE].
- **Composer border regression (v1.0-beta.27)** — the v23 global focus-glow leaked into the chat
  textarea and drew a ring around it; `#input-msg:focus` is explicitly borderless again, the composer
  keeps its subtle `:focus-within` highlight only. Measured: border 0px, shadow none, while typing.
- **"Idle timeout" labels** — the Timeout setting was renamed (EN/ID) so admins understand it no
  longer limits total answer length/time, only silent-stall detection.
- **HOTFIX fatal (v1.0-beta.30)** — v29 left a ReferenceError in the client stream loop (`aborted`,
  a SERVER-side variable, leaked into `send()`): every AI chat died on the first chunk with
  "aborted is not defined", output invisible until refresh (the server finished & saved anyway).
  The loop now breaks on `done` only; a static regression assertion was added to the suite (47 total)
  so server-only identifiers in client reader loops can never ship again.
- **Reply Stats Strip (v1.0-beta.31-32)** — Open-WebUI-style meta chips under every finished answer
  (time, tok/s, context %, ↑ prompt / ↓ completion / ∑ total tokens) with ID/EN tooltips; persisted in the
  new `messages.meta` column so they survive refresh; live for temp & guest streams too; admin
  Token Saver gains a validated **Model context window** setting (`ERR_BAD_CTXWIN`). Suite now 50.
- **Meta chip arrows swapped (v1.0-beta.32)** — ↑ = prompt sent, ↓ = reply received (the chat/network
  convention everyone reads intuitively; the old well-metaphor read backwards to users).
- **Context window AUTO-DETECT per model (v1.0-beta.33)** — gateway `/v1/models` metadata
  (`context_length`, `max_completion_tokens`) is cached with the model list (plus an 8s-after-boot
  warm fetch) and feeds the ◔ chip live: each reply's % uses the window of the model that generated
  it (gemini-3.5-flash → 1.049k → 6.2k prompt = 1%, not the scary 50% of the old fixed 8k).
  Models without metadata (e.g. `auto-change` combo) fall back to the admin setting, now honestly
  labelled **Fallback context window**; the tooltip also shows the model's max output. Verified
  end-to-end on both paths; temp/guest streams included.
- **Consistent versioning**: `package.json` version = server `APP_VERSION` = asset cache-buster; a git tag per release.

## Changelog

### v1.0-beta.47 (latest)

- **GPT/Gemini-grade reply rendering** — AI answers are now parsed with bundled `marked` + `DOMPurify` (served from `/vendor/`, no CDN) for full Markdown: headings, ordered/unordered/nested lists, GFM task-list checkboxes, blockquotes, horizontal rules, inline formatting, and safe autolinked external links (`target="_blank"` + `rel="noopener noreferrer"`).
- **Unified table grid** — Markdown tables render as one continuous, rounded grid (single collapsed border via a `.md-table-wrap` wrapper) with a header divider, zebra striping, row hover, and horizontal scroll on narrow screens — matching the ChatGPT/Gemini table look (no more separated per-cell borders).
- **Code blocks with header bar** — each fenced block gets a header showing the language label + a copy button, syntax-highlighted by highlight.js; the copy button confirms with a bilingual "Copied/Tersalin" label.
- **Clean message copy** — the per-message "Copy" action strips the injected code-header labels and streaming caret, so copied text is verbatim content (no stray "js Copy").
- **Throttled streaming** — long/heavy replies (complex diagrams, code + prose) no longer freeze the tab: the renderer repaints at most ~every 80 ms during streaming with a single final flush, fixing O(n²) re-parsing.
- **GPT-style streaming caret** — a blinking cursor trails the live reply while it streams, and disappears when the answer completes.
- **Smart auto-scroll** — the view stops pinning to the bottom the moment you scroll up to read, and resumes following when you return to the bottom.
- **Sidebar minimize fixes** — chat icons are centered when the sidebar is minimized, and clicking a chat icon or the account avatar performs its action instead of forcing the sidebar to expand.

### v1.0-beta.43

- **Token counter sync on login** — the composer token estimator no longer flashes a hardcoded `1.6k` before syncing; it reads the database-driven budget as soon as `/api/me` loads.
- **Model-change confirmation** — changing the per-user model now asks for confirmation via a bilingual modal (Cancel reverts the dropdown to the previous model) instead of applying instantly.
- **Welcome message on login** — the empty-state welcome message renders immediately after login (previously only appeared when triggered by the Temp Message button).
- **Eco/Lean mode from the home screen** — the Eco (Lean) toggle can be activated before any chat room exists; a new chat inherits the chosen Lean state on first send.

### v1.0-beta.40

- **Dual-Mode Security Suite** — Strict HTTPS Secure/SameSite=Lax cookie locks, robust database-driven CSRF token Guard (using an automated frontend Global Fetch Interceptor), and strict CORS origin locks for production.
- **Robust non-blocking models caching** — Wrapped upstream models fetching inside isolated catch-blocks, ensuring database settings populate instantly even if the gateway proxy is cold/down.
- **Master Dockerization Stack** — Alpine-based Dockerfile, clean docker-compose port mapping, and a standalone `production.env` to run production on port 3001 coexisting safely alongside dev.
- **One-Click Deploy script** — Integrated `./manage.sh deploy` to automate target directory creation, asset synchronization, persistent database migrations, and hot Docker building.
- **Global Chat Search with Debounce** — Upgraded search to query the SQLite backend, rendering gray search-snippet previews under chat titles in the sidebar.
- **Premium Chat Exporter** — Download chats as Markdown (including metadata headers), raw JSON arrays, or clean print-to-PDFs.
- **Real-time Token Estimator** — Live token calculation in the composer with visual budget over-limit warnings and dynamic Lean/Eco mode binding.

### v1.0-beta (historical)

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

# Teman Tanyamu (dash_ai_me)

> Lightweight self-hosted AI chat web app. An Open WebUI alternative with **under 100 MB RAM**.
> No Docker. No build step. One Node.js process + one SQLite file.

| | |
|---|---|
| **Stack** | Node.js + Express 5 + better-sqlite3 + vanilla JS |
| **AI Backend** | 9Router (`http://localhost:20128/v1`, OpenAI-compatible) |
| **Providers** | AG, Groq, BAI, OpenRouter, Nvidia, Cline — 497+ models |
| **Frontend** | Single `index.html`, zero framework, dark theme |
| **Language** | English (default) / Indonesian — runtime toggle |
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

---

## Features

### Chat

| Feature | Description |
|---|---|
| Real-time streaming | SSE relay, word-by-word from 9Router |
| Multi-session history | Per-user isolation in SQLite |
| Chat memory | Last 10 messages used as AI context |
| Rename / Delete chats | Via sidebar hover buttons |
| Markdown + code blocks | With streaming auto-close fence fix |
| Copy & Retry | Per-message actions |
| Stop generation | Abort mid-stream |
| Typing indicator | Animated dots while waiting |
| **Temporary Chat** | Zero history saved (endpoint: `/api/temp-chat`) |

### Users & Access

| Feature | Description |
|---|---|
| Login | scrypt-hashed passwords, HttpOnly session cookie (7 days) |
| Roles | `admin` (full control) and `user` (chat only) |
| Daily quota | Per-user limit (default 50/day), admin unlimited |
| User management | Admin: add / delete / reset password / activate / deactivate |
| Instant session revoke | Deactivate or password reset kills sessions immediately |
| Quota reset | Admin can reset any user's daily usage |

### Models

| Feature | Description |
|---|---|
| Auto-fetch | Model list pulled live from 9Router |
| Global default | Admin setting, applies to all users |
| Per-user override | Admin sets specific model per user |
| Per-chat model | Each chat remembers its model |
| Locked for users | Regular users cannot change model (server-enforced) |

### Appearance

| Feature | Description |
|---|---|
| Dark theme | Open WebUI inspired palette |
| Chat wallpaper | 6 presets + custom image upload (per-user, optional global) |
| Custom avatar | Auto-downscaled upload |
| Sidebar minimize | Collapses to icon rail, state persisted |
| Bilingual UI | English / Indonesian, all strings translated |
| Responsive | Mobile drawer sidebar, 44px+ tap targets |

---

## System Architecture

```
┌─────────────────────────────────────────────────────────────────┐
│                        CLIENT (Browser)                         │
│   Desktop / Mobile · single index.html · zero framework         │
└───────────────┬─────────────────────────────────────────────────┘
                │ fetch (cookie session)
                ▼
┌─────────────────────────────────────────────────────────────────┐
│                    TEMAN TANYAMU (Node.js)                      │
│                     http://0.0.0.0:3000                         │
│                                                                 │
│  ┌──────────┐  ┌──────────┐  ┌───────────┐  ┌───────────────┐  │
│  │  Auth    │  │  Chats   │  │  Admin    │  │  Settings     │  │
│  │  /login  │  │  CRUD    │  │  users    │  │  model/wall   │  │
│  │  /me     │  │  memory  │  │  quota    │  │  global/per-u │  │
│  └────┬─────┘  └────┬─────┘  └────┬──────┘  └──────┬────────┘  │
│       │             │             │                 │           │
│  ┌────▼─────────────▼─────────────▼─────────────────▼────────┐  │
│  │                SQLite (chat.db, WAL mode)                 │  │
│  │  users · sessions · chats · messages · usage · settings   │  │
│  └───────────────────────────────────────────────────────────┘  │
│                                                                 │
│  ┌───────────────────────────────────────────────────────────┐  │
│  │           SSE Relay (streaming passthrough)               │  │
│  │  /api/chat · /api/temp-chat · 120s timeout · abortable    │  │
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
            │ AG /  │     │  Groq / │    │ OpenRtr/ │
            │  BAI  │     │ Nvidia  │    │  Cline   │
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
| no-cache for HTML | UI updates apply on refresh |

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
| `ROUTER_BASE` | `http://localhost:20128/v1` | 9Router API base URL |
| `ROUTER_KEY` | `sk-a777...` | 9Router API key |
| `ADMIN_PASSWORD` | `admin123` | Initial admin password (first run only) |

Example:

```bash
PORT=8080 ROUTER_BASE=http://192.168.1.10:20128/v1 node server.js
```

### File Locations

| Path | Description |
|---|---|
| `chat.db` | SQLite database (WAL mode) |
| `public/index.html` | Frontend (single file) |
| `server.js` | Backend (single file) |
| `.port` | Persisted port number (created by `manage.sh port`) |
| `~/.config/systemd/user/dash-ai-me.service` | systemd unit |

---

## API Reference

All endpoints require the session cookie except `/api/login`.
Errors return `{"error": "ERR_*"}` codes, translated client-side.

### Auth

| Method | Endpoint | Body | Description |
|---|---|---|---|
| POST | `/api/login` | `{username, password}` | Sign in |
| POST | `/api/logout` | - | Destroy session |
| GET | `/api/me` | - | User info + quota + effective model |

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
| PATCH | `/api/chats/:id` | `{title?, model?}` | Rename / change model |
| DELETE | `/api/chats/:id` | - | Delete chat + messages |

### Chat & Preferences

| Method | Endpoint | Body | Description |
|---|---|---|---|
| GET | `/api/models` | - | Model list from 9Router |
| POST | `/api/chat` | `{chatId, message}` | Streamed chat (SSE) |
| POST | `/api/temp-chat` | `{message, model?}` | Streamed temp chat (SSE, not saved) |
| GET | `/api/wallpaper` | - | Effective wallpaper |
| PUT | `/api/wallpaper` | `{wallpaper\|null}` | Own wallpaper |

### Admin

| Method | Endpoint | Body | Description |
|---|---|---|---|
| GET | `/api/admin/users` | - | Users + today's usage |
| POST | `/api/admin/users` | `{username, password, role, daily_quota}` | Create user |
| DELETE | `/api/admin/users/:id` | - | Delete user |
| PUT | `/api/admin/users/:id/password` | `{password}` | Reset password (revokes sessions) |
| PUT | `/api/admin/users/:id/active` | `{active: bool}` | Activate / deactivate |
| PUT | `/api/admin/users/:id/reset-quota` | - | Reset daily usage |
| PUT | `/api/admin/users/:id/model` | `{model\|null}` | Per-user model override |
| GET | `/api/admin/settings` | - | Global settings |
| PUT | `/api/admin/settings` | `{default_model}` | Set global default model |
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
| `ERR_RATE_LIMITED` | Too many login attempts (5 per 15 min) |
| `ERR_NOT_FOUND` | Resource not found |
| `ERR_USERNAME_TAKEN` | Username exists |
| `ERR_TOO_BIG` | Image too large |
| `ERR_AVATAR_FORMAT` | Avatar not an image |
| `ERR_WALLPAPER_FORMAT` | Wallpaper format invalid |
| `ERR_SELF_DELETE` | Cannot delete own account |
| `ERR_SELF_DEACTIVATE` | Cannot deactivate own account |
| `ERR_BAD_BODY` | Malformed JSON body |

---

## Database Schema

```sql
users     (id, username, password_hash, role, daily_quota,
           model_override, avatar, active, created_at)
sessions  (token, user_id, expires_at)             -- token indexed PK
chats     (id, user_id, title, model,
           created_at, updated_at)
messages  (id, chat_id, role, content, tokens, created_at)
usage     (user_id, date, request_count, tokens_used)  -- PK (user_id, date)
settings  (key, value)
          -- keys: default_model, wallpaper, user:<id>:wallpaper
```

---

## Access from Other Devices

Server binds to all interfaces. From phones / LAN devices:

```
http://<laptop-ip>:3000        e.g. http://20.20.100.6:3000
```

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

- Passwords: scrypt hash (never plaintext)
- Sessions: HttpOnly cookie, SameSite=Lax, 7-day expiry
- **Secure cookie flag**: auto-enabled when behind HTTPS (Cloudflare Tunnel sets `X-Forwarded-Proto`)
- **Login rate limiting**: max 5 failed attempts per IP per 15 minutes (`ERR_RATE_LIMITED`)
- `trust proxy` enabled: client IP correctly detected behind Cloudflare (`CF-Connecting-IP`)
- 9Router API key never sent to browser (server-side proxy only)
- Per-user chat isolation enforced in every SQL query
- Model policy enforced server-side (not just hidden in UI)
- Quota checked before every AI call
- Deactivate / password reset revokes all sessions instantly
- HTML served with `Cache-Control: no-cache` (no stale UI)

---

## Troubleshooting

| Problem | Fix |
|---|---|
| "9Router offline" | Check: `curl http://localhost:20128/v1/models -H "Authorization: Bearer <key>"` |
| Forgot admin password | `./manage.sh password` |
| Port already in use | `./manage.sh port 3001` |
| Not auto-starting at boot | `./manage.sh enable-boot`, verify `loginctl show-user $USER \| grep Linger` |
| Stale UI after update | Hard refresh: `Ctrl+Shift+R` (HTML is no-cache, older browsers may still cache) |
| Full reset (nuclear) | `./manage.sh stop && rm -f chat.db* && ./manage.sh start` — all data gone |

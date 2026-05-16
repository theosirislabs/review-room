# OSIRIS Review Room

A content review engine for agencies and their clients. No more WhatsApp chaos, no more "which version is this," no more screenshots of screenshots.

Agencies post. Clients approve. Both see the same thing in real time.

![Command Center](screenshots/command-center.png)
*The command center — all your clients, their progress, and what's happening right now*

![Client Posts Review](screenshots/client-posts.png)
*A full content grid where clients browse, pick, and approve*

![Client Schedule](screenshots/client-schedule.png)
*Scheduled posts — what's going out, when, and what's been signed off*

## What it does

- **Command Center** — See all your clients at once. Who's at 80% approval. Who has 21 posts stuck in review. What changed 5 minutes ago.
- **Agency View** — Full production cockpit. Post grid, status management, internal notes, bulk upload. The messy side.
- **Client View** — Clean, simple, Instagram-like. Clients see their content, approve what they like, request changes on what they don't. No noise.
- **Schedule** — What's going live, when, and whether the client has signed off. Calendar view with status badges.
- **Theme toggle** — Dark mode for late nights. Light mode for client meetings. Sticks to your preference.
- **Your brand, not ours** — Upload your logo. It replaces ours on every screen, every email, every share link.
- **Real-time** — Approve something on the client side? The agency sees it instantly. Socket.io under the hood.
- **Multi-tenant** — Every client gets their own isolated workspace with their own secure token. No cross-contamination.

## Tech stack

| What | How |
|---|---|
| Frontend | React 19 + TailwindCSS v4 + Framer Motion |
| Backend | Express + Socket.io |
| Database | SQLite |
| Server | TypeScript via tsx |
| Auth | Token-based per workspace |

## Run it locally

```bash
npm install
npm run dev
```

First run auto-seeds demo data with three workspaces and a super-admin account.

**Demo login:** `admin@reviewroom.local` / `demo2026`

Open `http://localhost:3000`

## Production

```bash
docker build -t osiris-review-room:latest .
docker-compose up -d
```

Live at: `https://review-room.theosirislabs.com`

### Large files

Uploading video and hitting a wall at 12%? Cloudflare's free tier has a 100-second timeout. Bypass it with a DNS-only subdomain for uploads, or upgrade to Cloudflare Enterprise.

### Getting your invite link

```bash
docker logs --tail 200 review-room-app | grep "Copy Internal Link"
```

Or once logged into the agency view, click "Copy Link" to generate a secure client invite URL.

## Screenshots

- [`screenshots/command-center.png`](screenshots/command-center.png) — Agency dashboard with 8 workspaces
- [`screenshots/client-posts.png`](screenshots/client-posts.png) — Full posts grid
- [`screenshots/client-schedule.png`](screenshots/client-schedule.png) — Schedule with 20 posts
- [`screenshots/agency-view.png`](screenshots/agency-view.png) — Agency content management
- [`screenshots/client-view.png`](screenshots/client-view.png) — Client approval portal

---

OSIRIS LABS © 2026

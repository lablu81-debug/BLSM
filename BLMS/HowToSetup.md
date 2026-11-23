# BLMS — Setup Guide

BLMS is a Node.js (Express) API + React web app with an embedded SQLite database. One process serves both
the API and the built web app. Requirements: **Node.js 22.13+** or **Docker**.

Nothing sensitive ships in this repository. You provide two secrets at start-up:

| Variable | Purpose |
| --- | --- |
| `SESSION_SECRET` | 32+ random characters; signs login cookies (required in production) |
| `ADMIN_PASSWORD` | 10+ characters; password of the first Administrator, login id `admin` |

Generate a secret: `node -e "console.log(require('crypto').randomBytes(48).toString('hex'))"`

---

## Option A — VPS / bare server (Ubuntu 22.04+ example)

```bash
# 1. Node 22 (>= 22.13; SQLite is built into Node, no compiler needed) and git
curl -fsSL https://deb.nodesource.com/setup_22.x | sudo -E bash -
sudo apt-get install -y nodejs git

# 2. Get the code
git clone https://github.com/lablu81-debug/BLMS-.git /opt/blms && cd /opt/blms

# 3. Configure
cp .env.example .env
nano .env            # fill SESSION_SECRET and ADMIN_PASSWORD; set COOKIE_SECURE=true if using HTTPS

# 4. Install, build, test (optional), start
npm ci
npm run build
npm test             # optional: 10 API/security tests
set -a; . ./.env; set +a
npm start            # http://SERVER_IP:3000
```

### Keep it running (systemd)

`/etc/systemd/system/blms.service`:

```ini
[Unit]
Description=BLMS
After=network.target

[Service]
WorkingDirectory=/opt/blms
EnvironmentFile=/opt/blms/.env
ExecStart=/usr/bin/node dist-server/index.cjs
Restart=always
User=www-data

[Install]
WantedBy=multi-user.target
```

```bash
sudo chown -R www-data /opt/blms/data   # created on first start; or create it beforehand
sudo systemctl daemon-reload && sudo systemctl enable --now blms
```

### HTTPS (recommended)

Put a reverse proxy in front, e.g. Caddy: `blms.example.com { reverse_proxy localhost:3000 }`, then set
`COOKIE_SECURE=true` and `TRUST_PROXY=true` in `.env` and restart.

---

## Option B — Docker

```bash
git clone https://github.com/lablu81-debug/BLMS-.git && cd BLMS-
cp .env.example .env          # fill SESSION_SECRET and ADMIN_PASSWORD
docker compose up -d --build  # http://localhost:3000
docker compose logs -f blms
```

The database lives in the `blms-data` volume (`/data/blms.db`), so it survives rebuilds.
Plain Docker without compose:

```bash
docker build -t blms .
docker run -d --name blms -p 3000:3000 -v blms-data:/data \
  -e SESSION_SECRET=... -e ADMIN_PASSWORD=... blms
```

---

## Option C — Public demo (Render / Railway / Fly.io)

`render.yaml` is included: in Render choose **New > Blueprint**, select the repo, and enter `ADMIN_PASSWORD` and
`DEMO_PASSWORD` (10+ characters each). It builds the Dockerfile, creates `SESSION_SECRET`, enables HTTPS cookies
and seeds demo data. Railway/Fly work the same way using the Dockerfile and the variables in `.env.example`.
The free tier has no persistent disk, so demo data resets on restart (it re-seeds automatically) — attach a disk
mounted at `/data` for anything you want to keep. Share the URL plus the demo logins
(`admin` / `nora.brv` / `ryan.alp` / `hr.cdr`, all using `DEMO_PASSWORD`; `admin` uses `ADMIN_PASSWORD`).

## Database

* `database/schema.sql` creates every table (idempotent) and runs automatically at start-up.
  Manual use: `sqlite3 data/blms.db < database/schema.sql`.
* `database/seed.sql` loads demo data (units, license catalog, 104 licenses, 6 demo users **without passwords**)
  into an **empty** database. Set `AUTO_SEED=false` to start empty. Regenerate it with `npm run seed:generate`.
* Back up by copying `data/blms.db` (stop the app first, or use `sqlite3 data/blms.db ".backup backup.db"`).

## First admin login

1. Open the site, sign in with User ID **`admin`** and the `ADMIN_PASSWORD` you set.
2. Go to **User Governance** and either set passwords for the demo users or delete them and add real users
   (password minimum 10 characters; the server stores only a salted scrypt hash).
3. Open **Notification Center** and replace the placeholder `@example.com` recipients with real addresses.
4. Optional demo: set `SEED_DEMO_USERS=true` and `DEMO_PASSWORD=<10+ chars>` once, on a fresh database, to
   give all demo accounts (`ryan.alp`, `nora.brv`, `hr.cdr`, `director`, `fiona`) that password.

API route/role table: `docs/API.md`.

Roles: **Administrator** (everything), **Verifier** (reviews/locks records), **Operator / Contributor**
(creates/edits unlocked records in their units), **Viewer** (read only). Roles and unit scope are enforced by the
server on every save, not only in the UI.

## Branding changes

* Company/unit codes, license types and names, payment portals, thresholds and menu access: **Admin panel**
  screens (stored in the database).
* Colours: CSS variables at the top of `src/index.css` (`--brand`, `--brand-hover`, `--brand-light`).
* Logo/wordmark and product name: `src/components/LoginScreen.tsx` and `src/components/Sidebar.tsx`;
  page title in `index.html`. Rebuild with `npm run build` after changing code.

## Development

```bash
cp .env.example .env && set -a && . ./.env && set +a   # ADMIN_PASSWORD required; SESSION_SECRET optional in dev
npm install
npm run dev     # API on :3000, Vite dev server on http://localhost:5173 (proxies /api)
npm run lint    # type-check
npm test        # API & authorization tests
```

## Troubleshooting

* *"No user can sign in yet"* in the log → `ADMIN_PASSWORD` was not set on first start. Set it and restart
  (it only applies while no account has a password).
* *Forgot the admin password* → stop the app, then run
  `sqlite3 data/blms.db "UPDATE users SET pw_hash=NULL WHERE id='u1'"`, start with a new `ADMIN_PASSWORD`.
* *"Data was changed by someone else"* toast → another user saved first; the screen reloads the latest data.
* Port in use → change `PORT`.

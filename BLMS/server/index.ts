import express from 'express';
import path from 'node:path';
import fs from 'node:fs';
import { PORT, isProd, DB_PATH } from './config';
import { db, migrate, seedIfEmpty, rowToUser, type UserRow } from './db';
import {
  requireAuth, requireRole, csrfGuard, setSessionCookie, clearSessionCookie, verifyPassword, hashPassword, passwordProblem,
  throttleCheck, throttleFail, throttleClear, countUsersWithPassword, type AuthedRequest
} from './auth';
import { loadState, saveLicenses, saveUsers, saveSettings, saveNotificationRuntime, appendLogs, HttpError, getRev } from './state';

migrate();
if (process.env.AUTO_SEED !== 'false' && seedIfEmpty()) console.log('[db] empty database - loaded database/seed.sql');
bootstrapPasswords();

const app = express();
app.disable('x-powered-by');
app.set('trust proxy', process.env.TRUST_PROXY === 'true');
app.use((_req, res, next) => {
  res.setHeader('X-Content-Type-Options', 'nosniff');
  res.setHeader('X-Frame-Options', 'DENY');
  res.setHeader('Referrer-Policy', 'same-origin');
  next();
});
app.use(express.json({ limit: '60mb' })); // license attachments are embedded in records
app.use('/api', csrfGuard);

/*
 * ROUTE SECURITY TABLE  (docs/API.md has the same table)
 * Method  Path                          Middleware                                  Who
 * POST    /api/auth/login               csrfGuard + login throttle                  public (creates the session)
 * POST    /api/auth/logout              requireAuth                                 any signed-in user
 * POST    /api/auth/password            requireAuth + requireRole(ALL_ROLES)        any signed-in user (needs current pw)
 * PUT     /api/admin/users              requireAuth + requireRole(ADMIN)            Administrator only
 * PUT     /api/admin/settings           requireAuth + requireRole(ADMIN)            Administrator only
 * PUT     /api/licenses                 requireAuth + requireRole(EDITORS)          Admin / Verifier / Operator; record- and unit-level rules in state.ts
 * PUT     /api/notifications/runtime    requireAuth + requireRole(EDITORS)          Admin / Verifier / Operator (scanner counters only)
 * POST    /api/logs                     requireAuth + requireRole(ALL_ROLES)        append-only audit / activity / notification logs
 * GET     /api/state, /api/auth/me      requireAuth + requireRole(ALL_ROLES)        read
 * There are no DELETE routes: a license deletion is part of PUT /api/licenses and is authorized per record.
 * Every non-GET /api request also passes csrfGuard (custom header + JSON).
 */
const ALL_ROLES = ['Administrator', 'Verifier', 'Operator / Contributor', 'Viewer'];
const EDITORS = ['Administrator', 'Verifier', 'Operator / Contributor'];
const ADMIN = ['Administrator'];

app.get('/api/health', (_req, res) => res.json({ ok: true, rev: getRev() }));

app.post('/api/auth/login', (req, res) => {
  const loginId = String(req.body?.loginId ?? '').trim();
  const password = String(req.body?.password ?? '');
  if (!loginId || !password) return res.status(400).json({ error: 'Please enter both User ID and Password.' });
  const key = `${req.ip}|${loginId.toLowerCase()}`;
  const wait = throttleCheck(key);
  if (wait) return res.status(429).json({ error: `Too many failed attempts. Try again in ${Math.ceil(wait / 60)} minute(s).` });

  const row = db.prepare(
    'SELECT * FROM users WHERE lower(login_id) = lower(?) OR lower(emp_id) = lower(?) OR lower(id) = lower(?)'
  ).get(loginId, loginId, loginId) as UserRow | undefined;
  // Always run a hash comparison so response time does not reveal whether the user exists.
  const ok = verifyPassword(password, row?.pw_hash ?? 'scrypt$00$00');
  if (!row || !ok) { throttleFail(key); return res.status(401).json({ error: 'Invalid User ID or password.' }); }
  throttleClear(key);
  setSessionCookie(res, row.id);
  const ts = Date.now();
  const entry = { id: `login_${ts}_${row.id}`, ts, user: `${row.name} (${row.role})`, action: 'Access', entity: 'Session', entityId: '', unit: 'All', summary: `Signed in as ${row.name}`, changes: [] };
  db.prepare('INSERT OR IGNORE INTO audit_log (k, ts, data) VALUES (?, ?, ?)').run(entry.id, ts, JSON.stringify(entry));
  res.json({ user: rowToUser(row) });
});

app.post('/api/auth/logout', requireAuth, (_req, res) => { clearSessionCookie(res); res.json({ ok: true }); });

app.get('/api/auth/me', requireAuth, (req, res) => res.json({ user: (req as AuthedRequest).user }));

app.post('/api/auth/password', requireAuth, requireRole(...ALL_ROLES), (req, res) => {
  const user = (req as AuthedRequest).user;
  const { currentPassword, newPassword } = req.body ?? {};
  const row = db.prepare('SELECT pw_hash FROM users WHERE id = ?').get(user.id) as { pw_hash: string };
  if (!verifyPassword(String(currentPassword ?? ''), row.pw_hash)) return res.status(400).json({ error: 'Current password is incorrect.' });
  const problem = passwordProblem(newPassword);
  if (problem) return res.status(400).json({ error: problem });
  db.prepare('UPDATE users SET pw_hash = ? WHERE id = ?').run(hashPassword(newPassword), user.id);
  res.json({ ok: true });
});

app.get('/api/state', requireAuth, requireRole(...ALL_ROLES), (_req, res) => res.json(loadState()));

const guarded = (handler: (req: express.Request, res: express.Response) => void) =>
  (req: express.Request, res: express.Response) => {
    try { handler(req, res); } catch (e) {
      if (e instanceof HttpError) return void res.status(e.status).json({ error: e.message });
      throw e;
    }
  };
const actorOf = (req: express.Request) => (req as AuthedRequest).user;
const revOf = (req: express.Request) => {
  const r = req.body?.baseRev;
  if (typeof r !== 'number') throw new HttpError(400, 'baseRev (number) is required.');
  return r;
};

app.put('/api/admin/users', requireAuth, requireRole(...ADMIN), guarded((req, res) => {
  res.json({ rev: saveUsers(actorOf(req), revOf(req), req.body?.users) });
}));

app.put('/api/admin/settings', requireAuth, requireRole(...ADMIN), guarded((req, res) => {
  res.json({ rev: saveSettings(revOf(req), req.body?.settings) });
}));

app.put('/api/licenses', requireAuth, requireRole(...EDITORS), guarded((req, res) => {
  res.json({ rev: saveLicenses(actorOf(req), revOf(req), req.body?.licenses) });
}));

app.put('/api/notifications/runtime', requireAuth, requireRole(...EDITORS), guarded((req, res) => {
  res.json({ rev: saveNotificationRuntime(revOf(req), req.body?.runtime) });
}));

app.post('/api/logs', requireAuth, requireRole(...ALL_ROLES), guarded((req, res) => {
  appendLogs(actorOf(req), req.body ?? {});
  res.json({ ok: true, rev: getRev() });
}));

app.use('/api', (_req, res) => res.status(404).json({ error: 'Not found.' }));

// Static frontend (production build)
const dist = path.resolve(process.cwd(), 'dist');
if (fs.existsSync(dist)) {
  app.use(express.static(dist, { index: false, maxAge: '1h' }));
  app.get('*', (_req, res) => res.sendFile(path.join(dist, 'index.html')));
}

app.use((err: Error, _req: express.Request, res: express.Response, _next: express.NextFunction) => {
  console.error(err);
  res.status(500).json({ error: 'Internal server error.' });
});

app.listen(PORT, () => {
  console.log(`BLMS listening on http://localhost:${PORT} (${isProd ? 'production' : 'development'}), db: ${DB_PATH}`);
  if (countUsersWithPassword() === 0) {
    console.warn('[auth] No user can sign in yet. Set ADMIN_PASSWORD (10+ chars) in the environment and restart. See HowToSetup.md.');
  }
});

/** First-run credentials come from the environment - nothing is hard-coded. */
function bootstrapPasswords() {
  const adminPw = process.env.ADMIN_PASSWORD;
  if (adminPw) {
    const problem = passwordProblem(adminPw);
    if (problem) { console.error(`FATAL: ADMIN_PASSWORD invalid - ${problem}`); process.exit(1); }
    const admin = db.prepare("SELECT id FROM users WHERE role='Administrator' AND pw_hash IS NULL ORDER BY created_at, id LIMIT 1").get() as { id: string } | undefined;
    if (admin && countUsersWithPassword() === 0) {
      db.prepare('UPDATE users SET pw_hash = ? WHERE id = ?').run(hashPassword(adminPw), admin.id);
      console.log('[auth] Administrator password set from ADMIN_PASSWORD.');
    }
  }
  const demoPw = process.env.DEMO_PASSWORD;
  if (demoPw && process.env.SEED_DEMO_USERS === 'true') {
    const problem = passwordProblem(demoPw);
    if (problem) { console.error(`FATAL: DEMO_PASSWORD invalid - ${problem}`); process.exit(1); }
    const n = db.prepare('UPDATE users SET pw_hash = ? WHERE pw_hash IS NULL').run(hashPassword(demoPw)).changes;
    if (n) console.log(`[auth] DEMO_PASSWORD applied to ${n} demo account(s).`);
  }
}

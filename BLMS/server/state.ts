import { db, transaction, rowToUser, type UserRow, type PublicUser } from './db';
import { hashPassword, passwordProblem } from './auth';

// Keys stored in the `settings` table. Only Administrators may change them.
export const SETTING_KEYS = [
  'companies', 'licenseTypes', 'licenseNames', 'paymentLinks', 'alertThreshold',
  'licenseThresholds', 'menuPermissions', 'unitMenuPermissions', 'notificationConfig'
] as const;
// Runtime counters the auto-notification scanner updates on behalf of any non-viewer.
const RUNTIME_NOTIFY_FIELDS = ['lastAutoRunAt', 'autoRunCountToday', 'lastAutoRunDate'];

const j = (v: unknown) => JSON.stringify(v ?? null);
const parse = <T>(s: string, fb: T): T => { try { return JSON.parse(s) as T; } catch { return fb; } };

export class HttpError extends Error {
  constructor(public status: number, message: string) { super(message); }
}

export function getRev(): number {
  return Number((db.prepare("SELECT value FROM meta WHERE key='rev'").get() as { value: string }).value);
}

export function loadState() {
  const settings: Record<string, unknown> = {};
  for (const r of db.prepare('SELECT key, value FROM settings').all() as { key: string; value: string }[]) {
    settings[r.key] = parse(r.value, null);
  }
  const users = (db.prepare('SELECT * FROM users ORDER BY created_at, id').all() as unknown as UserRow[]).map(rowToUser);
  const licenses = (db.prepare('SELECT data FROM licenses').all() as { data: string }[]).map(r => parse(r.data, {}));
  const logs = (table: string, limit: number) =>
    (db.prepare(`SELECT data FROM ${table} ORDER BY ts DESC, seq DESC LIMIT ?`).all(limit) as { data: string }[]).map(r => parse(r.data, {}));
  return {
    rev: getRev(),
    state: {
      ...settings,
      users,
      licenses,
      notificationLog: logs('notification_log', 2000),
      auditLog: logs('audit_log', 1000),
      activity: logs('activity', 300)
    }
  };
}

type Actor = PublicUser;
type Dict = Record<string, any>;

function inScope(u: Actor, unit: string) { return u.units === 'All' || (Array.isArray(u.units) && u.units.includes(unit)); }
function roleIn(u: Actor, unit: string): string {
  if (u.role === 'Administrator') return 'Administrator';
  return (u.unitRoles && u.unitRoles[unit]) || u.role;
}

function applyLicenses(actor: Actor, incoming: Dict[]) {
  const existing = new Map<string, Dict>();
  for (const r of db.prepare('SELECT id, data FROM licenses').all() as { id: string; data: string }[]) existing.set(r.id, parse(r.data, {}));
  const seen = new Set<string>();
  const upsert = db.prepare(`INSERT INTO licenses (id, company, type, name, till_date, status, locked, review_state, data, updated_at, updated_by)
    VALUES (@id,@company,@type,@name,@till,@status,@locked,@rs,@data,@now,@by)
    ON CONFLICT(id) DO UPDATE SET company=@company,type=@type,name=@name,till_date=@till,status=@status,locked=@locked,review_state=@rs,data=@data,updated_at=@now,updated_by=@by`);
  const del = db.prepare('DELETE FROM licenses WHERE id = ?');

  for (const lic of incoming) {
    if (!lic || typeof lic.id !== 'string' || typeof lic.company !== 'string') throw new HttpError(400, 'Invalid license record.');
    seen.add(lic.id);
    const prev = existing.get(lic.id);
    if (prev && j(prev) === j(lic)) continue;

    const unit: string = lic.company;
    if (!inScope(actor, unit)) throw new HttpError(403, `No access to unit ${unit}.`);
    const role = roleIn(actor, unit);
    if (prev) {
      if (!inScope(actor, prev.company)) throw new HttpError(403, `No access to unit ${prev.company}.`);
      const prevRole = roleIn(actor, prev.company);
      if (prevRole === 'Viewer') throw new HttpError(403, 'Viewers cannot modify licenses.');
      if (role === 'Viewer') throw new HttpError(403, 'Viewers cannot modify licenses.');
      if (role === 'Operator / Contributor') {
        if (prev.locked) throw new HttpError(403, `${prev.name} is locked by a reviewer.`);
        if (Boolean(lic.locked)) throw new HttpError(403, 'Only a Verifier or Administrator can lock a record.');
      }
    } else if (role !== 'Administrator' && role !== 'Operator / Contributor') {
      throw new HttpError(403, 'Your role cannot create licenses.');
    } else if (role !== 'Administrator' && lic.locked) {
      throw new HttpError(403, 'Only a Verifier or Administrator can lock a record.');
    }
    upsert.run({
      id: lic.id, company: unit, type: lic.type ?? null, name: lic.name ?? null, till: lic.till ?? null,
      status: lic.status ?? null, locked: lic.locked ? 1 : 0, rs: lic.reviewState ?? null,
      data: JSON.stringify(lic), now: Date.now(), by: actor.name
    });
  }
  for (const [id, prev] of existing) {
    if (seen.has(id)) continue;
    if (!inScope(actor, prev.company)) throw new HttpError(403, `No access to unit ${prev.company}.`);
    const role = roleIn(actor, prev.company);
    if (role === 'Administrator') { del.run(id); continue; }
    if (role === 'Operator / Contributor' && !prev.locked) { del.run(id); continue; }
    throw new HttpError(403, `Your role cannot delete ${prev.name || id}.`);
  }
}

function applyUsers(actor: Actor, incoming: Dict[]) {
  const rows = db.prepare('SELECT * FROM users').all() as unknown as UserRow[];
  const existing = new Map(rows.map(r => [r.id, r]));
  const seen = new Set<string>();
  const upsert = db.prepare(`INSERT INTO users (id, login_id, name, emp_id, dept, desig, role, units, unit_roles, menus, pw_hash)
    VALUES (@id,@login,@name,@emp,@dept,@desig,@role,@units,@uroles,@menus,@pw)
    ON CONFLICT(id) DO UPDATE SET login_id=@login,name=@name,emp_id=@emp,dept=@dept,desig=@desig,role=@role,units=@units,unit_roles=@uroles,menus=@menus,pw_hash=@pw`);
  let changed = false;
  for (const u of incoming) {
    if (!u || typeof u.id !== 'string' || !u.loginId || !u.name) throw new HttpError(400, 'Invalid user record.');
    if (!['Administrator', 'Verifier', 'Operator / Contributor', 'Viewer'].includes(u.role)) throw new HttpError(400, 'Invalid role.');
    seen.add(u.id);
    const prev = existing.get(u.id);
    let pw = prev?.pw_hash ?? null;
    if (typeof u.newPassword === 'string' && u.newPassword.trim()) {
      const problem = passwordProblem(u.newPassword.trim());
      if (problem) throw new HttpError(400, problem);
      pw = hashPassword(u.newPassword.trim());
      changed = true;
    }
    const next = {
      id: u.id, login: String(u.loginId).trim(), name: u.name, emp: u.empId ?? null, dept: u.dept ?? null, desig: u.desig ?? null,
      role: u.role, units: j(u.units ?? 'All'), uroles: u.unitRoles ? j(u.unitRoles) : null, menus: u.menus ? j(u.menus) : null, pw
    };
    if (!prev || prev.login_id !== next.login || prev.name !== next.name || (prev.emp_id ?? null) !== next.emp || (prev.dept ?? null) !== next.dept ||
        (prev.desig ?? null) !== next.desig || prev.role !== next.role || prev.units !== next.units || (prev.unit_roles ?? null) !== next.uroles ||
        (prev.menus ?? null) !== next.menus || prev.pw_hash !== next.pw) changed = true;
    upsert.run(next);
  }
  for (const id of existing.keys()) {
    if (!seen.has(id)) { db.prepare('DELETE FROM users WHERE id = ?').run(id); changed = true; }
  }
  if (!changed) return false;
  // Safety: always keep at least one Administrator who can sign in, and never lock yourself out.
  const admins = db.prepare("SELECT COUNT(*) AS c FROM users WHERE role='Administrator' AND pw_hash IS NOT NULL").get() as { c: number };
  if (admins.c < 1) throw new HttpError(400, 'At least one Administrator with a password must remain.');
  if (!db.prepare('SELECT 1 FROM users WHERE id = ?').get(actor.id)) throw new HttpError(400, 'You cannot delete your own account.');
  return true;
}

function appendLog(table: string, items: Dict[] | undefined, keyOf: (x: Dict) => string) {
  if (!Array.isArray(items)) return;
  const ins = db.prepare(`INSERT OR IGNORE INTO ${table} (k, ts, data) VALUES (?, ?, ?)`);
  for (const it of items) {
    if (!it || typeof it !== 'object') continue;
    ins.run(keyOf(it), Number(it.ts ?? it.at ?? Date.now()), JSON.stringify(it));
  }
}

/** Optimistic-concurrency wrapper: runs fn in a transaction, rejects stale clients, bumps the revision. */
function withRevision(baseRev: number, fn: () => void): number {
  return transaction(() => {
    if (baseRev !== getRev()) throw new HttpError(409, 'Data was changed by someone else. Reloading the latest version.');
    fn();
    const rev = getRev() + 1;
    db.prepare("UPDATE meta SET value = ? WHERE key = 'rev'").run(String(rev));
    return rev;
  });
}

/** PUT /api/licenses - role + unit scope are checked per record in applyLicenses(). */
export function saveLicenses(actor: Actor, baseRev: number, licenses: unknown): number {
  if (!Array.isArray(licenses)) throw new HttpError(400, 'licenses must be an array.');
  return withRevision(baseRev, () => applyLicenses(actor, licenses as Dict[]));
}

/** PUT /api/admin/users - route is Administrator-only; also enforces "last admin" safety. */
export function saveUsers(actor: Actor, baseRev: number, users: unknown): number {
  if (!Array.isArray(users)) throw new HttpError(400, 'users must be an array.');
  return withRevision(baseRev, () => { applyUsers(actor, users as Dict[]); });
}

/** PUT /api/admin/settings - route is Administrator-only; only whitelisted keys are written. */
export function saveSettings(baseRev: number, settings: unknown): number {
  if (!settings || typeof settings !== 'object') throw new HttpError(400, 'settings must be an object.');
  const put = db.prepare('INSERT INTO settings (key, value) VALUES (?, ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value');
  return withRevision(baseRev, () => {
    for (const [key, value] of Object.entries(settings as Dict)) {
      if (!(SETTING_KEYS as readonly string[]).includes(key)) throw new HttpError(400, `Unknown setting: ${key}`);
      put.run(key, j(value));
    }
  });
}

/** PUT /api/notifications/runtime - scanner counters only (Administrator / Verifier / Operator). */
export function saveNotificationRuntime(baseRev: number, runtime: unknown): number {
  if (!runtime || typeof runtime !== 'object') throw new HttpError(400, 'runtime must be an object.');
  return withRevision(baseRev, () => {
    const row = db.prepare("SELECT value FROM settings WHERE key = 'notificationConfig'").get() as { value: string } | undefined;
    const cfg = parse<Dict>(row?.value ?? '{}', {});
    for (const f of RUNTIME_NOTIFY_FIELDS) if (f in (runtime as Dict)) cfg[f] = (runtime as Dict)[f];
    db.prepare("INSERT INTO settings (key, value) VALUES ('notificationConfig', ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value").run(j(cfg));
  });
}

/** POST /api/logs - append-only ledgers (no revision bump). Viewers may add audit/activity but not notification records. */
export function appendLogs(actor: Actor, body: Dict) {
  transaction(() => {
    appendLog('audit_log', body.auditLog, x => String(x.id));
    appendLog('activity', body.activity, x => String(x.id));
    if (actor.role !== 'Viewer') appendLog('notification_log', body.notificationLog, x => `${x.licId}|${x.stage}|${x.at}|${x.via}`);
  });
}

export const NOTIFY_RUNTIME_FIELDS = RUNTIME_NOTIFY_FIELDS;

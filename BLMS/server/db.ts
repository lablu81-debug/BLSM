import { DatabaseSync } from 'node:sqlite'; // built into Node 22.13+ - no native build step
import fs from 'node:fs';
import path from 'node:path';
import { DB_PATH } from './config';

fs.mkdirSync(path.dirname(DB_PATH), { recursive: true });
export const db = new DatabaseSync(DB_PATH);
db.exec('PRAGMA journal_mode = WAL; PRAGMA foreign_keys = ON; PRAGMA busy_timeout = 5000;');

/** Runs fn inside BEGIN IMMEDIATE ... COMMIT (rolls back on error). */
export function transaction<T>(fn: () => T): T {
  db.exec('BEGIN IMMEDIATE');
  try { const r = fn(); db.exec('COMMIT'); return r; } catch (e) { db.exec('ROLLBACK'); throw e; }
}

const dbDir = path.resolve(process.cwd(), 'database');

export function migrate() {
  db.exec(fs.readFileSync(path.join(dbDir, 'schema.sql'), 'utf8'));
}

/** Loads database/seed.sql (demo data) into an empty database. */
export function seedIfEmpty(): boolean {
  const has = db.prepare("SELECT 1 FROM settings WHERE key = 'companies'").get();
  if (has) return false;
  const file = path.join(dbDir, 'seed.sql');
  if (!fs.existsSync(file)) return false;
  db.exec(fs.readFileSync(file, 'utf8'));
  return true;
}

export interface UserRow {
  id: string; login_id: string; name: string; emp_id: string | null; dept: string | null; desig: string | null;
  role: string; units: string; unit_roles: string | null; menus: string | null; pw_hash: string | null;
}

export function getUserById(id: string) {
  return db.prepare('SELECT * FROM users WHERE id = ?').get(id) as unknown as UserRow | undefined;
}

const parse = <T>(s: string | null | undefined, fallback: T): T => {
  if (s == null) return fallback;
  try { return JSON.parse(s) as T; } catch { return fallback; }
};

/** Row -> client UserAccount shape (never includes the password hash). */
export function rowToUser(r: UserRow) {
  return {
    id: r.id,
    name: r.name,
    empId: r.emp_id ?? undefined,
    dept: r.dept ?? undefined,
    desig: r.desig ?? undefined,
    role: r.role as 'Administrator' | 'Verifier' | 'Operator / Contributor' | 'Viewer',
    units: parse<'All' | string[]>(r.units, 'All'),
    unitRoles: parse<Record<string, string> | undefined>(r.unit_roles, undefined),
    menus: parse<string[] | undefined>(r.menus, undefined),
    loginId: r.login_id
  };
}
export type PublicUser = ReturnType<typeof rowToUser>;

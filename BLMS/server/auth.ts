import crypto from 'node:crypto';
import type { Request, Response, NextFunction } from 'express';
import { COOKIE_SECURE, SESSION_HOURS, SESSION_SECRET } from './config';
import { db, getUserById, rowToUser, type UserRow } from './db';

const COOKIE = 'blms_session';

// ---------- password hashing (scrypt) ----------
export function hashPassword(pw: string): string {
  const salt = crypto.randomBytes(16);
  const hash = crypto.scryptSync(pw, salt, 64);
  return `scrypt$${salt.toString('hex')}$${hash.toString('hex')}`;
}
export function verifyPassword(pw: string, stored?: string | null): boolean {
  if (!stored) return false;
  const [scheme, saltHex, hashHex] = stored.split('$');
  if (scheme !== 'scrypt' || !saltHex || !hashHex) return false;
  const expected = Buffer.from(hashHex, 'hex');
  const actual = crypto.scryptSync(pw, Buffer.from(saltHex, 'hex'), expected.length);
  return crypto.timingSafeEqual(expected, actual);
}
export function passwordProblem(pw: unknown): string | null {
  if (typeof pw !== 'string' || pw.length < 10) return 'Password must be at least 10 characters.';
  if (pw.length > 200) return 'Password is too long.';
  return null;
}

// ---------- signed session token ----------
function sign(payload: string): string {
  return crypto.createHmac('sha256', SESSION_SECRET).update(payload).digest('base64url');
}
export function issueToken(uid: string): string {
  const exp = Date.now() + SESSION_HOURS * 3600_000;
  const payload = `${uid}.${exp}`;
  return `${Buffer.from(payload).toString('base64url')}.${sign(payload)}`;
}
function readToken(token: string | undefined): string | null {
  if (!token) return null;
  const [p, sig] = token.split('.');
  if (!p || !sig) return null;
  let payload: string;
  try { payload = Buffer.from(p, 'base64url').toString(); } catch { return null; }
  const good = sign(payload);
  if (sig.length !== good.length || !crypto.timingSafeEqual(Buffer.from(sig), Buffer.from(good))) return null;
  const idx = payload.lastIndexOf('.');
  const uid = payload.slice(0, idx);
  const exp = Number(payload.slice(idx + 1));
  if (!uid || !Number.isFinite(exp) || exp < Date.now()) return null;
  return uid;
}

function parseCookies(header: string | undefined): Record<string, string> {
  const out: Record<string, string> = {};
  (header || '').split(';').forEach(part => {
    const i = part.indexOf('=');
    if (i > 0) out[part.slice(0, i).trim()] = decodeURIComponent(part.slice(i + 1).trim());
  });
  return out;
}

export function setSessionCookie(res: Response, uid: string) {
  const parts = [
    `${COOKIE}=${encodeURIComponent(issueToken(uid))}`,
    'Path=/', 'HttpOnly', 'SameSite=Strict',
    `Max-Age=${SESSION_HOURS * 3600}`
  ];
  if (COOKIE_SECURE) parts.push('Secure');
  res.setHeader('Set-Cookie', parts.join('; '));
}
export function clearSessionCookie(res: Response) {
  res.setHeader('Set-Cookie', `${COOKIE}=; Path=/; HttpOnly; SameSite=Strict; Max-Age=0`);
}

// ---------- middleware ----------
export type AuthedRequest = Request & { user: ReturnType<typeof rowToUser> };

/** Requires a valid session. Loads the user from the DB on every request (role changes apply immediately). */
export function requireAuth(req: Request, res: Response, next: NextFunction) {
  const uid = readToken(parseCookies(req.headers.cookie)[COOKIE]);
  const row = uid ? (getUserById(uid) as UserRow | undefined) : undefined;
  if (!row || !row.pw_hash) return res.status(401).json({ error: 'Not signed in.' });
  (req as AuthedRequest).user = rowToUser(row);
  next();
}

/** Requires one of the given roles (checked against the DB-loaded user, never client input). */
export function requireRole(...roles: string[]) {
  return (req: Request, res: Response, next: NextFunction) => {
    const u = (req as AuthedRequest).user;
    if (!u || !roles.includes(u.role)) return res.status(403).json({ error: 'You do not have permission for this action.' });
    next();
  };
}

/** CSRF defence for cookie auth: mutating requests must be same-origin JSON with a custom header. */
export function csrfGuard(req: Request, res: Response, next: NextFunction) {
  if (['GET', 'HEAD', 'OPTIONS'].includes(req.method)) return next();
  if (req.headers['x-requested-with'] !== 'blms') return res.status(403).json({ error: 'Missing X-Requested-With header.' });
  next();
}

// ---------- login throttling ----------
const attempts = new Map<string, { n: number; until: number }>();
export function throttleCheck(key: string): number {
  const a = attempts.get(key);
  return a && a.until > Date.now() && a.n >= 5 ? Math.ceil((a.until - Date.now()) / 1000) : 0;
}
export function throttleFail(key: string) {
  const a = attempts.get(key);
  const now = Date.now();
  if (!a || a.until < now) attempts.set(key, { n: 1, until: now + 15 * 60_000 });
  else a.n += 1;
}
export function throttleClear(key: string) { attempts.delete(key); }

export function countUsersWithPassword(): number {
  return (db.prepare('SELECT COUNT(*) AS c FROM users WHERE pw_hash IS NOT NULL').get() as { c: number }).c;
}

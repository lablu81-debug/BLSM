import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';

const root = process.cwd();
export const isProd = process.env.NODE_ENV === 'production';
export const PORT = Number(process.env.PORT || 3000);
export const DB_PATH = path.resolve(root, process.env.DATABASE_PATH || 'data/blms.db');
export const COOKIE_SECURE = process.env.COOKIE_SECURE === 'true';
export const SESSION_HOURS = Number(process.env.SESSION_HOURS || 12);

function resolveSecret(): string {
  const fromEnv = process.env.SESSION_SECRET;
  if (fromEnv && fromEnv.length >= 32) return fromEnv;
  if (isProd) {
    console.error('FATAL: SESSION_SECRET must be set (32+ characters) when NODE_ENV=production.');
    console.error('Generate one with:  node -e "console.log(require(\'crypto\').randomBytes(48).toString(\'hex\'))"');
    process.exit(1);
  }
  // Development convenience: persist a random secret next to the DB so sessions survive restarts.
  const file = path.resolve(path.dirname(DB_PATH), '.dev-session-secret');
  fs.mkdirSync(path.dirname(file), { recursive: true });
  if (fs.existsSync(file)) return fs.readFileSync(file, 'utf8').trim();
  const s = crypto.randomBytes(48).toString('hex');
  fs.writeFileSync(file, s, { mode: 0o600 });
  console.warn('[config] SESSION_SECRET not set - generated a development secret in data/.dev-session-secret');
  return s;
}
export const SESSION_SECRET = resolveSecret();

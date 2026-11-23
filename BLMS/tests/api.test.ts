import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { spawn, type ChildProcess } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

const PORT = 3900 + Math.floor(Math.random() * 90);
const BASE = `http://127.0.0.1:${PORT}`;
const ADMIN_PW = 'Test-Admin-Pass-1';
const DEMO_PW = 'Test-Demo-Pass-1';
let server: ChildProcess;
let dir: string;

async function call(method: string, url: string, body?: unknown, cookie?: string) {
  const res = await fetch(BASE + url, {
    method,
    headers: { 'Content-Type': 'application/json', 'X-Requested-With': 'blms', ...(cookie ? { Cookie: cookie } : {}) },
    body: body === undefined ? undefined : JSON.stringify(body)
  });
  const text = await res.text();
  return { status: res.status, json: text ? JSON.parse(text) : null, cookie: (res.headers.get('set-cookie') || '').split(';')[0] };
}
async function signIn(loginId: string, password: string) {
  const r = await call('POST', '/api/auth/login', { loginId, password });
  assert.equal(r.status, 200, `login ${loginId}`);
  return r.cookie;
}
async function getState(cookie: string) { return (await call('GET', '/api/state', undefined, cookie)).json; }

before(async () => {
  dir = fs.mkdtempSync(path.join(os.tmpdir(), 'blms-test-'));
  server = spawn(process.execPath, ['--import', 'tsx', 'server/index.ts'], {
    env: { ...process.env, PORT: String(PORT), DATABASE_PATH: path.join(dir, 'test.db'), ADMIN_PASSWORD: ADMIN_PW,
      DEMO_PASSWORD: DEMO_PW, SEED_DEMO_USERS: 'true', SESSION_SECRET: 'x'.repeat(48) },
    stdio: 'ignore'
  });
  for (let i = 0; i < 60; i++) {
    try { if ((await fetch(`${BASE}/api/health`)).ok) return; } catch { /* not up yet */ }
    await new Promise(r => setTimeout(r, 250));
  }
  throw new Error('server did not start');
});
after(() => { server?.kill(); fs.rmSync(dir, { recursive: true, force: true }); });

test('state requires authentication', async () => {
  assert.equal((await call('GET', '/api/state')).status, 401);
  assert.equal((await call('PUT', '/api/licenses', { baseRev: 1, licenses: [] })).status, 401);
});

test('login rejects wrong and legacy default passwords', async () => {
  assert.equal((await call('POST', '/api/auth/login', { loginId: 'admin', password: 'blms123' })).status, 401);
  assert.equal((await call('POST', '/api/auth/login', { loginId: 'nobody', password: ADMIN_PW })).status, 401);
});

test('mutating requests need the CSRF header', async () => {
  const res = await fetch(`${BASE}/api/auth/login`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: '{}' });
  assert.equal(res.status, 403);
});

test('state never exposes password hashes', async () => {
  const cookie = await signIn('admin', ADMIN_PW);
  const { state } = await getState(cookie);
  assert.ok(state.users.length >= 5);
  assert.ok(!JSON.stringify(state).includes('scrypt$'));
  assert.ok(!JSON.stringify(state).includes('pw_hash'));
});

const lic = (state: any, pred: (l: any) => boolean) => state.licenses.find(pred);
const withLic = (state: any, next: any) => state.licenses.map((l: any) => (l.id === next.id ? next : l));

test('viewer cannot modify licenses, settings or users', async () => {
  const cookie = await signIn('hr.cdr', DEMO_PW);
  const { rev, state } = await getState(cookie);
  const l = { ...lic(state, (x: any) => x.company === 'CDR'), comments: 'tampered' };
  assert.equal((await call('PUT', '/api/licenses', { baseRev: rev, licenses: withLic(state, l) }, cookie)).status, 403);
  assert.equal((await call('PUT', '/api/admin/settings', { baseRev: rev, settings: { alertThreshold: 5 } }, cookie)).status, 403);
  assert.equal((await call('PUT', '/api/admin/users', { baseRev: rev, users: state.users }, cookie)).status, 403);
  assert.equal((await call('POST', '/api/logs', { auditLog: [{ id: 'v1', ts: Date.now() }] }, cookie)).status, 200);
});

test('verifier and operator cannot reach admin routes', async () => {
  for (const id of ['nora.brv', 'ryan.alp']) {
    const cookie = await signIn(id, DEMO_PW);
    const { rev, state } = await getState(cookie);
    assert.equal((await call('PUT', '/api/admin/settings', { baseRev: rev, settings: { alertThreshold: 5 } }, cookie)).status, 403, id);
    assert.equal((await call('PUT', '/api/admin/users', { baseRev: rev, users: state.users }, cookie)).status, 403, id);
  }
});

test('operator is limited to own units and cannot lock records', async () => {
  const cookie = await signIn('ryan.alp', DEMO_PW);
  const { rev, state } = await getState(cookie);
  const other = lic(state, (l: any) => l.company === 'BRV' && !l.locked);
  assert.equal((await call('PUT', '/api/licenses', { baseRev: rev, licenses: withLic(state, { ...other, comments: 'cross-unit edit' }) }, cookie)).status, 403);

  const own = lic(state, (l: any) => l.company === 'ALP' && !l.locked);
  assert.equal((await call('PUT', '/api/licenses', { baseRev: rev, licenses: withLic(state, { ...own, locked: true }) }, cookie)).status, 403);

  const ok = await call('PUT', '/api/licenses', { baseRev: rev, licenses: withLic(state, { ...own, comments: 'updated by operator' }) }, cookie);
  assert.equal(ok.status, 200);
});

test('verifier can update a record in scope', async () => {
  const cookie = await signIn('nora.brv', DEMO_PW);
  const { rev, state } = await getState(cookie);
  const own = lic(state, (l: any) => l.company === 'BRV');
  assert.equal((await call('PUT', '/api/licenses', { baseRev: rev, licenses: withLic(state, { ...own, feedback: 'checked' }) }, cookie)).status, 200);
});

test('stale revision is rejected with 409', async () => {
  const cookie = await signIn('admin', ADMIN_PW);
  const { rev } = await getState(cookie);
  assert.equal((await call('PUT', '/api/admin/settings', { baseRev: rev - 1, settings: { alertThreshold: 50 } }, cookie)).status, 409);
});

test('unknown settings keys are rejected', async () => {
  const cookie = await signIn('admin', ADMIN_PW);
  const { rev } = await getState(cookie);
  assert.equal((await call('PUT', '/api/admin/settings', { baseRev: rev, settings: { hack: 1 } }, cookie)).status, 400);
});

test('administrator can change settings and add a user with a hashed password', async () => {
  const cookie = await signIn('admin', ADMIN_PW);
  let { rev, state } = await getState(cookie);
  const s = await call('PUT', '/api/admin/settings', { baseRev: rev, settings: { alertThreshold: 45 } }, cookie);
  assert.equal(s.status, 200);
  rev = s.json.rev;
  const users = [...state.users, { id: 'u_test', name: 'Test Viewer', role: 'Viewer', units: ['ALP'], loginId: 'test.viewer', newPassword: 'Another-Pass-123' }];
  assert.equal((await call('PUT', '/api/admin/users', { baseRev: rev, users }, cookie)).status, 200);
  assert.equal((await getState(cookie)).state.alertThreshold, 45);
  await signIn('test.viewer', 'Another-Pass-123');
});

test('cannot remove the last administrator', async () => {
  const cookie = await signIn('admin', ADMIN_PW);
  const { rev, state } = await getState(cookie);
  const users = state.users.map((u: any) => (u.role === 'Administrator' ? { ...u, role: 'Viewer' } : u));
  assert.equal((await call('PUT', '/api/admin/users', { baseRev: rev, users }, cookie)).status, 400);
});

test('short passwords are rejected', async () => {
  const cookie = await signIn('admin', ADMIN_PW);
  assert.equal((await call('POST', '/api/auth/password', { currentPassword: ADMIN_PW, newPassword: 'short' }, cookie)).status, 400);
});

test('every mutating route rejects anonymous callers', async () => {
  const routes: [string, string][] = [
    ['POST', '/api/auth/logout'], ['POST', '/api/auth/password'], ['PUT', '/api/admin/users'], ['PUT', '/api/admin/settings'],
    ['PUT', '/api/licenses'], ['PUT', '/api/notifications/runtime'], ['POST', '/api/logs'], ['DELETE', '/api/licenses/x']
  ];
  for (const [method, url] of routes) {
    const r = await call(method, url, { baseRev: 1 });
    assert.ok([401, 404].includes(r.status), `${method} ${url} -> ${r.status}`);
  }
});

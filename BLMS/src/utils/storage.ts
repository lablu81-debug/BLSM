import {
  LicenseEntry,
  UserAccount,
  PaymentLink,
  NotificationConfig,
  NotificationRecord,
  AuditEntry,
  ActivityItem
} from '../types';

export interface AppStateData {
  companies: string[];
  licenseTypes: string[];
  licenseNames: Record<string, string[]>;
  licenses: LicenseEntry[];
  users: UserAccount[];
  paymentLinks: PaymentLink[];
  alertThreshold: number;
  licenseThresholds: Record<string, number>;
  menuPermissions: Record<string, string[]>;
  unitMenuPermissions: Record<string, Record<string, string[]>>;
  notificationConfig: NotificationConfig;
  notificationLog: NotificationRecord[];
  auditLog: AuditEntry[];
  activity: ActivityItem[];
}

/** Thin client for the BLMS server API (cookie session, same origin). */
export class ApiError extends Error {
  constructor(public status: number, message: string) { super(message); }
}

async function api<T>(method: string, url: string, body?: unknown): Promise<T> {
  const res = await fetch(url, {
    method,
    credentials: 'same-origin',
    headers: { 'Content-Type': 'application/json', 'X-Requested-With': 'blms' },
    body: body === undefined ? undefined : JSON.stringify(body)
  });
  let json: any = null;
  try { json = await res.json(); } catch { /* non-JSON response */ }
  if (!res.ok) throw new ApiError(res.status, json?.error || `Request failed (${res.status})`);
  return json as T;
}

export const login = (loginId: string, password: string) =>
  api<{ user: UserAccount }>('POST', '/api/auth/login', { loginId, password });
export const logout = () => api<{ ok: true }>('POST', '/api/auth/logout');
export const fetchMe = () => api<{ user: UserAccount }>('GET', '/api/auth/me');
export const changePassword = (currentPassword: string, newPassword: string) =>
  api<{ ok: true }>('POST', '/api/auth/password', { currentPassword, newPassword });
export const fetchState = () => api<{ rev: number; state: AppStateData }>('GET', '/api/state');
const SETTING_KEYS = [
  'companies', 'licenseTypes', 'licenseNames', 'paymentLinks', 'alertThreshold',
  'licenseThresholds', 'menuPermissions', 'unitMenuPermissions', 'notificationConfig'
] as const;
const RUNTIME_FIELDS = ['lastAutoRunAt', 'autoRunCountToday', 'lastAutoRunDate'] as const;
const same = (a: unknown, b: unknown) => JSON.stringify(a) === JSON.stringify(b);
const stripRuntime = (c: any) => Object.fromEntries(Object.entries(c || {}).filter(([k]) => !(RUNTIME_FIELDS as readonly string[]).includes(k)));

/**
 * Sends only what changed since `prev` to the matching server route (each route has its own role check):
 * users -> PUT /api/admin/users (admin), settings -> PUT /api/admin/settings (admin),
 * scanner counters -> PUT /api/notifications/runtime, licenses -> PUT /api/licenses, ledgers -> POST /api/logs.
 * Returns the latest revision.
 */
export async function pushChanges(baseRev: number, prev: AppStateData, next: AppStateData): Promise<number> {
  let rev = baseRev;

  if (!same(prev.users, next.users)) {
    rev = (await api<{ rev: number }>('PUT', '/api/admin/users', { baseRev: rev, users: next.users })).rev;
  }

  const changedSettings: Record<string, unknown> = {};
  for (const k of SETTING_KEYS) {
    if (k === 'notificationConfig') {
      if (!same(stripRuntime(prev[k]), stripRuntime(next[k]))) changedSettings[k] = next[k];
    } else if (!same(prev[k], next[k])) changedSettings[k] = next[k];
  }
  if (Object.keys(changedSettings).length) {
    rev = (await api<{ rev: number }>('PUT', '/api/admin/settings', { baseRev: rev, settings: changedSettings })).rev;
  }

  const runtime: Record<string, unknown> = {};
  for (const f of RUNTIME_FIELDS) {
    if (!same((prev.notificationConfig as any)?.[f], (next.notificationConfig as any)?.[f])) runtime[f] = (next.notificationConfig as any)?.[f];
  }
  if (Object.keys(runtime).length && !('notificationConfig' in changedSettings)) {
    rev = (await api<{ rev: number }>('PUT', '/api/notifications/runtime', { baseRev: rev, runtime })).rev;
  }

  if (!same(prev.licenses, next.licenses)) {
    rev = (await api<{ rev: number }>('PUT', '/api/licenses', { baseRev: rev, licenses: next.licenses })).rev;
  }

  const prevAudit = new Set(prev.auditLog.map(x => x.id));
  const prevAct = new Set(prev.activity.map(x => x.id));
  const key = (n: NotificationRecord) => `${n.licId}|${n.stage}|${n.at}|${n.via}`;
  const prevNotif = new Set(prev.notificationLog.map(key));
  const logs = {
    auditLog: next.auditLog.filter(x => !prevAudit.has(x.id)),
    activity: next.activity.filter(x => !prevAct.has(x.id)),
    notificationLog: next.notificationLog.filter(x => !prevNotif.has(key(x)))
  };
  if (logs.auditLog.length || logs.activity.length || logs.notificationLog.length) {
    await api<{ ok: true }>('POST', '/api/logs', logs);
  }
  return rev;
}

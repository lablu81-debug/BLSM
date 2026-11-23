# BLMS API — route security table

Source of truth: the comment block above the routes in `server/index.ts`; per-record rules in `server/state.ts`.
All `/api` requests that are not `GET` must send `Content-Type: application/json` and `X-Requested-With: blms`
(CSRF guard). Sessions are an HttpOnly, SameSite=Strict cookie. The user and role are re-read from the database on
**every** request, never trusted from the client.

| Method | Path | Middleware | Allowed roles |
| --- | --- | --- | --- |
| POST | `/api/auth/login` | csrfGuard, login throttle (5 failures → 15 min lock) | public (creates the session) |
| POST | `/api/auth/logout` | `requireAuth` | any signed-in user |
| POST | `/api/auth/password` | `requireAuth` + `requireRole(all)` + current password | any signed-in user |
| PUT | `/api/admin/users` | `requireAuth` + `requireRole('Administrator')` | **Administrator only** |
| PUT | `/api/admin/settings` | `requireAuth` + `requireRole('Administrator')` | **Administrator only** |
| PUT | `/api/licenses` | `requireAuth` + `requireRole(Administrator, Verifier, Operator / Contributor)` | see record rules below |
| PUT | `/api/notifications/runtime` | `requireAuth` + `requireRole(Administrator, Verifier, Operator / Contributor)` | scanner counters only |
| POST | `/api/logs` | `requireAuth` + `requireRole(all)` | append-only ledgers (Viewers: audit/activity only) |
| GET | `/api/state`, `/api/auth/me` | `requireAuth` + `requireRole(all)` | read (password hashes never returned) |
| GET | `/api/health` | none | liveness probe |

There are **no DELETE routes**. Deleting a license is a missing id in `PUT /api/licenses`, authorized per record.

## Record-level rules (`PUT /api/licenses`)

* Unit scope: the user's `units` must include the record's `company` (Administrators: all units). A user's per-unit role
  (`unitRoles`) overrides their global role for that unit.
* Administrator: create / update / delete / lock any record.
* Verifier: update records in scope (review fields, lock). Cannot create or delete.
* Operator / Contributor: create / update / delete **unlocked** records in scope; cannot set `locked`.
* Viewer: none (route returns 403).

## Concurrency

Mutating routes (except `POST /api/logs`) require `baseRev` (number from `GET /api/state`). A stale value returns
**409**; the web app then reloads the latest data. Passwords: the admin form sends `newPassword` inside a user object;
the server hashes it with scrypt and never returns it (minimum 10 characters).

Automated coverage: `tests/api.test.ts` (`npm test`) asserts the matrix above, including anonymous 401s on every
mutating route and 403s for Viewer / Operator / Verifier on admin routes.

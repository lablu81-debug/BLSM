# Audit evidence (v1.0.3, 2026-11-22)

Everything below was produced from this archive. Re-run the commands to reproduce.

## 1. Source completeness
All components are plain, readable source (TypeScript / TSX / SQL / Markdown). There are no compiled, minified,
obfuscated or vendored bundles in the repository (`find . -name "*.min.js" -o -name "*.map"` returns nothing outside
`node_modules`/`dist`, which are build outputs and are excluded). No mobile app exists.

Source tree:
```
database/schema.sql
database/seed.sql
scripts/generate-seed.ts
server/auth.ts
server/config.ts
server/db.ts
server/index.ts
server/state.ts
src/App.tsx
src/components/AdminPanelTab.tsx
src/components/AuditLogTab.tsx
src/components/DashboardTab.tsx
src/components/FeedbackTab.tsx
src/components/ImportTab.tsx
src/components/KpiTab.tsx
src/components/LoginScreen.tsx
src/components/MasterDataTab.tsx
src/components/Modals.tsx
src/components/NewEntryTab.tsx
src/components/NotificationCenterTab.tsx
src/components/NotificationLogTab.tsx
src/components/PaymentLinksTab.tsx
src/components/ProcessMatrixTab.tsx
src/components/RenewalPaymentTab.tsx
src/components/ReportPrintTab.tsx
src/components/ReviewTab.tsx
src/components/Sidebar.tsx
src/components/Topbar.tsx
src/constants/initialData.ts
src/constants/vehicleSeedData.ts
src/index.css
src/main.tsx
src/types.ts
src/utils/helpers.ts
src/utils/storage.ts
tests/api.test.ts
```

## 2. Clean-machine build (verified on a fresh copy without node_modules, Node 22.23.5)
```
cp .env.example .env     # set SESSION_SECRET and ADMIN_PASSWORD (see HowToSetup.md)
npm ci                   # 195 packages, no native compilation
npm run lint             # tsc --noEmit  -> no errors
npm run build            # vite build + esbuild server bundle -> dist/, dist-server/index.cjs
npm test                 # 14 tests, 0 failures
set -a; . ./.env; set +a; npm start
```
Database creation is automatic: `server/db.ts` applies `database/schema.sql` and, on an empty database,
`database/seed.sql` (`AUTO_SEED=true`, the default). Setting `SEED_DEMO_USERS=true` + `DEMO_PASSWORD` gives the
demo accounts a password; `ADMIN_PASSWORD` sets the `admin` password on first start.

## 3. Authentication and roles on every mutating endpoint
Full table: [API.md](API.md) and the header comment of `server/index.ts`. Summary (every non-GET route):

| Route | Guards |
| --- | --- |
| POST /api/auth/login | public by necessity; csrfGuard + throttle |
| POST /api/auth/logout | requireAuth |
| POST /api/auth/password | requireAuth + requireRole(all) |
| PUT /api/admin/users | requireAuth + requireRole('Administrator') |
| PUT /api/admin/settings | requireAuth + requireRole('Administrator') |
| PUT /api/licenses | requireAuth + requireRole(Administrator, Verifier, Operator) + per-record unit/role rules |
| PUT /api/notifications/runtime | requireAuth + requireRole(Administrator, Verifier, Operator) |
| POST /api/logs | requireAuth + requireRole(all) |

No DELETE routes exist. `tests/api.test.ts` asserts anonymous 401s on every mutating route and 403s for
Viewer/Operator/Verifier on the admin routes.

## 4. Dependency audit (`npm audit`, lockfile as shipped)
```
found 0 vulnerabilities
```
Severity counts: info 0, low 0, moderate 0, high 0, critical 0, total 0.
Versions that look unusual are real registry releases (checked with `npm view`): express 4.22.3, typescript 7.0.2, vite 8.3.8.
All direct dependencies are pinned to exact versions; transitive `uuid` is pinned to 11.1.1 via `overrides`.

## 5. Secrets scan notes
No `.env` is committed. Remaining scanner hits are identifiers (`password` form fields, `pw_hash` column), env-var
references, and test fixtures in `tests/api.test.ts` (`'x'.repeat(48)`, `Test-*-Pass-1`), which only run against a throwaway
temporary database.

## 6. Live demo
See HowToSetup.md "Option C" and `render.yaml`.

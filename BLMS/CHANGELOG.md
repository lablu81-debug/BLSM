# Changelog

## 1.0.5 — 2026-11-23
### Changed (demo data)
* All demo data is now generic: company Acme Group, units ALP/BRV/CDR/DLT/HQ, example users and example.com emails.
### Changed
* Sales-ready navy-blue redesign of the public entry screen: gradient hero, sign-in card, key-figure strip and feature grid.
* Refined cards, buttons, tables and focus states in the app (navy palette, softer shadows). No API or security changes.

## 1.0.4 — 2026-11-23
### Added
* README now shows the live demo URL and demo logins, the route security table, and the `npm audit` result directly
  (previously only in `docs/`).
* Verified deployment: the app builds from the Dockerfile on Render and starts (database seeded, demo passwords applied).

## 1.0.3 — 2026-11-22
### Added
* `docs/AUDIT-EVIDENCE.md`: source tree, verified clean-machine steps, route/role table, raw `npm audit` output (0 vulnerabilities).
* README/HowToSetup link to the evidence file.

## 1.0.2 — 2026-11-22
### Security
* The single `PUT /api/state` route was split into explicit routes, each with `requireAuth` + `requireRole`;
  user and settings management are **Administrator-only at route level** (`PUT /api/admin/users`, `PUT /api/admin/settings`).
  Route table: `docs/API.md` and the header comment of `server/index.ts`. Tests grew from 11 to 14.
* All dependency versions in `package.json` are pinned to exact versions (no `^`), including `typescript` 7.0.2 and `vite` 8.3.8.
* Dependency audit (`npm audit`, 2026-11-22, lockfile as shipped): **0 vulnerabilities** (info/low/moderate/high/critical all 0);
  `xlsx` removed in 1.0.1; transitive `uuid` pinned to 11.1.1 via `overrides`.
### Added
* `docs/API.md`.

## 1.0.1 — 2026-11-22
### Security
* Replaced the `xlsx` (SheetJS) package, which has unpatched high-severity advisories (prototype pollution, ReDoS), with
  `exceljs`; `uuid` is pinned to ^11.1.1 via `overrides`. `npm audit` reports 0 vulnerabilities. `.xls` import is no longer
  supported (use .xlsx or .csv).
* Every API route now declares `requireAuth` (+ `requireRole`) explicitly; route security map documented in `server/index.ts`;
  new test asserts anonymous callers are rejected on all mutating routes.
### Added
* `render.yaml` for a public demo deployment; HowToSetup "Option C".

## 1.0.0 — 2026-11-22
### Added
* Express + SQLite backend (`server/`), served together with the web app by one process.
* Real authentication: scrypt password hashes, signed HttpOnly session cookie, login throttling, CSRF header guard.
* Server-enforced roles and unit scope on every save (Administrator / Verifier / Operator / Viewer); append-only audit logs.
* Optimistic concurrency (revision check) so concurrent users cannot overwrite each other silently.
* `database/schema.sql`, generated `database/seed.sql`, `HowToSetup.md`, `CLAUDE.md`, `Dockerfile`, `docker-compose.yml`.
* API/authorization test suite (`npm test`).
### Changed
* Data moved from browser `localStorage` to the server database; `.env.example` now lists the real variables.
* Dependencies pinned via `package-lock.json`; fixed the `esbuild`/`vite` peer conflict that broke `npm install`.
### Removed
* Hard-coded default password (`blms123`), demo quick-login and the client-side "switch user" simulator.
* Unused `@google/genai` dependency, AI Studio scaffolding and bundled HTML snapshot.

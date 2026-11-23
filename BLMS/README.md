# Acme Group — Business Licenses Monitoring System (BLMS)

An enterprise-grade compliance monitoring, regulatory audit readiness, license lifecycle tracking, and automated expiry notification platform built for **Acme Group** manufacturing units.

---

## 🏢 Overview

The **Acme Group Business Licenses Monitoring System (BLMS)** provides end-to-end visibility, workflow collaboration, and governance across all industrial units:
- **ALP** — Alpine Apparel Limited
- **BRV** — Acme Group Logistics & Corporate Operations
- **CDR** — Cedar Holdings Limited
- **DLT** — Delta Garments Limited
- **HQ** — Corporate Head Office Compliance

BLMS tracks all statutory government permits, factory inspection certificates, environmental clearances, vehicle road transport fitness, and municipal licenses with a real-time **RAG (Red-Amber-Green)** risk monitoring engine.

---

## 🚀 Key Modules & Architecture

### 1. 📊 Management Dashboard
- **Consolidated & Unit-wise Compliance**: Real-time summary metrics across units (Total, Valid, Expiring Soon, Expired, Factory Units).
- **Unit-wise Types of License Breakdown**: Comprehensive matrix cross-referencing classifications across units with interactive column filters and stacked distribution charts.
- **Vehicle Compliance**: Monitoring for factory transport fleets (BRTA tax token, route permit, fitness, vehicle models).

### 2. ⚡ Operations
- **New License Entry**: Intuitive form with auto-generated serial tracking, validity calculation, attachment handling (PDF / PNG / JPG), and BRTA vehicle attributes.
- **Import Excel / CSV**: Bulk upload parser with data validation, field mapping, and preview table.
- **Report Print**: Customizable export reports with multi-field filtering, summary stats, print previews, and instant download to **PDF** and **Excel (.xlsx)**.
- **Master Data**: Complete searchable database of all group licenses with inline documentation viewer.
- **Feedback**: Two-way structured communication loop between **Reviewer** (CHO Compliance) and **Operator / Contributor** (Factory HR/Compliance) with audit logging.
- **Renewal Payment**: Integrated Bangladesh government portal directory (BRTA, DIFE, DoE, NBR, RJSC, FSCD Fire Service) with fee estimation and challan tracking.
- **KPI Dashboard**:
  - **Operator / Contributor KPI**: On-time renewal rates, query response turnaround, document completeness %, and unit performance league table with immediate action queue.
  - **Viewer / Executive KPI**: Group audit readiness index, statutory life-safety exposure breakdown, unit risk heatmap, and CHO technical review lock rates.
  - **Target SLA Matrix**: Realized performance vs organizational compliance SLA targets.
- **Notification Log**: Complete dispatch history of automated and manual compliance notices.

### 3. 🔍 Reviewer
- **Review Tab**: Verification cockpit for compliance verifiers to audit records, query operators regarding expiring/expired licenses, approve compliance criteria, and lock records from unauthorized modification.

### 4. ⚙️ System Admin & Governance
- **Government Payment Portals**: Configuration of payment links, instructions, and government agency portals.
- **Process & RACI Matrix (MR)**: Compliance matrix governing input, verification, and oversight responsibilities across factories.
- **Notification Center**: Automated background scanner running scheduled multi-stage notices (60, 30, 15, 7 days before expiry) and repeat notifications for expired licenses via Email and WhatsApp formats.
- **Audit Log**: Immutable ledger recording all creations, edits, reviews, approvals, exports, and administrative configuration updates.
- **User Access & Role Governance**: Granular role-based access control (RBAC) supporting *Administrator*, *Verifier*, *Operator / Contributor*, and *Viewer* with unit-specific permission overrides.

---

## 🛠️ Tech Stack

- **Frontend**: [React 19](https://react.dev/) + [TypeScript](https://www.typescriptlang.org/)
- **Backend**: Node.js + Express, SQLite (built-in `node:sqlite`)
- **Bundler & Dev Server**: [Vite 6 / 8](https://vitejs.dev/)
- **Styling**: [Tailwind CSS v4](https://tailwindcss.com/)
- **Icons**: [Lucide React](https://lucide.dev/)
- **Export Engines**: [jsPDF](https://github.com/parallax/jsPDF), [jsPDF-AutoTable](https://github.com/simonbengtsson/jsPDF-AutoTable), [XLSX (SheetJS)](https://sheetjs.com/)

---

## 🌐 Live demo

**URL:** https://blms-demo-l811.onrender.com (free hosting: the first request after idle takes 30–60 s to wake up)

| User ID | Password | Role |
| :--- | :--- | :--- |
| `admin` | `Adm-1c6a3a89cb-Demo` | Administrator |
| `nora.brv` | `Demo-3316d13076-Pass` | Verifier |
| `ryan.alp` | `Demo-3316d13076-Pass` | Operator / Contributor |
| `hr.cdr` | `Demo-3316d13076-Pass` | Viewer |

These are demo-only credentials for the public demo instance. They are not in the code: the server reads them from the
`ADMIN_PASSWORD` / `DEMO_PASSWORD` environment variables (`SEED_DEMO_USERS=true`). Deployed with `render.yaml` / `Dockerfile`.

---

## 🔐 API security at a glance

Every non-GET route (source: header of `server/index.ts`; full detail in [docs/API.md](docs/API.md)):

| Method | Path | Middleware | Who |
| :--- | :--- | :--- | :--- |
| POST | `/api/auth/login` | csrfGuard + throttle | public (creates the session) |
| POST | `/api/auth/logout` | `requireAuth` + `requireRole(all)` | any signed-in user |
| POST | `/api/auth/password` | `requireAuth` + `requireRole(all)` | any signed-in user |
| PUT | `/api/admin/users` | `requireAuth` + `requireRole('Administrator')` | **Administrator only** |
| PUT | `/api/admin/settings` | `requireAuth` + `requireRole('Administrator')` | **Administrator only** |
| PUT | `/api/licenses` | `requireAuth` + `requireRole(Administrator, Verifier, Operator)` + per-record unit/role rules | editors |
| PUT | `/api/notifications/runtime` | `requireAuth` + `requireRole(Administrator, Verifier, Operator)` | editors |
| POST | `/api/logs` | `requireAuth` + `requireRole(all)` | append-only logs |

There are no DELETE or PATCH routes. `npm test` (14 tests) asserts anonymous 401s on every mutating route and 403s for
Viewer / Operator / Verifier on the admin routes.

## 📦 Dependency audit

`npm audit` on the shipped lockfile (2026-11-22): **0 vulnerabilities** (info 0, low 0, moderate 0, high 0, critical 0).
All direct dependencies are pinned to exact versions. Raw output and details: [docs/AUDIT-EVIDENCE.md](docs/AUDIT-EVIDENCE.md).

---

## 📦 Getting Started

Full instructions (VPS and Docker, database, first admin login, branding): **[HowToSetup.md](HowToSetup.md)**.

```bash
cp .env.example .env     # set SESSION_SECRET and ADMIN_PASSWORD
npm ci && npm run build
set -a; . ./.env; set +a && npm start      # http://localhost:3000, sign in as "admin"
# or:  docker compose up -d --build
```

Audit evidence (routes, dependency audit, clean-build steps): [docs/AUDIT-EVIDENCE.md](docs/AUDIT-EVIDENCE.md).

Development: `npm run dev` · Type check: `npm run lint` · Tests: `npm test`.

---

## 👥 Roles & demo accounts

The seed data creates six demo accounts (`admin`, `ryan.alp`, `nora.brv`, `hr.cdr`, `director`, `fiona`)
**without passwords** — they cannot sign in until an Administrator sets one (or you start a demo instance with
`SEED_DEMO_USERS=true` and `DEMO_PASSWORD`). Roles: Administrator, Verifier, Operator / Contributor, Viewer.

---

## 📄 License & Confidentiality

Internal compliance monitoring software designed and configured for **Acme Group**. All rights reserved.

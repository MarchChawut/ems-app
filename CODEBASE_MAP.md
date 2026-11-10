# CODEBASE MAP — EMS Admin (ems-trd-dtc)

> Generated: 2026-06-06 · Last updated: 2026-08-04 (granular permissions system, dynamic form-builder, 3-stage leave approval workflow, dashboard page/client split, unit+e2e test suite)
> Purpose: Context reference for feature development

---

## 1. Project Overview

**Employee Management System (EMS)** — a Thai government-context internal HR tool built as a Next.js 16 fullstack application. Deployed on Synology NAS with MariaDB. All UI is in Thai.

Core modules:
- **Authentication** — custom session-based auth with DB-backed brute-force protection (IP **and** username keyed), **mandatory 2FA (TOTP)** on password login, and **passkey (WebAuthn) login** as an alternative
- **Permissions** — role-based defaults (`RolePermission`) plus per-user overrides (`UserPermission`), layered on top of the original coarse role checks (`isAdmin`/`isManagerOrAbove`) without replacing them
- **Employees** — CRUD, profile images, import from CSV, supervisor assignment (used for leave approval routing)
- **Leaves** — Thai-gov–style leave requests (incl. dedicated late-arrival and early-leave forms), **3-stage approval workflow** (admin review → supervisor approval → director decision), PDF generation, fiscal-year statistics, LINE notifications per stage
- **Dynamic Forms (แบบฟอร์มขอเอกสารภายใน)** — admin-defined form templates (form builder) with per-field validation, submitted as `FormRequest`s with an optional approve/reject workflow, printed via a shared "บันทึกข้อความ" layout
- **Kanban Tasks** — draggable column board with assignees, **LINE group reminders**, and archive folders (`TaskFolder`)
- **Supplies (พัสดุ)** — STOCK/NON_STOCK inventory, transaction history (receive/return/adjust), Excel export
- **Assets (ครุภัณฑ์)** — asset registry, checkout/return tracking, inspection records, Excel export
- **Document Register (ทะเบียนรับ-ส่งหนังสือ)** — incoming/outgoing document log with category tagging and Excel export
- **Dashboard** — leave statistics with charts (Recharts), plus widgets for pending approvals, recent tasks, low-stock supplies, and asset status/overdue checkouts

---

## 2. Tech Stack

| Layer | Technology |
|---|---|
| Framework | Next.js 16 (App Router) |
| Language | TypeScript 5.9 |
| UI | React 19, Tailwind CSS 3.4, Radix UI primitives |
| Icons | lucide-react |
| Charts | Recharts 3 |
| PDF | @react-pdf/renderer 4 |
| Excel | ExcelJS 4 (supplies/documents export), xlsx 0.18 (assets export) |
| ORM | Prisma 5 |
| Database | MariaDB 10.11 (Docker on Synology NAS) |
| Validation | Zod 3 (static schemas) + runtime-built schemas for dynamic form templates |
| Auth | Custom session tokens (bcryptjs + HttpOnly cookie) |
| 2FA | TOTP via `otplib` 13 + QR via `qrcode`; secret encrypted at rest (AES-256-GCM) |
| Passkey | WebAuthn via `@simplewebauthn/server` + `@simplewebauthn/browser` 13, `userVerification: 'required'` |
| File Storage | Files stored as bytes in MariaDB (`UploadedFile`), served via `/api/files/[id]`; magic-byte MIME detection via `file-type` |
| Notifications | LINE Messaging API (group push) for task reminders and leave-stage updates |
| Testing | Vitest 4 (unit/integration, MariaDB test DB via `docker-compose.test.yml`), Playwright 1.61 (e2e), Testing Library |
| CI | GitHub Actions (`.github/workflows/test.yml`) |
| Build | pnpm, tsx (seed/scripts/worker), Turbopack (dev) |

---

## 3. Directory Tree

```
ems-trd-dtc/
├── .env                          # DATABASE_URL, RP_ID/RP_NAME/WEBAUTHN_ORIGIN, TWO_FACTOR_ENC_KEY, LINE_*, CRON_SECRET, etc.
├── .env.test                     # Test-DB env for vitest (docker-compose.test.yml, port 3307)
├── .gitignore                    # Excludes .claude/, backups/, .env, node_modules, etc.
├── .github/workflows/test.yml    # CI: unit tests (+ test DB) on push/PR
├── next.config.js                # Security headers (HSTS, CSP, etc.), canvas alias
├── tailwind.config.ts
├── tsconfig.json
├── tsconfig.seed.json
├── docker-compose.yml            # MariaDB 10.11 + phpMyAdmin (optional profile) — dev/prod DB
├── docker-compose.test.yml       # MariaDB 10.11 on :3307 — isolated DB for vitest/CI
├── empty-module.js               # Canvas alias for @react-pdf/renderer
├── package.json                  # postinstall: prisma generate; test/test:e2e/test:all scripts
│
├── prisma/
│   ├── schema.prisma             # All DB models + enums (see §5)
│   ├── seed.ts                   # Seeds default permissions, form templates, leave rules, etc.
│   └── migrations/               # Historical migrations
│
├── scripts/
│   ├── backup.ts                 # DB backup utility
│   ├── import-assets.ts          # Bulk-import assets from spreadsheet/CSV
│   ├── migrate-uploads-to-db.ts  # One-off: move disk-stored uploads into UploadedFile table
│   ├── fix-leave-buddhist-years.ts     # Data-repair: normalize Buddhist-year leave dates
│   ├── fix-document-buddhist-years.ts  # Data-repair: normalize Buddhist-year document dates
│   ├── fix-html-entity-escaped-text.ts # Data-repair: un-escape HTML entities in stored text
│   └── reset-test-data.ts        # Wipes + reseeds the local/test DB for manual QA
│
├── tests/                        # Vitest unit/integration tests (colocated *.test.ts also exist per-route)
│   ├── global-setup.ts           # Runs `prisma migrate deploy` against the test DB once per run
│   ├── setup.ts                  # Per-test-file setup (mocks, matchers)
│   ├── db-guard.ts                # Refuses to run against a DB that doesn't look like the test DB
│   ├── db-reset.ts               # Truncates tables between tests
│   ├── load-test-env.ts          # Loads .env.test
│   └── helpers/
│       ├── auth.ts                # createTestUser, loginAsNewUser (session cookie helpers)
│       ├── mock-cookies.ts        # In-memory cookie store for route-handler tests
│       └── with-test-db.ts        # setupTestDatabase() — per-suite DB lifecycle hook
│
├── e2e/                          # Playwright end-to-end tests
│   ├── global-setup.ts
│   ├── constants.ts
│   ├── auth.spec.ts
│   ├── role-gating.spec.ts
│   ├── tasks.spec.ts
│   └── helpers/login.ts
│
├── worker/                       # Standalone cron trigger + healthcheck (outside Next.js process)
│   ├── reminder-worker.ts        # Run-once script: calls /api/cron/reminders (systemd timer)
│   ├── cron-healthcheck.ts       # Alerts to LINE if no CronExecutionLog row recently
│   └── .env.worker(.example)     # CRON_SECRET + optional target URL / healthcheck ping
│
├── systemd/                      # NAS deployment: timers/services + deploy script
│   ├── ems-reminder-check.timer/.service
│   ├── ems-cron-healthcheck.timer/.service
│   ├── deploy.sh
│   └── rotate-worker-log.sh
│
├── cloudflare/cron-reminders/    # Optional: Cloudflare Worker as a public HTTPS cron trigger
│
├── public/
│   └── uploads/                  # Legacy/local upload dirs (superseded by DB-backed UploadedFile + /api/files/[id])
│
└── src/
    ├── proxy.ts                  # HTTPS redirect, CORS helper (Next.js middleware)
    ├── types/
    │   └── index.ts              # All TypeScript interfaces and types (see §6)
    │
    ├── contexts/
    │   └── UserContext.tsx       # Client-side SessionUser context, hydrated once from dashboard/layout.tsx
    │
    ├── hooks/
    │   └── useLoadMore.ts        # Shared "load more" pagination state (form history, permissions user list, etc.)
    │
    ├── lib/
    │   ├── prisma.ts             # Prisma client singleton
    │   ├── auth.ts               # requireAuth, requirePermission, isAdmin, isManagerOrAbove, createSession, getClientIp, resolvePermissions
    │   ├── permissions.ts        # PERMISSIONS catalog + hasPermission() — additive layer on top of role checks
    │   ├── security.ts           # hashPassword, Zod schemas, sanitizeInput, generateSecureToken, passwordComplexitySchema
    │   ├── crypto.ts             # AES-256-GCM encrypt/decrypt (TOTP secret at rest) — needs TWO_FACTOR_ENC_KEY
    │   ├── twofactor.ts          # TOTP (otplib), backup codes, 2fa_pending challenge helpers
    │   ├── webauthn.ts           # Passkey RP config, base64url helpers, WebAuthn challenge store
    │   ├── rate-limit-db.ts      # DB-backed rate limiter (DatabaseRateLimiter) — IP- and username-keyed
    │   ├── profile.ts            # Shared "own profile" Prisma select, used by /api/users/me + /dashboard/profile
    │   ├── role-badge.ts         # roleConfig — label/color per Role, shared across user-listing UIs
    │   ├── leave-calc.ts         # Leave day-count + fiscal-year math (client-safe, no Prisma import)
    │   ├── leave-rules-server.ts # Looks up the active LeaveRule for a date (server-only, wraps leave-calc.ts)
    │   ├── leave-tabs.ts         # resolveLeaveTab() — classifies a leave into KBK/STATS/LATE_ARRIVAL/EARLY_LEAVE (client-safe)
    │   ├── leave-tabs-server.ts  # buildLeaveTabWhere() — same classification as a Prisma where-fragment (server-only)
    │   ├── leave-notifications.ts # notifyLeaveStage() — builds + sends the LINE message for each approval-stage transition
    │   ├── form-templates.ts     # listActiveFormTemplates/listAllFormTemplates — shared FormTemplate queries
    │   ├── form-requests.ts      # listFormRequests() — role-scoped FormRequest listing (manager sees all, others see own)
    │   ├── dynamic-form-validation.ts # buildTemplateDataSchema() — builds a Zod schema at runtime from a FormTemplate's fields
    │   ├── cron-lock.ts          # Atomic claim/release so the reminders cron job never runs concurrently
    │   ├── line.ts                # LINE Messaging API — sendLineGroupMessage, replyLineMessage
    │   ├── logger.ts             # Structured logger (dev: pretty, prod: JSON via pino; serializes Error message/stack)
    │   ├── pdf-fonts.ts          # Registers the Thai (THSarabun) font for @react-pdf/renderer documents
    │   └── utils.ts              # cn(), formatDate, toBuddhistYear, etc.
    │
    ├── components/
    │   ├── dashboard/
    │   │   ├── types.ts                  # LeaveRecord, UserSummary, LeaveStatsData (dashboard-local types)
    │   │   ├── leaveTypeConfig.ts        # Colors/labels per LeaveType for charts & tables
    │   │   ├── DashboardShell.tsx        # Sidebar + header shell; nav items filtered by hasPermission()
    │   │   ├── StatCard.tsx              # Generic stat tile
    │   │   ├── LeaveFilterPanel.tsx      # Month/fiscal-year/type/date-range filters
    │   │   ├── LeaveChart.tsx            # Recharts leave breakdown
    │   │   ├── LeavePersonTable.tsx      # Per-user leave summary table
    │   │   ├── PendingApprovalsList.tsx  # Recent pending leave requests widget
    │   │   ├── RecentTasksList.tsx       # Recent kanban tasks widget
    │   │   ├── LowStockSuppliesWidget.tsx # Supplies at/under minimum quantity
    │   │   └── AssetStatusWidget.tsx     # In-use/in-repair counts + overdue checkouts
    │   ├── leaves/
    │   │   ├── LeaveForm.tsx             # Sick/maternity/personal/etc. leave form + print
    │   │   ├── LeaveFormPDF.tsx
    │   │   ├── LateArrivalForm.tsx       # Dedicated form for LATE_ARRIVAL (มาสาย) type
    │   │   ├── LateArrivalFormPDF.tsx    # @react-pdf/renderer doc for late-arrival form
    │   │   └── EarlyLeaveForm.tsx        # Dedicated form for EARLY_LEAVE (ออกก่อนเวลา) type
    │   └── forms/                        # Dynamic form-request printing (shared across all FormTemplate types)
    │       ├── FormRequestPDF.tsx        # @react-pdf/renderer doc using the template's field list
    │       ├── FormRequestPrintModal.tsx # Preview / print / download modal
    │       └── formPrintShared.ts        # Shared "บันทึกข้อความ" print-window HTML builder
    │
    └── app/
        ├── globals.css
        ├── layout.tsx
        ├── page.tsx              # Login page (/)
        │
        ├── dashboard/
        │   ├── layout.tsx        # Sidebar + Header shell (Server Component: fetches SessionUser once, feeds UserContext)
        │   ├── loading.tsx       # Route-level loading skeleton
        │   ├── page.tsx / DashboardPageClient.tsx           # Dashboard widgets (thin server wrapper + client logic)
        │   ├── employees/page.tsx / EmployeesPageClient.tsx
        │   ├── leaves/page.tsx / LeavesPageClient.tsx
        │   ├── tasks/page.tsx / TasksPageClient.tsx          # Kanban board (+ archive folders)
        │   ├── supplies/page.tsx / SuppliesPageClient.tsx    # พัสดุ — inventory, transactions, export
        │   ├── assets/page.tsx / AssetsPageClient.tsx        # ครุภัณฑ์ — registry, checkout, inspection, export
        │   ├── documents/page.tsx / DocumentsPageClient.tsx  # ทะเบียนรับ-ส่งหนังสือ — document register CRUD + export
        │   ├── forms/page.tsx / FormsPageClient.tsx          # แบบฟอร์มขอเอกสารภายใน — submit/list/approve FormRequests
        │   ├── profile/page.tsx                              # Own-profile read-only view (uses lib/profile.ts)
        │   └── settings/
        │       ├── page.tsx / SettingsPageClient.tsx         # ตั้งค่า — manage passkeys + 2FA status/backup codes
        │       ├── form-builder/page.tsx + FormBuilderClient.tsx    # Admin: create/edit FormTemplates + fields
        │       └── permissions/page.tsx + PermissionsSettingsClient.tsx # Admin: per-user permission overrides
        │
        └── api/
            ├── auth/
            │   ├── login/route.ts                # password verify → requires2FA (VERIFY|ENROLL); IP + username rate limit
            │   ├── logout/route.ts
            │   ├── session/route.ts
            │   ├── change-password/route.ts      # POST — self-service password change (uses passwordComplexitySchema)
            │   ├── 2fa/
            │   │   ├── route.ts                  # GET status (enabled, backupCodesRemaining)
            │   │   ├── setup/route.ts            # POST — generate secret + QR (enroll)
            │   │   ├── enable/route.ts           # POST — confirm code, enable, issue backup codes + session
            │   │   ├── verify/route.ts           # POST — TOTP or backup code → session
            │   │   ├── backup-codes/regenerate/route.ts  # POST — regen (needs current code)
            │   │   └── [userId]/route.ts         # DELETE — admin reset a user's 2FA
            │   └── passkey/
            │       ├── route.ts                  # GET list / (DELETE in [id])
            │       ├── [id]/route.ts             # DELETE a passkey
            │       ├── register/options/route.ts # POST (auth) — registration options, userVerification: required
            │       ├── register/verify/route.ts  # POST (auth) — store authenticator
            │       ├── login/options/route.ts    # POST — auth options by username; IP + username rate limit
            │       └── login/verify/route.ts     # POST — verify assertion (userVerification: required) → session
            ├── users/
            │   ├── route.ts                      # GET list / POST create
            │   ├── [id]/route.ts                 # GET / PATCH / DELETE; supervisorId cycle check
            │   ├── [id]/reset-password/route.ts  # POST — super-admin resets another user's password, kills their sessions
            │   ├── me/route.ts                   # GET — own profile (read-only; see lib/profile.ts)
            │   ├── import/route.ts
            │   └── upload-profile/route.ts
            ├── permissions/
            │   ├── route.ts                      # GET — permission catalog + role defaults
            │   └── user/[userId]/route.ts        # GET/PUT — a user's permission overrides
            ├── leaves/
            │   ├── route.ts                      # GET list / POST create (LINE-notifies on open)
            │   ├── [id]/route.ts                 # GET / PATCH (3-stage approval state machine) / DELETE
            │   ├── dashboard/route.ts
            │   ├── export/route.ts
            │   ├── search/route.ts
            │   └── statistics/route.ts
            ├── form-templates/
            │   ├── route.ts                      # GET ?active=true (any logged-in user) or full list (forms.manage_templates only) / POST create
            │   └── [id]/route.ts                 # GET / PATCH / DELETE (forms.manage_templates)
            ├── form-requests/
            │   ├── route.ts                      # GET list (role-scoped) / POST create (validated against template)
            │   ├── [id]/route.ts                 # GET / PATCH (edit while PENDING) / DELETE
            │   └── [id]/status/route.ts          # PATCH — approve/reject (atomic, blocks self-approval)
            ├── task-folders/
            │   ├── route.ts                      # GET list / POST create
            │   └── [id]/route.ts                 # PATCH / DELETE
            ├── tasks/
            │   ├── route.ts
            │   └── [id]/route.ts
            ├── columns/
            │   ├── route.ts
            │   ├── [id]/route.ts
            │   └── reorder/route.ts
            ├── dashboard/
            │   ├── route.ts               # Aggregate stats + widget payloads (leaves, tasks, supplies, assets)
            │   └── leave-stats/route.ts
            ├── supplies/
            │   ├── route.ts           # GET list / POST create
            │   ├── [id]/route.ts      # GET / PATCH / DELETE
            │   ├── export/route.ts    # GET — Excel (2–3 sheets, split by type)
            │   └── merge/route.ts     # POST — merge duplicate supplies
            ├── supply-categories/route.ts
            ├── supply-transactions/route.ts  # GET list / POST (receive/return/adjust)
            ├── assets/
            │   ├── route.ts           # GET list / POST create
            │   ├── [id]/route.ts      # GET / PATCH / DELETE
            │   └── export/route.ts    # GET — Excel (assets + checkout history sheets)
            ├── asset-categories/route.ts
            ├── asset-checkouts/
            │   ├── route.ts           # GET list / POST checkout
            │   └── [id]/route.ts      # PATCH return
            ├── documents/
            │   ├── route.ts           # GET list / POST create (admin only)
            │   ├── [id]/route.ts      # GET / PATCH / DELETE (admin only)
            │   └── export/route.ts    # GET — Excel export of document register
            ├── uploads/
            │   └── document/route.ts  # POST — file upload (magic-byte MIME check) → stored in UploadedFile
            ├── files/
            │   └── [id]/route.ts      # GET — serve UploadedFile bytes (requires auth)
            ├── line/
            │   └── webhook/route.ts   # POST — LINE webhook (signature-verified); used to discover Group ID
            ├── cron/
            │   └── reminders/route.ts # GET — external cron hits this to push due task reminders to LINE (x-cron-secret)
            ├── departments/route.ts
            ├── positions/route.ts
            ├── position-seconds/route.ts
            ├── holidays/route.ts
            ├── leave-rules/route.ts
            └── health/route.ts
```

---

## 4. Module Dependency Diagram

```
┌─────────────────────────────────────────────────────────┐
│                   Browser / Client                       │
│  page.tsx (login) → dashboard/layout.tsx (fetches user,  │
│      feeds UserContext) → DashboardShell.tsx (nav, gated │
│      by hasPermission())                                 │
│      ├── page.tsx ──► DashboardPageClient.tsx ──► components/dashboard/* │
│      ├── employees/  ──► EmployeesPageClient.tsx          │
│      ├── leaves/     ──► LeavesPageClient.tsx ──► LeaveForm.tsx /         │
│      │                   LateArrivalForm.tsx / EarlyLeaveForm.tsx        │
│      ├── tasks/      ──► TasksPageClient.tsx (+ folders)  │
│      ├── supplies/   ──► SuppliesPageClient.tsx  (inventory + transactions) │
│      ├── assets/     ──► AssetsPageClient.tsx    (registry + checkout)   │
│      ├── documents/  ──► DocumentsPageClient.tsx (document register)     │
│      ├── forms/      ──► FormsPageClient.tsx ──► components/forms/*      │
│      ├── profile/    (read-only own profile)               │
│      └── settings/   ──► SettingsPageClient.tsx            │
│              ├── form-builder/ ──► FormBuilderClient.tsx   │
│              └── permissions/  ──► PermissionsSettingsClient.tsx │
└──────────────────┬──────────────────────────────────────┘
                   │ fetch()
                   ▼
┌──────────────────────────────────────────────────────────┐
│                  Next.js API Routes                       │
│                                                          │
│  /api/auth/*    /api/users/*    /api/permissions/*        │
│  /api/leaves/*  /api/form-templates/*  /api/form-requests/* │
│  /api/tasks/*   /api/task-folders/*  /api/columns/*       │
│  /api/dashboard/*                                         │
│  /api/supplies/* /api/supply-categories                  │
│  /api/supply-transactions                                │
│  /api/assets/*  /api/asset-categories                    │
│  /api/asset-checkouts/*  /api/uploads/document            │
│  /api/documents/*  /api/files/[id]                        │
│  /api/line/webhook  /api/cron/reminders                  │
│  /api/departments  /api/positions  /api/holidays         │
│  /api/leave-rules  /api/health                           │
│                                                          │
│  All routes use:                                         │
│    lib/auth.ts (requireAuth / requirePermission) ─────┐  │
│    lib/permissions.ts (PERMISSIONS, hasPermission) ───┤  │
│    lib/security.ts (Zod schemas, sanitize) ───────────┤  │
│    lib/rate-limit-db.ts (login, 2fa, passkey login) ──┤  │
│    lib/line.ts (task reminders + leave notifications) ┤  │
│    lib/logger.ts ──────────────────────────────────────┤  │
│    lib/utils.ts (helpers) ─────────────────────────────┘  │
└──────────────────┬───────────────────────────────────────┘
                   │ Prisma Client
                   ▼
┌──────────────────────────────────────────────────────────┐
│  lib/prisma.ts (singleton)                                │
│        │                                                 │
│        ▼                                                 │
│  MariaDB 10.11 (Docker / Synology NAS)                   │
│    tables: users, sessions, login_attempts,               │
│            authenticators, webauthn_challenges,           │
│            two_factor_backup_codes, two_factor_challenges, │
│            role_permissions, user_permissions,             │
│            tasks, task_folders, kanban_columns,            │
│            cron_locks, cron_execution_logs,                │
│            leaves, leave_rules,                            │
│            departments, positions, position_seconds,       │
│            holidays,                                       │
│            supply_categories, supplies,                    │
│            supply_transactions,                            │
│            asset_categories, assets, asset_checkouts,      │
│            uploaded_files, document_registers,             │
│            form_templates, form_template_fields,           │
│            form_requests                                   │
└──────────────────────────────────────────────────────────┘
```

---

## 5. Database Models & Enums

### Enums

| Enum | Values |
|---|---|
| **Role** | SUPER_ADMIN, ADMIN, MANAGER, DIRECTOR, HR, EMPLOYEE |
| **Priority** | LOW, MEDIUM, HIGH, URGENT |
| **LeaveType** | SICK, PERSONAL, MATERNITY, ORDINATION, EARLY_LEAVE, LATE_ARRIVAL, RUN_AN_ERRAND, OTHER |
| **LeaveStatus** | PENDING (รอธุรการตรวจสอบ) → ADMIN_REVIEWED (รอหัวหน้างานเซ็น) → SUPERVISOR_APPROVED (รอ ผอ.กองพิจารณา) → APPROVED — or REJECTED at any stage |
| **LeaveFormCategory** | KBK (แบบส่ง กบก.), STATS (แบบเก็บสถิติ) — mutually exclusive form-routing tag on a `Leave` |
| **SupplyType** | STOCK, NON_STOCK |
| **TransactionType** | RECEIVE, ISSUE, RETURN, ADJUST |
| **AssetStatus** | AVAILABLE, IN_USE, IN_REPAIR, RETURNED, DISPOSED |
| **AssetCondition** | EXCELLENT, GOOD, FAIR, POOR, DAMAGED |
| **DocumentDirection** | RECEIVE (หนังสือเข้า), SEND (หนังสือออก) |
| **DocumentCategory** | MEMO, EXTERNAL_LETTER, PW_NEWS, VEHICLE_SUPPORT_REQUEST, REFRESHMENT_SUPPORT_REQUEST |
| **FormRequestType** | VEHICLE_REQUEST, REFRESHMENT_REQUEST, MEETING_ROOM_REQUEST, SPEAKER_REQUEST — set only for the 4 original system templates, `null` for admin-created ones |
| **FormRequestStatus** | PENDING, APPROVED, REJECTED — `null` on a `FormRequest` means "no approval workflow" (legacy pre-workflow rows only; every request created via the current POST route gets `PENDING`) |

> Note: `VACATION` was removed from `LeaveType`; `LATE_ARRIVAL` and `RUN_AN_ERRAND` were added, with dedicated `outTime`/`backTime` fields on `Leave` and separate `LateArrivalForm`/`EarlyLeaveForm` UI/PDF pairs. `LeaveStatus` grew from 3 values to a 5-value, 3-stage workflow (§10).

### Models

| Model | Key Fields | Relations |
|---|---|---|
| **User** | id, email (optional, unique), username, password, prefix, name, role, department, division, position, positionSecond, positionLevel, phone, birthday, address, avatar, profileImage, isActive, twoFactorEnabled, twoFactorSecret (encrypted), **supervisorId** (self-relation, used for leave approval routing) | → tasks, leaves, sessions, loginAttempts, authenticators, backupCodes, supplyTransactions, checkoutsHeld, checkoutsIssued, assetsHeld, documentsRecorded, **formRequests**, **permissionsHeld/permissionsGranted**, **subordinates** |
| **Session** | id, userId, token (unique), expiresAt, ipAddress, userAgent, isValid | → User |
| **LoginAttempt** | id, userId?, username, ipAddress, success, reason | → User? (indexed on both `[ipAddress, createdAt]` and `[username, createdAt]` — rate limiter checks both) |
| **Authenticator** *(passkey)* | id, credentialId (unique), publicKey (base64url), counter, transports, deviceType, backedUp, name, userId, lastUsedAt | → User |
| **WebAuthnChallenge** | id (cuid), challenge, userId?, expiresAt | — (temp, cookie-referenced) |
| **TwoFactorBackupCode** | id, userId, codeHash (bcrypt), usedAt? | → User |
| **TwoFactorChallenge** | id (cuid), userId, pendingSecret? (encrypted), attempts, expiresAt | — (temp, `2fa_pending` cookie) |
| **RolePermission** *(added 2026-07)* | id, role, permissionKey — default permissions granted to every user of a role | — unique on `[role, permissionKey]` |
| **UserPermission** *(added 2026-07)* | id, userId, permissionKey, granted (true=extra grant, false=revoke a role default), grantedById | → user, grantedBy |
| **KanbanColumn** | id, name, color, order, isDefault | → tasks |
| **Task** | id, title, description, columnId, priority, assigneeId, reminderAt, reminderSentAt, reminderDayBeforeAt/SentAt, reminderOnDayAt/SentAt, archivedAt, **folderId** | → KanbanColumn, User?, **TaskFolder?** |
| **TaskFolder** *(added 2026-07)* | id, name, order | → tasks (archived tasks filed under a folder) |
| **RosterAssignment** *(added 2026-11)* | id, userId, title, category (`RosterCategory`: DUTY/OFFICIAL_TRIP/MEETING/TRAINING/EVENT/OTHER), location, startDate, endDate, startTime?, endTime?, note, createdById | → User (assignee), User (creator). 1 row = 1 person × 1 job; page `/dashboard/roster`, API `/api/roster[/id|/summary]`, edit gated by permission `roster.manage` (admins always) |
| **CronLock** *(added 2026-07)* | name (pk, e.g. "reminders"), lockedAt, lockedBy | — atomic claim so the reminders job never runs concurrently |
| **CronExecutionLog** *(added 2026-07)* | id, jobName, startedAt, finishedAt, status (running/success/error), checked, sent, failed, error | — persisted run history for the healthcheck worker |
| **Leave** | id, userId, type, startDate, endDate, reason, status (5-value workflow), **adminReviewedBy/At**, **supervisorApprovedBy/At**, approvedBy, approvedAt, isHalfDay, hours, outTime, backTime, formCategory, totalDays, contactAddress | → User |
| **LeaveRule** | id, name, startTime, endTime, fullDayHours, halfDayHours, maxConsecutiveDays, hourThreshold, halfDayFraction, fiscalYear?, isActive | — |
| **Department** | id, name, description, isActive, order | — |
| **Position** | id, name, description, isActive, order | — |
| **PositionSecond** | id, name, hasLevel, maxLevel, isActive, order | — |
| **Holiday** | id, date (unique), name, description, year, isActive | — |
| **SupplyCategory** | id, name, description, isActive, order | → supplies |
| **Supply** | id, name, type (STOCK/NON_STOCK), categoryId, supplyCode, unit, currentQuantity, minimumQuantity, maximumQuantity, thresholdRed, thresholdYellow, supplier, unitPrice, documentNumber, documentUrl, imageUrl, issueDate, recorderName, notes, isActive | → category, transactions |
| **SupplyTransaction** | id, supplyId, type, quantity, quantityBefore, quantityAfter, documentNumber, documentUrl, recipientName, returnerName, returnReceiverName, adjusterName, notes, performedById | → supply, performedBy |
| **AssetCategory** | id, name, description, isActive, order | → assets |
| **Asset** | id, name, assetTag (unique), serialNumber, model, brand, categoryId, status, condition, currentHolderId, acquisitionDate, acquisitionCost, documentNumber, documentUrl, location, department, imageUrl, notes, isActive, receiverName, lastInspectionDate, lastInspectionCondition, lastInspectedBy | → category, currentHolder, checkouts |
| **AssetCheckout** | id, assetId, holderId, issuedById, checkedOutAt, returnedAt, expectedReturnAt, notes | → asset, holder, issuedBy |
| **UploadedFile** | id (cuid), data (Bytes/LONGBLOB), mimeType, fileName, size, uploadedById?, createdAt | — (served via `/api/files/[id]`) |
| **DocumentRegister** | id, date, subject, direction, category?, documentNumber?, recipientName?, senderName?, remarks?, isActive, recordedById | → recordedBy (User) |
| **FormTemplate** *(added 2026-07)* | id, systemKey? (set only for the 4 migrated original forms), menuTitle, documentTitle, isActive, order | → fields (FormTemplateField[]), submissions (FormRequest[]) |
| **FormTemplateField** *(added 2026-07)* | id, templateId, key (property name in `FormRequest.data`), label, inputType (text/number/time/date/textarea/select), required, order, options? (string[] JSON, for `select`) | → template — unique on `[templateId, key]` |
| **FormRequest** *(added 2026-07)* | id, type? (legacy enum, null for builder-created), requestDate, documentNumber?, data (Json, shaped by the template's fields), templateId?, status? (null = legacy/no workflow), approvedBy, approvedAt, requestedById | → template, requestedBy (User) |

---

## 6. TypeScript Types (`src/types/index.ts`)

### User & Auth
`UserRole` (incl. `DIRECTOR`), `User`, `Department`, `Position`, `PositionSecond`, `SessionUser` (carries `permissions: string[]`), `CreateUserInput`, `UpdateUserInput`, `LoginInput`, `LoginResponse`, `ChangePasswordInput`

### Tasks
`TaskPriority`, `KanbanColumn`, `TaskFolder`, `Task`, `CreateTaskInput`, `UpdateTaskInput`

### Leaves
`LeaveType`, `LeaveStatus` (5-value workflow), `LeaveFormCategory`, `Leave`, `CreateLeaveInput`, `UpdateLeaveInput`

### Supplies
`SupplyType`, `TransactionType`, `SupplyCategory`, `Supply`, `SupplyTransaction`, `CreateSupplyInput`, `CreateTransactionInput`

### Assets
`AssetStatus`, `AssetCondition`, `AssetCategory`, `Asset`, `AssetCheckout`, `CreateAssetInput`, `CreateCheckoutInput`

### Documents
`DocumentDirection`, `DocumentCategory`, `DocumentRegister`, `CreateDocumentRegisterInput`

### Dynamic Forms *(added 2026-07)*
`FormRequestType`, `FormFieldInputType`, `FormTemplateField`, `FormTemplateSummary`, `FormTemplateConfig`, `FormRequestStatus`, `FormRequestData`, `FormRequest`, `CreateFormRequestInput`

### Dashboard widgets
`LowStockSupplySummary`, `OverdueCheckoutSummary`, `RecentPendingLeaveSummary`, `RecentTaskSummary` — trimmed shapes returned by `/api/dashboard` for the widget components in `src/components/dashboard/`

### API & UI Utilities
`ApiResponse<T>`, `ApiError`, `DashboardStats`, `RecentActivity`, `ChildrenProps`, `ClassNameProps`, `ModalProps`, `BadgeProps`, `FormStatus`, `FormErrors`, `FormState<T>`

---

## 7. Zod Schemas (`src/lib/security.ts`)

| Schema | Validates |
|---|---|
| `loginSchema` | username (alphanum+_, 3-100), password (8-128) |
| `passkeyLoginSchema` | username only (start passkey login) |
| `passwordComplexitySchema` | shared password rule (8-128, upper+lower+digit) — reused by `createUserSchema`, `changePasswordSchema`, `resetPasswordSchema` |
| `createUserSchema` | email (optional), username, password (`passwordComplexitySchema`), prefix, name, role, department, supervisorId (optional) |
| `changePasswordSchema` | currentPassword, newPassword (`passwordComplexitySchema`), confirmPassword |
| `resetPasswordSchema` *(added 2026-07)* | password (`passwordComplexitySchema`), confirmPassword — used by super-admin password reset, no current-password check |
| `createTaskSchema` | title (1-255), description (max 1000), priority enum, columnId, assigneeId |
| `createLeaveSchema` | type enum, startDate/endDate (YYYY-MM-DD), reason (1-500), isHalfDay, hours, contactAddress; endDate ≥ startDate |
| `createSupplyCategorySchema` | name (1-100), description (max 255), order int |
| `createSupplySchema` | name, type enum, categoryId, supplyCode, unit, quantities, thresholds (1-99%), supplier, dates, unitPrice, documentNumber, imageUrl, notes |
| `createTransactionSchema` | supplyId, type enum, quantity (positive int), documentNumber, recipientName, returnerName, returnReceiverName, adjusterName, notes |
| `createAssetCategorySchema` | name (1-100), description, order |
| `createAssetSchema` | name, assetTag, serialNumber, model, brand, categoryId, status/condition enums, acquisitionDate (YYYY-MM-DD), documentNumber, location, department, imageUrl, notes, receiverName, lastInspectionDate, lastInspectionCondition, lastInspectedBy |
| `createCheckoutSchema` | assetId, holderId, issuedById (optional override), expectedReturnAt, notes |
| `createDocumentRegisterSchema` | date (YYYY-MM-DD), subject (1-500), direction enum, category enum (optional), documentNumber, recipientName, senderName, remarks |

**Dynamic form schemas (`src/lib/dynamic-form-validation.ts`)** — not static, built per-template at request time:
- `formRequestEnvelopeSchema` — templateId, requestDate (YYYY-MM-DD), documentNumber (optional/nullable)
- `buildTemplateDataSchema(fields)` — builds a `z.object` from a `FormTemplateField[]`: `number` → `z.number()`, `select` → `z.enum(options)` (falls back to a plain string only if the template itself has no `options`), `date`/`time` → regex-matched to what native `<input type="date"|"time">` submits, everything else → bounded string; required fields get `.min(1)`

**Security utilities:** `hashPassword`, `verifyPassword`, `sanitizeInput`, `generateSecureToken` (uses `crypto.randomBytes`), `generateAvatarInitials`

**2FA helpers (`src/lib/twofactor.ts`):** `generateTotpSecret`, `buildOtpAuthUri`, `verifyTotp` (otplib), `generateBackupCodes`/`findMatchingBackupCode`/`normalizeBackupCode`, `createPendingChallenge`/`getPendingChallenge`/`bumpChallengeAttempts`/`finishChallenge` (uses `2fa_pending` cookie)
**Crypto (`src/lib/crypto.ts`):** `encrypt`/`decrypt` — AES-256-GCM, key from `TWO_FACTOR_ENC_KEY` (base64 32 bytes)
**Passkey helpers (`src/lib/webauthn.ts`):** `getRpConfig`, `toBase64url`/`fromBase64url`, `parseTransports`/`serializeTransports`, `storeChallenge`/`consumeChallenge`
**LINE helpers (`src/lib/line.ts`):** `sendLineGroupMessage(text)` — group push, never throws (failures are logged, not surfaced); `replyLineMessage` — used by the webhook to echo the Group ID during setup
**Session (`src/lib/auth.ts`):** `createSession(userId, request)` — shared by password/2FA/passkey login; `resolvePermissions(userId, role)` — merges `RolePermission` + `UserPermission` into the `permissions: string[]` on `SessionUser` (admin roles short-circuit, skip the query)

---

## 8. Authentication & Security Architecture

```
cookie: session_token (HttpOnly, Secure in prod, SameSite=strict)
         │
         ▼
Session table in DB (token unique, expiresAt, isValid)
         │
         ▼
requireAuth() — called in every protected API route
  checks: token exists → session valid → not expired → user.isActive
  attaches SessionUser.permissions (see resolvePermissions, §7)

requirePermission(request, key) — requireAuth() + hasPermission() in one call,
  for routes gated by the new granular permission system (§9). Existing routes
  using isAdmin/isManagerOrAbove were left as-is; this is an additive layer.

Rate limiting: DatabaseRateLimiter (rate-limit-db.ts)
  – counts failed loginAttempts in last 30 min, keyed by EITHER field:
      ipAddress → blocks at 5 failures (MAX_LOGIN_ATTEMPTS)
      username  → blocks at 15 failures (MAX_USERNAME_ATTEMPTS, deliberately higher
                  than the IP threshold — usernames here are guessable employee
                  handles, so a low threshold would let anyone lock out a target
                  account; this also backstops X-Forwarded-For spoofing, since
                  getClientIp() trusts that header without verifying the proxy)
  – applied on: password login, passkey login/options, passkey login/verify
  – the "blocked" response itself never writes a new attempt row (would extend
    its own lockout window indefinitely) — only genuine failed attempts do
  – clears both IP and username counters on successful login

Password: bcryptjs, 12 salt rounds

Session tokens: crypto.randomBytes() — cryptographically secure CSPRNG

Input validation: Zod schemas (security.ts) on all write endpoints; dynamic
  form submissions validated against a runtime-built schema (§7)

File uploads: magic-byte MIME detection via `file-type` package
  – rejects spoofed MIME types regardless of Content-Type header
  – allowed: PDF (10 MB), JPEG/PNG/WebP (5 MB)
  – bytes persisted to `uploaded_files` table (not disk) — served back via
    GET /api/files/[id] (requires auth); keeps files visible across all
    NAS-connected instances instead of being pinned to one machine's disk

XSS: sanitizeInput() — HTML entity encoding
SQL injection: parameterized queries via Prisma — no raw SQL

Role field protection: non-admin users cannot update position, department,
  division, positionLevel, role, isActive, or supervisorId via PATCH /api/users/[id]

Supervisor chain integrity: assigning supervisorId walks the proposed chain
  (bounded, 50 hops) and rejects it if it would create a cycle — prevents
  infinite loops in any code that walks the chain recursively

Two-factor (2FA / TOTP) — MANDATORY on password login:
  – /api/auth/login verifies password then returns requires2FA (no session yet)
  – mode VERIFY (enrolled) or ENROLL (forced first-time setup) via 2fa_pending cookie
  – session is issued only after /api/auth/2fa/verify or /enable succeeds
  – TOTP secret encrypted at rest (AES-256-GCM, crypto.ts); backup codes bcrypt-hashed, one-time
  – per-challenge attempt cap (5, non-spoofable — tied to the server-side challenge,
    not the client IP) + IP rate-limit on verify/enable as a supplementary layer
  – admin can reset a user's 2FA; super-admin can reset a user's password
    (invalidates all their sessions) via POST /api/users/[id]/reset-password
  – re-enroll guard: setup/enable refuse if user already has 2FA enabled

Passkey (WebAuthn) — alternative login, EXEMPT from 2FA (already strong MFA):
  – register while authenticated (settings); login by username → assertion → session
  – userVerification: 'required' on both registration and login (not 'preferred') —
    the browser must always prompt PIN/biometric, since passkey login has no
    separate 2FA step to fall back on
  – Authenticator stores credentialId + publicKey + counter; counter checked to prevent replay
  – RP config from env (RP_ID/RP_NAME/WEBAUTHN_ORIGIN); RP_ID must be a domain, not a bare IP
    (WebAuthn will not function on the LAN-IP prod URL — needs HTTPS + a real domain)

LINE webhook (/api/line/webhook): HMAC-SHA256 signature check against
  LINE_CHANNEL_SECRET using crypto.timingSafeEqual — rejects unsigned/forged events

Cron endpoint (/api/cron/reminders): shared-secret check (x-cron-secret header
  vs CRON_SECRET) using crypto.timingSafeEqual — not session-authenticated,
  intended to be called by systemd timer / Synology Task Scheduler / host cron
```

---

## 9. Access Control: Roles + Granular Permissions

Two layers, additive — neither replaces the other:

**1. Coarse role checks** (original, still used by most routes) — `lib/auth.ts` helpers:
- `isAdmin(role)` — ADMIN or SUPER_ADMIN
- `isManagerOrAbove(role)` — MANAGER, ADMIN, SUPER_ADMIN
- `checkRole(role, allowedRoles[])` — generic check

| Action | EMPLOYEE | HR | MANAGER | DIRECTOR | ADMIN | SUPER_ADMIN |
|---|---|---|---|---|---|---|
| View own leaves | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ |
| View all leaves | ✗ | ✓ | ✓ | ✓ | ✓ | ✓ |
| Approve leaves (default) | ✗ | ✗ | ✓ | ✓ | ✓ | ✓ |
| Manage users | ✗ | ✗ | ✗ | ✗ | ✓ | ✓ |
| Reset another user's password | ✗ | ✗ | ✗ | ✗ | ✗ | ✓ |
| Manage supplies & assets | ✗ | ✗ | ✓ | ✓ | ✓ | ✓ |
| Manage document register | ✗ | ✗ | ✗ | ✗ | ✓ | ✓ |
| Export reports | ✗ | ✗ | ✓ | ✓ | ✓ | ✓ |
| Edit org fields (position/dept/supervisor) | ✗ | ✗ | ✗ | ✗ | ✓ | ✓ |

**2. Granular permissions** *(added 2026-07, `src/lib/permissions.ts`)* — per-user, on top of a per-role default:
- `PERMISSIONS` catalog: `leaves.approve`, `employees.manage`, `supplies.manage`, `assets.manage`, `documents.manage`, `forms.manage_templates`, `forms.approve`, `permissions.manage`, `tasks.manage_folders`
- `RolePermission` rows seed the default grant set per role; `UserPermission` rows grant or revoke an individual key for one user, overriding their role's default
- `hasPermission(user, key)` — **ADMIN/SUPER_ADMIN always pass**, regardless of any `UserPermission` row (guarantees admins can never be locked out by this system)
- Managed at `/dashboard/settings/permissions` (admin-only), backed by `GET/PUT /api/permissions/user/[userId]`
- The `permissions.manage` key itself can only be edited by an actual ADMIN/SUPER_ADMIN role — a non-admin who somehow holds that permission cannot use it to grant themselves (or anyone) more permissions, closing the obvious self-escalation loop
- `requirePermission(request, key)` in `lib/auth.ts` — used by the newer routes (`/api/permissions/*`) that adopt this system; older routes keep their original `isAdmin`/`isManagerOrAbove` checks unchanged

---

## 10. Key Data Flows

### Leave Approval Flow (3-stage)
```
[Leave submitted]  status: PENDING
  │ PATCH /api/leaves/[id] { action: 'adminReview' }     (requires isManagerOrAbove today)
  ▼
status: ADMIN_REVIEWED  (adminReviewedBy/At set)
  │ PATCH /api/leaves/[id] { action: 'supervisorApprove' | 'reject' }
  ▼
status: SUPERVISOR_APPROVED  (supervisorApprovedBy/At set)  — or REJECTED (any stage → terminal)
  │ PATCH /api/leaves/[id] { action: 'directorDecide' }
  ▼
status: APPROVED  (approvedBy/At set, terminal) — or REJECTED

Each transition:
  – is an atomic `updateMany` gated on the row's current status (optimistic
    concurrency — prevents double-approval / skipping a stage under a race)
  – blocks self-approval at every stage (isSelfLeave check)
  – has a narrowly-scoped "break glass" path for a DIRECTOR's own leave request
    (routed through SUPER_ADMIN instead of a self-approval)
  – fires a LINE notification (leave-notifications.ts) — NOT awaited by the
    response (fire-and-forget with a logged .catch), so a slow/unreachable
    LINE API never adds latency to an approval click
```

### Dynamic Form Request Flow
```
[Admin] builds a FormTemplate + FormTemplateFields at /dashboard/settings/form-builder
  ▼
[Employee] /dashboard/forms → picks a template → FormsPageClient renders fields
  by inputType (text/number/textarea/select/date/time)
  │ POST /api/form-requests { templateId, requestDate, documentNumber?, data }
  ▼
[API] requireAuth → load template.fields from DB → buildTemplateDataSchema(fields)
  │ .safeParse(data)  (re-validates server-side; a template's `select` options
  │  and date/time formats are enforced here even if the client is bypassed)
  │ formRequest.create({ status: 'PENDING', requestedById, templateId, data })
  ▼
[Manager/forms.approve] PATCH /api/form-requests/[id]/status { status: APPROVED|REJECTED }
  │ atomic updateMany gated on status: 'PENDING' — blocks self-approval
  ▼
[Any time while PENDING] owner-or-admin can PATCH /api/form-requests/[id] to edit,
  or DELETE to withdraw — re-validated against the (possibly since-changed) template
  ▼
[Print] FormRequestPrintModal → shared "บันทึกข้อความ" layout (formPrintShared.ts)
  or FormRequestPDF.tsx (@react-pdf/renderer), using template.documentTitle + fields
```

### Supply Transaction Flow
```
[Supplies Page]
  │ POST /api/supply-transactions {supplyId, type, quantity, ...}
  ▼
[API] requireAuth → isManagerOrAbove → createTransactionSchema.safeParse
  │ prisma.$transaction:
  │   supply.findUnique → check quantity sufficient (for ISSUE)
  │   supply.update({currentQuantity: newQty})
  │   supplyTransaction.create({...})
  ▼
[DB] supply.currentQuantity updated; supply_transactions row created
  │
  │ GET /api/supplies/export?type=all&period=month
  ▼
[API] ExcelJS workbook:
  Sheet 1: คงคลัง (STOCK)
  Sheet 2: ไม่คงคลัง (NON_STOCK)   ← only when type=all
  Sheet 3: ประวัติการเบิก-รับ
  Sheet 4: สินค้าใกล้หมด
```

### Asset Checkout Flow
```
[Assets Page]
  │ POST /api/asset-checkouts {assetId, holderId, issuedById?, ...}
  ▼
[API] requireAuth → isManagerOrAbove → createCheckoutSchema.safeParse
  │ prisma.$transaction:
  │   asset.findUnique → check status === AVAILABLE
  │   user.findUnique(holderId) → check isActive
  │   assetCheckout.create({issuedById: override ?? authUser.id})
  │   asset.update({status: IN_USE, currentHolderId: holderId})
  ▼
[DB] asset.status = IN_USE; asset_checkouts row created
  │
  │ PATCH /api/asset-checkouts/[id] → return asset
  ▼
[DB] assetCheckout.returnedAt = now; asset.status = AVAILABLE
```

### Document Register Flow
```
[Documents Page]
  │ POST /api/documents {date, subject, direction, category?, ...}
  ▼
[API] requireAuth → isAdmin → createDocumentRegisterSchema.safeParse
  │ documentRegister.create({recordedById: authUser.id})
  ▼
[DB] document_registers row created
  │
  │ GET /api/documents/export?direction=&category=&period=
  ▼
[API] ExcelJS workbook of the filtered register (หนังสือเข้า/ออก)
```

### Task Reminder Flow (LINE)
```
[Task created/edited with reminderAt]
  ▼
[External scheduler] GET /api/cron/reminders  (x-cron-secret header, ~every 1 min)
   ├─ Cloudflare Worker (cloudflare/cron-reminders/) — public HTTPS cron trigger,
   │  requires the app reachable at a public TARGET_URL. Untracked, current NAS setup.
   └─ Local worker (worker/reminder-worker.ts, run-once, triggered every 1 min by
      systemd/ems-reminder-check.timer + .service) — outbound-only call to
      localhost/LAN, no public inbound exposure needed. Works behind a firewall
      (planned gov-agency deployment). Both triggers are safe to run in parallel —
      see cron lock below.
  ▼
[API] isAuthorized (timing-safe secret compare)
  │ acquireLock('reminders', holder) via CronLock — skips the whole run (no double
  │ execution) if a previous run is still in progress; self-heals a stale lock left
  │ by a crashed process after 5 min (src/lib/cron-lock.ts)
  │ CronExecutionLog row created (status: running → success/error, checked/sent/
  │ failed counts, error message) — persisted history, not just text log files
  │ task.findMany({reminderAt: {lte: now}, reminderSentAt: null, archivedAt: null})
  │ (plus analogous passes for reminderDayBeforeAt/reminderOnDayAt)
  │ for each: atomic updateMany claim (reminderSentAt: null → now) before sending,
  │           so concurrent scheduler calls never double-send
  │ sendLineGroupMessage(buildReminderMessage(task))
  │ releaseLock('reminders') in finally
  ▼
[LINE group] receives push notification
```
Setup helper: `/api/line/webhook` — invite the bot to the target LINE group, send
any message, the bot replies with that group's ID to paste into `LINE_GROUP_ID`.

**Health check:** `worker/cron-healthcheck.ts`, triggered every 5 min by
`systemd/ems-cron-healthcheck.timer` — reads the latest `CronExecutionLog` row for
job `reminders`; if none in the last 5 min, sends a LINE alert (same group) with a
30-min file-based cooldown (`logs/cron-alert-state.json`) to avoid spamming. Does not
cover the case where systemd/timers die entirely on the host — that gap is only
closed by the optional healthchecks.io dead-man's-switch ping (unconfigured).

### Authentication Flow (password + mandatory 2FA)
```
[Login Page]
  │ POST /api/auth/login {username, password}
  ▼
[API] Zod validate → dbRateLimit.isRateLimited(ip) → (after parsing body)
  │ dbRateLimit.isRateLimited(username, 'username')
  │ user.findUnique({username}) → bcrypt.compare(password, hash)
  │ createPendingChallenge(userId) → set 2fa_pending cookie  (NO session yet)
  │ return { requires2FA, mode: twoFactorEnabled ? 'VERIFY' : 'ENROLL' }
  ▼
[Client] if ENROLL: POST /api/auth/2fa/setup → show QR → POST /api/auth/2fa/enable {code}
  │        if VERIFY: POST /api/auth/2fa/verify {code|backupCode}
  ▼
[API] verify TOTP (or backup code) → createSession() → Set HttpOnly cookie: session_token
  │ enable also: twoFactorEnabled=true, store encrypted secret, issue 10 backup codes
  ▼
[Client] router.push('/dashboard') — all later calls send cookie automatically
  ▼
[API] requireAuth(request) → session.findUnique({token})
  │ checks: session.isValid, expiresAt, user.isActive
  │ resolvePermissions(userId, role) → attaches SessionUser.permissions
  ▼
returns SessionUser { id, email, username, name, role, avatar, permissions }
```

### Passkey (WebAuthn) Login Flow — skips 2FA
```
[Login Page] "เข้าสู่ระบบด้วย passkey", username entered
  │ POST /api/auth/passkey/login/options {username}
  ▼
[API] generateAuthenticationOptions(userVerification: 'required') → storeChallenge → return options
  │ [Client] startAuthentication() → POST /api/auth/passkey/login/verify {response}
  ▼
[API] verifyAuthenticationResponse(requireUserVerification: true) → update counter
  │ → createSession() → session_token cookie
  ▼
[Client] router.push('/dashboard')
```

### Late-Arrival / Early-Leave Forms
`LeaveType.LATE_ARRIVAL` (มาสาย) and `LeaveType.EARLY_LEAVE` (ออกก่อนเวลา) each use a
form/PDF pair separate from the general `LeaveForm`/`LeaveFormPDF` used for
sick/personal/maternity/etc.:
- `LeavesPageClient.tsx` branches on `selectedLeave.type` to render `LateArrivalForm`
  or `EarlyLeaveForm` instead of `LeaveForm`.
- `LateArrivalForm.tsx` computes fiscal-year (Oct 1–Sep 30) late-arrival stats
  (`LateArrivalStats`: exempt/late counts, past vs. total) from `userLeaves` and
  passes them into `LateArrivalFormPDF.tsx` for the printed/downloaded form.
- Both components strip a system-generated `[...]` prefix (half-day/hours/out-back-time
  tags) from `reason` before display via a shared `REASON_PREFIX_RE` regex —
  currently duplicated across files (see §13).

---

## 11. Config & Environment

### `.env` (required variables)
```
DATABASE_URL=mysql://user:pass@host:3306/ems_db
NEXTAUTH_SECRET=<openssl rand -base64 32>
NEXTAUTH_URL=http://localhost:3000
NODE_ENV=development|production
COOKIE_SAMESITE=strict|lax|none   (optional)

# Passkey (WebAuthn) — RP_ID must be a registrable domain, NOT a bare IP
RP_ID=localhost                   # prod: real hostname over HTTPS
RP_NAME=EMS TRD DTC               # also used as 2FA TOTP issuer
WEBAUTHN_ORIGIN=http://localhost:3000

# 2FA — encrypts TOTP secret at rest; back it up (losing it forces re-enrollment)
TWO_FACTOR_ENC_KEY=<openssl rand -base64 32>

# LINE Messaging API — task reminders + leave-stage notifications (Group push,
# not the deprecated LINE Notify)
LINE_CHANNEL_ACCESS_TOKEN=<from LINE Developers console>
LINE_CHANNEL_SECRET=<from LINE Developers console>          # verifies /api/line/webhook signatures
LINE_GROUP_ID=<discovered via /api/line/webhook, see §10>

# Cron — protects /api/cron/reminders from unauthenticated calls
CRON_SECRET=<random string, matched via x-cron-secret header>

# Optional: backups, logging (see lib/logger.ts, scripts/backup.ts)
BACKUP_DIR=, BACKUP_RETENTION_DAYS=
LOG_LEVEL=   # debug|info|warn|error, invalid value falls back to info
ALLOWED_ORIGINS=   # explicit CORS allowlist for prod (see proxy.ts)
```

### `.env.test`
Separate DB connection string pointed at `docker-compose.test.yml`'s MariaDB
instance (port 3307). Loaded by `tests/load-test-env.ts`; `tests/global-setup.ts`
runs `prisma migrate deploy` against it once per `vitest run`.

### `next.config.js`
- Security headers: HSTS (2yr), X-Frame-Options, X-Content-Type-Options, XSS-Protection, Referrer-Policy, CSP
- Turbopack + webpack `canvas: false` alias
- `poweredByHeader: false`

### `docker-compose.yml` / `docker-compose.test.yml`
- `mariadb` service: MariaDB 10.11, utf8mb4, 256M InnoDB buffer — port 3306 (dev/prod)
- `phpmyadmin` service: optional `--profile admin` — port 8080
- `docker-compose.test.yml` runs an isolated MariaDB on port 3307, used by `pnpm test`/CI so tests never touch dev/prod data

---

## 12. Dependencies

### Production
| Package | Version | Purpose |
|---|---|---|
| next | ^16.4.5 | Framework |
| react / react-dom | ^19.0.0 | UI |
| prisma / @prisma/client | ^5.7.0 | ORM |
| zod | ^3.22.4 | Validation |
| bcryptjs | ^2.4.3 | Password hashing + backup-code hashing |
| @simplewebauthn/server | ^13.3.2 | Passkey (WebAuthn) server verification |
| @simplewebauthn/browser | ^13.3.0 | Passkey client ceremony (startRegistration/Authentication) |
| otplib | ^13.4.1 | TOTP generate/verify (2FA) |
| qrcode | ^1.5.4 | 2FA enrollment QR (data URL) |
| exceljs | ^4.4.0 | Supplies/documents Excel export (styled) |
| xlsx | ^0.18.5 | Assets Excel export |
| file-type | ^22.0.1 | Server-side MIME detection for uploads |
| @react-pdf/renderer | ^4.3.2 | Leave / late-arrival / early-leave / form-request PDF generation |
| recharts | ^3.7.0 | Dashboard charts |
| lucide-react | ^0.563.0 | Icons |
| tailwind-merge / clsx | ^2.2.0 / ^2.0.0 | Class utilities |
| @radix-ui/* | various | Accessible UI primitives |
| isomorphic-dompurify / dompurify | ^2.0.0 / ^3.0.6 | XSS sanitization |
| pino | ^10.3.1 | Structured JSON logging in production |
| express-rate-limit, helmet, jsonwebtoken | various | Present in package.json; not currently wired into any route — candidates for removal or a future use (see §13) |

### Dev
| Package | Version |
|---|---|
| typescript | ^5.9.3 |
| tailwindcss | ^3.4.0 |
| prisma (CLI) | ^5.7.0 |
| tsx | ^4.7.0 |
| vitest | ^4.1.10 |
| @playwright/test | ^1.61.1 |
| @testing-library/react / jest-dom / user-event | ^16 / ^6.9 / ^14.6 |
| jsdom | ^29.1.1 |
| vite-tsconfig-paths | ^6.1.1 |
| @types/node, react, bcryptjs, qrcode, jsonwebtoken, dompurify | various |

---

## 13. Technical Debt & Known Issues

| Location | Issue | Severity |
|---|---|---|
| `next.config.js:44` | CSP includes `'unsafe-inline'` and `'unsafe-eval'` — weakens XSS protection. Requires nonce-based CSP or isolating the library that needs eval. | High |
| `src/lib/security.ts` | `containsSqlInjection()` function exists but is never called in any API route — dead code. Remove or wire up. | Low |
| `src/proxy.ts:27` | CORS allows wildcard in dev — should specify explicit domain for production. | Medium |
| `src/lib/auth.ts` `getClientIp()` | Trusts `X-Forwarded-For`/`X-Real-IP` unconditionally with no check that the request came through a trusted proxy. Backstopped by username-keyed rate limiting (§8) so it no longer fully defeats brute-force protection, but the IP itself (used for audit/logging) can still be spoofed. Needs a trusted-proxy allowlist if the deployment topology changes. | Medium |
| All GET supply/asset routes | No `isManagerOrAbove` check — EMPLOYEE role can enumerate all supplies, transactions, and asset checkouts. | Medium |
| `src/app/dashboard/*/[Page]Client.tsx` | The page.tsx → `*PageClient.tsx` split relocated the original monolithic pages rather than decomposing them — several client files are still 1000-1900 lines (e.g. `LeavesPageClient.tsx`, `SuppliesPageClient.tsx`). Candidates for splitting into hooks/subcomponents (tabs, modals, dashboard stats), not just a server/client boundary. | Low |
| `src/lib/leave-tabs-server.ts` | `buildLeaveTabWhere()` (Prisma where-fragment) has no test coverage of its own, and must be kept behaviorally identical by hand to its tested twin `resolveLeaveTab()` in `leave-tabs.ts` — a future edit to one without the other would silently mis-file records in leave export/search. | Low |
| `src/app/api/leaves/[id]/route.ts` | The 3-stage approval state machine is a single growing if/else-if chain in the PATCH handler. Correct and well-tested today; a 4th stage would be a good trigger to extract a typed dispatcher. | Low |
| Session cleanup | Expired sessions accumulate in DB — no cron job to prune `sessions` table. Same applies to `webauthn_challenges` and `two_factor_challenges` (only deleted on success/expiry-hit; abandoned login flows leave rows). | Medium |
| Hand-written migrations | Some early migration SQL (passkey/2FA, form-requests baseline) was authored by hand or against an already-`db push`'d schema. Verify with `prisma migrate status` after `migrate deploy`. | Medium |
| Mandatory 2FA rollout | All existing users are forced into 2FA enrollment at next login. Admin-reset endpoint (`DELETE /api/auth/2fa/[userId]`) covers lost devices; ensure ≥1 admin can enroll. | Low |
| `LeaveForm.tsx` / `LateArrivalForm.tsx` / `EarlyLeaveForm.tsx` | Fiscal year calc (Oct 1–Sep 30) now centralized in `leave-calc.ts`/`leave-rules-server.ts`, but `REASON_PREFIX_RE` regex and `formatThaiDate`/`thaiMonths` are still duplicated verbatim across the leave form components instead of shared. | Low |
| `public/uploads/` | Legacy disk-based upload dir; uploads now persist to the `uploaded_files` DB table via `scripts/migrate-uploads-to-db.ts`. Confirm no code path still writes here before removing. | Low |
| `/api/cron/reminders` | Relies solely on a static shared secret (`CRON_SECRET`) with no rate limiting — acceptable for a NAS-internal scheduler but would need hardening if ever exposed publicly. | Low |
| `src/lib/logger.ts` | Production logs are structured JSON via `pino`, written sync to stdout (see `worker.log`). Rotation is the weekly line-count truncation in `systemd/rotate-worker-log.sh`, not logrotate/journald — no shipping to any external log system. | Low |
| `package.json` deps | `express-rate-limit`, `helmet`, `jsonwebtoken` are installed but unused (the app uses `rate-limit-db.ts`, `next.config.js` headers, and cookie-token sessions instead). Remove or document why they're kept. | Low |

---

## 14. Build & Development Commands

```bash
pnpm dev          # Start dev server (Turbopack)
pnpm build        # Production build
pnpm start        # Start prod server (0.0.0.0:3000)
pnpm lint         # ESLint

pnpm db:generate  # Regenerate Prisma client after schema changes
pnpm db:migrate   # Run pending migrations (dev)
pnpm db:studio    # Open Prisma Studio
pnpm db:seed      # Run seed (permissions, form templates, leave rules, etc.)

pnpm db:import-assets       # Bulk-import assets (scripts/import-assets.ts)
pnpm db:migrate-uploads     # One-off: move disk uploads into UploadedFile table
pnpm db:fix-leave-years     # Data repair: Buddhist-year leave dates
pnpm db:fix-document-years  # Data repair: Buddhist-year document dates
pnpm db:fix-html-entities   # Data repair: un-escape HTML entities in stored text
pnpm db:reset-test-data     # Wipe + reseed local/test DB for manual QA
pnpm db:backup / db:backup:list / db:restore

npx prisma db push  # Sync schema to DB without migration (used for new fields)

pnpm test            # Vitest — unit/integration tests (needs test DB, see below)
pnpm test:watch      # Vitest watch mode
pnpm test:e2e        # Playwright e2e tests
pnpm test:db:up      # Start the isolated test MariaDB (docker-compose.test.yml, :3307)
pnpm test:db:down    # Stop + remove the test MariaDB volume
pnpm test:all        # test:db:up → test → test:e2e → test:db:down

docker-compose up -d              # Start dev/prod MariaDB
docker-compose --profile admin up # + phpMyAdmin on :8080
```

---

## 15. Suggested Next Features

### Audit Log
- Add `AuditLog` model (entity, action, userId, changes JSON, createdAt)
- Wire into user/supply/asset/document mutations — the new `UserPermission`/`RolePermission`
  and 3-stage leave approval changes already log via `logger.info`/`warn`, but there's no
  queryable audit trail yet
- New admin page: `/dashboard/audit`

### Notifications / Reminders
- Task reminders and leave-stage updates now push to LINE — extend the same pattern to
  form-request approvals/rejections and asset overdue-return alerts
- In-app `Notification` model (userId, message, isRead, createdAt) as an alternative/complement to LINE

### Leave Balance Tracking
- Extend `User` or add `LeaveBalance` model
- New API: `GET /api/leaves/balance?userId=`

### Kanban Enhancements
- Archive view already has folders (`TaskFolder`) — add filtering/search within a folder
- Due dates and labels (extend Task with `dueDate`, `labels`)

### Supply/Asset Enhancements
- QR code generation for asset tags
- Scheduled inspection reminders
- Low-stock email/LINE alerts for STOCK supplies (dashboard widget already surfaces this; automate the push)

### Document Register Enhancements
- Attach scanned files (`UploadedFile`) directly to a `DocumentRegister` row
- Full-text search across `subject`/`remarks`

### Form Builder Enhancements
- Field types beyond text/number/date/time/textarea/select (e.g. file attachment, multi-select)
- Per-template approval routing (currently any `forms.approve` holder can decide any pending request, regardless of department)

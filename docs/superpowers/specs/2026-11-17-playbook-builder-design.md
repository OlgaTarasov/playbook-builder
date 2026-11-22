# Security Automation Playbook Builder — Design

Date: 2026-11-22 (revised from 2026-11-17)
Source: `requirements.docx` (Home Assignment), wireframes `LoginRegisterPage.png`, `CreatePlaybookPage.png`, `SimulateEventPage.png`.

## 1. Scope

Built to the requirements, with nothing beyond them. Section 15 maps each requirement to where it is met.

In:
- Email/password registration and login. An HttpOnly session cookie, set at login, protects every route except `/auth/*`.
- Each request re-loads the user from the database. Grants are read from the database on each request too.
- Triggers and actions are predefined rows, loaded by a SQL seed.
- A user adds triggers from the predefined list. Only added triggers can be used.
- Create, list and delete playbooks: name, one trigger, 1–3 actions. Editing is not built.
- Simulate an event: pick a trigger, see the caller's matching playbooks and the actions that would run.
- Three React pages (Login/Register, Create Playbook, Simulate Event) and a nav bar to move between them.
- Backend and frontend tests. Docker Compose runs the whole stack with one command. README with run steps and API overview.

Out:
- Creating or deleting triggers and actions through the API or UI.
- Playbook editing, password reset, lockout, roles, sharing, token refresh, OAuth, HTTPS.

## 2. Stack

| Concern | Choice |
|---|---|
| Runtime | Docker + Docker Compose |
| Database | MySQL 8.4 (named volume) |
| ORM | Prisma (schema, migrations, queries) |
| Backend | Node.js + TypeScript, Express |
| Validation | Zod (request bodies, params) |
| Auth | `bcryptjs` password hashes, `jsonwebtoken` (HS256) |
| Frontend | Vite + React + TypeScript, React Router, one plain CSS file |
| Web server | nginx in the `web` container, serves the SPA and proxies `/api` |
| Tests | Vitest + Supertest against MySQL (backend); Vitest + React Testing Library with the API module mocked (frontend) |

## 3. Architecture

```
Browser (React SPA)  --fetch /api, session cookie (HttpOnly)-->  web (nginx :8080)
                                                                      |  proxy /api
                                                                      v
                                                          api (Express + Prisma :4000)
                                                                      |
                                                                      v
                                                          db (MySQL 8.4, volume)
```

Backend, one job per folder:
- `routes/` — HTTP mapping and input validation.
- `services/` — business rules: registration, trigger access, playbook rules, simulation.
- `repositories/` — Prisma queries only. Every playbook query takes `userId`.
- `middleware/` — `authenticate` (session cookie, then user reload, sets `req.user`), `errorHandler`.
- `config.ts` — reads `DATABASE_URL`, `JWT_SECRET`, `PORT`; fails fast if one is missing.

Frontend, one job per folder:
- `api/` — `apiClient` (base URL, same-origin credentials, error normalisation) and resource calls.
- `auth/` — `AuthProvider` (user restored from `/auth/me` on load; no token in browser storage) and `RequireAuth` guard.
- `pages/` — `LoginPage`, `CreatePlaybookPage`, `SimulateEventPage`.
- `components/` — `NavBar`, `TriggerPicker` (select plus Add Trigger), `ErrorBanner`.

## 4. Data model

Prisma schema (`server/prisma/schema.prisma`):

```prisma
model User {
  id            String        @id @default(uuid()) @db.Char(36)
  email         String        @unique @db.VarChar(255)
  passwordHash  String        @db.VarChar(255)
  createdAt     DateTime      @default(now())
  playbooks     Playbook[]
  triggerGrants UserTrigger[]
}

model Trigger {
  id        String        @id @default(uuid()) @db.Char(36)
  name      String        @unique @db.VarChar(50)
  createdAt DateTime      @default(now())
  playbooks Playbook[]
  grants    UserTrigger[]
}

model UserTrigger {                      // triggers a user has added
  userId    String   @db.Char(36)
  triggerId String   @db.Char(36)
  createdAt DateTime @default(now())
  user      User     @relation(fields: [userId], references: [id], onDelete: Cascade)
  trigger   Trigger  @relation(fields: [triggerId], references: [id], onDelete: Restrict)

  @@id([userId, triggerId])
}

model Action {
  id        String           @id @default(uuid()) @db.Char(36)
  name      String           @unique @db.VarChar(50)
  sortOrder Int              @unique      // order shown in the UI
  links     PlaybookAction[]
}

model Playbook {
  id        String           @id @default(uuid()) @db.Char(36)
  userId    String           @db.Char(36)
  triggerId String           @db.Char(36)
  name      String           @db.VarChar(100)
  createdAt DateTime         @default(now())
  user      User             @relation(fields: [userId], references: [id], onDelete: Cascade)
  trigger   Trigger          @relation(fields: [triggerId], references: [id], onDelete: Restrict)
  actions   PlaybookAction[]

  @@unique([userId, name])               // name is unique per user
  @@index([triggerId])
}

model PlaybookAction {
  playbookId String   @db.Char(36)
  actionId   String   @db.Char(36)
  position   Int                         // 0-based order
  playbook   Playbook @relation(fields: [playbookId], references: [id], onDelete: Cascade)
  action     Action   @relation(fields: [actionId], references: [id], onDelete: Restrict)

  @@id([playbookId, actionId])
  @@unique([playbookId, position])
  @@index([actionId])
}
```

Seed: a SQL migration, `server/prisma/migrations/<timestamp>_seed_catalogue/migration.sql`, so `prisma migrate deploy` loads it on every start. It is idempotent.

```sql
INSERT IGNORE INTO Trigger (id, name) VALUES
  (UUID(), 'Malware Detected'),
  (UUID(), 'Login Attempt'),
  (UUID(), 'Phishing Alert');

INSERT IGNORE INTO Action (id, name, sortOrder) VALUES
  (UUID(), 'Isolate Host', 1),
  (UUID(), 'Notify Admin', 2),
  (UUID(), 'Block IP', 3);
```

Rules:
- Trigger and action names come only from the seed. The API cannot create or delete them.
- New users start with no triggers. They add them from the predefined list.
- Playbook name is unique per user (`userId` + `name`). Two users may reuse a name.
- A playbook has 1–3 distinct actions, stored in the order sent. The UI sends them in catalogue order.
- Deleting a playbook removes its `PlaybookAction` rows.

## 5. Access control

### 5.1 Authentication
- Register and login set the `playbook_session` cookie and return `{ user: { id, email } }`. The JWT inside is HS256, signed with `JWT_SECRET`, valid for 24 hours. Claims: `sub`, `iat`, `exp` only. The cookie is `HttpOnly`, `SameSite=Strict`, `Path=/`, `Max-Age=86400`, and `Secure` only when `COOKIE_SECURE=true`.
- `POST /auth/logout` clears the cookie. `GET /auth/me` returns the current user.
- `authenticate` on every route except `/auth/*`:
  1. verifies signature and expiry;
  2. loads the user with `sub` from the database;
  3. sets `req.user` from the database row.
  Any failure returns 401 `UNAUTHORIZED`. A user removed from the database is locked out on the next request, even with an unexpired token.

### 5.2 Ownership and triggers
- Playbooks: a user sees and deletes only their own. Another user's playbook returns 404.
- Triggers: a user may use a trigger only after adding it (`UserTrigger` row). The row is read from the database on each request. Creating a playbook or simulating with a trigger not added returns 403 `TRIGGER_NOT_ADDED`.
- Actions: shared, no per-user restriction.

### 5.3 Passwords
- At least 8 characters, at least one letter and one digit, at most 72 bytes (bcrypt limit). The policy is shown under the field.
- Login errors are the same for wrong password and unknown email.

## 6. API

All responses are JSON. Errors: `{ "error": { "code", "message", "details"? } }`.

| Method | Path | Auth | Body → result |
|---|---|---|---|
| POST | `/auth/register` | no | `{ email, password }` → `201 { user }` + session cookie; 400 invalid; 409 `EMAIL_TAKEN` |
| POST | `/auth/login` | no | `{ email, password }` → `200 { user }` + session cookie; 401 `INVALID_CREDENTIALS` |
| POST | `/auth/logout` | no | clears the session cookie → 204 |
| GET | `/auth/me` | yes | → `200 { user }`; 401 `UNAUTHORIZED` |
| GET | `/triggers` | yes | → `200 { triggers: [{ id, name }] }` — the caller's added triggers |
| GET | `/triggers/available` | yes | → `200 { triggers: [{ id, name }] }` — catalogue triggers not yet added |
| POST | `/triggers/added` | yes | `{ triggerId }` → `201 { trigger }`; 404 unknown trigger; 409 `TRIGGER_ALREADY_ADDED` |
| GET | `/actions` | yes | → `200 { actions: [{ id, name }] }` in `sortOrder` |
| GET | `/playbooks` | yes | → `200 { playbooks: [{ id, name, trigger, actions, createdAt }] }` — the caller's only |
| POST | `/playbooks` | yes | `{ name, triggerId, actionIds: [1–3 distinct] }` → `201 { playbook }`; 400 invalid; 403 `TRIGGER_NOT_ADDED`; 409 duplicate name |
| DELETE | `/playbooks/:id` | yes | → `204`; 404 if not found or not owned by caller |
| POST | `/simulateTrigger` | yes | `{ triggerId }` → `200 { trigger, matches: [{ playbook: { id, name }, actions: [{ id, name }] }] }`; 403 `TRIGGER_NOT_ADDED` |

Simulation considers only the caller's playbooks that use the given trigger. Actions are listed in stored `position` order. With no matches, `matches` is an empty array.

## 7. Validation (Zod)

- Email: valid format; trimmed and lowercased.
- Password: rule in 5.3.
- Playbook name: trimmed, 1–100 characters, not blank.
- Playbook: `triggerId` required; `actionIds` 1–3 items, distinct, all existing.
- Empty or malformed input returns 400 before any database call.
- All values reach MySQL through Prisma parameters. No raw SQL is built from input.

## 8. UI (from the wireframes)

Common: after login, a nav bar with **Create Playbook**, **Simulate Event**, **Logout**. Logout clears the session cookie. A 401 from the API ends the session and returns to login. On load the app checks `/auth/me` and shows a loading state until it has an answer.

**Login / Register** (`LoginRegisterPage.png`)
- One centred card: title "Login / Register", **Email**, **Password** (masked, with the policy shown), and the links **Login** | **Register** that switch mode.
- Register logs the user in straight away.
- Errors: field errors for empty or malformed email and for a password that breaks the policy; a banner for the generic login failure.

**Create Playbook** (`CreatePlaybookPage.png`)
- Left: **Name** input, **Trigger** select, **Actions** checkboxes (Isolate Host, Notify Admin, Block IP), the note "(Choose up to 3)", and a **Create** button.
- Right: the caller's playbooks, each with a **Delete** link (confirm before deleting).
- Trigger select shows the caller's added triggers. **Add Trigger** is always shown next to it. Clicking it lists the available triggers; choosing one adds it to the caller's list and selects it.
- If the caller has no triggers, the select is empty and the Create button is disabled until one is added.
- The fourth checkbox is disabled once three are ticked.
- After create: form resets, the list refreshes.

**Simulate Event** (`SimulateEventPage.png`)
- A **Trigger** select with **Add Trigger** (same as above) and a **Run Simulation** button.
- Results under the heading "Matching Playbooks": for each match, `Playbook: <name>` followed by `→ <action>` lines. With no matches: "No matching playbooks."
- Results are replaced on each run. The list is empty until the first run.

## 9. Error handling

- Backend: one `errorHandler` maps errors to the JSON shape. Validation → 400 `VALIDATION_ERROR` with `details`. Unknown errors → 500 `INTERNAL`, with the stack logged server-side only.
- Frontend: `apiClient` throws `ApiError { code, message, details }`. Forms show field errors from `details`; other errors show in `ErrorBanner`.
- Submit buttons are disabled while a request is in flight.

## 10. Tests

Backend, integration (Vitest + Supertest against MySQL; tables truncated between tests):
- Auth: register; duplicate email 409; weak password 400; login success; generic error for wrong password and unknown email.
- Token and user checks: missing, malformed, expired or wrongly signed token returns 401 on a protected route; a valid session cookie for a user deleted in the database returns 401 on the next request. A token sent as a Bearer header is not accepted.
- Playbooks: create, list, delete; duplicate name 409; 0 or 4 actions 400; duplicate action ids 400.
- Triggers: adding a trigger; a trigger not added returns 403 on create and on simulate; a revoked `UserTrigger` row blocks the next request.
- Ownership: user B cannot list, delete or see user A's playbooks.
- Simulation: matches only the caller's playbooks with that trigger; actions in stored order; no match returns an empty list.
- Injection: `' OR 1=1--` and `<script>` in login and playbook names are rejected or stored as plain text.

Backend, unit (Vitest): Zod schemas (email normalisation, password rule, action count and distinctness); config parsing.

Frontend (Vitest + React Testing Library, `api/` module mocked):
- Login: empty fields send no request; invalid email shows a field error; password input is masked.
- Create Playbook: validation for empty name, no trigger, no actions; checkbox limit of 3; form resets after create; Add Trigger is shown and adds a trigger.
- Simulate Event: results rendered; "No matching playbooks" message; results replaced on re-run.
- Playbook names are rendered as text, not HTML.

Commands:
- `npm test` in `server/` and `client/`.
- `docker compose run --rm api npm test` for the backend integration tests in the container.

## 11. Docker

`docker-compose.yml` at the repo root:
- `db`: `mysql:8.4`. Environment for root password, database `playbooks`, and app user. Healthcheck. Named volume `db_data`. `db/init/01-test-db.sql` grants the app user on `playbooks_test`, so integration tests run in their own database.
- `api`: built from `server/Dockerfile`. Waits for `db` to be healthy. Start command: `npx prisma migrate deploy && node dist/index.js` (migrations include the seed). Reads `DATABASE_URL`, `JWT_SECRET`, `PORT`, and optional `COOKIE_SECURE` from the environment.
- `web`: built from `client/Dockerfile` (multi-stage: Vite build, then nginx). nginx serves the SPA and proxies `/api/*` to `api:4000`. Published on port 8080.

Run: `cp .env.example .env`, then `docker compose up --build`, then open `http://localhost:8080`.

Development without `web` in a container: start only `db` with Compose; run `npm run dev` in `server/` (port 4000) and `client/` (Vite on port 5173, proxies `/api` to 4000).

## 12. Error codes

| Code | Status | Used for |
|---|---|---|
| `VALIDATION_ERROR` | 400 | Zod failure, with `details` |
| `UNAUTHORIZED` | 401 | Missing, invalid or expired session; user not found |
| `INVALID_CREDENTIALS` | 401 | Wrong password or unknown email |
| `TRIGGER_NOT_ADDED` | 403 | Trigger not in the caller's list |
| `NOT_FOUND` | 404 | Unknown or not-owned playbook; unknown trigger on add |
| `EMAIL_TAKEN` | 409 | Duplicate email |
| `PLAYBOOK_NAME_TAKEN` | 409 | Duplicate playbook name for this user |
| `TRIGGER_ALREADY_ADDED` | 409 | Trigger already in the caller's list |
| `INTERNAL` | 500 | Unexpected error |

## 13. Repository layout

```
.
├── README.md
├── docker-compose.yml
├── .env.example
├── db/init/01-test-db.sql
├── server/
│   ├── Dockerfile, package.json, tsconfig.json, .env.example
│   ├── prisma/schema.prisma, prisma/migrations/ (incl. seed migration)
│   ├── src/ (index.ts, app.ts, config.ts, schemas.ts, errors.ts,
│   │         routes/, services/, repositories/, middleware/)
│   └── test/ (unit/, integration/)
└── client/
    ├── Dockerfile, nginx.conf, package.json, vite.config.ts, tsconfig.json
    └── src/ (main.tsx, App.tsx, api/, auth/, pages/, components/, styles.css)
```

## 14. Decisions

1. **Docker Compose** runs the stack. It is in the requirements' spirit of easy local running, and the README gives the one-command path.
2. **Prisma** for schema, migrations and queries. Seed is a SQL migration, so the SQL is still plain.
3. **Per-request user reload and grant read.** Required for access validation (your decision).
4. **Catalogue is seed-only.** Triggers and actions come from the seed. The API has no create or delete for them.
5. **Per-user trigger list.** Users add triggers from the predefined list. Only added triggers can be used. The grant is the `UserTrigger` row.
6. **Add Trigger always available** next to the trigger select.
7. **Playbook name unique per user** (`userId` + `name`). Not in the requirements; chosen by the author.
8. **Ownership returns 404.** Another user's playbook is indistinguishable from a missing one.
9. **Nav bar.** Needed to move between the three pages and to log out. The wireframes show none.
10. **Password policy.** 8+ characters, one letter, one digit, max 72 bytes.

## 15. Requirements traceability

Source: `requirements.docx`.

| Requirement | Where it is met |
|---|---|
| Basic email-based login/registration | 6 (`/auth/*`), 8 (Login/Register page) |
| Store users in the database | 4 (`User`) |
| Basic token system protects routes | 5.1 (JWT in an HttpOnly cookie on every route except `/auth/*`) |
| Playbook has a name, a trigger, and a list of actions | 4 (`Playbook`, `PlaybookAction`) |
| Trigger choices: Malware Detected, Login Attempt, Phishing Alert | 4 (seed) |
| Action choices: Isolate Host, Notify Admin, Block IP | 4 (seed), 8 (checkboxes) |
| Create a playbook (max 1 trigger + 1–3 actions) | 6 (`POST /playbooks`), 7 (validation), 8 (Create Playbook) |
| View existing playbooks | 6 (`GET /playbooks`), 8 (right-hand list) |
| Delete a playbook | 6 (`DELETE /playbooks/:id`), 8 (Delete link) |
| Editing optional | Not built (1) |
| Simulation: select a trigger | 6 (`POST /simulateTrigger`), 8 (Simulate Event) |
| Simulation: show which playbooks match | 6 (matches), 8 (results list) |
| Simulation: list of actions that would run | 6 (`actions` per match), 8 (`→ action` lines) |
| Minimal React app, 3 pages | 8 (Login/Register, Create Playbook, Simulate Event) |
| Node.js / TypeScript backend | 2, 3 |
| Choice of database | 2 (MySQL) |
| Asynchronous code | 2 (Express and Prisma are async); used throughout |
| REST endpoints `/auth/register`, `/auth/login` | 6 |
| REST endpoints `/playbooks` (GET, POST, DELETE) | 6 |
| REST endpoint `/simulateTrigger` (POST) | 6 |
| React frontend | 2, 3 |
| REST between client and server | 3, 6 |
| UI easy to work with, CSS not a priority | 8 (wireframe layout), 2 (one plain CSS file) |
| Forms for login and playbook creation | 8 |
| Display playbooks and simulate triggers | 8 |
| Evaluation: readability and structure | 3, 13 |
| Evaluation: functional REST integration | 6, 10 |
| Evaluation: separation of concerns, reusable components | 3 (routes, services, repositories, components) |
| Evaluation: error handling | 9, 12 |
| Evaluation: tests | 10 |
| Evaluation: documentation | 11 (run steps), README (API overview) |
| Outcome: zip or rar with README explaining local run | 11, 13 (`README.md`) |

Deviation to confirm: the requirements say "On the dashboard" for simulation, and also list a separate "Simulate Event" page. The design uses a separate page, following the three-page list and the wireframe.

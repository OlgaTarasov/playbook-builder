# Low-Level Design — Backend (API)

Date: 2026-11-22
Related: `docs/HLD.md`, `docs/superpowers/specs/2026-11-17-playbook-builder-design.md`

## 1. Scope

The `server/` package: an Express + TypeScript REST API using Prisma on MySQL. It covers authentication, trigger and action catalogue reads, the user's trigger list, playbook CRUD, and simulation. The UI is in `docs/LLD-ui.md`.

## 2. Module layout

```
server/
├── prisma/
│   ├── schema.prisma
│   └── migrations/
│       ├── <ts>_init/migration.sql
│       └── <ts>_seed_catalogue/migration.sql
├── src/
│   ├── index.ts                 bootstrap: load config, build app, listen, graceful shutdown
│   ├── app.ts                   createApp(): middleware, route mounting, error handler
│   ├── config.ts                env parsing (Zod)
│   ├── db.ts                    single PrismaClient instance
│   ├── errors.ts                AppError hierarchy and error codes
│   ├── schemas.ts               Zod schemas for body, params
│   ├── middleware/
│   │   ├── authenticate.ts
│   │   ├── validate.ts
│   │   └── errorHandler.ts
│   ├── routes/
│   │   ├── auth.routes.ts
│   │   ├── triggers.routes.ts
│   │   ├── actions.routes.ts
│   │   ├── playbooks.routes.ts
│   │   └── simulation.routes.ts
│   ├── services/
│   │   ├── token.service.ts
│   │   ├── auth.service.ts
│   │   ├── trigger.service.ts
│   │   ├── action.service.ts
│   │   ├── playbook.service.ts
│   │   └── simulation.service.ts
│   └── repositories/
│       ├── user.repository.ts
│       ├── trigger.repository.ts      Trigger and UserTrigger queries
│       ├── action.repository.ts
│       └── playbook.repository.ts
└── test/
    ├── helpers/ (app factory, db reset, session cookie helper)
    ├── unit/ (schemas, password policy, config)
    └── integration/ (auth, triggers, actions, playbooks, simulation, access)
```

Dependency direction: `routes → services → repositories → db`. Services never touch Express types. Repositories never contain business rules.

## 3. Configuration (`config.ts`)

| Variable | Required | Rule |
|---|---|---|
| `DATABASE_URL` | yes | MySQL URL, used by Prisma |
| `JWT_SECRET` | yes | at least 32 characters |
| `COOKIE_SECURE` | no | `true` or `false` (default `false`). Set `true` only when served over HTTPS; adds the `Secure` flag to the session cookie |
| `PORT` | no | integer, default `4000` |

`loadConfig(env)` parses with Zod and throws at startup if invalid. Nothing else reads `process.env`.

```ts
export interface Config {
  databaseUrl: string;
  jwtSecret: string;
  cookieSecure: boolean;
  port: number;
}
```

## 4. Application bootstrap

`index.ts`:
1. `loadConfig(process.env)`.
2. `createApp({ jwtSecret, cookieSecure })`.
3. `app.listen(config.port)`.
4. On `SIGTERM`/`SIGINT`: close the server, `prisma.$disconnect()`, exit.

`app.ts` (`createApp`):
- `app.disable('x-powered-by')`.
- `express.json({ limit: '10kb' })`.
- Mount routes:

| Mount | Router | Auth |
|---|---|---|
| `/auth` | `auth.routes` | none |
| `/triggers` | `triggers.routes` | `authenticate` |
| `/actions` | `actions.routes` | `authenticate` |
| `/playbooks` | `playbooks.routes` | `authenticate` |
| `/simulateTrigger` | `simulation.routes` | `authenticate` |

- Unknown path → `NotFoundError` (404 `NOT_FOUND`).
- `errorHandler` registered last.

Dependencies are passed in, not imported as singletons, so tests can build the app with a test database.

## 5. Errors (`errors.ts`)

```ts
export type ErrorCode =
  | 'VALIDATION_ERROR' | 'UNAUTHORIZED' | 'INVALID_CREDENTIALS'
  | 'TRIGGER_NOT_ADDED' | 'NOT_FOUND' | 'EMAIL_TAKEN' | 'TRIGGER_ALREADY_ADDED' | 'PLAYBOOK_NAME_TAKEN' | 'INTERNAL';

export class AppError extends Error {
  constructor(
    readonly status: number,
    readonly code: ErrorCode,
    message: string,
    readonly details?: { path: string; message: string }[],
  ) { super(message); }
}

export class ValidationError extends AppError { /* 400 VALIDATION_ERROR */ }
export class UnauthorizedError extends AppError { /* 401 UNAUTHORIZED */ }
export class InvalidCredentialsError extends AppError { /* 401 INVALID_CREDENTIALS */ }
export class ForbiddenError extends AppError { /* 403 TRIGGER_NOT_ADDED */ }
export class NotFoundError extends AppError { /* 404 NOT_FOUND */ }
export class ConflictError extends AppError { /* 409 EMAIL_TAKEN, TRIGGER_ALREADY_ADDED or PLAYBOOK_NAME_TAKEN */ }
```

Messages are fixed strings chosen in the service, never copied from input or from Prisma.

## 6. Error handler (`middleware/errorHandler.ts`)

Maps in this order:

| Input | Response |
|---|---|
| `AppError` | its `status`, `code`, `message`, `details` |
| `ZodError` (if not already converted) | 400 `VALIDATION_ERROR`, `details` = `[{ path, message }]` |
| Body parse failure (`entity.parse.failed`) | 400 `VALIDATION_ERROR`, message "Malformed JSON" |
| Anything else | 500 `INTERNAL`, message "Unexpected error"; `console.error(err)` on the server only |

Response body: `{ "error": { "code", "message", "details"? } }`.

`validate(schema, source)` middleware converts Zod failures into `ValidationError` so the handler sees one path.

## 7. Validation schemas (`schemas.ts`)

| Schema | Rule |
|---|---|
| `email` | `string().trim().toLowerCase().email().max(255)` |
| `passwordPolicy` | `string()`, `length >= 8`, `Buffer.byteLength <= 72`, `/[A-Za-z]/`, `/\d/` |
| `registerBody` | `{ email, password: passwordPolicy }` |
| `loginBody` | `{ email, password: string().min(1).max(72) }` |
| `triggerAddBody` | `{ triggerId: string().uuid() }` |
| `playbookBody` | `{ name: string().trim().min(1).max(100), triggerId: uuid, actionIds: array(uuid).min(1).max(3).refine(distinct) }` |
| `idParam` | `{ id: string().min(1) }`. Any non-empty string is accepted; an unknown id returns 404 from the service, not 400 |
| `simulateBody` | `{ triggerId: uuid }` |

Password messages: "Password must be at least 8 characters", "Password must include a letter and a digit", "Password must be at most 72 bytes".

`validate` checks body, params and query separately and merges failures into one `details` array.

## 8. Authentication

### 8.1 Token service (`token.service.ts`)

```ts
sign(userId: string): string        // HS256, expiresIn '24h', payload { sub }
verify(token: string): string       // returns sub; throws UnauthorizedError
```
- Algorithms allow-list: `['HS256']` on verify.
- Any verification error → `UnauthorizedError('Invalid or expired token')`.

### 8.2 Authenticate middleware (`middleware/authenticate.ts`)

```
token = readSessionToken(req)     // Cookie header, name playbook_session
if !token → UnauthorizedError     // a Bearer header is not read
sub = tokenService.verify(token)
user = userRepository.findById(sub)
if !user → UnauthorizedError
req.user = { id: user.id, email: user.email }
next()
```
Runs on every protected request, so a deleted user is rejected on the next request.

### 8.3 Auth service (`auth.service.ts`)

`register({ email, password })`:
1. `userRepository.findByEmail(email)`; if found → `ConflictError(EMAIL_TAKEN)`.
2. `passwordHash = bcrypt.hash(password, 12)`.
3. `userRepository.create({ email, passwordHash })`. On Prisma `P2002` (race) → `ConflictError(EMAIL_TAKEN)`.
4. Return `{ token: tokenService.sign(user.id), user: { id, email } }`. The route sets the `playbook_session` cookie and responds with `{ user }` only.

`login({ email, password })`:
1. `user = findByEmail(email)`.
2. `hash = user?.passwordHash ?? DUMMY_HASH`. Always run `bcrypt.compare(password, hash)` so timing does not reveal whether the email exists.
3. If `!user || !match` → `InvalidCredentialsError` ("Invalid email or password").
4. Return `{ token, user }`. The route sets the cookie and responds with `{ user }` only.

`DUMMY_HASH` is a bcrypt hash computed once at module load.

### 8.4 Session cookie (`middleware/sessionCookie.ts`)
- Name `playbook_session`. Attributes: `HttpOnly`, `SameSite=Strict`, `Path=/`, `Max-Age=86400` (24 hours), `Secure` only when `COOKIE_SECURE=true`.
- `setSessionCookie` and `clearSessionCookie` are used by the auth routes. `readSessionToken` parses the `Cookie` header with a small helper, so no cookie-parsing dependency is needed.
- `POST /auth/logout` clears the cookie and returns 204. It does not revoke the JWT server-side, so a copied token stays valid until it expires.
- `GET /auth/me` sits behind `authenticate` and returns `{ user }`.

## 9. Repositories

All functions take plain values, return plain objects, and use the shared Prisma client. Playbook functions always take `userId`.

### 9.1 `user.repository.ts`
- `findByEmail(email: string): Promise<User | null>`
- `findById(id: string): Promise<User | null>`
- `create(data: { email: string; passwordHash: string }): Promise<User>`

### 9.2 `trigger.repository.ts`
- `findTriggerById(id: string): Promise<Trigger | null>`
- `listUserTriggers(userId: string): Promise<Trigger[]>` — `trigger.findMany({ where: { grants: { some: { userId } } }, orderBy: { name: 'asc' } })`
- `listAvailableTriggers(userId: string): Promise<Trigger[]>` — `where: { grants: { none: { userId } } }`
- `findGrant(userId: string, triggerId: string): Promise<UserTrigger | null>`
- `createGrant(userId: string, triggerId: string): Promise<UserTrigger>` — throws `P2002` if the row exists

### 9.3 `action.repository.ts`
- `listActions(): Promise<Action[]>` — `orderBy: { sortOrder: 'asc' }`
- `findActionsByIds(ids: string[]): Promise<Action[]>`

### 9.4 `playbook.repository.ts`
- `listByUser(userId: string)` — `include: { trigger: true, actions: { orderBy: { position: 'asc' }, include: { action: true } } }`, `orderBy: { createdAt: 'desc' }`
- `listByUserAndTrigger(userId: string, triggerId: string)` — same include, `where: { userId, triggerId }`
- `create(data: { userId, name, triggerId, actions: { actionId, position }[] })` — nested create of `PlaybookAction` rows in one Prisma call (atomic). Throws `P2002` on duplicate `(userId, name)`.
- `deleteByIdForUser(id: string, userId: string): Promise<number>` — `deleteMany({ where: { id, userId } })`, returns `count`. Using `deleteMany` keeps the owner check in the same statement.

## 10. Services

### 10.1 `trigger.service.ts`
- `listAdded(userId)` → `listUserTriggers`.
- `listAvailable(userId)` → `listAvailableTriggers`.
- `add(userId, triggerId)`:
  1. `findTriggerById` → none → `NotFoundError('Trigger not found')`.
  2. `createGrant`; on `P2002` → `ConflictError(TRIGGER_ALREADY_ADDED, 'Trigger already added')`.
  3. Return the trigger.
- `assertAdded(userId, triggerId)`: `findGrant` → none → `ForbiddenError(TRIGGER_NOT_ADDED, 'Trigger has not been added')`.

### 10.2 `action.service.ts`
- `list()` → `listActions()`.

### 10.3 `playbook.service.ts`
- `list(userId)` → `listByUser`, mapped to the API shape (see 11.2).
- `create(userId, { name, triggerId, actionIds })`:
  1. `triggerService.assertAdded(userId, triggerId)`.
  2. `actions = findActionsByIds(actionIds)`. If `actions.length !== actionIds.length` → `ValidationError` with detail `{ path: 'actionIds', message: 'Unknown action' }`.
  3. `position = actionIds.indexOf(actionId)` for each id, so stored order matches the request.
  4. `playbookRepository.create(...)`. On `P2002` → `ConflictError(PLAYBOOK_NAME_TAKEN, 'Playbook name already exists')`.
  5. Return the playbook read with the same `include` as `listByUser`, so the response has the list's shape.
- `remove(userId, id)`: `deleteByIdForUser` → `0` → `NotFoundError('Playbook not found')`.

### 10.4 `simulation.service.ts`
- `run(userId, triggerId)`:
  1. `triggerService.assertAdded(userId, triggerId)`.
  2. `trigger = findTriggerById(triggerId)`.
  3. `playbooks = listByUserAndTrigger(userId, triggerId)`.
  4. Return `{ trigger: { id, name }, matches: playbooks.map(p => ({ playbook: { id, name }, actions: p.actions.map(a => ({ id, name })) })) }`.
- Pure matching rule: same trigger id and same owner. No other filter.

## 11. Routes and API contract

Routes map HTTP to one service call. Each handler is `validate` → service → `res.status(...).json(...)`.

### 11.1 Endpoints

| Method | Path | Middleware | Service call | Success | Errors |
|---|---|---|---|---|---|
| POST | `/auth/register` | validate(registerBody) | `auth.register` | 201 `{ user }` + session cookie | 400, 409 `EMAIL_TAKEN` |
| POST | `/auth/login` | validate(loginBody) | `auth.login` | 200 `{ user }` + session cookie | 400, 401 `INVALID_CREDENTIALS` |
| POST | `/auth/logout` | none | clear cookie | 204 | none |
| GET | `/auth/me` | authenticate | `requireUser` | 200 `{ user }` | 401 `UNAUTHORIZED` |
| GET | `/triggers` | authenticate | `trigger.listAdded` | 200 `{ triggers }` | 401 |
| GET | `/triggers/available` | authenticate | `trigger.listAvailable` | 200 `{ triggers }` | 401 |
| POST | `/triggers/added` | authenticate, validate(triggerAddBody) | `trigger.add` | 201 `{ trigger }` | 400, 401, 404, 409 `TRIGGER_ALREADY_ADDED` |
| GET | `/actions` | authenticate | `action.list` | 200 `{ actions }` | 401 |
| GET | `/playbooks` | authenticate | `playbook.list` | 200 `{ playbooks }` | 401 |
| POST | `/playbooks` | authenticate, validate(playbookBody) | `playbook.create` | 201 `{ playbook }` | 400, 401, 403 `TRIGGER_NOT_ADDED`, 409 `PLAYBOOK_NAME_TAKEN` |
| DELETE | `/playbooks/:id` | authenticate, validate(idParam) | `playbook.remove` | 204 | 401, 404 |
| POST | `/simulateTrigger` | authenticate, validate(simulateBody) | `simulation.run` | 200 `{ trigger, matches }` | 400, 401, 403 `TRIGGER_NOT_ADDED` |

### 11.2 Response shapes

```ts
type TriggerDto = { id: string; name: string };
type ActionDto  = { id: string; name: string };
type PlaybookDto = {
  id: string; name: string;
  trigger: TriggerDto;
  actions: ActionDto[];      // in position order
  createdAt: string;         // ISO 8601
};
type SimulationDto = {
  trigger: TriggerDto;
  matches: { playbook: { id: string; name: string }; actions: ActionDto[] }[];
};
```

Mapping functions live in the route files, close to the HTTP shape, so repositories return Prisma types and services return DTOs.

### 11.3 Request examples

```
POST /auth/register   { "email": "a@b.com", "password": "abc12345" }
POST /triggers/added  { "triggerId": "<uuid>" }
POST /playbooks       { "name": "Critical Malware Response", "triggerId": "<uuid>", "actionIds": ["<uuid>", "<uuid>"] }
POST /simulateTrigger { "triggerId": "<uuid>" }
```

## 12. Sequences

### 12.1 Authenticated request
```
Client → authenticate: session cookie
authenticate → tokenService.verify → sub
authenticate → userRepository.findById(sub) → user | null
  null → 401
authenticate → req.user; next()
route handler → service
```

### 12.2 Create playbook
```
route: validate(playbookBody)
service.create:
  triggerService.assertAdded → findGrant → null → 403
  actionRepository.findActionsByIds → count mismatch → 400
  playbookRepository.create (nested PlaybookAction) → P2002 → 409
  return PlaybookDto → 201
```

### 12.3 Simulate
```
route: validate(simulateBody)
service.run:
  assertAdded → 403 if not
  findTriggerById
  listByUserAndTrigger(userId, triggerId)
  map to SimulationDto → 200
```

## 13. Database access notes

- Prisma client is created once in `db.ts`.
- Writes that create several rows (playbook + actions) use one nested `create`, so they succeed or fail together.
- Unique constraints (`User.email`, `Playbook(userId, name)`, `UserTrigger(userId, triggerId)`) are the final guard against races. Pre-checks only give a clean message.
- No raw SQL in application code. The seed is a migration file.

## 14. Security checklist (backend)

- Every route except `/auth/*` mounts `authenticate`.
- Every playbook query and delete includes `userId`.
- Trigger use checks the `UserTrigger` row before reading or writing playbooks.
- Login timing does not reveal whether an email exists (dummy hash comparison).
- Errors never include Prisma messages or stack traces in responses.
- JWT verify restricts algorithms to HS256.
- Body size capped at 10 KB.

## 15. Testing

| Level | Files | Cases |
|---|---|---|
| Unit | `schemas.test.ts` | email normalisation; password rules (length, letter, digit, 72 bytes); playbook name trim and length; actionIds 1–3 and distinct |
| Unit | `config.test.ts` | missing `JWT_SECRET` throws; short secret throws; `PORT` default |
| Integration | `auth.test.ts` | register 201; duplicate email 409; weak password 400; login 200; wrong password and unknown email both 401 with same message; malformed JSON 400 |
| Integration | `access.test.ts` | no cookie 401; empty or foreign cookie 401; Bearer header not accepted; expired token 401; wrong signature 401; deleted user with valid cookie 401 |
| Integration | `auth.test.ts` | register and login set an HttpOnly, SameSite=Strict cookie and no token in the body; `/auth/me`; logout clears the cookie |
| Integration | `triggers.test.ts` | list empty for new user; available shows all; add 201; add again 409; unknown id 404; revoked grant row → next request 403 on playbook create |
| Integration | `actions.test.ts` | list returns three actions in `sortOrder` |
| Integration | `playbooks.test.ts` | create 201; duplicate name 409; 0 actions 400; 4 actions 400; duplicate action ids 400; trigger not added 403; unknown action 400; list only own; delete 204; delete other user's 404 |
| Integration | `simulation.test.ts` | matches only own playbooks with that trigger; actions in stored order; no match returns `[]`; trigger not added 403 |
| Integration | `injection.test.ts` | `' OR 1=1--` in email and password returns 400 or 401, no session; `<script>` in playbook name stored as plain text |

Test DB: `TEST_DATABASE_URL` points at `playbooks_test`. `globalSetup` runs `prisma migrate deploy`. `beforeEach` truncates `PlaybookAction`, `Playbook`, `UserTrigger`, `User` in that order; seed tables (`Trigger`, `Action`) are kept.

Session cookies in tests come from `cookieFor` (which calls `tokenService.sign`) for valid cases, and from manual signing with a wrong secret or past `exp` for invalid cases. `registerUser` returns the cookie that the register response set.

## 16. Build and run

- `npm run build` → `tsc` to `dist/`.
- `npm run dev` → `tsx watch src/index.ts`.
- `npm test` → Vitest.
- Container: `server/Dockerfile` runs `npm ci`, `prisma generate`, `build`; start command `npx prisma migrate deploy && node dist/index.js`.

## 17. Open points

- Response for `POST /triggers/added` is `201 { trigger }`; the UI reads that to select the new trigger.
- Playbook creation returns the same DTO as list, so the UI can append without a refetch.

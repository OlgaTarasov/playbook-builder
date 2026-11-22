# Playbook Builder

A small full-stack app for creating security automation playbooks and simulating events against them.

- Register and log in with email and password.
- Add triggers from the predefined list (Malware Detected, Login Attempt, Phishing Alert).
- Create playbooks with one trigger and 1–3 actions (Isolate Host, Notify Admin, Block IP), list them, and delete them.
- Simulate an event for a trigger to see which of your playbooks match and which actions would run. Nothing is executed.

Stack: Node.js + TypeScript (Express, Prisma), MySQL 8.4, React + TypeScript (Vite), nginx, Docker Compose.

## Run with Docker (one command)

Prerequisites: Docker with Compose.

1. Create a `.env` file in this folder with:

   ```
   MYSQL_ROOT_PASSWORD=change-me-root
   MYSQL_USER=playbooks
   MYSQL_PASSWORD=change-me-app
   # At least 32 random characters, e.g. the output of: openssl rand -base64 48
   JWT_SECRET=replace-with-at-least-32-random-characters
   ```

2. Start everything:

   ```
   docker compose up --build
   ```

3. Open <http://localhost:8080>.

On first start, the API container runs `prisma migrate deploy`, which creates the tables and loads the predefined triggers and actions. The MySQL container also creates a `playbooks_test` database for the backend integration tests.

Stop with `Ctrl+C`, or `docker compose down`. To wipe the data, run `docker compose down -v`.

## Run for development (without the web container)

1. Start the database only:

   ```
   docker compose up -d db
   ```

2. Backend (port 4000). Create `server/.env`:

   ```
   DATABASE_URL=mysql://playbooks:change-me-app@localhost:3306/playbooks
   JWT_SECRET=replace-with-at-least-32-random-characters
   PORT=4000
   TEST_DATABASE_URL=mysql://playbooks:change-me-app@localhost:3306/playbooks_test
   ```

   Then:

   ```
   cd server
   npm install
   npx prisma migrate deploy
   npm run dev
   ```

3. Frontend (port 5173). In another terminal:

   ```
   cd client
   npm install
   npm run dev
   ```

4. Open <http://localhost:5173>. Vite proxies `/api` to the backend on port 4000.

## Tests

Backend (unit and integration; integration tests need the MySQL container running):

```
cd server
npm test
```

Or inside the container:

```
docker compose run --rm api npm test
```

Frontend:

```
cd client
npm test
```

## API overview

All requests and responses are JSON. Errors have one shape: `{ "error": { "code", "message", "details"? } }`.

Every route except `/auth/*` needs the session cookie. Register and login set it (`HttpOnly`); the browser sends it automatically on same-origin requests.

Interactive docs (Swagger UI) are at `/docs`, and the raw OpenAPI 3.0 document is at `/openapi.json`. Both are public and need no session. Keep `server/src/docs/openapi.ts` in step with the routes when they change.

| Method | Path | Purpose |
|---|---|---|
| POST | `/auth/register` | Create an account. Sets the session cookie and returns `{ user }`. |
| POST | `/auth/login` | Log in. Sets the session cookie and returns `{ user }`. |
| POST | `/auth/logout` | Clear the session cookie. Returns 204. |
| GET | `/auth/me` | The signed-in user for the current cookie. |
| GET | `/triggers` | Your added triggers. |
| GET | `/triggers/available` | Predefined triggers you have not added yet. |
| POST | `/triggers/added` | Add a trigger to your list. Body: `{ triggerId }`. |
| GET | `/actions` | Predefined actions. |
| GET | `/playbooks` | Your playbooks. |
| POST | `/playbooks` | Create a playbook. Body: `{ name, triggerId, actionIds }`. |
| DELETE | `/playbooks/:id` | Delete one of your playbooks. |
| POST | `/simulateTrigger` | Body: `{ triggerId }`. Returns your matching playbooks and their actions. |

Error codes: `VALIDATION_ERROR`, `UNAUTHORIZED`, `INVALID_CREDENTIALS`, `TRIGGER_NOT_ADDED`, `NOT_FOUND`, `EMAIL_TAKEN`, `PLAYBOOK_NAME_TAKEN`, `TRIGGER_ALREADY_ADDED`, `INTERNAL`.

## Design

This README is the only design document. The data model is in `server/prisma/schema.prisma`, the API contract is in the table above, and the access rules are listed under Notes below.

## Notes and known trade-offs

- Triggers and actions are predefined data. They are loaded by the seed migration in `server/prisma/migrations/`, and the API cannot create or delete them.
- Playbook names are unique per user, not globally. The check ignores letter case (MySQL's default collation), so "Phishing" and "phishing" count as the same name.
- The MySQL port is published on `127.0.0.1` only, so the database is not reachable from other machines.
- Access rules: a user only sees and deletes their own playbooks, and can only use triggers they have added. Each request reloads the user from the database.
- The session is a JWT in an HttpOnly cookie (`SameSite=Strict`, 24 hours). Scripts on the page cannot read it, so XSS cannot copy it directly. Logout clears the cookie but cannot revoke a JWT that was already copied; it stays valid until it expires. This is a known trade-off for this exercise.
- The cookie has no `Secure` flag by default, because the Compose setup serves plain HTTP on localhost. Set `COOKIE_SECURE=true` when the app is served over HTTPS.
- Passwords: at least 8 characters, with a letter and a digit, at most 72 bytes.
- No rate limiting, account lockout, HTTPS in the Compose setup, or secrets manager. These are out of scope.
- Dependency audit (`npm audit`, accepted risk):
  - Backend: 5 high-severity advisories in production dependencies (Prisma 6.x and its config package, `effect`, `deepmerge-ts`, `zod`). The only fix `npm audit` offers is a major upgrade to Prisma 7, which is not done in this exercise. Review and upgrade before any real use.
  - Client: 2 critical and 3 moderate advisories (`npm audit` in `client/`, 2026-11-22).
    - `vitest` and `tinypool` (critical): test tooling only. Not bundled into the nginx-served build. The fix is a major upgrade to Vitest 4.
    - `@vitest/mocker` (moderate): test tooling only; same fix.
    - `react-router-dom` (moderate, runtime dependency): an open-redirect advisory for `<Link>` and `useNavigate` with crafted paths. The app only navigates to fixed internal paths (`/login`, `/playbooks`, `/simulate`) and never builds a path from user input, so the advisory is not reachable here. The fix is a major upgrade to React Router 7.
  - Backend triage (`npm audit --omit=dev` in `server/`, 2026-11-22):
    - `prisma`, `@prisma/config`, `effect`, `deepmerge-ts`: the advisories are in the Prisma CLI's config and schema code. The API container runs the CLI only for `prisma migrate deploy` on the project's own config. The app code does not call the affected functions (recursive `deepmerge` and the `Schema.TemplateLiteral` regex). The fix is a major upgrade to Prisma 7.
    - `zod` (high, runtime): memory exhaustion when validating very large constrained collections. Reduced here because JSON bodies are capped at 10 kB (`express.json`), and the only array input (`actionIds`) is capped at 3 items. The fix is a major upgrade to Zod 4.
  - These upgrades are not done in this exercise. They should be done before any real use.

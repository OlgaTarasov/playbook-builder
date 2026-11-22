# Low-Level Design — UI (Web Client)

Date: 2026-11-22
Related: `docs/HLD.md`, `docs/superpowers/specs/2026-11-17-playbook-builder-design.md`, wireframes `LoginRegisterPage.png`, `CreatePlaybookPage.png`, `SimulateEventPage.png`

## 1. Scope

The `client/` package: a Vite + React + TypeScript single-page app, served by nginx in Docker. It has three pages, a navigation bar, and a small API layer. The backend contract is in `docs/LLD-backend.md`, section 11.

## 2. Module layout

```
client/
├── index.html
├── vite.config.ts              dev server on 5173, proxy /api → http://localhost:4000 (prefix stripped)
├── Dockerfile                  multi-stage: node build → nginx
├── nginx.conf                  serves dist/, proxies /api/ → api:4000
├── src/
│   ├── main.tsx                React root, BrowserRouter, AuthProvider
│   ├── App.tsx                 route table, layout with NavBar
│   ├── styles.css              the only stylesheet
│   ├── api/
│   │   ├── apiClient.ts        fetch wrapper (same-origin cookies), ApiError, 401 hook
│   │   ├── types.ts            DTOs mirroring backend 11.2
│   │   ├── authApi.ts
│   │   ├── triggersApi.ts
│   │   ├── actionsApi.ts
│   │   ├── playbooksApi.ts
│   │   └── simulationApi.ts
│   ├── auth/
│   │   ├── AuthContext.tsx     AuthProvider, useAuth (session restored from /auth/me)
│   │   └── RequireAuth.tsx     route guard
│   ├── pages/
│   │   ├── LoginPage.tsx
│   │   ├── CreatePlaybookPage.tsx
│   │   └── SimulateEventPage.tsx
│   ├── components/
│   │   ├── NavBar.tsx
│   │   ├── TriggerPicker.tsx   select + Add Trigger
│   │   ├── ErrorBanner.tsx
│   │   └── FormField.tsx       label, input, field error
│   └── validation/
│       ├── rules.ts            email, password policy, playbook name (mirror backend)
│       └── messages.ts         message strings
└── test/
    ├── setup.ts                jest-dom matchers, cleanup
    ├── helpers/renderWithProviders.tsx
    ├── LoginPage.test.tsx
    ├── CreatePlaybookPage.test.tsx
    ├── SimulateEventPage.test.tsx
    └── rules.test.ts
```

Dependency direction: `pages → components, auth, api, validation`. `components` do not call `api` directly. `api` knows nothing about React.

## 3. Routes

| Path | Component | Guard | Notes |
|---|---|---|---|
| `/login` | `LoginPage` | public; if logged in, redirect to `/playbooks` | Login / Register |
| `/playbooks` | `CreatePlaybookPage` | `RequireAuth` | Create form and list |
| `/simulate` | `SimulateEventPage` | `RequireAuth` | Simulation |
| `/` | — | redirect to `/playbooks` | |
| `*` | — | redirect to `/playbooks` | |

`RequireAuth` shows a loading state while the session is being checked, then redirects signed-out users to `/login`. After login, the login page always goes to `/playbooks`.

## 4. State and auth

### 4.1 Session (HttpOnly cookie)
- The API sets an HttpOnly cookie `playbook_session` on register and login. The browser sends it on same-origin `/api` requests.
- JavaScript never reads or stores the token. Nothing auth-related is kept in `localStorage` or `sessionStorage`.
- On load, AuthProvider calls `GET /auth/me`. A valid cookie restores the user. Any failure means signed out.

### 4.2 AuthContext (`AuthContext.tsx`)

```ts
type AuthStatus = 'loading' | 'authenticated' | 'anonymous';
type AuthState = {
  status: AuthStatus;
  user: { id: string; email: string } | null;
  login(email: string, password: string): Promise<void>;
  register(email: string, password: string): Promise<void>;
  logout(): Promise<void>;
};
```

- Initial status is `loading` while `authApi.me()` runs. Resolves → `authenticated` with the user. Rejects → `anonymous`.
- `login` / `register`: call `authApi`, set the user and `authenticated`. Errors propagate to the page (page shows them).
- `logout`: call `POST /auth/logout` (a failure is ignored), clear the user, navigate to `/login`.
- On mount, AuthProvider registers an unauthorised handler with `apiClient`. A 401 from any non-auth endpoint sets `anonymous` and redirects to `/login` with a "Session expired" message in router state.
- Test seam: an optional `initialUser` prop starts the provider in a given state and skips the `/auth/me` check. `renderWithProviders` uses it.

### 4.3 Page-local state
Each page owns its form and list state with `useState`. No global store is needed; the data is small and page-scoped.

## 5. API layer

### 5.1 `apiClient.ts`

```ts
export class ApiError extends Error {
  constructor(readonly status: number, readonly code: string, message: string,
              readonly details: { path: string; message: string }[] = []) { super(message); }
}

export function setUnauthorizedHandler(fn: () => void): void;

async function request<T>(method: string, path: string, body?: unknown): Promise<T>;
```

Behaviour:
- Base path `/api`. Each path is joined to it, for example `/api/playbooks`.
- Sets `Content-Type: application/json` when a body is sent. Uses `credentials: 'same-origin'`. There is no `Authorization` header; the browser sends the session cookie.
- `204` → returns `undefined`.
- Non-2xx → parse `{ error }`. If the body is not JSON, use `{ code: 'INTERNAL', message: 'Unexpected error' }`. For `401` on any path that does not start with `/auth/`, call the unauthorised handler before throwing. A 401 from `/auth/*` never calls it, so a wrong password or a failed `/auth/me` does not trigger the expired-session flow.
- `fetch` rejects (network) → `ApiError(0, 'NETWORK', 'Cannot reach the server')`.

### 5.2 Resource modules

```ts
// authApi.ts
register(email: string, password: string): Promise<UserDto>   // POST /auth/register; server sets the cookie
login(email: string, password: string): Promise<UserDto>      // POST /auth/login; server sets the cookie
logout(): Promise<void>                                       // POST /auth/logout; server clears the cookie
me(): Promise<UserDto>                                        // GET /auth/me; rejects with 401 when signed out

// triggersApi.ts
listAdded(): Promise<TriggerDto[]>                       // GET /triggers
listAvailable(): Promise<TriggerDto[]>                   // GET /triggers/available
add(triggerId: string): Promise<TriggerDto>              // POST /triggers/added

// actionsApi.ts
list(): Promise<ActionDto[]>                             // GET /actions

// playbooksApi.ts
list(): Promise<PlaybookDto[]>                           // GET /playbooks
create(input: { name: string; triggerId: string; actionIds: string[] }): Promise<PlaybookDto>
remove(id: string): Promise<void>

// simulationApi.ts
run(triggerId: string): Promise<SimulationDto>
```

`types.ts` declares the DTOs from LLD-backend 11.2. Auth responses carry only `UserDto`; there is no token type on the client.

## 6. Validation (`validation/rules.ts`)

Client checks run before any request, so empty or malformed input sends nothing. The server remains the authority; server `details` are shown when a field check passes locally.

| Rule | Function | Message |
|---|---|---|
| Email required | `validateEmail(v)` | "Email is required" |
| Email format | `validateEmail(v)` | "Enter a valid email address" |
| Password required | `validatePasswordLogin(v)` | "Password is required" |
| Password policy (register) | `validatePasswordPolicy(v)` | length, letter, digit, bytes (messages in `messages.ts`) |
| Playbook name | `validatePlaybookName(v)` | "Name is required" / "Name must be 100 characters or fewer" |
| Trigger chosen | `validateTrigger(id)` | "Choose a trigger" |
| Actions chosen | `validateActions(ids)` | "Choose at least one action" / "Choose up to 3 actions" |

Email regex: a simple `^[^\s@]+@[^\s@]+\.[^\s@]+$`. The server's Zod email check is stricter; server messages still appear if it rejects.

Password policy text under the field (register mode): "At least 8 characters, with a letter and a digit."

## 7. Components

| Component | Props | Renders | Notes |
|---|---|---|---|
| `NavBar` | — (reads `useAuth`) | top bar (app name, user email) and left sidebar with **Create Playbook** (`/playbooks`), **Simulate Event** (`/simulate`), and **Logout** pinned at the bottom | Active item marked with `aria-current`; see 10.2 |
| `TriggerPicker` | `triggers: TriggerDto[]`, `value: string`, `onChange(id)`, `onAdded(trigger)`, `disabled?`, `error?` | `<label>Trigger</label>` + `<select>` with the user's triggers; button **Add Trigger** always shown next to it | See 7.1 |
| `ErrorBanner` | `message: string \| null` | `role="alert"` box when set | |
| `FormField` | `label`, `id`, `error?`, `hint?`, plus input props | label, input, hint text, field error with `aria-describedby` | Used for Email, Password, Name |

### 7.1 TriggerPicker behaviour
- `<select id="trigger">` lists the user's triggers. Placeholder option "Select a trigger" (disabled, selected when `value` is empty).
- If `triggers` is empty: the select shows "No triggers added" and is disabled, and a hint under it reads "You have no triggers yet. Click Add Trigger to add one." The Add Trigger button stays visible.
- Simulate Event has no Add Trigger button. When the user has no triggers, its hint reads "You have no triggers yet. Add one on the Create Playbook page." and the select and Run Simulation are disabled.
- **Add Trigger** toggles an inline panel:
  1. On open, `triggersApi.listAvailable()` loads the catalogue triggers not yet added.
  2. Panel shows a second `<select aria-label="Available triggers">` and an **Add** button.
  3. If no triggers are available, the panel says "All triggers are already added".
  4. **Add** → `triggersApi.add(id)` → calls `onAdded(trigger)`; the parent reloads triggers and selects the new one; the panel closes.
  5. Add errors go to `ErrorBanner` in the parent via a thrown error; the picker shows its own inline error.

## 8. Pages

### 8.1 LoginPage

State: `mode: 'login' | 'register'`, `email`, `password`, `fieldErrors: { email?, password? }`, `banner: string | null`, `submitting: boolean`.

Layout (wireframe): centred card, title "Login / Register", `FormField` Email, `FormField` Password (type `password`), below them the mode toggle: two buttons styled as links, **Login** and **Register**. The active one has `aria-pressed="true"`. The submit button label follows the mode.

Behaviour:
1. Submit → clear banner → run field validation. Any error → set `fieldErrors`, return (no request).
2. `submitting = true`; button disabled.
3. `auth.login` or `auth.register`.
4. Success → navigate to `from` (router state) or `/playbooks`.
5. `ApiError`:
   - `VALIDATION_ERROR` with `details` → map `path` to field errors.
   - `INVALID_CREDENTIALS` / `EMAIL_TAKEN` / other → banner with the server message. Login failures show the same generic text.
6. `finally` → `submitting = false`.
7. Switching mode clears `banner` and `fieldErrors`.

Password input is `type="password"` (masked). Password policy hint shown in register mode.

### 8.2 CreatePlaybookPage

Data loaded on mount, in parallel:
- `triggersApi.listAdded()` → `triggers`
- `actionsApi.list()` → `actions` (catalogue order)
- `playbooksApi.list()` → `playbooks`

State: `name`, `triggerId`, `selectedActionIds: Set<string>`, `fieldErrors`, `banner`, `submitting`, `loading`, `playbooks`, `triggers`, `actions`.

Layout (wireframe): two columns.
- Left (form): `FormField` **Name**; `TriggerPicker`; **Actions** group with one checkbox per catalogue action (in `sortOrder`), hint "(Choose up to 3)"; button **Create**.
- Right (list): heading "Playbooks"; one row per playbook: name, and a **Delete** button styled as a link with accessible name "Delete playbook <name>".
- Empty list: "No playbooks yet."

Behaviour:
1. Checkbox: when 3 are selected, unselected checkboxes are `disabled`. Unchecking re-enables them.
2. Create → validate name, trigger, actions. Errors shown per field; no request if invalid.
3. Payload: `actionIds` built in catalogue order: `actions.filter(a => selected.has(a.id)).map(a => a.id)`.
4. `submitting = true`; **Create** disabled.
5. `playbooksApi.create` → append the returned `PlaybookDto` to the list (no refetch). Reset `name`, `triggerId`, `selectedActionIds`, `fieldErrors`.
6. `ApiError`:
   - `VALIDATION_ERROR` details → field errors (`name`, `triggerId`, `actionIds`).
   - `TRIGGER_NOT_ADDED` → banner "This trigger is not in your list. Add it again.", and reload `triggers`.
   - `PLAYBOOK_NAME_TAKEN` (duplicate name) → field error on name: "A playbook with this name already exists".
   - Other → banner.
7. Delete: `window.confirm('Delete playbook "<name>"?')`; if yes → `playbooksApi.remove(id)` → remove from list. Error → banner.
8. `TriggerPicker.onAdded(trigger)` → reload `triggers`, set `triggerId = trigger.id`.
9. When `triggers` is empty, **Create** is disabled and the picker shows the empty state.

### 8.3 SimulateEventPage

Data loaded on mount: `triggersApi.listAdded()` → `triggers`.

State: `triggerId`, `results: SimulationDto | null`, `fieldErrors`, `banner`, `submitting`.

Layout (wireframe): top section with `TriggerPicker` and **Run Simulation** button; below it a section headed "Matching Playbooks".

Behaviour:
1. Results start `null`; the section shows nothing until the first run.
2. **Run Simulation** with no trigger → field error "Choose a trigger"; no request.
3. Run → `simulationApi.run(triggerId)`; `submitting = true`, button disabled.
4. On success, `results` replaces the previous value.
5. Results rendering:
   - `matches.length === 0` → "No matching playbooks."
   - Otherwise, for each match: `Playbook: <name>` (text) and a list of actions, each as `→ <action name>`.
   - All text is rendered as React text, never as HTML.
6. `ApiError` `TRIGGER_NOT_ADDED` → banner. Other → banner.
7. `TriggerPicker.onAdded` → reload triggers, select the new trigger, clear results.

### 8.4 NavBar
- Shown only when logged in (rendered in the `App` layout for protected routes), not on the login page.
- Top bar and sidebar as described in 10.2.
- **Logout** → `auth.logout()`.

## 9. Error handling summary

| Source | UI response |
|---|---|
| Client validation | Field error under the input; no request |
| `VALIDATION_ERROR` from server | Field errors by `details.path`; unmatched paths go to banner |
| `INVALID_CREDENTIALS` | Banner, generic text |
| `EMAIL_TAKEN` | Field error on email |
| `PLAYBOOK_NAME_TAKEN` | Field error on name |
| `TRIGGER_ALREADY_ADDED` | Inline error in `TriggerPicker`; reload the available list |
| `TRIGGER_NOT_ADDED` | Banner; reload triggers |
| `UNAUTHORIZED` (401) | Session cleared by `apiClient` handler → `/login` with "Session expired" |
| `NETWORK`, `INTERNAL` | Banner with the message |

Buttons are disabled while `submitting`, so double submission is blocked.

## 10. Styling

### 10.1 Visual direction

Reference: the two product screenshots supplied with the requirements (`Catalog_Views_Reports_Callouts.png`, `DashbaordOverview.png`). We take their layout patterns and tone, not their branding. No logos, product names, icons or artwork are copied.

Patterns taken from the references:
- **Dark top bar** with the app name on the left and the user area on the right (both references).
- **Left navigation column** with icon-and-label items; the selected item is highlighted with a light-blue background and a blue marker (Catalog reference).
- **Light grey content area** with a page title at the top left (Dashboard reference).
- **White cards with a thin border and a title bar** to group content (Dashboard reference).
- **Tables with a dark header row**, subtle row dividers, and a light-blue selected row (Catalog reference).
- **Dense, quiet typography**: one sans-serif family, 14px body text, bold labels; colour is used for state, not decoration.
- **Toolbar buttons** grouped with thin separators (Catalog reference), used for the page actions.

Not taken: multi-tab navigation, notification and AI widgets, charts, and the vendor logos.

### 10.2 Layout

- **Login / Register:** no chrome. A centred card on a light grey background, as in the wireframe. Title at the top of the card.
- **Signed-in pages:** a top bar (height 56px) with the app name "Playbook Builder" and the user's email plus **Logout**. Below it a left column (220px) with navigation and a content area.
- **Create Playbook:** content area split into two cards side by side: "New playbook" (form, left) and "Your playbooks" (list, right). This matches the wireframe's two columns.
- **Simulate Event:** one card "Run simulation" with the trigger picker and **Run Simulation** button; below it a card "Matching Playbooks" with the results.

Navigation column (replaces the wireframe-free nav bar in 7):
- Items: **Create Playbook** (`/playbooks`), **Simulate Event** (`/simulate`).
- Selected item: light-blue background, blue left marker, `aria-current="page"`.
- **Logout** pinned to the bottom of the column.
- On narrow screens (below 768px) the column collapses above the content, as a horizontal bar.

### 10.3 Components to style

| Element | Style |
|---|---|
| Top bar | Dark slate background, white text, 56px height |
| Side navigation | Light panel with a border on the right; items 40px high with icon and label |
| Page title | 20px, semi-bold, dark text, above the cards |
| Card | White, 1px border, 4px radius; header row with bold title and a bottom border |
| Form field | Label above input; input 36px high, 1px border, 4px radius; focus ring in primary blue |
| Field error | Red text under the input, with `aria-describedby` |
| Field hint | Grey text under the input (password policy, "Choose up to 3") |
| Primary button | Blue background, white text, 36px height, 4px radius; disabled at 50% opacity |
| Secondary button | White, border, dark text (**Add Trigger**, **Run Simulation** can be primary) |
| Link button | Blue text, no border (mode toggle, **Delete**) |
| Playbook list | Table-style rows: header row dark slate with white text; rows with a bottom divider; hover shows light grey; the **Delete** link is red on hover |
| Action checkboxes | Stacked, 8px gap, label to the right |
| Banner (error) | Light red background, red left border, text dark red, `role="alert"` |
| Results: match | Card inside the results card; title "Playbook: <name>" in bold |
| Results: action | Pill with light-blue background and dark-blue text, prefixed with "→" |
| Empty state | Centred grey text inside the card |

### 10.4 Tokens

All colours, sizes and radii are CSS variables in `:root`. No component library.

```css
:root {
  --color-topbar: #1f2a37;
  --color-topbar-text: #ffffff;
  --color-bg: #f2f4f7;
  --color-surface: #ffffff;
  --color-border: #d5dbe3;
  --color-text: #1d2733;
  --color-text-muted: #5f6b7a;
  --color-primary: #1e6fd9;
  --color-primary-text: #ffffff;
  --color-selected: #e6f0fd;
  --color-danger: #c62828;
  --color-danger-bg: #fdecec;
  --color-table-head: #2b3645;
  --radius: 4px;
  --space-1: 4px;  --space-2: 8px;  --space-3: 12px;  --space-4: 16px;  --space-6: 24px;
  --font: system-ui, -apple-system, "Segoe UI", Roboto, sans-serif;
  --font-size: 14px;
}
```

### 10.5 Class names

- Layout: `.app-shell`, `.topbar`, `.sidenav`, `.sidenav__item`, `.sidenav__item--active`, `.content`, `.page-title`.
- Auth: `.auth-page`, `.card`, `.card__title`, `.card__header`.
- Forms: `.form-field`, `.form-field__label`, `.form-field__error`, `.form-field__hint`, `.checkbox-group`.
- Buttons: `.btn`, `.btn--primary`, `.btn--secondary`, `.btn--link`, `.btn:disabled`.
- Tables and lists: `.table`, `.table__head`, `.table__row`, `.table__row--selected`, `.table__action`.
- Feedback: `.banner--error`, `.empty-state`.
- Results: `.results`, `.results__match`, `.results__title`, `.results__action`.

### 10.6 Responsive behaviour

- Desktop (768px and wider): two-column layout on Create Playbook; sidebar on the left.
- Narrow (below 768px): sidebar becomes a horizontal bar under the top bar; the two cards stack vertically.
- Tables and cards use full width; no horizontal scrolling is required for the three playbook fields.

## 11. Accessibility

- Every input has a `<label>` (visible text, `htmlFor`).
- Errors linked with `aria-describedby` and `aria-invalid`.
- Banner has `role="alert"`.
- Mode toggle uses `aria-pressed`. Active nav link uses `aria-current="page"`.
- Delete buttons have unique accessible names.
- Keyboard: all controls are native elements, so tab order works without extra handling.

## 12. Testing

Tools: Vitest, React Testing Library, jest-dom, user-event. `api/` modules are mocked with `vi.mock('../src/api/…')`.

| File | Cases |
|---|---|
| `rules.test.ts` | email required and format; password policy (length, letter, digit, 72 bytes); name trim, empty, 100 max; action count 0 / 1–3 / 4 |
| `LoginPage.test.tsx` | empty fields do not call `authApi` (AUTH-04); invalid email shows field error (AUTH-05); wrong credentials show generic banner (AUTH-02, AUTH-03); password input has `type="password"` (AUTH-09); register mode shows policy hint; submit disabled while submitting |
| `CreatePlaybookPage.test.tsx` | empty name and no trigger validation (PB-02, PB-03); no actions validation (PB-04); three actions selectable (PB-05); fourth checkbox disabled (PB-06); form reset after create (PB-10); double-submit guard (PB-15); list and empty state (PB-11, PB-19); playbook name rendered as text (PB-18); Add Trigger adds and selects a trigger; Create disabled when no triggers |
| `SimulateEventPage.test.tsx` | no trigger → validation, no request (SIM-04); matches rendered with actions in order (SIM-01); no-match message (SIM-03); results replaced on second run (SIM-06); empty before first run (SIM-10) |

Test helper `renderWithProviders` wraps in `MemoryRouter` and `AuthProvider`, starting signed in as a test user by default (or signed out with `user: null`). It passes `initialUser` to skip the `/auth/me` call. `AuthContext.test.tsx` covers the `/auth/me` restore, a failed restore, and logout.

## 13. Build and run

- `npm run dev` → Vite on 5173, proxy `/api` → `http://localhost:4000` with the `/api` prefix removed (Vite `rewrite`), the same as the nginx proxy in Docker.
- `npm run build` → `tsc -b && vite build` to `dist/`.
- `npm test` → Vitest.
- Container: `client/Dockerfile` builds with Node, copies `dist/` into `nginx:alpine`, uses `nginx.conf`:
  - `location / { try_files $uri /index.html; }`
  - `location /api/ { proxy_pass http://api:4000/; }`

## 14. Open points

- "Session expired" message is passed through router state. If the user refreshes, the message is lost; acceptable for this scope.
- Page layout follows the wireframes; visual polish is not a goal.

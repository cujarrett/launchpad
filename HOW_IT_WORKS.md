# How It Works — launchpad

A standalone Angular SPA. No SSR, no NgRx, no `NgZone`. State lives in signals. Auth is MSAL with PKCE. The only backend it talks to is `launchpad-api`, a Go BFF that sits in the cluster.

From the user's perspective: log in, pick a workspace, describe what you want running, watch the status badge go green. The SPA is responsible for auth, form generation, and displaying live cluster status. It commits nothing to GitHub directly and never touches the Kubernetes API.

See [launchpad-api/HOW_IT_WORKS.md](../launchpad-api/HOW_IT_WORKS.md) for what happens on the server after a form is submitted.

---

## Request Flow

```
User action
  ↓
component signal update  →  template rerenders (zoneless)
  ↓
WorkspaceService / CreateService  →  authInterceptor (acquireTokenSilent)
  ↓
POST /api/workspaces/{ws}/resources  →  launchpad-api
  ↓
EventSource /api/status/watch?token={jwt}  ←  SSE status events
  ↓
SseService  →  workspace-detail statusMap signal  →  resource-card badge
```

---

## Bootstrap

### `src/app/app.config.ts`

Where everything starts. `PublicClientApplication` is configured with the Azure Entra tenant ID, the SPA client ID (`msalClientId`), and `redirectUri: window.location.origin`. The guard for local dev missing config lives here too — if any MSAL value is falsy at startup, the app throws immediately rather than silently failing on the first auth attempt.

An `APP_INITIALIZER` runs `handleRedirectPromise()` on boot. This is the return trip handler: after the OAuth redirect to Entra and back, the SPA lands with an auth code in the URL. `handleRedirectPromise()` exchanges it for tokens and sets the active account before any component renders. Without it, the first render is always unauthenticated.

`authInterceptor` is wired into `provideHttpClient(withInterceptors([authInterceptor]))`. Every outbound HTTP request goes through it.

**Key symbols**: `PublicClientApplication`, `APP_INITIALIZER`, `authInterceptor`, `provideHttpClient`

### `src/app/app.ts` and `app.html`

Root component. Renders the header with the user's name (when authenticated), a rotating tagline, and the sign in/out button. The tagline cycles through phrases on a timer with a CSS `opacity` transition — see `app.css` for `.app-nav-tagline { transition: opacity 0.4s }`. `<router-outlet>` fills the body. Footer is static.

Injects `RoleService` to read `isAuthenticated` and `userName` signals reactively.

### `src/app/app.routes.ts`

Three lazy-loaded routes. `/` → `WorkspacesComponent`. `/workspaces/:name` → `WorkspaceDetailComponent`. `/signed-out` → `SignedOutComponent`. Both main routes are lazy: `loadComponent: () => import(...)`. The router loads the chunk only when navigated to.

---

## Core: Services

### `src/app/core/services/role.service.ts`

The auth state source of truth. Listens to MSAL's `MsalBroadcastService` for `LOGIN_SUCCESS`, `LOGOUT_SUCCESS`, and `ACCOUNT_ADDED` events. On each event, re-reads all accounts from `MsalService` and refreshes four signals: `account`, `isAuthenticated`, `isContributor`, `userName`.

`isContributor` inspects `idTokenClaims.roles` on the active account. If `'Contributor'` is present, write buttons appear. If not, the user sees the app read-only. No roles in the token means no mutation — the API will also reject the request with 403, but the UI doesn't even offer the action.

**Key symbols**: `account`, `isAuthenticated`, `isContributor`, `userName` (all signals)

### `src/app/core/services/workspace.service.ts`

All read HTTP calls in one place: `getWorkspaces()`, `getResources(workspace)`, `getResourceValues(workspace, kind, name)`, `deleteWorkspace`, `deleteResource`, and the guest variants (`getGuestWorkspaces`, `createGuestWorkspace`, `createGuestResource`). All calls target `environment.apiUrl` — `/api` in production, proxied to `localhost:8080` in dev via `proxy.conf.json`.

Returns raw `Observable`s. Components decide whether to `.subscribe()` directly or convert with `toSignal()`.

**Key symbols**: `getWorkspaces()`, `getResources(workspace)`, `getResourceValues(workspace, kind, name)`, `deleteResource(workspace, kind, name)`

### `src/app/core/services/create.service.ts`

Exists only for `createResource(workspace, payload)`. Separated from `workspace.service.ts` so the write path has a single, auditable location. Posts to `POST /api/workspaces/{workspace}/resources`.

### `src/app/core/services/sse.service.ts`

`EventSource` can't set custom headers — browsers don't allow it. So when `watchStatus(workspace)` opens the stream, it acquires a token silently via MSAL first, then appends `?token={jwt}` to the URL. The Go middleware accepts tokens in query params for this endpoint only.

Reconnects automatically on `EventSource` `onerror` after a short delay. Parses `event.data` as `ResourceStatus` JSON. Returns an `Observable<ResourceStatus>` — callers subscribe and update their local state.

**Key symbols**: `watchStatus(workspace): Observable<ResourceStatus>`, token-in-query-param pattern

### `src/app/core/services/schema.service.ts`

`getFields(kind)` fetches `GET /api/schema/{kind}`, runs `parseSchema()` on the raw OpenAPI response, and caches the `FieldDef[]`. Subsequent calls return the cached result without a network request. Cache is in-memory per page load — evicted on refresh, which is fine since XRDs rarely change.

**Key symbols**: `getFields(kind): Observable<FieldDef[]>`, in-memory `Map<string, FieldDef[]>` cache

### `src/app/core/interceptors/auth.interceptor.ts`

Intercepts every outbound request. Calls `acquireTokenSilent()` — hits the MSAL token cache, resolves in microseconds when tokens are fresh. Attaches `Authorization: Bearer {token}`.

On `InteractionRequiredAuthError` (session expired, consent needed), falls back to `acquireTokenRedirect()` — the user gets redirected through the full OAuth flow and lands back where they were. Same redirect triggered by 401 responses from the API.

**Key symbols**: `authInterceptor`, `acquireTokenSilent`, `acquireTokenRedirect`, `InteractionRequiredAuthError`

---

## Core: Models

### `src/app/core/models/workspace.model.ts`

All the cross-cutting types.

`ResourceKind` is a union of the eight platform kinds: `'XSpa' | 'XApi' | 'XSql' | 'XNoSql' | 'XObjectStorage' | 'XTopic' | 'XSubscription' | 'XWordpress'`.

`RESOURCE_KIND_LABELS`, `RESOURCE_KIND_COLORS`, `RESOURCE_KIND_ICONS` are lookup tables. Colors are Material Design 500 palette shades — consistent across cards, chips, and the architecture diagram. Icons are emoji, which renders everywhere without asset loading.

`ResourceStatus` mirrors the Go struct broadcast over SSE: `{ workspace, kind, name, synced, ready, message? }`.

**Key symbols**: `Workspace`, `Resource`, `ResourceKind`, `ResourceStatus`, `RESOURCE_KIND_LABELS`, `RESOURCE_KIND_COLORS`, `RESOURCE_KIND_ICONS`

### `src/app/core/models/field.model.ts`

`FieldDef` is the form descriptor that drives `DynamicFormComponent`. One `FieldDef` per XRD parameter field.

`FieldKind` controls how the form renders each field: `text`, `number`, `boolean`, `select`, `array`, `display` (read-only), `resource-ref` (dropdown of existing resources), `sub-object` (toggled nested group).

`parseSchema(paramsSchema)` converts the raw OpenAPI object returned by `GET /api/schema/{kind}` into a flat `FieldDef[]`. It filters `HIDDEN_KEYS` (`namespace`, `scrapeInterval`) — platform-managed fields the user never needs to see. `ADVANCED_KEYS` (`contentSecurityPolicy`, `metricsPort`) are kept but hidden behind an "Advanced" toggle.

`ENUM_LABEL_OVERRIDES` maps machine-readable enum values to human labels at the UI layer. `'local-lab-ca-issuer'` → `'Internal (homelab only)'`. This is intentionally not in the XRD — XRDs describe schema, not UI presentation.

`REF_KIND` maps `*Ref` field names to their `ResourceKind`: `sqlRef → 'XSql'`, `topicRef → 'XTopic'`, etc. `DynamicFormComponent` uses this to populate the resource-ref dropdowns.

**Key symbols**: `FieldDef`, `FieldKind`, `parseSchema(paramsSchema)`, `REF_KIND`, `HIDDEN_KEYS`, `ADVANCED_KEYS`, `ENUM_LABEL_OVERRIDES`

---

## Views

### `src/app/workspaces/workspaces.ts` — The list

Loads on `GET /api/workspaces`. Signals: `workspaces` (the list), `creatingWorkspace` (shows inline create form), `pickingGuestName` (shows the guest name picker panel).

The guest name picker uses the same two 25-word lists as the Go backend — same pools, same combination logic. The UI suggests a random name and the user can reroll. It posts the suggestion to `POST /api/guest/workspaces`. If the name is already taken, the server returns 409 and the picker rerolls automatically.

**Key signals**: `workspaces`, `creatingWorkspace`, `pickingGuestName`

### `src/app/workspaces/workspace-detail/workspace-detail.ts` — The main view

The most state-heavy component. Signals: `resources` (the full resource list), `statusMap` (`Map<string, ResourceStatus>` keyed by `kind/name`), `viewMode` (`'cards'` or `'arch'`), `creatingKind` (which kind's create form is open, if any).

On init: loads resources via `WorkspaceService`, then subscribes to `SseService.watchStatus(workspace)`. Every incoming `ResourceStatus` event calls `statusMap.update(m => { m.set(key, status); return new Map(m); })`. Angular's signal graph picks up the mutation and rerenders only the affected card — no manual `detectChanges`, no zone triggers.

Resource deletion calls `deleteResource` with a confirmation dialog. Create opens `CreateResourceComponent` for the chosen kind, then reloads the resource list on success.

**Key signals**: `resources`, `statusMap`, `viewMode`, `creatingKind`

### `src/app/workspaces/resource-card/resource-card.ts` — One card

Receives a `Resource` and a `ResourceStatus` (or `undefined` for newly-created resources with no cluster event yet) as inputs.

Status badge logic: `undefined` status → `QUEUED` (grey). `synced && ready` → `READY` (green). `synced && !ready` → `PENDING` (yellow). `!synced` → `ERROR` (red). Message from `status.message` appears below the badge when present.

Inline edit: clicking edit calls `getResourceValues` to fetch current spec params, then passes them to `DynamicFormComponent` as `existingValues`. The form patches those values on construction. Save calls `createResource` with the updated params (the API treats a re-PUT as an update via SHA-based upsert).

Integration chips appear for any `*Ref` key in the resource's spec — a chip per referenced resource, linking to that resource's card.

### `src/app/workspaces/workspace-arch/workspace-arch.ts` — The diagram

An alternative view to the card grid. Four columns: Frontend / API / Messaging / Data. Resources are placed in the column matching their kind (`XSpa` → Frontend, `XApi` → API, `XTopic`/`XSubscription` → Messaging, `XSql`/`XNoSql`/`XObjectStorage` → Data).

SVG edges connect resources based on `*Ref` fields in their specs. An `XApi` with a `sqlRef` gets a line to the `XSql` it references. Edge coordinates are calculated from the rendered DOM positions of the resource boxes after each view update.

WordPress (`XWordpress`) is treated specially — it's a merged block spanning the Frontend and Data columns since it's both a presentation layer and a database.

### `src/app/workspaces/guest-create/guest-create.ts` — Guest sandbox creation

Shown when a visitor (no token) wants to try the platform. Suggests a random name from the word pools, displays the 10-minute TTL prominently, and calls `POST /api/guest/workspaces` without a Bearer token. On success, navigates directly to `/workspaces/{new-workspace-name}` where the user can add resources to their sandbox.

### `src/app/create/create-resource.ts`

Thin wrapper component. Accepts `workspace: string` and `kind: ResourceKind` as inputs. Emits `created` and `cancelled` output events. Its only job is to provide the layout chrome (heading, cancel button) around `DynamicFormComponent`.

### `src/app/create/dynamic-form/dynamic-form.ts`

Builds an Angular `FormGroup` at runtime from a `FieldDef[]`. This is where schema meets form.

Each `FieldKind` maps to a specific rendering strategy:
- `text`, `number`, `boolean`, `select`, `array` — standard reactive form controls
- `display` — read-only value shown as a link or label, no control created
- `resource-ref` — a `<select>` populated by calling `getResources(workspace)` filtered to the `refKind`. The selected resource's name is stored as the control value.
- `sub-object` — a nested `FormGroup` rendered as a toggled section. The toggle itself is an extra boolean control (`{key}Enabled`). When disabled, the sub-object is excluded from the submit payload.

In edit mode, `existingValues` are patched into the form after construction via `patchValue`. On submit, the form value is cleaned (nulls and disabled sub-objects removed) and posted via `CreateService.createResource`.

**Key inputs**: `workspace`, `kind`, `fields: FieldDef[]`, `existingValues?`
**Key output**: `submitted` event with the cleaned form value

---

## Environment and Dev Proxy

`src/environments/environment.ts` — production values. `msalTenantId`, `msalClientId`, `msalApiScope` are Azure Entra OAuth2 public identifiers. They appear in browser redirect URLs by design — not secrets.

`src/environments/environment.local.ts` — gitignored. Copy from `environment.development.ts` and fill in real values for local dev.

`proxy.conf.json` — Angular dev server proxies `/api` to `localhost:8080` so the SPA runs on port 4200 against a local `launchpad-api` without CORS issues.

---

## The Flow from the Browser's Side

**Auth** — Page loads. `APP_INITIALIZER` calls `handleRedirectPromise()`. If tokens exist in `sessionStorage` (MSAL's default cache), the user is silently active. If not, the sign-in button triggers `loginRedirect()`. After Entra validates credentials and issues an access token, the browser returns to the app. `RoleService` picks up the `LOGIN_SUCCESS` broadcast and updates `isAuthenticated` and `isContributor`.

**List workspaces** — `WorkspacesComponent` calls `getWorkspaces()` on init. Renders a card per workspace. Guest workspaces show a countdown to expiry.

**Open a workspace** — Navigate to `/workspaces/:name`. `WorkspaceDetailComponent` calls `getResources(name)`. Simultaneously opens the SSE stream: `SseService.watchStatus(name)` acquires a token, opens `EventSource` with `?token={jwt}`. The broadcaster on the server replays its cache immediately — status badges are populated before the first live event arrives.

**Create a resource** — Click "+ New Resource", pick a kind. `SchemaService.getFields(kind)` fetches and caches the schema. `DynamicFormComponent` builds the `FormGroup` from the returned `FieldDef[]`. For `resource-ref` fields, it loads existing resources of the referenced kind and populates the dropdown. User fills in the form.

**Submit** — Form validates client-side. `authInterceptor` calls `acquireTokenSilent()` and attaches the Bearer token. POST goes to `launchpad-api`. The server validates, renders YAML, commits to GitHub, returns 201. The component emits `created`, the parent reloads the resource list.

**Watch it go live** — ArgoCD detects the GitHub commit. Crossplane reconciles. As the XR's `status.conditions` change, the watcher goroutine in `launchpad-api` publishes `ResourceStatus` events. `SseService` receives them. `workspace-detail` calls `statusMap.update()`. The affected `resource-card` rerenders its badge: `QUEUED` → `PENDING` → `READY`.

No terminal. No YAML. No cluster access.

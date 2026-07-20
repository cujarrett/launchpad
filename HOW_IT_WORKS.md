# How It Works — launchpad

Launchpad is a standalone Angular SPA (no SSR) that uses standalone components, zoneless change detection, and signals for state.

It talks to a single backend: `launchpad-api` (Go BFF). The frontend does not call Kubernetes directly and does not write to GitHub directly.

See [launchpad-api/HOW_IT_WORKS.md](../launchpad-api/HOW_IT_WORKS.md) for backend internals.

---

## High-level behavior

From the browser perspective:

1. User authenticates with Azure Entra (MSAL + PKCE) or uses guest mode.
2. User opens or creates a workspace.
3. User adds/edits resources through generated forms.
4. The API commits desired state and starts reconciling.
5. The SPA receives live status updates via SSE and updates cards/architecture view in real time.

---

## Request flow

```text
User action
  ↓
Signal update in component state
  ↓
WorkspaceService HTTP call  →  authInterceptor adds ****** (when available)
  ↓
POST/GET/DELETE /api/...  →  launchpad-api
  ↓
SSE /api/status/watch?token={jwt}
  ↓
SseService Observable<ResourceStatus>
  ↓
WorkspaceDetail.statusMap[name] update
  ↓
ResourceCard + ProvisioningPipeline + WorkspaceArch rerender
```

---

## App bootstrap

### `src/app/app.config.ts`

- Enables zoneless change detection (`provideZonelessChangeDetection`).
- Configures MSAL `PublicClientApplication` with tenant/client/scope values from environment.
- Fails fast at startup if required MSAL config is missing.
- Registers `authInterceptor` globally for HTTP.
- Uses `APP_INITIALIZER` + `handleRedirectObservable()` to process login redirects and set active account before app usage.

### `src/app/app.ts`

- Root layout (header, auth buttons, router outlet, footer).
- Reads auth state from `RoleService` signals.
- Rotates header tagline on a timer.

### `src/app/app.routes.ts`

- `/` → `Workspaces`
- `/workspaces/:name` → `WorkspaceDetail`
- `/signed-out` → `SignedOut`
- `**` redirects to `/`

---

## Core services and auth

### `src/app/core/services/role.service.ts`

Primary auth-state source for UI.

- Subscribes to MSAL broadcast events (`LOGIN_SUCCESS`, `ACQUIRE_TOKEN_SUCCESS`, `LOGOUT_SUCCESS`).
- Maintains reactive account-based state:
  - `isAuthenticated`
  - `isContributor` (checks `idTokenClaims.roles` for `Contributor`)
  - `userName`

### `src/app/core/interceptors/auth.interceptor.ts`

- Runs for `/api/*` requests only.
- Attempts `acquireTokenSilent()` and attaches `Authorization: ******
- On `InteractionRequiredAuthError` or any write-request token failure, triggers redirect auth.
- For read-only failures, allows unauthenticated pass-through.

### `src/app/core/services/workspace.service.ts`

Main API client for workspaces/resources.

Notable methods:

- `getWorkspaces()`
- `createWorkspace(name)` / `deleteWorkspace(name)`
- `getResources(workspace)`
- `createResource(workspace, payload)`
- `deleteResource(workspace, name)`
- `getResourceValues(workspace, name)`
- Guest methods:
  - `createGuestWorkspace(name)`
  - `createGuestResource(...)`
  - `patchGuestResourceRefs(...)`

### `src/app/core/services/schema.service.ts`

- Fetches `GET /api/schema/{kind}`.
- Converts raw schema via `parseSchema`.
- Caches parsed field definitions by resource kind.

### `src/app/core/services/sse.service.ts`

- Opens EventSource-based status stream.
- Acquires token first and appends it as query param (`?token=...`) because EventSource cannot set auth headers.
- Parses event payloads into `ResourceStatus`.
- Retries stream on failure.

---

## Core models

### `src/app/core/models/workspace.model.ts`

Defines workspace/resource/status types and display metadata:

- `Workspace` (`isGuest`, optional `expiresAt`)
- `Resource`
- `ResourceStatus`
- `ResourceKind` unions and label/color/icon maps

### `src/app/core/models/field.model.ts`

Defines schema-to-form mapping:

- `FieldDef` and `FieldKind`
- `parseSchema()` translation from OpenAPI-like params schema
- UI behavior metadata (advanced fields, hidden fields, connection fields)
- `REF_KIND` mapping for resource reference dropdowns

---

## Main views

### `src/app/workspaces/workspaces.ts`

Workspace list page.

- Loads all workspaces.
- Splits display into standard workspaces and guest sandboxes.
- Contributor users can create regular workspaces.
- Non-contributor users can launch guest workspaces with randomized names.
- Guest cards show live TTL countdown.
- `launchGuestWorkspace()` navigates to the new workspace's route immediately after picking a name, without waiting for the create request to finish — the name is validated in-memory server-side before any Git write, so it's safe to assume success. The create call itself fires in the background; a failure (rare — mostly a 409 name race) bounces the user back with the error surfaced.

### `src/app/workspaces/workspace-detail/workspace-detail.ts`

Main orchestration screen for one workspace.

- Loads resources.
- The first `loadResources()` call retries up to 6 times (700ms apart) on failure, since the workspace list page now navigates here before the backend has necessarily finished writing the workspace's files. Subsequent refreshes don't retry.
- Subscribes to live SSE status and stores by resource name (`statusMap`).
- Supports cards view and architecture view.
- Shows provisioning pipeline component while resources move toward ready.
- Supports resource creation flows:
  - Contributor flow (full type picker + dynamic form)
  - Guest flow (`GuestCreate`) with constrained options
- Supports workspace deletion when eligible.

### `src/app/workspaces/resource-card/resource-card.ts`

One resource card.

- Displays type, status, and optional message.
- Expands into edit/view form (`DynamicForm`).
- Handles resource delete confirmation.
- Detects preview readiness for API/SPA hosts by probing `/healthz` and emits readiness upward.
- In guest API mode, supports integration toggles persisted via `patchGuestResourceRefs`.

### `src/app/workspaces/provisioning-pipeline/provisioning-pipeline.ts`

Progress visualization component.

- Derives stage from resource statuses (`syncing`, `provisioning`, `integrating`, `idle`).
- Shows animated pipeline nodes and explanatory copy while resources reconcile.

### `src/app/workspaces/workspace-arch/workspace-arch.ts`

Architecture diagram view.

- Groups resources into columns by kind.
- Renders dependency edges from references in specs.
- Handles WordPress/CMS layout case specially.
- Uses live status to color readiness state.

### `src/app/workspaces/guest-create/guest-create.ts`

Guest-only resource creation helper.

- Restricts kinds available in guest mode.
- Prevents duplicate kind creation.
- Offers optional companion resources (SQL/NoSQL/storage/cache/SPA) when creating guest APIs.

---

## Dynamic form engine

### `src/app/create/dynamic-form/dynamic-form.ts`

Runtime form builder used for both create and edit.

- Loads schema fields from `SchemaService`.
- Loads existing resources to populate connection/reference controls.
- In edit mode, fetches live values (`getResourceValues`) unless skipped.
- Supports connection management UI (add/remove resource integrations).
- Supports optional companion creation (`Api ↔ Spa`) in create mode.
- Submits via `WorkspaceService.createResource(...)`.

---

## Environment and dev proxy

- `src/environments/environment.ts` contains production-safe public MSAL identifiers and `/api` base URL.
- `src/environments/environment.development.ts` contains placeholder development values replaced by local/CI config.
- `proxy.conf.json` proxies `/api` to `http://localhost:8080` for local frontend development.

---

## Browser-side end-to-end flow

1. **Auth**: redirect-based Entra login establishes account/session.
2. **Workspace list**: app loads all workspaces; guest and regular are rendered differently.
3. **Workspace open**: resources load; SSE starts in parallel.
4. **Create/edit**: schema-driven form submits desired params to API.
5. **Provisioning**: statuses stream back; cards + pipeline + architecture update reactively.
6. **Ready**: resources transition to ready; preview links appear when health probes succeed.

No terminal, no YAML, no cluster credentials required in the UI.

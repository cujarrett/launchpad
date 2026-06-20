// Placeholder values — replaced at build/deploy time.
// Local dev: copy environment.local.ts.example → environment.local.ts and fill in values.
// CI/CD: generate environment.local.ts from pipeline secrets before ng build.
export const environment = {
  maintenanceMode: false,
  apiUrl: "/api",
  msalTenantId: "YOUR_TENANT_ID",
  msalClientId: "YOUR_CLIENT_ID",
  msalApiScope: "api://YOUR_API_CLIENT_ID/access_as_user",
}

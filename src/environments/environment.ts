// Production values — safe to commit to a public repo.
//
// WHY THE MSAL VALUES ARE NOT SECRETS:
// Azure Entra ID uses the OAuth 2.0 PKCE flow for SPAs. The tenant ID, client ID, and
// API scope are embedded in every auth redirect URL the browser sends to
// login.microsoftonline.com, so any user of the app can read them from the network tab.
// Azure's security model relies on redirect URI allow-listing in the app registration,
// not on keeping the client ID secret. Publishing them here is standard practice.
//
// Secrets (GitHub PAT, etc.) live in the launchpad-secrets K8s Secret, never here.
// Local dev: copy environment.local.ts.example → environment.local.ts and fill in values.
export const environment = {
  maintenanceMode: true,
  apiUrl: "/api",
  msalTenantId: "7f4c1900-e63c-456b-ab5f-898189b24ec4",
  msalClientId: "78ce5bf3-c561-4c3e-9c09-9b6689fa0748",
  msalApiScope: "api://475d6fcc-4be6-4eae-b1d1-2cc2736bf915/access_as_user",
}

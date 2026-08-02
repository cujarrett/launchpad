import { HttpErrorResponse } from "@angular/common/http"

// The API returns plain-text bodies (Go's http.Error), but HttpClient is typed
// for JSON, so a failed parse lands the body in err.error.text and leaves
// err.error itself an object. Printing that object gives "[object Object]".
export function httpErrorMessage(err: unknown, fallback: string): string {
  if (err instanceof HttpErrorResponse) {
    const body = err.error
    const text =
      typeof body === "string"
        ? body
        : body && typeof body === "object" && typeof (body as { text?: unknown }).text === "string"
          ? ((body as { text: string }).text as string)
          : ""
    return readable(text) || `HTTP ${err.status}`
  }
  if (err instanceof Error) return err.message
  return fallback
}

// Traefik and cloudflared answer a gateway failure with a whole HTML page.
// Only the API's own one-line http.Error bodies are worth showing a user.
function readable(text: string): string {
  const trimmed = text.trim()
  if (!trimmed || trimmed.startsWith("<") || trimmed.length > 200) return ""
  return trimmed
}

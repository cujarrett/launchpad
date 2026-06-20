import { ResourceKind } from "./workspace.model"

// FieldKind maps to how the dynamic form renders each field.
export type FieldKind =
  | "text"
  | "number"
  | "boolean"
  | "select"
  | "array"
  | "display" // read-only value shown as a link/label, not an input
  | "resource-ref" // *Ref objects — rendered as a dropdown of existing tenant resources
  | "sub-object" // nested object (e.g. cache, apiProxy) — rendered as a toggled sub-group

export interface FieldDef {
  key: string
  kind: FieldKind
  label: string
  description?: string
  default?: unknown
  minimum?: number
  enum?: string[]
  enumLabels?: string[]
  pattern?: string
  required: boolean
  advanced?: boolean
  connection?: boolean
  refKind?: ResourceKind // only for resource-ref
  children?: FieldDef[] // only for sub-object
}

// Maps *Ref field names → the ResourceKind they reference.
// objectStorageRefs is an array in the XRD but the UI treats it as a single
// connection (first element) so it can render as a resource-ref dropdown.
export const REF_KIND: Record<string, ResourceKind> = {
  sqlRef: "XSql",
  nosqlRef: "XNoSql",
  objectStorageRefs: "XObjectStorage",
  topicRef: "XTopic",
  subscriptionRef: "XSubscription",
}

// Fields excluded from the Launchpad UI entirely.
// CI-managed or platform-internal fields that app developers never need to touch.
// secretRef is omitted: binding arbitrary Kubernetes Secrets via the UI is too
// sensitive — set it directly in the YAML if needed.
const HIDDEN_KEYS = new Set(["namespace", "scrapeInterval", "secretRef"])

// Parses the raw OpenAPI parameters schema from the BFF into a flat FieldDef[].
export function parseSchema(paramsSchema: Record<string, unknown>): FieldDef[] {
  const properties = (paramsSchema["properties"] ?? {}) as Record<string, unknown>
  const required = (paramsSchema["required"] ?? []) as string[]
  return Object.entries(properties)
    .filter(([key]) => !HIDDEN_KEYS.has(key))
    .map(([key, schema]) =>
      classifyField(key, schema as Record<string, unknown>, required.includes(key)),
    )
}

// Display labels for enum fields, keyed by field name then by value.
// Value-keyed so any subset of an enum (e.g. [sm, md, lg] vs [xs, sm, md, lg]) gets correct labels.
// This is a UI-layer decision — do not add x-enumLabels to XRDs.
const ENUM_LABEL_OVERRIDES: Record<string, Record<string, string>> = {
  size: { xs: "Extra Small", sm: "Small", md: "Medium", lg: "Large" },
  tlsIssuer: {
    "local-lab-ca-issuer": "Internal (homelab only)",
    "letsencrypt-prod": "External (public internet)",
  },
}

// Fields treated as advanced (hidden behind "Advanced" toggle) in Launchpad.
// This is a UI-layer decision — do not add x-advanced to XRDs.
const ADVANCED_KEYS = new Set(["contentSecurityPolicy", "metricsPort"])

function classifyField(key: string, schema: Record<string, unknown>, required: boolean): FieldDef {
  const base = {
    key,
    label: LABEL_OVERRIDES[key] ?? toLabel(key),
    description: schema["description"] as string | undefined,
    default: schema["default"],
    ...(schema["minimum"] !== undefined ? { minimum: schema["minimum"] as number } : {}),
    pattern: schema["pattern"] as string | undefined,
    required,
    ...(ADVANCED_KEYS.has(key) ? { advanced: true } : {}),
  }

  if (key === "repo" || key === "image") {
    return { ...base, kind: "display" }
  }

  if ((schema["type"] === "object" || schema["type"] === "array") && key in REF_KIND) {
    return { ...base, kind: "resource-ref", refKind: REF_KIND[key], connection: true }
  }

  if (schema["type"] === "object") {
    const childProps = (schema["properties"] ?? {}) as Record<string, unknown>
    const childRequired = (schema["required"] ?? []) as string[]
    const children = Object.entries(childProps).map(([k, s]) =>
      classifyField(k, s as Record<string, unknown>, childRequired.includes(k)),
    )
    const hasEnabledChild = children.some((c) => c.key === "enabled" && c.kind === "boolean")
    return {
      ...base,
      kind: "sub-object",
      children,
      ...(hasEnabledChild ? { connection: true } : {}),
    }
  }

  if (schema["type"] === "array") {
    return { ...base, kind: "array" }
  }

  if (schema["enum"]) {
    const labelMap = ENUM_LABEL_OVERRIDES[key]
    const enumValues = schema["enum"] as string[]
    const enumLabels = labelMap ? enumValues.map((v) => labelMap[v] ?? v) : undefined
    return { ...base, kind: "select", enum: enumValues, ...(enumLabels ? { enumLabels } : {}) }
  }

  if (schema["type"] === "boolean") {
    return { ...base, kind: "boolean" }
  }

  if (schema["type"] === "integer") {
    return { ...base, kind: "number" }
  }

  return { ...base, kind: "text" }
}

const ACRONYMS = new Set([
  "cpu",
  "ram",
  "url",
  "api",
  "id",
  "ip",
  "db",
  "ssl",
  "tls",
  "iam",
  "aws",
  "gcp",
  "sql",
  "nosql",
])

const LABEL_OVERRIDES: Record<string, string> = {
  nosqlRef: "NoSQL Database",
  sqlRef: "SQL Database",
  objectStorageRefs: "Object Storage",
  topicRef: "Topic",
  subscriptionRef: "Subscription",
  secretRef: "Secret",
  repo: "Source Repository",
}

function toLabel(key: string): string {
  // camelCase → words, then uppercase known acronyms
  return key
    .replace(/([A-Z])/g, " $1")
    .replace(/^./, (c) => c.toUpperCase())
    .trim()
    .split(" ")
    .map((word) => (ACRONYMS.has(word.toLowerCase()) ? word.toUpperCase() : word))
    .join(" ")
}

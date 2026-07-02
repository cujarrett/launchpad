export interface Workspace {
  name: string
  isGuest: boolean
  expiresAt?: string
  phaseTimes?: Record<string, string>
  doneAt?: string
}

export type ResourceKind =
  | "XSpa"
  | "XApi"
  | "XSql"
  | "XNoSql"
  | "XObjectStorage"
  | "XCache"
  | "XTopic"
  | "XSubscription"
  | "XWordpress"

export const RESOURCE_KIND_LABELS: Record<ResourceKind, string> = {
  XSpa: "SPA",
  XApi: "API",
  XSql: "SQL Database",
  XNoSql: "NoSQL Database",
  XObjectStorage: "Object Storage",
  XCache: "Cache",
  XTopic: "Topic",
  XSubscription: "Subscription",
  XWordpress: "WordPress",
}

// MUI 2014 Material Design palette — 500 shades
export const RESOURCE_KIND_COLORS: Record<ResourceKind, string> = {
  XSpa: "#3f51b5",   // indigo[500]
  XApi: "#00bcd4",   // cyan[500]
  XSql: "#ffc107",   // amber[500]
  XNoSql: "#ff9800", // orange[500]
  XObjectStorage: "#009688", // teal[500]
  XCache: "#607d8b", // blue-grey[500]
  XTopic: "#9c27b0", // purple[500]
  XSubscription: "#e91e63", // pink[500]
  XWordpress: "#21759b", // WordPress blue
}

export const RESOURCE_KIND_ICONS: Record<ResourceKind, string> = {
  XSpa: "🌐",
  XApi: "⚡",
  XSql: "🗄️",
  XNoSql: "📋",
  XObjectStorage: "🗂️",
  XCache: "⚡",
  XTopic: "📢",
  XSubscription: "🔔",
  XWordpress: "📝",
}

export interface Resource {
  name: string
  kind: ResourceKind
  namespace: string
  spec: Record<string, unknown>
}

export interface InitContainerStatus {
  name: string
  binding: string
  completed: boolean
  finishedAt?: string
}

export interface ResourceStatus {
  workspace: string
  kind: string
  name: string
  synced: boolean
  ready: boolean
  message?: string
  initContainers?: InitContainerStatus[]
}

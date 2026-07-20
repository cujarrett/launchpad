export interface Workspace {
  name: string
  isGuest: boolean
  expiresAt?: string
  phaseTimes?: Record<string, string>
  doneAt?: string
}

export type ResourceKind =
  | "Spa"
  | "Api"
  | "Sql"
  | "NoSql"
  | "ObjectStorage"
  | "Cache"
  | "Topic"
  | "Subscription"
  | "Wordpress"

export const RESOURCE_KIND_LABELS: Record<ResourceKind, string> = {
  Spa: "SPA",
  Api: "API",
  Sql: "SQL Database",
  NoSql: "NoSQL Database",
  ObjectStorage: "Object Storage",
  Cache: "Cache",
  Topic: "Topic",
  Subscription: "Subscription",
  Wordpress: "WordPress",
}

// MUI 2014 Material Design palette — 500 shades
export const RESOURCE_KIND_COLORS: Record<ResourceKind, string> = {
  Spa: "#3f51b5", // indigo[500]
  Api: "#00bcd4", // cyan[500]
  Sql: "#ffc107", // amber[500]
  NoSql: "#ff9800", // orange[500]
  ObjectStorage: "#009688", // teal[500]
  Cache: "#607d8b", // blue-grey[500]
  Topic: "#9c27b0", // purple[500]
  Subscription: "#e91e63", // pink[500]
  Wordpress: "#21759b", // WordPress blue
}

export const RESOURCE_KIND_ICONS: Record<ResourceKind, string> = {
  Spa: "🌐",
  Api: "⚡",
  Sql: "🗄️",
  NoSql: "📋",
  ObjectStorage: "🗂️",
  Cache: "⚡",
  Topic: "📢",
  Subscription: "🔔",
  Wordpress: "📝",
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

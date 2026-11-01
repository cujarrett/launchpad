// Product names a guest should spot at a glance, such as an exec skimming the page.
const TECH = ["AWS", "S3", "DynamoDB", "Postgres", "Redis", "Temporal", "Entra", "HTTPS"]
const TECH_PATTERN = new RegExp(`\\b(${TECH.join("|")})\\b`)

export interface TextPart {
  text: string
  tech: boolean
}

// Splits text so each product name can be shown as a badge.
export function techParts(text: string): TextPart[] {
  return text
    .split(TECH_PATTERN)
    .filter((t) => t !== "")
    .map((t) => ({ text: t, tech: TECH.includes(t) }))
}

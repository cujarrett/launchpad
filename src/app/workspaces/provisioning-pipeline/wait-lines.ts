// Something to read when a rollout stage drags on.
// 10s: a nudge about whoever the wait is on.
// 20s on: a joke, a new one every 5s. Each line reads in about 2s.
// A normal 35s Entra wait gets a nudge and 4 jokes.
const NUDGE_AFTER_MS = 10_000
const JOKES_AFTER_MS = 20_000
const JOKE_EVERY_MS = 5_000

// Who the wait is on. Each gets a nudge and jokes of its own.
export type Culprit = "GitHub" | "ArgoCD" | "Kubernetes" | "AWS" | "Entra"

// Tone: fond of the stack, and never at its expense.
const NUDGE: Record<Culprit, string> = {
  Entra: "Entra is double-checking the paperwork.",
  AWS: "AWS is clearing a shelf for your data.",
  GitHub: "GitHub is filing your changes.",
  ArgoCD: "ArgoCD is reading the plan carefully.",
  Kubernetes: "Kubernetes is finding a good spot for your app.",
}

const OWN_JOKES: Record<Culprit, string[]> = {
  Entra: [
    "Entra is making your app a name badge.",
    "Entra is learning your app's name. It's a nice name.",
  ],
  AWS: [
    "AWS is carrying your bucket over with care.",
    "Somewhere in Virginia, a small table is being set.",
  ],
  GitHub: ["GitHub is keeping careful notes.", "Every change is in Git, so nothing gets lost."],
  ArgoCD: [
    "ArgoCD is checking its list twice.",
    "ArgoCD likes things to match the plan. So do we.",
  ],
  Kubernetes: [
    "Your containers are getting dressed.",
    "Kubernetes is finding each pod a comfy node.",
    "Desired state: ready. It's on its way.",
  ],
}

const JOKES = [
  "Four Raspberry Pis are giving this their full attention.",
  "Your sandbox is picking out an outfit.",
  "Your sandbox is developing a backstory.",
  "All this from one commit. Not bad.",
  "No tickets were filed in the making of this sandbox.",
  "Still on the happy path. Just the scenic route.",
  "Good time to stretch. We'll keep an eye on it.",
  "Real infrastructure likes to take a moment.",
  "Not DNS. Never DNS. Once, DNS.",
  "Eventually consistent. We believe in it.",
  "Reconciliation is just patience with a plan.",
  "Infrastructure as code. Patience as a service.",
  "Everything is declarative. Even our optimism.",
  "Have you tried turning the cloud off and on again?",
  "We could have built this by hand. Aren't you glad we didn't?",
  "A small rack is working very hard for you right now.",
  "Thanks for waiting. It's worth it.",
]

export function waitLine(who: Culprit, elapsedMs: number): string | null {
  if (elapsedMs < NUDGE_AFTER_MS) return null
  if (elapsedMs < JOKES_AFTER_MS) return NUDGE[who]
  // The culprit's own jokes come first, then the rest.
  const lines = [...OWN_JOKES[who], ...JOKES]
  return lines[Math.floor((elapsedMs - JOKES_AFTER_MS) / JOKE_EVERY_MS) % lines.length]
}

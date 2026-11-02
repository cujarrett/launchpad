// Something to read when a rollout stage drags on.
// 10s: a nudge about whoever the wait is on.
// 20s on: a joke, a new one every 5s. Each line reads in about 2s.
// A normal 35s Entra wait gets a nudge and 4 jokes.
const NUDGE_AFTER_MS = 10_000
const JOKES_AFTER_MS = 20_000
const JOKE_EVERY_MS = 5_000

// Who the wait is on. Each gets a nudge and jokes of its own.
export type Culprit = "GitHub" | "ArgoCD" | "Kubernetes" | "AWS" | "Entra"

const NUDGE: Record<Culprit, string> = {
  Entra: "Entra's taking its time. We're asking nicely.",
  AWS: "AWS is thinking. We're nudging.",
  GitHub: "GitHub hasn't called back. Following up.",
  ArgoCD: "ArgoCD hasn't noticed. Poking it.",
  Kubernetes: "Kubernetes is working on it. Allegedly.",
}

const OWN_JOKES: Record<Culprit, string[]> = {
  Entra: [
    "Entra is reviewing an app that didn't exist a minute ago.",
    "Entra says up to 24 hours. We've got a head start.",
  ],
  AWS: ["AWS bills by the second. No rush, apparently.", "us-east-1. A bold choice."],
  GitHub: [
    "GitHub has nines. Not necessarily consecutive.",
    "GitHub status: green. Our patience: amber.",
  ],
  ArgoCD: [
    "ArgoCD says Progressing. Aren't we all.",
    "ArgoCD is comparing reality to its expectations.",
  ],
  Kubernetes: [
    "ContainerCreating. Very creative. Still creating.",
    "Kubernetes is looking for a node that believes in itself.",
    "Desired state: ready. Actual state: we'll see.",
  ],
}

const JOKES = [
  "P1 raised. Someone downgraded it to a P3.",
  "Escalated. A meeting has been scheduled.",
  "Your demo matters to us. Please hold.",
  "All systems operational. Except the ones we need.",
  "We've engaged our best engineers. They're also waiting.",
  "Incident commander assigned. It's you.",
  "The postmortem is going to be interesting.",
  "Infrastructure as code. Patience as a service.",
  "We built a platform so you wouldn't have to wait for tickets. Anyway...",
  "Not DNS. Never DNS. Once, DNS.",
  "Eventually consistent. Eventually.",
  "Reconciliation is just retrying with confidence.",
  "Everything is declarative. Including our frustration.",
  "The control plane is in control. Allegedly.",
  "Launchpad is judging this rollout. Quietly.",
  "Have you tried turning the cloud off and on again?",
  "Your sandbox is developing a backstory.",
  "Congratulations. You've discovered distributed systems.",
  "We could have built this manually. We won't.",
  "The happy path has encountered an unhappy dependency.",
]

export function waitLine(who: Culprit, elapsedMs: number): string | null {
  if (elapsedMs < NUDGE_AFTER_MS) return null
  if (elapsedMs < JOKES_AFTER_MS) return NUDGE[who]
  // The culprit's own jokes come first, then the rest.
  const lines = [...OWN_JOKES[who], ...JOKES]
  return lines[Math.floor((elapsedMs - JOKES_AFTER_MS) / JOKE_EVERY_MS) % lines.length]
}

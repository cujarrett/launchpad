# Launchpad

Self-service platform UI for the homelab cluster. Log in, describe the workload you want running, watch it go green. No kubectl, no YAML, no cluster access required.

Built with Angular standalone components, zoneless change detection, and signals throughout. Auth is MSAL PKCE via Azure Entra ID. The only backend it talks to is [launchpad-api](https://github.com/cujarrett/launchpad-api).

Guest sandbox: try it without logging in. Resources spin up against a real cluster and expire after 10 minutes.

Live at [launchpad.mattjarrett.dev](https://launchpad.mattjarrett.dev).

## Local dev

```bash
npm install
npm start
# Proxies /api → localhost:8080 via proxy.conf.json
```

[launchpad-api](https://github.com/cujarrett/launchpad-api) needs to be running locally for any real functionality.

## How it works

Full request flow — auth, form generation, SSE status updates — is in [HOW_IT_WORKS.md](./HOW_IT_WORKS.md).

## Deployment

CI builds a multi-arch Docker image and pushes to GHCR. Deployed as an XSpa Crossplane XR in the cluster via ArgoCD.

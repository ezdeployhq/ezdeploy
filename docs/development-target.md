# Development target

EZdeploy is a zero-install, Agent-discoverable enterprise application deployment center. An employee copies one prompt containing the organization's public EZdeploy guide URL and a single-use connection code into Codex, WorkBuddy, or another coding agent. The Agent inspects the supported project, creates or updates `ezdeploy.yaml`, previews a deployment plan without consuming the code, waits for explicit confirmation, exchanges the code for a short-lived scoped session, binds deployment to the confirmed plan digest, provisions the declared Cloudflare D1, R2, organization access, and AI capabilities, deploys the application, activates its exact enterprise domain, verifies health, persists its state, and returns an `*.apps.example.com` URL.

Ordinary employees do not install EZdeploy globally, configure MCP, supply local package paths, or handle cloud and model-provider master credentials. Remote MCP is an optional enhanced interface; a temporary `npx` client and the documented HTTP protocol are universal fallbacks.

The first release supports static, Vite/React, and Cloudflare Workers applications. It maintains four durable truths: what the application is, which release is active, which resources are bound, and who may access it. The control plane is self-hostable, provider master credentials never enter source repositories or agent context, and applications receive only scoped runtime credentials.

The first release excludes arbitrary Docker applications, Kubernetes, multi-cloud scheduling, full CI/CD, complex approval flows, and custom database or object-storage implementations.

## Acceptance gates

1. An agent can deploy each supported sample application and receive a healthy URL within five minutes under normal provider conditions.
2. Database, storage, AI, and access bindings are created only when declared.
3. Repeated deployments reuse bindings and create a new immutable deployment sequence.
4. A failed release does not overwrite the last known ready release.
5. Build, provider, and health failures are available as structured events and actionable MCP results.
6. A ready release can be deleted with explicit resource-retention semantics and rolled back to a previous ready version.
7. The application center lists owner, URL, status, access mode, bound resource kinds, and active release.
8. Provider master keys are absent from application files, logs, MCP responses, and agent-visible configuration.
9. A new employee starts a first deployment by copying one prompt; no prior EZdeploy installation or MCP configuration is required.
10. Connection codes expire after ten minutes, are redeemable once, and issue one-hour least-privilege sessions.
11. The public `agent.md` and `/.well-known/zaodeploy.json` documents describe the same versioned connection and deployment protocol.
12. Planning does not redeem the connection code; deployment is rejected if the normalized manifest differs from the confirmed `planDigest`.
13. When an enterprise domain suffix is configured, `ready` requires an active exact custom domain; `pages.dev` is not accepted as the final application URL.

# Development target

EZdeploy is an install-once, Agent-discoverable personal application deployment center. The owner copies one prompt from the center to install the public EZdeploy Skill and save a long-lived, revocable deployment key in the Agent's user-level credential directory. After that, phrases such as “部署到应用中心” trigger the workflow in Codex, WorkBuddy, or another coding agent. The Agent inspects the project, creates or updates `ezdeploy.yaml`, previews a deployment plan, waits for explicit confirmation, binds deployment to the confirmed plan digest, provisions only the declared Cloudflare D1, R2, access, and AI capabilities, deploys the application, activates its exact personal domain, verifies health, persists state, and returns an `*.apps.example.com` URL.

The owner does not install EZdeploy globally, configure MCP, supply local package paths, or handle cloud and model-provider master credentials. Remote MCP is an optional enhanced interface; the installed Skill uses a temporary integrity-checked client and the documented HTTP protocol.

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
9. The owner installs the Skill and saves credentials once; later deployments need no repeated installation or authorization.
10. Persistent deployment keys are shown once, stored only as hashes server-side, and remain valid until explicitly revoked.
11. The public `agent.md`, Skill, and `/.well-known/ezdeploy.json` describe the same versioned authentication and deployment protocol.
12. Deployment is rejected if the normalized manifest differs from the confirmed `planDigest`.
13. When an enterprise domain suffix is configured, `ready` requires an active exact custom domain; `pages.dev` is not accepted as the final application URL.

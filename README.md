# EZdeploy

[![CI](https://github.com/jingchang0623-crypto/ezdeploy/actions/workflows/ci.yml/badge.svg)](https://github.com/jingchang0623-crypto/ezdeploy/actions/workflows/ci.yml)
[![License](https://img.shields.io/badge/license-Apache--2.0-blue.svg)](./LICENSE)

EZdeploy is an open-source, agent-native personal application deployment center. The owner copies one deployment prompt from the application center into a coding agent. The agent reads EZdeploy's public capability document, previews a deployment plan without consuming the single-use code, waits for explicit confirmation, exchanges the code for a short-lived scoped session, deploys the exact confirmed plan, verifies application health, and returns a live URL on the owner's domain.

## Product boundary

The first release targets static sites, Vite/React, and Cloudflare Workers. Cloudflare Pages/Workers is the intended runtime; D1, R2, organization access, and an OpenAI-compatible AI proxy are resource bindings.

EZdeploy does not aim to become a general container platform, Kubernetes distribution, full CI/CD product, or database implementation.

## Open-source status

EZdeploy is being prepared for its first public `0.1.0` release under Apache-2.0. The core
deployment workflow is implemented and tested; Cloudflare setup still requires operator-owned
infrastructure and security review. The source repository is
[jingchang0623-crypto/ezdeploy](https://github.com/jingchang0623-crypto/ezdeploy). See [CONTRIBUTING.md](./CONTRIBUTING.md),
[SECURITY.md](./SECURITY.md), and the [release checklist](./docs/open-source-release.md).

## Deployment contract

Every deployment follows the same observable workflow:

```text
inspect project
  -> validate ezdeploy.yaml
  -> preview provider, bindings, access, and risks
  -> obtain explicit user confirmation
  -> bind deployment to the confirmed plan digest
  -> provision or reuse resources
  -> deploy
  -> verify health
  -> persist application state
  -> return URL
```

Success requires a `ready` deployment and a verified `*.apps.example.com` URL when a
personal application domain suffix is configured. Provider deployment IDs and fallback hosting URLs
alone are not success.

## Repository layout

```text
apps/mcp-server       Temporary npx client and optional MCP gateway
apps/control-plane    Authenticated source-upload and deployment API
apps/cloud-control-plane  Online Worker + D1/R2/Workflow control plane
apps/agent-ingress       Public token-authenticated Agent API ingress
apps/ai-proxy         OpenAI-compatible scoped AI gateway
apps/app-center       Authenticated local application catalog
apps/cloud-app-center Online single-administrator application center
packages/contracts    Versioned manifest and domain schemas
packages/core         State machine, SQLite repository, orchestration, providers
skills/ezdeploy      Codex deployment workflow
```

The production control plane is fully online. A Worker stores applications, environments,
deployments, bindings, and events in D1; deployment bundles in R2; and long-running release
steps in Cloudflare Workflows. Provider credentials are Worker secrets and never enter an
application repository or Agent prompt.

## Implemented vertical slice

The repository includes a deterministic mock for tests and a real Cloudflare adapter:

- manifest validation and safe defaults;
- explicit deployment state transitions;
- resource-binding reuse across repeated deployments;
- health-gated readiness and structured failures;
- persisted control-plane events and structured provider errors;
- explicit deletion with resource retention or removal;
- Pages and Workers deployment with D1/R2 runtime bindings;
- scoped AI virtual keys issued by an OpenAI-compatible proxy and injected as secrets;
- optional Cloudflare Access policies for protected applications;
- immutable Pages artifacts, Worker version capture, and restoration;
- a single-administrator application center plus MCP list, logs, rollback, and delete tools.

The mock provider must not be presented as production. A production installation requires a Cloudflare account and deployment of the AI Proxy when AI bindings are used. Cloudflare Zero Trust is optional and only needed for protected application access.

## Develop

Requires Node.js 22 or later.

```bash
npm install
npm run typecheck
npm test
npm run build
```

Run the local Mock MCP server for development:

```bash
ZAODEPLOY_PROVIDER=mock \
ZAODEPLOY_DATABASE_PATH=.zaodeploy/control-plane.db \
npm --workspace @ezdeploy/agent run dev
```

The mock provider returns `.example.test` URLs and must be selected explicitly. Production
uses the online `@ezdeploy/cloud-control-plane`. The default owner flow requires no prior
installation or MCP configuration: the application center generates a prompt containing a
public `agent.md` URL and a two-hour, single-use connection code. Terminal-capable Agents
download a versioned standalone client into an operating-system temporary directory;
Remote MCP and an operator-published `@ezdeploy/agent` package remain optional enhanced
distribution paths. No local
control-plane daemon or owner-visible Cloudflare Access service credential is required.
The same canonical workflow is discoverable through `agent.md`, `skill.md`, `agents.md`,
`llms.txt`, `/.well-known/ezdeploy.json`, and `openapi.json`. The old well-known path and
`ZAODEPLOY_*` environment variables are retained as stable legacy protocol identifiers.

AI and organization access are opt-in control-plane capabilities; see [`.env.example`](./.env.example). The AI Proxy keeps the real model-provider key server-side and issues revocable per-application keys. Vite/static applications must call D1, R2, and AI through Pages Functions—never expose `ZAO_AI_API_KEY` to browser code.

The personal administrator can configure DeepSeek, OpenAI, Anthropic, Gemini, OpenRouter,
Cloudflare Workers AI, or a custom OpenAI-compatible endpoint from the application center.
See [`docs/ai-provider-management.md`](./docs/ai-provider-management.md).

See [`docs/cloudflare-setup.md`](./docs/cloudflare-setup.md) for Worker and Agent setup. The
Gateway builds locally with a minimal environment and uploads a digest-verified bundle
containing only the manifest, built assets, compiled Pages Functions, routes, and migrations.
Project build scripts never execute in the credential-bearing control plane.

On first visit, the owner creates the installation's only administrator account. EZdeploy stores
only a salted PBKDF2 password derivative and hashed, expiring sessions in D1; it never stores the
plaintext password or session token. See [`docs/account-management.md`](./docs/account-management.md).

Run the application center against the same database:

```bash
ZAODEPLOY_DATABASE_PATH=.zaodeploy/control-plane.db \
ZAODEPLOY_APP_CENTER_TOKEN='<personal owner token>' \
npm --workspace @ezdeploy/app-center run dev
```

When the application center origin is reachable only through Cloudflare Access, use `ZAODEPLOY_TRUST_CLOUDFLARE_ACCESS=true` instead of local token mode. Do not enable header-trust mode on an origin that can be reached directly.

## Manifest

Start from [`ezdeploy.example.yaml`](./ezdeploy.example.yaml). The manifest is the durable source of deployment intent; chat history is not.

## License

Apache-2.0.

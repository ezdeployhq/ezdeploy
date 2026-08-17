# Cloudflare online production setup

## Topology

EZdeploy production consists of four online Workers:

- `cloud-control-plane`: authenticated API, D1 state, R2 bundles, and Workflow orchestration;
- `agent-ingress`: token-authenticated Agent API that reaches the control plane through a Worker service binding;
- `cloud-app-center`: owner-facing catalog and single-administrator login backed by the same D1;
- `ai-proxy`: OpenAI-compatible gateway issuing revocable per-application `zai_` keys.

The owner does not need to preinstall a Gateway. The public Agent endpoint serves
`/agent.md`, `/skill/ezdeploy-deploy/SKILL.md`, `/agents.md`, `/llms.txt`, `/openapi.json`, and
`/.well-known/ezdeploy.json`; the application center issues a long-lived, revocable personal
deployment key and a one-time Skill installation prompt. A terminal-capable Agent downloads the standalone client and its
BLAKE3 WebAssembly helper from the Agent endpoint into an operating-system temporary
directory, while Remote MCP can be enabled as an optional enhanced path.
No local EZdeploy server, SQLite database, Cloudflare account token, or model-provider key
is required.

## Enterprise application domain

Set `APP_CENTER_URL` to the application-center hostname and
`APPLICATION_DOMAIN_SUFFIX` to its DNS suffix in the control-plane Worker:

```json
{
  "APP_CENTER_URL": "https://center.apps.example.com",
  "APPLICATION_DOMAIN_SUFFIX": "apps.example.com",
  "CLOUDFLARE_ZONE_ID": "<target-zone-id>"
}
```

Attach `center.apps.example.com` as a Worker Custom Domain to `cloud-app-center`. Production
applications are then assigned exact Pages custom domains such as
`expenses.apps.example.com`; non-production environments use
`expenses-staging.apps.example.com`. Cloudflare Pages does not support wildcard custom
domains, so EZdeploy registers each exact hostname through the Pages API after deployment.
The control-plane API token must include `DNS Write` for the target zone so Cloudflare can
create the corresponding proxied CNAME records. Domain and certificate activation is a
durable Workflow stage. When a custom application suffix is configured, EZdeploy does not mark a
deployment ready or fall back to `pages.dev` until the exact custom hostname is active.

## Cloudflare resources

Use one Cloudflare account. For the runtime API token, grant the account-scoped permissions
`D1 Write`, `Pages Write`, `Workers R2 Storage Write`, and `Workers AI Read`. Add `DNS Write`
for the application zone when exact custom domains are enabled. Add `Access: Apps and
Policies Write` only when `ACCESS_ENABLED=true`; Wrangler's interactive login deploys the
EZdeploy Workers and Workflow separately.

R2 includes a free usage allowance, but a new Cloudflare account still requires R2 subscription
activation (and may request a payment method) before the first bucket can be created. Activating
R2 does not itself create usage charges; usage above Cloudflare's current free allowance is billed.
Complete this one-time activation before running `wrangler r2 bucket create`.

For protected applications, also configure a Zero Trust identity provider, an allowed-user
Access group, and one service token used by deployment automation and health checks. The
personal application center itself uses its own single-administrator login and does not require
Cloudflare Access. A first installation can start in public-only mode and add Access later.

Create shared storage and deploy:

```bash
npx wrangler r2 bucket create ezdeploy-sources
npx wrangler d1 create ezdeploy-control
cp apps/cloud-control-plane/wrangler.example.json apps/cloud-control-plane/wrangler.json
cp apps/agent-ingress/wrangler.example.json apps/agent-ingress/wrangler.json
cp apps/cloud-app-center/wrangler.example.json apps/cloud-app-center/wrangler.json
cp apps/ai-proxy/wrangler.example.json apps/ai-proxy/wrangler.json
# Replace every YOUR_* value and example.com hostname before continuing.
npx wrangler d1 migrations apply ezdeploy-control --remote \
  --config apps/cloud-control-plane/wrangler.json
npx wrangler deploy --config apps/cloud-control-plane/wrangler.json
npx wrangler deploy --config apps/agent-ingress/wrangler.json
npx wrangler deploy --config apps/cloud-app-center/wrangler.json
npx wrangler deploy --config apps/ai-proxy/wrangler.json
```

Inject `CLOUDFLARE_API_TOKEN`, `AI_CONTROL_TOKEN`, `CONTROL_PLANE_TOKEN`,
`ACCESS_CLIENT_ID`, and `ACCESS_CLIENT_SECRET` with `wrangler secret put`. The AI Proxy also
receives `AI_GATEWAY_TOKEN` and the matching `CONTROL_PLANE_TOKEN`. Never place these values in
`vars`, an application repository, a browser bundle, or an MCP argument.

When protected application deployment is enabled, protect these hostnames with Cloudflare Access:

- the control-plane Worker: administrator group plus service-token automation policy;
- each protected application: allowed-user group plus service-token health policy.

Do not put the application-center Worker behind Access unless you intentionally want a second
login layer. On first visit to `/center`, create the installation's only administrator account.
The password derivative and expiring session hashes are stored in D1.

Set `ACCESS_ENABLED` to `"true"` only after the Access group and service token are configured.
Leave it as `"false"` for an initial public-only installation. Public deployments then require no
Access API permission; an application requesting `organization` access fails with an explicit
configuration error instead of being published without protection.

## Codex, WorkBuddy, and other coding Agents

Open the Access-protected application center and choose **让 AI 帮你部署**. Paste the generated
prompt into the Agent working on the project. No repository clone, local path, or manual MCP
registration is part of the owner flow.

The prompt points to the public deployment guide, for example:

```text
https://deploy.apps.example.com/agent.md
```

The Agent first previews a plan without consuming the included `ZAO-XXXX-XXXX` code:

```bash
ZAO_TMP="$(mktemp -d)"
curl -fsSL https://deploy.apps.example.com/client/ezdeploy-agent.cjs \
  -o "$ZAO_TMP/ezdeploy-agent.cjs"
curl -fsSL https://deploy.apps.example.com/client/blake3_js_bg.wasm \
  -o "$ZAO_TMP/blake3_js_bg.wasm"
node "$ZAO_TMP/ezdeploy-agent.cjs" plan \
  --api-url https://deploy.apps.example.com --connect-code ZAO-XXXX-XXXX
```

It shows the returned runtime, resources, access mode, risks, health check, and
`planDigest`, then stops for explicit confirmation. After confirmation:

```bash
node "$ZAO_TMP/ezdeploy-agent.cjs" deploy \
  --api-url https://deploy.apps.example.com \
  --connect-code ZAO-XXXX-XXXX \
  --plan-digest <confirmed-planDigest>
rm -rf "$ZAO_TMP"
```

This is a temporary execution, not an installation. Planning does not redeem the code.
Deployment exchanges it once; the plaintext session credential remains in the client process
and expires after twelve hours. If `ezdeploy.yaml` changes after confirmation, deployment stops
before upload. The same client may also be distributed through a private npm registry as
`@ezdeploy/agent`.

The owner can then say “部署这个应用”. The Agent validates or creates `ezdeploy.yaml`,
shows the plan, builds locally, compiles Pages Functions, uploads a deterministic deployment
bundle, waits for the online Workflow, and returns only after the application is healthy and
registered in the application center.

The MCP server and tools explicitly identify EZdeploy. The legacy tool identifiers
(`deploy_to_zaodeploy`, `list_zaodeploy_apps`, and related names) remain available during the
brand migration. Unless the owner names another platform,
“部署这个应用” means deployment to the owner's EZdeploy personal application center.

The Gateway never receives the Cloudflare account token or model-provider token. The online
control plane never executes arbitrary project build commands.

Employees normally issue and revoke their own connection Keys from the application center.
Only the returned plaintext Key is shown; D1 stores its SHA-256 hash. Owner checks protect
deployment details, logs, rollback, and deletion. The administrative token endpoints remain
available for managed provisioning and incident response.

## Verification

Run the permission and connectivity preflight:

```bash
npm run preflight:cloudflare
```

Run the real destructive smoke test with a unique temporary application:

```bash
ZAODEPLOY_CONTROL_PLANE_URL=https://zaodeploy-control-plane.example.workers.dev \
ZAODEPLOY_CONTROL_PLANE_TOKEN='<personal owner token>' \
CF_ACCESS_CLIENT_ID='<service client id>' \
CF_ACCESS_CLIENT_SECRET='<service client secret>' \
CLOUDFLARE_ACCESS_GROUP_ID='<employee Access group id>' \
npm run smoke:cloudflare
```

The smoke test covers D1, R2, an actual `default-chat` request, Access rejection, redeploy
resource reuse, failed-release isolation, structured logs, rollback, and deletion cleanup.

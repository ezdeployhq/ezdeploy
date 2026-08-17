interface Env {
  CONTROL_PLANE: Fetcher;
  ASSETS: Fetcher;
  APP_CENTER_URL?: string;
}

const headers = {
  "cache-control": "no-store",
  "x-content-type-options": "nosniff",
};

function agentMarkdown(request: Request, env: Env) {
  const origin = new URL(request.url).origin;
  return `# EZdeploy Agent Deployment Guide

EZdeploy is this organization's application deployment center. When a user asks to deploy,
publish, or release the current project without naming another provider, deploy it to
EZdeploy and return the verified application URL.

## Required two-phase workflow

The user will provide a one-time code in the form \`ZAO-XXXX-XXXX\`.

Do not deploy immediately. First inspect the project, create or update \`ezdeploy.yaml\`, and
generate a plan without consuming the code:

\`\`\`http
POST ${origin}/v1/connect/plan
Content-Type: application/json

{"code":"ZAO-XXXX-XXXX","manifest":{...contents of normalized ezdeploy.yaml...}}
\`\`\`

Show the returned application, runtime, resources, access mode, risks, and health check to
the user. Stop and wait for explicit confirmation. Do not treat the original request to
deploy as confirmation of a plan the user has not seen.

After confirmation, validate and build the project locally first. Only after the local build
succeeds, exchange the same code for a twelve-hour scoped session and deploy with the exact
returned \`planDigest\`. The connection code is consumed only at exchange time, so local build
errors do not waste it.
The returned \`connectionKey\` is a short-lived secret. Keep it only in process memory or a
temporary environment variable. Never write it to the repository, chat response, build
output, or application bundle.

## Zero-install execution

If a EZdeploy MCP connection is already available, use it. Otherwise download the temporary
standalone client into an operating-system temporary directory; no installation is required:

\`\`\`bash
ZAO_TMP="$(mktemp -d)"
curl -fsSL ${origin}/client/ezdeploy-agent.cjs -o "$ZAO_TMP/ezdeploy-agent.cjs"
curl -fsSL ${origin}/client/blake3_js_bg.wasm -o "$ZAO_TMP/blake3_js_bg.wasm"
curl -fsSL ${origin}/client/manifest.json -o "$ZAO_TMP/manifest.json"
node -e 'const fs=require("fs"),c=require("crypto"),p=process.argv[1],m=require(p+"/manifest.json");for(const [f,x] of Object.entries(m.files)){const b=fs.readFileSync(p+"/"+f),h=c.createHash("sha256").update(b).digest("hex");if(h!==x.sha256||b.length!==x.bytes)throw Error("EZdeploy client integrity check failed: "+f)}' "$ZAO_TMP"
node "$ZAO_TMP/ezdeploy-agent.cjs" plan --api-url ${origin} --connect-code ZAO-XXXX-XXXX
# Show the plan and wait for explicit user confirmation.
node "$ZAO_TMP/ezdeploy-agent.cjs" deploy --api-url ${origin} \\
  --connect-code ZAO-XXXX-XXXX --plan-digest <confirmed-planDigest>
\`\`\`

Delete the temporary directory after deployment. Supported runtimes are \`static\`, \`vite\`,
and \`cloudflare-workers\`. Declare database, storage, or AI only when the application needs
them. Browser code must never receive provider keys; database, storage, and AI access belongs
in Pages Functions or Workers.

The deployment client builds locally with an isolated environment, uploads a filtered
prebuilt bundle, polls structured deployment state, and exits only when the deployment is
\`ready\`. On failure, read structured logs, make an in-scope correction, and retry once.

Success requires a healthy URL, normally under the organization's configured application domain. Do not report a
provider deployment ID or queued state as success.

Application center: ${env.APP_CENTER_URL ?? "https://apps.example.com"}
Capability document: ${origin}/.well-known/ezdeploy.json
OpenAPI document: ${origin}/openapi.json
`;
}

function openApiDocument(origin: string) {
  return {
    openapi: "3.1.0",
    info: {
      title: "EZdeploy Agent API",
      version: "1.1.0",
      description: "Two-phase, zero-install personal application deployment protocol",
    },
    servers: [{ url: origin }],
    paths: {
      "/v1/connect/plan": {
        post: {
          summary: "Preview a deployment plan without consuming the one-time code",
          security: [],
        },
      },
      "/v1/connect/exchange": {
        post: {
          summary: "Exchange the code once for a scoped one-hour session",
          security: [],
        },
      },
      "/v1/plan": { post: { summary: "Generate an authenticated deployment plan" } },
      "/v1/deployments": {
        post: {
          summary: "Upload a bundle matching a user-confirmed planDigest",
          parameters: [{
            name: "x-zaodeploy-plan-digest",
            in: "header",
            required: true,
            schema: { type: "string", pattern: "^[a-f0-9]{64}$" },
          }],
        },
      },
      "/v1/deployments/{id}": { get: { summary: "Read structured deployment state" } },
      "/v1/deployments/{id}/logs": { get: { summary: "Read build and runtime events" } },
      "/v1/apps": { get: { summary: "List applications owned by the administrator" } },
    },
    components: {
      securitySchemes: {
        bearerAuth: { type: "http", scheme: "bearer", bearerFormat: "zao_" },
      },
    },
    security: [{ bearerAuth: [] }],
  };
}

export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    const url = new URL(request.url);
    if (request.method === "GET" && url.pathname === "/health") {
      return Response.json(
        { status: "ok", service: "zaodeploy-agent-ingress" },
        { headers },
      );
    }
    if (
      request.method === "GET" &&
      ["/agent", "/agent.md", "/agents.md", "/skill.md", "/auth.md"].includes(url.pathname)
    ) {
      return new Response(agentMarkdown(request, env), {
        headers: { ...headers, "content-type": "text/markdown; charset=utf-8" },
      });
    }
    if (request.method === "GET" && url.pathname === "/llms.txt") {
      return new Response([
        "# EZdeploy",
        "",
        `- Canonical Agent workflow: ${url.origin}/agent.md`,
        `- Capability discovery: ${url.origin}/.well-known/ezdeploy.json`,
        `- OpenAPI: ${url.origin}/openapi.json`,
        `- Application center: ${env.APP_CENTER_URL ?? "https://apps.example.com"}`,
      ].join("\n"), {
        headers: { ...headers, "content-type": "text/plain; charset=utf-8" },
      });
    }
    if (request.method === "GET" && url.pathname === "/openapi.json") {
      return Response.json(openApiDocument(url.origin), { headers });
    }
    if (
      request.method === "GET" &&
      ["/.well-known/ezdeploy.json", "/.well-known/zaodeploy.json"].includes(url.pathname)
    ) {
      const origin = url.origin;
      return Response.json({
        schemaVersion: "1.1",
        name: "EZdeploy",
        description: "Zero-install personal application deployment center",
        documentation: `${origin}/agent.md`,
        connect: {
          planEndpoint: `${origin}/v1/connect/plan`,
          endpoint: `${origin}/v1/connect/exchange`,
          codeFormat: "ZAO-XXXX-XXXX",
          singleUse: true,
          expiresInSeconds: 600,
        },
        deployment: {
          apiBaseUrl: origin,
          standaloneClient: {
            script: `${origin}/client/ezdeploy-agent.cjs`,
            wasm: `${origin}/client/blake3_js_bg.wasm`,
            manifest: `${origin}/client/manifest.json`,
            runtime: "node>=22",
          },
          supportedRuntimes: ["static", "vite", "cloudflare-workers"],
          resourceKinds: ["database", "storage", "ai"],
          successState: "ready",
          requiresPlanConfirmation: true,
          planDigestHeader: "x-zaodeploy-plan-digest",
        },
      }, { headers });
    }
    if (request.method === "GET" && url.pathname.startsWith("/client/")) {
      if (url.pathname === "/client/zaodeploy-agent.cjs") {
        url.pathname = "/client/ezdeploy-agent.cjs";
        return env.ASSETS.fetch(new Request(url, request));
      }
      return env.ASSETS.fetch(request);
    }
    if (!url.pathname.startsWith("/v1/")) {
      return Response.json(
        { error: { code: "NOT_FOUND", message: "Agent API route not found" } },
        { status: 404, headers },
      );
    }
    if (
      request.method === "POST" &&
      ["/v1/connect/plan", "/v1/connect/exchange"].includes(url.pathname)
    ) {
      const forwardedHeaders = new Headers(request.headers);
      forwardedHeaders.delete("authorization");
      forwardedHeaders.set("x-zaodeploy-agent-ingress", "1");
      return env.CONTROL_PLANE.fetch(new Request(request, { headers: forwardedHeaders }));
    }
    const authorization = request.headers.get("authorization");
    if (!authorization?.startsWith("Bearer zao_")) {
      return Response.json(
        { error: { code: "UNAUTHORIZED", message: "Valid EZdeploy connection key required" } },
        { status: 401, headers },
      );
    }
    const forwardedHeaders = new Headers(request.headers);
    forwardedHeaders.delete("cf-access-client-id");
    forwardedHeaders.delete("cf-access-client-secret");
    forwardedHeaders.set("x-zaodeploy-agent-ingress", "1");
    return env.CONTROL_PLANE.fetch(new Request(request, {
      headers: forwardedHeaders,
    }));
  },
} satisfies ExportedHandler<Env>;

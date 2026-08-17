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

EZdeploy is the user's personal application deployment center. Treat “部署到应用中心”,
“发布到 EZdeploy”, “上线这个应用”, and “部署这个项目” as triggers when no other provider
is named. Install the Skill and authorize once; later deployments reuse the saved key.

## Install once

Canonical Skill: ${origin}/skill/ezdeploy-deploy/SKILL.md

\`\`\`bash
SKILL_DIR="\${CODEX_HOME:-$HOME/.codex}/skills/ezdeploy-deploy"
mkdir -p "$SKILL_DIR/agents"
curl -fsSL ${origin}/skill/ezdeploy-deploy/SKILL.md -o "$SKILL_DIR/SKILL.md"
curl -fsSL ${origin}/skill/ezdeploy-deploy/agents/openai.yaml -o "$SKILL_DIR/agents/openai.yaml"
\`\`\`

Store the long-lived key from the center's **部署设置** page in
\`\${XDG_CONFIG_HOME:-$HOME/.config}/ezdeploy/credentials.json\` with mode \`0600\`:

\`\`\`json
{"apiUrl":"${origin}","connectionKey":"zao_..."}
\`\`\`

If the Skill and a working key already exist, do not reinstall or ask the user to authorize
again. Ask for a replacement only after a 401/403 response. Never expose the key in a project,
application bundle, logs, command output, or final response.

## Confirm, then deploy

Inspect the project and create or update \`ezdeploy.yaml\`. Download the standalone client
into a temporary directory and verify its SHA-256 hashes and byte sizes against the manifest:

\`\`\`bash
ZAO_TMP="$(mktemp -d)"
curl -fsSL ${origin}/client/ezdeploy-agent.cjs -o "$ZAO_TMP/ezdeploy-agent.cjs"
curl -fsSL ${origin}/client/blake3_js_bg.wasm -o "$ZAO_TMP/blake3_js_bg.wasm"
curl -fsSL ${origin}/client/manifest.json -o "$ZAO_TMP/manifest.json"
node -e 'const fs=require("fs"),c=require("crypto"),p=process.argv[1],m=require(p+"/manifest.json");for(const [f,x] of Object.entries(m.files)){const b=fs.readFileSync(p+"/"+f),h=c.createHash("sha256").update(b).digest("hex");if(h!==x.sha256||b.length!==x.bytes)throw Error("EZdeploy client integrity check failed: "+f)}' "$ZAO_TMP"
KEY="$(node -e 'const fs=require("fs"),p=(process.env.XDG_CONFIG_HOME||require("os").homedir()+"/.config")+"/ezdeploy/credentials.json";process.stdout.write(JSON.parse(fs.readFileSync(p)).connectionKey)')"
node "$ZAO_TMP/ezdeploy-agent.cjs" plan --api-url ${origin} --connection-key "$KEY"
# Show the plan. Wait for explicit user confirmation, then use its exact digest.
node "$ZAO_TMP/ezdeploy-agent.cjs" deploy --api-url ${origin} \\
  --connection-key "$KEY" --plan-digest <confirmed-planDigest>
rm -rf "$ZAO_TMP"
\`\`\`

Show application, runtime, resources, access, risks, and health check before confirmation.
Success requires \`ready\` plus a healthy application URL. Never report queued state or a
provider deployment ID as success. Supported runtimes: \`static\`, \`vite\`, \`cloudflare-workers\`.

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
      version: "1.2.0",
      description: "Persistent-key, Skill-driven personal application deployment protocol",
    },
    servers: [{ url: origin }],
    paths: {
      "/v1/connect/plan": {
        post: {
          summary: "Legacy: preview a deployment plan with a one-time code",
          security: [],
        },
      },
      "/v1/connect/exchange": {
        post: {
          summary: "Legacy: exchange a one-time code for a scoped session",
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
        { status: "ok", service: "ezdeploy-agent-ingress" },
        { headers },
      );
    }
    if (
      request.method === "GET" &&
      ["/agent", "/agent.md", "/agents.md", "/auth.md"].includes(url.pathname)
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
        `- Installable deployment Skill: ${url.origin}/skill/ezdeploy-deploy/SKILL.md`,
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
        schemaVersion: "1.2",
        name: "EZdeploy",
        description: "Install-once personal application deployment center",
        documentation: `${origin}/agent.md`,
        skill: `${origin}/skill/ezdeploy-deploy/SKILL.md`,
        authentication: {
          type: "bearer",
          keyPrefix: "zao_",
          persistent: true,
          revocable: true,
        },
        legacyConnect: {
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
    if (request.method === "GET" && url.pathname === "/skill.md") {
      url.pathname = "/skill/ezdeploy-deploy/SKILL.md";
      return env.ASSETS.fetch(new Request(url, request));
    }
    if (request.method === "GET" && url.pathname.startsWith("/skill/")) {
      return env.ASSETS.fetch(request);
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

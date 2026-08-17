#!/usr/bin/env node
import path from "node:path";
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { z } from "zod";
import type { Deployment, EZdeployManifest } from "@ezdeploy/contracts";
import { EZdeployError } from "@ezdeploy/contracts";
import {
  ControlPlaneRepository,
  DeploymentOrchestrator,
  createProviderFromEnvironment,
  type DeployApplicationInput,
  type DeployApplicationResult,
  type DeploymentPlan,
} from "@ezdeploy/core";
import { RemoteDeploymentService } from "./remote-service.js";

export interface DeploymentService {
  inspect(projectDirectory: string): Promise<EZdeployManifest>;
  plan(projectDirectory: string): Promise<DeploymentPlan>;
  deploy(input: DeployApplicationInput): Promise<DeployApplicationResult>;
  getDeployment(id: string): Deployment | Promise<Deployment>;
  listApplications(): unknown | Promise<unknown>;
  rollbackDeployment(id: string): unknown | Promise<unknown>;
  getLogs(id: string): unknown | Promise<unknown>;
  deleteDeployment(id: string, removeResources?: boolean): unknown | Promise<unknown>;
}

function jsonContent(value: unknown) {
  return [{ type: "text" as const, text: JSON.stringify(value, null, 2) }];
}

function toolError(error: unknown) {
  const structured =
    error instanceof EZdeployError
      ? { code: error.code, message: error.message, details: error.details }
      : {
          code: "INTERNAL_ERROR",
          message: error instanceof Error ? error.message : String(error),
        };
  return { isError: true as const, content: jsonContent(structured) };
}

export function createServer(
  orchestrator: DeploymentService,
  options: { ownerIdRequired?: boolean } = {},
): McpServer {
  const server = new McpServer(
    { name: "zaodeploy-enterprise-app-center", version: "0.2.0" },
    {
      instructions: [
        "This MCP is the deployment interface for the EZdeploy enterprise application center.",
        "When the user says '部署这个应用', '发布这个项目', or an equivalent phrase without naming another platform, interpret the deployment target as EZdeploy and use this MCP.",
        "Do not substitute Vercel, a direct Cloudflare CLI deployment, or a local preview unless the user explicitly names that target.",
        "When the user asks to deploy or publish the current application, inspect its files and ensure ezdeploy.yaml exists.",
        "If it is missing, create it in the project with apiVersion ezdeploy.io/v1alpha1, kind Application, a DNS-safe metadata.name, and one supported runtime: static, vite, or cloudflare-workers.",
        "For Vite use buildCommand 'npm run build' and outputDirectory 'dist'; for static content publish a dedicated directory, never the repository root.",
        "Declare database, storage, or ai resources only when requested or required by the code. Keep D1, R2, and AI access in server-side Pages Functions or Workers, never browser code.",
        "Call inspect_zaodeploy_project, then plan_zaodeploy_deployment, explain the plan briefly, and call deploy_to_zaodeploy only for an explicit deployment request.",
        "Report success only when deploy_to_zaodeploy returns status ready and a non-empty URL. On failure call get_zaodeploy_logs before attempting an in-scope correction.",
        "Never request or expose Cloudflare or model-provider master credentials; the control plane owns them.",
      ].join(" "),
    },
  );

  server.registerTool(
    "inspect_zaodeploy_project",
    {
      title: "Inspect EZdeploy project",
      description: "Validate and return the ezdeploy.yaml manifest before planning a deployment.",
      inputSchema: { projectDirectory: z.string().min(1) },
      annotations: { readOnlyHint: true, destructiveHint: false },
    },
    async ({ projectDirectory }) => {
      try {
        return { content: jsonContent(await orchestrator.inspect(projectDirectory)) };
      } catch (error) {
        return toolError(error);
      }
    },
  );

  server.registerTool(
    "plan_zaodeploy_deployment",
    {
      title: "Plan application deployment",
      description:
        "Generate a provider and resource plan without creating external resources or changing deployment state.",
      inputSchema: { projectDirectory: z.string().min(1) },
      annotations: { readOnlyHint: true, destructiveHint: false },
    },
    async ({ projectDirectory }) => {
      try {
        return { content: jsonContent(await orchestrator.plan(projectDirectory)) };
      } catch (error) {
        return toolError(error);
      }
    },
  );

  server.registerTool(
    "deploy_to_zaodeploy",
    {
      title: "Deploy to EZdeploy enterprise app center",
      description:
        "Deploy specifically to the EZdeploy enterprise app center, provision declared resources, verify health, register the application in the catalog, and return the live URL.",
      inputSchema: {
        projectDirectory: z.string().min(1),
        ownerId: options.ownerIdRequired === false
          ? z.string().min(1).optional()
          : z.string().min(1),
        environment: z.string().min(1).default("production"),
      },
      annotations: { readOnlyHint: false, destructiveHint: false, idempotentHint: true },
    },
    async ({ projectDirectory, ownerId, environment }) => {
      try {
        return {
          content: jsonContent(
            await orchestrator.deploy({
              projectDirectory,
              ownerId: ownerId ?? "authenticated-remote-principal",
              environment,
            }),
          ),
        };
      } catch (error) {
        return toolError(error);
      }
    },
  );

  server.registerTool(
    "get_zaodeploy_deployment",
    {
      title: "Get deployment status",
      description: "Return the persisted state and live URL for one deployment.",
      inputSchema: { deploymentId: z.string().uuid() },
      annotations: { readOnlyHint: true, destructiveHint: false },
    },
    async ({ deploymentId }) => {
      try {
        return { content: jsonContent(await orchestrator.getDeployment(deploymentId)) };
      } catch (error) {
        return toolError(error);
      }
    },
  );

  server.registerTool(
    "list_zaodeploy_apps",
    {
      title: "List application center entries",
      description: "List applications and their currently active healthy deployment URLs.",
      inputSchema: {},
      annotations: { readOnlyHint: true, destructiveHint: false },
    },
    async () => ({ content: jsonContent(await orchestrator.listApplications()) }),
  );

  server.registerTool(
    "rollback_zaodeploy_app",
    {
      title: "Restore a healthy deployment",
      description: "Restore an earlier healthy deployment artifact and make it active.",
      inputSchema: { deploymentId: z.string().uuid() },
      annotations: { readOnlyHint: false, destructiveHint: true, idempotentHint: true },
    },
    async ({ deploymentId }) => {
      try {
        return { content: jsonContent(await orchestrator.rollbackDeployment(deploymentId)) };
      } catch (error) {
        return toolError(error);
      }
    },
  );

  server.registerTool(
    "get_zaodeploy_logs",
    {
      title: "Get deployment logs",
      description: "Return structured control-plane events and provider logs for one deployment.",
      inputSchema: { deploymentId: z.string().uuid() },
      annotations: { readOnlyHint: true, destructiveHint: false },
    },
    async ({ deploymentId }) => {
      try {
        return { content: jsonContent(await orchestrator.getLogs(deploymentId)) };
      } catch (error) {
        return toolError(error);
      }
    },
  );

  server.registerTool(
    "delete_zaodeploy_app",
    {
      title: "Delete application",
      description:
        "Delete the application environment and archive all of its releases; explicitly retain or remove its database, storage, and AI resources.",
      inputSchema: {
        deploymentId: z.string().uuid(),
        removeResources: z.boolean().default(false),
      },
      annotations: { readOnlyHint: false, destructiveHint: true, idempotentHint: false },
    },
    async ({ deploymentId, removeResources }) => {
      try {
        return {
          content: jsonContent(
            await orchestrator.deleteDeployment(deploymentId, removeResources),
          ),
        };
      } catch (error) {
        return toolError(error);
      }
    },
  );

  return server;
}

export { createProviderFromEnvironment } from "@ezdeploy/core";

async function main(): Promise<void> {
  const connectionKey = process.env.ZAODEPLOY_CONNECTION_KEY;
  const remoteBaseUrl = process.env.ZAODEPLOY_CONTROL_PLANE_URL
    ?? (connectionKey ? "https://deploy.apps.example.com" : undefined);
  const remoteToken = connectionKey ?? process.env.ZAODEPLOY_CONTROL_PLANE_TOKEN ?? "";
  const databasePath = path.resolve(
    process.env.ZAODEPLOY_DATABASE_PATH ?? ".zaodeploy/control-plane.db",
  );
  const repository = remoteBaseUrl
    ? undefined
    : new ControlPlaneRepository(databasePath);
  const service: DeploymentService = remoteBaseUrl
    ? new RemoteDeploymentService({
      baseUrl: remoteBaseUrl,
      token: remoteToken,
      accessClientId: connectionKey ? undefined : process.env.ZAODEPLOY_ACCESS_CLIENT_ID,
      accessClientSecret: connectionKey ? undefined : process.env.ZAODEPLOY_ACCESS_CLIENT_SECRET,
      cloudBundle: connectionKey ? true : undefined,
    })
    : new DeploymentOrchestrator(repository!, createProviderFromEnvironment());
  const server = createServer(service, {
    ownerIdRequired: !remoteBaseUrl,
  });

  const shutdown = async () => {
    await server.close();
    repository?.close();
  };
  process.once("SIGINT", shutdown);
  process.once("SIGTERM", shutdown);

  await server.connect(new StdioServerTransport());
}

if (import.meta.url === `file://${process.argv[1]}`) {
  main().catch((error) => {
    console.error(error);
    process.exitCode = 1;
  });
}

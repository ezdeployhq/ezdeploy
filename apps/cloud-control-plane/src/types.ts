export interface Asset { path: string; hash: string; contentType: string; base64: string }
export interface Manifest {
  apiVersion: "ezdeploy.io/v1alpha1" | "zaodeploy.io/v1alpha1";
  kind: "Application";
  metadata: { name: string; displayName?: string; description?: string };
  spec: {
    runtime: "static" | "vite" | "cloudflare-workers";
    buildCommand?: string;
    outputDirectory?: string;
    resources: Array<{
      kind: "database" | "storage" | "ai";
      provider?: string;
      plan?: string;
      migrationsDirectory?: string;
    }>;
    access: { mode: "public" | "organization"; allowedGroups: string[] };
    healthCheck: { path: string; timeoutSeconds: number; expectedJson?: Record<string, string | number | boolean> };
  };
}
export interface DeploymentBundle {
  version: 1;
  manifest: Manifest;
  assets: Asset[];
  workerScript?: string;
  routes?: string;
  headers?: string;
  redirects?: string;
  migrations: Array<{ name: string; sql: string }>;
}
export interface Environment {
  DB: D1Database;
  SOURCES: R2Bucket;
  DEPLOY_WORKFLOW: Workflow<{ deploymentId: string }>;
  CLOUDFLARE_ACCOUNT_ID: string;
  CLOUDFLARE_ZONE_ID?: string;
  CLOUDFLARE_API_TOKEN: string;
  AI_PROXY_URL: string;
  AI_CONTROL_TOKEN: string;
  AI_DAILY_REQUEST_BUDGET?: string;
  CONTROL_PLANE_TOKEN: string;
  EMPLOYEE_OWNER_ID: string;
  ACCESS_ENABLED?: string;
  ACCESS_GROUP_ID: string;
  ACCESS_SERVICE_TOKEN_ID: string;
  ACCESS_CLIENT_ID: string;
  ACCESS_CLIENT_SECRET: string;
  APP_CENTER_URL: string;
  APPLICATION_DOMAIN_SUFFIX?: string;
}
export interface CloudResource {
  id: string;
  kind: "database" | "storage" | "ai";
  external_id: string;
  configuration_json: string;
}

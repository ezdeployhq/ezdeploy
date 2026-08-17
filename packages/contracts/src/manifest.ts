import { readFile } from "node:fs/promises";
import path from "node:path";
import { parse as parseYaml } from "yaml";
import { z } from "zod";

export const runtimeSchema = z.enum([
  "static",
  "vite",
  "cloudflare-workers",
]);

export const resourceKindSchema = z.enum(["database", "storage", "ai"]);

export const resourceRequestSchema = z.object({
  kind: resourceKindSchema,
  provider: z.string().min(1).optional(),
  plan: z.string().min(1).default("default"),
  migrationsDirectory: z.string().min(1).optional(),
});

export const accessSchema = z
  .object({
    mode: z.enum(["public", "organization"]).default("public"),
    allowedGroups: z.array(z.string().min(1)).default([]),
  })
  .default({ mode: "public", allowedGroups: [] });

export const healthCheckSchema = z
  .object({
    path: z.string().startsWith("/").default("/"),
    timeoutSeconds: z.number().int().positive().max(60).default(10),
    expectedJson: z.record(z.union([z.string(), z.number(), z.boolean()])).optional(),
  })
  .default({ path: "/", timeoutSeconds: 10 });

export const supportedManifestApiVersions = [
  "ezdeploy.io/v1alpha1",
  "zaodeploy.io/v1alpha1",
] as const;

export const ezDeployManifestSchema = z.object({
  apiVersion: z.enum(supportedManifestApiVersions),
  kind: z.literal("Application"),
  metadata: z.object({
    name: z
      .string()
      .min(2)
      .max(63)
      .regex(/^[a-z][a-z0-9-]*[a-z0-9]$/, "must be a DNS-compatible name"),
    displayName: z.string().min(1).max(100).optional(),
    description: z.string().max(500).optional(),
  }),
  spec: z.object({
    runtime: runtimeSchema,
    buildCommand: z.string().min(1).optional(),
    outputDirectory: z.string().min(1).optional(),
    resources: z.array(resourceRequestSchema).default([]),
    access: accessSchema,
    healthCheck: healthCheckSchema,
  }),
}).superRefine((manifest, context) => {
  const kinds = manifest.spec.resources.map((resource) => resource.kind);
  if (new Set(kinds).size !== kinds.length) {
    context.addIssue({
      code: z.ZodIssueCode.custom,
      path: ["spec", "resources"],
      message: "resource kinds must be unique",
    });
  }
  manifest.spec.resources.forEach((resource, index) => {
    if (resource.migrationsDirectory && resource.kind !== "database") {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["spec", "resources", index, "migrationsDirectory"],
        message: "migrationsDirectory is only valid for database resources",
      });
    }
  });
  if (
    manifest.spec.runtime === "static" &&
    (!manifest.spec.outputDirectory || [".", "./"].includes(manifest.spec.outputDirectory))
  ) {
    context.addIssue({
      code: z.ZodIssueCode.custom,
      path: ["spec", "outputDirectory"],
      message: "static applications require a dedicated outputDirectory",
    });
  }
});

/** @deprecated Use ezDeployManifestSchema. Kept for source compatibility. */
export const zaoDeployManifestSchema = ezDeployManifestSchema;

export type EZdeployManifest = z.infer<typeof ezDeployManifestSchema>;
export type Runtime = z.infer<typeof runtimeSchema>;
export type ResourceKind = z.infer<typeof resourceKindSchema>;

export async function loadManifest(projectDirectory: string): Promise<EZdeployManifest> {
  let source: string;
  try {
    source = await readFile(path.join(projectDirectory, "ezdeploy.yaml"), "utf8");
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code !== "ENOENT") throw error;
    source = await readFile(path.join(projectDirectory, "zaodeploy.yaml"), "utf8");
  }
  return ezDeployManifestSchema.parse(parseYaml(source));
}

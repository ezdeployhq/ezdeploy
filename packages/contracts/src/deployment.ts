import { z } from "zod";
import { resourceKindSchema, runtimeSchema } from "./manifest.js";

export const deploymentStatusSchema = z.enum([
  "queued",
  "inspecting",
  "planned",
  "provisioning",
  "deploying",
  "verifying",
  "ready",
  "failed",
  "deleting",
  "deleted",
]);

export type DeploymentStatus = z.infer<typeof deploymentStatusSchema>;

export const applicationSchema = z.object({
  id: z.string().uuid(),
  slug: z.string(),
  displayName: z.string(),
  ownerId: z.string(),
  createdAt: z.string().datetime(),
  updatedAt: z.string().datetime(),
});

export const environmentSchema = z.object({
  id: z.string().uuid(),
  applicationId: z.string().uuid(),
  name: z.string(),
  provider: z.string(),
  createdAt: z.string().datetime(),
});

export const deploymentSchema = z.object({
  id: z.string().uuid(),
  applicationId: z.string().uuid(),
  environmentId: z.string().uuid(),
  sequence: z.number().int().positive(),
  status: deploymentStatusSchema,
  runtime: runtimeSchema,
  sourceDirectory: z.string(),
  manifestDigest: z.string(),
  providerDeploymentId: z.string().nullable(),
  url: z.string().url().nullable(),
  errorCode: z.string().nullable(),
  errorMessage: z.string().nullable(),
  createdAt: z.string().datetime(),
  updatedAt: z.string().datetime(),
});

export const resourceBindingSchema = z.object({
  id: z.string().uuid(),
  applicationId: z.string().uuid(),
  environmentId: z.string().uuid(),
  kind: resourceKindSchema,
  provider: z.string(),
  externalId: z.string(),
  secretReference: z.string(),
  configuration: z.record(z.string()).default({}),
  createdAt: z.string().datetime(),
});

export const accessPolicySchema = z.object({
  id: z.string().uuid(),
  applicationId: z.string().uuid(),
  environmentId: z.string().uuid(),
  mode: z.enum(["public", "organization"]),
  allowedGroups: z.array(z.string()),
  createdAt: z.string().datetime(),
  updatedAt: z.string().datetime(),
});

export type Application = z.infer<typeof applicationSchema>;
export type Environment = z.infer<typeof environmentSchema>;
export type Deployment = z.infer<typeof deploymentSchema>;
export type ResourceBinding = z.infer<typeof resourceBindingSchema>;
export type AccessPolicy = z.infer<typeof accessPolicySchema>;

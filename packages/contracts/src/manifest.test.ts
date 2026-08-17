import { describe, expect, it } from "vitest";
import { ezDeployManifestSchema, zaoDeployManifestSchema } from "./manifest.js";

describe("EZdeploy manifest", () => {
  it("applies safe defaults", () => {
    const manifest = zaoDeployManifestSchema.parse({
      apiVersion: "ezdeploy.io/v1alpha1",
      kind: "Application",
      metadata: { name: "hello-app" },
      spec: { runtime: "vite" },
    });

    expect(manifest.spec.resources).toEqual([]);
    expect(manifest.spec.access).toEqual({ mode: "public", allowedGroups: [] });
    expect(manifest.spec.healthCheck.path).toBe("/");
  });

  it("accepts the legacy API version during the rename transition", () => {
    const manifest = zaoDeployManifestSchema.parse({
      apiVersion: "zaodeploy.io/v1alpha1",
      kind: "Application",
      metadata: { name: "legacy-app" },
      spec: { runtime: "vite" },
    });

    expect(manifest.apiVersion).toBe("zaodeploy.io/v1alpha1");
  });

  it("rejects names that cannot be used in application URLs", () => {
    const result = ezDeployManifestSchema.safeParse({
      apiVersion: "ezdeploy.io/v1alpha1",
      kind: "Application",
      metadata: { name: "Hello App" },
      spec: { runtime: "vite" },
    });

    expect(result.success).toBe(false);
  });
});

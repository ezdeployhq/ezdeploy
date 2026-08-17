import type { AddressInfo } from "node:net";
import { afterEach, describe, expect, it } from "vitest";
import { ControlPlaneRepository } from "@ezdeploy/core";
import { createAppCenterServer } from "./server.js";

describe("app center", () => {
  const cleanups: Array<() => void> = [];
  afterEach(() => cleanups.splice(0).forEach((cleanup) => cleanup()));

  it("serves the catalog only to an authenticated employee", async () => {
    const repository = new ControlPlaneRepository(":memory:");
    const application = repository.upsertApplication("expenses", "Expenses", "owner@example.com");
    repository.upsertEnvironment(application.id, "production", "mock");
    const server = createAppCenterServer(repository, { apiToken: "employee-token" });
    await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
    cleanups.push(() => { server.close(); repository.close(); });
    const port = (server.address() as AddressInfo).port;

    const page = await (await fetch(`http://127.0.0.1:${port}/`)).text();
    expect(page).toContain("访问：");
    expect(page).toContain("recentDeployments.slice(0,5)");
    expect((await fetch(`http://127.0.0.1:${port}/api/apps`)).status).toBe(401);
    const response = await fetch(`http://127.0.0.1:${port}/api/apps`, {
      headers: { authorization: "Bearer employee-token" },
    });
    expect(response.status).toBe(200);
    expect(await response.json()).toMatchObject([
      {
        application: { slug: "expenses" },
        environment: { name: "production" },
        recentDeployments: [],
      },
    ]);
  });
});

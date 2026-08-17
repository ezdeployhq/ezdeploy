import { describe, expect, it } from "vitest";
import { buildAgentPrompt, buildPersistentAgentPrompt, createConnectCode } from "./index.js";

describe("zero-install application center onboarding", () => {
  it("creates human-readable single-use code shapes", () => {
    expect(createConnectCode()).toMatch(/^ZAO-[A-Z2-9]{4}-[A-Z2-9]{4}$/);
  });

  it("produces a provider-neutral prompt without a local installation path", () => {
    const prompt = buildAgentPrompt("ZAO-ABCD-2345", {
      AGENT_GATEWAY_URL: "https://agent.apps.example.com",
    });
    expect(prompt).toContain("https://agent.apps.example.com/agent.md");
    expect(prompt).toContain("ZAO-ABCD-2345");
    expect(prompt).toContain("确认后");
    expect(prompt).not.toContain("/Users/");
    expect(prompt).not.toContain("codex mcp add");
    expect(prompt).not.toContain("ZAODEPLOY_CONNECTION_KEY");
  });

  it("produces a reusable Skill installation prompt for a persistent key", () => {
    const prompt = buildPersistentAgentPrompt("zao_personal_long_lived_key", {
      AGENT_GATEWAY_URL: "https://deploy.apps.example.com",
    });
    expect(prompt).toContain("https://deploy.apps.example.com/agent.md");
    expect(prompt).toContain("https://deploy.apps.example.com/skill/ezdeploy-deploy/SKILL.md");
    expect(prompt).toContain("zao_personal_long_lived_key");
    expect(prompt).toContain("部署到应用中心");
    expect(prompt).toContain("用户级凭证目录");
    expect(prompt).not.toContain("一次性");
  });
});

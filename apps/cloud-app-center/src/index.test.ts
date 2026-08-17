import { describe, expect, it } from "vitest";
import { buildAgentPrompt, buildPersistentAgentPrompt, createConnectCode } from "./index.js";
import { applicationPage, applicationPageFor, authPage, landingPageFor } from "./ui.js";

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

  it("uses the same orange workspace system across admin surfaces", () => {
    expect(applicationPage).toContain("EZdeploy unified workspace");
    expect(applicationPage).toContain("--orange:#f6821f");
    expect(applicationPage).toContain("DEPLOYMENT ACCESS");
    expect(applicationPage).toContain("MODEL ROUTING");
    expect(authPage("login")).toContain("EZdeploy product system");
    expect(authPage("setup")).toContain("PERSONAL CONTROL PLANE");
  });

  it("renders complete English routes without changing shared API paths", () => {
    const landing = landingPageFor("en");
    const login = authPage("login", "en");
    const center = applicationPageFor("en");
    expect(landing).toContain('<html lang="en">');
    expect(landing).toContain("Deploy with one sentence");
    expect(landing).toContain('href="/en/center"');
    expect(login).toContain("Administrator sign in");
    expect(login).toContain("location.href='/en/center'");
    expect(center).toContain("My apps");
    expect(center).toContain('href="/en/deploy"');
    expect(center).toContain("fetch('/api/apps')");
    expect(center).toContain("locale:'en'");
  });

  it("produces an English persistent Skill prompt", () => {
    const prompt = buildPersistentAgentPrompt("zao_english_key", {
      AGENT_GATEWAY_URL: "https://deploy.apps.example.com",
    }, "en");
    expect(prompt).toContain("deploy to my app center");
    expect(prompt).toContain("user-level credentials directory");
    expect(prompt).toContain("zao_english_key");
    expect(prompt).not.toContain("部署到应用中心");
  });
});

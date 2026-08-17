import { describe, expect, it } from "vitest";
import { derivePasswordHash, requestHasSameOrigin, validateCredentials } from "./auth.js";

describe("personal administrator authentication", () => {
  it("derives stable, salted password hashes", async () => {
    const salt = "MDEyMzQ1Njc4OWFiY2RlZg";
    const first = await derivePasswordHash("a-long-private-password", salt, 1_000);
    const second = await derivePasswordHash("a-long-private-password", salt, 1_000);
    const different = await derivePasswordHash("another-private-password", salt, 1_000);
    expect(first).toBe(second);
    expect(first).not.toBe(different);
    expect(first).not.toContain("a-long-private-password");
  });

  it("validates administrator credential shape", () => {
    expect(validateCredentials("owner", "correct-horse-battery")).toBeNull();
    expect(validateCredentials("x", "correct-horse-battery")).toMatch(/3–48/);
    expect(validateCredentials("owner", "short")).toMatch(/10–200/);
  });

  it("requires same-origin browser mutations", () => {
    expect(requestHasSameOrigin(new Request("https://apps.example.com/api/auth/login", {
      headers: { origin: "https://apps.example.com" },
    }))).toBe(true);
    expect(requestHasSameOrigin(new Request("https://apps.example.com/api/auth/login", {
      headers: { origin: "https://evil.example" },
    }))).toBe(false);
  });
});

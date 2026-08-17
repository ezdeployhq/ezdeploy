import { randomBytes } from "node:crypto";
import { mkdtemp, readFile, readdir, rm } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { EncryptedFileSecretStore } from "./secrets.js";

describe("EncryptedFileSecretStore", () => {
  const directories: string[] = [];

  afterEach(async () => {
    await Promise.all(directories.map((directory) => rm(directory, { recursive: true, force: true })));
  });

  it("round-trips a secret without persisting its plaintext", async () => {
    const directory = await mkdtemp(path.join(os.tmpdir(), "zaodeploy-secrets-"));
    directories.push(directory);
    const store = new EncryptedFileSecretStore(
      directory,
      randomBytes(32).toString("base64"),
    );
    const plaintext = "zai_application-only-secret";
    const reference = await store.put(plaintext);
    const [filename] = await readdir(directory);

    expect(await readFile(path.join(directory, filename), "utf8")).not.toContain(plaintext);
    expect(await store.get(reference)).toBe(plaintext);
    await store.delete(reference);
    expect(await readdir(directory)).toEqual([]);
  });

  it("rejects weak or malformed encryption keys", () => {
    expect(() => new EncryptedFileSecretStore("/tmp/noop", "not-a-key")).toThrow(
      "32-byte key",
    );
  });
});

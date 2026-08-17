import { createCipheriv, createDecipheriv, randomBytes, randomUUID } from "node:crypto";
import { chmod, mkdir, readFile, rm, writeFile } from "node:fs/promises";
import path from "node:path";
import { EZdeployError } from "@ezdeploy/contracts";

export interface SecretStore {
  put(value: string): Promise<string>;
  get(reference: string): Promise<string>;
  delete(reference: string): Promise<void>;
}

interface EncryptedSecret {
  version: 1;
  iv: string;
  authTag: string;
  ciphertext: string;
}

export class EncryptedFileSecretStore implements SecretStore {
  private readonly key: Buffer;

  constructor(
    private readonly directory: string,
    encryptionKey: string,
  ) {
    this.key = Buffer.from(encryptionKey, "base64");
    if (this.key.length !== 32) {
      throw new EZdeployError(
        "PROVIDER_NOT_CONFIGURED",
        "ZAODEPLOY_ENCRYPTION_KEY must be a base64-encoded 32-byte key",
      );
    }
  }

  async put(value: string): Promise<string> {
    const id = randomUUID();
    const iv = randomBytes(12);
    const cipher = createCipheriv("aes-256-gcm", this.key, iv);
    const ciphertext = Buffer.concat([cipher.update(value, "utf8"), cipher.final()]);
    const payload: EncryptedSecret = {
      version: 1,
      iv: iv.toString("base64"),
      authTag: cipher.getAuthTag().toString("base64"),
      ciphertext: ciphertext.toString("base64"),
    };
    await mkdir(this.directory, { recursive: true, mode: 0o700 });
    const filename = this.filename(id);
    await writeFile(filename, JSON.stringify(payload), { encoding: "utf8", mode: 0o600 });
    await chmod(filename, 0o600);
    return `secret://local/${id}`;
  }

  async get(reference: string): Promise<string> {
    const payload = JSON.parse(await readFile(this.filename(this.id(reference)), "utf8")) as EncryptedSecret;
    if (payload.version !== 1) throw new Error("Unsupported encrypted secret version");
    const decipher = createDecipheriv(
      "aes-256-gcm",
      this.key,
      Buffer.from(payload.iv, "base64"),
    );
    decipher.setAuthTag(Buffer.from(payload.authTag, "base64"));
    return Buffer.concat([
      decipher.update(Buffer.from(payload.ciphertext, "base64")),
      decipher.final(),
    ]).toString("utf8");
  }

  async delete(reference: string): Promise<void> {
    await rm(this.filename(this.id(reference)), { force: true });
  }

  private id(reference: string): string {
    const match = /^secret:\/\/local\/([0-9a-f-]{36})$/.exec(reference);
    if (!match) throw new Error("Invalid local secret reference");
    return match[1];
  }

  private filename(id: string): string {
    return path.join(this.directory, `${id}.json`);
  }
}

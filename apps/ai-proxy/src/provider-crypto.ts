const encoder = new TextEncoder();
const decoder = new TextDecoder();

function decodeBase64Url(value: string): Uint8Array<ArrayBuffer> {
  const normalized = value.replaceAll("-", "+").replaceAll("_", "/");
  const padded = normalized.padEnd(Math.ceil(normalized.length / 4) * 4, "=");
  const source = Uint8Array.from(atob(padded), (character) => character.charCodeAt(0));
  const result = new Uint8Array(source.byteLength);
  result.set(source);
  return result;
}

function encodeBase64Url(value: Uint8Array): string {
  return btoa(String.fromCharCode(...value))
    .replaceAll("+", "-")
    .replaceAll("/", "_")
    .replaceAll("=", "");
}

async function encryptionKey(secret: string): Promise<CryptoKey> {
  const bytes = decodeBase64Url(secret);
  if (bytes.byteLength !== 32) throw new Error("AI_PROVIDER_ENCRYPTION_KEY must contain 32 bytes");
  return crypto.subtle.importKey("raw", bytes, "AES-GCM", false, ["encrypt", "decrypt"]);
}

export async function encryptProviderKey(value: string, secret: string) {
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const encrypted = await crypto.subtle.encrypt(
    { name: "AES-GCM", iv },
    await encryptionKey(secret),
    encoder.encode(value),
  );
  return {
    ciphertext: encodeBase64Url(new Uint8Array(encrypted)),
    iv: encodeBase64Url(iv),
    lastFour: value.slice(-4),
  };
}

export async function decryptProviderKey(ciphertext: string, iv: string, secret: string) {
  const decrypted = await crypto.subtle.decrypt(
    { name: "AES-GCM", iv: decodeBase64Url(iv) },
    await encryptionKey(secret),
    decodeBase64Url(ciphertext),
  );
  return decoder.decode(decrypted);
}

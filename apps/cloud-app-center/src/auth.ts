export interface AuthEnvironment {
  DB: D1Database;
  OWNER_ID: string;
}

export interface PersonalAdmin {
  username: string;
  ownerId: string;
}

const sessionCookie = "ezdeploy_session";
// Cloudflare Workers Web Crypto currently rejects PBKDF2 iteration counts above 100,000.
export const passwordIterations = 100_000;
const sessionLifetimeSeconds = 30 * 24 * 60 * 60;

function bytesToBase64Url(bytes: Uint8Array): string {
  return btoa(String.fromCharCode(...bytes))
    .replaceAll("+", "-")
    .replaceAll("/", "_")
    .replaceAll("=", "");
}

function base64UrlToBytes(value: string): Uint8Array {
  const base64 = value.replaceAll("-", "+").replaceAll("_", "/");
  const padded = base64.padEnd(Math.ceil(base64.length / 4) * 4, "=");
  return Uint8Array.from(atob(padded), (character) => character.charCodeAt(0));
}

function randomToken(byteLength = 32): string {
  return bytesToBase64Url(crypto.getRandomValues(new Uint8Array(byteLength)));
}

async function sha256(value: string): Promise<string> {
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(value));
  return bytesToBase64Url(new Uint8Array(digest));
}

export async function derivePasswordHash(
  password: string,
  salt: string,
  iterations = passwordIterations,
): Promise<string> {
  const material = await crypto.subtle.importKey(
    "raw",
    new TextEncoder().encode(password),
    "PBKDF2",
    false,
    ["deriveBits"],
  );
  const bits = await crypto.subtle.deriveBits({
    name: "PBKDF2",
    hash: "SHA-256",
    salt: base64UrlToBytes(salt).buffer as ArrayBuffer,
    iterations,
  }, material, 256);
  return bytesToBase64Url(new Uint8Array(bits));
}

function timingSafeEqual(left: string, right: string): boolean {
  let mismatch = left.length ^ right.length;
  const length = Math.min(left.length, right.length);
  for (let index = 0; index < length; index++) {
    mismatch |= left.charCodeAt(index) ^ right.charCodeAt(index);
  }
  return mismatch === 0;
}

export function validateCredentials(username: string, password: string): string | null {
  if (!/^[\p{L}\p{N}_.@-]{3,48}$/u.test(username)) {
    return "管理员账号需为 3–48 个字符，可使用文字、字母、数字、点、短横线和下划线";
  }
  if (password.length < 10 || password.length > 200) {
    return "密码长度需为 10–200 个字符";
  }
  return null;
}

export function requestHasSameOrigin(request: Request): boolean {
  const origin = request.headers.get("origin");
  return Boolean(origin && origin === new URL(request.url).origin);
}

function cookieValue(request: Request): string | null {
  const cookies = request.headers.get("cookie") ?? "";
  for (const part of cookies.split(";")) {
    const [name, ...value] = part.trim().split("=");
    if (name === sessionCookie) return value.join("=") || null;
  }
  return null;
}

function sessionHeader(token: string, maxAge = sessionLifetimeSeconds): string {
  return `${sessionCookie}=${token}; Path=/; Max-Age=${maxAge}; HttpOnly; Secure; SameSite=Lax`;
}

export async function adminConfigured(env: AuthEnvironment): Promise<boolean> {
  return Boolean(await env.DB.prepare("SELECT 1 FROM personal_admin WHERE id=1").first());
}

async function issueSession(env: AuthEnvironment): Promise<string> {
  const token = randomToken();
  const now = new Date();
  const expiresAt = new Date(now.getTime() + sessionLifetimeSeconds * 1000).toISOString();
  await env.DB.prepare(
    "INSERT INTO personal_sessions (id,token_hash,created_at,expires_at,last_seen_at) VALUES (?,?,?,?,?)",
  ).bind(crypto.randomUUID(), await sha256(token), now.toISOString(), expiresAt, now.toISOString()).run();
  return sessionHeader(token);
}

export async function setupAdmin(
  env: AuthEnvironment,
  username: string,
  password: string,
): Promise<{ admin: PersonalAdmin; setCookie: string }> {
  const validation = validateCredentials(username, password);
  if (validation) throw new Error(validation);
  if (await adminConfigured(env)) throw new Error("管理员账号已经设置");
  const salt = randomToken(16);
  const now = new Date().toISOString();
  const passwordHash = await derivePasswordHash(password, salt);
  await env.DB.prepare(
    `INSERT INTO personal_admin
     (id,username,password_hash,password_salt,password_iterations,created_at,updated_at)
     VALUES (1,?,?,?,?,?,?)`,
  ).bind(username.trim(), passwordHash, salt, passwordIterations, now, now).run();
  return {
    admin: { username: username.trim(), ownerId: env.OWNER_ID },
    setCookie: await issueSession(env),
  };
}

export async function loginAdmin(
  request: Request,
  env: AuthEnvironment,
  username: string,
  password: string,
): Promise<{ admin: PersonalAdmin; setCookie: string } | null> {
  const ipHash = await sha256(request.headers.get("cf-connecting-ip") ?? "unknown");
  const windowStart = new Date(Date.now() - 15 * 60_000).toISOString();
  const attempts = await env.DB.prepare(
    "SELECT count(*) AS value FROM personal_login_attempts WHERE ip_hash=? AND succeeded=0 AND created_at>?",
  ).bind(ipHash, windowStart).first<{ value: number }>();
  if (Number(attempts?.value ?? 0) >= 8) throw new Error("登录尝试过多，请 15 分钟后再试");

  const row = await env.DB.prepare(
    "SELECT username,password_hash,password_salt,password_iterations FROM personal_admin WHERE id=1",
  ).first<{ username: string; password_hash: string; password_salt: string; password_iterations: number }>();
  const candidate = row
    ? await derivePasswordHash(password, row.password_salt, row.password_iterations)
    : await derivePasswordHash(password, randomToken(16));
  const valid = Boolean(row) && row!.username.toLowerCase() === username.trim().toLowerCase() &&
    timingSafeEqual(candidate, row!.password_hash);
  await env.DB.prepare(
    "INSERT INTO personal_login_attempts (ip_hash,succeeded,created_at) VALUES (?,?,?)",
  ).bind(ipHash, valid ? 1 : 0, new Date().toISOString()).run();
  if (!valid || !row) return null;
  await env.DB.prepare("DELETE FROM personal_login_attempts WHERE ip_hash=?").bind(ipHash).run();
  return {
    admin: { username: row.username, ownerId: env.OWNER_ID },
    setCookie: await issueSession(env),
  };
}

export async function authenticateAdmin(request: Request, env: AuthEnvironment): Promise<PersonalAdmin | null> {
  const token = cookieValue(request);
  if (!token || token.length < 32) return null;
  const now = new Date().toISOString();
  const session = await env.DB.prepare(
    `SELECT s.id,a.username FROM personal_sessions s CROSS JOIN personal_admin a
     WHERE s.token_hash=? AND s.expires_at>? AND a.id=1`,
  ).bind(await sha256(token), now).first<{ id: string; username: string }>();
  if (!session) return null;
  await env.DB.prepare("UPDATE personal_sessions SET last_seen_at=? WHERE id=?")
    .bind(now, session.id).run();
  return { username: session.username, ownerId: env.OWNER_ID };
}

export async function logoutAdmin(request: Request, env: AuthEnvironment): Promise<string> {
  const token = cookieValue(request);
  if (token) {
    await env.DB.prepare("DELETE FROM personal_sessions WHERE token_hash=?").bind(await sha256(token)).run();
  }
  return sessionHeader("", 0);
}

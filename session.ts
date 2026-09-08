import { ensureDir } from "@std/fs";
import { dirname } from "@std/path";

export interface SessionData {
  accessToken: string;
  refreshToken?: string;
  expiresAt?: number;
  tokenType: string;
  scope?: string;
}

export interface SessionKey {
  clientId: string;
  issuerUrl: string;
  scope?: string;
}

export async function loadSession(
  filePath: string,
): Promise<SessionData | null> {
  try {
    const data = await Deno.readTextFile(filePath);
    return JSON.parse(data) as SessionData;
  } catch (error) {
    if (error instanceof Deno.errors.NotFound) {
      return null;
    }
    throw error;
  }
}

export async function saveSession(
  filePath: string,
  session: SessionData,
): Promise<void> {
  const dir = dirname(filePath);
  await ensureDir(dir);
  await Deno.writeTextFile(filePath, JSON.stringify(session, null, 2));
}

async function getKeyringEntry(sessionKey: SessionKey) {
  const { Entry } = await import("@napi-rs/keyring");
  const account = await getKeyringAccount(sessionKey);
  return new Entry("oauth2cli", account);
}

async function getKeyringAccount(sessionKey: SessionKey): Promise<string> {
  const text = JSON.stringify(sessionKey);
  const hash = await crypto.subtle.digest(
    "SHA-256",
    new TextEncoder().encode(text),
  );
  return Array.from(
    new Uint8Array(hash),
    (byte) => byte.toString(16).padStart(2, "0"),
  ).join("");
}

export async function loadKeyringSession(
  sessionKey: SessionKey,
): Promise<SessionData | null> {
  const entry = await getKeyringEntry(sessionKey);
  const data = entry.getPassword();
  return data ? (JSON.parse(data) as SessionData) : null;
}

export async function saveKeyringSession(
  sessionKey: SessionKey,
  session: SessionData,
): Promise<void> {
  const entry = await getKeyringEntry(sessionKey);
  entry.setPassword(JSON.stringify(session));
}

export function isSessionValid(session: SessionData): boolean {
  // If no expiry time, assume it's valid
  if (!session.expiresAt) {
    return true;
  }

  // Check if token expires in more than 60 seconds
  const now = Date.now();
  return session.expiresAt > now + 60000;
}

import { ensureDir } from "@std/fs";
import { dirname } from "@std/path";

export interface SessionData {
  accessToken: string;
  refreshToken?: string;
  expiresAt?: number;
  tokenType: string;
  scope?: string;
}

export async function loadSession(
  filePath: string
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
  session: SessionData
): Promise<void> {
  const dir = dirname(filePath);
  await ensureDir(dir);
  await Deno.writeTextFile(filePath, JSON.stringify(session, null, 2));
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

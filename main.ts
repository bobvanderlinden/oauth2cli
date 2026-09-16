#!/usr/bin/env -S deno run --allow-net --allow-read --allow-write --allow-run --allow-env --allow-ffi --allow-sys

import { parseArgs } from "@std/cli/parse-args";
import { z } from "@zod/zod";
import type { OAuth2Config } from "./oauth2.ts";
import {
  discoverOAuth2Endpoints,
  performAuthorizationFlow,
  refreshAccessToken,
} from "./oauth2.ts";
import {
  isSessionValid,
  loadKeyringSession,
  loadSession,
  saveKeyringSession,
  saveSession,
} from "./session.ts";
import type { SessionData, SessionKey } from "./session.ts";

interface CLIOptions {
  clientId: string;
  clientSecret?: string;
  keyring: boolean;
  pkce: boolean;
  redirectUrl: string;
  sessionFile?: string;
  issuerUrl: string;
  scope?: string;
}

function printUsage(): void {
  console.error(`Usage: oauth2cli [OPTIONS] <ISSUER_URL>

Options:
  --client-id <ID>         OAuth2 client ID (required)
  --client-secret <SECRET> OAuth2 client secret (optional)
  --redirect-url <URL>     Redirect URL for OAuth2 callback (required)
  --keyring                Store tokens in the system keyring (default)
  --session <FILE>         Session file path, instead of the system keyring
  --pkce                   Use PKCE flow (recommended)
  --scope <SCOPE>          OAuth2 scope (optional)
  --help                   Show this help message

Example:
  oauth2cli \\
    --client-id myapp \\
    --pkce \\
    --redirect-url http://localhost:3000/oauth2/callback \\
    --session .session.json \\
    https://myoauthserver/
`);
}

const cliOptionsSchema = z
  .object({
    "client-id": z.string().min(1, "Missing required argument --client-id"),
    "client-secret": z.string().optional(),
    "redirect-url": z.url({ message: "Invalid URL format for --redirect-url" }),
    session: z.string().min(1).optional(),
    keyring: z.boolean().default(false),
    pkce: z.boolean().default(false),
    scope: z.string().optional(),
    _: z.tuple([z.url({ message: "Invalid URL format for ISSUER_URL" })]),
  })
  .refine((args) => !(args.keyring && args.session), {
    message: "--keyring cannot be used with --session",
  })
  .transform((args) => ({
    clientId: args["client-id"],
    clientSecret: args["client-secret"],
    redirectUrl: args["redirect-url"],
    sessionFile: args.session,
    keyring: args.keyring,
    pkce: args.pkce,
    scope: args.scope,
    issuerUrl: args._[0],
  }));

function parseCliArgs(): CLIOptions {
  const args = parseArgs(Deno.args, {
    boolean: ["keyring", "pkce", "help"],
    string: ["client-id", "client-secret", "redirect-url", "session", "scope"],
    alias: {
      h: "help",
    },
  });

  if (args.help) {
    printUsage();
    Deno.exit(0);
  }

  try {
    return cliOptionsSchema.parse(args);
  } catch (error) {
    if (error instanceof z.ZodError) {
      for (const issue of error.issues) {
        console.error(`Error: ${issue.message}`);
      }
      console.error();
      printUsage();
      Deno.exit(1);
    }
    throw error;
  }
}

interface SessionStore {
  load(): Promise<SessionData | null>;
  save(session: SessionData): Promise<void>;
}

function getSessionStore(options: CLIOptions): SessionStore {
  if (options.sessionFile) {
    const sessionFile = options.sessionFile;
    return {
      load: () => loadSession(sessionFile),
      save: (session) => saveSession(sessionFile, session),
    };
  }

  const sessionKey: SessionKey = {
    clientId: options.clientId,
    issuerUrl: options.issuerUrl,
    scope: options.scope,
  };
  return {
    load: () => loadKeyringSession(sessionKey),
    save: (session) => saveKeyringSession(sessionKey, session),
  };
}

async function getFreshAccessToken(
  config: OAuth2Config,
  sessionStore: SessionStore,
): Promise<string> {
  const loadedSession = await sessionStore.load();

  const validSession = await ensureFreshSession(config, loadedSession);

  if (loadedSession !== validSession) {
    await sessionStore.save(validSession);
  }

  return validSession.accessToken;
}

async function ensureFreshSession(
  config: OAuth2Config,
  session: SessionData | null,
): Promise<SessionData> {
  if (!session) {
    return await performAuthorizationFlow(config);
  }

  if (isSessionValid(session)) {
    return session;
  }

  if (session.refreshToken) {
    try {
      return await refreshAccessToken(config, session.refreshToken);
    } catch (error) {
      console.error(
        `Failed to refresh token: ${
          error instanceof Error ? error.message : String(error)
        }`,
      );
    }
  }
  return await performAuthorizationFlow(config);
}

async function main(): Promise<void> {
  const options = parseCliArgs();

  try {
    // Discover OAuth2 endpoints
    const endpoints = await discoverOAuth2Endpoints(options.issuerUrl);

    const config: OAuth2Config = {
      authorizationEndpoint: endpoints.authorizationEndpoint,
      tokenEndpoint: endpoints.tokenEndpoint,
      ...options,
    };

    const accessToken = await getFreshAccessToken(
      config,
      getSessionStore(options),
    );
    console.log(accessToken);
  } catch (error) {
    console.error(
      `Error: ${error instanceof Error ? error.message : String(error)}`,
    );
    Deno.exit(1);
  }
}

if (import.meta.main) {
  await main();
}

#!/usr/bin/env -S deno run --allow-net --allow-read --allow-write --allow-run

import { parseArgs } from "@std/cli/parse-args";
import { z } from "@zod/zod";
import type { OAuth2Config } from "./oauth2.ts";
import {
  discoverOAuth2Endpoints,
  performAuthorizationFlow,
  refreshAccessToken,
} from "./oauth2.ts";
import { isSessionValid, loadSession, saveSession } from "./session.ts";
import type { SessionData } from "./session.ts";

interface CLIOptions {
  clientId: string;
  clientSecret?: string;
  pkce: boolean;
  redirectUrl: string;
  sessionFile: string;
  issuerUrl: string;
  scope?: string;
}

function printUsage(): void {
  console.error(`Usage: oauth2cli [OPTIONS] <ISSUER_URL>

Options:
  --client-id <ID>         OAuth2 client ID (required)
  --client-secret <SECRET> OAuth2 client secret (optional)
  --redirect-url <URL>     Redirect URL for OAuth2 callback (required)
  --session <FILE>         Session file path (required)
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
    session: z.string().min(1, "Missing required argument --session"),
    pkce: z.boolean().default(false),
    scope: z.string().optional(),
    _: z.tuple([z.url({ message: "Invalid URL format for ISSUER_URL" })]),
  })
  .transform((args) => ({
    clientId: args["client-id"],
    clientSecret: args["client-secret"],
    redirectUrl: args["redirect-url"],
    sessionFile: args.session,
    pkce: args.pkce,
    scope: args.scope,
    issuerUrl: args._[0],
  }));

function parseCliArgs(): CLIOptions {
  const args = parseArgs(Deno.args, {
    boolean: ["pkce", "help"],
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

async function getFreshAccessToken(
  config: OAuth2Config,
  sessionFile: string
): Promise<string> {
  const loadedSession = await loadSession(sessionFile);

  const validSession = await ensureFreshSession(config, loadedSession);

  if (loadedSession !== validSession) {
    await saveSession(sessionFile, validSession);
  }

  return validSession.accessToken;
}

async function ensureFreshSession(
  config: OAuth2Config,
  session: SessionData | null
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
        }`
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

    const accessToken = await getFreshAccessToken(config, options.sessionFile);
    console.log(accessToken);
  } catch (error) {
    console.error(
      `Error: ${error instanceof Error ? error.message : String(error)}`
    );
    Deno.exit(1);
  }
}

if (import.meta.main) {
  await main();
}

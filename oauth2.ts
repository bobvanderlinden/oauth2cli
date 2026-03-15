import { encodeBase64Url } from "@std/encoding/base64url";
import { open } from "open";
import type { SessionData } from "./session.ts";
import { waitForCallback } from "./server.ts";

export interface OAuth2Config {
  clientId: string;
  clientSecret?: string;
  authorizationEndpoint: string;
  tokenEndpoint: string;
  redirectUrl: string;
  pkce: boolean;
  scope?: string;
}

interface TokenResponse {
  access_token: string;
  token_type: string;
  expires_in?: number;
  refresh_token?: string;
  scope?: string;
}

function generateRandomString(length: number): string {
  const array = new Uint8Array(length);
  crypto.getRandomValues(array);
  return encodeBase64Url(array);
}

async function sha256(plain: string): Promise<string> {
  const encoder = new TextEncoder();
  const data = encoder.encode(plain);
  const hash = await crypto.subtle.digest("SHA-256", data);
  return encodeBase64Url(new Uint8Array(hash));
}

export async function performAuthorizationFlow(
  config: OAuth2Config
): Promise<SessionData> {
  const state = generateRandomString(32);
  let codeVerifier: string | undefined;
  let codeChallenge: string | undefined;

  if (config.pkce) {
    codeVerifier = generateRandomString(32);
    codeChallenge = await sha256(codeVerifier);
  }

  // Build authorization URL
  const authUrl = new URL(config.authorizationEndpoint);
  authUrl.searchParams.set("client_id", config.clientId);
  authUrl.searchParams.set("response_type", "code");
  authUrl.searchParams.set("redirect_uri", config.redirectUrl);
  authUrl.searchParams.set("state", state);

  if (config.scope) {
    authUrl.searchParams.set("scope", config.scope);
  }

  if (config.pkce && codeChallenge) {
    authUrl.searchParams.set("code_challenge", codeChallenge);
    authUrl.searchParams.set("code_challenge_method", "S256");
  }

  console.error(`Waiting for callback on ${config.redirectUrl}...`);

  // Wait for OAuth2 callback
  const code = await waitForCallback({
    redirectUrl: config.redirectUrl,
    expectedState: state,
    async onReady() {
      // Open browser
      console.error(`Opening browser for authentication...`);
      console.error(
        `If the browser doesn't open, visit: ${authUrl.toString()}`
      );
      try {
        await open(authUrl.toString());
      } catch {
        console.error(
          `Failed to open browser. Please visit: ${authUrl.toString()}`
        );
      }
    },
  });

  // Exchange code for token
  const tokenData = await exchangeCodeForToken(config, code, codeVerifier);

  return tokenResponseToSession(tokenData);
}

async function exchangeCodeForToken(
  config: OAuth2Config,
  code: string,
  codeVerifier?: string
): Promise<TokenResponse> {
  const body = new URLSearchParams();
  body.set("grant_type", "authorization_code");
  body.set("code", code);
  body.set("redirect_uri", config.redirectUrl);
  body.set("client_id", config.clientId);

  if (config.clientSecret) {
    body.set("client_secret", config.clientSecret);
  }

  if (codeVerifier) {
    body.set("code_verifier", codeVerifier);
  }

  const response = await fetch(config.tokenEndpoint, {
    method: "POST",
    headers: {
      "Content-Type": "application/x-www-form-urlencoded",
    },
    body: body.toString(),
  });

  if (!response.ok) {
    const errorText = await response.text();
    throw new Error(`Token exchange failed (${response.status}): ${errorText}`);
  }

  return (await response.json()) as TokenResponse;
}

export async function refreshAccessToken(
  config: OAuth2Config,
  refreshToken: string
): Promise<SessionData> {
  const body = new URLSearchParams();
  body.set("grant_type", "refresh_token");
  body.set("refresh_token", refreshToken);
  body.set("client_id", config.clientId);

  if (config.clientSecret) {
    body.set("client_secret", config.clientSecret);
  }

  const response = await fetch(config.tokenEndpoint, {
    method: "POST",
    headers: {
      "Content-Type": "application/x-www-form-urlencoded",
    },
    body: body.toString(),
  });

  if (!response.ok) {
    const errorText = await response.text();
    throw new Error(`Token refresh failed (${response.status}): ${errorText}`);
  }

  const tokenData = (await response.json()) as TokenResponse;
  return tokenResponseToSession(tokenData);
}

function tokenResponseToSession(tokenData: TokenResponse): SessionData {
  const expiresAt = tokenData.expires_in
    ? Date.now() + tokenData.expires_in * 1000
    : undefined;

  return {
    accessToken: tokenData.access_token,
    refreshToken: tokenData.refresh_token,
    expiresAt,
    tokenType: tokenData.token_type,
    scope: tokenData.scope,
  };
}

export async function discoverOAuth2Endpoints(
  issuerUrl: string
): Promise<{ authorizationEndpoint: string; tokenEndpoint: string }> {
  const baseUrl = new URL(issuerUrl);

  // Try OIDC discovery first
  try {
    const discoveryUrl = new URL("/.well-known/openid-configuration", baseUrl);
    const response = await fetch(discoveryUrl);

    if (response.ok) {
      const data = await response.json();
      return {
        authorizationEndpoint: data.authorization_endpoint,
        tokenEndpoint: data.token_endpoint,
      };
    }
  } catch {
    // Fall through to OAuth2 discovery
  }

  // Try OAuth2 discovery
  try {
    const discoveryUrl = new URL(
      "/.well-known/oauth-authorization-server",
      baseUrl
    );
    const response = await fetch(discoveryUrl);

    if (response.ok) {
      const data = await response.json();
      return {
        authorizationEndpoint: data.authorization_endpoint,
        tokenEndpoint: data.token_endpoint,
      };
    }
  } catch {
    // Fall through to manual construction
  }

  // Fallback to standard endpoints
  return {
    authorizationEndpoint: new URL("/authorize", baseUrl).toString(),
    tokenEndpoint: new URL("/token", baseUrl).toString(),
  };
}

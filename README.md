# oauth2cli

A command-line tool to authenticate using OAuth2.

To be [combined with curl](#using-with-curl) to more easily call authenticated API.

## Features

- OAuth2 authorization code flow with PKCE support
- Automatic token refresh
- Session persistence to file
- Built-in callback server for OAuth2 redirects
- Automatic discovery of OAuth2 endpoints via `.well-known` URLs
- Outputs the access token to stdout (for shell command substitution)

## Requirements

- [Deno](https://deno.com/)

## Installation

Install executable to `~/.deno/bin`:

```bash
deno install --allow-net --allow-read --allow-write --allow-run --name oauth2cli main.ts
```

Or, use `main.ts` directly:

```bash
deno run --allow-net --allow-read --allow-write --allow-run main.ts
```

## Usage

```bash
oauth2cli [OPTIONS] <ISSUER_URL>
```

## Usage

```bash
oauth2cli \
  --client-id <CLIENT_ID> \
  --redirect-url <REDIRECT_URL> \
  --session <SESSION_FILE> \
  [--pkce] \
  [--scope <SCOPE>] \
  <ISSUER_URL>
```

### Example

```bash
oauth2cli \
  --client-id myapp \
  --pkce \
  --redirect-url http://localhost:3000/oauth2/callback \
  --session .session.json \
  https://myoauthserver/
```

### Using with curl

`oauth2cli` outputs the access token to stdout, which can be combined with curl to call authorized APIs:

```bash
curl \
  --header "Authorization: Bearer $(oauth2cli --client-id myapp --pkce --redirect-url http://localhost:3000/oauth2/callback --session .session.json https://myoauthserver/)" \
  https://myoauthserver/some/authenticated/api
```

## Options

- `--client-id <ID>` - OAuth2 client ID (required)
- `--redirect-url <URL>` - Redirect URL for OAuth2 callback (required)
- `--session <FILE>` - Session file path for storing tokens (required)
- `--pkce` - Use PKCE (Proof Key for Code Exchange) flow (recommended for security)
- `--scope <SCOPE>` - OAuth2 scope (optional)
- `--help` - Show help message

## How It Works

1. **First run**: Opens a browser for OAuth2 authentication, starts a local server to receive the OAuth callback, exchanges the authorization code for tokens, and saves them to the session file
2. **Subsequent runs**: Checks if the stored token is still valid
   - If valid: Outputs the access token immediately
   - If expired but refresh token exists: Refreshes the token automatically
   - If refresh fails: Starts a new authorization flow

## License

MIT


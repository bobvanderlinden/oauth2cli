# oauth2cli

A command-line tool to authenticate with OAuth2 and print an access token for
`curl`.

## Features

- OAuth2 authorization code flow with PKCE
- Automatic token refresh
- System keyring session storage
- File session storage for headless and CI use
- Local callback server for OAuth2 redirects
- OAuth2 endpoint discovery through `.well-known` URLs

## Requirements

- [Deno](https://deno.com/)
- A system keyring. Linux uses the Secret Service API, macOS uses Keychain, and
  Windows uses Credential Manager.

## Installation

Install an executable to `~/.deno/bin`:

```bash
deno install --allow-net --allow-read --allow-write --allow-run --allow-env --allow-ffi --allow-sys --name oauth2cli main.ts
```

Or run `main.ts` directly:

```bash
deno run --allow-net --allow-read --allow-write --allow-run --allow-env --allow-ffi --allow-sys main.ts
```

## Usage

```bash
oauth2cli [OPTIONS] <ISSUER_URL>
```

Sessions use the system keyring by default. The key is derived from the issuer
URL, client ID, and requested scope. Pass `--session` to store the session in a
file instead.

```bash
oauth2cli \
  --client-id myapp \
  --pkce \
  --redirect-url http://localhost:3000/oauth2/callback \
  https://myoauthserver/
```

For CI or a machine without a keyring:

```bash
oauth2cli \
  --client-id myapp \
  --pkce \
  --redirect-url http://localhost:3000/oauth2/callback \
  --session .session.json \
  https://myoauthserver/
```

### Using with curl

`oauth2cli` writes the access token to standard output:

```bash
curl \
  --header "Authorization: Bearer $(oauth2cli --client-id myapp --pkce --redirect-url http://localhost:3000/oauth2/callback https://myoauthserver/)" \
  https://myoauthserver/some/authenticated/api
```

## Options

- `--client-id <ID>`: OAuth2 client ID. Required.
- `--client-secret <SECRET>`: OAuth2 client secret.
- `--redirect-url <URL>`: Redirect URL for the OAuth2 callback. Required.
- `--session <FILE>`: Store tokens in this file instead of the system keyring.
- `--pkce`: Use PKCE.
- `--scope <SCOPE>`: OAuth2 scope.
- `--help`: Show help.

## License

MIT

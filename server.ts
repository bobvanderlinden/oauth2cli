import { Html, html } from "./html.ts";

export interface CallbackResult {
  code?: string;
  state?: string;
  error?: string;
  error_description?: string;
}

export interface CallbackServerOptions {
  onReady: () => Promise<void>;
  redirectUrl: string;
  expectedState: string;
}

/**
 * Async version of Deno.serve. Awaits for the webserver to be ready.
 */
async function serve(
  options: Deno.ServeTcpOptions,
  handler: Deno.ServeHandler
): Promise<Deno.HttpServer> {
  const { promise, resolve } = Promise.withResolvers<void>();

  const server = Deno.serve(
    {
      ...options,
      onListen: (addr) => {
        options.onListen?.(addr);
        resolve();
      },
    },
    handler
  );

  await promise;
  return server;
}

function toHttpContent(body: unknown) {
  if (body instanceof Html) {
    return {
      body: body.value,
      headers: { "Content-Type": "text/html" },
    };
  } else if (typeof body === "string") {
    return {
      body,
      headers: { "Content-Type": "text/plain" },
    };
  }
  throw new Error(`Invalid HTTP content: ${body}`);
}

function htmlResponse({
  status = 200,
  content,
}: {
  status?: number;
  content: unknown;
}) {
  const { body, headers: contentHeaders } = toHttpContent(content);
  return new Response(body, {
    status,
    headers: contentHeaders,
  });
}

function authenticationFailedResponse(description: string) {
  return htmlResponse({
    status: 400,
    content: html`
      <html>
        <body>
          <h1>Authentication failed</h1>
          <p>${description}</p>
        </body>
      </html>
    `,
  });
}

export async function waitForCallback({
  onReady,
  redirectUrl,
  expectedState,
}: CallbackServerOptions): Promise<string> {
  const url = new URL(redirectUrl);
  const port = parseInt(url.port) || 80;
  const pathname = url.pathname;

  const { promise, resolve } = Promise.withResolvers<string>();

  const handler = (request: Request): Response => {
    const requestUrl = new URL(request.url);

    if (requestUrl.pathname !== pathname) {
      return htmlResponse({
        status: 404,
        content: html`
          <html>
            <body>
              <h1>Not Found</h1>
            </body>
          </html>
        `,
      });
    }

    const code = requestUrl.searchParams.get("code");
    const state = requestUrl.searchParams.get("state");
    const error = requestUrl.searchParams.get("error");
    const errorDescription = requestUrl.searchParams.get("error_description");

    // Validate state
    if (state !== expectedState) {
      return authenticationFailedResponse(
        "Invalid state parameter. Authentication failed."
      );
    }

    if (error) {
      return authenticationFailedResponse(
        errorDescription
          ? `Error: ${error}. Description: ${errorDescription}`
          : `Error: ${error}`
      );
    }

    if (code) {
      resolve(code);
      return htmlResponse({
        content: html`
          <html>
            <body>
              <h1>Authentication successful!</h1>
              <p>You can close this window.</p>
            </body>
            <script>
              window.close();
            </script>
          </html>
        `,
      });
    }

    return authenticationFailedResponse("Missing authorization code");
  };

  const server = await serve({ port }, handler);
  await onReady();
  const result = await promise;
  await server.shutdown();
  return result;
}

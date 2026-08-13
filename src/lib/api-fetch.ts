import { desktop } from "./desktop";

/**
 * Fetch through Electron's authenticated main-process session when available.
 * Browser builds retain ordinary same-origin fetch behavior. The returned
 * Response keeps existing API clients unchanged (`ok`, `status`, `json`, etc.).
 */
export async function apiFetch(input: string, init: RequestInit = {}): Promise<Response> {
  const bridge = desktop();
  if (!bridge?.api) return fetch(input, init);

  const headers = Object.fromEntries(new Headers(init.headers).entries());
  const body = typeof init.body === "string" ? init.body : undefined;
  const result = await bridge.api.request({
    url: input,
    method: init.method,
    headers,
    body,
  });
  return new Response(result.body, {
    status: result.status,
    statusText: result.statusText,
    headers: result.headers,
  });
}

/**
 * Classify a native health probe without conflating an SSO challenge with an
 * unavailable service. The public proxy deliberately redirects anonymous
 * callers to Authentik, while LAN profiles have no equivalent state.
 */
export type NativeConnectionStatus = "connected" | "disconnected" | "sign_in_required";

export function classifyHealthResponse(
  status: number,
  contentType: string | null,
  publicProfile: boolean,
): NativeConnectionStatus {
  if (status >= 200 && status < 300) {
    // An Authentik login document can arrive as a successful response after a
    // redirect. It is not a healthy JSON API response.
    return publicProfile && /text\/html/i.test(contentType ?? "")
      ? "sign_in_required"
      : "connected";
  }
  if (publicProfile && (status === 401 || status === 403 || (status >= 300 && status < 400))) {
    return "sign_in_required";
  }
  return "disconnected";
}

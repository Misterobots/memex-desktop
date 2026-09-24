/**
 * Classify a native health probe. Every runtime profile points at a service the
 * user runs themselves, so a non-2xx answer simply means "unreachable" — there
 * is no SSO challenge to keep distinct from an outage.
 */
export type NativeConnectionStatus = "connected" | "disconnected";

export function classifyHealthResponse(status: number): NativeConnectionStatus {
  return status >= 200 && status < 300 ? "connected" : "disconnected";
}

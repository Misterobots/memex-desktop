import { cadPrint, type BuildSetItem } from "./cad-print-api";

export const REMOTE_CAD_ACTIONS = [
  "parts",
  "printer_context",
  "render",
  "export_build_set",
  "artifacts",
  "print_status",
  "print_jobs",
  "preflight",
  "request_approval",
] as const;

export type RemoteCadAction = typeof REMOTE_CAD_ACTIONS[number];
export type RemoteCadRequest = {
  type: "cad:request";
  request_id: string;
  action: RemoteCadAction;
  payload?: Record<string, unknown>;
  _from?: "host" | "guest";
};
export type RemoteCadResponse =
  | { type: "cad:result"; request_id: string; action: RemoteCadAction; ok: true; payload: unknown }
  | { type: "cad:error"; request_id: string; action?: string; ok: false; error: string };

const MAX_REQUEST_ID_LENGTH = 128;
const MAX_BUILD_SET_ITEMS = 32;

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

function isAction(value: unknown): value is RemoteCadAction {
  return typeof value === "string" && (REMOTE_CAD_ACTIONS as readonly string[]).includes(value);
}

function publicArtifact(value: unknown): unknown {
  if (!isRecord(value)) return value;
  const { path: _path, ...withoutPath } = value;
  return { ...withoutPath, available_on_host: typeof _path === "string" };
}

function publicArtifacts(value: unknown): unknown {
  if (!isRecord(value)) return value;
  if (!Array.isArray(value.artifacts)) return value;
  return { ...value, artifacts: value.artifacts.map(publicArtifact) };
}

function error(requestId: unknown, action: unknown, message: string): RemoteCadResponse {
  return {
    type: "cad:error",
    request_id: typeof requestId === "string" ? requestId.slice(0, MAX_REQUEST_ID_LENGTH) : "",
    ...(typeof action === "string" ? { action } : {}),
    ok: false,
    error: message,
  };
}

/**
 * Execute a single mobile request on the paired desktop.
 *
 * This is deliberately not a generic local-bridge proxy. The switch is the
 * complete remote capability list; physical `print:start` is absent, so a
 * phone cannot submit a print even if it holds a live pairing token.
 */
export async function handleRemoteCadRequest(raw: unknown): Promise<RemoteCadResponse | null> {
  if (!isRecord(raw) || raw.type !== "cad:request") return null;
  if (raw._from !== "guest") return error(raw.request_id, raw.action, "Only the paired guest may issue CAD requests.");
  if (typeof raw.request_id !== "string" || !raw.request_id || raw.request_id.length > MAX_REQUEST_ID_LENGTH) {
    return error(raw.request_id, raw.action, "Invalid request identifier.");
  }
  if (!isAction(raw.action)) return error(raw.request_id, raw.action, "This CAD action is not available remotely.");

  const payload = isRecord(raw.payload) ? raw.payload : {};
  try {
    let result: unknown;
    switch (raw.action) {
      case "parts":
        result = await cadPrint.parts();
        break;
      case "printer_context":
        result = await cadPrint.printerContext();
        break;
      case "render": {
        const part = payload.part;
        const format = payload.format;
        if (typeof part !== "string" || !part) return error(raw.request_id, raw.action, "A printable part is required.");
        if (format !== undefined && format !== "stl" && format !== "3mf") return error(raw.request_id, raw.action, "Unsupported export format.");
        const rendered = await cadPrint.render(part, format === "stl" ? "stl" : "3mf");
        result = { ...rendered, artifact: publicArtifact(rendered.artifact) };
        break;
      }
      case "export_build_set": {
        const items = payload.items;
        if (!Array.isArray(items) || !items.length || items.length > MAX_BUILD_SET_ITEMS) {
          return error(raw.request_id, raw.action, "Choose between 1 and 32 source models for a build set.");
        }
        const valid = items.every((item) => isRecord(item) && typeof item.part === "string" && item.part.length > 0 && Number.isInteger(item.quantity) && Number(item.quantity) > 0 && Number(item.quantity) <= 20);
        if (!valid) return error(raw.request_id, raw.action, "Each build-set item needs a valid part name and quantity (1–20).");
        const exported = await cadPrint.exportBuildSet(items as BuildSetItem[]);
        result = {
          ...exported,
          artifact: publicArtifact(exported.artifact),
          parts: exported.parts?.map((entry) => ({ ...entry, artifact: publicArtifact(entry.artifact) })),
        };
        break;
      }
      case "artifacts":
        result = publicArtifacts(await cadPrint.artifacts());
        break;
      case "print_status":
        result = await cadPrint.printStatus();
        break;
      case "print_jobs":
        result = await cadPrint.printJobs();
        break;
      case "preflight":
      case "request_approval": {
        const jobId = payload.job_id;
        if (typeof jobId !== "string" || !jobId) return error(raw.request_id, raw.action, "A registered job is required.");
        if (raw.action === "preflight") {
          result = await cadPrint.preflight(jobId);
        } else {
          // The approval token is intentionally host-only. A mobile guest may
          // ask the workstation to prepare the review, but only the local UI
          // can see/use the token and execute the final print confirmation.
          const approval = await cadPrint.requestApproval(jobId);
          const { approval_token: _token, ...publicApproval } = approval;
          result = { ...publicApproval, requires_local_confirmation: true };
        }
        break;
      }
    }
    return { type: "cad:result", request_id: raw.request_id, action: raw.action, ok: true, payload: result };
  } catch (caught) {
    return error(raw.request_id, raw.action, caught instanceof Error ? caught.message : "The paired workstation could not complete this action.");
  }
}

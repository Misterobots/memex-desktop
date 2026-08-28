import { apiFetch } from "./api-fetch";
import { getAgentRuntime } from "./runtime-urls";

export type FeatureKey = "chat" | "code" | "research" | "grounding_web" | "grounding_docs" |
  "grounding_files" | "memory" | "routines" | "design" | "art" | "eval" | "model_selection";

export type UserPolicy = {
  owner_id: string;
  configured: boolean;
  allowed_models: string[] | null;
  features: Record<FeatureKey, boolean>;
  feature_labels?: Record<FeatureKey, string>;
  is_admin?: boolean;
};

export type PermissionModel = { id: string; label?: string; description?: string; available?: boolean };

async function json<T>(path: string, init?: RequestInit): Promise<T> {
  const response = await apiFetch(`${getAgentRuntime()}${path}`, init);
  if (!response.ok) {
    let detail = `Request failed (${response.status})`;
    try { detail = (await response.json()).detail ?? detail; } catch { /* response was not JSON */ }
    throw new Error(detail);
  }
  return response.json() as Promise<T>;
}

export const getMyPermissions = () => json<UserPolicy>("/api/v1/permissions");

export const listUserPermissions = () =>
  json<{ users: UserPolicy[]; feature_labels: Record<FeatureKey, string> }>("/api/v1/admin/user-permissions");

export const getUserPermissions = (owner: string) =>
  json<UserPolicy>(`/api/v1/admin/user-permissions/${encodeURIComponent(owner)}`);

export const saveUserPermissions = (policy: UserPolicy) =>
  json<UserPolicy>(`/api/v1/admin/user-permissions/${encodeURIComponent(policy.owner_id)}`, {
    method: "PUT",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ allowed_models: policy.allowed_models, features: policy.features }),
  });

export const resetUserPermissions = (owner: string) =>
  json<{ ok: boolean; removed: boolean }>(`/api/v1/admin/user-permissions/${encodeURIComponent(owner)}`, { method: "DELETE" });

export const getPermissionCatalog = () =>
  json<{ models: PermissionModel[]; features: Record<FeatureKey, string> }>("/api/v1/admin/permission-catalog");

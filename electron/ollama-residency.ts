/**
 * Residency rows for the model picker's "in VRAM" indicator.
 *
 * The picker sweeps several Ollama addresses so a model pinned on one host is
 * still reported when the active profile points at another. Loopback and the LAN
 * address are the *same daemon*, so keying a row by host shows one load several
 * times — the panel reported three nomic-embed-text models that were really one.
 * Key on the load instead: Ollama's own model digest plus the independent
 * expires_at each daemon computes, so aliases collapse while genuinely separate
 * nodes stay separate rows.
 */

export interface OllamaPsModel {
  name: string;
  model?: string;
  size?: number;
  size_vram?: number;
  expires_at?: string;
}

export interface ResidentModel {
  name: string;
  model: string;
  sizeGb: number;
  vramGb: number;
  host: string;
  expiresAt?: string;
}

const residencyKey = (m: OllamaPsModel) => `${m.name}|${m.model ?? m.name}|${m.expires_at ?? ""}`;

export function collectResidentModels(
  reports: Array<{ base: string; models: OllamaPsModel[] }>,
): ResidentModel[] {
  const seen = new Set<string>();
  const rows: ResidentModel[] = [];
  for (const { base, models } of reports) {
    for (const m of models) {
      if (!m.name) continue;
      const key = residencyKey(m);
      if (seen.has(key)) continue;
      seen.add(key);
      rows.push({
        name: m.name,
        model: m.model ?? m.name,
        sizeGb: +((m.size ?? 0) / 1e9).toFixed(1),
        vramGb: +((m.size_vram ?? m.size ?? 0) / 1e9).toFixed(1),
        host: base,
        expiresAt: m.expires_at,
      });
    }
  }
  return rows;
}

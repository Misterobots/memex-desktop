/**
 * Runtime configuration profiles (Routing).
 * Persisted as userData/config.json. LAN URLs are stored in plaintext, as before.
 * apiKey is the one secret-grade field here — it's encrypted at rest via Electron's
 * safeStorage (OS keychain-backed) and only ever held in plaintext in memory.
 */
import { join } from "path";
import { readFileSync, writeFileSync, existsSync } from "fs";
import { randomUUID } from "crypto";
import { safeStorage } from "electron";
import { LOCAL_DEFAULT_PROFILE_ID, migrateLocalOnlyProfiles } from "./profile-migration";
import {
  DEFAULT_OLLAMA_BASE_URL,
  deriveRoutingFromProfile,
  migrateToRouting,
  readRoutingBlock,
  validateRouting,
  type RoutingConfig,
  type RoutingIssue,
  type RoutingResult,
  type RoutingState,
  type RunStyle,
  type EngineConfig,
  type RouteTarget,
} from "./routing-config";

export type ProviderType = "internal" | "external";

export interface RuntimeProfile {
  id:           string;
  name:         string;
  providerType: ProviderType; // "internal" = trusted LAN host, "external" = 3rd-party API
  agentRuntime: string;
  mempalace:    string;
  ollama?:      string;
  /** Optional llama.cpp (`llama-server`) lane, which runs alongside Ollama rather
   * than instead of it. Superseded by the `engines` map in routing-config.ts, which
   * is what the registry reads now; kept because a persisted profile still carries
   * it, and it is the source the routing block is derived from on first load. */
  llamaCpp?:    string;
  /** Last model deliberately selected for this routing profile. Kept in step with
   * the picker by `ModelPickerPopover`; the routing table outranks it. */
  defaultModel?: string;
  /** Optional local companion services configured by Local LLM setup. */
  localServices?: { openWebUi?: string; comfyUi?: string };
  apiKey?:      string;   // plaintext in memory/IPC; encrypted only in the persisted file
  readonly?:    boolean; // seed profiles are read-only by convention (UI hint only)
}

// Internal-only persisted shape — apiKey is base64 ciphertext on disk, never plaintext.
type PersistedProfile = Omit<RuntimeProfile, "apiKey"> & { apiKey?: string };

function encryptProfilesForDisk(profiles: RuntimeProfile[]): PersistedProfile[] {
  return profiles.map((p) => {
    if (!p.apiKey) return { ...p, apiKey: undefined };
    if (!safeStorage.isEncryptionAvailable()) return p; // best effort — no OS keychain available
    return { ...p, apiKey: safeStorage.encryptString(p.apiKey).toString("base64") };
  });
}

// Profiles saved before Routing shipped won't have providerType on disk yet.
type LegacyPersistedProfile = Omit<PersistedProfile, "providerType"> & { providerType?: ProviderType };

function decryptProfilesFromDisk(profiles: LegacyPersistedProfile[]): RuntimeProfile[] {
  return profiles.map((p) => {
    const migrated: PersistedProfile = { providerType: "internal", ...p };
    if (!migrated.apiKey || !safeStorage.isEncryptionAvailable()) return migrated as RuntimeProfile;
    try {
      return { ...migrated, apiKey: safeStorage.decryptString(Buffer.from(migrated.apiKey, "base64")) };
    } catch {
      return { ...migrated, apiKey: undefined }; // undecryptable (e.g. moved machines) — drop, don't expose garbage
    }
  });
}

export interface ShortcutConfig {
  toggleQuick: string;  // global quick-entry window
  showWindow:  string;  // bring main window to front
  newChat:     string;  // new conversation
}

export interface UnrealEngineConfig {
  root: string;
  version: string;
  editorPath: string;
  commandPath: string;
}

export interface AppConfig {
  activeProfileId:     string;
  profiles:            RuntimeProfile[];
  allowedExtensionIds: string[]; // Chrome extension IDs for the browser bridge
  unrealEngine?: UnrealEngineConfig;
  wizardComplete?:     boolean;
  shortcuts?:          Partial<ShortcutConfig>;
  trayHintShown?:      boolean;
  /** D2 routing block — see electron/routing-config.ts for the schema and the
   * reason it is stored as three top-level keys. All optional: absent means the
   * effective table is derived from the active profile, so an install predating D2
   * routes on unchanged behaviour. */
  runStyle?: RunStyle;
  engines?:  Record<string, EngineConfig>;
  routing?:  Record<string, RouteTarget>;
}

function defaultShortcuts(): ShortcutConfig {
  const mac = process.platform === "darwin";
  return {
    toggleQuick: mac ? "Option+Space"    : "Control+Shift+Space",
    showWindow:  mac ? "Command+Shift+M"  : "Control+Shift+M",
    newChat:     mac ? "Command+Shift+N"  : "Control+Shift+N",
  };
}

// Seed profiles — installed on first run if config.json doesn't exist.
// Memex Desktop is local-only: every install reaches the runtime its own user
// runs, so there is no hosted seed here. `migrateLocalOnlyProfiles` strips the
// retired "Memex Anywhere" profile from configs written before that decision.
const SEED_PROFILES: RuntimeProfile[] = [
  {
    id:           "home-lan",
    name:         "Home LAN",
    providerType: "internal",
    agentRuntime: "http://192.168.2.101:8008",
    mempalace:    "http://192.168.2.102:8200",
    ollama:       "http://192.168.2.101:11434",
    defaultModel: "qwen3:14b",
    readonly:     true,
  },
  {
    id:           "localhost",
    name:         "Localhost",
    providerType: "internal",
    // Lovelace's WSL/Docker port relay listens on IPv6 loopback.  An explicit
    // address avoids Windows resolving localhost to an unusable IPv4 route.
    agentRuntime: "http://[::1]:8008",
    // Memory is a companion service on Hopper, not a local process.
    mempalace:    "http://192.168.2.102:8200",
    // Model availability for the picker is discovered against this address by
    // engine-registry.ts — the harness is no longer the authority on what models
    // exist. Inference *health* still derives from the harness node registry
    // (health.ts), which is the half of D1 not moved yet.
    ollama:       "http://[::1]:11434",
    defaultModel: "qwen3:14b",
    readonly:     true,
  },
];

// Desktop is local-first.  The active route on a fresh install is the harness on
// this machine; there is no hosted profile left to sign into.
const DEFAULT_ACTIVE = LOCAL_DEFAULT_PROFILE_ID;

/**
 * The config with a routing block, when it does not already carry one.
 * `migrateToRouting` is idempotent and copies unknown keys through, so this is safe
 * to call on every read; a stored block — even an unfinished one — is left as the
 * user wrote it and reported on by `validateRouting` instead.
 */
function withRouting<T extends AppConfig>(config: T): T {
  const routed = migrateToRouting(config as unknown as Record<string, unknown>);
  return routed.changed ? (routed.config as unknown as T) : config;
}

/** The stored block as the file has it, or null when it has never been written. */
function storedRouting(config: AppConfig): RoutingConfig | null {
  return readRoutingBlock(config as unknown as Record<string, unknown>);
}

/**
 * The three stored keys, passed to the validator un-coerced.
 *
 * `storedRouting` above yields a usable view and so stands in a default for a value
 * it cannot read; validating *that* would swallow a `"routing": "qwen3:8b"` line
 * without a word. This is the same object with nothing filled in, so every nonsense
 * value in the file reaches `validateRouting` and comes back as a path.
 */
function routingCandidate(config: AppConfig): Record<string, unknown> | null {
  if (config.engines === undefined) return null; // no block at all; the derived table is what gets validated
  return { runStyle: config.runStyle, engines: config.engines, routing: config.routing };
}

function reason(e: unknown): string {
  return e instanceof Error ? e.message : String(e);
}

export class ConfigStore {
  private configPath: string;
  private config:     AppConfig;
  /** Why the file on disk could not be read, when it could not. See `persist()`. */
  private fileError:  string | null = null;
  /** What is wrong with the stored routing block, as reported on load. Never repaired. */
  private routingIssues: RoutingIssue[] = [];

  constructor(userData: string) {
    this.configPath = join(userData, "config.json");
    this.config     = this.load();
    this.refreshRoutingIssues();
  }

  /** What is wrong with the routing, recomputed from the stored keys as written (or
   * from the derived table when the file declares none). */
  private refreshRoutingIssues(): void {
    this.routingIssues = validateRouting(routingCandidate(this.config) ?? this.getRouting());
  }

  private load(): AppConfig {
    if (!existsSync(this.configPath)) {
      // First run — there is nothing on disk to lose, so write the seeds.
      const config = withRouting({ activeProfileId: DEFAULT_ACTIVE, profiles: [...SEED_PROFILES], allowedExtensionIds: [] });
      this.persist(config);
      return config;
    }

    let raw: AppConfig;
    try {
      raw = JSON.parse(readFileSync(this.configPath, "utf-8")) as AppConfig;
    } catch (e) {
      return this.unreadable(`could not be parsed (${reason(e)})`);
    }

    try {
      raw.profiles = decryptProfilesFromDisk(raw.profiles as unknown as LegacyPersistedProfile[]);
      // Memex Anywhere was retired on 2026-09-24 (see profile-migration.ts).
      // Removing its seed is not enough: a config written while it existed
      // still carries the profile, so drop it on load and re-point the active
      // route if that profile was the one in use.
      const migrated = migrateLocalOnlyProfiles(raw.profiles, raw.activeProfileId);
      raw.profiles        = migrated.profiles;
      raw.activeProfileId = migrated.activeProfileId;
      // Ensure seed profiles are always present (add if missing from stored config)
      for (const seed of SEED_PROFILES) {
        if (!raw.profiles.find((p) => p.id === seed.id)) {
          raw.profiles.unshift(seed);
        }
      }
      // Repair the original localhost seed on existing installs. It pointed
      // to IPv4-only loopback and a memory service that is not local on this
      // workstation, so a working harness was displayed as three failures.
      const localhostSeed = SEED_PROFILES.find((p) => p.id === "localhost")!;
      const localhost = raw.profiles.find((p) => p.id === "localhost");
      const repairedSeed = !!(localhost && localhost.readonly && localhost.agentRuntime === "http://localhost:8008");
      if (repairedSeed) Object.assign(localhost, localhostSeed);

      // D2: a config written before the routing block existed gets one derived from
      // the profile that is active *after* the migrations above, so the engines it
      // names are the ones the route in use actually runs. Together with the seed
      // repair this is the only place a read writes, and it writes once.
      const routed = withRouting(raw);
      if (migrated.changed || repairedSeed || routed !== raw) this.persist(routed);
      return routed;
    } catch (e) {
      // The file parsed, but it is not a config this build can migrate (a missing
      // `profiles` array is the usual hand-edit). Same rule as a syntax error.
      return this.unreadable(`could not be read (${reason(e)})`);
    }
  }

  /**
   * A file that exists but cannot be read is left exactly as it is.
   *
   * The old shape of this method fell through to the first-run write, so a stray
   * comma in a hand-edit replaced the user's config with seeds — the file became
   * the thing that needed migrating, and the mistake that proved it was unreadable
   * was gone. An in-memory default keeps the app running; `fileError` disables every
   * further write for the session (see `persist()`) so a later unrelated save cannot
   * clobber it either, and the errors reach the renderer via `routing:get`.
   */
  private unreadable(reason: string): AppConfig {
    this.fileError = reason;
    return withRouting({ activeProfileId: DEFAULT_ACTIVE, profiles: [...SEED_PROFILES], allowedExtensionIds: [] });
  }

  private persist(config: AppConfig): void {
    if (this.fileError) return; // see unreadable(): never overwrite a file we could not read
    try {
      const toWrite = { ...config, profiles: encryptProfilesForDisk(config.profiles) };
      writeFileSync(this.configPath, JSON.stringify(toWrite, null, 2), "utf-8");
    } catch {}
  }

  private save(): void { this.persist(this.config); }

  getAll(): RuntimeProfile[] { return this.config.profiles; }

  getActive(): RuntimeProfile {
    return (
      this.config.profiles.find((p) => p.id === this.config.activeProfileId) ??
      this.config.profiles[0]!
    );
  }

  getActiveId(): string { return this.config.activeProfileId; }

  setActive(id: string): boolean {
    if (!this.config.profiles.find((p) => p.id === id)) return false;
    this.config.activeProfileId = id;
    this.save();
    return true;
  }

  saveProfile(profile: RuntimeProfile): RuntimeProfile {
    if (!profile.id) profile = { ...profile, id: randomUUID() };
    if (!profile.providerType) profile = { ...profile, providerType: "internal" };
    const idx = this.config.profiles.findIndex((p) => p.id === profile.id);
    if (idx >= 0) {
      this.config.profiles[idx] = profile;
    } else {
      this.config.profiles.push(profile);
    }
    this.save();
    return profile;
  }

  deleteProfile(id: string): boolean {
    const seed = SEED_PROFILES.find((s) => s.id === id);
    if (seed) return false; // cannot delete seed profiles
    const before = this.config.profiles.length;
    this.config.profiles = this.config.profiles.filter((p) => p.id !== id);
    if (this.config.activeProfileId === id) {
      this.config.activeProfileId = this.config.profiles[0]?.id ?? DEFAULT_ACTIVE;
    }
    this.save();
    return this.config.profiles.length < before;
  }

  // Extension IDs for the browser bridge
  getAllowedExtensionIds(): string[] { return this.config.allowedExtensionIds ?? []; }
  setAllowedExtensionIds(ids: string[]): void {
    this.config.allowedExtensionIds = ids.filter((id) => /^[a-z]{32}$/.test(id)); // Chrome IDs are 32 lowercase letters
    this.save();
  }

  // Setup wizard completion
  getWizardComplete(): boolean { return this.config.wizardComplete ?? false; }
  setWizardComplete(): void    { this.config.wizardComplete = true; this.save(); }
  requireWizard(): void        { this.config.wizardComplete = false; this.save(); }

  // One-time "still running in the tray" notification, shown the first time
  // the window is closed-to-tray rather than quit.
  getTrayHintShown(): boolean { return this.config.trayHintShown ?? false; }
  setTrayHintShown(): void    { this.config.trayHintShown = true; this.save(); }

  // Global keyboard shortcuts (merged over platform defaults)
  getShortcuts(): ShortcutConfig {
    return { ...defaultShortcuts(), ...(this.config.shortcuts ?? {}) };
  }
  setShortcuts(sc: Partial<ShortcutConfig>): ShortcutConfig {
    this.config.shortcuts = { ...this.getShortcuts(), ...sc };
    this.save();
    return this.getShortcuts();
  }

  getUnrealEngine(): UnrealEngineConfig | null { return this.config.unrealEngine ?? null; }
  setUnrealEngine(engine: UnrealEngineConfig): UnrealEngineConfig {
    this.config.unrealEngine = engine;
    this.save();
    return engine;
  }

  // ── Routing table (D2) ────────────────────────────────────────────────────

  /** The effective table: what the file declares, or what the active profile
   * implies when the file declares nothing yet. Never validated-then-repaired — an
   * invalid stored block comes back as it was written, with `getRoutingErrors()`
   * saying what is wrong, because the user's file is the source of truth and a
   * "helpful" fix here is what they would then never find out about. */
  getRouting(): RoutingConfig {
    return storedRouting(this.config) ?? deriveRoutingFromProfile(this.getActive());
  }

  /** Everything wrong with the routing, in one pass, each with a path. A file that
   * could not be read at all is reported here too — it is the same hand-edit, only
   * further from being a routing table. */
  getRoutingErrors(): RoutingIssue[] {
    if (this.fileError) {
      return [{
        path: "config.json",
        message: `config.json ${this.fileError}. It was left untouched and will not be written this session — repair it and restart.`,
      }];
    }
    return this.routingIssues;
  }

  /** The stored block and its problems together, which is what the renderer needs:
   * a table it can resolve against plus a reason to say it is not trustworthy. */
  getRoutingState(): RoutingState {
    return { routing: this.getRouting(), errors: this.getRoutingErrors() };
  }

  /**
   * Persist a routing table, or refuse.
   *
   * Rejection is the whole point: an invalid table writes nothing at all — not an
   * empty one, not a partial one — so the file keeps the routing that was working
   * before the edit. `validateRouting` reports every problem in one pass, which is
   * also what makes the file worth hand-editing.
   */
  saveRouting(next: unknown): RoutingResult {
    const current = this.getRouting();
    if (this.fileError) {
      return {
        ok: false,
        routing: current,
        issues: this.getRoutingErrors(),
      };
    }
    const issues = validateRouting(next);
    if (issues.length) return { ok: false, routing: current, issues };

    const block = next as RoutingConfig;
    this.config.runStyle = block.runStyle;
    this.config.engines  = block.engines;
    this.config.routing  = block.routing;
    this.save();
    this.refreshRoutingIssues();
    return { ok: true, routing: this.getRouting(), issues: [] };
  }

  /** Convenience: URLs for the active profile (used in main.ts) */
  getUrls(): { agentRuntime: string; mempalace: string; ollama: string } {
    const p = this.getActive();
    return {
      agentRuntime: p.agentRuntime,
      mempalace:    p.mempalace,
      ollama:       p.ollama ?? DEFAULT_OLLAMA_BASE_URL,
    };
  }
}

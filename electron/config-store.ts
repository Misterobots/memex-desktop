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

export type ProviderType = "internal" | "external";

export interface RuntimeProfile {
  id:           string;
  name:         string;
  providerType: ProviderType; // "internal" = trusted LAN host, "external" = 3rd-party API
  agentRuntime: string;
  mempalace:    string;
  ollama?:      string;
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

export interface AppConfig {
  activeProfileId:     string;
  profiles:            RuntimeProfile[];
  allowedExtensionIds: string[]; // Chrome extension IDs for the browser bridge
  wizardComplete?:     boolean;
  shortcuts?:          Partial<ShortcutConfig>;
  trayHintShown?:      boolean;
}

function defaultShortcuts(): ShortcutConfig {
  const mac = process.platform === "darwin";
  return {
    toggleQuick: mac ? "Option+Space"    : "Control+Shift+Space",
    showWindow:  mac ? "Command+Shift+M"  : "Control+Shift+M",
    newChat:     mac ? "Command+Shift+N"  : "Control+Shift+N",
  };
}

// Seed profiles — installed on first run if config.json doesn't exist
const SEED_PROFILES: RuntimeProfile[] = [
  {
    id:           "memex-anywhere",
    name:         "Memex Anywhere",
    providerType: "internal",
    // The Next.js proxy authenticates with Authentik and reaches both the
    // agent runtime and Hopper's MemPalace over private Docker/LAN links.
    // Neither private address is ever sent to a remote Desktop install.
    agentRuntime: "https://memex.shivelymedia.com/api/backend",
    mempalace:    "https://memex.shivelymedia.com/api/backend",
    readonly:     true,
  },
  {
    id:           "home-lan",
    name:         "Home LAN",
    providerType: "internal",
    agentRuntime: "http://192.168.2.101:8008",
    mempalace:    "http://192.168.2.102:8200",
    ollama:       "http://192.168.2.101:11434",
    readonly:     true,
  },
  {
    id:           "localhost",
    name:         "Localhost",
    providerType: "internal",
    agentRuntime: "http://localhost:8008",
    mempalace:    "http://localhost:8200",
    ollama:       "http://localhost:11434",
    readonly:     true,
  },
];

const DEFAULT_ACTIVE = "memex-anywhere";

export class ConfigStore {
  private configPath: string;
  private config:     AppConfig;

  constructor(userData: string) {
    this.configPath = join(userData, "config.json");
    this.config     = this.load();
  }

  private load(): AppConfig {
    if (existsSync(this.configPath)) {
      try {
        const raw = JSON.parse(readFileSync(this.configPath, "utf-8")) as AppConfig;
        raw.profiles = decryptProfilesFromDisk(raw.profiles as unknown as LegacyPersistedProfile[]);
        // A config created before Memex Anywhere existed only knows about LAN
        // addresses.  Add the new profile and make it the active route once,
        // so an upgrade does not strand a user on private 192.168.x.x hosts.
        const hadAnywhere = raw.profiles.some((p) => p.id === "memex-anywhere");
        // Ensure seed profiles are always present (add if missing from stored config)
        for (const seed of SEED_PROFILES) {
          if (!raw.profiles.find((p) => p.id === seed.id)) {
            raw.profiles.unshift(seed);
          }
        }
        if (!hadAnywhere) {
          raw.activeProfileId = DEFAULT_ACTIVE;
          this.persist(raw);
        }
        return raw;
      } catch {}
    }
    // First run — write seeds
    const config: AppConfig = { activeProfileId: DEFAULT_ACTIVE, profiles: [...SEED_PROFILES], allowedExtensionIds: [] };
    this.persist(config);
    return config;
  }

  private persist(config: AppConfig): void {
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

  /** Convenience: URLs for the active profile (used in main.ts) */
  getUrls(): { agentRuntime: string; mempalace: string; ollama: string } {
    const p = this.getActive();
    return {
      agentRuntime: p.agentRuntime,
      mempalace:    p.mempalace,
      ollama:       p.ollama ?? "http://localhost:11434",
    };
  }
}

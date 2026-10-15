import { describe, expect, it } from "vitest";
import { migrateLocalOnlyProfiles } from "../profile-migration";

const hosted = { id: "memex-anywhere", name: "Memex Anywhere" };
const local  = { id: "localhost",      name: "Localhost"      };

describe("local-only profile migration", () => {
  it("drops the hosted profile and re-points an active route that was using it", () => {
    const result = migrateLocalOnlyProfiles([hosted], "memex-anywhere");
    expect(result.profiles).toEqual([]);
    expect(result.activeProfileId).toBe("localhost");
    expect(result.changed).toBe(true);
  });

  it("leaves a config without the hosted profile untouched", () => {
    const profiles = [local, { id: "home-lan", name: "Home LAN" }];
    const result   = migrateLocalOnlyProfiles(profiles, "home-lan");
    expect(result.profiles).toBe(profiles);
    expect(result.activeProfileId).toBe("home-lan");
    expect(result.changed).toBe(false);
  });

  it("keeps user-created profiles and an active route that is not the hosted one", () => {
    const mine = { id: "9f2f0c1a-77d7-4b3a-a41f-2d5b0f9c1aa3", name: "My workstation" };
    const result = migrateLocalOnlyProfiles([hosted, mine], mine.id);
    expect(result.profiles).toEqual([mine]);
    expect(result.activeProfileId).toBe(mine.id);
    expect(result.changed).toBe(true);
  });
});

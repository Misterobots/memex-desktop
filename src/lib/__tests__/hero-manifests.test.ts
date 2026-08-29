import { describe, expect, it } from "vitest";
import { DEMO_HEROES, heroesForDiscipline } from "../hero-manifests";

describe("swarm hero manifests", () => {
  it("keeps stable unique identities and the v2 sprite contract", () => {
    const ids = DEMO_HEROES.map((hero) => hero.id);
    expect(new Set(ids).size).toBe(ids.length);
    expect(DEMO_HEROES).toHaveLength(4);
    for (const hero of DEMO_HEROES) {
      expect(hero.sprite).toMatchObject({ spriteVersionNumber: 2, cellWidth: 192, cellHeight: 208 });
      expect(hero.vignette.title).toBeTruthy();
    }
    expect(DEMO_HEROES.find((hero) => hero.id === "ada-architect")?.sprite.atlasSrc).toBe("/pets/ada-architect-v2.webp");
    expect(DEMO_HEROES.find((hero) => hero.id === "ada-architect")?.historicalIdentity).toContain("Lovelace");
    expect(DEMO_HEROES.find((hero) => hero.id === "linus-builder")?.historicalIdentity).toContain("Torvalds");
    expect(DEMO_HEROES.find((hero) => hero.id === "linus-builder")?.sprite).toMatchObject({
      atlasSrc: "/heroes/linus-torvalds-v2.webp",
      previewSrc: "/heroes/linus-torvalds-90s.png",
      interactionSrc: "/heroes/linus-code-session-12.webp",
    });
    expect(DEMO_HEROES.find((hero) => hero.id === "sagan-verifier")?.historicalIdentity).toContain("Sagan");
    expect(DEMO_HEROES.find((hero) => hero.id === "sagan-verifier")?.sprite.previewSrc).toBe("/heroes/carl-sagan-90s.png");
    expect(DEMO_HEROES.find((hero) => hero.id === "sagan-verifier")?.sprite.interactionSrc).toBe("/heroes/sagan-research-session-12.webp");
  });

  it("separates code and research hero pools", () => {
    expect(heroesForDiscipline("code").map((hero) => hero.id)).toEqual(["ada-architect", "linus-builder"]);
    expect(heroesForDiscipline("research").map((hero) => hero.id)).toEqual(["mira-researcher", "sagan-verifier"]);
  });
});

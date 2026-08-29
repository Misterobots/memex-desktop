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
  });

  it("separates code and research hero pools", () => {
    expect(heroesForDiscipline("code").map((hero) => hero.id)).toEqual(["ada-architect", "linus-builder"]);
    expect(heroesForDiscipline("research").map((hero) => hero.id)).toEqual(["mira-researcher", "sagan-verifier"]);
  });
});

import { describe, expect, it } from "vitest";
import { DEMO_HEROES, heroesForDiscipline } from "../hero-manifests";

describe("swarm hero manifests", () => {
  it("keeps stable unique identities and the v2 sprite contract", () => {
    const ids = DEMO_HEROES.map((hero) => hero.id);
    expect(new Set(ids).size).toBe(ids.length);
    expect(DEMO_HEROES).toHaveLength(19);
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
    expect(DEMO_HEROES.find((hero) => hero.id === "shannon-researcher")?.sprite.previewSrc).toBe("/heroes/claude-shannon-research-90s-refined.png");
    expect(DEMO_HEROES.find((hero) => hero.id === "shannon-researcher")?.sprite.interactionSrc).toBe("/heroes/claude-shannon-research-12-refined.webp");
    expect(DEMO_HEROES.find((hero) => hero.id === "minsky-researcher")?.sprite.previewSrc).toBe("/heroes/marvin-minsky-research-90s-refined.png");
    expect(DEMO_HEROES.find((hero) => hero.id === "johnson-researcher")?.sprite.interactionSrc).toBe("/heroes/katherine-johnson-research-12-refined.webp");
    expect(DEMO_HEROES.find((hero) => hero.id === "sagan-verifier")?.sprite.previewSrc).toBe("/heroes/carl-sagan-90s.png");
    expect(DEMO_HEROES.find((hero) => hero.id === "sagan-verifier")?.sprite.interactionSrc).toBe("/heroes/sagan-research-session-12.webp");
  });

  it("separates code and research hero pools", () => {
    expect(heroesForDiscipline("code")).toHaveLength(15);
    expect(heroesForDiscipline("research").map((hero) => hero.id)).toEqual([
      "shannon-researcher",
      "minsky-researcher",
      "johnson-researcher",
      "sagan-verifier",
    ]);
    expect(heroesForDiscipline("code").map((hero) => hero.displayName)).toEqual([
      "Charles Babbage", "Edsger Dijkstra", "Margaret Hamilton", "Donald Knuth",
      "Ada Lovelace", "Dennis Ritchie", "Vint Cerf", "Linus Torvalds", "Radia Perlman",
      "Edgar Codd", "Grace Hopper", "George Boole", "Tony Hoare", "Alan Turing", "Barbara Liskov",
    ]);
  });
});

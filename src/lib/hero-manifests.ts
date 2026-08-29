import type { HeroDiscipline, HeroManifest } from "../types/hero";

export const DEMO_HEROES: HeroManifest[] = [
  {
    id: "ada-architect",
    displayName: "Ada Lovelace",
    historicalIdentity: "Augusta Ada King, Countess of Lovelace",
    historicalEra: "1815–1852",
    historicalCues: ["Victorian mathematician", "analytical engine notes", "early algorithm design"],
    role: "Computing pioneer",
    discipline: "code",
    accent: "#00cca8",
    avatarGlyph: "A",
    vignette: { title: "Architecture desk", description: "Maps the system before the swarm builds it.", scene: "desk", prop: "diagram" },
    sprite: { atlasSrc: "/pets/ada-architect-v2.webp", spriteVersionNumber: 2, cellWidth: 192, cellHeight: 208 },
  },
  {
    id: "linus-builder",
    displayName: "Linus Torvalds",
    historicalIdentity: "Linus Torvalds",
    historicalEra: "born 1969",
    historicalCues: ["Finnish software engineer", "Linux kernel", "open-source collaboration"],
    role: "Software engineer",
    discipline: "code",
    accent: "#60a5fa",
    avatarGlyph: "L",
    vignette: { title: "Build station", description: "Turns the plan into tested working code.", scene: "terminal", prop: "terminal" },
    sprite: { atlasSrc: "/heroes/linus-torvalds-v2.webp", previewSrc: "/heroes/linus-torvalds-90s.png", interactionSrc: "/heroes/linus-code-session-12.webp", spriteVersionNumber: 2, cellWidth: 192, cellHeight: 208 },
  },
  {
    id: "sagan-verifier",
    displayName: "Carl Sagan",
    historicalIdentity: "Carl Edward Sagan",
    historicalEra: "1934–1996",
    historicalCues: ["astronomer", "science communicator", "cosmic perspective"],
    role: "Astronomer and communicator",
    discipline: "research",
    accent: "#e0b341",
    avatarGlyph: "S",
    vignette: { title: "Evidence lab", description: "Checks claims, gaps, and confidence before synthesis.", scene: "lab", prop: "evidence" },
    sprite: { previewSrc: "/heroes/carl-sagan-90s.png", interactionSrc: "/heroes/sagan-research-session-12.webp", spriteVersionNumber: 2, cellWidth: 192, cellHeight: 208 },
  },
];

export function heroesForDiscipline(discipline: HeroDiscipline): HeroManifest[] {
  return DEMO_HEROES.filter((hero) => hero.discipline === discipline);
}

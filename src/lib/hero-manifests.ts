import type { HeroDiscipline, HeroManifest } from "../types/hero";

export const DEMO_HEROES: HeroManifest[] = [
  {
    id: "ada-architect",
    displayName: "Ada",
    role: "Systems architect",
    discipline: "code",
    accent: "#00cca8",
    avatarGlyph: "A",
    vignette: { title: "Architecture desk", description: "Maps the system before the swarm builds it.", scene: "desk", prop: "diagram" },
    sprite: { atlasSrc: "/pets/ada-architect-v2.webp", spriteVersionNumber: 2, cellWidth: 192, cellHeight: 208 },
  },
  {
    id: "linus-builder",
    displayName: "Linus",
    role: "Implementation engineer",
    discipline: "code",
    accent: "#60a5fa",
    avatarGlyph: "L",
    vignette: { title: "Build station", description: "Turns the plan into tested working code.", scene: "terminal", prop: "terminal" },
    sprite: { spriteVersionNumber: 2, cellWidth: 192, cellHeight: 208 },
  },
  {
    id: "mira-researcher",
    displayName: "Mira",
    role: "Source researcher",
    discipline: "research",
    accent: "#9580ff",
    avatarGlyph: "M",
    vignette: { title: "Research library", description: "Finds and compares the strongest sources.", scene: "library", prop: "sources" },
    sprite: { spriteVersionNumber: 2, cellWidth: 192, cellHeight: 208 },
  },
  {
    id: "sagan-verifier",
    displayName: "Sagan",
    role: "Evidence verifier",
    discipline: "research",
    accent: "#e0b341",
    avatarGlyph: "S",
    vignette: { title: "Evidence lab", description: "Checks claims, gaps, and confidence before synthesis.", scene: "lab", prop: "evidence" },
    sprite: { spriteVersionNumber: 2, cellWidth: 192, cellHeight: 208 },
  },
];

export function heroesForDiscipline(discipline: HeroDiscipline): HeroManifest[] {
  return DEMO_HEROES.filter((hero) => hero.discipline === discipline);
}

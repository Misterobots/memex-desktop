export type HeroDiscipline = "code" | "research";

export type HeroWorkState =
  | "created"
  | "working"
  | "waiting"
  | "review"
  | "complete"
  | "failed";

export interface HeroV2Sprite {
  /** Codex-compatible v2 atlas; the badge may use a derived preview frame. */
  atlasSrc?: string;
  previewSrc?: string;
  spriteVersionNumber: 2;
  cellWidth: 192;
  cellHeight: 208;
}

export interface HeroVignette {
  title: string;
  description: string;
  scene: "desk" | "lab" | "library" | "terminal";
  prop?: string;
}

export interface HeroManifest {
  id: string;
  displayName: string;
  role: string;
  discipline: HeroDiscipline;
  accent: string;
  avatarGlyph: string;
  vignette: HeroVignette;
  sprite: HeroV2Sprite;
}

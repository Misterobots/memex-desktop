import type { PetDesignPreview, PetDesignRequest } from "../types/pet-designer";

export const DEFAULT_PET_DESIGN: PetDesignRequest = {
  name: "Orbit", description: "A friendly local-first companion for focused work.", species: "small fox", style: "sticker",
  personality: "curious, calm, and determined", palette: "indigo, warm cream, and a small amber accent", prop: "a tiny notebook",
  spriteVersionNumber: 2, cellWidth: 192, cellHeight: 208, atlasColumns: 8, atlasRows: 11,
};

export function buildPetPrompt(request: PetDesignRequest): string {
  return [`Create the base character for ${request.name}, a ${request.species}.`, `${request.description} Personality: ${request.personality}.`, `Use a ${request.style} mascot style with ${request.palette}.`, `The identity may include ${request.prop}, kept large and readable at pet size.`, "Show one centered full-body character on a flat removable chroma background; no scenery, text, logos, shadows, or detached effects.", "This is the canonical identity reference for a Codex-compatible v2 animated pet with 9 standard states and 16 look directions."].join(" ");
}

export function previewPetDesign(request: PetDesignRequest): PetDesignPreview {
  return { request, prompt: buildPetPrompt(request), status: "ready-for-hatching" };
}

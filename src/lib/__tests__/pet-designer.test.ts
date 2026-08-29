import { describe, expect, it } from "vitest";
import { DEFAULT_PET_DESIGN, buildPetPrompt, previewPetDesign } from "../pet-designer";

describe("pet designer contract", () => {
  it("defaults to the v2 atlas geometry", () => {
    expect(DEFAULT_PET_DESIGN).toMatchObject({ spriteVersionNumber: 2, cellWidth: 192, cellHeight: 208, atlasColumns: 8, atlasRows: 11 });
  });
  it("builds a grounded base prompt from user choices", () => {
    const prompt = buildPetPrompt({ ...DEFAULT_PET_DESIGN, name: "Nova", prop: "a brass telescope" });
    expect(prompt).toContain("Nova"); expect(prompt).toContain("brass telescope"); expect(prompt).toContain("16 look directions"); expect(prompt).toContain("removable chroma background");
  });
  it("marks a complete request ready for hatching without pretending it is packaged", () => {
    expect(previewPetDesign(DEFAULT_PET_DESIGN).status).toBe("ready-for-hatching");
  });
});

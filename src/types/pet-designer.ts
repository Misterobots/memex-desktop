export type PetStyle = "auto" | "pixel" | "plush" | "clay" | "sticker" | "flat-vector" | "3d-toy";

export interface PetDesignRequest {
  name: string;
  description: string;
  species: string;
  style: PetStyle;
  personality: string;
  palette: string;
  prop: string;
  spriteVersionNumber: 2;
  cellWidth: 192;
  cellHeight: 208;
  atlasColumns: 8;
  atlasRows: 11;
}

export interface PetDesignPreview {
  request: PetDesignRequest;
  prompt: string;
  status: "draft" | "ready-for-hatching";
}

/** Convert a pointer position into an explorer width without depending on the
 * app navigation's viewport offset. */
export function explorerWidthForPointer(pointerX: number, explorerLeft: number, viewportWidth: number): number {
  const available = Math.max(360, viewportWidth - explorerLeft - 360);
  return Math.round(Math.min(420, Math.max(180, Math.min(pointerX - explorerLeft, available))));
}

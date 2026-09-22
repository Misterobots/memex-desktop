export const DEFAULT_COMPOSER_CLEARANCE = 112;
export const COMPOSER_GAP = 12;

export function dockWidthForPointer(pointerX: number, viewportWidth: number): number {
  if (!Number.isFinite(pointerX) || !Number.isFinite(viewportWidth)) return 420;
  return Math.min(720, Math.max(300, Math.round(viewportWidth - pointerX - 12)));
}

export function dockHeightForPointer(pointerY: number, viewportHeight: number, composerClearance: number): number {
  if (!Number.isFinite(pointerY) || !Number.isFinite(viewportHeight)) return 220;
  const available = Math.max(160, viewportHeight - Math.max(112, composerClearance) - 24);
  return Math.min(600, Math.max(120, Math.min(available, Math.round(viewportHeight - pointerY - Math.max(112, composerClearance) - 12))));
}

/**
 * Return the viewport space that a bottom-fixed AgentDock must reserve so its
 * lower edge stays above the composer's top edge. The minimum keeps the dock
 * usable when a composer is not mounted (for example while the editor pane is
 * active), while the measured position handles bottom-pane splits correctly.
 */
export function composerClearanceForViewport(
  viewportHeight: number,
  composerTop: number | undefined,
  minimum = DEFAULT_COMPOSER_CLEARANCE,
  gap = COMPOSER_GAP,
): number {
  if (!Number.isFinite(viewportHeight) || !Number.isFinite(composerTop)) return minimum;
  const distanceToComposer = Math.max(0, viewportHeight - Number(composerTop));
  return Math.max(minimum, Math.ceil(distanceToComposer) + gap);
}

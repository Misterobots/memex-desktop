export const DEFAULT_COMPOSER_CLEARANCE = 112;
export const COMPOSER_GAP = 12;

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

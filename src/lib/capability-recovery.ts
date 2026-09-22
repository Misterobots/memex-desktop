/** Detect actionable environment gaps in a completed assistant response. */
export function needsUnrealSetup(content: string): boolean {
  const text = content.toLowerCase();
  return /unreal engine|\bue5?\b/.test(text) && /not available|not installed|cannot directly create|sandbox environment/.test(text);
}

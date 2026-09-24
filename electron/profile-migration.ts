/**
 * One-time migration for the retired hosted runtime profile.
 *
 * "Memex Anywhere" (https://memex.shivelymedia.com, reached with an Authentik
 * session) was removed on 2026-09-24: the desktop app always talks to an
 * inference engine its own user runs. Deleting the seed is not enough — a
 * persisted config.json still carries the profile, and `load()` re-adds any
 * missing seed, so it has to be stripped on read.
 *
 * Deliberately free of `electron` imports so it stays unit-testable.
 */
export const HOSTED_PROFILE_ID       = "memex-anywhere";
export const LOCAL_DEFAULT_PROFILE_ID = "localhost";

export interface LocalOnlyMigration<T> {
  profiles:        T[];
  activeProfileId: string;
  changed:         boolean;
}

export function migrateLocalOnlyProfiles<T extends { id: string }>(
  profiles:        T[],
  activeProfileId: string,
): LocalOnlyMigration<T> {
  const kept        = profiles.filter((p) => p.id !== HOSTED_PROFILE_ID);
  const droppedOne  = kept.length !== profiles.length;
  const wasActive   = activeProfileId === HOSTED_PROFILE_ID;
  if (!droppedOne && !wasActive) return { profiles, activeProfileId, changed: false };
  return {
    profiles:        kept,
    activeProfileId: wasActive ? LOCAL_DEFAULT_PROFILE_ID : activeProfileId,
    changed:         true,
  };
}

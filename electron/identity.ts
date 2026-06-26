/** safeStorage-backed desktop identity. Injected as X-authentik-uid on requests. */
import { safeStorage } from "electron";
import { readFileSync, writeFileSync, existsSync } from "fs";
import { join } from "path";

let currentUid = "desktop";
let identityFile = "";

export function initIdentity(userData: string): string {
  identityFile = join(userData, "identity.enc");
  try {
    if (existsSync(identityFile) && safeStorage.isEncryptionAvailable()) {
      currentUid = safeStorage.decryptString(readFileSync(identityFile));
    }
  } catch {}
  return currentUid;
}

export function getCurrentUid(): string { return currentUid; }

export function setCurrentUid(uid: string): void {
  currentUid = uid;
  try {
    if (safeStorage.isEncryptionAvailable()) {
      writeFileSync(identityFile, safeStorage.encryptString(uid));
    }
  } catch {}
}

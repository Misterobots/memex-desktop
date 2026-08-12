/**
 * Fires enabled hooks for a given event. Called fire-and-forget from
 * ipc-handlers.ts's runs:start/runs:end handlers — never awaited there, so a
 * slow or hung hook command can't block the chat turn's IPC response.
 *
 * Consent model (see hooks-store.ts's Hook.approved doc comment): the first
 * time an enabled-but-unapproved hook fires, this shows a dialog. "Always
 * allow" persists approval for that exact command (hooks-store.save() resets
 * it if the command is later edited); "Allow once" runs it this one time
 * without persisting; "Deny" disables the hook so it stops prompting.
 *
 * The global allowShell kill-switch is checked BEFORE any of that — a hook
 * never bypasses the user's blanket "no shell" policy.
 */
import { dialog, BrowserWindow } from "electron";
import { exec } from "child_process";
import { promisify } from "util";
import type { HooksStore, HookEvent, Hook } from "./hooks-store";
import type { WorkspaceFirewall, AuditDecision } from "./workspace-firewall";

const execAsync = promisify(exec);

export interface HookFireContext {
  hooks:    HooksStore;
  firewall: WorkspaceFirewall;
  getMain:  () => BrowserWindow | null;
}

export function fireHooks(event: HookEvent, ctx: HookFireContext): void {
  const matching = ctx.hooks.getAll().filter((h) => h.enabled && h.event === event);
  for (const hook of matching) {
    void fireOne(hook, ctx); // one hook's failure/slowness must not affect another's
  }
}

async function fireOne(hook: Hook, ctx: HookFireContext): Promise<void> {
  const { hooks, firewall, getMain } = ctx;

  if (!firewall.getPolicy().allowShell) {
    firewall.auditHook(hook.name, hook.command, "denied");
    return;
  }

  let decision: AuditDecision;

  if (hook.approved) {
    decision = "allowed";
  } else {
    const choice = await promptHookApproval(hook, getMain);
    if (choice === "deny") {
      hooks.setApproval(hook.id, { enabled: false });
      firewall.auditHook(hook.name, hook.command, "denied");
      return;
    }
    if (choice === "always") {
      hooks.setApproval(hook.id, { approved: true });
      decision = "allowed";
    } else {
      decision = "approved_once"; // fires now, prompts again next time
    }
  }

  try {
    await execAsync(hook.command, { cwd: hook.cwd, timeout: 30000 });
  } catch {
    // Command itself failing (bad exit code, not found, etc.) is the hook
    // author's problem, not a permission problem — still audit as fired.
  }
  firewall.auditHook(hook.name, hook.command, decision);
}

async function promptHookApproval(
  hook: Hook, getMain: () => BrowserWindow | null,
): Promise<"once" | "always" | "deny"> {
  const w = getMain() ?? BrowserWindow.getFocusedWindow();
  const opts = {
    type: "question" as const,
    title: "Hook wants to run a command",
    message: `Hook "${hook.name}" wants to run:`,
    detail: `${hook.command}${hook.cwd ? `\n\nDirectory: ${hook.cwd}` : ""}\n\nTriggered on: ${hook.event}`,
    buttons: ["Allow once", "Always allow", "Deny"],
    defaultId: 0, cancelId: 2, noLink: true,
  };
  const { response } = w
    ? await dialog.showMessageBox(w, opts)
    : await dialog.showMessageBox(opts);

  return response === 0 ? "once" : response === 1 ? "always" : "deny";
}

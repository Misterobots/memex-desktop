import { SkillRegistry } from "../settings/SkillRegistry";
import { isDesktop } from "../../lib/desktop";

/** Focused management surface for local project and user-level skills/plugins. */
export function SkillsView() {
  const desktop = isDesktop();
  return <div className="flex-1 overflow-y-auto bg-canvas">
    <div className="max-w-4xl mx-auto p-6 sm:p-8">
      <div className="mb-7">
        <h1 className="text-2xl font-semibold text-text">Skills & plugins</h1>
        <p className="mt-1 text-sm text-muted">Review the extensions Memex can use. Project skills take precedence over your user-level skills.</p>
      </div>
      {desktop ? <SkillRegistry /> : (
        <section className="max-w-xl rounded-xl border border-border/60 bg-surface p-5">
          <h2 className="text-sm font-semibold text-text">Local skill management is available in Memex Desktop</h2>
          <p className="mt-2 text-sm leading-6 text-muted">
            Skills can read project and user folders, so this browser view does not scan or change local files.
            Open Memex Desktop to review, enable, and export skills from <code className="font-mono text-xs">.claude/</code> and your user skill directory.
          </p>
          <div className="mt-4 grid gap-2 text-xs text-muted sm:grid-cols-2">
            <div className="rounded-lg border border-border/50 bg-surface2/30 p-3">Project skills override user skills.</div>
            <div className="rounded-lg border border-border/50 bg-surface2/30 p-3">The desktop app can refresh and export the resolved registry.</div>
          </div>
        </section>
      )}
    </div>
  </div>;
}

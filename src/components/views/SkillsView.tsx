import { SkillRegistry } from "../settings/SkillRegistry";

/** Focused management surface for local project and user-level skills/plugins. */
export function SkillsView() {
  return <div className="flex-1 overflow-y-auto bg-canvas">
    <div className="max-w-4xl mx-auto p-6 sm:p-8">
      <div className="mb-7">
        <h1 className="text-2xl font-semibold text-text">Skills & plugins</h1>
        <p className="mt-1 text-sm text-muted">Review the extensions Memex can use. Project skills take precedence over your user-level skills.</p>
      </div>
      <SkillRegistry />
    </div>
  </div>;
}

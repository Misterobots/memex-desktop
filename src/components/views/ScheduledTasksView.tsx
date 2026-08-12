import { ScheduledTasks } from "../scheduled/ScheduledTasks";

/**
 * Top-level "Scheduled" tab — front-and-center rather than tucked into Settings,
 * since this is a primary feature (Codex-style scheduled tasks), not a config
 * screen. Renders the same ScheduledTasks component Settings used to host.
 */
export function ScheduledTasksView() {
  return (
    <div className="flex-1 overflow-y-auto px-6 py-6 max-w-2xl mx-auto w-full">
      <div className="mb-5">
        <h1 className="text-lg font-medium text-text">Scheduled Tasks</h1>
        <p className="text-sm text-muted mt-1">
          Run a saved prompt on a schedule — daily, on an interval, or once.
        </p>
      </div>
      <ScheduledTasks />
    </div>
  );
}

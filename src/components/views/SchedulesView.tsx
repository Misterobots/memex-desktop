import { ScheduledTasks } from "../scheduled/ScheduledTasks";

/** A focused destination for recurring work, independent of the broader Routines view. */
export function SchedulesView() {
  return <div className="flex-1 overflow-y-auto bg-canvas">
    <div className="max-w-4xl mx-auto p-6 sm:p-8">
      <div className="mb-7">
        <h1 className="text-2xl font-semibold text-text">Scheduled work</h1>
        <p className="mt-1 text-sm text-muted">Run saved prompts on a reliable schedule. Schedules survive Agent Runtime restarts.</p>
      </div>
      <ScheduledTasks />
    </div>
  </div>;
}

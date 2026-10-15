import { useDiffReviewStore } from "../../hooks/useDiffReview";

export function ReviewPanel() {
  const diffReview = useDiffReviewStore();

  if (!diffReview.pending) {
    return (
      <div className="flex-1 flex flex-col items-center justify-center text-center p-6 text-faint">
        <svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" className="mb-3 opacity-50">
          <path d="M12 20h9M16.5 3.5a2.12 2.12 0 0 1 3 3L7 19l-4 1 1-4Z" />
        </svg>
        <p className="text-sm">No active reviews</p>
        <p className="text-xs mt-1 max-w-[200px]">When an agent proposes file changes, they will appear here for your approval.</p>
      </div>
    );
  }

  return (
    <div className="flex-1 flex flex-col items-center justify-center text-center p-6 text-accent">
      <svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" className="mb-3 animate-pulse">
        <path d="M15 12a3 3 0 1 1-6 0 3 3 0 0 1 6 0Z" />
        <path d="M2.458 12C3.732 7.943 7.523 5 12 5c4.478 0 8.268 2.943 9.542 7-1.274 4.057-5.064 7-9.542 7-4.477 0-8.268-2.943-9.542-7Z" />
      </svg>
      <p className="text-sm font-medium">Review pending...</p>
      <p className="text-xs mt-1 text-faint max-w-[200px]">Check the diff overlay to approve or reject the proposed changes.</p>
    </div>
  );
}

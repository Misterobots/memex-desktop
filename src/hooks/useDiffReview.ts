import { createContext, useCallback, useContext, useRef, useState } from "react";

interface PendingReview {
  filePath:   string;
  oldContent: string;
  newContent: string;
  resolve:    (approved: boolean) => void;
}

interface DiffReviewCtx {
  pending: PendingReview | null;
  requestReview: (filePath: string, oldContent: string, newContent: string) => Promise<boolean>;
  approve: () => void;
  reject:  () => void;
}

export const DiffReviewContext = createContext<DiffReviewCtx | null>(null);

/** Returns the context value for mounting in the provider component. */
export function useDiffReviewStore(): DiffReviewCtx {
  const [pending, setPending] = useState<PendingReview | null>(null);
  const resolveRef = useRef<((v: boolean) => void) | null>(null);

  const requestReview = useCallback((filePath: string, oldContent: string, newContent: string) => {
    return new Promise<boolean>((resolve) => {
      resolveRef.current = resolve;
      setPending({ filePath, oldContent, newContent, resolve });
    });
  }, []);

  const approve = useCallback(() => {
    resolveRef.current?.(true);
    resolveRef.current = null;
    setPending(null);
  }, []);

  const reject = useCallback(() => {
    resolveRef.current?.(false);
    resolveRef.current = null;
    setPending(null);
  }, []);

  return { pending, requestReview, approve, reject };
}

export function useDiffReview(): DiffReviewCtx {
  const ctx = useContext(DiffReviewContext);
  if (!ctx) throw new Error("useDiffReview must be used inside DiffReviewProvider");
  return ctx;
}

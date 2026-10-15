import { toApiError } from '../../api/client';

export function LoadingState({ label }: { label: string }) {
  return (
    <div className="state-box" role="status" data-testid="state-loading">
      Loading {label}…
    </div>
  );
}

export function EmptyState({ children }: { children: React.ReactNode }) {
  return (
    <div className="state-box" data-testid="state-empty">
      {children}
    </div>
  );
}

export function ErrorState({ error, onRetry, label }: { error: unknown; onRetry: () => void; label: string }) {
  const apiError = toApiError(error);
  return (
    <div className="state-box" data-testid="state-error">
      <p role="alert" className="error-text">
        Couldn&apos;t load {label}. {apiError.message}
      </p>
      <button type="button" className="btn btn--secondary btn--small" onClick={onRetry}>
        Try again
      </button>
    </div>
  );
}

export function Pager({
  page,
  totalPages,
  onChange,
  label,
}: {
  page: number;
  totalPages: number;
  onChange: (page: number) => void;
  label: string;
}) {
  return (
    <nav className="pager" aria-label={`${label} pages`}>
      <button
        type="button"
        className="btn btn--secondary btn--small"
        onClick={() => onChange(page - 1)}
        disabled={page <= 1}
        data-testid="pager-prev"
      >
        Previous
      </button>
      <span data-testid="pager-label" aria-live="polite">
        Page {page} of {totalPages}
      </span>
      <button
        type="button"
        className="btn btn--secondary btn--small"
        onClick={() => onChange(page + 1)}
        disabled={page >= totalPages}
        data-testid="pager-next"
      >
        Next
      </button>
    </nav>
  );
}

export function FetchingBadge({ visible }: { visible: boolean }) {
  if (!visible) return null;
  return (
    <span className="badge badge--fetching" role="status" data-testid="state-refreshing">
      Updating…
    </span>
  );
}

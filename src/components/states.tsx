export function Spinner({ label = "Loading…" }: { label?: string }) {
  return <p className="py-8 text-center text-sm text-neutral-500">{label}</p>;
}

export function EmptyState({ title, hint }: { title: string; hint?: string }) {
  return (
    <div className="py-12 text-center">
      <p className="font-medium text-neutral-300">{title}</p>
      {hint && <p className="mt-1 text-sm text-neutral-500">{hint}</p>}
    </div>
  );
}

export function ErrorState({ message, onRetry }: { message: string; onRetry?: () => void }) {
  return (
    <div className="rounded-xl bg-red-950/40 p-4 text-center">
      <p className="text-sm text-red-200">{message}</p>
      {onRetry && (
        <button onClick={onRetry} className="mt-2 rounded-lg bg-red-900/60 px-3 py-1.5 text-sm">
          Retry
        </button>
      )}
    </div>
  );
}

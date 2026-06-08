export function PageSkeleton() {
  return (
    <div className="space-y-4" aria-label="Loading">
      <div className="h-9 w-72 animate-pulse rounded bg-gray-200" />
      <div className="grid gap-3 md:grid-cols-3">
        <div className="h-28 animate-pulse rounded-lg bg-gray-200" />
        <div className="h-28 animate-pulse rounded-lg bg-gray-200" />
        <div className="h-28 animate-pulse rounded-lg bg-gray-200" />
      </div>
      <div className="h-96 animate-pulse rounded-lg bg-gray-200" />
    </div>
  );
}

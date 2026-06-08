import type { ReportVisualization } from "@prisma/client";

export function ReportChart({
  type,
  data
}: {
  type: ReportVisualization;
  data: Array<{ label: string; value: number }>;
}) {
  const max = Math.max(...data.map((row) => Math.abs(row.value)), 1);

  if (type === "PIE") {
    return (
      <div className="grid gap-3 md:grid-cols-2">
        {data.map((row, index) => (
          <div className="flex items-center gap-3" key={`${row.label}-${index}`}>
            <span className="h-3 w-3 rounded-full bg-emerald-700" aria-hidden />
            <span className="min-w-0 flex-1 truncate text-sm">{row.label}</span>
            <span className="text-sm font-semibold">{row.value.toFixed(1)}</span>
          </div>
        ))}
      </div>
    );
  }

  return (
    <div className="space-y-3">
      {data.map((row, index) => (
        <div className="grid grid-cols-[120px_1fr_72px] items-center gap-3" key={`${row.label}-${index}`}>
          <p className="truncate text-sm text-steel">{row.label}</p>
          <div className="h-3 overflow-hidden rounded-full bg-gray-100">
            <div className="h-full rounded-full bg-emerald-700" style={{ width: `${Math.max(4, (Math.abs(row.value) / max) * 100)}%` }} />
          </div>
          <p className="text-right text-sm font-semibold">{row.value.toFixed(1)}</p>
        </div>
      ))}
    </div>
  );
}

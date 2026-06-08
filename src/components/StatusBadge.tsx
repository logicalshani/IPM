import { clsx } from "clsx";

const tones: Record<string, string> = {
  DRAFT: "bg-gray-100 text-gray-700",
  IN_PROGRESS: "bg-blue-100 text-blue-700",
  PENDING_APPROVAL: "bg-amber-100 text-amber-800",
  APPROVED: "bg-emerald-100 text-emerald-700",
  SYNCED: "bg-slate-100 text-slate-700",
  SUCCESS: "bg-emerald-100 text-emerald-700",
  FAILED: "bg-red-100 text-red-700",
  PENDING: "bg-amber-100 text-amber-800",
  NOT_SYNCED: "bg-slate-100 text-slate-700",
  DISABLED: "bg-gray-100 text-gray-700",
  NEEDS_INVESTIGATION: "bg-red-100 text-red-700",
  RECOUNT: "bg-amber-100 text-amber-800",
  CONFIRMED: "bg-emerald-100 text-emerald-700"
};

export function StatusBadge({ status }: { status: string }) {
  return (
    <span className={clsx("inline-flex rounded-full px-2.5 py-1 text-xs font-semibold", tones[status] ?? tones.DRAFT)}>
      {status.replaceAll("_", " ")}
    </span>
  );
}

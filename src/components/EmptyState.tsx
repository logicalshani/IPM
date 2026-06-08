import Link from "next/link";
import type { LucideIcon } from "lucide-react";

export function EmptyState({
  title,
  body,
  actionHref,
  actionLabel,
  icon: Icon
}: {
  title: string;
  body: string;
  actionHref: string;
  actionLabel: string;
  icon: LucideIcon;
}) {
  return (
    <section className="imp-band flex flex-col items-start gap-4 p-8">
      <div className="rounded-lg bg-emerald-50 p-3 text-emerald-700">
        <Icon size={24} aria-hidden />
      </div>
      <div>
        <h2 className="text-lg font-semibold">{title}</h2>
        <p className="mt-1 max-w-2xl text-sm text-steel">{body}</p>
      </div>
      <Link className="rounded-md bg-ink px-4 py-2 text-sm font-semibold text-white" href={actionHref}>
        {actionLabel}
      </Link>
    </section>
  );
}

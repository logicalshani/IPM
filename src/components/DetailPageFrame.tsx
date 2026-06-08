import Link from "next/link";
import type { ReactNode } from "react";
import { Clock3, MoreHorizontal } from "lucide-react";
import { StatusBadge } from "./StatusBadge";

type Breadcrumb = {
  label: string;
  href?: string;
};

type ActivityItem = {
  title: string;
  body: string;
  when: string;
};

export function DetailPageFrame({
  breadcrumbs,
  status,
  actions = ["Export", "Duplicate", "Archive"],
  activity = [],
  children
}: {
  breadcrumbs: Breadcrumb[];
  status: string;
  actions?: string[];
  activity?: ActivityItem[];
  children: ReactNode;
}) {
  const safeActivity = activity.length
    ? activity
    : [
        { title: "Viewed", body: "Detail record opened for operational review.", when: "Now" },
        { title: "Synced", body: "Latest Shopify and IMP service data loaded.", when: "Today" }
      ];

  return (
    <div className="grid gap-6 xl:grid-cols-[minmax(0,1fr)_320px]">
      <div className="space-y-6">
        <section className="imp-band p-4">
          <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
            <nav className="flex flex-wrap items-center gap-2 text-sm text-steel" aria-label="Breadcrumb">
              {breadcrumbs.map((crumb, index) => (
                <span className="inline-flex items-center gap-2" key={`${crumb.label}-${index}`}>
                  {crumb.href ? (
                    <Link className="font-semibold text-ink underline-offset-2 hover:underline" href={crumb.href}>{crumb.label}</Link>
                  ) : (
                    <span>{crumb.label}</span>
                  )}
                  {index < breadcrumbs.length - 1 && <span aria-hidden>/</span>}
                </span>
              ))}
            </nav>
            <div className="flex flex-wrap items-center gap-2">
              <StatusBadge status={status} />
              <label className="inline-flex min-h-10 items-center gap-2 rounded-md border border-gray-300 bg-white px-3 text-sm font-semibold text-ink">
                <MoreHorizontal size={16} aria-hidden />
                <span className="sr-only">Action menu</span>
                <select className="bg-transparent outline-none" defaultValue="">
                  <option value="" disabled>Action menu</option>
                  {actions.map((action) => <option key={action}>{action}</option>)}
                </select>
              </label>
            </div>
          </div>
        </section>
        {children}
      </div>

      <aside className="imp-band h-fit overflow-hidden">
        <div className="border-b border-gray-200 p-4">
          <h2 className="font-semibold">Activity feed</h2>
        </div>
        <div className="divide-y divide-gray-200">
          {safeActivity.map((item) => (
            <article className="p-4" key={`${item.title}-${item.when}`}>
              <div className="flex items-center gap-2">
                <Clock3 className="text-emerald-700" size={16} aria-hidden />
                <p className="font-semibold">{item.title}</p>
              </div>
              <p className="mt-1 text-sm text-steel">{item.body}</p>
              <p className="mt-2 text-xs font-semibold uppercase tracking-[0.12em] text-steel">{item.when}</p>
            </article>
          ))}
        </div>
      </aside>
    </div>
  );
}

import Link from "next/link";
import { BarChart3, CalendarClock, FileText } from "lucide-react";
import { EmptyState } from "@/components/EmptyState";
import { ListControls } from "@/components/ListControls";
import { Metric } from "@/components/Metric";
import { REPORT_DEFINITIONS, getReportLibrary } from "@/services/reporting.service";

const demoShopId = "demo-shop";
export const dynamic = "force-dynamic";

export default async function ReportsPage() {
  let library;
  try {
    library = await getReportLibrary(demoShopId);
  } catch {
    library = { reports: REPORT_DEFINITIONS, customReports: [], scheduledReports: [] };
  }

  return (
    <div className="space-y-6">
      <header className="flex flex-col gap-4 md:flex-row md:items-end md:justify-between">
        <div>
          <p className="text-sm font-semibold uppercase tracking-[0.12em] text-emerald-700">Analytics & reporting</p>
          <h1 className="mt-2 text-3xl font-bold">Report Library</h1>
          <p className="mt-2 max-w-3xl text-sm text-steel">
            Standalone reports with filters, charts, exports, custom report builder, scheduled delivery, and an owner-grade executive dashboard.
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          <Link className="rounded-md bg-ink px-4 py-2 text-sm font-semibold text-white" href="/reports/builder">Build report</Link>
          <Link className="rounded-md border border-gray-300 bg-white px-4 py-2 text-sm font-semibold text-ink" href="/dashboard/executive">Executive dashboard</Link>
        </div>
      </header>

      <section className="grid gap-3 md:grid-cols-4">
        <Metric label="Standard reports" value={library.reports.length} />
        <Metric label="Custom reports" value={library.customReports.length} />
        <Metric label="Scheduled emails" value={library.scheduledReports.length} />
        <Metric label="Export formats" value="CSV PDF QB" />
      </section>

      <ListControls
        searchPlaceholder="Search reports by name, metric, export type, or schedule"
        filters={["Report family", "Export type", "Schedule", "Owner view"]}
        bulkActions={["Schedule selected", "Email selected", "Export selected"]}
        columnViews={["Library", "Exports", "Schedules"]}
        exportLabel="Export library"
      />

      <section className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
        {library.reports.map((report) => (
          <Link className="imp-band block p-4 transition hover:border-emerald-700" href={`/reports/${report.key}`} key={report.key}>
            <div className="flex items-start justify-between gap-3">
              <div className="rounded-md bg-emerald-50 p-2 text-emerald-700">
                <FileText size={18} aria-hidden />
              </div>
              <p className="text-xs font-semibold uppercase text-steel">{report.exports.join(" / ")}</p>
            </div>
            <h2 className="mt-4 font-semibold">{report.title}</h2>
            <p className="mt-2 text-sm text-steel">{report.description}</p>
            <div className="mt-4 flex flex-wrap gap-2">
              {report.metrics.slice(0, 3).map((metric) => (
                <span className="rounded-md border border-gray-200 px-2 py-1 text-xs text-steel" key={metric}>{metric}</span>
              ))}
            </div>
          </Link>
        ))}
      </section>

      <section className="grid gap-4 xl:grid-cols-[1fr_1fr]">
        <div className="imp-band overflow-hidden">
          <div className="border-b border-gray-200 p-4">
            <h2 className="font-semibold">Saved custom reports</h2>
          </div>
          {library.customReports.length === 0 ? (
            <EmptyState icon={BarChart3} title="No custom reports yet" body="Use the builder to choose dimensions, metrics, filters, and visualization for a named report." actionHref="/reports/builder" actionLabel="Open builder" />
          ) : (
            <div className="divide-y divide-gray-200">
              {library.customReports.map((report) => (
                <article className="p-4" key={report.id}>
                  <p className="font-semibold">{report.name}</p>
                  <p className="mt-1 text-sm text-steel">{report.visualization} visualization</p>
                </article>
              ))}
            </div>
          )}
        </div>

        <div className="imp-band overflow-hidden">
          <div className="border-b border-gray-200 p-4">
            <h2 className="font-semibold">Scheduled delivery</h2>
          </div>
          {library.scheduledReports.length === 0 ? (
            <EmptyState icon={CalendarClock} title="No schedules yet" body="Schedule weekly email delivery for standard or custom reports." actionHref="/reports/builder" actionLabel="Schedule report" />
          ) : (
            <div className="divide-y divide-gray-200">
              {library.scheduledReports.map((schedule) => (
                <article className="p-4" key={schedule.id}>
                  <p className="font-semibold">{schedule.reportKey ?? "Custom report"}</p>
                  <p className="mt-1 text-sm text-steel">{schedule.frequency} to {schedule.recipientEmail}</p>
                </article>
              ))}
            </div>
          )}
        </div>
      </section>
    </div>
  );
}

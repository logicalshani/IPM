import Link from "next/link";
import { notFound } from "next/navigation";
import { Download, FileText } from "lucide-react";
import { DetailPageFrame } from "@/components/DetailPageFrame";
import { EmptyState } from "@/components/EmptyState";
import { ListControls } from "@/components/ListControls";
import { Metric } from "@/components/Metric";
import { REPORT_DEFINITIONS, getReportData, type ReportKey } from "@/services/reporting.service";
import { ReportChart } from "../report-chart";

const demoShopId = "demo-shop";
export const dynamic = "force-dynamic";

export default async function ReportDetailPage({
  params,
  searchParams
}: {
  params: { reportKey: string };
  searchParams: Record<string, string | undefined>;
}) {
  const definition = REPORT_DEFINITIONS.find((report) => report.key === params.reportKey);
  if (!definition) notFound();

  let report;
  try {
    report = await getReportData({
      shopId: demoShopId,
      reportKey: params.reportKey as ReportKey,
      filters: {
        dateFrom: searchParams.dateFrom,
        dateTo: searchParams.dateTo,
        location: searchParams.location,
        supplier: searchParams.supplier,
        category: searchParams.category,
        status: searchParams.status
      }
    });
  } catch {
    report = { definition, filters: searchParams, summary: [{ label: "Rows", value: 0 }], rows: [], charts: [{ title: "No data", type: definition.defaultVisualization, data: [] }] };
  }

  const exportBase = `/api/reports?shopId=${demoShopId}&reportKey=${params.reportKey}`;
  const headers = Object.keys(report.rows[0] ?? {});

  return (
    <DetailPageFrame
      breadcrumbs={[{ label: "Reports", href: "/reports" }, { label: report.definition.title }]}
      status="READY"
      actions={["Schedule email", "Export CSV", "Export PDF", "Save custom copy"]}
      activity={[
        { title: "Report generated", body: `${report.rows.length} rows matched the current filter set.`, when: "Now" },
        { title: "Exports available", body: `${report.definition.exports.join(", ")} formats are enabled for this report.`, when: "Today" }
      ]}
    >
      <div className="space-y-6">
      <header className="flex flex-col gap-4 md:flex-row md:items-end md:justify-between">
        <div>
          <p className="text-sm font-semibold uppercase tracking-[0.12em] text-emerald-700">Standalone report</p>
          <h1 className="mt-2 text-3xl font-bold">{report.definition.title}</h1>
          <p className="mt-2 max-w-3xl text-sm text-steel">{report.definition.description}</p>
        </div>
        <div className="flex flex-wrap gap-2">
          <Link className="rounded-md border border-gray-300 bg-white px-3 py-2 text-sm font-semibold text-ink" href={`${exportBase}&format=csv`}><Download className="mr-1 inline" size={14} aria-hidden />CSV</Link>
          {report.definition.exports.includes("PDF") && <Link className="rounded-md border border-gray-300 bg-white px-3 py-2 text-sm font-semibold text-ink" href={`${exportBase}&format=pdf`}>PDF</Link>}
          {report.definition.exports.includes("QuickBooks") && <Link className="rounded-md border border-gray-300 bg-white px-3 py-2 text-sm font-semibold text-ink" href={`${exportBase}&format=quickbooks`}>QuickBooks</Link>}
        </div>
      </header>

      <form className="imp-band grid gap-3 p-4 md:grid-cols-6" action={`/reports/${params.reportKey}`}>
        <label className="text-sm font-medium text-steel">From<input className="mt-1 w-full rounded-md border border-gray-300 px-3 py-2" name="dateFrom" type="date" defaultValue={searchParams.dateFrom} /></label>
        <label className="text-sm font-medium text-steel">To<input className="mt-1 w-full rounded-md border border-gray-300 px-3 py-2" name="dateTo" type="date" defaultValue={searchParams.dateTo} /></label>
        <label className="text-sm font-medium text-steel">Location<input className="mt-1 w-full rounded-md border border-gray-300 px-3 py-2" name="location" defaultValue={searchParams.location} /></label>
        <label className="text-sm font-medium text-steel">Supplier<input className="mt-1 w-full rounded-md border border-gray-300 px-3 py-2" name="supplier" defaultValue={searchParams.supplier} /></label>
        <label className="text-sm font-medium text-steel">Category<input className="mt-1 w-full rounded-md border border-gray-300 px-3 py-2" name="category" defaultValue={searchParams.category} /></label>
        <button className="self-end rounded-md bg-ink px-4 py-2 text-sm font-semibold text-white" type="submit">Apply filters</button>
      </form>

      <section className="grid gap-3 md:grid-cols-4">
        {report.summary.map((metric) => <Metric key={metric.label} label={metric.label} value={metric.value} />)}
      </section>

      <ListControls
        searchPlaceholder="Search report rows by SKU, supplier, location, category, or status"
        filters={["Date range", "Location", "Supplier", "Category"]}
        bulkActions={["Schedule email", "Export selected", "Save custom copy"]}
        columnViews={["Table", "Financial", "Operational"]}
        exportLabel="Export rows"
      />

      <section className="grid gap-4 xl:grid-cols-[0.8fr_1.2fr]">
        <div className="imp-band p-4">
          <h2 className="font-semibold">Chart</h2>
          <div className="mt-4">
            {report.charts[0].data.length === 0 ? <p className="text-sm text-steel">Chart appears after report data is available.</p> : <ReportChart type={report.charts[0].type} data={report.charts[0].data} />}
          </div>
        </div>

        <div className="imp-band overflow-hidden">
          <div className="border-b border-gray-200 p-4">
            <h2 className="font-semibold">Report rows</h2>
          </div>
          {report.rows.length === 0 ? (
            <EmptyState icon={FileText} title="No rows for this report" body="Adjust filters or connect more Shopify operational data." actionHref="/reports" actionLabel="Back to library" />
          ) : (
            <div className="overflow-x-auto">
              <table className="imp-table">
                <thead><tr>{headers.map((header) => <th key={header}>{header}</th>)}</tr></thead>
                <tbody>
                  {report.rows.slice(0, 60).map((row, index) => (
                    <tr key={index}>
                      {headers.map((header) => <td key={header}>{row[header]}</td>)}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      </section>
      </div>
    </DetailPageFrame>
  );
}

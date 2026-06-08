import { CustomReportBuilder } from "./custom-report-builder";

export default function ReportBuilderPage() {
  return (
    <div className="space-y-6">
      <header>
        <p className="text-sm font-semibold uppercase tracking-[0.12em] text-emerald-700">Custom report builder</p>
        <h1 className="mt-2 text-3xl font-bold">Build & Schedule Reports</h1>
        <p className="mt-2 max-w-3xl text-sm text-steel">
          Choose dimensions, metrics, filters, visualization, and weekly email delivery for owner or operations reporting.
        </p>
      </header>
      <CustomReportBuilder />
    </div>
  );
}

import { ArrowRightLeft, FileWarning, RotateCcw, TableProperties } from "lucide-react";
import { ListControls } from "@/components/ListControls";
import { Metric } from "@/components/Metric";
import { validateStockyRows } from "@/services/stockyMigration.service";

export default function StockyMigrationPage() {
  const fieldMapping = {
    "Stocky SKU": "sku",
    "Product Name": "name",
    Supplier: "supplierName",
    "Warehouse A": "location:Warehouse A"
  };
  const preview = validateStockyRows(
    "PRODUCTS",
    [
      { "Stocky SKU": "TEE-114", "Product Name": "Core Tee", Supplier: "Threadhouse", "Variant Option": "Size / Color", "Warehouse A": "240" },
      { "Stocky SKU": "TEE-114", "Product Name": "Core Tee - Blue", Supplier: "", "Warehouse A": "18" },
      { "Stocky SKU": "", "Product Name": "Missing SKU", Supplier: "Northline" }
    ],
    fieldMapping
  );

  return (
    <div className="space-y-6">
      <header>
        <p className="text-sm font-semibold uppercase tracking-[0.12em] text-emerald-700">Stocky migration</p>
        <h1 className="mt-2 text-3xl font-bold">CSV Import, Validation & Rollback</h1>
        <p className="mt-2 max-w-3xl text-sm text-steel">
          Import suppliers, products, POs, counts, transfers, and history with field mapping, dry-run validation, progress logs, rollback, and post-migration audit.
        </p>
      </header>

      <section className="grid gap-3 md:grid-cols-4">
        <Metric label="Preview rows" value={preview.rows.length} />
        <Metric label="Valid rows" value={preview.validRows} />
        <Metric label="Errors" value={preview.errors.length} tone={preview.errors.length ? "text-signal" : undefined} />
        <Metric label="Warnings" value={preview.warnings.length} />
      </section>

      <ListControls
        searchPlaceholder="Search migration rows, Stocky columns, mapped fields, or validation messages"
        filters={["Entity type", "Validation status", "Location format", "Duplicate state"]}
        bulkActions={["Dry run", "Rollback job", "Export errors"]}
        columnViews={["Mapper", "Validation", "Progress"]}
        exportLabel="Export audit"
      />

      <section className="grid gap-4 xl:grid-cols-[0.8fr_1.2fr]">
        <div className="imp-band p-4">
          <TableProperties className="text-emerald-700" size={22} aria-hidden />
          <h2 className="mt-3 font-semibold">Field mapper</h2>
          <p className="mt-1 text-sm text-steel">Drag Stocky columns to IMP fields in the production UI. This preview shows the saved mapping shape.</p>
          <div className="mt-4 space-y-2">
            {Object.entries(fieldMapping).map(([stocky, imp]) => (
              <div className="grid grid-cols-[1fr_auto_1fr] items-center gap-2 rounded-md border border-gray-200 p-2 text-sm" key={stocky}>
                <span>{stocky}</span>
                <ArrowRightLeft className="text-emerald-700" size={16} aria-hidden />
                <span className="font-semibold">{imp}</span>
              </div>
            ))}
          </div>
        </div>

        <div className="imp-band overflow-hidden">
          <div className="border-b border-gray-200 p-4">
            <h2 className="font-semibold">Validation preview</h2>
          </div>
          <table className="imp-table">
            <thead><tr><th>Type</th><th>Row</th><th>Field</th><th>Message</th></tr></thead>
            <tbody>
              {[...preview.errors.map((item) => ({ type: "Error", ...item })), ...preview.warnings.map((item) => ({ type: "Warning", ...item }))].map((item, index) => (
                <tr key={`${item.type}-${item.rowNumber}-${index}`}>
                  <td className={item.type === "Error" ? "variance-critical" : "variance-warning"}>{item.type}</td>
                  <td>{item.rowNumber}</td>
                  <td>{item.field}</td>
                  <td>{item.message}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>

      <section className="grid gap-4 md:grid-cols-3">
        <article className="imp-band p-4">
          <FileWarning className="text-emerald-700" size={22} aria-hidden />
          <h2 className="mt-3 font-semibold">Dry-run mode</h2>
          <p className="mt-1 text-sm text-steel">Simulates import without writes and produces duplicate SKU, missing field, and Stocky quirk warnings.</p>
        </article>
        <article className="imp-band p-4">
          <RotateCcw className="text-emerald-700" size={22} aria-hidden />
          <h2 className="mt-3 font-semibold">Rollback</h2>
          <p className="mt-1 text-sm text-steel">Migration jobs carry rollback tokens so imported entities can be reverted as one compliance-audited operation.</p>
        </article>
        <article className="imp-band p-4">
          <TableProperties className="text-emerald-700" size={22} aria-hidden />
          <h2 className="mt-3 font-semibold">Progress log</h2>
          <p className="mt-1 text-sm text-steel">Each entity type logs row-level progress, skips, reasons, mapped values, and imported record IDs.</p>
        </article>
      </section>
    </div>
  );
}

import { CheckSquare, Columns3, Download, Filter, Search } from "lucide-react";

type ListControlsProps = {
  searchPlaceholder?: string;
  filters?: string[];
  bulkActions?: string[];
  columnViews?: string[];
  exportLabel?: string;
};

export function ListControls({
  searchPlaceholder = "Search by SKU, supplier, location, or status",
  filters = ["Status", "Location", "Supplier", "Category"],
  bulkActions = ["Bulk approve", "Bulk tag", "Bulk export"],
  columnViews = ["Core", "Financial", "Operations"],
  exportLabel = "Export"
}: ListControlsProps) {
  return (
    <section className="imp-band p-3" aria-label="List controls">
      <div className="grid gap-3 lg:grid-cols-[minmax(220px,1fr)_auto_auto_auto_auto] lg:items-center">
        <label className="relative block">
          <Search className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-steel" size={16} aria-hidden />
          <span className="sr-only">Search list</span>
          <input
            className="min-h-12 w-full rounded-md border border-gray-300 bg-white py-2 pl-9 pr-3 text-sm text-ink outline-none focus:border-emerald-700 focus:ring-2 focus:ring-emerald-100"
            placeholder={searchPlaceholder}
            type="search"
          />
        </label>

        <label className="flex min-h-12 items-center gap-2 rounded-md border border-gray-300 bg-white px-3 text-sm font-semibold text-ink">
          <Filter size={16} aria-hidden />
          <span className="sr-only">Filters</span>
          <select className="bg-transparent outline-none" defaultValue="">
            <option value="" disabled>Filters</option>
            {filters.map((filter) => <option key={filter}>{filter}</option>)}
          </select>
        </label>

        <label className="flex min-h-12 items-center gap-2 rounded-md border border-gray-300 bg-white px-3 text-sm font-semibold text-ink">
          <CheckSquare size={16} aria-hidden />
          <span className="sr-only">Bulk actions</span>
          <select className="bg-transparent outline-none" defaultValue="">
            <option value="" disabled>Bulk actions</option>
            {bulkActions.map((action) => <option key={action}>{action}</option>)}
          </select>
        </label>

        <label className="flex min-h-12 items-center gap-2 rounded-md border border-gray-300 bg-white px-3 text-sm font-semibold text-ink">
          <Columns3 size={16} aria-hidden />
          <span className="sr-only">Columns</span>
          <select className="bg-transparent outline-none" defaultValue="">
            <option value="" disabled>Columns</option>
            {columnViews.map((view) => <option key={view}>{view}</option>)}
          </select>
        </label>

        <button className="inline-flex min-h-12 items-center justify-center gap-2 rounded-md bg-ink px-4 text-sm font-semibold text-white" type="button">
          <Download size={16} aria-hidden />
          {exportLabel}
        </button>
      </div>
    </section>
  );
}

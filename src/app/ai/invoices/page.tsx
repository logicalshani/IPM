import { InvoiceParserPanel } from "./parser-panel";

export default function InvoicesPage() {
  return (
    <div className="space-y-6">
      <header>
        <p className="text-sm font-semibold uppercase tracking-[0.12em] text-emerald-700">AI invoice parser</p>
        <h1 className="mt-2 text-3xl font-bold">Invoice & Document Parser</h1>
        <p className="mt-2 max-w-3xl text-sm text-steel">
          Upload invoice PDFs/images, extract supplier and line data, match to POs, flag discrepancies, approve receipt, and export accounting rows.
        </p>
      </header>
      <InvoiceParserPanel />
    </div>
  );
}

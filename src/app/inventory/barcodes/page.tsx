import { QrCode, Printer, ScanLine } from "lucide-react";
import { EmptyState } from "@/components/EmptyState";
import { BarcodeGeneratorForm } from "./barcode-generator-form";
import { LabelDesigner } from "./label-designer";

export default function BarcodesPage() {
  return (
    <div className="space-y-6">
      <header>
        <p className="text-sm font-semibold uppercase tracking-[0.12em] text-emerald-700">Barcode operations</p>
        <h1 className="mt-2 text-3xl font-bold">Barcode System</h1>
        <p className="mt-2 max-w-3xl text-sm text-steel">
          Generate EAN-13, Code-128, QR, and DataMatrix assets, design labels, and drive scan-first receiving, stocktakes, and transfers.
        </p>
      </header>

      <section className="grid gap-4 lg:grid-cols-[1fr_1.2fr]">
        <div className="imp-band p-4">
          <div className="mb-4 flex items-center gap-2">
            <QrCode size={20} />
            <h2 className="font-semibold">Generator</h2>
          </div>
          <BarcodeGeneratorForm />
        </div>
        <div className="imp-band p-4">
          <div className="mb-4 flex items-center gap-2">
            <Printer size={20} />
            <h2 className="font-semibold">Label designer</h2>
          </div>
          <LabelDesigner />
        </div>
      </section>

      <EmptyState
        icon={ScanLine}
        title="Mobile PWA scanner ready"
        body="Open the scanner route on a warehouse device to use camera-based scanning with offline capture and sync when the connection returns."
        actionHref="/inventory/scanner"
        actionLabel="Open scanner"
      />
    </div>
  );
}

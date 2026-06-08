import { MobileScanner } from "./scanner";

export default function ScannerPage() {
  return (
    <div className="space-y-6">
      <header>
        <p className="text-sm font-semibold uppercase tracking-[0.12em] text-emerald-700">Warehouse PWA</p>
        <h1 className="mt-2 text-3xl font-bold">Mobile Scanner</h1>
        <p className="mt-2 max-w-3xl text-sm text-steel">
          Scan a location first, then scan inventory items for receiving, stocktakes, or transfer verification. Offline scans are queued locally.
        </p>
      </header>
      <MobileScanner />
    </div>
  );
}

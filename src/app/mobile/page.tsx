import { ClipboardCheck, PackagePlus, QrCode, Repeat2 } from "lucide-react";

export const metadata = { title: "IMP Mobile Warehouse" };

const actions = [
  { label: "Scan", icon: QrCode, body: "Camera scan queue with haptic feedback and offline cache." },
  { label: "Receive", icon: PackagePlus, body: "Receive POs and hold payloads until reconnect." },
  { label: "Count", icon: ClipboardCheck, body: "Offline stocktakes with local variance preview." },
  { label: "Transfers", icon: Repeat2, body: "Confirm origin, destination, and in-transit units." }
];

export default function MobilePage() {
  return (
    <div className="min-h-screen bg-white pb-24">
      <header className="bg-ink p-5 text-white">
        <p className="text-sm font-semibold uppercase tracking-[0.12em] text-emerald-300">Warehouse PWA</p>
        <h1 className="mt-2 text-2xl font-bold">IMP Mobile</h1>
        <p className="mt-2 text-sm text-gray-200">Offline-first scanning, receiving, counts, and transfers for iOS and Android.</p>
      </header>
      <main className="grid gap-4 p-4">
        {actions.map((action) => {
          const Icon = action.icon;
          return (
            <button className="min-h-24 rounded-lg border border-gray-200 bg-white p-4 text-left shadow-sm active:bg-emerald-50" key={action.label}>
              <div className="flex items-center gap-3">
                <span className="flex h-12 w-12 items-center justify-center rounded-md bg-emerald-50 text-emerald-700"><Icon size={24} aria-hidden /></span>
                <div>
                  <p className="text-lg font-semibold">{action.label}</p>
                  <p className="text-sm text-steel">{action.body}</p>
                </div>
              </div>
            </button>
          );
        })}
        <section className="rounded-lg border border-gray-200 bg-gray-50 p-4">
          <h2 className="font-semibold">Offline sync status</h2>
          <p className="mt-2 text-sm text-steel">Queued payloads sync automatically on reconnect through `/api/platform/mobile-sync`.</p>
        </section>
      </main>
      <nav className="fixed inset-x-0 bottom-0 grid grid-cols-4 border-t border-gray-200 bg-white">
        {actions.map((action) => {
          const Icon = action.icon;
          return (
            <button className="flex min-h-16 flex-col items-center justify-center gap-1 text-xs font-semibold text-ink" key={action.label}>
              <Icon size={20} aria-hidden />
              {action.label}
            </button>
          );
        })}
      </nav>
    </div>
  );
}

import type { Metadata } from "next";
import Link from "next/link";
import { BarChart3, Bot, Boxes, Building2, ClipboardList, DollarSign, FileText, Gauge, Handshake, LineChart, PackageCheck, PlugZap, QrCode, Repeat2, Rocket, ScanLine, Settings, ShieldCheck, Tags, Trophy } from "lucide-react";
import { KeyboardShortcuts } from "./keyboard-shortcuts";
import { Providers } from "./providers";
import "./globals.css";

export const metadata: Metadata = {
  title: "Inventory Manager Pro",
  description: "AI-native Shopify inventory operations platform"
};

const navGroups = [
  {
    label: "Operations",
    items: [
      { href: "/dashboard/executive", label: "Executive", icon: Gauge },
      { href: "/inventory/stocktakes", label: "Stocktakes", icon: Boxes },
      { href: "/inventory/barcodes", label: "Barcodes", icon: QrCode },
      { href: "/inventory/scanner", label: "Scanner", icon: ScanLine },
      { href: "/operations", label: "Operations", icon: Repeat2 },
      { href: "/purchase-orders", label: "Purchase Orders", icon: PackageCheck }
    ]
  },
  {
    label: "Intelligence",
    items: [
      { href: "/inventory/analytics", label: "Analytics", icon: BarChart3 },
      { href: "/ai/consultant", label: "AI Consultant", icon: Bot },
      { href: "/ai/demand", label: "Demand", icon: LineChart },
      { href: "/ai/invoices", label: "Invoices", icon: FileText },
      { href: "/ai/simulations", label: "Simulations", icon: Trophy },
      { href: "/reports", label: "Reports", icon: ClipboardList }
    ]
  },
  {
    label: "Suppliers",
    items: [
      { href: "/suppliers", label: "Suppliers", icon: Handshake },
      { href: "/suppliers/pricing", label: "Pricing", icon: Tags }
    ]
  },
  {
    label: "Finance",
    items: [{ href: "/financial", label: "Financial", icon: DollarSign }]
  },
  {
    label: "Platform",
    items: [
      { href: "/platform", label: "Platform", icon: PlugZap },
      { href: "/platform/migration", label: "Migration", icon: ClipboardList },
      { href: "/platform/infrastructure", label: "Infrastructure", icon: Building2 },
      { href: "/compliance", label: "Compliance", icon: ShieldCheck }
    ]
  },
  {
    label: "Settings",
    items: [
      { href: "/onboarding", label: "Onboarding", icon: Rocket },
      { href: "/settings/billing", label: "Billing", icon: DollarSign },
      { href: "/settings/features", label: "Features", icon: Settings }
    ]
  }
];

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body>
        <Providers>
          <KeyboardShortcuts />
          <div className="imp-shell">
            <aside className="imp-sidebar">
              <div className="mb-8">
                <p className="text-xs font-bold uppercase tracking-[0.18em] text-emerald-300">Shopify Ops</p>
                <p className="mt-2 text-xl font-bold">Inventory Manager Pro</p>
              </div>
              <nav className="space-y-2">
                {navGroups.map((group) => (
                  <details className="imp-nav-group" key={group.label} open>
                    <summary>{group.label}</summary>
                    <div className="mt-1 space-y-1">
                      {group.items.map((item) => {
                        const Icon = item.icon;
                        return (
                          <Link className="imp-link" href={item.href} key={item.href}>
                            <Icon aria-hidden size={18} />
                            <span>{item.label}</span>
                          </Link>
                        );
                      })}
                    </div>
                  </details>
                ))}
              </nav>
            </aside>
            <main className="imp-main">{children}</main>
          </div>
        </Providers>
      </body>
    </html>
  );
}

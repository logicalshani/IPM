import { Info } from "lucide-react";

const formulaHints: Record<string, string> = {
  "Reliability score": "Reliability Score = on-time rate x 0.5 + fill rate x 0.3 + invoice accuracy x 0.2",
  "On-time delivery": "On-time delivery = on-time POs / completed POs",
  "Fill rate": "Fill rate = received quantity / ordered quantity",
  "Invoice accuracy": "Invoice accuracy = invoices matching PO price within tolerance / audited invoices",
  "30-day cash need": "30-day cash need = pending inventory payments due in 30 days - expected inventory-funded sales cash in",
  "CCC days": "Cash conversion cycle = days inventory outstanding + days sales outstanding - days payable outstanding",
  DIO: "Days inventory outstanding = average inventory value / COGS per day",
  DSO: "Days sales outstanding = receivables / revenue per day",
  DPO: "Days payable outstanding = payables / COGS per day",
  "Inventory value": "Inventory value = on-hand units x selected costing method",
  "Shrinkage value": "Shrinkage value = lost units x unit cost",
  "% revenue": "Shrinkage percentage = shrinkage value / revenue",
  "Critical variances": "Critical variances = stocktake lines over 5% or $50 discrepancy",
  "Lead-time alerts": "Lead-time alerts = suppliers degraded more than 20% vs average lead time",
  "3PL mismatches": "3PL mismatches = warehouse quantity snapshots that differ from Shopify inventory"
};

function metricFormula(label: string, formula?: string) {
  if (formula) {
    return formula;
  }
  return formulaHints[label] ?? `${label} is calculated from the current filtered operational data.`;
}

export function Metric({
  label,
  value,
  tone,
  formula
}: {
  label: string;
  value: string | number;
  tone?: string;
  formula?: string;
}) {
  const hint = metricFormula(label, formula);
  return (
    <div className="imp-band p-4" title={hint}>
      <div className="flex items-center gap-2">
        <p className="text-sm font-medium text-steel">{label}</p>
        <Info aria-label={hint} className="text-emerald-700" size={14} />
      </div>
      <p className={`mt-2 text-3xl font-bold ${tone ?? "text-ink"}`}>{value}</p>
    </div>
  );
}

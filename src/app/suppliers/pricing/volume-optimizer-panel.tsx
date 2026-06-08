"use client";

import { useState } from "react";
import { Button, TextField } from "@shopify/polaris";

export function VolumeOptimizerPanel() {
  const [budget, setBudget] = useState("5000");
  const [result, setResult] = useState<Array<Record<string, unknown>>>([]);
  const [loading, setLoading] = useState(false);

  async function optimize() {
    setLoading(true);
    const response = await fetch("/api/suppliers/volume-optimizer", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ shopId: "demo-shop", budget: Number(budget) })
    });
    const payload = await response.json();
    setResult(payload.data ?? []);
    setLoading(false);
  }

  return (
    <section className="imp-band p-4">
      <h2 className="font-semibold">Volume discount optimizer</h2>
      <div className="mt-4 space-y-4">
        <TextField label="Budget" value={budget} onChange={setBudget} type="number" autoComplete="off" />
        <Button variant="primary" loading={loading} onClick={optimize}>Optimize</Button>
        <div className="space-y-2">
          {result.length === 0 ? (
            <p className="text-sm text-steel">Suggestions will appear after price tiers exist.</p>
          ) : (
            result.map((row) => (
              <div className="rounded border border-gray-200 p-3" key={`${row.sku}-${row.supplierId}`}>
                <p className="font-semibold">{String(row.sku)} via {String(row.supplierName)}</p>
                <p className="text-sm text-steel">MOQ {String(row.targetMoq)}, spend ${String(row.estimatedSpend)}, savings ${String(row.estimatedSavings)}</p>
              </div>
            ))
          )}
        </div>
      </div>
    </section>
  );
}

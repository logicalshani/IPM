"use client";

import { useState } from "react";
import { Button, TextField } from "@shopify/polaris";

export function ProfitScenarioPanel() {
  const [result, setResult] = useState("");
  const [qty, setQty] = useState("500");
  const [price, setPrice] = useState("8");
  const [sellPrice, setSellPrice] = useState("20");

  async function run() {
    const response = await fetch("/api/profit-scenarios", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        shopId: "demo-shop",
        name: "Supplier A vs baseline",
        timeframeDays: 60,
        options: [
          {
            supplierName: "Supplier A",
            label: `Order ${qty}`,
            orderQuantity: Number(qty),
            supplierPrice: Number(price),
            sellingPrice: Number(sellPrice),
            expectedSellThrough: 0.8,
            timeframeDays: 60,
            runMonteCarlo: true
          }
        ]
      })
    });
    setResult(JSON.stringify(await response.json(), null, 2));
  }

  return (
    <section className="imp-band p-4">
      <h2 className="font-semibold">Profit simulation engine</h2>
      <div className="mt-4 grid gap-4 md:grid-cols-3">
        <TextField label="Order qty" value={qty} onChange={setQty} type="number" autoComplete="off" />
        <TextField label="Supplier price" value={price} onChange={setPrice} type="number" autoComplete="off" />
        <TextField label="Selling price" value={sellPrice} onChange={setSellPrice} type="number" autoComplete="off" />
      </div>
      <div className="mt-4"><Button variant="primary" onClick={run}>Run Monte Carlo</Button></div>
      <pre className="mt-4 min-h-64 overflow-auto rounded-lg bg-gray-950 p-3 text-xs text-gray-50">{result || "Scenario output appears here."}</pre>
    </section>
  );
}

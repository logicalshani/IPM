"use client";

import { useState } from "react";
import { Button, Select, TextField } from "@shopify/polaris";

export function FinancialControls() {
  const [method, setMethod] = useState("FIFO");
  const [threshold, setThreshold] = useState("5000");
  const [productId, setProductId] = useState("");
  const [quantity, setQuantity] = useState("1");
  const [unitCost, setUnitCost] = useState("10");

  async function saveSettings() {
    await fetch("/api/financial/cash-flow", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        action: "settings",
        shopId: "demo-shop",
        valuationMethod: method,
        workingCapitalThreshold: Number(threshold)
      })
    });
    window.location.reload();
  }

  async function recordLoss() {
    if (!productId.trim()) return;
    await fetch("/api/financial/shrinkage", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        action: "adjustment",
        shopId: "demo-shop",
        productId,
        reason: "DAMAGED",
        quantity: Number(quantity),
        unitCost: Number(unitCost),
        note: "Recorded from financial dashboard"
      })
    });
    window.location.reload();
  }

  async function exportCsv() {
    const response = await fetch("/api/financial/shrinkage", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ action: "export", shopId: "demo-shop" })
    });
    const text = await response.text();
    const blob = new Blob([text], { type: "text/csv" });
    const link = document.createElement("a");
    link.href = URL.createObjectURL(blob);
    link.download = "shrinkage-tax-export.csv";
    link.click();
  }

  return (
    <div className="imp-band min-w-80 p-4">
      <div className="grid gap-3 md:grid-cols-2">
        <Select
          label="Valuation"
          value={method}
          onChange={setMethod}
          options={[
            { label: "FIFO", value: "FIFO" },
            { label: "LIFO", value: "LIFO" },
            { label: "Weighted average", value: "WEIGHTED_AVERAGE" }
          ]}
        />
        <TextField label="30-day threshold" value={threshold} onChange={setThreshold} type="number" autoComplete="off" />
      </div>
      <div className="mt-3 flex flex-wrap gap-2">
        <Button onClick={saveSettings}>Save settings</Button>
        <Button onClick={exportCsv}>Export shrinkage</Button>
      </div>
      <div className="mt-4 grid gap-3 md:grid-cols-3">
        <TextField label="Loss product ID" value={productId} onChange={setProductId} autoComplete="off" />
        <TextField label="Qty" value={quantity} onChange={setQuantity} type="number" autoComplete="off" />
        <TextField label="Unit cost" value={unitCost} onChange={setUnitCost} type="number" autoComplete="off" />
      </div>
      <div className="mt-3">
        <Button disabled={!productId.trim()} onClick={recordLoss}>Record damaged loss</Button>
      </div>
    </div>
  );
}

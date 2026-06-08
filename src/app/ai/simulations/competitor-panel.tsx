"use client";

import { useState } from "react";
import { Button, TextField } from "@shopify/polaris";

export function CompetitorMonitorPanel() {
  const [productId, setProductId] = useState("");
  const [url, setUrl] = useState("https://example.com/product");
  const [result, setResult] = useState("");

  async function add() {
    const response = await fetch("/api/competitors", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ action: "add", shopId: "demo-shop", productId, competitorName: "Competitor", url })
    });
    setResult(JSON.stringify(await response.json(), null, 2));
  }

  async function enqueue() {
    const response = await fetch("/api/competitors", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ action: "enqueue", shopId: "demo-shop" })
    });
    setResult(JSON.stringify(await response.json(), null, 2));
  }

  return (
    <section className="imp-band p-4">
      <h2 className="font-semibold">Competitor price monitor</h2>
      <div className="mt-4 space-y-4">
        <TextField label="Product ID" value={productId} onChange={setProductId} autoComplete="off" />
        <TextField label="Competitor URL" value={url} onChange={setUrl} autoComplete="url" />
        <div className="flex flex-wrap gap-2">
          <Button onClick={add} disabled={!productId.trim()}>Add URL</Button>
          <Button onClick={enqueue}>Queue weekly scrape</Button>
        </div>
        <pre className="min-h-48 overflow-auto rounded-lg bg-gray-950 p-3 text-xs text-gray-50">{result || "Price monitor output appears here."}</pre>
      </div>
    </section>
  );
}

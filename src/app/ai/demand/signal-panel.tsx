"use client";

import { useState } from "react";
import { Button, Select, TextField } from "@shopify/polaris";

export function DemandSignalPanel() {
  const [keyword, setKeyword] = useState("");
  const [type, setType] = useState("GOOGLE_TRENDS");
  const [score, setScore] = useState("20");

  async function save() {
    await fetch("/api/demand/signals", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ shopId: "demo-shop", keyword, type, score: Number(score) })
    });
  }

  return (
    <section className="imp-band p-4">
      <h2 className="font-semibold">External signal ingestion</h2>
      <div className="mt-4 space-y-4">
        <TextField label="Product keyword" value={keyword} onChange={setKeyword} autoComplete="off" />
        <Select
          label="Signal type"
          value={type}
          onChange={setType}
          options={[
            { label: "Google Trends", value: "GOOGLE_TRENDS" },
            { label: "Shopify discount", value: "SHOPIFY_DISCOUNT" },
            { label: "Return rate", value: "RETURN_RATE" },
            { label: "Restock halo", value: "RESTOCK_HALO" }
          ]}
        />
        <TextField label="Score" value={score} onChange={setScore} type="number" autoComplete="off" />
        <Button variant="primary" disabled={!keyword.trim()} onClick={save}>Save signal</Button>
      </div>
    </section>
  );
}

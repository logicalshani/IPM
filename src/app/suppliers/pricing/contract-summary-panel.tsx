"use client";

import { useState } from "react";
import { Button, TextField } from "@shopify/polaris";

export function ContractSummaryPanel() {
  const [supplierId, setSupplierId] = useState("");
  const [contractText, setContractText] = useState("");
  const [file, setFile] = useState<File | null>(null);
  const [summary, setSummary] = useState("");
  const [loading, setLoading] = useState(false);

  async function summarize() {
    setLoading(true);
    setSummary("");
    const form = new FormData();
    form.append("shopId", "demo-shop");
    form.append("supplierId", supplierId || "demo-supplier");
    form.append("contractText", contractText);
    if (file) {
      form.append("file", file);
    }

    const response = await fetch("/api/ai/contract-summary", {
      method: "POST",
      body: form
    });
    if (!response.body) {
      setLoading(false);
      return;
    }
    const reader = response.body.getReader();
    const decoder = new TextDecoder();
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      setSummary((current) => current + decoder.decode(value));
    }
    setLoading(false);
  }

  return (
    <section className="imp-band p-4">
      <h2 className="font-semibold">AI contract summarizer</h2>
      <div className="mt-4 space-y-4">
        <TextField label="Supplier ID" value={supplierId} onChange={setSupplierId} autoComplete="off" />
        <label className="block text-sm font-medium text-ink">
          Contract PDF
          <input
            className="mt-2 block w-full rounded border border-gray-300 bg-white px-3 py-2 text-sm"
            type="file"
            accept="application/pdf,text/plain"
            onChange={(event) => setFile(event.target.files?.[0] ?? null)}
          />
        </label>
        <TextField label="Contract text or extracted PDF text" value={contractText} onChange={setContractText} multiline={5} autoComplete="off" />
        <Button variant="primary" loading={loading} disabled={!contractText.trim() && !file} onClick={summarize}>Summarize</Button>
        <pre className="min-h-40 whitespace-pre-wrap rounded-lg bg-gray-950 p-4 text-sm text-gray-50">{summary || "Extracted terms will stream here."}</pre>
      </div>
    </section>
  );
}

"use client";

import { useState } from "react";
import { Button, TextField } from "@shopify/polaris";

export function InvoiceParserPanel() {
  const [text, setText] = useState("Supplier: Threadhouse Manufacturing\nInvoice # INV-2001\nTotal: 1920");
  const [file, setFile] = useState<File | null>(null);
  const [result, setResult] = useState("");

  async function parse() {
    const form = new FormData();
    form.append("shopId", "demo-shop");
    form.append("text", text);
    if (file) form.append("file", file);
    const response = await fetch("/api/invoices/parse", { method: "POST", body: form });
    setResult(JSON.stringify(await response.json(), null, 2));
  }

  return (
    <section className="grid gap-4 lg:grid-cols-[0.8fr_1.2fr]">
      <div className="imp-band p-4">
        <div className="space-y-4">
          <label className="block text-sm font-medium text-ink">
            Invoice PDF or image
            <input className="mt-2 block w-full rounded border border-gray-300 bg-white px-3 py-2 text-sm" type="file" accept="application/pdf,image/*,text/plain" onChange={(event) => setFile(event.target.files?.[0] ?? null)} />
          </label>
          <TextField label="Extracted text fallback" value={text} onChange={setText} multiline={6} autoComplete="off" />
          <Button variant="primary" onClick={parse}>Parse invoice</Button>
        </div>
      </div>
      <pre className="min-h-96 overflow-auto rounded-lg bg-gray-950 p-4 text-sm text-gray-50">{result || "Parsed invoice JSON and discrepancy flags appear here."}</pre>
    </section>
  );
}

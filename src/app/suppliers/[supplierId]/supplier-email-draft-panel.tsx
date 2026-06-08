"use client";

import { useState } from "react";
import { Button, Select, TextField } from "@shopify/polaris";

export function SupplierEmailDraftPanel({ supplierId, supplierEmail }: { supplierId: string; supplierEmail: string }) {
  const [intent, setIntent] = useState("PO_FOLLOW_UP");
  const [context, setContext] = useState("");
  const [draft, setDraft] = useState("");
  const [loading, setLoading] = useState(false);

  async function generate() {
    setLoading(true);
    setDraft("");
    const response = await fetch("/api/ai/supplier-email", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ shopId: "demo-shop", supplierId, intent, context })
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
      setDraft((current) => current + decoder.decode(value));
    }
    setLoading(false);
  }

  async function send() {
    await fetch("/api/suppliers/communications", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        action: "send_email",
        shopId: "demo-shop",
        supplierId,
        to: supplierEmail || "supplier@example.com",
        subject: "Supplier follow-up",
        body: draft
      })
    });
    window.location.reload();
  }

  return (
    <div className="imp-band p-4">
      <h2 className="font-semibold">AI-drafted email</h2>
      <div className="mt-4 space-y-4">
        <Select
          label="Intent"
          value={intent}
          onChange={setIntent}
          options={[
            { label: "PO follow-up", value: "PO_FOLLOW_UP" },
            { label: "Delay inquiry", value: "DELAY_INQUIRY" },
            { label: "Price negotiation", value: "PRICE_NEGOTIATION" },
            { label: "Invoice dispute", value: "INVOICE_DISPUTE" },
            { label: "Return request", value: "RETURN_REQUEST" }
          ]}
        />
        <TextField label="Context" value={context} onChange={setContext} multiline={2} autoComplete="off" />
        <div className="flex flex-wrap gap-2">
          <Button loading={loading} onClick={generate}>Draft</Button>
          <Button disabled={!draft.trim()} onClick={send}>Send/log</Button>
        </div>
        <pre className="min-h-32 whitespace-pre-wrap rounded-lg bg-gray-950 p-3 text-xs text-gray-50">{draft || "Draft appears here."}</pre>
      </div>
    </div>
  );
}

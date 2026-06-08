"use client";

import { useState } from "react";
import { Button, TextField } from "@shopify/polaris";

export function SupplierInsightPanel() {
  const [prompt, setPrompt] = useState("Explain the best and worst supplier callouts, and suggest replacement options for any supplier below 60.");
  const [answer, setAnswer] = useState("");
  const [loading, setLoading] = useState(false);

  async function run() {
    setLoading(true);
    setAnswer("");
    const response = await fetch("/api/ai/supplier-insights", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ shopId: "demo-shop", prompt })
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
      setAnswer((current) => current + decoder.decode(value));
    }
    setLoading(false);
  }

  return (
    <section className="imp-band p-4">
      <h2 className="font-semibold">AI supplier callouts</h2>
      <div className="mt-4 space-y-4">
        <TextField label="Prompt" value={prompt} onChange={setPrompt} multiline={2} autoComplete="off" />
        <Button variant="primary" loading={loading} onClick={run}>
          Generate explanation
        </Button>
        <pre className="min-h-40 whitespace-pre-wrap rounded-lg bg-gray-950 p-4 text-sm text-gray-50">{answer || "AI supplier insights will stream here."}</pre>
      </div>
    </section>
  );
}

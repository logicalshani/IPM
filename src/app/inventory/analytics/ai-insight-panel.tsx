"use client";

import { useState } from "react";
import { Button, TextField } from "@shopify/polaris";

export function AIInsightPanel() {
  const [prompt, setPrompt] = useState("Find the three highest-risk shrinkage patterns and the next action for each.");
  const [answer, setAnswer] = useState("");
  const [loading, setLoading] = useState(false);

  async function run() {
    setLoading(true);
    setAnswer("");
    const response = await fetch("/api/ai/inventory-insights", {
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
      <div className="space-y-4">
        <TextField label="Question" value={prompt} onChange={setPrompt} multiline={3} autoComplete="off" />
        <Button variant="primary" loading={loading} onClick={run}>
          Analyze
        </Button>
        <pre className="min-h-52 whitespace-pre-wrap rounded-lg bg-gray-950 p-4 text-sm text-gray-50">{answer || "AI recommendations will stream here."}</pre>
      </div>
    </section>
  );
}

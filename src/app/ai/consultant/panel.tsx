"use client";

import { useMemo, useState } from "react";
import { Button, Select, TextField } from "@shopify/polaris";

const prompts = [
  "What should I reorder this week?",
  "I have $5,000 — what should I buy?",
  "Which products are killing my cash flow?",
  "Who is my most unreliable supplier?",
  "What will my inventory value be in 30 days if I reorder nothing?",
  "Which products should I put on sale this weekend?",
  "What's my stockout risk for Black Friday?",
  "Why is my inventory value up but revenue down?"
];

export function AIConsultantPanel() {
  const [question, setQuestion] = useState(prompts[0]);
  const [answer, setAnswer] = useState("");
  const [sessionId, setSessionId] = useState("");
  const [analysis, setAnalysis] = useState<Record<string, unknown> | null>(null);
  const [loading, setLoading] = useState(false);

  const tableRows = useMemo(() => (Array.isArray(analysis?.table) ? analysis.table as Array<Record<string, unknown>> : []), [analysis]);

  async function ask() {
    setLoading(true);
    setAnswer("");
    setAnalysis(null);
    const response = await fetch("/api/ai/consultant", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ shopId: "demo-shop", question })
    });
    setSessionId(response.headers.get("x-imp-ai-session-id") ?? "");
    const encoded = response.headers.get("x-imp-ai-analysis");
    if (encoded) setAnalysis(JSON.parse(decodeURIComponent(encoded)));
    if (response.body) {
      const reader = response.body.getReader();
      const decoder = new TextDecoder();
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        setAnswer((current) => current + decoder.decode(value));
      }
    }
    setLoading(false);
  }

  async function feedback(value: "THUMBS_UP" | "THUMBS_DOWN") {
    if (!sessionId) return;
    await fetch("/api/ai/consultant/feedback", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ shopId: "demo-shop", sessionId, feedback: value })
    });
  }

  return (
    <section className="grid gap-4 xl:grid-cols-[0.8fr_1.2fr]">
      <div className="imp-band p-4">
        <div className="space-y-4">
          <Select label="Supported query" value={question} onChange={setQuestion} options={prompts.map((prompt) => ({ label: prompt, value: prompt }))} />
          <TextField label="Question" value={question} onChange={setQuestion} multiline={3} autoComplete="off" />
          <Button variant="primary" loading={loading} onClick={ask}>Ask consultant</Button>
          {loading && <p className="text-sm text-steel">Typing with live app data...</p>}
          {analysis && (
            <div className="rounded border border-gray-200 p-3 text-sm">
              <p className="font-semibold">Confidence: {String(analysis.confidence)}</p>
              <p className="text-steel">Next action: {String(analysis.suggestedAction)}</p>
            </div>
          )}
          <div className="flex gap-2">
            <Button disabled={!sessionId} onClick={() => feedback("THUMBS_UP")}>Thumbs up</Button>
            <Button disabled={!sessionId} onClick={() => feedback("THUMBS_DOWN")}>Thumbs down</Button>
          </div>
        </div>
      </div>
      <div className="space-y-4">
        {tableRows.length > 0 && (
          <div className="imp-band overflow-x-auto p-4">
            <table className="imp-table">
              <thead>
                <tr>{Object.keys(tableRows[0]).map((key) => <th key={key}>{key}</th>)}</tr>
              </thead>
              <tbody>
                {tableRows.map((row, index) => (
                  <tr key={index}>{Object.values(row).map((value, cell) => <td key={cell}>{String(value)}</td>)}</tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
        <pre className="min-h-96 whitespace-pre-wrap rounded-lg bg-gray-950 p-4 text-sm text-gray-50">{answer || "Streamed AI answer appears here."}</pre>
      </div>
    </section>
  );
}

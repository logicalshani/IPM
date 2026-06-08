import { AIInsightPanel } from "./ai-insight-panel";

export default function AnalyticsPage() {
  return (
    <div className="space-y-6">
      <header>
        <p className="text-sm font-semibold uppercase tracking-[0.12em] text-emerald-700">AI-native operations</p>
        <h1 className="mt-2 text-3xl font-bold">Inventory Intelligence</h1>
        <p className="mt-2 max-w-3xl text-sm text-steel">
          Streaming variance analysis powered by Claude Sonnet 4 with GPT-4o fallback.
        </p>
      </header>
      <AIInsightPanel />
    </div>
  );
}

import { getAIConsultationHistory } from "@/services/aiConsultant.service";
import { AIConsultantPanel } from "./panel";

const demoShopId = "demo-shop";
export const dynamic = "force-dynamic";

export default async function AIConsultantPage() {
  const history = await getAIConsultationHistory(demoShopId).catch(() => []);

  return (
    <div className="space-y-6">
      <header>
        <p className="text-sm font-semibold uppercase tracking-[0.12em] text-emerald-700">Market-leading AI layer</p>
        <h1 className="mt-2 text-3xl font-bold">AI Inventory Consultant</h1>
        <p className="mt-2 max-w-3xl text-sm text-steel">
          Conversational, data-aware inventory decisions with tables, numbers, confidence scores, and saved answer quality feedback.
        </p>
      </header>
      <AIConsultantPanel />
      <section className="imp-band overflow-hidden">
        <div className="border-b border-gray-200 p-4">
          <h2 className="font-semibold">Saved sessions</h2>
        </div>
        <div className="divide-y divide-gray-200">
          {history.length === 0 ? (
            <p className="p-4 text-sm text-steel">No AI sessions saved yet.</p>
          ) : (
            history.map((session) => (
              <article className="p-4" key={session.id}>
                <p className="font-semibold">{session.question}</p>
                <p className="mt-1 text-sm text-steel">Confidence {session.confidence} · Action: {session.suggestedAction}</p>
              </article>
            ))
          )}
        </div>
      </section>
    </div>
  );
}

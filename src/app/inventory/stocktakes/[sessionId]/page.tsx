import { notFound } from "next/navigation";
import { prisma } from "@/lib/prisma";
import { DetailPageFrame } from "@/components/DetailPageFrame";
import { StatusBadge } from "@/components/StatusBadge";
import { StocktakeLineCounter } from "./stocktake-line-counter";

const demoShopId = "demo-shop";

export default async function StocktakeSessionPage({ params }: { params: { sessionId: string } }) {
  const session = await prisma.stocktakeSession.findUnique({
    where: { id: params.sessionId, shopId: demoShopId },
    include: {
      location: true,
      assignedUser: true,
      lines: { include: { product: true }, orderBy: { product: { sku: "asc" } } }
    }
  });

  if (!session) {
    notFound();
  }

  return (
    <DetailPageFrame
      breadcrumbs={[{ label: "Stocktakes", href: "/inventory/stocktakes" }, { label: session.name }]}
      status={session.status}
      actions={["Approve variances", "Reject to recount", "Export CSV", "Export PDF"]}
      activity={[
        { title: "Session loaded", body: `${session.lines.length} count lines ready for variance review.`, when: "Now" },
        { title: "Assigned owner", body: `${session.assignedUser?.name ?? "Operations"} owns the current count session.`, when: "Today" }
      ]}
    >
      <div className="space-y-6">
      <header className="flex flex-col gap-3 md:flex-row md:items-end md:justify-between">
        <div>
          <p className="text-sm font-semibold uppercase tracking-[0.12em] text-emerald-700">Stocktake session</p>
          <h1 className="mt-2 text-3xl font-bold">{session.name}</h1>
          <p className="mt-2 text-sm text-steel">
            {session.mode} count at {session.location?.name ?? "all locations"} assigned to {session.assignedUser?.name ?? "operations"}.
          </p>
        </div>
        <StatusBadge status={session.status} />
      </header>

      <section className="imp-band overflow-hidden">
        <div className="border-b border-gray-200 p-4">
          <h2 className="font-semibold">Live variance engine</h2>
        </div>
        {session.lines.length === 0 ? (
          <div className="p-6">
            <p className="text-sm text-steel">No count lines have been seeded yet.</p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="imp-table">
              <thead>
                <tr>
                  <th>SKU</th>
                  <th>Product</th>
                  {!session.blindCount && <th>Expected</th>}
                  <th>Counted</th>
                  <th>Variance</th>
                  <th>Status</th>
                </tr>
              </thead>
              <tbody>
                {session.lines.map((line) => (
                  <tr key={line.id}>
                    <td className="font-semibold">{line.product.sku}</td>
                    <td>{line.product.name}</td>
                    {!session.blindCount && <td>{line.expectedQuantity}</td>}
                    <td>
                      <StocktakeLineCounter
                        productId={line.productId}
                        sessionId={session.id}
                        defaultValue={line.countedQuantity ?? 0}
                      />
                    </td>
                    <td className={varianceClass(Number(line.variancePercent), Number(line.varianceValue))}>
                      {line.varianceUnits} units / ${Number(line.varianceValue).toFixed(2)}
                    </td>
                    <td><StatusBadge status={line.status} /></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>
      </div>
    </DetailPageFrame>
  );
}

function varianceClass(percent: number, value: number) {
  if (percent === 0 && value === 0) {
    return "variance-match";
  }
  return Math.abs(percent) <= 5 && Math.abs(value) <= 50 ? "variance-warning" : "variance-critical";
}

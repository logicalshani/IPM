import { prisma } from "@/lib/prisma";
import { FEATURE_KEYS, assertFeatureEnabled } from "./feature.service";
import { getExpiryAlerts } from "./batchLot.service";
import { getReturnAnalytics } from "./returnRma.service";
import { getWarehouseSyncDashboard } from "./warehouseIntegration.service";

export async function getOperationsDashboard(shopId: string, db = prisma) {
  await assertFeatureEnabled(shopId, FEATURE_KEYS.operationsIntelligence, db);

  const [returns, expiryAlerts, warehouse, transferSuggestions, transfers, rules, openRmas] = await Promise.all([
    getReturnAnalytics(shopId, db),
    getExpiryAlerts(shopId, db),
    getWarehouseSyncDashboard(shopId, db),
    db.inventoryTransferSuggestion.findMany({
      where: { shopId },
      include: { lines: { include: { product: true } } },
      orderBy: [{ urgencyScore: "desc" }, { createdAt: "desc" }],
      take: 10
    }),
    db.inventoryTransfer.findMany({
      where: { shopId },
      include: { lines: { include: { product: true } } },
      orderBy: { createdAt: "desc" },
      take: 10
    }),
    db.locationReplenishmentRule.findMany({
      where: { shopId },
      include: { product: true },
      orderBy: [{ abcClass: "asc" }, { reorderPoint: "desc" }],
      take: 20
    }),
    db.supplierRma.findMany({
      where: { shopId, status: { in: ["DRAFT", "SENT"] } },
      include: { supplier: true },
      orderBy: { createdAt: "desc" },
      take: 10
    })
  ]);

  const returnUnits = returns.returns.reduce((sum, row) => sum + row.quantity, 0);
  const returnValue = returns.returns.reduce((sum, row) => sum + row.quantity * Number(row.unitCost), 0);
  const expiringUnits = expiryAlerts.reduce((sum, row) => sum + row.quantityRemaining, 0);
  const discrepancyUnits = warehouse.discrepancies.reduce((sum, row) => sum + Math.abs(row.discrepancyQuantity), 0);
  const inTransitUnits = transfers
    .filter((transfer) => transfer.status === "IN_TRANSIT")
    .flatMap((transfer) => transfer.lines)
    .reduce((sum, line) => sum + line.quantity, 0);

  return {
    returns,
    expiryAlerts,
    warehouse,
    transferSuggestions,
    transfers,
    rules,
    openRmas,
    metrics: {
      returnUnits,
      returnValue,
      expiringUnits,
      warehouseDiscrepancies: warehouse.discrepancies.length,
      discrepancyUnits,
      transferSuggestions: transferSuggestions.length,
      inTransitUnits,
      openRmas: openRmas.length
    }
  };
}

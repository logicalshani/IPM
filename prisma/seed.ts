import { PrismaClient } from "@prisma/client";
import { createHash } from "node:crypto";
import { ACCESS_ROLES, DEFAULT_PERMISSION_MATRIX, PERMISSIONS } from "../src/services/compliance.service";
import { FEATURE_KEYS } from "../src/services/feature.service";

const prisma = new PrismaClient();

async function main() {
  const shop = await prisma.shop.upsert({
    where: { shopifyDomain: "demo.myshopify.com" },
    update: {},
    create: {
      id: "demo-shop",
      shopifyDomain: "demo.myshopify.com",
      name: "Demo Warehouse",
      billingPlan: "growth"
    }
  });

  for (const key of Object.values(FEATURE_KEYS)) {
    await prisma.feature.upsert({
      where: { shopId_key: { shopId: shop.id, key } },
      update: { status: "ENABLED", plan: "growth" },
      create: { shopId: shop.id, key, status: "ENABLED", plan: "growth" }
    });
  }

  const [northline, threadhouse, kilnworks] = await Promise.all([
    prisma.supplier.upsert({
      where: { shopId_name: { shopId: shop.id, name: "Northline Supply" } },
      update: {},
      create: {
        shopId: shop.id,
        name: "Northline Supply",
        email: "ops@northline.example",
        paymentTerms: "Net 30",
        reliabilityScore: 86,
        previousReliabilityScore: 82,
        onTimeRate: 90,
        fillRate: 92,
        invoiceAccuracy: 80
      }
    }),
    prisma.supplier.upsert({
      where: { shopId_name: { shopId: shop.id, name: "Threadhouse Manufacturing" } },
      update: {},
      create: {
        shopId: shop.id,
        name: "Threadhouse Manufacturing",
        email: "orders@threadhouse.example",
        paymentTerms: "50% deposit, Net 15 on delivery",
        reliabilityScore: 58,
        previousReliabilityScore: 71,
        onTimeRate: 45,
        fillRate: 88,
        invoiceAccuracy: 70
      }
    }),
    prisma.supplier.upsert({
      where: { shopId_name: { shopId: shop.id, name: "Kilnworks Co." } },
      update: {},
      create: {
        shopId: shop.id,
        name: "Kilnworks Co.",
        email: "supply@kilnworks.example",
        paymentTerms: "Net 45",
        reliabilityScore: 77,
        previousReliabilityScore: 75,
        onTimeRate: 72,
        fillRate: 95,
        invoiceAccuracy: 85
      }
    })
  ]);

  const [warehouse, retail] = await Promise.all([
    prisma.location.upsert({
      where: { shopId_name: { shopId: shop.id, name: "Warehouse A" } },
      update: {},
      create: { shopId: shop.id, name: "Warehouse A", barcode: "LOC-WH-A" }
    }),
    prisma.location.upsert({
      where: { shopId_name: { shopId: shop.id, name: "Retail Floor" } },
      update: {},
      create: { shopId: shop.id, name: "Retail Floor", barcode: "LOC-RET-1" }
    })
  ]);

  const operator = await prisma.user.upsert({
    where: { shopId_email: { shopId: shop.id, email: "ops@example.com" } },
    update: {},
    create: { id: "demo-user-ops", shopId: shop.id, name: "Ops Lead", email: "ops@example.com", role: "supervisor" }
  });

  const owner = await prisma.user.upsert({
    where: { shopId_email: { shopId: shop.id, email: "owner@example.com" } },
    update: {},
    create: { id: "demo-user-owner", shopId: shop.id, name: "Store Owner", email: "owner@example.com", role: "owner" }
  });

  const products = await Promise.all(
    [
      { sku: "BAG-001", name: "Canvas Tote", category: "Accessories", supplier: "Northline", supplierId: northline.id, price: 32, cost: 14, qty: 118 },
      { sku: "TEE-114", name: "Core Tee", category: "Apparel", supplier: "Threadhouse", supplierId: threadhouse.id, price: 28, cost: 9, qty: 240 },
      { sku: "MUG-220", name: "Ceramic Mug", category: "Home", supplier: "Kilnworks", supplierId: kilnworks.id, price: 18, cost: 6, qty: 76 }
    ].map((item) =>
      prisma.product.upsert({
        where: { shopId_sku: { shopId: shop.id, sku: item.sku } },
        update: {},
        create: {
          shopId: shop.id,
          supplierId: item.supplierId,
          sku: item.sku,
          name: item.name,
          category: item.category,
          supplier: item.supplier,
          price: item.price,
          cost: item.cost,
          barcode: item.sku
        }
      })
    )
  );

  for (const product of products) {
    const warehouseQuantity = product.sku === "MUG-220" ? 180 : product.sku === "BAG-001" ? 118 : 76;
    const retailQuantity = product.sku === "MUG-220" ? 1 : product.sku === "TEE-114" ? 240 : 36;
    await prisma.productInventory.upsert({
      where: { productId_locationId: { productId: product.id, locationId: warehouse.id } },
      update: { quantity: warehouseQuantity },
      create: { productId: product.id, locationId: warehouse.id, quantity: warehouseQuantity }
    });
    await prisma.productInventory.upsert({
      where: { productId_locationId: { productId: product.id, locationId: retail.id } },
      update: { quantity: retailQuantity },
      create: { productId: product.id, locationId: retail.id, quantity: retailQuantity }
    });

    await prisma.inventoryCostLayer.upsert({
      where: { id: `demo-layer-old-${product.sku}` },
      update: {},
      create: {
        id: `demo-layer-old-${product.sku}`,
        shopId: shop.id,
        productId: product.id,
        sourceReference: "opening-balance",
        receivedAt: new Date("2026-03-01"),
        quantityReceived: 80,
        quantityRemaining: 40,
        unitCost: Number(product.cost) * 0.92
      }
    });
    await prisma.inventoryCostLayer.upsert({
      where: { id: `demo-layer-new-${product.sku}` },
      update: {},
      create: {
        id: `demo-layer-new-${product.sku}`,
        shopId: shop.id,
        productId: product.id,
        sourceReference: "recent-po",
        receivedAt: new Date("2026-05-20"),
        quantityReceived: 120,
        quantityRemaining: 90,
        unitCost: Number(product.cost) * 1.08
      }
    });

    await prisma.inventoryMovement.upsert({
      where: { id: `demo-sale-${product.sku}` },
      update: {},
      create: {
        id: `demo-sale-${product.sku}`,
        shopId: shop.id,
        productId: product.id,
        locationId: retail.id,
        type: "SALE",
        quantity: product.sku === "TEE-114" ? -42 : -12,
        unitCost: product.cost,
        reference: "demo-sales-30d",
        occurredAt: new Date("2026-06-04")
      }
    });
  }

  await prisma.financialSettings.upsert({
    where: { shopId: shop.id },
    update: {},
    create: {
      shopId: shop.id,
      valuationMethod: "FIFO",
      workingCapitalThreshold: 2500,
      industryDioBenchmark: 60,
      industryDsoBenchmark: 7,
      industryDpoBenchmark: 30,
      defaultDsoDays: 2
    }
  });

  await prisma.inventoryAdjustment.upsert({
    where: { id: "demo-shrinkage-tee" },
    update: {},
    create: {
      id: "demo-shrinkage-tee",
      shopId: shop.id,
      productId: products[1].id,
      locationId: warehouse.id,
      userId: operator.id,
      reason: "DAMAGED",
      quantity: -6,
      unitCost: 9,
      valueLost: 54,
      note: "Warehouse damage during receiving.",
      occurredAt: new Date("2026-06-05")
    }
  });
  await prisma.inventoryAdjustment.upsert({
    where: { id: "demo-shrinkage-mug" },
    update: {},
    create: {
      id: "demo-shrinkage-mug",
      shopId: shop.id,
      productId: products[2].id,
      locationId: retail.id,
      userId: operator.id,
      reason: "EXPIRED",
      quantity: -3,
      unitCost: 6,
      valueLost: 18,
      note: "Expired seasonal packaging.",
      occurredAt: new Date("2026-06-06")
    }
  });

  await prisma.stocktakeSession.upsert({
    where: { id: "demo-stocktake" },
    update: {},
    create: {
      id: "demo-stocktake",
      shopId: shop.id,
      name: "June cycle count",
      locationId: warehouse.id,
      assignedUserId: operator.id,
      mode: "CYCLE",
      status: "IN_PROGRESS",
      lines: {
        create: products.map((product, index) => ({
          productId: product.id,
          expectedQuantity: index === 0 ? 118 : index === 1 ? 76 : 76,
          countedQuantity: index === 0 ? 116 : null,
          varianceUnits: index === 0 ? -2 : 0,
          varianceValue: index === 0 ? -28 : 0,
          variancePercent: index === 0 ? -1.69 : 0,
          status: index === 0 ? "OPEN" : "OPEN"
        }))
      }
    }
  });

  await prisma.supplierSeasonalRiskPeriod.upsert({
    where: { id: "demo-q4-risk" },
    update: {},
    create: {
      id: "demo-q4-risk",
      shopId: shop.id,
      name: "Q4 freight congestion",
      startsOn: new Date("2026-10-01"),
      endsOn: new Date("2026-12-31"),
      bufferDays: 5,
      notes: "Automatically adds buffer days during peak-season import pressure."
    }
  });

  for (const profile of [
    { supplierId: northline.id, category: "Accessories", min: 8, max: 18, avg: 12, dynamic: 12, degradation: 0 },
    { supplierId: threadhouse.id, category: "Apparel", min: 14, max: 35, avg: 18, dynamic: 24, degradation: 33.3 },
    { supplierId: kilnworks.id, category: "Home", min: 10, max: 24, avg: 16, dynamic: 17, degradation: 6.25 }
  ]) {
    await prisma.supplierCategoryLeadTime.upsert({
      where: { supplierId_category: { supplierId: profile.supplierId, category: profile.category } },
      update: {},
      create: {
        shopId: shop.id,
        supplierId: profile.supplierId,
        category: profile.category,
        minimumDays: profile.min,
        maximumDays: profile.max,
        averageDays: profile.avg,
        rolling90DayAverage: profile.dynamic,
        dynamicEstimateDays: profile.dynamic,
        recentDegradationPercent: profile.degradation
      }
    });
  }

  await prisma.purchaseOrder.upsert({
    where: { shopId_poNumber: { shopId: shop.id, poNumber: "PO-2001" } },
    update: {},
    create: {
      id: "demo-po-2001",
      shopId: shop.id,
      supplierId: threadhouse.id,
      poNumber: "PO-2001",
      status: "RECEIVED",
      orderedAt: new Date("2026-04-20"),
      promisedDeliveryDate: new Date("2026-05-08"),
      actualDeliveryDate: new Date("2026-05-16"),
      deliveryDeltaDays: 8,
      invoiceAccurate: false,
      expectedTotal: 1800,
      invoiceTotal: 1920,
      subtotal: 1800,
      freightCost: 85,
      customsCost: 40,
      handlingCost: 25,
      landedTotal: 1950,
      approvalTier: "manager_approval",
      approvedAt: new Date("2026-04-20"),
      sentAt: new Date("2026-04-20"),
      trackingNumber: "TRK-PO2001",
      backorderRecommendation: "SOURCE_ALTERNATE",
      notes: "Late due to production backlog; invoice includes unapproved price increase.",
      lines: {
        create: [
          {
            productId: products[1].id,
            sku: "TEE-114",
            category: "Apparel",
            orderedQuantity: 200,
            receivedQuantity: 176,
            unitPrice: 9,
            landedUnitCost: 9.75,
            marginAfterLandedCost: 18.25,
            invoiceUnitPrice: 9.6,
            invoiceQuantity: 200,
            priceVariance: 0.6
          }
        ]
      }
    }
  });

  for (const policy of [
    { id: "demo-po-policy-auto", name: "Auto approve under 500", minAmount: 0, maxAmount: 499.99, autoApprove: true },
    { id: "demo-po-policy-manager", name: "Manager approval", minAmount: 500, maxAmount: 4999.99, requiredRole: "MANAGER" as const },
    { id: "demo-po-policy-owner", name: "Owner approval", minAmount: 5000, requiredRole: "OWNER" as const }
  ]) {
    await prisma.purchaseOrderApprovalPolicy.upsert({
      where: { id: policy.id },
      update: {},
      create: {
        shopId: shop.id,
        ...policy
      }
    });
  }

  await prisma.productSupplierOption.upsert({
    where: { productId_supplierId: { productId: products[1].id, supplierId: threadhouse.id } },
    update: {},
    create: {
      shopId: shop.id,
      productId: products[1].id,
      supplierId: threadhouse.id,
      supplierSku: "TH-TEE-114",
      unitPrice: 8.75,
      moq: 200,
      leadTimeDays: 24
    }
  });
  await prisma.productSupplierOption.upsert({
    where: { productId_supplierId: { productId: products[1].id, supplierId: northline.id } },
    update: {},
    create: {
      shopId: shop.id,
      productId: products[1].id,
      supplierId: northline.id,
      supplierSku: "NL-TEE-114",
      unitPrice: 9.25,
      moq: 100,
      leadTimeDays: 12
    }
  });

  await prisma.purchaseOrderApproval.upsert({
    where: { token: "demo-approval-po-2001" },
    update: {},
    create: {
      shopId: shop.id,
      purchaseOrderId: "demo-po-2001",
      requiredRole: "MANAGER",
      status: "APPROVED",
      token: "demo-approval-po-2001",
      decidedAt: new Date("2026-04-20"),
      note: "Approved for spring replenishment."
    }
  });

  await prisma.backorderReminder.upsert({
    where: { id: "demo-backorder-po-2001" },
    update: {},
    create: {
      id: "demo-backorder-po-2001",
      shopId: shop.id,
      purchaseOrderId: "demo-po-2001",
      supplierId: threadhouse.id,
      sku: "TEE-114",
      quantity: 24,
      dueAt: new Date("2026-05-24"),
      recommendation: "SOURCE_ALTERNATE",
      note: "AI recommends sourcing remaining quantity from Northline due to delay and partial fulfillment."
    }
  });

  await prisma.supplierPriceList.upsert({
    where: { id: "demo-threadhouse-pricelist" },
    update: {},
    create: {
      id: "demo-threadhouse-pricelist",
      shopId: shop.id,
      supplierId: threadhouse.id,
      name: "Threadhouse Summer 2026",
      effectiveFrom: new Date("2026-06-01"),
      currency: "USD",
      items: {
        create: [
          {
            productId: products[1].id,
            sku: "TEE-114",
            moq: 200,
            unitPrice: 9.6,
            previousUnitPrice: 9,
            priceChangePercent: 6.67,
            marginImpact: -0.6
          },
          {
            productId: products[1].id,
            sku: "TEE-114",
            moq: 500,
            unitPrice: 8.75,
            previousUnitPrice: 9,
            priceChangePercent: -2.78,
            marginImpact: 0.25
          }
        ]
      }
    }
  });

  await prisma.supplierContract.upsert({
    where: { id: "demo-threadhouse-contract" },
    update: {},
    create: {
      id: "demo-threadhouse-contract",
      shopId: shop.id,
      supplierId: threadhouse.id,
      title: "Threadhouse apparel supply agreement",
      status: "ACTIVE",
      effectiveDate: new Date("2025-08-01"),
      renewalDate: new Date("2026-07-15"),
      paymentTerms: "50% deposit, balance Net 15",
      moqTerms: "MOQ 200 units by SKU",
      leadTimeCommitment: "18 calendar days standard production",
      returnPolicy: "Defects accepted within 14 days",
      exclusivityClauses: "No channel exclusivity"
    }
  });

  await prisma.supplierCommunication.upsert({
    where: { id: "demo-threadhouse-comm" },
    update: {},
    create: {
      id: "demo-threadhouse-comm",
      shopId: shop.id,
      supplierId: threadhouse.id,
      channel: "EMAIL",
      direction: "OUTBOUND",
      intent: "DELAY_INQUIRY",
      subject: "PO-2001 delivery variance",
      body: "Please confirm the root cause for the 8-day delay and whether June orders are at risk.",
      status: "sent",
      sentAt: new Date("2026-05-17")
    }
  });

  for (const product of products) {
    await prisma.productDemandProfile.upsert({
      where: { productId: product.id },
      update: {},
      create: {
        shopId: shop.id,
        productId: product.id,
        baselineDailyDemand: product.sku === "TEE-114" ? 4.2 : product.sku === "BAG-001" ? 1.4 : 0.6,
        salesVelocity30d: product.sku === "TEE-114" ? 126 : product.sku === "BAG-001" ? 42 : 18,
        returnRate: product.sku === "TEE-114" ? 6 : 2,
        activeDiscountPercent: product.sku === "MUG-220" ? 10 : 0,
        restockHaloMultiplier: product.sku === "TEE-114" ? 1.15 : 1,
        daysSinceLastSale: product.sku === "MUG-220" ? 67 : 2,
        lastSaleAt: product.sku === "MUG-220" ? new Date("2026-04-02") : new Date("2026-06-06")
      }
    });

    await prisma.demandForecast.upsert({
      where: { id: `demo-forecast-${product.sku}` },
      update: {},
      create: {
        id: `demo-forecast-${product.sku}`,
        shopId: shop.id,
        productId: product.id,
        horizonDays: 30,
        baselineDemand: product.sku === "TEE-114" ? 126 : 42,
        adjustedDemand: product.sku === "TEE-114" ? 151 : 38,
        trendSignal: product.sku === "TEE-114" ? 4.2 : 1.4,
        seasonalitySignal: product.sku === "TEE-114" ? 1.12 : 0.9,
        noiseSignal: 0.4,
        externalTrendScore: product.sku === "TEE-114" ? 18 : 0,
        returnRateAdjustment: product.sku === "TEE-114" ? -6 : -2,
        discountAdjustment: product.sku === "MUG-220" ? -5 : 0,
        restockHaloAdjustment: product.sku === "TEE-114" ? 15 : 0,
        forecastValue: product.sku === "TEE-114" ? 4228 : 1216,
        modelConfidence: product.sku === "MUG-220" ? "Low" : "Medium"
      }
    });

    await prisma.forecastAccuracy.upsert({
      where: { productId_month: { productId: product.id, month: new Date("2026-05-01") } },
      update: {},
      create: {
        shopId: shop.id,
        productId: product.id,
        month: new Date("2026-05-01"),
        forecastDemand: product.sku === "TEE-114" ? 120 : 45,
        actualDemand: product.sku === "TEE-114" ? 132 : 30,
        mape: product.sku === "TEE-114" ? 9.09 : 50,
        tuningSuggestion: product.sku === "TEE-114" ? "Model is within acceptable tolerance." : "Increase merchant proxy input or split promotional demand from baseline."
      }
    });
  }

  await prisma.demandSignal.upsert({
    where: { id: "demo-demand-signal-tee" },
    update: {},
    create: {
      id: "demo-demand-signal-tee",
      shopId: shop.id,
      productId: products[1].id,
      keyword: "core tee",
      type: "GOOGLE_TRENDS",
      score: 18,
      metadata: { source: "seed" }
    }
  });

  await prisma.parsedInvoice.upsert({
    where: { shopId_invoiceNumber: { shopId: shop.id, invoiceNumber: "INV-2001" } },
    update: {},
    create: {
      shopId: shop.id,
      purchaseOrderId: "demo-po-2001",
      supplierName: "Threadhouse Manufacturing",
      invoiceNumber: "INV-2001",
      invoiceDate: new Date("2026-05-16"),
      dueDate: new Date("2026-05-31"),
      paymentTerms: "Net 15",
      subtotal: 1920,
      total: 1920,
      status: "FLAGGED",
      rawExtractedJson: { source: "seed" },
      discrepancySummary: { priceMismatch: 1, qtyMismatch: 1 },
      lines: {
        create: [
          {
            productId: products[1].id,
            sku: "TEE-114",
            description: "Core Tee",
            quantity: 200,
            unitPrice: 9.6,
            total: 1920,
            discrepancyType: "PRICE_MISMATCH",
            discrepancyNote: "PO price 9, invoice price 9.6"
          }
        ]
      }
    }
  });

  await prisma.profitScenario.upsert({
    where: { id: "demo-profit-scenario" },
    update: {},
    create: {
      id: "demo-profit-scenario",
      shopId: shop.id,
      name: "Threadhouse reorder comparison",
      timeframeDays: 60,
      budget: 5000,
      options: {
        create: [
          {
            productId: products[1].id,
            supplierName: "Threadhouse Manufacturing",
            label: "Order 500 tees",
            orderQuantity: 500,
            supplierPrice: 8.75,
            sellingPrice: 28,
            expectedSellThrough: 0.82,
            projectedGrossProfit: 7892.5,
            capitalAtRisk: 787.5,
            breakEvenUnits: 228,
            paybackPeriodDays: 34,
            cashFlowImpact: 7105,
            monteCarloJson: { iterations: 1000, p10: 5100, p50: 7800, p90: 9700, probabilityProfit: 96 }
          }
        ]
      }
    }
  });

  const competitor = await prisma.competitorProduct.upsert({
    where: { id: "demo-competitor-tee" },
    update: {},
    create: {
      id: "demo-competitor-tee",
      shopId: shop.id,
      productId: products[1].id,
      competitorName: "Market Rival",
      url: "https://example.com/core-tee"
    }
  });
  await prisma.competitorPriceSnapshot.upsert({
    where: { id: "demo-competitor-tee-snapshot" },
    update: {},
    create: {
      id: "demo-competitor-tee-snapshot",
      competitorProductId: competitor.id,
      observedPrice: 25,
      merchantPrice: 28,
      priceDelta: -3,
      recommendation: "Consider tactical reprice on top-selling SKU"
    }
  });

  await prisma.returnIntake.upsert({
    where: { id: "demo-return-tee-defective" },
    update: {},
    create: {
      id: "demo-return-tee-defective",
      shopId: shop.id,
      productId: products[1].id,
      supplierId: threadhouse.id,
      orderName: "#1048",
      salesChannel: "Shopify Online Store",
      condition: "DEFECTIVE",
      quantity: 4,
      unitCost: 9,
      margin: 19,
      restockingDecision: "DISPOSE",
      aiReason: "Supplier-fault defect should not be restocked; include in RMA evidence.",
      receivedAt: new Date("2026-06-07")
    }
  });

  await prisma.returnIntake.upsert({
    where: { id: "demo-return-bag-resellable" },
    update: {},
    create: {
      id: "demo-return-bag-resellable",
      shopId: shop.id,
      productId: products[0].id,
      supplierId: northline.id,
      orderName: "#1051",
      salesChannel: "Shopify POS",
      condition: "RESELLABLE",
      quantity: 2,
      unitCost: 14,
      margin: 18,
      restockingDecision: "RESTOCK_NEW",
      aiReason: "Item is resellable and demand is steady enough to return to available stock.",
      receivedAt: new Date("2026-06-06")
    }
  });

  await prisma.supplierRma.upsert({
    where: { shopId_rmaNumber: { shopId: shop.id, rmaNumber: "RMA-THREAD-0626" } },
    update: {},
    create: {
      id: "demo-rma-threadhouse",
      shopId: shop.id,
      supplierId: threadhouse.id,
      rmaNumber: "RMA-THREAD-0626",
      status: "DRAFT",
      defectRate: 11.8,
      body: "Defect rate crossed the 8% threshold for Core Tee returns. Please authorize RMA review and replacement credit."
    }
  });

  const expiryBatch = await prisma.inventoryBatch.upsert({
    where: { productId_batchNumber: { productId: products[2].id, batchNumber: "MUG-LOT-0726" } },
    update: {
      expiryDate: new Date("2026-07-02"),
      quantityReceived: 72,
      quantityRemaining: 18,
      disposition: "DISCOUNT"
    },
    create: {
      id: "demo-batch-mug-expiring",
      shopId: shop.id,
      productId: products[2].id,
      locationId: retail.id,
      batchNumber: "MUG-LOT-0726",
      expiryDate: new Date("2026-07-02"),
      quantityReceived: 72,
      quantityRemaining: 18,
      unitCost: 6,
      disposition: "DISCOUNT"
    }
  });

  await prisma.inventoryBatch.upsert({
    where: { productId_batchNumber: { productId: products[1].id, batchNumber: "TEE-BATCH-0926" } },
    update: {
      expiryDate: new Date("2026-09-01"),
      quantityReceived: 160,
      quantityRemaining: 94,
      disposition: "EXPIRING"
    },
    create: {
      id: "demo-batch-tee-expiring",
      shopId: shop.id,
      productId: products[1].id,
      locationId: warehouse.id,
      batchNumber: "TEE-BATCH-0926",
      expiryDate: new Date("2026-09-01"),
      quantityReceived: 160,
      quantityRemaining: 94,
      unitCost: 9,
      disposition: "EXPIRING"
    }
  });

  await prisma.batchShipment.upsert({
    where: { id: "demo-batch-shipment-mug" },
    update: {},
    create: {
      id: "demo-batch-shipment-mug",
      shopId: shop.id,
      batchId: expiryBatch.id,
      orderName: "#1032",
      customerEmail: "customer@example.com",
      quantity: 2,
      shippedAt: new Date("2026-05-30")
    }
  });

  await prisma.threePLConnection.upsert({
    where: { id: "demo-3pl-fba" },
    update: {},
    create: {
      id: "demo-3pl-fba",
      shopId: shop.id,
      provider: "AMAZON_FBA",
      name: "Amazon FBA East",
      locationId: warehouse.id,
      apiKeyRef: "merchant-managed-sp-api-secret",
      webhookSecret: "demo-webhook-secret"
    }
  });

  await prisma.threePLInventorySnapshot.upsert({
    where: { id: "demo-3pl-snapshot-tee" },
    update: {
      threePLQuantity: 86,
      shopifyQuantity: 80,
      discrepancyQuantity: 6,
      status: "DISCREPANCY"
    },
    create: {
      id: "demo-3pl-snapshot-tee",
      shopId: shop.id,
      productId: products[1].id,
      provider: "AMAZON_FBA",
      locationName: "Amazon FBA East",
      externalSku: "TEE-114-FBA",
      threePLQuantity: 86,
      shopifyQuantity: 80,
      discrepancyQuantity: 6,
      fbaFee: 1.75,
      status: "DISCREPANCY",
      observedAt: new Date("2026-06-08")
    }
  });

  await prisma.locationReplenishmentRule.upsert({
    where: { productId_locationId: { productId: products[2].id, locationId: retail.id } },
    update: { reorderPoint: 12, reorderQuantity: 48, abcClass: "A" },
    create: {
      shopId: shop.id,
      productId: products[2].id,
      locationId: retail.id,
      reorderPoint: 12,
      reorderQuantity: 48,
      abcClass: "A"
    }
  });

  await prisma.inventoryTransferSuggestion.upsert({
    where: { id: "demo-transfer-suggestion-mug" },
    update: {
      urgencyScore: 92,
      costEstimate: 16.8,
      reason: "Warehouse A has 10.0 months of Ceramic Mug stock while Retail Floor has 1.7 days."
    },
    create: {
      id: "demo-transfer-suggestion-mug",
      shopId: shop.id,
      fromLocationId: warehouse.id,
      toLocationId: retail.id,
      urgencyScore: 92,
      costEstimate: 16.8,
      reason: "Warehouse A has 10.0 months of Ceramic Mug stock while Retail Floor has 1.7 days.",
      lines: {
        create: [{ productId: products[2].id, sku: "MUG-220", quantity: 48, monthsAtSource: 10, daysAtDestination: 1.7 }]
      }
    }
  });

  await prisma.inventoryTransfer.upsert({
    where: { id: "demo-transfer-in-transit" },
    update: {},
    create: {
      id: "demo-transfer-in-transit",
      shopId: shop.id,
      fromLocationId: warehouse.id,
      toLocationId: retail.id,
      status: "IN_TRANSIT",
      costEstimate: 14,
      shippedAt: new Date("2026-06-07"),
      lines: {
        create: [{ productId: products[0].id, sku: "BAG-001", quantity: 18 }]
      }
    }
  });

  const customReport = await prisma.customReport.upsert({
    where: { shopId_name: { shopId: shop.id, name: "Weekly owner inventory report" } },
    update: {
      dimensions: ["SKU", "Supplier", "Category"],
      metrics: ["Value", "Velocity", "Margin"],
      filters: { dateRange: "last_30_days" },
      visualization: "BAR"
    },
    create: {
      id: "demo-custom-report-owner",
      shopId: shop.id,
      name: "Weekly owner inventory report",
      dimensions: ["SKU", "Supplier", "Category"],
      metrics: ["Value", "Velocity", "Margin"],
      filters: { dateRange: "last_30_days" },
      visualization: "BAR",
      createdBy: operator.email
    }
  });

  await prisma.scheduledReport.upsert({
    where: { id: "demo-scheduled-owner-report" },
    update: {
      recipientEmail: "owner@example.com",
      frequency: "WEEKLY",
      active: true,
      nextSendAt: new Date("2026-06-15")
    },
    create: {
      id: "demo-scheduled-owner-report",
      shopId: shop.id,
      customReportId: customReport.id,
      reportKey: "inventory-valuation",
      frequency: "WEEKLY",
      dayOfWeek: 1,
      recipientEmail: "owner@example.com",
      active: true,
      nextSendAt: new Date("2026-06-15")
    }
  });

  await prisma.integrationConnection.upsert({
    where: { shopId_provider_name: { shopId: shop.id, provider: "SHOPIFY", name: "Demo Shopify Admin" } },
    update: { status: "CONNECTED", lastSyncedAt: new Date("2026-06-08") },
    create: {
      id: "demo-integration-shopify",
      shopId: shop.id,
      provider: "SHOPIFY",
      name: "Demo Shopify Admin",
      status: "CONNECTED",
      externalAccountId: "demo.myshopify.com",
      accessTokenRef: "shopify-admin-token-ref",
      config: { scopes: ["read_products", "write_inventory", "write_metafields"] },
      lastSyncedAt: new Date("2026-06-08")
    }
  });

  await prisma.integrationConnection.upsert({
    where: { shopId_provider_name: { shopId: shop.id, provider: "QUICKBOOKS_ONLINE", name: "QBO Sandbox" } },
    update: { status: "CONNECTED", lastSyncedAt: new Date("2026-06-08") },
    create: {
      id: "demo-integration-qbo",
      shopId: shop.id,
      provider: "QUICKBOOKS_ONLINE",
      name: "QBO Sandbox",
      status: "CONNECTED",
      externalAccountId: "qbo-company-123",
      accessTokenRef: "qbo-token-ref",
      config: { companyName: "Demo Warehouse" },
      lastSyncedAt: new Date("2026-06-08")
    }
  });

  await prisma.syncLog.upsert({
    where: { id: "demo-sync-log-shopify-metafields" },
    update: {},
    create: {
      id: "demo-sync-log-shopify-metafields",
      shopId: shop.id,
      provider: "SHOPIFY",
      direction: "OUTBOUND",
      endpoint: "/admin/api/metafields",
      payload: { productId: products[1].id, namespace: "imp" },
      response: { synced: 3 },
      status: "SUCCESS",
      httpStatus: 200,
      retryCount: 0,
      durationMs: 184,
      occurredAt: new Date("2026-06-08")
    }
  });

  await prisma.shopifyWebhookEvent.upsert({
    where: { id: "demo-shopify-webhook-order" },
    update: {},
    create: {
      id: "demo-shopify-webhook-order",
      shopId: shop.id,
      topic: "orders/create",
      shopifyWebhookId: "gid://shopify/WebhookSubscription/demo",
      payload: { orderName: "#1054", source: "seed" },
      status: "PROCESSED",
      processedAt: new Date("2026-06-08")
    }
  });

  for (const field of [
    { key: "reorder_point", value: "24", type: "number_integer" },
    { key: "lead_time_days", value: "12", type: "number_integer" },
    { key: "abc_class", value: "A", type: "single_line_text_field" }
  ]) {
    await prisma.shopifyMetafieldSync.upsert({
      where: { productId_namespace_key: { productId: products[1].id, namespace: "imp", key: field.key } },
      update: { value: field.value, status: "SYNCED", syncedAt: new Date("2026-06-08") },
      create: {
        shopId: shop.id,
        productId: products[1].id,
        namespace: "imp",
        ...field,
        status: "SYNCED",
        syncedAt: new Date("2026-06-08")
      }
    });
  }

  await prisma.shopifyFlowEvent.upsert({
    where: { id: "demo-flow-dead-stock" },
    update: {},
    create: {
      id: "demo-flow-dead-stock",
      shopId: shop.id,
      eventName: "imp.dead_stock_flagged",
      payload: { sku: "MUG-220", action: "add_to_sale_collection" },
      status: "EMITTED",
      emittedAt: new Date("2026-06-08")
    }
  });

  await prisma.accountingExport.upsert({
    where: { id: "demo-accounting-qbo-valuation" },
    update: {},
    create: {
      id: "demo-accounting-qbo-valuation",
      shopId: shop.id,
      provider: "QUICKBOOKS_ONLINE",
      type: "INVENTORY_VALUATION",
      amount: 4280,
      payload: { account: "Inventory Asset", amount: 4280 },
      response: { queued: true },
      status: "QUEUED",
      exportedAt: new Date("2026-06-08")
    }
  });

  await prisma.chatBotConnection.upsert({
    where: { shopId_provider_channelId: { shopId: shop.id, provider: "SLACK", channelId: "C-OPS" } },
    update: { status: "CONNECTED" },
    create: {
      id: "demo-slack-ops",
      shopId: shop.id,
      provider: "SLACK",
      workspaceId: "T-DEMO",
      channelId: "C-OPS",
      channelName: "#inventory-ops",
      botTokenRef: "slack-bot-token-ref",
      status: "CONNECTED",
      dailyDigestAt: "09:00"
    }
  });

  await prisma.mobileOfflineSync.upsert({
    where: { id: "demo-mobile-sync-count" },
    update: {},
    create: {
      id: "demo-mobile-sync-count",
      shopId: shop.id,
      deviceId: "warehouse-ipad-1",
      userId: operator.id,
      mode: "COUNT",
      payload: { sku: "TEE-114", countedQuantity: 238 },
      status: "QUEUED",
      retryCount: 0
    }
  });

  const demoApiKey = "imp_demo_enterprise_key";
  await prisma.publicApiKey.upsert({
    where: { prefix: demoApiKey.slice(0, 12) },
    update: { active: true },
    create: {
      id: "demo-public-api-key",
      shopId: shop.id,
      name: "Enterprise warehouse API",
      keyHash: createHash("sha256").update(demoApiKey).digest("hex"),
      prefix: demoApiKey.slice(0, 12),
      plan: "enterprise",
      active: true
    }
  });

  await prisma.outboundWebhookSubscription.upsert({
    where: { id: "demo-outbound-webhook" },
    update: { active: true },
    create: {
      id: "demo-outbound-webhook",
      shopId: shop.id,
      targetUrl: "https://example.com/imp-events",
      eventTypes: ["imp.dead_stock_flagged", "imp.low_stock"],
      secret: "demo-webhook-secret",
      active: true
    }
  });

  await prisma.whiteLabelProfile.upsert({
    where: { shopId: shop.id },
    update: {
      agencyName: "Northstar Shopify Agency",
      brandName: "Northstar Inventory OS",
      supportEmail: "support@northstar.example",
      customDomain: "inventory.northstar.example",
      status: "ACTIVE"
    },
    create: {
      id: "demo-white-label",
      shopId: shop.id,
      agencyName: "Northstar Shopify Agency",
      brandName: "Northstar Inventory OS",
      primaryColor: "#0f766e",
      accentColor: "#111827",
      supportEmail: "support@northstar.example",
      customDomain: "inventory.northstar.example",
      emailFromName: "Northstar Inventory",
      pdfFooterText: "Powered by Northstar Inventory OS",
      status: "ACTIVE"
    }
  });

  const mainManagedStore = await prisma.managedStore.upsert({
    where: { shopId_shopifyDomain: { shopId: shop.id, shopifyDomain: "demo-main.myshopify.com" } },
    update: {
      inventoryEfficiencyScore: 91,
      revenue30d: 42800,
      inventoryValue: 18600,
      unitsOnHand: 640,
      lastSyncedAt: new Date("2026-06-08")
    },
    create: {
      id: "demo-managed-store-main",
      shopId: shop.id,
      shopifyDomain: "demo-main.myshopify.com",
      name: "Main Store",
      status: "CONNECTED",
      inventoryEfficiencyScore: 91,
      revenue30d: 42800,
      inventoryValue: 18600,
      unitsOnHand: 640,
      lastSyncedAt: new Date("2026-06-08")
    }
  });

  const outletManagedStore = await prisma.managedStore.upsert({
    where: { shopId_shopifyDomain: { shopId: shop.id, shopifyDomain: "demo-outlet.myshopify.com" } },
    update: {
      inventoryEfficiencyScore: 63,
      revenue30d: 12100,
      inventoryValue: 27400,
      unitsOnHand: 980,
      lastSyncedAt: new Date("2026-06-08")
    },
    create: {
      id: "demo-managed-store-outlet",
      shopId: shop.id,
      shopifyDomain: "demo-outlet.myshopify.com",
      name: "Outlet Store",
      status: "CONNECTED",
      inventoryEfficiencyScore: 63,
      revenue30d: 12100,
      inventoryValue: 27400,
      unitsOnHand: 980,
      lastSyncedAt: new Date("2026-06-08")
    }
  });

  await prisma.crossStoreTransferSuggestion.upsert({
    where: { id: "demo-cross-store-transfer-tee" },
    update: {
      urgencyScore: 88,
      valueMoved: 648,
      reason: "Outlet has 6.3 months of Core Tee stock while Main Store is projected to stock out in 9 days."
    },
    create: {
      id: "demo-cross-store-transfer-tee",
      shopId: shop.id,
      fromStoreId: outletManagedStore.id,
      toStoreId: mainManagedStore.id,
      sku: "TEE-114",
      productName: "Core Tee",
      quantity: 72,
      urgencyScore: 88,
      valueMoved: 648,
      reason: "Outlet has 6.3 months of Core Tee stock while Main Store is projected to stock out in 9 days."
    }
  });

  await prisma.aIMemoryEvent.upsert({
    where: { shopId_topic: { shopId: shop.id, topic: "sku:TEE-114" } },
    update: {
      queryCount: 7,
      lastQuestion: "What is my Black Friday stockout risk for TEE-114?",
      importance: 96
    },
    create: {
      id: "demo-ai-memory-tee",
      shopId: shop.id,
      userId: operator.id,
      sku: "TEE-114",
      topic: "sku:TEE-114",
      queryCount: 7,
      lastQuestion: "What is my Black Friday stockout risk for TEE-114?",
      summary: "Merchant repeatedly checks seasonal availability and reorder risk for Core Tee.",
      importance: 96
    }
  });

  await prisma.aIPinnedInsight.upsert({
    where: { id: "demo-ai-pin-tee" },
    update: {
      insight: "TEE-114 is a repeated AI focus and should stay visible until seasonal PO coverage is approved.",
      confidence: "High"
    },
    create: {
      id: "demo-ai-pin-tee",
      shopId: shop.id,
      title: "Protect Core Tee availability",
      insight: "TEE-114 is a repeated AI focus and should stay visible until seasonal PO coverage is approved.",
      sourceQuestion: "What is my Black Friday stockout risk for TEE-114?",
      confidence: "High",
      tags: ["AI memory", "stockout", "TEE-114"],
      createdBy: operator.email
    }
  });

  for (const role of ACCESS_ROLES) {
    for (const permission of PERMISSIONS) {
      await prisma.rolePermission.upsert({
        where: { shopId_role_permission: { shopId: shop.id, role, permission } },
        update: { enabled: DEFAULT_PERMISSION_MATRIX[role].includes(permission) },
        create: {
          shopId: shop.id,
          role,
          permission,
          enabled: DEFAULT_PERMISSION_MATRIX[role].includes(permission)
        }
      });
    }
  }

  await prisma.userRoleAssignment.upsert({
    where: { shopId_userId: { shopId: shop.id, userId: owner.id } },
    update: { role: "OWNER", active: true },
    create: {
      id: "demo-role-owner",
      shopId: shop.id,
      userId: owner.id,
      role: "OWNER",
      active: true
    }
  });

  await prisma.userRoleAssignment.upsert({
    where: { shopId_userId: { shopId: shop.id, userId: operator.id } },
    update: { role: "INVENTORY_MANAGER", active: true, assignedBy: owner.id },
    create: {
      id: "demo-role-ops",
      shopId: shop.id,
      userId: operator.id,
      role: "INVENTORY_MANAGER",
      assignedBy: owner.id,
      active: true
    }
  });

  const firstAuditPayload = {
    shopId: shop.id,
    userId: owner.id,
    role: "OWNER",
    permission: "settings.roles",
    actionType: "roles.assignment.create",
    entityModel: "UserRoleAssignment",
    entityId: "demo-role-ops",
    newValue: { userId: operator.id, role: "INVENTORY_MANAGER" },
    timestamp: "2026-06-08T18:20:00.000Z"
  };
  const firstAuditHash = createHash("sha256").update(JSON.stringify(firstAuditPayload)).digest("hex");
  await prisma.complianceAuditLog.upsert({
    where: { id: "demo-audit-role-assignment" },
    update: {},
    create: {
      id: "demo-audit-role-assignment",
      shopId: shop.id,
      userId: owner.id,
      role: "OWNER",
      permission: "settings.roles",
      actionType: "roles.assignment.create",
      entityModel: "UserRoleAssignment",
      entityId: "demo-role-ops",
      newValue: firstAuditPayload.newValue,
      ipAddress: "127.0.0.1",
      userAgent: "IMP seed",
      recordHash: firstAuditHash,
      timestamp: new Date(firstAuditPayload.timestamp)
    }
  });

  const secondAuditPayload = {
    shopId: shop.id,
    userId: operator.id,
    role: "INVENTORY_MANAGER",
    permission: "inventory.adjust",
    actionType: "inventory.adjust",
    entityModel: "InventoryAdjustment",
    entityId: "demo-shrinkage-tee",
    oldValue: { quantity: 240 },
    newValue: { quantity: 238, reason: "cycle count correction" },
    previousHash: firstAuditHash,
    timestamp: "2026-06-08T18:25:00.000Z"
  };
  const secondAuditHash = createHash("sha256").update(JSON.stringify(secondAuditPayload)).digest("hex");
  await prisma.complianceAuditLog.upsert({
    where: { id: "demo-audit-inventory-adjust" },
    update: {},
    create: {
      id: "demo-audit-inventory-adjust",
      shopId: shop.id,
      userId: operator.id,
      role: "INVENTORY_MANAGER",
      permission: "inventory.adjust",
      actionType: "inventory.adjust",
      entityModel: "InventoryAdjustment",
      entityId: "demo-shrinkage-tee",
      oldValue: secondAuditPayload.oldValue,
      newValue: secondAuditPayload.newValue,
      ipAddress: "127.0.0.1",
      userAgent: "IMP seed",
      shopifySyncStatus: "SUCCESS",
      shopifySyncResult: { endpoint: "inventory_levels/adjust", status: 200 },
      previousHash: firstAuditHash,
      recordHash: secondAuditHash,
      timestamp: new Date(secondAuditPayload.timestamp)
    }
  });
}

main()
  .finally(async () => {
    await prisma.$disconnect();
  })
  .catch(async (error) => {
    console.error(error);
    await prisma.$disconnect();
    process.exit(1);
  });

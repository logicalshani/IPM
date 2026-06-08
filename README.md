# Inventory Manager Pro

AI-native Shopify inventory operations platform built with Next.js App Router, Prisma, PostgreSQL, Redis/BullMQ, Polaris, and streaming AI.

## Implemented Phase 1 spine

- Feature flags per shop and plan.
- Stocktake session workflow models and services.
- Live variance engine with match, warning, and critical bands.
- Discrepancy movement context for supervisor review.
- Approval and sync service methods.
- Shrinkage summaries by SKU and location.
- Barcode generator for EAN-13, Code-128, QR Code, and DataMatrix.
- Drag-and-drop label template designer.
- PWA-style mobile scanner route with offline local queue.
- Streaming AI insight route using Claude Sonnet 4 with GPT-4o fallback.
- Vitest service tests and a Supertest route contract test.
- Supplier intelligence: lead-time engine, reliability scoring, pricing/contract alerts, communication hub, and AI supplier recommendations.

## Development

```bash
npm install
npm run dev
```

Create a PostgreSQL database and set `DATABASE_URL`, then run:

```bash
npx prisma generate
npx prisma migrate dev
```

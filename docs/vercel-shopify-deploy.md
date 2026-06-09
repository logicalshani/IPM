# Vercel and Shopify Test Deploy

## Production shape

Vercel can deploy the Next.js app and API routes. It cannot reach a database or Redis server running on `localhost` on a laptop. For a production-like Shopify test, use hosted Postgres and hosted Redis, or expose the local backend through a secure public tunnel and use that public URL in environment variables.

## Vercel settings

- Framework: Next.js
- Install command: `npm install`
- Build command: `npm run vercel-build`
- Production branch: `master`
- Node.js: 20.x

## Required environment variables

Use `.env.vercel.example` as the checklist in Vercel Project Settings.

## First database setup

This repo currently uses Prisma schema push for the first deploy:

```bash
DATABASE_URL="postgresql://..." npx prisma db push
```

Seed demo data when needed:

```bash
DATABASE_URL="postgresql://..." npx tsx prisma/seed.ts
```

## Shopify URLs

Set the Shopify app URL to:

```text
https://YOUR-VERCEL-DOMAIN.vercel.app
```

OAuth callback URL:

```text
https://YOUR-VERCEL-DOMAIN.vercel.app/api/auth/shopify/callback
```

Webhook target format:

```text
https://YOUR-VERCEL-DOMAIN.vercel.app/api/platform/shopify/webhooks/products/create
https://YOUR-VERCEL-DOMAIN.vercel.app/api/platform/shopify/webhooks/products/update
https://YOUR-VERCEL-DOMAIN.vercel.app/api/platform/shopify/webhooks/inventory_levels/update
https://YOUR-VERCEL-DOMAIN.vercel.app/api/platform/shopify/webhooks/orders/create
```

Use the same webhook secret in Shopify and `SHOPIFY_WEBHOOK_SECRET`. Set `SHOPIFY_TOKEN_ENCRYPTION_KEY` to a long random value so Shopify Admin API access tokens are encrypted before they are stored.

After OAuth succeeds, IMP automatically creates Admin GraphQL webhook subscriptions for product, inventory, order, fulfillment, refund, and app uninstall events using `SHOPIFY_ADMIN_API_VERSION` and logs each registration in sync logs.

import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { apiError, ok } from "@/lib/api";
import { authenticatePublicApiKey, rateLimitForPlan } from "@/services/platformIntegration.service";

const resources = new Set(["inventory", "suppliers", "purchase-orders", "stock-counts", "alerts"]);

export async function GET(request: Request, { params }: { params: { resource: string } }) {
  try {
    const auth = await authenticate(request);
    if (auth instanceof Response) return auth;
    if (!resources.has(params.resource)) return NextResponse.json({ error: "Unknown resource" }, { status: 404 });
    return ok(await readResource(params.resource, auth.shopId));
  } catch (error) {
    return apiError(error);
  }
}

export async function POST(request: Request, { params }: { params: { resource: string } }) {
  try {
    const auth = await authenticate(request);
    if (auth instanceof Response) return auth;
    if (!resources.has(params.resource)) return NextResponse.json({ error: "Unknown resource" }, { status: 404 });
    return ok({ accepted: true, resource: params.resource, payload: await request.json(), rateLimit: rateLimitForPlan(auth.plan) }, { status: 202 });
  } catch (error) {
    return apiError(error);
  }
}

async function authenticate(request: Request) {
  const apiKey = request.headers.get("authorization")?.replace(/^Bearer\s+/i, "") ?? request.headers.get("x-api-key");
  if (!apiKey) return NextResponse.json({ error: "API key required" }, { status: 401 });
  const record = await authenticatePublicApiKey(apiKey);
  if (!record) return NextResponse.json({ error: "Invalid API key" }, { status: 401 });
  return record;
}

async function readResource(resource: string, shopId: string) {
  if (resource === "inventory") return prisma.product.findMany({ where: { shopId }, include: { inventory: true }, take: 100 });
  if (resource === "suppliers") return prisma.supplier.findMany({ where: { shopId }, take: 100 });
  if (resource === "purchase-orders") return prisma.purchaseOrder.findMany({ where: { shopId }, include: { lines: true }, take: 100 });
  if (resource === "stock-counts") return prisma.stocktakeSession.findMany({ where: { shopId }, include: { lines: true }, take: 100 });
  return prisma.financialAlert.findMany({ where: { shopId, resolvedAt: null }, take: 100 });
}

import { z } from "zod";
import type { Prisma } from "@prisma/client";
import { apiError, ok } from "@/lib/api";
import { buildCsvJournalEntry, pushAccountingEntry } from "@/services/platformIntegration.service";

const schema = z.discriminatedUnion("action", [
  z.object({ action: z.literal("push"), shopId: z.string(), provider: z.enum(["QUICKBOOKS_ONLINE", "XERO"]), type: z.enum(["INVENTORY_VALUATION", "COGS_ENTRY", "PURCHASE_ORDER_BILL", "JOURNAL_ENTRY"]), amount: z.number(), payload: z.record(z.unknown()) }),
  z.object({ action: z.literal("csv_export"), rows: z.array(z.object({ account: z.string(), debit: z.number().optional(), credit: z.number().optional(), memo: z.string().optional() })) })
]);

export async function POST(request: Request) {
  try {
    const body = schema.parse(await request.json());
    if (body.action === "csv_export") {
      return new Response(buildCsvJournalEntry(body.rows), { headers: { "Content-Type": "text/csv" } });
    }
    const { action: _action, ...input } = body;
    return ok(await pushAccountingEntry({ ...input, payload: input.payload as Prisma.InputJsonValue }), { status: 201 });
  } catch (error) {
    return apiError(error);
  }
}

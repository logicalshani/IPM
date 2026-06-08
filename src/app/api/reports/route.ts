import PDFDocument from "pdfkit";
import { z } from "zod";
import { apiError, ok } from "@/lib/api";
import {
  buildQuickBooksJournalCsv,
  buildReportCsv,
  getReportData,
  getReportLibrary,
  saveCustomReport,
  scheduleReport,
  type ReportKey
} from "@/services/reporting.service";

const saveSchema = z.discriminatedUnion("action", [
  z.object({
    action: z.literal("save_custom"),
    shopId: z.string(),
    name: z.string().min(2),
    dimensions: z.array(z.string()).min(1),
    metrics: z.array(z.string()).min(1),
    filters: z.record(z.string()).optional(),
    visualization: z.enum(["TABLE", "BAR", "LINE", "PIE"]),
    createdBy: z.string().optional()
  }),
  z.object({
    action: z.literal("schedule"),
    shopId: z.string(),
    recipientEmail: z.string().email(),
    frequency: z.enum(["WEEKLY", "MONTHLY"]),
    dayOfWeek: z.number().int().min(0).max(6).optional(),
    customReportId: z.string().optional(),
    reportKey: z.string().optional()
  })
]);

export async function GET(request: Request) {
  try {
    const url = new URL(request.url);
    const shopId = url.searchParams.get("shopId") ?? "demo-shop";
    const reportKey = url.searchParams.get("reportKey") as ReportKey | null;
    const format = url.searchParams.get("format");

    if (!reportKey) {
      return ok(await getReportLibrary(shopId));
    }

    const report = await getReportData({
      shopId,
      reportKey,
      filters: {
        dateFrom: url.searchParams.get("dateFrom") ?? undefined,
        dateTo: url.searchParams.get("dateTo") ?? undefined,
        location: url.searchParams.get("location") ?? undefined,
        supplier: url.searchParams.get("supplier") ?? undefined,
        category: url.searchParams.get("category") ?? undefined,
        status: url.searchParams.get("status") ?? undefined
      }
    });

    if (format === "csv") {
      return new Response(buildReportCsv(report), {
        headers: {
          "Content-Type": "text/csv",
          "Content-Disposition": `attachment; filename="${reportKey}.csv"`
        }
      });
    }

    if (format === "quickbooks") {
      return new Response(buildQuickBooksJournalCsv(report), {
        headers: {
          "Content-Type": "text/csv",
          "Content-Disposition": `attachment; filename="${reportKey}-quickbooks.csv"`
        }
      });
    }

    if (format === "pdf") {
      const pdf = await renderReportPdf(report.definition.title, report.rows);
      return new Response(new Uint8Array(pdf), {
        headers: {
          "Content-Type": "application/pdf",
          "Content-Disposition": `attachment; filename="${reportKey}.pdf"`
        }
      });
    }

    return ok(report);
  } catch (error) {
    return apiError(error);
  }
}

export async function POST(request: Request) {
  try {
    const body = saveSchema.parse(await request.json());
    if (body.action === "save_custom") {
      const { action: _action, ...input } = body;
      return ok(await saveCustomReport(input), { status: 201 });
    }
    const { action: _action, ...input } = body;
    return ok(await scheduleReport(input), { status: 201 });
  } catch (error) {
    return apiError(error);
  }
}

async function renderReportPdf(title: string, rows: Array<Record<string, string | number>>) {
  const document = new PDFDocument({ margin: 40, size: "LETTER" });
  const chunks: Buffer[] = [];
  document.on("data", (chunk) => chunks.push(Buffer.from(chunk)));
  const done = new Promise<Buffer>((resolve) => {
    document.on("end", () => resolve(Buffer.concat(chunks)));
  });

  document.fontSize(18).text(title);
  document.moveDown();
  document.fontSize(10).text(`Generated ${new Date().toISOString()}`);
  document.moveDown();
  for (const row of rows.slice(0, 30)) {
    document.text(Object.entries(row).map(([key, value]) => `${key}: ${value}`).join(" | "));
  }
  document.end();
  return done;
}

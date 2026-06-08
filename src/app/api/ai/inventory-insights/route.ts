import { z } from "zod";
import { apiError } from "@/lib/api";
import { streamInventoryInsights } from "@/services/aiInventory.service";

const schema = z.object({
  shopId: z.string(),
  prompt: z.string().min(1)
});

export async function POST(request: Request) {
  try {
    const body = schema.parse(await request.json());
    const stream = await streamInventoryInsights(body);
    return stream.toDataStreamResponse();
  } catch (error) {
    return apiError(error);
  }
}

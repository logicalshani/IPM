import { z } from "zod";
import { apiError } from "@/lib/api";
import { createAIConsultation } from "@/services/aiConsultant.service";

const schema = z.object({
  shopId: z.string(),
  userId: z.string().optional(),
  question: z.string().min(1)
});

export async function POST(request: Request) {
  try {
    const body = schema.parse(await request.json());
    const result = await createAIConsultation(body);
    const response = result.stream.toDataStreamResponse();
    response.headers.set("x-imp-ai-session-id", result.sessionId);
    response.headers.set("x-imp-ai-analysis", encodeURIComponent(JSON.stringify(result.analysis)));
    return response;
  } catch (error) {
    return apiError(error);
  }
}

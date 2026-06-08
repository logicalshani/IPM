import { z } from "zod";
import { apiError, ok } from "@/lib/api";
import { recordAIConsultationFeedback } from "@/services/aiConsultant.service";

const schema = z.object({
  shopId: z.string(),
  sessionId: z.string(),
  feedback: z.enum(["THUMBS_UP", "THUMBS_DOWN"]),
  feedbackNote: z.string().optional()
});

export async function POST(request: Request) {
  try {
    const body = schema.parse(await request.json());
    return ok(await recordAIConsultationFeedback(body), { status: 201 });
  } catch (error) {
    return apiError(error);
  }
}

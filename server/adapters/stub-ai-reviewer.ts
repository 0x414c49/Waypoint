import type { AIReviewOutput, AIReviewRequest, AIReviewer } from "../ports/ai-reviewer.js";

export class StubAIReviewer implements AIReviewer {
  async review(request: AIReviewRequest): Promise<AIReviewOutput> {
    const subject = request.title.trim() || "this learning record";
    const evidenceLine = request.evidence.find((item) => item.trim())?.trim();
    return {
      provider: "stub",
      model: "deterministic-v1",
      summary: evidenceLine
        ? `A starting point for revisiting “${subject}”: ${evidenceLine}`
        : `A starting point for revisiting “${subject}”. This local preview does not interpret evidence or judge progress.`,
      strengths: ["The original target and its saved context remain available for comparison."],
      gaps: ["This deterministic local preview does not assess learning quality or verify evidence."],
      suggestedFollowUp: "Compare the original intent with what you observed, then keep or revise the human-authored reasoning yourself.",
      questions: [
        `What evidence would change your view of “${subject}”?`,
        `Which part of this record is still uncertain?`,
      ],
    };
  }
}

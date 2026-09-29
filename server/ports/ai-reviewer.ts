import type { AIReviewTargetType } from "../../shared/contracts/ai-reviews.js";

export interface AIReviewRequest {
  readonly targetType: AIReviewTargetType;
  readonly targetId: string;
  readonly title: string;
  readonly evidence: readonly string[];
}

export interface AIReviewOutput {
  readonly provider: string;
  readonly model?: string;
  readonly summary?: string;
  readonly strengths: readonly string[];
  readonly gaps: readonly string[];
  readonly suggestedFollowUp?: string;
  readonly questions: readonly string[];
}

export interface AIReviewer {
  review(request: AIReviewRequest): Promise<AIReviewOutput>;
}

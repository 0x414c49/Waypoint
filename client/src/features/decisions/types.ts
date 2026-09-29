import type {
  DecisionDetailContract,
  DecisionListContract,
  DecisionOptionContract,
  DecisionReviewContract,
  DecisionSummaryContract,
  ProblemDetails,
  TaskProjectionContract,
} from "../../../../shared/contracts/index.js";

export type DecisionStatus = DecisionSummaryContract["status"];
export type DecisionReviewOutcome = DecisionReviewContract["outcome"];
export type DecisionOption = DecisionOptionContract;
export type DecisionReview = DecisionReviewContract;
export type DecisionSummary = DecisionSummaryContract;
export type DecisionDetail = DecisionDetailContract;
export type DecisionList = DecisionListContract;
export type DecisionContext = NonNullable<TaskProjectionContract["decisionContext"]>;
export type DecisionProblem = ProblemDetails;

export interface DecisionDraftInput {
  title: string;
  decisionDate?: string;
  context?: string;
  constraints: string[];
  options: DecisionOption[];
  decision?: string;
  consequences?: string;
  assumptions: string[];
  falsifier?: string;
  initialReviewDate?: string;
}

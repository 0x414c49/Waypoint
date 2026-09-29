import { createIdempotencyKey } from "../today/api.js";
import type { PlanApplyResponseContract, PlanPreviewContract } from "../../../../shared/contracts/index.js";

export type QuarterList = { items: QuarterSummary[] };
export type QuarterSummary = {
  id: string; title: string; startDate: string; endDate: string;
  phase: "CURRENT" | "FUTURE" | "PAST"; planRevision: number; etag: string;
};
export type QuarterDetail = {
  id: string; title: string; description?: string; mantra?: string;
  startDate: string; endDate: string; phase: QuarterSummary["phase"];
  planRevision: number; etag: string;
  successCriteria: Array<{ id: string; text: string; position: number }>;
  focusAreas: Array<{ id: string; name: string; description?: string; targetMinutes?: number; position: number }>;
  milestones: Array<{ id: string; title: string; description?: string; startDate: string; endDate: string; mode: string; position: number; taskCount: number }>;
  tasks: Array<{ id: string; title: string; plannedDate: string; focusAreaId?: string; milestoneId: string; recommendationMode: string }>;
};
export type PlanPreview = PlanPreviewContract;
export type PlanApplyResponse = PlanApplyResponseContract;

export class QuarterApiError extends Error {
  constructor(readonly problem: { code?: string; detail?: string; errors?: string[]; requiredAcknowledgements?: PlanPreview["requiredAcknowledgements"] }) {
    super(problem.detail ?? "The request could not be completed.");
    this.name = "QuarterApiError";
  }
}

async function json<T>(response: Response): Promise<T> {
  let body: unknown;
  try { body = await response.json(); } catch { body = {}; }
  if (!response.ok) throw new QuarterApiError(body as ConstructorParameters<typeof QuarterApiError>[0]);
  return body as T;
}

export async function getQuarters(signal?: AbortSignal): Promise<QuarterList> {
  return json<QuarterList>(await fetch("/api/quarters", { headers: { Accept: "application/json" }, ...(signal ? { signal } : {}) }));
}

export async function getQuarter(quarterId: string, signal?: AbortSignal): Promise<QuarterDetail> {
  return json<QuarterDetail>(await fetch(`/api/quarters/${encodeURIComponent(quarterId)}`, { headers: { Accept: "application/json" }, ...(signal ? { signal } : {}) }));
}

export async function previewPlan(content: string): Promise<PlanPreview> {
  return json<PlanPreview>(await fetch("/api/plans/preview", {
    method: "POST", headers: { Accept: "application/json", "Content-Type": "application/json" },
    body: JSON.stringify({ sourceFormat: "yaml", content }),
  }));
}

async function durabilityUncertain(response: Response): Promise<boolean> {
  if (response.status !== 503) return false;
  try { return (await response.clone().json() as { code?: string }).code === "STORE_DURABILITY_UNCERTAIN"; }
  catch { return false; }
}

export async function applyPlan(preview: PlanPreview, acknowledgementIds: string[]): Promise<PlanApplyResponse> {
  const key = createIdempotencyKey();
  const headers: Record<string, string> = {
    Accept: "application/json", "Content-Type": "application/json", "Idempotency-Key": key,
  };
  if (preview.mode === "UPDATE_QUARTER" && preview.baseEtag) headers["If-Match"] = preview.baseEtag;
  if (preview.mode === "CREATE_QUARTER") headers["If-None-Match"] = "*";
  const request = () => fetch("/api/plans/apply", {
    method: "POST", headers,
    body: JSON.stringify({ previewToken: preview.previewToken, acknowledgementIds }),
  });
  let response: Response;
  try { response = await request(); }
  catch { response = await request(); }
  if (await durabilityUncertain(response)) response = await request();
  return json<PlanApplyResponse>(response);
}

export async function exportQuarter(quarterId: string): Promise<{ blob: Blob; filename: string }> {
  const response = await fetch(`/api/plans/export/${encodeURIComponent(quarterId)}`, { headers: { Accept: "application/yaml" } });
  if (!response.ok) {
    let detail = "The current plan export could not be downloaded.";
    try { detail = (await response.json() as { detail?: string }).detail ?? detail; } catch { /* Keep the local fallback. */ }
    throw new QuarterApiError({ detail });
  }
  const disposition = response.headers.get("Content-Disposition") ?? "";
  const filename = /filename="([^"]+)"/.exec(disposition)?.[1] ?? `${quarterId}-plan.yaml`;
  return { blob: await response.blob(), filename };
}

export function downloadExport(blob: Blob, filename: string): void {
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = filename;
  anchor.click();
  URL.revokeObjectURL(url);
}

# Error, Conflict, and Concurrency Contract

Status: Confirmed on 2026-09-27

## Problem Details

Errors use `Content-Type: application/problem+json` following [RFC 9457](https://www.rfc-editor.org/rfc/rfc9457.html).

```json
{
  "type": "urn:journey-tracker:problem:active-session-conflict",
  "title": "Another session is running",
  "status": 409,
  "code": "ACTIVE_SESSION_CONFLICT",
  "detail": "Pause the current session before starting this item.",
  "instance": "/api/tasks/task-new/start",
  "traceId": "trace-opaque",
  "current": {},
  "attempted": {},
  "resolutions": []
}
```

- `type` identifies the problem category.
- `title` is stable short human text.
- `status` repeats the HTTP status.
- `code` is the stable application discriminator used by the client.
- `detail` explains this occurrence in calm, safe language.
- `instance` identifies the request occurrence/path.
- `traceId` supports local diagnostics without exposing internals.
- `current`, `attempted`, `fieldErrors`, and `resolutions` are typed extensions used only when relevant.

Clients branch on `code`, never prose.

## Validation errors

```json
{
  "type": "urn:journey-tracker:problem:validation-failed",
  "title": "The request is not valid",
  "status": 422,
  "code": "VALIDATION_FAILED",
  "detail": "Correct the highlighted values and try again.",
  "fieldErrors": [
    {
      "path": "/outcome",
      "code": "INVALID_VALUE",
      "message": "Choose Achieved, Made progress, or Not achieved."
    }
  ],
  "traceId": "trace-opaque"
}
```

Paths use JSON Pointer where the error belongs to request content. Plan validation may return multiple errors of the same problem type so the user can fix one document pass.

## Active-session conflict

```json
{
  "type": "urn:journey-tracker:problem:active-session-conflict",
  "title": "Another session is running",
  "status": 409,
  "code": "ACTIVE_SESSION_CONFLICT",
  "detail": "Pause the current session before starting this item.",
  "current": {
    "activeSession": {
      "id": "session-current",
      "startedAt": "2026-11-03T17:42:00Z",
      "task": {
        "id": "task-current",
        "title": "Rust ownership",
        "etag": "opaque-current-etag"
      }
    }
  },
  "attempted": { "taskId": "task-new" },
  "resolutions": [
    {
      "kind": "PAUSE_AND_SWITCH",
      "method": "POST",
      "href": "/api/tasks/task-new/start",
      "body": {
        "activeSessionResolution": {
          "kind": "PAUSE_AND_SWITCH",
          "activeSessionId": "session-current",
          "activeTaskEtag": "opaque-current-etag"
        }
      }
    },
    { "kind": "CANCEL" }
  ]
}
```

The UI offers exactly Pause current and switch, or Cancel. It does not infer a third resolution.

## Stale write

Missing `If-Match`:

```text
428 PRECONDITION_REQUIRED
```

Mismatched ETag:

```json
{
  "type": "urn:journey-tracker:problem:stale-write",
  "title": "This item changed",
  "status": 412,
  "code": "STALE_WRITE",
  "detail": "Refresh the item before applying this action.",
  "current": { "task": {} },
  "resolutions": [{ "kind": "REFRESH" }]
}
```

The server never silently applies intent to a stale resource. Idempotency replay is checked first so a retry of a previously committed command returns its original committed result plus current representations rather than Stale write.

## Idempotency conflict

```json
{
  "type": "urn:journey-tracker:problem:idempotency-key-reused",
  "title": "That action key was already used",
  "status": 409,
  "code": "IDEMPOTENCY_KEY_REUSED",
  "detail": "Use a new action key for a different request."
}
```

The response never reveals the earlier request body.

## Error codes

| HTTP | Code | Meaning / UI behavior |
|---:|---|---|
| 400 | `MALFORMED_REQUEST` | JSON/query cannot be parsed |
| 404 | `RESOURCE_NOT_FOUND` | Missing or outside current ownership |
| 409 | `ACTIVE_SESSION_CONFLICT` | Offer Pause and switch or Cancel |
| 409 | `INVALID_TASK_TRANSITION` | Refresh and show current allowed actions |
| 409 | `OPEN_CONTINUATION_CONFLICT` | Link to existing continuation |
| 409 | `SESSION_OVERLAP` | Explain conflicting interval |
| 409 | `DECISION_IMMUTABLE` | Accepted reasoning cannot be edited |
| 409 | `IDEMPOTENCY_KEY_REUSED` | Generate a new key for new intent |
| 409 | `PLAN_REVISION_CHANGED` | Re-run preview |
| 409 | `ACKNOWLEDGEMENT_REQUIRED` | Present required preservation acknowledgement |
| 409 | `QUARTER_DATE_OVERLAP` | Explain the existing Quarter range |
| 410 | `PLAN_PREVIEW_EXPIRED` | Re-run preview |
| 412 | `STALE_WRITE` | Refresh resource |
| 422 | `VALIDATION_FAILED` | Show field/document errors |
| 428 | `PRECONDITION_REQUIRED` | Client programming/precondition issue |
| 500 | `INTERNAL_ERROR` | Unexpected failure; no internals leaked |
| 503 | `STORE_BUSY` | Retry later; may include `Retry-After` |
| 503 | `RECOVERY_REQUIRED` | Stop normal startup/writes and follow explicit recovery guidance |
| 503 | `STORE_CORRUPT` | Stop mutations and guide to recovery |
| 503 | `STORE_SCHEMA_UNSUPPORTED` | App cannot safely read this data version |
| 503 | `STORE_WRITE_FAILED` | Prior state remains authoritative |
| 503 | `STORE_DURABILITY_UNCERTAIN` | Retry same idempotency key; do not issue new intent |

## Conflict payload rules

- Include only the smallest current state needed to resolve the conflict.
- Return machine-readable resolutions with explicit kinds.
- Never ask the client to recreate transition rules.
- Never include filesystem paths, raw JSON contents, stack traces, secrets, or other users’ records.
- Ownership mismatch uses 404 so resource existence is not disclosed.

## Storage failure behavior

- Before atomic replace: prior primary file remains authoritative; return `STORE_WRITE_FAILED`.
- Replace may have succeeded but final durability/response failed: return `STORE_DURABILITY_UNCERTAIN`; client retries with the identical Idempotency-Key.
- Corruption/schema failure: fail closed, serve no guessed/repaired data, and perform no writes.
- Missing/ambiguous initialized-store artifacts: return `RECOVERY_REQUIRED`; never seed over an existing or previously initialized directory.
- API process startup may fail entirely for unrecoverable store validation. If it remains available for a recovery screen, all normal mutations return the corresponding 503 problem.

## Logging

Log `traceId`, code, route, status, and safe record IDs. Do not log reflection text, plan source content, raw AI output, or full request/response bodies by default.

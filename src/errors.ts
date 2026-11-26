/** Every error this SDK throws extends `FusionError`. */
export class FusionError extends Error {
  override name = "FusionError";
}

/** The SDK was given something it cannot use: a wrong key, a bad option or a malformed id. */
export class FusionConfigError extends FusionError {
  override name = "FusionConfigError";
}

/** No response came back: a network failure, DNS, or the request timed out. */
export class FusionConnectionError extends FusionError {
  override name = "FusionConnectionError";
}

export interface FusionApiErrorFields {
  statusCode: number;
  code: string;
  message: string;
  details?: unknown;
  hint?: string;
  docUrl?: string;
  requestId?: string;
}

/**
 * The API answered with an error. Every field of the API's error body is kept as sent: `code`
 * is the one to branch on, `hint` says what to do, `requestId` is what support asks for.
 */
export class FusionApiError extends FusionError {
  override name = "FusionApiError";
  readonly statusCode: number;
  readonly code: string;
  readonly details: unknown;
  readonly hint: string | undefined;
  readonly docUrl: string | undefined;
  readonly requestId: string | undefined;

  constructor(fields: FusionApiErrorFields) {
    super(fields.message);
    this.statusCode = fields.statusCode;
    this.code = fields.code;
    this.details = fields.details;
    this.hint = fields.hint;
    this.docUrl = fields.docUrl;
    this.requestId = fields.requestId;
  }
}

/** 401: the key is wrong, revoked, or not a secret key. */
export class FusionAuthenticationError extends FusionApiError {
  override name = "FusionAuthenticationError";
}

/** 400, 404, 413 or 422: the request broke a rule. `details` names the field. */
export class FusionInvalidRequestError extends FusionApiError {
  override name = "FusionInvalidRequestError";
}

/** 409: a `merchantReference` already used, or the first request with this `Idempotency-Key` still running. */
export class FusionConflictError extends FusionApiError {
  override name = "FusionConflictError";
}

/** 429: too many requests. `retryAfter` is in seconds, when the API said. */
export class FusionRateLimitError extends FusionApiError {
  override name = "FusionRateLimitError";
  readonly retryAfter: number | undefined;

  constructor(fields: FusionApiErrorFields & { retryAfter?: number | undefined }) {
    super(fields);
    this.retryAfter = fields.retryAfter;
  }
}

/** The error class for a status, so callers can `instanceof` instead of reading numbers. */
export function apiErrorFor(
  fields: FusionApiErrorFields & { retryAfter?: number | undefined },
): FusionApiError {
  switch (fields.statusCode) {
    case 401:
      return new FusionAuthenticationError(fields);
    case 400:
    case 404:
    case 413:
    case 422:
      return new FusionInvalidRequestError(fields);
    case 409:
      return new FusionConflictError(fields);
    case 429:
      return new FusionRateLimitError(fields);
    default:
      return new FusionApiError(fields);
  }
}

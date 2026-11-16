import { apiErrorFor, FusionApiError, FusionConfigError, FusionConnectionError } from "./errors.js";
import { VERSION } from "./version.js";

export interface TransportOptions {
  secretKey: string;
  baseUrl: string;
  timeout: number;
  maxRetries: number;
  fetch: typeof fetch;
  /** Waits between retries. Tests pass one that does not really wait. */
  sleep?: (ms: number) => Promise<void>;
}

export interface Request {
  method: "GET" | "POST";
  /** Already encoded, starting with `/v1/`. */
  path: string;
  query?: Record<string, string | number | undefined> | undefined;
  body?: unknown;
  /** Sent on every attempt of this call, so a retry can never create a second payment. */
  idempotencyKey?: string | undefined;
}

export type Transport = <T>(request: Request) => Promise<T>;

/**
 * An id for a URL path. Fusion ids are letters, digits and `_` (`pay_test_…`, `evt_…`); anything
 * else is refused, because `.` or `..` would turn the URL into another route even when encoded.
 */
export function idPath(id: unknown): string {
  if (typeof id !== "string" || !/^[A-Za-z0-9_]{1,64}$/.test(id)) {
    throw new FusionConfigError("Not a Fusion id: expected something like pay_test_… or evt_…");
  }
  return id;
}

/** `Retry-After` is honoured up to a minute; a server cannot park a merchant longer. */
const MAX_RETRY_AFTER_MS = 60_000;
const BASE_BACKOFF_MS = 500;
const MAX_BACKOFF_MS = 8_000;

const realSleep = (ms: number) => new Promise<void>((resolve) => setTimeout(resolve, ms));

/**
 * The one place a request is made. The secret key lives only in this closure — never on an
 * object a merchant can print or serialise — and only ever goes into the Authorization header.
 */
export function createTransport(options: TransportOptions): Transport {
  const { secretKey, baseUrl, timeout, maxRetries, sleep = realSleep } = options;
  const doFetch = options.fetch;

  return async function request<T>(req: Request): Promise<T> {
    const url = new URL(baseUrl + req.path);
    for (const [name, value] of Object.entries(req.query ?? {})) {
      if (value !== undefined) url.searchParams.set(name, String(value));
    }
    const headers: Record<string, string> = {
      Authorization: `Bearer ${secretKey}`,
      Accept: "application/json",
      "User-Agent": `fusion-node/${VERSION}`,
    };
    if (req.body !== undefined) headers["Content-Type"] = "application/json";
    if (req.idempotencyKey !== undefined) headers["Idempotency-Key"] = req.idempotencyKey;
    const body = req.body === undefined ? undefined : JSON.stringify(req.body);

    for (let attempt = 0; ; attempt++) {
      let result: { data: T } | { error: RequestError; retryAfterMs?: number | undefined };
      try {
        result = await send<T>(doFetch, url, { method: req.method, headers, body }, timeout);
      } catch (error) {
        if (!(error instanceof FusionConnectionError)) throw error;
        result = { error };
      }
      if ("data" in result) return result.data;
      if (attempt >= maxRetries || !isRetryable(result.error)) throw result.error;
      await sleep(result.retryAfterMs ?? backoff(attempt));
    }
  };
}

type RequestError = FusionApiError | FusionConnectionError;

async function send<T>(
  doFetch: typeof fetch,
  url: URL,
  init: { method: string; headers: Record<string, string>; body: string | undefined },
  timeout: number,
): Promise<{ data: T } | { error: FusionApiError; retryAfterMs?: number | undefined }> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeout);
  try {
    // "manual": the API never redirects, and a redirect must not carry the key anywhere else.
    const response = await doFetch(url, {
      method: init.method,
      headers: init.headers,
      body: init.body ?? null,
      redirect: "manual",
      signal: controller.signal,
    });
    const text = await response.text();
    return parse<T>(response, text);
  } catch (error) {
    if (error instanceof FusionApiError) throw error;
    // Never pass the underlying error as `cause`: some fetch implementations attach the request
    // (and so the Authorization header) to it.
    const reason = controller.signal.aborted
      ? `timed out after ${timeout} ms`
      : error instanceof Error
        ? error.message
        : "network error";
    throw new FusionConnectionError(`Could not reach the Fusion API: ${reason}`);
  } finally {
    clearTimeout(timer);
  }
}

function parse<T>(
  response: Response,
  text: string,
): { data: T } | { error: FusionApiError; retryAfterMs?: number | undefined } {
  const requestId = response.headers.get("x-request-id") ?? undefined;
  const json = parseJson(text);

  if (response.ok) {
    if (isObject(json) && "data" in json) return { data: json.data as T };
    return {
      error: new FusionApiError({
        statusCode: response.status,
        code: "unexpected_response",
        message: `The Fusion API answered ${response.status} without a body this SDK understands`,
        ...(requestId === undefined ? {} : { requestId }),
      }),
    };
  }

  const retryAfter = parseRetryAfter(response.headers.get("retry-after"));
  const envelope = isObject(json) && isObject(json.error) ? json.error : undefined;
  const fields = {
    statusCode: response.status,
    code: stringOr(envelope?.code, "unexpected_response"),
    message: stringOr(
      envelope?.message,
      `The Fusion API answered ${response.status} without an error body`,
    ),
    ...(envelope !== undefined && "details" in envelope ? { details: envelope.details } : {}),
    ...optionalString("hint", envelope?.hint),
    ...optionalString("docUrl", envelope?.docUrl),
    ...(requestId === undefined ? {} : { requestId }),
    retryAfter,
  };
  return {
    error: apiErrorFor(fields),
    retryAfterMs:
      retryAfter === undefined ? undefined : Math.min(retryAfter * 1000, MAX_RETRY_AFTER_MS),
  };
}

/** Network failures, timeouts, 429, 5xx, and a create still running under the same key. */
function isRetryable(error: RequestError): boolean {
  if (error instanceof FusionConnectionError) return true;
  return (
    error.statusCode === 429 ||
    error.statusCode >= 500 ||
    (error.statusCode === 409 && error.code === "idempotency_in_progress")
  );
}

/** 0.5 s, 1 s, 2 s … up to 8 s, each with jitter so many clients don't retry in step. */
function backoff(attempt: number): number {
  const ceiling = Math.min(BASE_BACKOFF_MS * 2 ** attempt, MAX_BACKOFF_MS);
  return ceiling / 2 + Math.random() * (ceiling / 2);
}

/** Seconds, as the API sends it. Anything else (a date, garbage) is ignored. */
function parseRetryAfter(value: string | null): number | undefined {
  if (value === null || !/^\d{1,6}$/.test(value.trim())) return undefined;
  return Number(value.trim());
}

function parseJson(text: string): unknown {
  try {
    return JSON.parse(text);
  } catch {
    return undefined;
  }
}

function isObject(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function stringOr(value: unknown, fallback: string): string {
  return typeof value === "string" ? value : fallback;
}

function optionalString<K extends string>(key: K, value: unknown): { [P in K]?: string } {
  return typeof value === "string" ? ({ [key]: value } as { [P in K]: string }) : {};
}

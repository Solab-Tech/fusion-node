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

type RequestError = FusionApiError | FusionConnectionError;
/** One attempt's outcome. Errors come back, never out: the loop decides whether to retry. */
type Outcome<T> = { data: T } | { error: RequestError; retryAfterMs?: number | undefined };

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
    const body = req.body === undefined ? undefined : toJson(req.body);

    const attempt = async (): Promise<Outcome<T>> => {
      const controller = new AbortController();
      let timer: ReturnType<typeof setTimeout> | undefined;
      // Raced against the fetch, so a `fetch` that ignores `signal` still ends at the timeout.
      const timedOut = new Promise<never>((_, reject) => {
        timer = setTimeout(() => {
          controller.abort();
          reject(new Error("timed out"));
        }, timeout);
      });
      try {
        const response = await Promise.race([
          doFetch(url, {
            method: req.method,
            headers,
            body: body ?? null,
            // "manual": the API never redirects, and a redirect must not carry the key elsewhere.
            redirect: "manual",
            signal: controller.signal,
          }),
          timedOut,
        ]);
        const text = await Promise.race([response.text(), timedOut]);
        return parse<T>(response, text);
      } catch (error) {
        // The reason is text, never the error itself as `cause`: some fetch implementations
        // attach the request, and so the Authorization header, to theirs. Their message may
        // quote the request too, so the key is cut out of it.
        const reason = controller.signal.aborted
          ? `timed out after ${timeout} ms`
          : error instanceof Error
            ? error.message.replaceAll(secretKey, "[secret key]")
            : "network error";
        return { error: new FusionConnectionError(`Could not reach the Fusion API: ${reason}`) };
      } finally {
        clearTimeout(timer);
      }
    };

    for (let tries = 0; ; tries++) {
      const outcome = await attempt();
      if ("data" in outcome) return outcome.data;
      if (tries >= maxRetries || !isRetryable(outcome.error)) throw outcome.error;
      await sleep(outcome.retryAfterMs ?? backoff(tries));
    }
  };
}

function toJson(body: unknown): string {
  try {
    return JSON.stringify(body);
  } catch {
    throw new FusionConfigError(
      "The request body is not JSON: a BigInt, or a value that contains itself?",
    );
  }
}

function parse<T>(response: Response, text: string): Outcome<T> {
  const requestId = str(response.headers.get("x-request-id"));
  const json = parseJson(text);

  if (response.ok) {
    if (isObject(json) && "data" in json) return { data: json.data as T };
    return {
      error: new FusionApiError({
        statusCode: response.status,
        code: "unexpected_response",
        message: `The Fusion API answered ${response.status} without a body this SDK understands`,
        requestId,
      }),
    };
  }

  const retryAfter = parseRetryAfter(response.headers.get("retry-after"));
  const envelope = isObject(json) && isObject(json.error) ? json.error : undefined;
  const error = apiErrorFor({
    statusCode: response.status,
    code: str(envelope?.code) ?? "unexpected_response",
    message:
      str(envelope?.message) ?? `The Fusion API answered ${response.status} without an error body`,
    details: envelope?.details,
    hint: str(envelope?.hint),
    docUrl: str(envelope?.docUrl),
    requestId,
    retryAfter,
  });
  return {
    error,
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
function backoff(tries: number): number {
  const ceiling = Math.min(BASE_BACKOFF_MS * 2 ** tries, MAX_BACKOFF_MS);
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

function str(value: unknown): string | undefined {
  return typeof value === "string" ? value : undefined;
}

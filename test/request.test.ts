import { inspect } from "node:util";
import { describe, expect, it } from "vitest";
import {
  FusionApiError,
  FusionAuthenticationError,
  FusionConfigError,
  FusionConflictError,
  FusionConnectionError,
  FusionInvalidRequestError,
  FusionRateLimitError,
  VERSION,
} from "../src/index.js";
import { createTransport, type Request } from "../src/request.js";
import { apiError, fakeFetch, json, ok, TEST_KEY } from "./helpers.js";

function transport(fetch: typeof globalThis.fetch, overrides = {}) {
  const waits: number[] = [];
  const request = createTransport({
    secretKey: TEST_KEY,
    baseUrl: "https://api.test",
    timeout: 1_000,
    maxRetries: 2,
    fetch,
    sleep: async (ms) => void waits.push(ms),
    ...overrides,
  });
  return { request, waits };
}

const get: Request = { method: "GET", path: "/v1/payments" };

describe("requests", () => {
  it("unwraps { data } and sends the SDK's headers", async () => {
    const { fetch, calls } = fakeFetch(ok({ id: "x" }));
    await expect(transport(fetch).request(get)).resolves.toEqual({ id: "x" });
    expect(calls[0]!.headers).toMatchObject({
      accept: "application/json",
      "user-agent": `fusion-node/${VERSION}`,
    });
    expect(calls[0]!.headers["content-type"]).toBeUndefined();
  });

  it("sends JSON bodies and skips undefined query values", async () => {
    const { fetch, calls } = fakeFetch(ok({}));
    await transport(fetch).request({
      method: "POST",
      path: "/v1/payments",
      query: { a: "1", b: undefined, c: 2 },
      body: { amountMinor: 500000 },
    });
    expect(calls[0]!.url.search).toBe("?a=1&c=2");
    expect(calls[0]!.headers["content-type"]).toBe("application/json");
    expect(calls[0]!.body).toEqual({ amountMinor: 500000 });
  });

  it("refuses a body JSON cannot carry, without a request", async () => {
    const { fetch, calls } = fakeFetch();
    const bigint = { method: "POST", path: "/v1/payments", body: { amountMinor: 10n } } as const;
    await expect(transport(fetch).request(bigint)).rejects.toBeInstanceOf(FusionConfigError);
    expect(calls).toHaveLength(0);
  });
});

describe("errors", () => {
  it.each([
    [401, "invalid_api_key", FusionAuthenticationError],
    [400, "invalid_request", FusionInvalidRequestError],
    [404, "payment_not_found", FusionInvalidRequestError],
    [422, "no_eligible_gateway", FusionInvalidRequestError],
    [409, "merchant_reference_taken", FusionConflictError],
    [403, "forbidden", FusionApiError],
  ])("%i %s → %s, not retried", async (status, code, Class) => {
    const { fetch, calls } = fakeFetch(apiError(status, code));
    const error = await transport(fetch)
      .request(get)
      .catch((e: unknown) => e);
    expect(error).toBeInstanceOf(Class);
    expect(error).toMatchObject({ statusCode: status, code });
    expect(calls).toHaveLength(1);
  });

  it("keeps every field of the API's error, and the request id", async () => {
    const { fetch } = fakeFetch(
      apiError(
        422,
        "no_eligible_gateway",
        { details: [{ gateway: "paystack" }], hint: "Turn one on", docUrl: "https://docs.test/e" },
        { "x-request-id": "req_123" },
      ),
    );
    const error = await transport(fetch)
      .request(get)
      .catch((e: unknown) => e);
    expect(error).toMatchObject({
      message: "no_eligible_gateway message",
      details: [{ gateway: "paystack" }],
      hint: "Turn one on",
      docUrl: "https://docs.test/e",
      requestId: "req_123",
    });
  });

  it("turns a non-JSON error (a proxy's HTML 502) into a FusionApiError", async () => {
    const html = () => new Response("<html>Bad gateway</html>", { status: 502 });
    const { fetch } = fakeFetch(html, html, html);
    const error = await transport(fetch)
      .request(get)
      .catch((e: unknown) => e);
    expect(error).toBeInstanceOf(FusionApiError);
    expect(error).toMatchObject({ statusCode: 502, code: "unexpected_response" });
  });

  it("turns a success without { data } into a FusionApiError", async () => {
    const { fetch } = fakeFetch(json(200, { id: "x" }));
    await expect(transport(fetch).request(get)).rejects.toMatchObject({
      code: "unexpected_response",
    });
  });

  it("does not follow a redirect", async () => {
    const { fetch } = fakeFetch(
      new Response(null, { status: 302, headers: { location: "https://elsewhere" } }),
    );
    await expect(transport(fetch).request(get)).rejects.toMatchObject({ statusCode: 302 });
  });

  it("never puts the key in an error, even one fetch wrote it into", async () => {
    const leaky = Object.assign(new TypeError(`fetch failed for Bearer ${TEST_KEY}`), {
      request: { headers: { authorization: `Bearer ${TEST_KEY}` } },
    });
    const { fetch } = fakeFetch(apiError(401, "invalid_api_key"), leaky);
    const { request } = transport(fetch, { maxRetries: 0 });
    for (const error of [
      await request(get).catch((e: unknown) => e),
      await request(get).catch((e: unknown) => e),
    ]) {
      expect((error as Error).message).not.toContain(TEST_KEY);
      expect(inspect(error, { depth: Infinity, showHidden: true })).not.toContain(TEST_KEY);
      expect(JSON.stringify(error)).not.toContain(TEST_KEY);
      expect((error as Error).cause).toBeUndefined();
    }
  });
});

describe("retries", () => {
  it("retries 5xx, then succeeds", async () => {
    const { fetch, calls } = fakeFetch(apiError(500, "internal_error"), ok({ id: "x" }));
    const { request, waits } = transport(fetch);
    await expect(request(get)).resolves.toEqual({ id: "x" });
    expect(calls).toHaveLength(2);
    expect(waits).toHaveLength(1);
    expect(waits[0]).toBeGreaterThanOrEqual(250);
    expect(waits[0]).toBeLessThanOrEqual(500);
  });

  it("waits Retry-After seconds on 429, capped at a minute", async () => {
    const limited = (seconds: string) =>
      apiError(429, "rate_limited", {}, { "retry-after": seconds });
    const { fetch } = fakeFetch(limited("3"), limited("99999"), limited("99999"));
    const { request, waits } = transport(fetch);
    const error = await request(get).catch((e: unknown) => e);
    expect(error).toBeInstanceOf(FusionRateLimitError);
    expect(error).toMatchObject({ retryAfter: 99999 });
    expect(waits).toEqual([3_000, 60_000]);
  });

  it("retries a create still running under the same Idempotency-Key", async () => {
    const { fetch, calls } = fakeFetch(apiError(409, "idempotency_in_progress"), ok({ id: "x" }));
    const { request } = transport(fetch);
    await request({ method: "POST", path: "/v1/payments", body: {}, idempotencyKey: "k1" });
    expect(calls.map((c) => c.headers["idempotency-key"])).toEqual(["k1", "k1"]);
  });

  it("stops after maxRetries", async () => {
    const fail = () => apiError(503, "unavailable");
    const { fetch, calls } = fakeFetch(fail, fail, fail, fail);
    await expect(transport(fetch).request(get)).rejects.toMatchObject({ statusCode: 503 });
    expect(calls).toHaveLength(3);
  });

  it("retries a network failure, then reports it as a FusionConnectionError", async () => {
    const { fetch, calls } = fakeFetch(
      new TypeError("fetch failed"),
      new TypeError("fetch failed"),
    );
    const error = await transport(fetch, { maxRetries: 1 })
      .request(get)
      .catch((e: unknown) => e);
    expect(error).toBeInstanceOf(FusionConnectionError);
    expect(calls).toHaveLength(2);
  });

  it.each([
    [
      "a fetch that honours the signal",
      (_input: RequestInfo | URL, init?: RequestInit) =>
        new Promise<Response>((_, reject) =>
          init?.signal?.addEventListener("abort", () =>
            reject(new DOMException("aborted", "AbortError")),
          ),
        ),
    ],
    ["a fetch that ignores it", () => new Promise<Response>(() => {})],
  ])("times out %s", async (_, hung) => {
    const error = await transport(hung as typeof globalThis.fetch, { timeout: 20, maxRetries: 0 })
      .request(get)
      .catch((e: unknown) => e);
    expect(error).toBeInstanceOf(FusionConnectionError);
    expect((error as Error).message).toContain("timed out after 20 ms");
  });
});

import { Fusion, type FusionOptions } from "../src/index.js";

/** Obviously fake, as CLAUDE.md requires: never a real key in this public repo. */
export const TEST_KEY = `fsk_test_${"0".repeat(40)}`;
export const LIVE_KEY = `fsk_live_${"0".repeat(40)}`;

export interface Call {
  url: URL;
  method: string;
  headers: Record<string, string>;
  body: unknown;
}

type Reply = Response | (() => Response | Promise<Response>) | Error;

/** A fetch that answers from a queue and records every call. */
export function fakeFetch(...replies: Reply[]) {
  const calls: Call[] = [];
  const fetch = async (input: RequestInfo | URL, init: RequestInit = {}): Promise<Response> => {
    calls.push({
      url: new URL(String(input)),
      method: init.method ?? "GET",
      headers: Object.fromEntries(new Headers(init.headers).entries()),
      body: typeof init.body === "string" ? JSON.parse(init.body) : undefined,
    });
    const reply = replies.shift();
    if (reply === undefined) throw new Error("fakeFetch: no reply queued");
    if (reply instanceof Error) throw reply;
    return typeof reply === "function" ? reply() : reply;
  };
  return { fetch: fetch as typeof globalThis.fetch, calls };
}

export function json(status: number, body: unknown, headers: Record<string, string> = {}) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "content-type": "application/json", ...headers },
  });
}

export const ok = (data: unknown, status = 200) => json(status, { data });

export const apiError = (status: number, code: string, extra: Record<string, unknown> = {}) =>
  json(status, { error: { code, message: `${code} message`, statusCode: status, ...extra } });

/** A client whose retries do not really wait. */
export function client(fetch: typeof globalThis.fetch, options: FusionOptions = {}) {
  return new Fusion(TEST_KEY, { fetch, baseUrl: "https://api.test", ...options });
}

export const payment = (id = "pay_test_aaaaaaaaaaaaaaaaaaaaaaaa", extra = {}) => ({
  id,
  object: "payment",
  mode: "sandbox",
  status: "requires_payment",
  amountMinor: 500000,
  currency: "NGN",
  url: "https://checkout.example/c/cs_test_x",
  ...extra,
});

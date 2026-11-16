# Plan — `@usefusion/node`, the Fusion Node SDK

Status and progress: [`tasks.md`](./tasks.md). Conventions: [`../CLAUDE.md`](../CLAUDE.md).

## Goal

A merchant's server can take a payment through Fusion in a few lines, with types for every
request and response, errors that say what to do, and safe retries — on any modern JavaScript
server runtime.

```ts
import Fusion from "@usefusion/node";

const fusion = new Fusion(process.env.FUSION_SECRET_KEY!); // fsk_test_… or fsk_live_…

const payment = await fusion.payments.create({
  amountMinor: 500000, // ₦5,000.00, in kobo
  currency: "NGN",
  redirectUrl: "https://shop.example/checkout/return",
  merchantReference: "order_1042",
});
// send the customer to payment.url

// when they come back to redirectUrl — the return itself proves nothing:
const checked = await fusion.payments.verify(payment.id);

await fusion.payments.retrieve(payment.id);
for await (const p of fusion.payments.list({ status: "succeeded" })) {
  /* every page, fetched as needed */
}
await fusion.events.list({ paymentId: payment.id });
```

## What the SDK covers

The merchant API, `https://api.usefusion.com/v1`, as described by `spec/checkout-openapi.json`:

| SDK call                   | API                           | Notes                                                       |
| -------------------------- | ----------------------------- | ----------------------------------------------------------- |
| `payments.create(body, o)` | `POST /v1/payments`           | returns the hosted page `url`; `Idempotency-Key` always sent |
| `payments.retrieve(id)`    | `GET /v1/payments/{id}`       |                                                             |
| `payments.verify(id)`      | `POST /v1/payments/{id}/verify` | asks the gateway (throttled by the API to once per 10 s)  |
| `payments.list(query)`     | `GET /v1/payments`            | filters `status`, `merchantReference`; cursor paging        |
| `events.retrieve(id)`      | `GET /v1/events/{id}`         |                                                             |
| `events.list(query)`       | `GET /v1/events`              | filters `type`, `paymentId`; cursor paging                  |
| `webhooks.verify(…)`       | — (no request)                | **C6d, after 0.1.0**: checks a webhook Fusion sent          |

**Not covered, on purpose:**

- **Browser use.** This is a server SDK: it holds the secret key. Publishable keys (`fpk_…`)
  exist in the key format but are not issued, and no API takes one yet.
- **Webhook endpoint setup.** Merchants register their webhook URL and read their signing secret
  in the Fusion dashboard, as with Paystack and Flutterwave. There is no API for it.
- **Refunds, payouts, disputes.** Not in the merchant API yet. They arrive here when the API has
  them, by updating the spec.

## Design

### Client

`new Fusion(secretKey, options?)`

| Option       | Default                     | Why                                                        |
| ------------ | --------------------------- | ---------------------------------------------------------- |
| `baseUrl`    | `https://api.usefusion.com` | local development and tests                                |
| `timeout`    | 30 000 ms                   | per attempt; a hung connection must not hang the merchant |
| `maxRetries` | 2                           | retries after the first attempt                            |
| `fetch`      | the global `fetch`          | runtimes or tests that bring their own                     |

- The key must match `fsk_(test|live)_…`. A `fpk_…` or `whsec_…` key, an empty value or a
  non-string throws `FusionConfigError` immediately, saying which key to use. The client exposes
  `mode` (`"test"` or `"live"`), read from the prefix.
- The key is held privately and never appears in `toString`, `toJSON`, `util.inspect`, an error or
  a URL.
- Every request sends `User-Agent: fusion-node/<version>` (where the runtime allows it) and
  `Accept: application/json`.

### Errors

All errors extend `FusionError`. The API's envelope
`{ error: { code, message, statusCode, details?, hint?, docUrl? } }` becomes a `FusionApiError`
subclass that keeps every field, plus `requestId` from the `x-request-id` response header (the
API sets it on every response), so a merchant can quote it to support:

| Class                       | When                                                                  |
| --------------------------- | --------------------------------------------------------------------- |
| `FusionAuthenticationError` | 401 (`invalid_api_key`, `publishable_key_not_allowed`)                |
| `FusionInvalidRequestError` | 400, 404, 413, 422 (`invalid_request`, `payment_not_found`, …)        |
| `FusionConflictError`       | 409 (`merchant_reference_taken`, `idempotency_key_reused`, …)         |
| `FusionRateLimitError`      | 429, with `retryAfter` in seconds                                     |
| `FusionApiError`            | any other status, including 5xx                                       |
| `FusionConnectionError`     | no response: network failure, DNS, timeout, abort                     |
| `FusionConfigError`         | bad constructor input                                                 |
| `FusionSignatureError`      | **C6d**: a webhook that fails verification, with `reason`             |

A response that is not the envelope (a proxy's HTML 502) is still a `FusionApiError` with the
status and a plain message, never a JSON `SyntaxError`.

### Retries

- Retried: no response (network error, timeout), 429, 409 `idempotency_in_progress`, and 5xx.
- Not retried: any other 4xx.
- Wait: `Retry-After` when the API sends it (capped at 60 s), otherwise exponential backoff with
  jitter starting at 0.5 s.
- `payments.create` sends the **same** `Idempotency-Key` on every retry, so a retry can never make
  a second payment. The key is generated with `crypto.randomUUID()` unless the caller passes
  `{ idempotencyKey }`.
- `payments.verify` is safe to retry: the API throttles it and it only reads the gateway's answer.

### Paging

`list()` returns a page object (`items`, `nextCursor`) that is also async-iterable over every item
of every page, fetching the next page only when the loop reaches it. Breaking out of the loop
stops fetching.

### Types

Generated with `openapi-typescript` from `spec/checkout-openapi.json` into `src/generated/`, never
edited by hand. The public names (`Payment`, `PaymentCreateParams`, `Event`, `PaymentStatus`, …)
are aliases of the generated types, so the spec stays the only source.

### Packaging

- Zero runtime dependencies. ESM + CommonJS + `.d.ts`, through `exports` in `package.json`.
- `files: ["dist"]`. Node 20+ in `engines`.
- No `node:` imports in `src/`: only `fetch`, `AbortController`, `crypto.randomUUID`,
  `crypto.subtle`, `TextEncoder` — globals every target runtime has.

### `webhooks.verify()` — C6d, after 0.1.0

```ts
const event = await fusion.webhooks.verify(rawBody, req.header("Fusion-Signature"), secret);
```

- Header: `Fusion-Signature: t=<unix seconds>,v1=<hex HMAC-SHA256(secret, "<t>.<raw body>")>`,
  with one `v1` per secret during a signing-secret rotation. `secret` may be one string or
  `[old, new]`.
- Async, because Web Crypto is. Rejects a timestamp more than 300 s from the clock (configurable),
  compares in constant time, verifies the **raw** body before parsing, and throws
  `FusionSignatureError` with `reason`: `malformed`, `timestamp` or `mismatch`.
- Tested against signature cases generated from Fusion's own signer (with fake secrets), so the
  SDK and the API can never disagree.

## Decisions

| Id  | Decision                                                                                                                                                               |
| --- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| P1  | Public repo `Solab-Tech/fusion-node`. It moves to a public Fusion GitHub org later; nothing here may assume the org's name.                                             |
| P2  | Package `@usefusion/node` on **public npm** (the `usefusion` npm org), published by trusted publishing with provenance from GitHub Actions.                            |
| P3  | Zero runtime dependencies; `fetch` + Web Crypto; Node 20+, Bun, Deno, edge runtimes.                                                                                    |
| P4  | Types from the merchant API spec, copied in by hand for now (`spec/checkout-openapi.json`). An automated sync is C6e.                                                   |
| P5  | `webhooks.verify()` ships after 0.1.0 (C6d) and is async.                                                                                                              |
| P6  | MIT license.                                                                                                                                                           |
| P7  | Server-only. No browser bundle, no publishable key support until an API takes one.                                                                                      |
| P8  | No webhook-endpoint management: the dashboard does it.                                                                                                                  |

## Open questions

- **Q1** — Default `timeout` (30 s) and `maxRetries` (2): confirm before 0.1.0.

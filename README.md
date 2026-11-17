# @usefusion/node

The official Node SDK for the [Fusion](https://usefusion.com) Checkout API: take payments through
the gateways you already use (Paystack, Flutterwave, Interswitch, Moniepoint) with one API.

- Typed requests and responses, generated from the API's own spec
- Safe retries: every payment create carries an `Idempotency-Key`
- Errors that say what to do (`code`, `hint`, `docUrl`, `requestId`)
- Zero dependencies. Node 20+, Bun, Deno, Cloudflare Workers, Vercel Edge. ESM and CommonJS

> **Pre-release.** Version 0.x: the API may change between minor versions.

## Install

```sh
npm install @usefusion/node
```

## Quickstart

```ts
import Fusion from "@usefusion/node";

const fusion = new Fusion(process.env.FUSION_SECRET_KEY!); // fsk_test_… or fsk_live_…

// 1. Create a payment, then send the customer to its hosted checkout page.
const payment = await fusion.payments.create({
  amountMinor: 500000, // ₦5,000.00, in kobo
  currency: "NGN",
  redirectUrl: "https://shop.example/checkout/return",
  merchantReference: "order_1042",
  customerEmail: "ada@example.com",
});
redirect(payment.url);

// 2. When the customer comes back to redirectUrl (with ?payment_id=…), check the payment.
//    The return itself proves nothing.
const checked = await fusion.payments.verify(paymentId);
if (checked.status === "succeeded") fulfil(checked.merchantReference);
```

CommonJS:

```js
const { Fusion } = require("@usefusion/node");
```

## Test and live

The key decides, on the same API: a test key (`fsk_test_…`) makes sandbox payments, a live key
(`fsk_live_…`) live ones. `fusion.mode` says which (`"sandbox"` or `"live"`). Keep the secret key
on your server; a publishable key (`fpk_…`) or a webhook secret (`whsec_…`) is refused.

## Money

Amounts are **integer minor units** of the currency, exactly as the API takes them: `500000` NGN
is ₦5,000.00. The SDK never converts an amount.

## Payments

```ts
// Your own key (an order id) also covers your own retries, even after a restart.
await fusion.payments.create(params, { idempotencyKey: "order_1042" });
await fusion.payments.retrieve("pay_test_…");
await fusion.payments.verify("pay_test_…");

const page = await fusion.payments.list({ status: "succeeded", limit: 50 });
page.items; // newest first
await page.nextPage(); // or null on the last page

for await (const payment of fusion.payments.list({ status: "succeeded" })) {
  // every payment, page by page; `break` stops fetching
}
```

## Events

What each webhook delivered, to catch up on deliveries your endpoint missed. Order by
`data.object.version`: delivery order is not guaranteed.

```ts
await fusion.events.retrieve("evt_…");
for await (const event of fusion.events.list({ paymentId: "pay_test_…" })) {
  console.log(event.type);
}
```

Verifying incoming webhooks (`fusion.webhooks.verify()`) is coming in 0.2.0.

## Errors

Every error extends `FusionError`. Errors from the API keep the API's own fields:

```ts
import { FusionApiError, FusionInvalidRequestError } from "@usefusion/node";

try {
  await fusion.payments.create(params);
} catch (error) {
  if (error instanceof FusionInvalidRequestError) {
    console.log(error.code, error.hint, error.details); // e.g. no_eligible_gateway
  } else if (error instanceof FusionApiError) {
    console.log(error.statusCode, error.requestId); // quote requestId to support
  }
  throw error;
}
```

| Class                       | When                                                         |
| --------------------------- | ------------------------------------------------------------ |
| `FusionAuthenticationError` | 401: wrong, revoked or non-secret key                        |
| `FusionInvalidRequestError` | 400, 404, 413, 422: a field broke a rule; `details` names it |
| `FusionConflictError`       | 409: `merchantReference` taken, `Idempotency-Key` reused     |
| `FusionRateLimitError`      | 429: `retryAfter` seconds                                    |
| `FusionApiError`            | any other API error, including 5xx                           |
| `FusionConnectionError`     | no response: network failure or timeout                      |
| `FusionConfigError`         | a bad key or option passed to `new Fusion()`                 |

## Retries and timeouts

Network errors, timeouts, 429 and 5xx are retried (twice by default), waiting `Retry-After` when
the API sends it and backing off otherwise. A retried create reuses its `Idempotency-Key`, so it
can never make a second payment.

```ts
new Fusion(key, {
  timeout: 30_000, // ms per attempt
  maxRetries: 2,
  baseUrl: "https://api.usefusion.com",
  fetch, // bring your own
});
```

## License

[MIT](LICENSE)

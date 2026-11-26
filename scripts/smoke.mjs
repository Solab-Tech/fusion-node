// Loads the built ESM package and makes one request with a fake fetch. Runs on Node, Bun and
// Deno in CI, so a build that only works on one runtime fails there.
import Fusion, { Fusion as Named, FusionApiError, VERSION } from "../dist/index.js";

if (Fusion !== Named) throw new Error("default and named exports differ");

const calls = [];
const fusion = new Fusion(`fsk_test_${"0".repeat(40)}`, {
  fetch: async (url, init) => {
    calls.push({ url: String(url), init });
    return new Response(JSON.stringify({ data: { id: "pay_test_x" } }), { status: 201 });
  },
});
const payment = await fusion.payments.create({
  amountMinor: 500000,
  currency: "NGN",
  redirectUrl: "https://shop.example/return",
});

if (payment.id !== "pay_test_x") throw new Error("unexpected payment");
if (calls[0].url !== "https://api.usefusion.com/v1/payments") throw new Error(calls[0].url);
if (!(new FusionApiError({ statusCode: 500, code: "x", message: "m" }) instanceof Error)) {
  throw new Error("errors do not extend Error");
}
console.log(`esm ok: @usefusion/node ${VERSION}`);

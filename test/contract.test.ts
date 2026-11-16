// Runs against a real Fusion API with a sandbox key, only when both are given:
//   FUSION_CONTRACT_BASE_URL=… FUSION_CONTRACT_KEY=fsk_test_… pnpm test
// A maintainer runs it against a local stack; CI has neither, so it is skipped there.
import { describe, expect, it } from "vitest";
import { Fusion, FusionInvalidRequestError } from "../src/index.js";

const baseUrl = process.env.FUSION_CONTRACT_BASE_URL;
const key = process.env.FUSION_CONTRACT_KEY;

// A function, not a constant: describe bodies run even when the suite is skipped.
const fusion = () => new Fusion(key!, { baseUrl: baseUrl! });

describe.skipIf(!baseUrl || !key)("contract: a real API", () => {
  it("creates, retrieves, verifies and lists a sandbox payment", async () => {
    const api = fusion();
    expect(api.mode).toBe("sandbox");
    const merchantReference = `sdk_contract_${Date.now()}`;
    const created = await api.payments.create({
      amountMinor: 500000,
      currency: "NGN",
      redirectUrl: "https://shop.example/checkout/return",
      merchantReference,
      metadata: { source: "fusion-node contract test" },
    });
    expect(created).toMatchObject({ object: "payment", mode: "sandbox", amountMinor: 500000 });
    expect(created.url).toMatch(/^https?:\/\//);

    expect((await api.payments.retrieve(created.id)).id).toBe(created.id);
    expect((await api.payments.verify(created.id)).id).toBe(created.id);

    const page = await api.payments.list({ merchantReference });
    expect(page.items.map((p) => p.id)).toEqual([created.id]);

    const events = await api.events.list({ paymentId: created.id });
    expect(events.items.some((e) => e.type === "payment.created")).toBe(true);
  });

  it("replays a create under the same Idempotency-Key", async () => {
    const api = fusion();
    const body = { amountMinor: 1000, currency: "NGN", redirectUrl: "https://shop.example/r" };
    const idempotencyKey = `sdk_contract_${Date.now()}`;
    const first = await api.payments.create(body, { idempotencyKey });
    const again = await api.payments.create(body, { idempotencyKey });
    expect(again.id).toBe(first.id);
  });

  it("answers an unknown payment with a typed error", async () => {
    await expect(fusion().payments.retrieve(`pay_test_${"0".repeat(24)}`)).rejects.toBeInstanceOf(
      FusionInvalidRequestError,
    );
  });
});

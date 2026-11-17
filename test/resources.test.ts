import { describe, expect, it } from "vitest";
import { FusionApiError, FusionConfigError, Page } from "../src/index.js";
import { client, fakeFetch, ok, payment } from "./helpers.js";

describe("payments", () => {
  it("create sends the body unchanged with a generated Idempotency-Key", async () => {
    const { fetch, calls } = fakeFetch(ok(payment(), 201));
    const body = {
      amountMinor: 500000,
      currency: "NGN",
      redirectUrl: "https://shop.example/return",
      metadata: { orderId: "1042" },
    };
    const created = await client(fetch).payments.create(body);
    expect(created.id).toBe("pay_test_aaaaaaaaaaaaaaaaaaaaaaaa");
    expect(calls[0]).toMatchObject({ method: "POST", body });
    expect(calls[0]!.url.pathname).toBe("/v1/payments");
    expect(calls[0]!.headers["idempotency-key"]).toMatch(/^[0-9a-f-]{36}$/);
  });

  it("create uses the caller's own Idempotency-Key", async () => {
    const { fetch, calls } = fakeFetch(ok(payment(), 201));
    await client(fetch).payments.create(
      { amountMinor: 1, currency: "NGN", redirectUrl: "https://shop.example/return" },
      { idempotencyKey: "order_1042" },
    );
    expect(calls[0]!.headers["idempotency-key"]).toBe("order_1042");
  });

  it("each create gets its own generated key", async () => {
    const { fetch, calls } = fakeFetch(ok(payment(), 201), ok(payment(), 201));
    const fusion = client(fetch);
    const body = { amountMinor: 1, currency: "NGN", redirectUrl: "https://shop.example/return" };
    await fusion.payments.create(body);
    await fusion.payments.create(body);
    expect(calls[0]!.headers["idempotency-key"]).not.toBe(calls[1]!.headers["idempotency-key"]);
  });

  it("retrieve and verify call the payment's own routes", async () => {
    const { fetch, calls } = fakeFetch(ok(payment()), ok(payment()));
    const fusion = client(fetch);
    await fusion.payments.retrieve("pay_test_1");
    await fusion.payments.verify("pay_test_1");
    expect(calls[0]!.url.pathname).toBe("/v1/payments/pay_test_1");
    expect(calls[1]).toMatchObject({ method: "POST" });
    expect(calls[1]!.url.pathname).toBe("/v1/payments/pay_test_1/verify");
  });

  it.each([".", "..", "../events/evt_1", "", "pay test", "%2e%2e"])(
    "refuses the id %j without a request, so it cannot reach another route",
    async (id) => {
      const { fetch, calls } = fakeFetch();
      const fusion = client(fetch);
      await expect(fusion.payments.retrieve(id)).rejects.toBeInstanceOf(FusionConfigError);
      await expect(fusion.payments.verify(id)).rejects.toBeInstanceOf(FusionConfigError);
      await expect(fusion.events.retrieve(id)).rejects.toBeInstanceOf(FusionConfigError);
      expect(calls).toHaveLength(0);
    },
  );

  it.each(["", "has space", "line\nbreak", "naïve", "x".repeat(256)])(
    "refuses the idempotencyKey %j without a request",
    async (idempotencyKey) => {
      const { fetch, calls } = fakeFetch();
      const body = { amountMinor: 1, currency: "NGN", redirectUrl: "https://shop.example/r" };
      await expect(client(fetch).payments.create(body, { idempotencyKey })).rejects.toBeInstanceOf(
        FusionConfigError,
      );
      expect(calls).toHaveLength(0);
    },
  );

  it.each([
    ["a missing cursor", { items: [] }],
    ["items that are not a list", { items: "nope", nextCursor: null }],
  ])("refuses a page with %s", async (_, body) => {
    const { fetch } = fakeFetch(ok(body));
    await expect(client(fetch).payments.list()).rejects.toBeInstanceOf(FusionApiError);
  });

  it("stops a list whose cursor repeats instead of looping forever", async () => {
    const same = () => ok({ items: [payment("p1")], nextCursor: "c1" });
    const { fetch, calls } = fakeFetch(same, same, same);
    const walk = async () => {
      for await (const _ of client(fetch).payments.list());
    };
    await expect(walk()).rejects.toMatchObject({ code: "unexpected_response" });
    expect(calls).toHaveLength(2);
  });

  it("list returns the first page with its filters", async () => {
    const { fetch, calls } = fakeFetch(ok({ items: [payment()], nextCursor: null }));
    const page = await client(fetch).payments.list({ status: "succeeded", limit: 50 });
    expect(page).toBeInstanceOf(Page);
    expect(page.items).toHaveLength(1);
    expect(await page.nextPage()).toBeNull();
    expect(Object.fromEntries(calls[0]!.url.searchParams)).toEqual({
      status: "succeeded",
      limit: "50",
    });
  });

  it("for await walks every page, passing the cursor and keeping the filters", async () => {
    const { fetch, calls } = fakeFetch(
      ok({ items: [payment("p1"), payment("p2")], nextCursor: "c2" }),
      ok({ items: [payment("p3")], nextCursor: null }),
    );
    const ids: string[] = [];
    for await (const p of client(fetch).payments.list({ status: "succeeded" })) ids.push(p.id);
    expect(ids).toEqual(["p1", "p2", "p3"]);
    expect(Object.fromEntries(calls[1]!.url.searchParams)).toEqual({
      status: "succeeded",
      cursor: "c2",
    });
  });

  it("break stops fetching", async () => {
    const { fetch, calls } = fakeFetch(
      ok({ items: [payment("p1"), payment("p2")], nextCursor: "c2" }),
    );
    for await (const p of client(fetch).payments.list()) if (p.id === "p1") break;
    expect(calls).toHaveLength(1);
  });

  it("a list nobody awaits makes no request", () => {
    const { fetch, calls } = fakeFetch();
    client(fetch).payments.list();
    expect(calls).toHaveLength(0);
  });
});

describe("events", () => {
  it("retrieve and list", async () => {
    const event = { id: "evt_1", object: "event", type: "payment.succeeded" };
    const { fetch, calls } = fakeFetch(ok(event), ok({ items: [event], nextCursor: null }));
    const fusion = client(fetch);
    expect((await fusion.events.retrieve("evt_1")).id).toBe("evt_1");
    const page = await fusion.events.list({ paymentId: "pay_test_1", type: "payment.succeeded" });
    expect(page.items).toHaveLength(1);
    expect(calls[0]!.url.pathname).toBe("/v1/events/evt_1");
    expect(Object.fromEntries(calls[1]!.url.searchParams)).toEqual({
      paymentId: "pay_test_1",
      type: "payment.succeeded",
    });
  });
});

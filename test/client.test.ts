import { inspect } from "node:util";
import { describe, expect, it } from "vitest";
import { Fusion, FusionConfigError } from "../src/index.js";
import { client, fakeFetch, LIVE_KEY, ok, payment, TEST_KEY } from "./helpers.js";

describe("new Fusion()", () => {
  it("reads the mode from the key", () => {
    expect(new Fusion(TEST_KEY).mode).toBe("sandbox");
    expect(new Fusion(LIVE_KEY).mode).toBe("live");
  });

  it.each([
    ["a publishable key", `fpk_test_${"0".repeat(40)}`, /publishable key/],
    ["a webhook secret", `whsec_test_${"0".repeat(40)}`, /webhook signing secret/],
    ["an empty string", "", /Pass your secret key/],
    ["something else", "sk_test_123", /not a Fusion secret key/],
    ["a key with a space", `${TEST_KEY} `, /not a Fusion secret key/],
  ])("refuses %s, naming the right key", (_, key, message) => {
    expect(() => new Fusion(key)).toThrow(FusionConfigError);
    expect(() => new Fusion(key)).toThrow(message);
  });

  it("refuses a non-string key from plain JavaScript", () => {
    expect(() => new Fusion(undefined as unknown as string)).toThrow(FusionConfigError);
  });

  it.each([
    [{ baseUrl: "not a url" }, /baseUrl/],
    [{ baseUrl: "ftp://api.test" }, /baseUrl/],
    [{ baseUrl: "http://api.usefusion.com" }, /https/],
    [{ timeout: 0 }, /timeout/],
    [{ timeout: 1.5 }, /timeout/],
    [{ maxRetries: -1 }, /maxRetries/],
  ])("refuses bad options %o", (options, message) => {
    expect(() => new Fusion(TEST_KEY, options)).toThrow(message);
  });

  it("calls a custom baseUrl, without a trailing slash doubling", async () => {
    const { fetch, calls } = fakeFetch(ok(payment()));
    await new Fusion(TEST_KEY, { fetch, baseUrl: "http://localhost:9/" }).payments.retrieve(
      "pay_x",
    );
    expect(calls[0]!.url.href).toBe("http://localhost:9/v1/payments/pay_x");
  });

  it("calls fetch unbound, as runtimes that check `this` require", async () => {
    const { fetch } = fakeFetch(ok(payment()));
    const strict = function (this: unknown, input: RequestInfo | URL, init?: RequestInit) {
      if (this !== undefined) throw new TypeError("Illegal invocation");
      return fetch(input, init);
    } as typeof globalThis.fetch;
    await expect(client(strict).payments.retrieve("pay_x")).resolves.toBeDefined();
  });
});

describe("the secret key never leaks", () => {
  const fusion = new Fusion(TEST_KEY);

  it("is not in String(), JSON or inspect()", () => {
    for (const shown of [
      String(fusion),
      JSON.stringify(fusion),
      inspect(fusion, { depth: Infinity, showHidden: true }),
      inspect(fusion.payments, { depth: Infinity, showHidden: true }),
    ]) {
      expect(shown).not.toContain(TEST_KEY);
    }
  });

  it("goes only into the Authorization header", async () => {
    const { fetch, calls } = fakeFetch(ok(payment()));
    await client(fetch).payments.retrieve("pay_x");
    const call = calls[0]!;
    expect(call.headers.authorization).toBe(`Bearer ${TEST_KEY}`);
    expect(call.url.href).not.toContain(TEST_KEY);
    const others = Object.entries(call.headers).filter(([name]) => name !== "authorization");
    expect(JSON.stringify(others)).not.toContain(TEST_KEY);
  });
});

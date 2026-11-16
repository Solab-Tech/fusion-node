import { FusionConfigError } from "./errors.js";
import { createTransport } from "./request.js";
import { Events } from "./resources/events.js";
import { Payments } from "./resources/payments.js";
import type { Mode } from "./types.js";

export interface FusionOptions {
  /** Defaults to `https://api.usefusion.com`. */
  baseUrl?: string;
  /** Milliseconds per attempt. Defaults to 30 000. */
  timeout?: number;
  /** Retries after the first attempt, for network errors, 429 and 5xx. Defaults to 2. */
  maxRetries?: number;
  /** Defaults to the runtime's global `fetch`. */
  fetch?: typeof fetch;
}

const DEFAULT_BASE_URL = "https://api.usefusion.com";
const SECRET_KEY = /^fsk_(test|live)_[0-9A-Za-z]+$/;

export class Fusion {
  /** Read from the key: `sandbox` for `fsk_test_…`, `live` for `fsk_live_…`. */
  readonly mode: Mode;
  readonly payments: Payments;
  readonly events: Events;

  /** @param secretKey Your secret key, `fsk_test_…` or `fsk_live_…`, from the Fusion dashboard. */
  constructor(secretKey: string, options: FusionOptions = {}) {
    const match = SECRET_KEY.exec(checkKey(secretKey));
    if (!match)
      throw new FusionConfigError(
        "This is not a Fusion secret key: use fsk_test_… or fsk_live_… from the dashboard",
      );
    this.mode = match[1] === "live" ? "live" : "sandbox";

    const fetchImpl = options.fetch ?? globalThis.fetch;
    if (typeof fetchImpl !== "function") {
      throw new FusionConfigError("No fetch in this runtime: pass one as the `fetch` option");
    }
    const request = createTransport({
      secretKey,
      baseUrl: checkBaseUrl(options.baseUrl ?? DEFAULT_BASE_URL),
      timeout: checkCount("timeout", options.timeout ?? 30_000, 1),
      maxRetries: checkCount("maxRetries", options.maxRetries ?? 2, 0),
      // Called unbound, some runtimes' fetch throws "Illegal invocation".
      fetch: (input, init) => fetchImpl(input, init),
    });
    this.payments = new Payments(request);
    this.events = new Events(request);
  }
}

/** Names the key a caller passed by mistake. The messages never include the value itself. */
function checkKey(key: unknown): string {
  if (typeof key !== "string" || key.trim() === "") {
    throw new FusionConfigError("Pass your secret key (fsk_test_… or fsk_live_…) to new Fusion()");
  }
  if (key.startsWith("fpk_")) {
    throw new FusionConfigError("This is a publishable key (fpk_…): use your secret key (fsk_…)");
  }
  if (key.startsWith("whsec_")) {
    throw new FusionConfigError(
      "This is a webhook signing secret (whsec_…): use your secret key (fsk_…)",
    );
  }
  return key;
}

function checkBaseUrl(value: string): string {
  let url: URL;
  try {
    url = new URL(value);
  } catch {
    throw new FusionConfigError("`baseUrl` is not a URL");
  }
  // Plain http would send the secret key in clear text: only this machine may use it.
  const local = ["localhost", "127.0.0.1", "[::1]"].includes(url.hostname);
  if (url.protocol !== "https:" && !(url.protocol === "http:" && local)) {
    throw new FusionConfigError("`baseUrl` must be https (http only for localhost)");
  }
  return url.origin + url.pathname.replace(/\/+$/, "");
}

function checkCount(name: string, value: unknown, min: number): number {
  if (typeof value !== "number" || !Number.isInteger(value) || value < min) {
    throw new FusionConfigError(`\`${name}\` must be a whole number, at least ${min}`);
  }
  return value;
}

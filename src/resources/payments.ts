import { FusionConfigError } from "../errors.js";
import { PagePromise } from "../page.js";
import { idPath, type Transport } from "../request.js";
import type { Payment, PaymentCreateParams, PaymentListParams } from "../types.js";

export interface PaymentCreateOptions {
  /**
   * Makes the create safe to repeat: the same key and body return the first payment instead of a
   * second one. One is generated when you leave it out; pass your own (an order id, say) to stay
   * safe across your own retries too. 1–255 visible ASCII characters.
   */
  idempotencyKey?: string;
}

export class Payments {
  readonly #request: Transport;

  constructor(request: Transport) {
    this.#request = request;
  }

  /** Creates a payment and its hosted checkout page: send the customer to `payment.url`. */
  async create(params: PaymentCreateParams, options: PaymentCreateOptions = {}): Promise<Payment> {
    const { idempotencyKey = crypto.randomUUID() } = options;
    // Checked here: a bad header value makes fetch throw, which would look like a network error.
    if (typeof idempotencyKey !== "string" || !/^[\x21-\x7e]{1,255}$/.test(idempotencyKey)) {
      throw new FusionConfigError("`idempotencyKey` must be 1–255 visible ASCII characters");
    }
    return this.#request({ method: "POST", path: "/v1/payments", body: params, idempotencyKey });
  }

  async retrieve(id: string): Promise<Payment> {
    return this.#request({ method: "GET", path: `/v1/payments/${idPath(id)}` });
  }

  /**
   * Asks the gateway for the payment's current state. Call it when the customer comes back to
   * your `redirectUrl`: the return itself proves nothing.
   */
  async verify(id: string): Promise<Payment> {
    return this.#request({
      method: "POST",
      path: `/v1/payments/${idPath(id)}/verify`,
    });
  }

  /** Newest first. `await` for one page, or `for await` over every payment. */
  list(params: PaymentListParams = {}): PagePromise<Payment> {
    return new PagePromise((cursor) =>
      this.#request({
        method: "GET",
        path: "/v1/payments",
        query: { ...params, ...(cursor === undefined ? {} : { cursor }) },
      }),
    );
  }
}

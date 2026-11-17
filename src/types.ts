// Public names for the API's shapes. Each is an alias of the generated spec types
// (src/generated/api.ts), so the spec stays the only source; nothing here is typed by hand.
import type { operations } from "./generated/api.js";

type Json<T> = T extends { content: { "application/json": infer B } } ? B : never;
type Data<T> = Json<T> extends { data: infer D } ? D : never;

/** A payment: its status, amount, hosted page `url`, attempts and metadata. */
export type Payment = Data<operations["get_payments_id"]["responses"][200]>;

/** The body of `payments.create`. `amountMinor` is integer minor units: ₦5,000.00 is 500000. */
export type PaymentCreateParams = Json<operations["post_payments"]["requestBody"]>;

/** Filters and paging for `payments.list`. */
export type PaymentListParams = NonNullable<operations["get_payments"]["parameters"]["query"]>;

export type PaymentStatus = Payment["status"];

/** An event: exactly what a webhook delivered. */
export type Event = Data<operations["get_events_id"]["responses"][200]>;

/** Filters and paging for `events.list`. */
export type EventListParams = NonNullable<operations["get_events"]["parameters"]["query"]>;

export type EventType = Event["type"];

/** `sandbox` for a test key (`fsk_test_…`), `live` for a live key (`fsk_live_…`). */
export type Mode = Payment["mode"];

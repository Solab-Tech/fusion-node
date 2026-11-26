import { listPages, type PagePromise } from "../page.js";
import { idPath, type Transport } from "../request.js";
import type { Event, EventListParams } from "../types.js";

export class Events {
  readonly #request: Transport;

  constructor(request: Transport) {
    this.#request = request;
  }

  async retrieve(id: string): Promise<Event> {
    return this.#request({ method: "GET", path: `/v1/events/${idPath(id)}` });
  }

  /**
   * Newest first: what each webhook delivered, to catch up on missed deliveries. Delivery order
   * is not guaranteed — order by `data.object.version`.
   */
  list(params: EventListParams = {}): PagePromise<Event> {
    return listPages(this.#request, "/v1/events", params);
  }
}

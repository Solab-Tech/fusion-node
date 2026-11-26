import { FusionApiError } from "./errors.js";
import type { Transport } from "./request.js";

interface ListBody<T> {
  items: T[];
  nextCursor: string | null;
}

type Load<T> = (cursor: string | undefined) => Promise<ListBody<T>>;

/**
 * Checks a page before it is walked: a missing or repeated cursor would otherwise fetch the same
 * page forever, burning the merchant's rate limit.
 */
function checked<T>(body: ListBody<T>, cursor: string | undefined): ListBody<T> {
  const valid =
    Array.isArray(body?.items) &&
    (body.nextCursor === null || typeof body.nextCursor === "string") &&
    body.nextCursor !== cursor;
  if (valid) return body;
  throw new FusionApiError({
    statusCode: 200,
    code: "unexpected_response",
    message: "The Fusion API answered a list without a usable page",
  });
}

/** One page of a list: `items`, newest first, and the cursor of the next page (null on the last). */
export class Page<T> {
  readonly items: T[];
  readonly nextCursor: string | null;
  readonly #load: Load<T>;

  constructor(body: ListBody<T>, load: Load<T>) {
    this.items = body.items;
    this.nextCursor = body.nextCursor;
    this.#load = load;
  }

  /** The next page, or null when this is the last. */
  async nextPage(): Promise<Page<T> | null> {
    if (this.nextCursor === null) return null;
    return new Page(checked(await this.#load(this.nextCursor), this.nextCursor), this.#load);
  }
}

/**
 * What `list()` returns. `await` it for the first page, or `for await` over it for every item of
 * every page — each next page is fetched only when the loop reaches it, and `break` stops there.
 */
export class PagePromise<T> implements PromiseLike<Page<T>>, AsyncIterable<T> {
  readonly #load: Load<T>;
  #first: Promise<Page<T>> | undefined;

  constructor(load: Load<T>) {
    this.#load = load;
  }

  // Started on first use, so a list() nobody awaits makes no request and no unhandled rejection.
  #firstPage(): Promise<Page<T>> {
    this.#first ??= this.#load(undefined).then(
      (body) => new Page(checked(body, undefined), this.#load),
    );
    return this.#first;
  }

  then<A = Page<T>, B = never>(
    onFulfilled?: ((page: Page<T>) => A | PromiseLike<A>) | null,
    onRejected?: ((reason: unknown) => B | PromiseLike<B>) | null,
  ): Promise<A | B> {
    return this.#firstPage().then(onFulfilled, onRejected);
  }

  catch<B = never>(
    onRejected?: ((reason: unknown) => B | PromiseLike<B>) | null,
  ): Promise<Page<T> | B> {
    return this.then(undefined, onRejected);
  }

  finally(onFinally?: (() => void) | null): Promise<Page<T>> {
    return this.#firstPage().finally(onFinally);
  }

  async *[Symbol.asyncIterator](): AsyncIterator<T> {
    let page: Page<T> | null = await this.#firstPage();
    while (page) {
      yield* page.items;
      page = await page.nextPage();
    }
  }
}

/** A resource's `list()`: pages of `path`, each fetched with the filters and the cursor. */
export function listPages<T>(
  request: Transport,
  path: string,
  params: Record<string, string | number | undefined>,
): PagePromise<T> {
  return new PagePromise((cursor) =>
    request({ method: "GET", path, query: { ...params, cursor } }),
  );
}

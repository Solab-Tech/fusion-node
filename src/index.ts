import { Fusion } from "./client.js";

export { Fusion };
export type { FusionOptions } from "./client.js";
export {
  FusionApiError,
  FusionAuthenticationError,
  FusionConfigError,
  FusionConflictError,
  FusionConnectionError,
  FusionError,
  FusionInvalidRequestError,
  FusionRateLimitError,
} from "./errors.js";
export { Page, PagePromise } from "./page.js";
export type { PaymentCreateOptions } from "./resources/payments.js";
export type {
  Event,
  EventListParams,
  EventType,
  Mode,
  Payment,
  PaymentCreateParams,
  PaymentListParams,
  PaymentStatus,
} from "./types.js";
export { VERSION } from "./version.js";

export default Fusion;

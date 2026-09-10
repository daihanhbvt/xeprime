/**
 * `@xeprime/api-client` — HẠ TẦNG HTTP dùng chung cho mọi client của XePrime.
 *
 * Từ ADR 0031, package này KHÔNG còn chứa lời gọi theo nghiệp vụ: mỗi app giữ tầng feature của
 * riêng mình (`apps/web/src/features` và `apps/mobile/src/api`). Ở lại đây đúng phần
 * KHÔNG phụ thuộc nghiệp vụ: cấu hình client, phong bì `{data,meta}`, phân trang, `ApiClientError`,
 * AuthTransport và query key.
 *
 * Không có `next/*`, không có `antd`, không có DOM API, không có React. Emit CommonJS
 * (`packages/config/tsconfig/lib.json`) nên Metro của React Native đọc được trực tiếp.
 *
 * Cách cấu hình ở mỗi app: xem `README.md` của package.
 */
export { STALE_TIME } from './cache';

export {
  createApiClient,
  configureApiClient,
  getApiClient,
  getApiBaseUrl,
  apiRequest,
  apiGet,
  apiPost,
  apiPatch,
  apiPut,
  apiDelete,
  fetchPage,
  type ApiClient,
  type ApiClientOptions,
  type ApiRequestOptions,
  type Paged,
} from './client';

export {
  ApiClientError,
  CLIENT_ERROR_CODE,
  getErrorCode,
  isRetriableError,
  isUnauthenticated,
  toApiClientError,
  toNetworkError,
  type ClientErrorCode,
} from './errors';

export {
  anonymousAuthTransport,
  bearerAuthTransport,
  webAuthTransport,
  type AuthCredentials,
  type AuthTransport,
} from './transport';

export {
  buildUrl,
  encodeQuery,
  normalizeBaseUrl,
  type QueryParams,
  type QueryParamValue,
} from './url';

export {
  platformFetch,
  type AbortSignalLike,
  type FetchCredentials,
  type FetchInit,
  type FetchLike,
  type FetchResponse,
} from './http';

export { queryKeys } from './query-keys';

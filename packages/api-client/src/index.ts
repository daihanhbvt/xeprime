/**
 * `@xeprime/api-client` — MỘT client HTTP cho mọi client của XePrime.
 *
 * Không có `next/*`, không có `antd`, không có DOM API, không có React. Emit CommonJS
 * (`packages/config/tsconfig/lib.json`) nên Metro của React Native đọc được trực tiếp.
 *
 * Cách cấu hình ở mỗi app: xem `README.md` của package.
 */
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

export {
  catalogApi,
  catalogLabel,
  groupCatalog,
  EMPTY_CATALOG,
  type CatalogItem,
  type CatalogMap,
} from './features/catalog';

export {
  marketplaceApi,
  toListingQueryParams,
  DEFAULT_LISTING_LIMIT,
} from './features/marketplace/api';
export { authApi, mobileAuthApi } from './features/auth/api';
export type {
  CurrentUser,
  ForgotPasswordInput,
  LoginInput,
  MobileLoginInput,
  MobileLogoutInput,
  MobileRefreshInput,
  MobilePhoneLoginInput,
  MobileSession,
  MobileSocialExchangeInput,
  MobileTokenPair,
  RegisterInput,
  ResetPasswordInput,
  SetPasswordInput,
} from './features/auth/types';

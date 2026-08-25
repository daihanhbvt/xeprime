import { bearerAuthTransport, configureApiClient } from '@xeprime/api-client';
import { resolveApiBaseUrl } from './api-base-url';
import { getFreshAccessToken, recoverFromUnauthorized } from './auth-session';
import { fetchWithTimeout } from './fetch-with-timeout';

configureApiClient({
  baseUrl: resolveApiBaseUrl(),
  transport: bearerAuthTransport(getFreshAccessToken),
  // Server thu hồi phiên sớm hơn `exp` thì 401 là tin duy nhất app nhận được.
  onUnauthorized: recoverFromUnauthorized,
  fetch: fetchWithTimeout,
});

export {
  ApiClientError,
  apiDelete,
  apiGet,
  apiPatch,
  apiPost,
  apiPut,
  apiRequest,
  CLIENT_ERROR_CODE,
  fetchPage,
  getApiBaseUrl,
  getErrorCode,
  isRetriableError,
  isUnauthenticated,
  type ApiRequestOptions,
  type ClientErrorCode,
  type Paged,
  type QueryParams,
  type QueryParamValue,
} from '@xeprime/api-client';

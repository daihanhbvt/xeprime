import { bearerAuthTransport, configureApiClient } from '@xeprime/api-client';
import { resolveApiBaseUrl } from './api-base-url';
import { getFreshAccessToken } from './auth-session';
import { fetchWithTimeout } from './fetch-with-timeout';
 
configureApiClient({
  baseUrl: resolveApiBaseUrl(),
  transport: bearerAuthTransport(getFreshAccessToken),
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

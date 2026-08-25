import { bearerAuthTransport, configureApiClient } from '@xeprime/api-client';
import { resolveApiBaseUrl } from './api-base-url';
import { getFreshAccessToken, recoverFromUnauthorized } from './auth-session';
import { fetchWithTimeout } from './fetch-with-timeout';
import { withHttpLogging } from './fetch-with-logging';
import { logger } from './logger';

const baseUrl = resolveApiBaseUrl();

// Host được SUY RA lúc chạy từ Expo dev server, nên nó khác nhau giữa emulator, máy thật và
// `EXPO_PUBLIC_API_URL`. In một lần lúc khởi động: khi request treo, đây là câu hỏi đầu tiên.
logger.debug(`API baseUrl: ${baseUrl}`);

configureApiClient({
  baseUrl,
  transport: bearerAuthTransport(getFreshAccessToken),
  // Server thu hồi phiên sớm hơn `exp` thì 401 là tin duy nhất app nhận được.
  onUnauthorized: recoverFromUnauthorized,
  fetch: withHttpLogging(fetchWithTimeout),
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

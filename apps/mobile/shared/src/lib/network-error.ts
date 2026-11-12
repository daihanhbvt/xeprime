import { onlineManager } from '@tanstack/react-query';
import { ApiClientError, CLIENT_ERROR_CODE } from '@/lib/api-client';

/**
 * Lỗi này có phải do MẤT MẠNG không (không phải lỗi nghiệp vụ hay 5xx). Client native dựng
 * `ApiClientError` mã `CLIENT_NETWORK_ERROR` / `CLIENT_TIMEOUT` (status 0) khi không có response;
 * `TypeError` trần là fetch hỏng ngoài client. Một lỗi bất kỳ trong lúc NetInfo báo offline cũng
 * tính — request có thể đã hỏng trước khi NetInfo kịp báo.
 */
export function isOfflineError(error: unknown): boolean {
  if (!onlineManager.isOnline()) return true;
  if (error instanceof ApiClientError) {
    return error.code === CLIENT_ERROR_CODE.NETWORK_ERROR || error.code === CLIENT_ERROR_CODE.TIMEOUT;
  }
  return error instanceof TypeError;
}

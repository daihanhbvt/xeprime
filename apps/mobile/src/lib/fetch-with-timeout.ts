import { ApiClientError, CLIENT_ERROR_CODE, type FetchLike } from '@xeprime/api-client';

/** Mạng di động chập chờn không báo lỗi, nó treo. Không có trần thời gian thì UI treo theo. */
export const REQUEST_TIMEOUT_MS = 15_000;

/**
 * `fetch` có trần thời gian, cắm vào `createApiClient({ fetch })`.
 *
 * Trần thời gian ở đây chứ không trong package dùng chung vì `setTimeout`/`AbortController`
 * không nằm trong `lib: ES2023` mà package đó nhắm tới — và "bao lâu là quá lâu" là chính sách
 * của từng app, không phải của hợp đồng API.
 *
 * `AbortSignal.any`/`AbortSignal.timeout` CỐ Ý không dùng: Hermes không đảm bảo có chúng ở mọi
 * bản RN, và lỗi sẽ chỉ lộ ra trên máy thật chứ không phải trong Jest (chạy trên Node).
 */
export function createFetchWithTimeout(timeoutMs: number): FetchLike {
  return async (url, init = {}) => {
    const controller = new AbortController();
    let timedOut = false;
    const timer = setTimeout(() => {
      timedOut = true;
      controller.abort();
    }, timeoutMs);

    // Signal của chỗ gọi (TanStack Query huỷ query bằng signal riêng) phải gộp với signal của
    // trần thời gian — chỉ truyền được một cái xuống `fetch`.
    const external = init.signal;
    const forward = () => controller.abort();
    if (external?.aborted) forward();
    else external?.addEventListener?.('abort', forward);

    try {
      return await fetch(url, { ...init, signal: controller.signal });
    } catch (cause) {
      // Không phải quá hạn thì để client dịch thành `CLIENT_NETWORK_ERROR` — nó biết `path`.
      if (!timedOut) throw cause;

      throw new ApiClientError({
        code: CLIENT_ERROR_CODE.TIMEOUT,
        message: `Request to ${url} timed out`,
        status: 0,
        details: cause,
      });
    } finally {
      clearTimeout(timer);
      external?.removeEventListener?.('abort', forward);
    }
  };
}

export const fetchWithTimeout = createFetchWithTimeout(REQUEST_TIMEOUT_MS);

/**
 * Bề mặt HTTP tối thiểu mà client cần — khai báo TẠI ĐÂY thay vì lấy từ `lib.dom`.
 *
 * `packages/config/tsconfig/base.json` đặt `lib: ["ES2023"]`, không có DOM. Đó là chủ ý: package
 * này phải biên dịch và chạy được trên React Native (Metro), nơi KHÔNG có `window`, `File`,
 * `XMLHttpRequest`. Thêm `"DOM"` vào lib để lấy `RequestInit`/`Response` sẽ kéo cả họ API trình
 * duyệt vào tầm với của mã dùng chung — và thứ gõ được thì sớm muộn có người gõ.
 *
 * Ba interface dưới đây là phần giao nhau THẬT của `fetch` trên ba nền tảng: trình duyệt,
 * Node ≥18, và RN. Chúng cấu trúc (structural) nên `globalThis.fetch` thật khớp mà không cần ép
 * kiểu ở nơi gọi.
 */

/** Cờ cookie của `fetch`. RN không có cookie jar đáng tin — chỉ web transport dùng tới. */
export type FetchCredentials = 'omit' | 'same-origin' | 'include';

/**
 * `AbortSignal` ở dạng cấu trúc. Client chỉ CHUYỂN TIẾP nó xuống `fetch`, không đọc thuộc tính
 * nào, nên một trường `aborted` là đủ để phân biệt nó với `unknown`.
 */
export interface AbortSignalLike {
  readonly aborted: boolean;
}

export interface FetchInit {
  method?: string;
  headers?: Record<string, string>;
  body?: string;
  credentials?: FetchCredentials;
  signal?: AbortSignalLike;
}

export interface FetchResponse {
  readonly ok: boolean;
  readonly status: number;
  text(): Promise<string>;
}

export type FetchLike = (url: string, init?: FetchInit) => Promise<FetchResponse>;

/**
 * `fetch` của nền tảng đang chạy.
 *
 * Tra lúc GỌI, không lúc import: Metro nạp module rất sớm và một số polyfill (`whatwg-fetch`
 * trong Expo dev client) gắn `globalThis.fetch` sau đó. Chốt tham chiếu ở module scope sẽ bắt
 * được bản `undefined` và lỗi chỉ hiện ở request đầu tiên.
 */
export function platformFetch(): FetchLike {
  const candidate = (globalThis as { fetch?: FetchLike }).fetch;
  if (typeof candidate !== 'function') {
    throw new Error(
      '@xeprime/api-client: môi trường không có `fetch`. ' +
        'Truyền `fetch` tường minh vào createApiClient({ fetch }).',
    );
  }
  return candidate;
}

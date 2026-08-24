/**
 * Dựng URL và query string.
 *
 * `URLSearchParams` KHÔNG dùng ở đây: nó thuộc `lib.dom`/Node core, không nằm trong `lib: ES2023`
 * mà package dùng chung nhắm tới (xem `http.ts`). Bản tự viết dưới đây mã hoá đúng như
 * `URLSearchParams` cho các giá trị mà API này nhận (chuỗi, số, boolean) — không có mảng, không
 * có khoá trùng, nên không có phần hành vi khó nào để lệch.
 */

export type QueryParamValue = string | number | boolean | null | undefined;
export type QueryParams = Readonly<Record<string, QueryParamValue>>;

/**
 * `undefined`, `null` và chuỗi rỗng bị BỎ khỏi query.
 *
 * Đây là hợp đồng có sẵn của web và mọi `api.ts` của feature đang dựa vào nó: bộ lọc chưa chọn
 * thì không gửi tham số, thay vì gửi `?status=` để backend phải tự hiểu chuỗi rỗng là "tất cả".
 */
export function encodeQuery(query: QueryParams): string {
  const parts: string[] = [];
  for (const [key, value] of Object.entries(query)) {
    if (value === undefined || value === null || value === '') continue;
    parts.push(`${encodeURIComponent(key)}=${encodeURIComponent(String(value))}`);
  }
  return parts.join('&');
}

/** `baseUrl` đã bỏ dấu `/` ở cuối + `path` + query. */
export function buildUrl(baseUrl: string, path: string, query?: QueryParams): string {
  const url = `${baseUrl}${path.startsWith('/') ? path : `/${path}`}`;
  if (!query) return url;
  const qs = encodeQuery(query);
  return qs ? `${url}?${qs}` : url;
}

/** Bỏ mọi dấu `/` ở cuối — `http://host/` và `http://host` phải cho cùng một URL. */
export function normalizeBaseUrl(baseUrl: string): string {
  return baseUrl.replace(/\/+$/, '');
}

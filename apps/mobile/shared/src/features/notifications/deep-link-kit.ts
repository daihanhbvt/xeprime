import type { Href } from 'expo-router';

/**
 * BỘ ĐỒ NGHỀ của allowlist deep link thông báo — phần DÙNG CHUNG giữa hai app.
 *
 * Danh sách entry thật sống ở `@/app-profile` của TỪNG app (Customer nhận đích khách +
 * Owner Lite, Partner nhận `/manage/**`): allowlist là ranh giới của một app, không phải một
 * mảnh code chung. File này chỉ giữ các helper dựng entry, để hai bản danh sách không chép
 * tay lại cùng một phép kiểm id.
 */

/** ULID char(26); nới nhẹ cho mã tham chiếu nhưng vẫn cấm `/`, `?`, `..`, khoảng trắng. */
export const SEGMENT = /^[A-Za-z0-9_-]{1,64}$/;

/** `rest` là phần đứng SAU prefix: rỗng = màn danh sách, một đoạn = màn chi tiết. */
export type Resolver = (rest: string[]) => Href | null;

export interface AllowedDeepLink {
  prefix: string;
  resolve: Resolver;
}

/** Đường dẫn `/<prefix>` → danh sách, `/<prefix>/<id>` → chi tiết. Dạng phổ biến nhất. */
export function listOrDetail(list: () => Href, detail: (id: string) => Href): Resolver {
  return (rest) => {
    if (rest.length === 0) return list();
    const id = rest[0];
    return rest.length === 1 && id && SEGMENT.test(id) ? detail(id) : null;
  };
}

/** Đường dẫn chỉ có đúng một dạng, không nhận đoạn nào phía sau. */
export function exact(href: () => Href): Resolver {
  return (rest) => (rest.length === 0 ? href() : null);
}

/** BẮT BUỘC có id — một đích trần không bao giờ được server sinh ra, nhận nó là nới allowlist. */
export function singleDetail(detail: (id: string) => Href): Resolver {
  return (rest) =>
    rest.length === 1 && rest[0] && SEGMENT.test(rest[0]) ? detail(rest[0]) : null;
}

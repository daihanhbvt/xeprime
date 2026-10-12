import { useLocalSearchParams, useRouter } from 'expo-router';
import { useEffect, useRef } from 'react';

/**
 * Đọc MỘT tham số route làm giá trị KHỞI TẠO cho bộ lọc của màn danh sách — bản native của
 * `?status=` / `?operationStatus=` mà thẻ Tổng quan web đặt lên URL.
 *
 * Chỉ nhận giá trị nằm trong danh sách cho phép (hằng số của `@xeprime/types`): deep link cũ hay
 * gõ sai thì bỏ qua, màn mở với bộ lọc mặc định thay vì gửi một giá trị server sẽ từ chối.
 */
export function pickListParam<T extends string>(
  value: string | string[] | undefined,
  allowed: readonly T[],
): T | undefined {
  const raw = Array.isArray(value) ? value[0] : value;
  return raw && (allowed as readonly string[]).includes(raw) ? (raw as T) : undefined;
}

/** Bỏ khoá rỗng — `Href` dạng object không mang tham số `undefined` lên đường dẫn. */
export function compactParams(
  params: Record<string, string | undefined>,
): Record<string, string> | null {
  const out: Record<string, string> = {};
  for (const [key, value] of Object.entries(params)) if (value) out[key] = value;
  return Object.keys(out).length > 0 ? out : null;
}

/**
 * Bộ lọc KHỞI TẠO từ tham số route: giá trị hợp lệ lúc mở màn — dùng làm `useState` khởi tạo, nên
 * lượt tải đầu đã đúng bộ lọc, không tải bản trơn rồi mới lọc.
 */
export function useListParam<T extends string>(name: string, allowed: readonly T[]): T | undefined {
  const params = useLocalSearchParams<Record<string, string | string[]>>();
  return pickListParam(params[name], allowed);
}

/**
 * Áp lại bộ lọc khi tham số route ĐỔI trong lúc màn vẫn sống — màn danh sách là một tab, bấm thẻ
 * Tổng quan khác không dựng lại màn. Giá trị lúc mở màn đã nằm trong `useState`, không áp lần hai.
 *
 * Áp xong thì GỠ tham số khỏi route (như `?request=`): giữ lại thì bấm CÙNG một thẻ lần nữa sau khi
 * người dùng tự đổi tab là một giá trị không đổi, bộ lọc không áp lại — web áp lại mỗi lần vì URL
 * mới. Gọi SAU khi khai báo state mà `apply` ghi vào.
 */
export function useListParamChange<T extends string>(
  name: string,
  value: T | undefined,
  apply: (value: T) => void,
): void {
  const router = useRouter();
  // Giá trị lúc MỞ màn đã là state khởi tạo (`useListParam`) — chỉ gỡ tham số, không áp lần hai.
  const mounted = useRef(false);
  const applyRef = useRef(apply);
  useEffect(() => {
    applyRef.current = apply;
  });
  useEffect(() => {
    const first = !mounted.current;
    mounted.current = true;
    if (!value) return;
    if (!first) applyRef.current(value);
    router.setParams({ [name]: undefined });
  }, [name, router, value]);
}

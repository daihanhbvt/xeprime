import type { Href } from 'expo-router';

/**
 * Mang chi nhánh đang lọc THEO ĐƯỜNG DẪN khi điều hướng trong khu quản lý — bản native của
 * `apps/web/src/features/branches/branch-link.ts` (ADR 0052 điều 5).
 *
 * Màn đọc chi nhánh từ tham số route của CHÍNH nó, nên link phải mang sẵn `branchId` thì màn mở
 * ra mới đúng ngay từ request đầu — không có bộ nhớ nào để hoà giải, không có gì để nhấp nháy.
 */

/**
 * Những màn LỌC ĐƯỢC theo chi nhánh — bản sao duy nhất của quy tắc "màn nào mang chi nhánh đi
 * theo". Cùng danh sách `BRANCH_AWARE_ROUTES` của web (đường dẫn native của chính các màn đó).
 *
 * ⚠️ Nợ đã biết (ADR 0052 điều 5c): "Yêu cầu đặt xe" nằm trong danh sách nhưng huy hiệu menu của
 * nó đếm TOÀN gian hàng — đang lọc một chi nhánh có thể thấy huy hiệu "2" mà mở ra rỗng.
 */
const BRANCH_AWARE_ROUTES: readonly string[] = [
  '/manage',
  '/manage/vehicles',
  '/manage/maintenance',
  '/manage/calendar',
  '/manage/requests',
  '/manage/bookings',
  '/manage/bookings/awaiting-pickup',
  '/manage/debts',
  '/manage/receipts',
  '/manage/finance',
];

export function isBranchAwareRoute(href: string): boolean {
  const path = href.split('?')[0];
  return BRANCH_AWARE_ROUTES.includes(path ?? '');
}

function appendBranch(href: string, branchId: string): string {
  return `${href}${href.includes('?') ? '&' : '?'}branchId=${encodeURIComponent(branchId)}`;
}

/**
 * Thêm `?branchId=` vào link điều hướng khi đang lọc một chi nhánh. Giữ nguyên khi: không lọc,
 * đích không lọc được theo chi nhánh, hoặc link đã tự mang `branchId`. `Href` dạng object được
 * xét theo `pathname` (danh sách thu chi mở sẵn bộ lọc là object).
 */
export function withBranchParam(href: Href, branchId: string | null | undefined): Href {
  if (!branchId) return href;
  if (typeof href !== 'string') {
    return isBranchAwareRoute(String(href.pathname)) ? withBranchReturn(href, branchId) : href;
  }
  if (!isBranchAwareRoute(href) || href.includes('branchId=')) return href;
  return appendBranch(href, branchId) as Href;
}

/**
 * Mang chi nhánh sang màn CHI TIẾT như một mẩu đường về: màn chi tiết không lọc theo nó, chỉ trả
 * lại nguyên vẹn cho danh sách khi bấm "Quay lại" (`useBranchReturnHref`).
 */
export function withBranchReturn(href: Href, branchId: string | null | undefined): Href {
  if (!branchId) return href;
  if (typeof href !== 'string') {
    // `Href` dạng object (route có tham số): ghép vào `params`, tham số tự khai vẫn thắng.
    const params = (href.params ?? {}) as Record<string, unknown>;
    if (params.branchId) return href;
    return { ...href, params: { ...params, branchId } } as Href;
  }
  if (href.includes('branchId=')) return href;
  return appendBranch(href, branchId) as Href;
}

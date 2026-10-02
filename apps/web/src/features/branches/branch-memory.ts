'use client';

import { useCallback, useSyncExternalStore } from 'react';

import { useCurrentUser } from '@/hooks/use-current-user';

/**
 * Nhớ chi nhánh người dùng lọc GẦN NHẤT — chỉ để dựng LINK menu, không bao giờ để đọc dữ liệu.
 *
 * Vì sao cần: link menu mang chi nhánh theo đường dẫn (`withBranchParam`), nhưng nó chỉ đọc được
 * URL đang đứng. Ghé một màn không lọc theo chi nhánh (Khách hàng, Ví điểm…) là URL sạch tham số,
 * và mọi link quay về Xe/Bảo dưỡng/Đơn thuê mất dấu — người dùng "đi ngang qua" một tab là mất
 * lựa chọn.
 *
 * Vì sao đây KHÔNG phải cái bẫy hai-nguồn-sự-thật đã gỡ ở `branch-link.ts`: các TRANG vẫn chỉ đọc
 * URL — bộ nhớ này không bao giờ chảy vào một query hay một ô lọc. Nó chỉ điền tham số vào href
 * của menu, nên URL đúng ngay từ request đầu tiên và không có gì phải hoà giải sau khi render.
 * Mỗi lần đứng trên một màn lọc được, bộ nhớ được ghi đè theo URL (kể cả về "tất cả" = null),
 * nên hai nguồn không bao giờ lệch nhau quá một bước điều hướng.
 *
 * `localStorage` chứ không `sessionStorage`: chi nhánh đang làm là THÓI QUEN làm việc, không phải
 * chuyện của một tab — đóng trình duyệt tối nay, mai mở lại bấm menu vẫn phải đúng chỗ cũ.
 * Không đổi lời hứa của ADR 0052: mở một bookmark hay link ai đó gửi thì "đường dẫn nói gì thấy
 * nấy", vì TRANG chưa bao giờ đọc bộ nhớ này — nó chỉ điền tham số vào href của menu.
 *
 * ## Khoá gắn với GIAN HÀNG, và bị xoá khi đăng xuất
 *
 * Một trình duyệt phục vụ nhiều gian hàng: người có hai tài khoản, một máy dùng chung ở quầy, và
 * nhất là **phiên hỗ trợ** của admin nền tảng (ADR 0050) đi vào từng tenant một. Dùng MỘT khoá
 * chung thì chi nhánh của gian hàng vừa rời mang sang gian hàng vừa vào: id đó không thuộc tenant
 * mới nên backend nhả phạm vi về "tất cả" (không rò dữ liệu), nhưng menu vẫn trỏ vào một chi
 * nhánh không tồn tại ở đây và ô lọc hiện một lựa chọn lạ. Khoá mang `tenantId` khiến chuyện đó
 * không xảy ra được, và `forgetBranchMemory()` ở đường đăng xuất dọn sạch mọi khoá đã ghi.
 */
const PREFIX = 'xp:last-branch:';

const keyOf = (tenantId: string) => `${PREFIX}${tenantId}`;

/** Cache theo tenant để `getSnapshot` trả về cùng một giá trị giữa các lần render. */
const cache = new Map<string, string | null>();
const listeners = new Set<() => void>();

function read(tenantId: string | null): string | null {
  if (!tenantId) return null;
  if (!cache.has(tenantId)) {
    try {
      cache.set(tenantId, window.localStorage.getItem(keyOf(tenantId)));
    } catch {
      cache.set(tenantId, null);
    }
  }
  return cache.get(tenantId) ?? null;
}

export function rememberBranch(tenantId: string | null, branchId: string | null): void {
  // Chưa biết đang ở gian hàng nào thì không có chỗ nào đúng để ghi — bỏ qua, không ghi bừa.
  if (!tenantId) return;
  if (cache.get(tenantId) === branchId) return;
  cache.set(tenantId, branchId);
  try {
    if (branchId) window.localStorage.setItem(keyOf(tenantId), branchId);
    else window.localStorage.removeItem(keyOf(tenantId));
  } catch {
    // Chặn storage (private mode) thì bộ nhớ chỉ sống trong biến module — vẫn đủ cho một phiên.
  }
  listeners.forEach((fn) => fn());
}

/**
 * Xoá sạch bộ nhớ chi nhánh — gọi ở đường ĐĂNG XUẤT (`useLogout`).
 *
 * Quét theo tiền tố chứ không xoá đúng một khoá: người vừa đăng xuất có thể đã đi qua nhiều gian
 * hàng trong phiên (phiên hỗ trợ), và máy dùng chung ở quầy thì người sau không được thừa hưởng
 * ngữ cảnh làm việc của người trước.
 */
export function forgetBranchMemory(): void {
  cache.clear();
  try {
    const stale = Object.keys(window.localStorage).filter((k) => k.startsWith(PREFIX));
    stale.forEach((k) => window.localStorage.removeItem(k));
  } catch {
    // Storage bị chặn: cache trong module đã dọn ở trên, không còn gì sống sót.
  }
  listeners.forEach((fn) => fn());
}

function subscribe(fn: () => void): () => void {
  listeners.add(fn);
  return () => listeners.delete(fn);
}

/**
 * Chi nhánh nhớ được của gian hàng ĐANG LÀM VIỆC, an toàn với SSR: server luôn trả `null` (không
 * có storage để đọc), client cập nhật qua `useSyncExternalStore` nên href menu đổi sau hydrate mà
 * không lệch markup.
 */
export function useRememberedBranch(): string | null {
  const tenantId = useCurrentTenantId();
  const snapshot = useCallback(() => read(tenantId), [tenantId]);
  return useSyncExternalStore(subscribe, snapshot, () => null);
}

/** Gian hàng đang làm việc — `null` khi chưa tải xong hoặc người dùng không thuộc gian hàng nào. */
export function useCurrentTenantId(): string | null {
  return useCurrentUser().data?.tenant?.id ?? null;
}

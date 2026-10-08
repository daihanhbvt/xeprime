import { useCallback, useSyncExternalStore } from 'react';
import { useTenantScope } from '@/features/auth/hooks/use-tenant-scope';

/**
 * Nhớ chi nhánh người dùng lọc GẦN NHẤT — CHỈ để dựng LINK menu, không bao giờ để đọc dữ liệu.
 * Bản native của `apps/web/src/features/branches/branch-memory.ts`.
 *
 * Màn vẫn chỉ đọc tham số route của chính nó; bộ nhớ này chỉ điền `branchId` vào href của ngăn
 * kéo, nên màn đích đúng ngay từ request đầu (ADR 0052 điều 5). Mỗi lần đứng trên một màn lọc
 * được, bộ nhớ bị ghi đè theo route — kể cả về "tất cả" — nên hai nguồn không lệch quá một bước.
 *
 * Khác web: chỉ sống trong BỘ NHỚ tiến trình, không ghi AsyncStorage. Khởi động lại app là về
 * "Tất cả" — đúng tinh thần "đường dẫn nói gì thấy nấy", và không có gì để dọn khỏi đĩa.
 *
 * Khoá theo GIAN HÀNG: một máy có thể đi qua nhiều gian hàng, chi nhánh của gian hàng vừa rời
 * không được mang sang gian hàng vừa vào. `forgetBranchMemory()` chạy ở đường kết thúc phiên.
 */
const memory = new Map<string, string | null>();
const listeners = new Set<() => void>();

export function rememberBranch(tenantId: string | null, branchId: string | null): void {
  if (!tenantId) return;
  if ((memory.get(tenantId) ?? null) === branchId) return;
  memory.set(tenantId, branchId);
  listeners.forEach((fn) => fn());
}

export function forgetBranchMemory(): void {
  if (memory.size === 0) return;
  memory.clear();
  listeners.forEach((fn) => fn());
}

function subscribe(fn: () => void): () => void {
  listeners.add(fn);
  return () => {
    listeners.delete(fn);
  };
}

/** Chi nhánh nhớ được của gian hàng ĐANG LÀM VIỆC. */
export function useRememberedBranch(): string | null {
  const { tenant } = useTenantScope();
  const tenantId = tenant?.id ?? null;
  const snapshot = useCallback(() => (tenantId ? (memory.get(tenantId) ?? null) : null), [tenantId]);
  return useSyncExternalStore(subscribe, snapshot, snapshot);
}

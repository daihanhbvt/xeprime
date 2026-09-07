import { useMemo } from 'react';
import {
  FEATURE_STATE,
  canWriteFeature,
  isFeatureVisible,
  type FeatureState,
  type PlanFeature,
} from '@xeprime/types';
import { useCurrentUser } from './use-auth';

export interface FeatureAccess {
  state: FeatureState;
  /** Có được GHI không — `read_only` trả `false`. Server mới là lớp chặn thật (ADR 0027 điều 4). */
  canWrite: boolean;
  /** Có hiện menu/màn không — `read_only` VẪN hiện, kèm băng gia hạn. */
  isVisible: boolean;
  /** ISO-8601 — băng "hết hạn" hiện ngày này. */
  planEndsAt: string | null;
}

/**
 * Trục NĂNG LỰC theo gói ở app (ADR 0027) — bản native của
 * `apps/web/src/hooks/use-feature.ts`. Đọc từ `/auth/me`, KHÔNG có query riêng — cùng lý do
 * web nêu: menu cần trạng thái này ở lần vẽ đầu tiên, một query thứ hai làm menu vẽ xong rồi
 * mới nhảy.
 *
 * ⚠️ **Thiếu `features` ⇒ mặc định NHÌN THẤY + GHI ĐƯỢC** — xem docblock gốc bên web về việc vì
 * sao mặc định phải là "cho qua": lớp chặn thật nằm ở guard backend.
 */
export function useFeature(feature: PlanFeature): FeatureAccess {
  const states = useFeatureStates();
  const planEndsAt = usePlanEndsAt();
  const state = states[feature] ?? FEATURE_STATE.ENABLED;
  return {
    state,
    canWrite: canWriteFeature(state),
    isVisible: isFeatureVisible(state),
    planEndsAt,
  };
}

/**
 * Toàn bộ bảng trạng thái — dùng cho menu (lọc một lượt nhiều mục) và cho màn "Gói của tôi".
 *
 * Trả object rỗng khi chưa có dữ liệu; caller đọc bằng `?? FEATURE_STATE.ENABLED` để giữ đúng
 * mặc định "cho qua" ở trên.
 */
export function useFeatureStates(): Partial<Record<PlanFeature, FeatureState>> {
  const { data: user } = useCurrentUser();
  const features = user?.tenant?.features;

  return useMemo(() => {
    if (!features) return {};
    return Object.fromEntries(features.map((f) => [f.feature, f.state])) as Partial<
      Record<PlanFeature, FeatureState>
    >;
  }, [features]);
}

/** Ngày hết hạn của gói hiện hành — `null` khi không có gói hoặc chưa nạp xong. */
export function usePlanEndsAt(): string | null {
  const { data: user } = useCurrentUser();
  return user?.tenant?.planEndsAt ?? null;
}

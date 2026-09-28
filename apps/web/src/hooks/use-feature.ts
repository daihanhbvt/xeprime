'use client';

import { useMemo } from 'react';
import {
  FEATURE_STATE,
  SUPPORT_HIDDEN_FEATURES,
  canWriteFeature,
  isFeatureVisible,
  type FeatureState,
  type PlanFeature,
} from '@xeprime/types';
import { useSupportSession } from '@/features/tenant-support/support-session';
import { useCurrentUser } from '@/hooks/use-current-user';

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
 * Trục NĂNG LỰC theo gói ở client (ADR 0027) — đọc từ `/auth/me`, KHÔNG có query riêng.
 *
 * Vì sao không query riêng: menu cần trạng thái này ở **lần vẽ đầu tiên**. Một query thứ hai
 * nghĩa là menu vẽ xong rồi mới nhảy — người dùng thấy năm mục hiện lên rồi biến mất.
 *
 * ⚠️ **Thiếu `features` ⇒ mặc định NHÌN THẤY + GHI ĐƯỢC.** Đó là cache `/auth/me` cũ từ trước
 * đợt này (hoặc backend cũ hơn web), và trong hai kiểu sai thì "cho qua nhầm" chỉ tốn một lần
 * 403 từ server — còn "khoá nhầm" thì lấy mất sổ sách của người đang dùng thật vì một cache
 * chưa kịp làm mới. Lớp chặn thật nằm ở guard backend, nên client không cần phòng thủ ở đây.
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
  // Phiên hỗ trợ (ADR 0050): cờ gói của GIAN HÀNG đang được hỗ trợ, không phải của người đăng nhập.
  const support = useSupportSession();
  const features = support ? support.context.tenant.features : user?.tenant?.features;

  const inSupport = support !== null;

  return useMemo(() => {
    const states = Object.fromEntries((features ?? []).map((f) => [f.feature, f.state])) as Partial<
      Record<PlanFeature, FeatureState>
    >;
    // Trong phiên: khu tiền/công nợ/hợp đồng không bao giờ mở, bất kể gói (ADR 0050 §10).
    if (inSupport) {
      for (const feature of SUPPORT_HIDDEN_FEATURES) states[feature] = FEATURE_STATE.HIDDEN;
    }
    return states;
  }, [features, inSupport]);
}

/** Ngày hết hạn của gói hiện hành — `null` khi không có gói hoặc chưa nạp xong. */
export function usePlanEndsAt(): string | null {
  const { data: user } = useCurrentUser();
  const support = useSupportSession();
  if (support) return support.context.tenant.planEndsAt ?? null;
  return user?.tenant?.planEndsAt ?? null;
}

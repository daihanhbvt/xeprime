'use client';

import { useTranslations } from 'next-intl';
import { useCallback } from 'react';

import { API_ERROR_CODE, PLAN_STATUS } from '@xeprime/types';
import { useErrorMessage } from '@/i18n/use-error-message';
import { getErrorCode, getErrorDetails } from '@/services/api-client';

import {
  PLAN_QUOTA_GATE_KIND,
  PLAN_QUOTA_GATE_SOURCE,
  planQuotaGateFrom,
  type PlanQuotaGate,
} from './plan-quota-gate';

export interface PlanQuotaGateCopy {
  title: string;
  cta: string;
}

/**
 * Câu chữ của một cổng hạn mức xe (`planQuotaGateFrom`) — tiêu đề nói loại xe + con số, nút nói
 * việc phải làm. Một chỗ cho mọi màn xe: dải lỗi có nút (`PlanQuotaGateAlert`) và toast (khi màn
 * không có chỗ đứng cho một dải).
 */
export function usePlanQuotaGateCopy(): (gate: PlanQuotaGate) => PlanQuotaGateCopy {
  const t = useTranslations('Subscription.quotaGate');
  return useCallback(
    (gate: PlanQuotaGate) => {
      const type = gate.vehicleType;
      if (gate.kind === PLAN_QUOTA_GATE_KIND.SCOPE_REQUIRED) {
        return { title: t(`scopeRequired.${type}`), cta: t(`buy.${type}`) };
      }
      const values = { used: gate.used, limit: gate.limit };
      switch (gate.source) {
        case PLAN_QUOTA_GATE_SOURCE.OWNER_LITE:
          return { title: t('ownerLite', values), cta: t('upgradeToShop') };
        case PLAN_QUOTA_GATE_SOURCE.SHARED_PLAN:
          return { title: t(`shared.${gate.point}`, values), cta: t('viewPlans') };
        case PLAN_QUOTA_GATE_SOURCE.LANE_PLAN:
          return { title: t(`lane.${gate.point}.${type}`, values), cta: t(`upgrade.${type}`) };
      }
    },
    [t],
  );
}

/**
 * `useErrorMessage` hiểu cổng hạn mức xe: lỗi `PLAN_SCOPE_REQUIRED` / `PLAN_LIMIT_REACHED` ra câu
 * nói đúng loại xe và con số ("Đã dùng hết 5/5 suất xe máy…"), mọi lỗi khác đi đường chung.
 *
 * Cho các chỗ chỉ có một toast hoặc một dòng chữ (sửa xe, bật lại trên chợ). Chỗ nào có chỗ đứng
 * cho một dải thì dựng `PlanQuotaGateAlert` để có thêm nút đi tiếp.
 */
export function usePlanAwareErrorMessage(): (error: unknown) => string {
  const errorMessage = useErrorMessage();
  const copyOf = usePlanQuotaGateCopy();
  return useCallback(
    (error: unknown) => {
      const gate = planQuotaGateFrom(error);
      return gate ? copyOf(gate).title : errorMessage(error);
    },
    [copyOf, errorMessage],
  );
}

/**
 * Lỗi của lượt MUA gói → câu cho người mua.
 *
 * Một ca cần câu riêng mà mã chung không nói được: bậc vừa bị chuyển về CHƯA MỞ BÁN giữa lúc người
 * dùng đang xem bảng giá — server trả `CONFLICT` kèm `details.planStatus = 'draft'`, và câu chung
 * "dữ liệu vừa thay đổi" không cho họ biết là phải chọn bậc khác. Mọi mã còn lại (kể cả
 * `SUBSCRIPTION_TERM_CONFLICT`, `PLAN_NOT_SELF_SERVE`) đi đường `useErrorMessage`.
 */
export function usePurchaseErrorMessage(): (error: unknown) => string {
  const t = useTranslations('Subscription.purchase');
  const errorMessage = useErrorMessage();
  return useCallback(
    (error: unknown) => {
      if (
        getErrorCode(error) === API_ERROR_CODE.CONFLICT &&
        getErrorDetails(error)?.planStatus === PLAN_STATUS.DRAFT
      ) {
        return t('planNotOnSale');
      }
      return errorMessage(error);
    },
    [errorMessage, t],
  );
}

'use client';

import { useTranslations } from 'next-intl';
import { useCallback } from 'react';
import { LIST_SEPARATOR } from '@xeprime/domain';
import type { OwnerCommissionTier } from '@xeprime/types';
import { commissionTierRanges } from '../form';

/**
 * Nhãn một khoảng ngày thuê của nấc hoa hồng: `Ngày 1–2` · `Ngày 5` · `Từ ngày 31`.
 * `toDay = null` là nấc cuối, kéo dài vô hạn.
 */
export function useTierRangeLabel(): (range: { fromDay: number; toDay: number | null }) => string {
  const t = useTranslations('FeePolicies.tiers');
  return useCallback(
    ({ fromDay, toDay }) => {
      if (toDay == null) return t('dayFrom', { from: fromDay });
      if (toDay === fromDay) return t('dayOne', { from: fromDay });
      return t('dayRange', { from: fromDay, to: toDay });
    },
    [t],
  );
}

/**
 * Cả bộ nấc thành MỘT dòng đọc được: `Ngày 1–2: 10% · Ngày 3–7: 7% · Từ ngày 31: 0%`.
 *
 * Dùng cho lời giải thích ngoài trang chính sách (bảng cộng ví chủ xe) — nấc đến từ snapshot của
 * chuyến, không phải từ chính sách đang hiệu lực. Bộ nấc rỗng ⇒ chuỗi rỗng, nơi gọi tự chọn câu
 * thay thế.
 */
export function useCommissionTierSummary(): (tiers: readonly OwnerCommissionTier[]) => string {
  const t = useTranslations('FeePolicies.tiers');
  const rangeLabel = useTierRangeLabel();
  return useCallback(
    (tiers) =>
      commissionTierRanges(tiers)
        .flatMap((range) =>
          range ? [t('item', { range: rangeLabel(range), percent: range.percent })] : [],
        )
        .join(LIST_SEPARATOR),
    [rangeLabel, t],
  );
}

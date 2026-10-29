import { useCallback } from 'react';
import { useTranslations } from 'use-intl';
import { LIST_SEPARATOR } from '@xeprime/domain';
import type { OwnerCommissionTier } from '@xeprime/types';

/**
 * Nấc hoa hồng thành chữ — bản native của `useTierRangeLabel` + `useCommissionTierSummary` +
 * `commissionTierRanges` bên web (`features/fee-policies/hooks/use-tier-range-label.ts`, `form.ts`).
 * App không có màn sửa chính sách phí, nên chỉ mang phần ĐỌC; đổi cách kể ở web thì đổi ở đây.
 */

interface CommissionTierRange {
  fromDay: number;
  /** Ngày cuối của nấc — `null` = nấc cuối, kéo dài vô hạn. */
  toDay: number | null;
  percent: number;
}

/** Dữ liệu chỉ có mốc BẮT ĐẦU; ngày cuối là ngày liền trước mốc của nấc kế tiếp. */
function commissionTierRanges(
  tiers: readonly { fromDay: number | null; percent: number | null }[],
): (CommissionTierRange | null)[] {
  return tiers.map((tier, index) => {
    if (tier.fromDay == null || tier.percent == null) return null;
    const next = tiers[index + 1];
    const toDay = next ? (next.fromDay == null ? null : next.fromDay - 1) : null;
    return {
      fromDay: tier.fromDay,
      toDay: toDay != null && toDay < tier.fromDay ? tier.fromDay : toDay,
      percent: tier.percent,
    };
  });
}

/** `Ngày 1–2` · `Ngày 5` · `Từ ngày 31`. */
function useTierRangeLabel(): (range: { fromDay: number; toDay: number | null }) => string {
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
 * Cả bộ nấc thành MỘT dòng: `Ngày 1–2: 10% · Ngày 3–7: 7% · Từ ngày 31: 0%`. Nấc đến từ snapshot
 * của chuyến; bộ nấc rỗng ⇒ chuỗi rỗng, nơi gọi tự chọn câu thay thế.
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

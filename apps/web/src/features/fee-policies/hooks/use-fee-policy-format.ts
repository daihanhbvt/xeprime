'use client';

import { useTranslations } from 'next-intl';
import { useMemo } from 'react';
import { LIST_SEPARATOR } from '@xeprime/domain';
import { VEHICLE_TYPE, type OwnerCommissionTier, type PerVehicleTypeAmount } from '@xeprime/types';
import { useAppFormat } from '@/i18n/use-app-format';

/** Cách đọc các con số của một phiên bản chính sách — dùng chung cho bảng danh sách và panel chi tiết. */
export function useFeePolicyFormat() {
  const t = useTranslations('FeePolicies.page');
  const fmt = useAppFormat();

  return useMemo(() => {
    const percent = (value: number) => t('percent', { value });
    return {
      percent,
      /** `50.000 ₫ / 30.000 ₫` — ô tô trước, xe máy sau. */
      perVehicle: (amounts: PerVehicleTypeAmount) =>
        t('pairValue', {
          car: fmt.money(amounts[VEHICLE_TYPE.CAR]),
          motorbike: fmt.money(amounts[VEHICLE_TYPE.MOTORBIKE]),
        }),
      /** `10% · 7% · 3% · 0%` — theo thứ tự nấc. */
      tierSummary: (tiers: readonly OwnerCommissionTier[]) =>
        tiers.map((tier) => percent(tier.percent)).join(LIST_SEPARATOR),
    };
  }, [fmt, t]);
}

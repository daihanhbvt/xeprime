'use client';

import { useTranslations } from 'next-intl';
import { useMemo } from 'react';
import { LIST_SEPARATOR } from '@xeprime/domain';
import {
  SERVICE_TYPE,
  VEHICLE_TYPE,
  taxRateTotalPercent,
  PLATFORM_FEE_BASIS,
  platformFeeBasisFor,
  type OwnerCommissionTier,
  type PerVehicleTypeAmount,
  type PerVehicleTypeFeeBasis,
  type VehicleType,
  type TaxRatesByServiceType,
} from '@xeprime/types';
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
      /** `50.000 ₫/chuyến` hoặc `50.000 ₫/ngày` — phí sàn của MỘT loại xe (ADR 0098). */
      platformFeeOf: (
        amounts: PerVehicleTypeAmount,
        basis: PerVehicleTypeFeeBasis | null | undefined,
        type: VehicleType,
      ) =>
        t(
          platformFeeBasisFor(basis, type) === PLATFORM_FEE_BASIS.PER_DAY
            ? 'platformFeePerDay'
            : 'platformFeePerTrip',
          { amount: fmt.money(amounts[type]) },
        ),
      /** `10% · 7% · 3% · 0%` — theo thứ tự nấc. */
      tierSummary: (tiers: readonly OwnerCommissionTier[]) =>
        tiers.map((tier) => percent(tier.percent)).join(LIST_SEPARATOR),
      /** `7% · 7% · 4,5%` — mức thuế TỔNG theo thứ tự tự lái · dài hạn · có tài xế (ADR 0068). */
      taxRatesSummary: (rates: TaxRatesByServiceType) =>
        t('taxRatesSummary', {
          selfDrive: percent(taxRateTotalPercent(rates[SERVICE_TYPE.SELF_DRIVE])),
          longTerm: percent(taxRateTotalPercent(rates[SERVICE_TYPE.LONG_TERM])),
          withDriver: percent(taxRateTotalPercent(rates[SERVICE_TYPE.WITH_DRIVER])),
        }),
    };
  }, [fmt, t]);
}

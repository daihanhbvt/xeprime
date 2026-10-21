import { useTranslations } from 'use-intl';
import {
  DRIVER_SURCHARGE_KIND_SPEC,
  DRIVER_SURCHARGE_THRESHOLD_KIND,
  DRIVER_SURCHARGE_UNIT,
  type DriverSurchargeKind,
  type PublicListingDetail,
} from '@xeprime/types';
import { useAppFormat } from '@/i18n/use-app-format';
import { useDomainLabel } from '@/i18n/domain';

export type DriverSurchargeRule = PublicListingDetail['driverSurchargeRules'][number];

/** Hậu tố đơn vị khi HIỂN THỊ một mức phụ phí — nhãn `Domain.driverSurchargeUnit` là nhãn ô nhập. */
const SURCHARGE_PER_KEY = {
  [DRIVER_SURCHARGE_UNIT.PER_HOUR]: 'perHour',
  [DRIVER_SURCHARGE_UNIT.PER_30_MINUTES]: 'per30Minutes',
  [DRIVER_SURCHARGE_UNIT.PER_KM]: 'perKm',
  [DRIVER_SURCHARGE_UNIT.PER_NIGHT]: 'perNight',
} as const;

/** "Phút trong ngày" (giờ VN) → "22:00". */
function minuteOfDayLabel(value: number): string {
  const minutes = ((Math.round(value) % 1440) + 1440) % 1440;
  const hh = String(Math.floor(minutes / 60)).padStart(2, '0');
  const mm = String(minutes % 60).padStart(2, '0');
  return `${hh}:${mm}`;
}

/**
 * Một dòng phụ phí tài xế — bản native của `useDriverSurchargeLine` web (#212), cùng khoá
 * `Listings.detail.policies.surcharge.*`. Dùng chung cho thẻ đặt xe và tab "Quy định chung".
 * Ngưỡng đọc theo LOẠI (`DRIVER_SURCHARGE_KIND_SPEC`), không in con số trần.
 */
export function useDriverSurchargeLine(): (rule: DriverSurchargeRule) => string {
  const t = useTranslations('Listings.detail.policies.surcharge');
  const fmt = useAppFormat();
  const domainLabel = useDomainLabel();

  return (rule) => {
    const perKey = SURCHARGE_PER_KEY[rule.unit as keyof typeof SURCHARGE_PER_KEY];
    const base = t('rule', {
      kind: domainLabel('driverSurchargeKind', rule.kind),
      amount: fmt.money(rule.amount),
      per: perKey ? t(`per.${perKey}`) : ` ${domainLabel('driverSurchargeUnit', rule.unit)}`,
    });
    const threshold = DRIVER_SURCHARGE_KIND_SPEC[rule.kind as DriverSurchargeKind]?.threshold;
    if (rule.thresholdValue == null || !threshold) return base;
    const value = Number(rule.thresholdValue);
    const thresholdText =
      threshold === DRIVER_SURCHARGE_THRESHOLD_KIND.MINUTE_OF_DAY
        ? t('threshold.minuteOfDay', { time: minuteOfDayLabel(value) })
        : threshold === DRIVER_SURCHARGE_THRESHOLD_KIND.GRACE_MINUTES
          ? t('threshold.graceMinutes', { count: value })
          : t('threshold.kmPerDay', { km: fmt.km(value) });
    return t('withThreshold', { rule: base, threshold: thresholdText });
  };
}

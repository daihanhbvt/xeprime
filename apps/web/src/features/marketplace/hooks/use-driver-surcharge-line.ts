'use client';

import { useTranslations } from 'next-intl';
import {
  DRIVER_SURCHARGE_KIND_SPEC,
  DRIVER_SURCHARGE_THRESHOLD_KIND,
  DRIVER_SURCHARGE_UNIT,
  type DriverSurchargeKind,
} from '@xeprime/types';
import { useAppFormat } from '@/i18n/use-app-format';
import { useDomainLabel } from '@/i18n/use-domain-label';
import type { PublicListingDetail } from '../types';

export type DriverSurchargeRule = PublicListingDetail['driverSurchargeRules'][number];

/**
 * Hậu tố đơn vị khi HIỂN THỊ một mức phụ phí ("30.000 ₫/30 phút"). Nhãn `Domain.driverSurchargeUnit`
 * ("đ / 30 phút") là nhãn của Ô NHẬP — ghép nó sau một số tiền đã có ký hiệu tiền tệ sẽ ra hai lần "đ".
 */
const SURCHARGE_PER_KEY = {
  [DRIVER_SURCHARGE_UNIT.PER_HOUR]: 'perHour',
  [DRIVER_SURCHARGE_UNIT.PER_30_MINUTES]: 'per30Minutes',
  [DRIVER_SURCHARGE_UNIT.PER_KM]: 'perKm',
  [DRIVER_SURCHARGE_UNIT.PER_NIGHT]: 'perNight',
} as const;

/** "Phút trong ngày" (giờ VN) → "22:00" — cách ngưỡng ngoài giờ được lưu (`MINUTE_OF_DAY`, vd 1320). */
function minuteOfDayLabel(value: number): string {
  const minutes = ((Math.round(value) % 1440) + 1440) % 1440;
  const hh = String(Math.floor(minutes / 60)).padStart(2, '0');
  const mm = String(minutes % 60).padStart(2, '0');
  return `${hh}:${mm}`;
}

/**
 * Một dòng phụ phí tài xế chủ xe đã công bố: "Phụ phí chờ đợi: 30.000 ₫/30 phút · tính sau 30 phút chờ
 * miễn phí". Dùng chung cho thẻ đặt xe và tab "Quy định chung" của trang chi tiết xe — hai nơi đọc
 * cùng `driverSurchargeRules` thì phải nói cùng một câu.
 *
 * Ngưỡng đọc đúng theo LOẠI của nó (`DRIVER_SURCHARGE_KIND_SPEC`): giờ trong ngày, số phút chờ miễn
 * phí, hay số km mỗi ngày — không in con số trần (1320 không phải thứ khách đọc được).
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

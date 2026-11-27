'use client';

import { useLocale, useTranslations } from 'next-intl';
import { PLATFORM_RENTAL_CONDITIONS } from '@xeprime/types';

import { useDomainLabel } from '@/i18n/use-domain-label';

/** Hình dạng luật chuẩn - hằng của nền tảng hoặc bản `rentalConditions` listing trả về. */
export interface RentalConditionsLike {
  identityDocuments: readonly string[];
  verifyMethods: readonly string[];
}

/**
 * Điều kiện cho thuê chuẩn của nền tảng (ADR 0112 điều 3) thành hai câu: giấy tờ ("CMND/CCCD còn hạn
 * hoặc Hộ chiếu còn hạn") và cách đối chiếu ("Đối chiếu qua VNeID hoặc bản gốc trực tiếp"). Ghép từ
 * MÃ của hằng - thêm một giấy tờ ở `PLATFORM_RENTAL_CONDITIONS` là câu tự đổi theo, ở mọi màn.
 */
export function useRentalConditionsText(
  conditions: RentalConditionsLike = PLATFORM_RENTAL_CONDITIONS,
): { documents: string; verify: string } {
  const locale = useLocale();
  const domainLabel = useDomainLabel();
  const t = useTranslations('Domain.rentalConditions');
  const or = new Intl.ListFormat(locale, { type: 'disjunction' });
  return {
    documents: or.format(
      conditions.identityDocuments.map((code) => domainLabel('rentalConditionDocument', code)),
    ),
    verify: t('verify', {
      methods: or.format(
        conditions.verifyMethods.map((code) => domainLabel('rentalConditionVerify', code)),
      ),
    }),
  };
}

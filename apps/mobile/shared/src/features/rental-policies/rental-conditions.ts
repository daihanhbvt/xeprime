import { useMemo } from 'react';
import { useLocale, useTranslations } from 'use-intl';
import { PLATFORM_RENTAL_CONDITIONS } from '@xeprime/types';
import { useDomainLabel } from '@/i18n/domain';

/** Hình dạng luật chuẩn - hằng của nền tảng hoặc bản `rentalConditions` listing trả về. */
export interface RentalConditionsLike {
  identityDocuments: readonly string[];
  verifyMethods: readonly string[];
}

/**
 * Điều kiện cho thuê chuẩn của nền tảng (ADR 0112 điều 3) thành hai câu: giấy tờ ("CMND/CCCD còn hạn
 * hoặc Hộ chiếu còn hạn") và cách đối chiếu ("Đối chiếu qua VNeID hoặc bản gốc trực tiếp"). Bản
 * native của web `useRentalConditionsText` - ghép từ MÃ của hằng.
 */
export function useRentalConditionsText(
  conditions: RentalConditionsLike = PLATFORM_RENTAL_CONDITIONS,
): { documents: string; verify: string } {
  const locale = useLocale();
  const domainLabel = useDomainLabel();
  const t = useTranslations('Domain.rentalConditions');
  return useMemo(() => {
    const join = (items: string[]) => {
      try {
        return new Intl.ListFormat(locale, { type: 'disjunction' }).format(items);
      } catch {
        // Hermes cũ thiếu `Intl.ListFormat` - ghép tay, cùng nghĩa "hoặc".
        return items.join(locale === 'en' ? ' or ' : ' hoặc ');
      }
    };
    return {
      documents: join(
        conditions.identityDocuments.map((code) => domainLabel('rentalConditionDocument', code)),
      ),
      verify: t('verify', {
        methods: join(
          conditions.verifyMethods.map((code) => domainLabel('rentalConditionVerify', code)),
        ),
      }),
    };
  }, [conditions, locale, domainLabel, t]);
}

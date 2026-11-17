'use client';

import { useTranslations } from 'next-intl';
import { useAppFormat } from '@/i18n/use-app-format';
import type { IncludedInsuranceServiceFee } from '@/lib/customer-price-view';
import { InfoHint } from './InfoHint';
import styles from './InsuranceFeeHint.module.css';

/**
 * Dấu ⓘ của dòng "Bảo hiểm vật chất xe" ở bề mặt khách khi dòng đó đã GỘP phí thu hộ bảo hiểm
 * (ADR 0091 điều 3): tách phí bảo hiểm và phí thu hộ thành hai số. Mọi số là của server — `customerFeeLines`
 * chỉ gộp, ở đây chỉ vẽ.
 */
export function InsuranceFeeHint({
  fee,
  className,
}: {
  fee: IncludedInsuranceServiceFee;
  className?: string;
}) {
  const t = useTranslations('Common.components.price.insuranceFee');
  const fmt = useAppFormat();
  return (
    <InfoHint
      className={className}
      label={t('hintLabel')}
      content={
        <span className={styles.lines}>
          <span>{t('premium', { amount: fmt.money(fee.premiumAmount) })}</span>
          <span>
            {fee.serviceFeePercent != null
              ? t('serviceFeePercent', {
                  percent: fee.serviceFeePercent,
                  amount: fmt.money(fee.serviceFeeAmount),
                })
              : t('serviceFee', { amount: fmt.money(fee.serviceFeeAmount) })}
          </span>
          <span>{t('refund')}</span>
        </span>
      }
    />
  );
}

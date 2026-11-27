'use client';

import { useTranslations } from 'next-intl';
import { isZeroMoney } from '@xeprime/domain';
import { DEPOSIT_STATUS } from '@xeprime/types';
import { useAppFormat } from '@/i18n/use-app-format';
import { useDomainLabel } from '@/i18n/use-domain-label';
import type { CustomerTripDetail } from '../types';
import styles from './TripDepositHeld.module.css';

type Finance = NonNullable<CustomerTripDetail['finance']>;

/**
 * Cọc khách ĐÃ giao cho chủ xe - số cọc tiền chủ xe ghi nhận (ròng, đã trừ phần trả lại trước
 * quyết toán) + từng món tài sản thế chấp đang giữ / đã trả. Đọc từ đơn, không tự tính.
 *
 * `withCash = false` khi thẻ chứa nó đã có dòng "Đã nhận cọc" riêng (thẻ tiền chuyến đang chạy).
 */
export function TripDepositHeld({
  finance,
  withCash = true,
}: {
  finance: Finance;
  withCash?: boolean;
}) {
  const t = useTranslations('Trips.depositHeld');
  const fmt = useAppFormat();
  const dl = useDomainLabel();
  const assets = finance.collaterals ?? [];
  const showCash = withCash && finance.depositStatus !== DEPOSIT_STATUS.NONE;
  if (!showCash && assets.length === 0) return null;

  return (
    <dl className={styles.list} aria-label={t('aria')}>
      {showCash ? (
        <div className={styles.row}>
          <dt>{t('cash')}</dt>
          <dd className={styles.value}>
            <span className={styles.amount}>
              {isZeroMoney(finance.depositReceived)
                ? t('cashNone')
                : fmt.money(finance.depositReceived)}
            </span>
          </dd>
        </div>
      ) : null}
      {assets.length > 0 ? (
        <div className={styles.row}>
          <dt>{t('assets')}</dt>
          <dd className={styles.value}>
            <ul className={styles.assets}>
              {assets.map((asset, index) => (
                <li key={`${asset.collateralType}-${index}`}>
                  {t(asset.returnedAt ? 'assetReturned' : 'assetHeld', {
                    type: dl('bookingCollateralType', asset.collateralType),
                  })}
                </li>
              ))}
            </ul>
          </dd>
        </div>
      ) : null}
    </dl>
  );
}

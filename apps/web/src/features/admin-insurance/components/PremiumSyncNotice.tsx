'use client';

import { Alert } from 'antd';
import { useTranslations } from 'next-intl';
import { INSURANCE_PREMIUM_SYNC_STATUS } from '@xeprime/types';
import { useAppFormat } from '@/i18n/use-app-format';
import type { InsuranceProduct } from '../types';
import styles from './InsuranceProductFormDialog.module.css';

/**
 * Trạng thái đồng bộ biểu phí với hãng (ADR 0106) — nói rõ vì sao ô biểu phí khoá hay mở:
 *  - đã đồng bộ ⇒ khoá, số là của hãng;
 *  - lần đồng bộ gần nhất hỏng ⇒ đang dùng biểu phí cũ, được sửa tay tới lần đồng bộ được kế tiếp;
 *  - lượt duyệt đơn thấy MIC báo khác ⇒ MIC có thể đã đổi giá, nhắc đồng bộ lại, được sửa tay;
 *  - chưa từng đồng bộ ⇒ biểu phí nhập tay.
 */
export function PremiumSyncNotice({ product }: { product: InsuranceProduct | null }) {
  const t = useTranslations('AdminInsurance.sync');
  const fmt = useAppFormat();
  if (!product) return null;

  if (product.premiumSyncStatus === INSURANCE_PREMIUM_SYNC_STATUS.SYNCED) {
    return (
      <Alert
        type="info"
        showIcon
        title={t('lockedTitle', { at: fmt.dateTime(product.premiumSyncedAt) })}
        description={t('lockedBody')}
      />
    );
  }
  const drifted = product.premiumSyncStatus === INSURANCE_PREMIUM_SYNC_STATUS.DRIFTED;
  if (drifted || product.premiumSyncStatus === INSURANCE_PREMIUM_SYNC_STATUS.FAILED) {
    const at = fmt.dateTime(product.premiumSyncStatusAt);
    return (
      <Alert
        type="warning"
        showIcon
        title={drifted ? t('driftedTitle', { at }) : t('failedTitle', { at })}
        description={
          <>
            <p className={styles.muted}>{drifted ? t('driftedBody') : t('failedBody')}</p>
            {product.premiumSyncError ? (
              <p className={styles.muted}>{t('reason', { reason: product.premiumSyncError })}</p>
            ) : null}
          </>
        }
      />
    );
  }
  return <p className={styles.muted}>{t('neverSynced')}</p>;
}

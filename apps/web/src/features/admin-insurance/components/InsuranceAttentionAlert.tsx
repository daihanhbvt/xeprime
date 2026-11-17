'use client';

import { Alert, Button } from 'antd';
import { useTranslations } from 'next-intl';
import { INSURANCE_PARTNER_STATUS, INSURANCE_POLICY_STATUS } from '@xeprime/types';
import { useAppFormat } from '@/i18n/use-app-format';
import type { InsuranceAttentionPage } from '../types';
import styles from './InsuranceCertificatesPanel.module.css';

/** Số dòng hiện ngay trong khối — phần còn lại nằm trong hàng đợi bên dưới. */
const SHOWN = 5;

/**
 * Hợp đồng cần người xử lý GẤP (ADR 0091 điều 7): quá 2 giờ sau giao xe mà chưa cấp, hoặc MIC hết
 * lượt tra mà vẫn chưa nhận ảnh. Mỗi dòng nói lý do + mốc, bấm là mở đúng hợp đồng ở panel làm việc.
 */
export function InsuranceAttentionAlert({
  page,
  onOpen,
}: {
  page: InsuranceAttentionPage;
  onOpen: (policyId: string) => void;
}) {
  const t = useTranslations('AdminInsurance.certificates.attention');
  const fmt = useAppFormat();

  const reason = (item: InsuranceAttentionPage['items'][number]) =>
    item.status === INSURANCE_POLICY_STATUS.ISSUED &&
    item.partnerStatus === INSURANCE_PARTNER_STATUS.PENDING_PHOTOS
      ? t('reasonPhotos')
      : item.handedOverAt
        ? t('reasonOverdue', { at: fmt.dateTime(item.handedOverAt) })
        : t('reasonOverdueNoTime');

  return (
    <Alert
      type="error"
      showIcon
      title={t('title', { count: page.total })}
      description={
        <ul className={styles.attentionList}>
          {page.items.slice(0, SHOWN).map((item) => (
            <li key={item.policyId} className={styles.attentionItem}>
              <Button type="link" size="small" onClick={() => onOpen(item.policyId)}>
                {item.bookingCode}
              </Button>
              {item.plateNumber ? <span className={styles.mono}>{item.plateNumber}</span> : null}
              <span className={styles.muted}>{reason(item)}</span>
            </li>
          ))}
          {page.total > SHOWN ? (
            <li className={styles.muted}>{t('more', { count: page.total - SHOWN })}</li>
          ) : null}
        </ul>
      }
    />
  );
}

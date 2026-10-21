'use client';

import { Alert, Button } from 'antd';
import { useTranslations } from 'next-intl';
import { InsuranceCoverageList } from '@/features/insurance/components/InsuranceCoverageList';
import { useBookingInsuranceCoverage } from '@/features/insurance/hooks';
import styles from './BookingInsuranceCertificatesPanel.module.css';

/**
 * Bảo hiểm của một đơn theo từng sản phẩm khách đã trả — phía gian hàng/chủ xe, CHỈ ĐỌC (ADR 0064).
 *
 * Gọi ngay khi đơn tồn tại (`enabled`), không chờ bàn giao: chủ xe cần biết TRƯỚC lúc giao xe
 * rằng khách đã mua bảo hiểm (chờ phát hành), và sau đó biết GCN đã cấp hay đang lỗi. Đơn không
 * mua bảo hiểm ⇒ không render gì.
 */
export function BookingInsuranceCertificatesPanel({
  bookingId,
  enabled,
}: {
  bookingId: string;
  enabled: boolean;
}) {
  const t = useTranslations('Insurance');
  const tCommon = useTranslations('Common');
  const { data, isError, refetch, isFetching } = useBookingInsuranceCoverage(bookingId, enabled);

  if (!enabled) return null;
  if (isError && !data) {
    return (
      <Alert
        className={styles.panel}
        type="warning"
        showIcon
        title={t('coverage.loadError')}
        action={
          <Button size="small" loading={isFetching} onClick={() => void refetch()}>
            {tCommon('actions.retry')}
          </Button>
        }
      />
    );
  }
  if (!data || data.length === 0) return null;
  return <InsuranceCoverageList coverage={data} className={styles.panel} />;
}

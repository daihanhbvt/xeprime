'use client';

import { WarningOutlined } from '@ant-design/icons';
import { Alert, App, Button } from 'antd';
import { useTranslations } from 'next-intl';
import { useState } from 'react';
import { ResponsiveDialog } from '@/components/overlay/ResponsiveDialog';
import { useNow } from '@/hooks/use-now';
import { useAppFormat } from '@/i18n/use-app-format';
import { useErrorMessage } from '@/i18n/use-error-message';
import { cx } from '@/lib/cx';
import { useReportTripNotReturned } from '../hooks';
import type { CustomerTripDetail } from '../types';
// Cùng hình khối với "Chưa nhận được xe" - hai lời báo đối xứng ở hai đầu chuyến.
import styles from './TripNotReceivedReport.module.css';

/**
 * "TÔI CHƯA TRẢ XE" (ADR 0105) - chủ xe xác nhận nhận lại xe SỚM hơn giờ trả, khách vẫn đang giữ xe.
 *
 * Luật do server quyết (`notReturnedReportUntil` chỉ có mặt khi người đi thuê còn báo được); client
 * chỉ canh đồng hồ để tự ẩn nút lúc đóng. Ba trạng thái:
 *  - `notReturnedReportOpen` ⇒ khối "đang xử lý";
 *  - còn trong hạn ⇒ thẻ giải thích + nút đỏ + hộp xác nhận;
 *  - còn lại ⇒ không vẽ gì. Cửa chặn thật là `POST /trips/:id/report-not-returned`.
 */
export function TripNotReturnedReport({
  trip,
  className,
}: {
  trip: CustomerTripDetail;
  className?: string;
}) {
  const t = useTranslations('Trips.notReturned');
  const fmt = useAppFormat();
  const now = useNow();
  const [open, setOpen] = useState(false);

  if (trip.notReturnedReportOpen) {
    return (
      <Alert
        className={className}
        type="warning"
        showIcon
        title={t('openTitle')}
        description={t('openBody')}
      />
    );
  }

  const until = trip.notReturnedReportUntil;
  if (!until || new Date(now).getTime() > new Date(until).getTime()) return null;

  return (
    <section className={cx(styles.card, className)}>
      <h2 className={styles.title}>
        <WarningOutlined aria-hidden="true" /> {t('title')}
      </h2>
      <p className={styles.lead}>
        {t('lead', {
          returnAt: trip.returnAt ? fmt.dateTime(trip.returnAt) : '',
          time: fmt.dateTime(until),
        })}
      </p>
      <Button danger block onClick={() => setOpen(true)}>
        {t('action')}
      </Button>
      {/* Dựng có điều kiện: mỗi lần mở là một instance mới, không mang lỗi lần trước sang. */}
      {open ? <ReportDialog tripId={trip.id} onClose={() => setOpen(false)} /> : null}
    </section>
  );
}

function ReportDialog({ tripId, onClose }: { tripId: string; onClose: () => void }) {
  const t = useTranslations('Trips.notReturned');
  const errorMessage = useErrorMessage();
  const { message } = App.useApp();
  const report = useReportTripNotReturned(tripId);

  return (
    <ResponsiveDialog
      title={t('dialogTitle')}
      open
      onClose={onClose}
      size="sm"
      okText={t('confirm')}
      cancelText={t('keep')}
      destructive
      confirmLoading={report.isPending}
      onOk={() => {
        if (report.isPending) return;
        report.mutate(undefined, {
          onSuccess: () => {
            message.success(t('success'));
            onClose();
          },
        });
      }}
    >
      <div className={styles.body}>
        <p className={styles.dialogLead}>{t('dialogBody')}</p>
        <p className={styles.dialogNote}>{t('dialogNote')}</p>
        {report.isError ? (
          <Alert type="error" showIcon role="alert" title={errorMessage(report.error)} />
        ) : null}
      </div>
    </ResponsiveDialog>
  );
}

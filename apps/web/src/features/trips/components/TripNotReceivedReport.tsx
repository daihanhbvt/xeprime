'use client';

import { WarningOutlined } from '@ant-design/icons';
import { Alert, App, Button } from 'antd';
import { useTranslations } from 'next-intl';
import { useState } from 'react';
import { TRIP_ROLE, notReceivedWindowPhase } from '@xeprime/types';
import { ResponsiveDialog } from '@/components/overlay/ResponsiveDialog';
import { useNow } from '@/hooks/use-now';
import { useAppFormat } from '@/i18n/use-app-format';
import { useErrorMessage } from '@/i18n/use-error-message';
import { cx } from '@/lib/cx';
import { useReportTripNotReceived } from '../hooks';
import type { CustomerTripDetail } from '../types';
import styles from './TripNotReceivedReport.module.css';

/**
 * "CHƯA NHẬN ĐƯỢC XE" — lớp 1 chống treo đơn (ADR 0066, đặc tả 02 §3.2).
 *
 * Ba trạng thái — luật do server quyết, client chỉ canh ĐỒNG HỒ để hiện/ẩn đúng mốc:
 *  - cờ `openDispute` ⇒ khối "đang xử lý" (người thuê: báo cáo của chính họ) hoặc "đang có khiếu
 *    nại" (chủ xe xem cùng chuyến). Có mặt cả sau khi tải lại trang, vì cờ nằm trong chi tiết chuyến;
 *  - server còn cho báo (`notReceivedReportUntil` có mặt) và đồng hồ đang trong
 *    `[pickupAt, pickupAt + 120′]` ⇒ nút đỏ + hộp xác nhận nói rõ hệ quả (giữ tiền, gọi hai bên);
 *  - còn lại ⇒ không vẽ gì. Cửa chặn thật vẫn là `POST /trips/:id/report-not-received`.
 */
export function TripNotReceivedReport({
  trip,
  className,
}: {
  trip: CustomerTripDetail;
  className?: string;
}) {
  const t = useTranslations('Trips.notReceived');
  const fmt = useAppFormat();
  const now = useNow();
  const [open, setOpen] = useState(false);

  if (trip.openDispute) {
    const host = trip.role === TRIP_ROLE.HOST;
    return (
      <Alert
        className={className}
        type="warning"
        showIcon
        title={host ? t('hostOpenTitle') : t('openTitle')}
        description={host ? t('hostOpenBody') : t('openBody')}
      />
    );
  }

  /*
   * `notReceivedReportUntil` có mặt = server nói chuyến CÒN báo được (đúng vai, đúng trạng thái,
   * chưa có báo cáo mở). Còn "đang trong cửa sổ hay chưa" thì tính theo ĐỒNG HỒ ở đây, không theo
   * `canReportNotReceived` lúc tải: trang mở trước giờ nhận xe không được hỏi lại server (hết
   * polling sau khi trả tiền giữ chỗ), nên phải tự hiện nút đúng `pickupAt` và tự ẩn lúc đóng.
   * Chỉ để HIỂN THỊ — `POST /trips/:id/report-not-received` vẫn là cửa chặn thật.
   */
  const until = trip.notReceivedReportUntil;
  const windowOpen =
    until != null &&
    trip.pickupAt != null &&
    notReceivedWindowPhase(new Date(trip.pickupAt), new Date(now)) === 'open';
  if (!windowOpen) return null;

  return (
    <section className={cx(styles.card, className)}>
      <h2 className={styles.title}>
        <WarningOutlined aria-hidden="true" /> {t('title')}
      </h2>
      <p className={styles.lead}>{t('lead', { time: fmt.dateTime(until) })}</p>
      <Button danger block onClick={() => setOpen(true)}>
        {t('action')}
      </Button>
      {/* Dựng có điều kiện: mỗi lần mở là một instance mới, không mang lỗi lần trước sang. */}
      {open ? <ReportDialog tripId={trip.id} onClose={() => setOpen(false)} /> : null}
    </section>
  );
}

function ReportDialog({ tripId, onClose }: { tripId: string; onClose: () => void }) {
  const t = useTranslations('Trips.notReceived');
  const errorMessage = useErrorMessage();
  const { message } = App.useApp();
  const report = useReportTripNotReceived(tripId);

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

'use client';

import { FileTextOutlined } from '@ant-design/icons';
import { Button, Skeleton } from 'antd';
import Link from 'next/link';
import { useTranslations } from 'next-intl';
import {
  PERMISSION,
  isPlatformTripBookingQueue,
  isPlatformTripRequestQueue,
  type PlatformTripQueue,
} from '@xeprime/types';
import { PermissionState } from '@/components/feedback/PermissionState';
import { ManagePageHeader } from '@/components/layout/ManagePageHeader';
import { ROUTES } from '@/constants/routes';
import { usePermissions } from '@/hooks/use-permissions';
import { useAppFormat } from '@/i18n/use-app-format';
import { useTripSummary } from '../hooks/use-admin-trips';
import { useTripQueue } from '../hooks/use-trip-queue';
import { BookingQueuePanel } from './BookingQueuePanel';
import { RequestQueuePanel } from './RequestQueuePanel';
import { TripQueueRail, useTripQueueLabel } from './TripQueueRail';
import { TripSummaryStrip } from './TripSummaryStrip';
import styles from './TripOpsView.module.css';

const CONTENT_TITLE_ID = 'xp-trip-queue-title';

/**
 * Màn VẬN HÀNH CHUYẾN của nền tảng (`admin.xeprime.vn/trips`).
 *
 * Người trực mở màn này để trả lời một câu: "chặng nào đang kẹt, và tôi phải gọi ai?". Dải trên
 * trả lời trước (hôm nay giao/nhận bao nhiêu, hàng đợi nào có dòng quá hạn); cột trái là bốn hàng
 * đợi theo đúng thứ tự một chuyến đi qua nền tảng; bên phải là hàng đợi đang chọn, dòng gấp nhất
 * ở trên cùng. Hàng đợi, từ khoá, trang và đơn đang mở nằm trên URL — F5 và gửi link đều giữ chỗ.
 *
 * Màn này KHÔNG chuyển trạng thái yêu cầu/đơn — đó là việc của gian hàng (ADR 0006). Hành động
 * duy nhất là nhắc tay chủ xe ở chặng chờ duyệt.
 */
export function TripOpsView() {
  const t = useTranslations('AdminTrips');
  const fmt = useAppFormat();
  const { has, isLoading: permissionsLoading } = usePermissions();
  const canView = has(PERMISSION.PLATFORM_BOOKING_VIEW);
  const { queue, selectQueue } = useTripQueue();
  const summary = useTripSummary({ enabled: canView });
  const queueLabel = useTripQueueLabel();

  if (permissionsLoading) {
    return (
      <div>
        <ManagePageHeader title={t('page.title')} />
        <Skeleton active paragraph={{ rows: 8 }} />
      </div>
    );
  }

  if (!canView) {
    return (
      <div>
        <ManagePageHeader title={t('page.title')} />
        <PermissionState />
      </div>
    );
  }

  // Panel chi tiết đơn (hai hàng đợi "trong chuyến") trượt ĐÈ lên phần phải, nội dung đứng yên.
  return (
    <div>
      <ManagePageHeader
        title={t('page.title')}
        subtitle={
          summary.data
            ? `${t('page.subtitle')} ${t('page.updatedAt', { time: fmt.time(summary.data.generatedAt) })}`
            : t('page.subtitle')
        }
        extra={
          <Link href={ROUTES.ADMIN.BOOKINGS}>
            <Button icon={<FileTextOutlined />}>{t('page.allBookings')}</Button>
          </Link>
        }
      />

      <TripSummaryStrip
        summary={summary.data}
        loading={summary.isLoading}
        error={summary.isError}
        activeQueue={queue}
        onSelect={selectQueue}
      />

      <div className={styles.body}>
        <TripQueueRail activeQueue={queue} summary={summary.data} onSelect={selectQueue} />

        <section className={styles.content} aria-labelledby={CONTENT_TITLE_ID}>
          <div className={styles.contentHead}>
            <h2 id={CONTENT_TITLE_ID} className={styles.contentTitle}>
              {queueLabel(queue)}
            </h2>
            {/* Mỗi hàng đợi nói rõ luật của chặng và việc người trực phải làm — không ai phải nhớ ADR. */}
            <p className={styles.intro}>{t(`intro.${queue}`)}</p>
          </div>
          {/* `key` = hàng đợi: đổi hàng đợi là dựng lại panel, không mang state cục bộ sang. */}
          <QueuePanel key={queue} queue={queue} />
        </section>
      </div>
    </div>
  );
}

function QueuePanel({ queue }: { queue: PlatformTripQueue }) {
  if (isPlatformTripRequestQueue(queue)) return <RequestQueuePanel queue={queue} />;
  if (isPlatformTripBookingQueue(queue)) return <BookingQueuePanel queue={queue} />;
  return null;
}

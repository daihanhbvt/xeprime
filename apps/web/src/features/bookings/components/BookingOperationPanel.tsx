'use client';

import { CheckCircleFilled } from '@ant-design/icons';
import { Alert, Button, Card, Skeleton } from 'antd';
import { BOOKING_STATUS, PERMISSION, type BookingStatus } from '@xeprime/types';
import { PermissionState } from '@/components/feedback/PermissionState';
import { usePermissions } from '@/hooks/use-permissions';
import { dayjs } from '@/lib/datetime';
import { useErrorMessage } from '@/i18n/use-error-message';
import { useHandoverContext } from '@/features/handovers/hooks';
import type { Handover } from '@/features/handovers/types';
import styles from './BookingOperationPanel.module.css';
import { useAppFormat } from '@/i18n/use-app-format';
import { SUPPORT_HIDDEN_AREA, useSupportHides } from '@/features/tenant-support/support-session';
import { useTranslations } from 'next-intl';

/**
 * Diễn biến chuyến đi trên chi tiết đơn (Wave 10) — chuyến đã đi tới đâu và chặng kế là gì.
 *
 * KHÔNG chứa nút xác nhận: hành động chính sống ở `BookingActionBar` (chân thẻ chi tiết) để cả
 * trang chỉ có đúng MỘT chỗ bấm. Hai nơi cùng đọc `useHandoverContext` nên dùng chung một
 * query — không lệch trạng thái, không tốn thêm request.
 *
 * Trong phiên hỗ trợ gian hàng (ADR 0050) khối chỉ KỂ diễn biến: không lời mời "Bấm …" và không
 * câu "thiếu quyền" — phiên không bao giờ xác nhận bàn giao, nên cả hai là chỉ dẫn cho một việc
 * không tồn tại ở đó.
 */
export function BookingOperationPanel({
  bookingId,
  bookingStatus,
}: {
  bookingId: string;
  bookingStatus: string;
}) {
  const t = useTranslations('Bookings.trip');
  const tActions = useTranslations('Common.actions');
  const errorMessage = useErrorMessage();
  const { has } = usePermissions();
  const inSupport = useSupportHides(SUPPORT_HIDDEN_AREA.HANDOVER_ACTIONS);
  const canView = has(PERMISSION.HANDOVER_VIEW);
  const canConfirm = has(PERMISSION.HANDOVER_CONFIRM);
  const { data, isLoading, isError, error, refetch } = useHandoverContext(bookingId, canView);

  if (!canView) {
    return (
      <PermissionState
        kind="forbidden"
        title={t('forbiddenTitle')}
        description={t('forbiddenBody')}
        missingPermissions={[PERMISSION.HANDOVER_VIEW]}
      />
    );
  }

  if (isLoading) {
    return (
      <Card title={t('title')} className={styles.card}>
        <Skeleton active paragraph={{ rows: 2 }} title={false} />
      </Card>
    );
  }

  if (isError || !data) {
    return (
      <Card title={t('title')} className={styles.card}>
        <Alert
          type="error"
          showIcon
          title={t('loadError')}
          description={errorMessage(error)}
          action={
            <Button size="small" onClick={() => void refetch()}>
              {tActions('retry')}
            </Button>
          }
        />
      </Card>
    );
  }

  const status = bookingStatus as BookingStatus;
  const pickup = data.pickup;
  const ret = data.return;
  const ended = status === BOOKING_STATUS.CANCELLED || status === BOOKING_STATUS.NO_SHOW;

  /** Chặng kế tiếp — CHỈ để kể trạng thái; nút bấm nằm ở thanh hành động chân thẻ chi tiết. */
  const next = !pickup?.confirmedAt
    ? t('notStarted')
    : !ret?.confirmedAt
      ? t('inProgress')
      : null;

  return (
    <Card title={t('title')} className={styles.card}>
      <div className={styles.body}>
        {pickup?.confirmedAt ? <HandoverBanner handover={pickup} kind="pickup" /> : null}
        {ret?.confirmedAt ? <HandoverBanner handover={ret} kind="return" /> : null}

        {ended ? (
          <Alert
            type="info"
            showIcon
            title={t('ended')}
          />
        ) : next && !inSupport ? (
          <p className={styles.next}>{next}</p>
        ) : null}

        {!ended && next && !canConfirm && !inSupport ? (
          <Alert
            type="info"
            showIcon
            title={t('confirmForbiddenTitle')}
            description={t('confirmForbiddenBody')}
          />
        ) : null}
      </div>
    </Card>
  );
}

/**
 * Băng tóm tắt sau khi đã xác nhận.
 *
 * Odo chỉ được NHẮC TỚI khi thật sự có số — thiếu thì nói thẳng là không ghi nhận, tuyệt đối
 * không dựng ra `0 km` (docs/design/14 §7).
 */
function HandoverBanner({ handover, kind }: { handover: Handover; kind: 'pickup' | 'return' }) {
  const t = useTranslations('Bookings.trip');
  const fmt = useAppFormat();

  const at = handover.occurredAt ?? handover.confirmedAt;
  const when = at ? fmt.rentalPoint(dayjs(at)) : '';
  const action = kind === 'pickup' ? t('pickedUp') : t('returned');
  const odo =
    handover.odometerKm != null
      ? t('odometerRecorded', { km: fmt.km(handover.odometerKm) })
      : t('noOdometer');

  return (
    <Alert
      type="success"
      showIcon
      icon={<CheckCircleFilled />}
      title={t('doneAt', { action, when })}
      description={
        <>
          <div>{odo}</div>
          {handover.notes ? <div className={styles.note}>{handover.notes}</div> : null}
        </>
      }
    />
  );
}

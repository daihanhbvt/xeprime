'use client';

import { CheckCircleFilled } from '@ant-design/icons';
import { Alert, Button, Card, Skeleton } from 'antd';
import { BOOKING_STATUS, PERMISSION, type BookingStatus } from '@xeprime/types';
import { PermissionState } from '@/components/feedback/PermissionState';
import { usePermissions } from '@/hooks/use-permissions';
import { dayjs } from '@/lib/datetime';
import { getErrorMessage } from '@/services/api-client';
import { useHandoverContext } from '@/features/handovers/hooks';
import type { Handover } from '@/features/handovers/types';
import styles from './BookingOperationPanel.module.css';
import { useAppFormat } from '@/i18n/use-app-format';

/**
 * Diễn biến chuyến đi trên chi tiết đơn (Wave 10) — chuyến đã đi tới đâu và chặng kế là gì.
 *
 * KHÔNG chứa nút xác nhận: hành động chính sống ở `BookingActionBar` (chân thẻ chi tiết) để cả
 * trang chỉ có đúng MỘT chỗ bấm. Hai nơi cùng đọc `useHandoverContext` nên dùng chung một
 * query — không lệch trạng thái, không tốn thêm request.
 */
export function BookingOperationPanel({
  bookingId,
  bookingStatus,
}: {
  bookingId: string;
  bookingStatus: string;
}) {
  const { has } = usePermissions();
  const canView = has(PERMISSION.HANDOVER_VIEW);
  const canConfirm = has(PERMISSION.HANDOVER_CONFIRM);
  const { data, isLoading, isError, error, refetch } = useHandoverContext(bookingId, canView);

  if (!canView) {
    return (
      <PermissionState
        kind="forbidden"
        title="Không có quyền xem bàn giao"
        description="Liên hệ quản trị viên nếu bạn cần theo dõi việc giao/nhận xe."
        missingPermissions={[PERMISSION.HANDOVER_VIEW]}
      />
    );
  }

  if (isLoading) {
    return (
      <Card title="Quản lý chuyến đi" className={styles.card}>
        <Skeleton active paragraph={{ rows: 2 }} title={false} />
      </Card>
    );
  }

  if (isError || !data) {
    return (
      <Card title="Quản lý chuyến đi" className={styles.card}>
        <Alert
          type="error"
          showIcon
          message="Không tải được thông tin bàn giao"
          description={getErrorMessage(error)}
          action={
            <Button size="small" onClick={() => void refetch()}>
              Thử lại
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
    ? 'Chuyến chưa bắt đầu. Bấm “Xác nhận đã giao xe” khi bàn giao xe cho khách.'
    : !ret?.confirmedAt
      ? 'Xe đang ở với khách. Bấm “Xác nhận đã nhận xe” khi khách trả xe.'
      : null;

  return (
    <Card title="Quản lý chuyến đi" className={styles.card}>
      <div className={styles.body}>
        {pickup?.confirmedAt ? <HandoverBanner handover={pickup} kind="pickup" /> : null}
        {ret?.confirmedAt ? <HandoverBanner handover={ret} kind="return" /> : null}

        {ended ? (
          <Alert
            type="info"
            showIcon
            message="Đơn đã kết thúc sớm — lịch sử bàn giao chỉ để xem lại."
          />
        ) : next ? (
          <p className={styles.next}>{next}</p>
        ) : null}

        {!ended && next && !canConfirm ? (
          <Alert
            type="info"
            showIcon
            message="Bạn không có quyền xác nhận bàn giao"
            description="Cần quyền handovers.confirm để chốt việc giao/nhận xe."
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
  const fmt = useAppFormat();

  const at = handover.occurredAt ?? handover.confirmedAt;
  const when = at ? fmt.rentalPoint(dayjs(at)) : '';
  const verb = kind === 'pickup' ? 'Đã giao xe' : 'Đã nhận lại xe';
  const odo =
    handover.odometerKm != null
      ? `Chỉ số Odo ghi nhận: ${fmt.km(handover.odometerKm)}.`
      : 'Không ghi nhận chỉ số Odo.';

  return (
    <Alert
      type="success"
      showIcon
      icon={<CheckCircleFilled />}
      message={`${verb} lúc ${when}`}
      description={
        <>
          <div>{odo}</div>
          {handover.notes ? <div className={styles.note}>{handover.notes}</div> : null}
        </>
      }
    />
  );
}

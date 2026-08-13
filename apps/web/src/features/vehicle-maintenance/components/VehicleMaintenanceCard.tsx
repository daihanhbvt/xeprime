'use client';

import { Alert, Card, Descriptions, Skeleton } from 'antd';
import Link from 'next/link';
import {
  MAINTENANCE_DUE_STATUS,
  MAINTENANCE_DUE_STATUS_META,
  PERMISSION,
  type MaintenanceDueStatus,
} from '@xeprime/types';
import { StatusTag } from '@/components/data-display/StatusTag';
import { VEHICLE_EDIT_TAB, vehicleTabPath } from '@/constants/routes';
import { formatDate } from '@/lib/datetime';
import { formatKm, formatRemainingKm, INSUFFICIENT_DATA_LABEL } from '@/lib/odometer';
import { usePermissions } from '@/hooks/use-permissions';
import { useMaintenanceProfile } from '../hooks';
import styles from './MaintenanceBoard.module.css';

/**
 * Thẻ "Bảo dưỡng & Số KM" trên Hồ sơ 360 của xe (Wave 6).
 *
 * Chỉ là CẢNH BÁO + đường dẫn sang tab làm việc — mọi thao tác nằm ở tab, đúng nguyên tắc
 * "không tạo màn hình độc lập cho từng việc" (docs §3.3). Thiếu quyền thì thẻ vắng mặt hẳn
 * thay vì hiện khung rỗng.
 */
export function VehicleMaintenanceCard({ vehicleId }: { vehicleId: string }) {
  const permissions = usePermissions();
  const canView = permissions.has(PERMISSION.VEHICLE_MAINTENANCE_VIEW);
  const profile = useMaintenanceProfile(vehicleId, canView);

  if (!canView) return null;

  const href = vehicleTabPath(vehicleId, VEHICLE_EDIT_TAB.MAINTENANCE);

  if (profile.isLoading) {
    return (
      <Card title="Bảo dưỡng & Số KM" className={styles.overviewCard}>
        <Skeleton active paragraph={{ rows: 2 }} />
      </Card>
    );
  }

  if (profile.isError || !profile.data) {
    return (
      <Card title="Bảo dưỡng & Số KM" className={styles.overviewCard}>
        <Alert type="error" showIcon message="Không tải được dữ liệu bảo dưỡng" />
      </Card>
    );
  }

  const data = profile.data;
  const dueStatus = data.dueStatus as MaintenanceDueStatus;

  return (
    <Card
      title="Bảo dưỡng & Số KM"
      className={styles.overviewCard}
      extra={<Link href={href}>Quản lý</Link>}
    >
      {dueStatus === MAINTENANCE_DUE_STATUS.OVERDUE ? (
        <Alert
          className={styles.overviewAlert}
          type="error"
          showIcon
          message={`Quá hạn bảo dưỡng — ${formatRemainingKm(data.remainingKm)}`}
        />
      ) : null}
      {dueStatus === MAINTENANCE_DUE_STATUS.DUE_SOON ? (
        <Alert
          className={styles.overviewAlert}
          type="warning"
          showIcon
          message={`Sắp đến hạn bảo dưỡng — ${formatRemainingKm(data.remainingKm)}`}
        />
      ) : null}
      {data.currentOdometerKm == null ? (
        <Alert
          className={styles.overviewAlert}
          type="warning"
          showIcon
          message="Chưa có dữ liệu KM"
          description="Nhập số KM hiện tại để theo dõi được lịch bảo dưỡng."
        />
      ) : null}

      <Descriptions
        column={1}
        size="small"
        items={[
          {
            key: 'current',
            label: 'KM hiện tại',
            children: formatKm(data.currentOdometerKm),
          },
          {
            key: 'next',
            label: 'Mốc tiếp theo',
            children:
              data.nextMaintenanceKm != null
                ? formatKm(data.nextMaintenanceKm)
                : INSUFFICIENT_DATA_LABEL,
          },
          {
            key: 'last',
            label: 'Thay nhớt gần nhất',
            children: data.lastServiceAt
              ? `${formatDate(`${data.lastServiceAt}T00:00:00.000Z`)}${
                  data.lastServiceKm != null ? ` · ${formatKm(data.lastServiceKm)}` : ''
                }`
              : INSUFFICIENT_DATA_LABEL,
          },
          {
            key: 'status',
            label: 'Tình trạng',
            children: <StatusTag value={dueStatus} meta={MAINTENANCE_DUE_STATUS_META} />,
          },
        ]}
      />
    </Card>
  );
}

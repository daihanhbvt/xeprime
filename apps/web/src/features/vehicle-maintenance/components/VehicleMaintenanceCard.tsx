'use client';

import { Alert, Card, Descriptions, Skeleton } from 'antd';
import Link from 'next/link';
import {
  MAINTENANCE_DUE_STATUS, MAINTENANCE_DUE_STATUS_META, PERMISSION, type MaintenanceDueStatus, } from '@xeprime/types';
import { StatusTag } from '@/components/data-display/StatusTag';
import { VEHICLE_EDIT_TAB, vehicleTabPath } from '@/constants/routes';
import { usePermissions } from '@/hooks/use-permissions';
import { useMaintenanceProfile } from '../hooks';
import styles from './MaintenanceBoard.module.css';
import { useAppFormat } from '@/i18n/use-app-format';
import { useTranslations } from 'next-intl';

/**
 * Thẻ "Bảo dưỡng & Số KM" trên Hồ sơ 360 của xe (Wave 6).
 *
 * Chỉ là CẢNH BÁO + đường dẫn sang tab làm việc — mọi thao tác nằm ở tab, đúng nguyên tắc
 * "không tạo màn hình độc lập cho từng việc" (docs §3.3). Thiếu quyền thì thẻ vắng mặt hẳn
 * thay vì hiện khung rỗng.
 */
export function VehicleMaintenanceCard({ vehicleId }: { vehicleId: string }) {
  const tCommon = useTranslations('Common');
  const t = useTranslations('Maintenance');
  const fmt = useAppFormat();

  const permissions = usePermissions();
  const canView = permissions.has(PERMISSION.VEHICLE_MAINTENANCE_VIEW);
  const profile = useMaintenanceProfile(vehicleId, canView);

  if (!canView) return null;

  const href = vehicleTabPath(vehicleId, VEHICLE_EDIT_TAB.MAINTENANCE);

  if (profile.isLoading) {
    return (
      <Card title={t('card.title')} className={styles.overviewCard}>
        <Skeleton active paragraph={{ rows: 2 }} />
      </Card>
    );
  }

  if (profile.isError || !profile.data) {
    return (
      <Card title={t('card.title')} className={styles.overviewCard}>
        <Alert type="error" showIcon message={t('card.loadError')} />
      </Card>
    );
  }

  const data = profile.data;
  const dueStatus = data.dueStatus as MaintenanceDueStatus;

  return (
    <Card
      title={t('card.title')}
      className={styles.overviewCard}
      extra={<Link href={href}>{t('card.manage')}</Link>}
    >
      {dueStatus === MAINTENANCE_DUE_STATUS.OVERDUE ? (
        <Alert
          className={styles.overviewAlert}
          type="error"
          showIcon
          message={t('card.overdue', { value: fmt.remainingKm(data.remainingKm) })}
        />
      ) : null}
      {dueStatus === MAINTENANCE_DUE_STATUS.DUE_SOON ? (
        <Alert
          className={styles.overviewAlert}
          type="warning"
          showIcon
          message={t('card.dueSoon', { value: fmt.remainingKm(data.remainingKm) })}
        />
      ) : null}
      {data.currentOdometerKm == null ? (
        <Alert
          className={styles.overviewAlert}
          type="warning"
          showIcon
          message={t('card.noOdometer')}
          description={t('card.noOdometerHint')}
        />
      ) : null}

      <Descriptions
        column={1}
        size="small"
        items={[
          {
            key: 'current',
            label: t('card.currentKm'),
            children: fmt.km(data.currentOdometerKm),
          },
          {
            key: 'next',
            label: t('card.nextDue'),
            children:
              data.nextMaintenanceKm != null
                ? fmt.km(data.nextMaintenanceKm)
                : tCommon('labels.insufficientData'),
          },
          {
            key: 'last',
            label: t('card.lastOilChange'),
            children: data.lastServiceAt
              ? `${fmt.date(`${data.lastServiceAt}T00:00:00.000Z`)}${
                  data.lastServiceKm != null ? ` · ${fmt.km(data.lastServiceKm)}` : ''
                }`
              : tCommon('labels.insufficientData'),
          },
          {
            key: 'status',
            label: t('card.condition'),
            children: <StatusTag value={dueStatus} meta={MAINTENANCE_DUE_STATUS_META} group="maintenanceDueStatus" />,
          },
        ]}
      />
    </Card>
  );
}

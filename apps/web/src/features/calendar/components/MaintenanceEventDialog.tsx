'use client';

import { App, Button, Descriptions, Skeleton } from 'antd';
import Link from 'next/link';
import { useState } from 'react';
import { useTranslations } from 'next-intl';
import {
  MAINTENANCE_STATUS,
  MAINTENANCE_STATUS_META,
  MAINTENANCE_TYPE,
  PERMISSION,
  type MaintenanceStatus,
} from '@xeprime/types';
import { StatusTag } from '@/components/data-display/StatusTag';
import { EmptyState } from '@/components/feedback/EmptyState';
import { PermissionState } from '@/components/feedback/PermissionState';
import { ResponsiveDialog } from '@/components/overlay/ResponsiveDialog';
import { VEHICLE_EDIT_TAB, vehicleTabPath } from '@/constants/routes';
import { usePermissions } from '@/hooks/use-permissions';
import { useDomainLabel } from '@/i18n/use-domain-label';
import { getErrorMessage } from '@/services/api-client';
import {
  cancelMaintenanceRecord,
  startMaintenanceRecord,
} from '@/features/vehicle-maintenance/api';
import { MaintenanceRecordDialog } from '@/features/vehicle-maintenance/components/MaintenanceRecordDialog';
import {
  useInvalidateMaintenance,
  useMaintenanceRecords,
} from '@/features/vehicle-maintenance/hooks';
import type { MaintenanceRecord } from '@/features/vehicle-maintenance/types';
import { formatDateTime } from '../utils/calendar-date.util';
import styles from './VehicleBlockDialog.module.css';
import { useAppFormat } from '@/i18n/use-app-format';

/**
 * Chi tiết lịch bảo dưỡng NGAY TRÊN LỊCH — bấm event `maintenance` mở ra đây.
 *
 * KHÔNG dựng lại state machine bảo dưỡng: mọi thao tác đi qua đúng API/dialog của Wave 6
 * (`start`/`cancel` + `MaintenanceRecordDialog` cho dời lịch/hoàn tất), nên nhả/đổi chỗ trên
 * `vehicle_occupancies` vẫn do MaintenanceService quyết trong transaction của nó (ADR 0006).
 *
 * Quyền: xem cần `vehicles.maintenance.view`; chi phí chỉ hiện với `view_cost`; hành động cần
 * `manage`. Chứng từ không mở từ đây — đường xem file nằm ở tab bảo dưỡng của xe.
 */
export function MaintenanceEventDialog({
  vehicleId,
  vehicleName,
  recordId,
  open,
  onClose,
}: {
  vehicleId: string;
  vehicleName: string;
  recordId: string;
  open: boolean;
  onClose: () => void;
}) {
  const t = useTranslations('Calendar');
  const tCommon = useTranslations('Common');
  const domainLabel = useDomainLabel();
  const fmt = useAppFormat();

  const { has } = usePermissions();
  const { message, modal } = App.useApp();
  const canView = has(PERMISSION.VEHICLE_MAINTENANCE_VIEW);
  const canManage = has(PERMISSION.VEHICLE_MAINTENANCE_MANAGE);
  const canViewCost = has(PERMISSION.VEHICLE_MAINTENANCE_COST_VIEW);
  const canViewFiles = has(PERMISSION.VEHICLE_MAINTENANCE_FILE_VIEW);

  const records = useMaintenanceRecords(open && canView ? vehicleId : undefined, canView);
  const invalidate = useInvalidateMaintenance(vehicleId);
  const [pendingAction, setPendingAction] = useState(false);
  const [recordDialog, setRecordDialog] = useState<{
    mode: 'edit' | 'complete';
    record: MaintenanceRecord;
  } | null>(null);

  const record = (records.data ?? []).find((r) => r.id === recordId) ?? null;
  const status = record?.status as MaintenanceStatus | undefined;

  async function start(current: MaintenanceRecord) {
    setPendingAction(true);
    try {
      await startMaintenanceRecord(vehicleId, current.id, current.rowVersion);
      invalidate();
      message.success(t('maintenance.started'));
    } catch (error) {
      message.error(getErrorMessage(error));
    } finally {
      setPendingAction(false);
    }
  }

  function confirmCancel(current: MaintenanceRecord) {
    modal.confirm({
      title: t('maintenance.confirmCancelTitle'),
      content: t('maintenance.confirmCancelContent'),
      okText: t('maintenance.confirmCancelOk'),
      okButtonProps: { danger: true },
      cancelText: t('maintenance.confirmCancelCancel'),
      onOk: async () => {
        try {
          await cancelMaintenanceRecord(vehicleId, current.id, current.rowVersion);
          invalidate();
          message.success(t('maintenance.canceled'));
          onClose();
        } catch (error) {
          message.error(getErrorMessage(error));
        }
      },
    });
  }

  const typeLabel = record
    ? record.type === MAINTENANCE_TYPE.OTHER && record.customTypeName
      ? record.customTypeName
      : domainLabel('maintenanceType', record.type)
    : '';

  return (
    <>
      <ResponsiveDialog
        open={open}
        onClose={onClose}
        size="md"
        title={t('maintenance.title')}
        footer={null}
      >
        {!canView ? (
          <PermissionState
            kind="forbidden"
            title={t('maintenance.forbiddenTitle')}
            missingPermissions={[PERMISSION.VEHICLE_MAINTENANCE_VIEW]}
          />
        ) : records.isLoading ? (
          <Skeleton active paragraph={{ rows: 4 }} />
        ) : !record ? (
          <EmptyState
            variant="empty"
            title={t('maintenance.notFoundTitle')}
            description={t('maintenance.notFoundDescription')}
            action={<Button onClick={onClose}>{tCommon('actions.close')}</Button>}
          />
        ) : (
          <>
            <Descriptions
              column={1}
              size="small"
              items={[
                { key: 'vehicle', label: t('maintenance.vehicle'), children: vehicleName },
                { key: 'type', label: t('maintenance.type'), children: typeLabel },
                ...(record.title
                  ? [{ key: 'title', label: t('maintenance.recordTitle'), children: record.title }]
                  : []),
                {
                  key: 'status',
                  label: t('maintenance.status'),
                  children: (
                    <StatusTag
                      value={record.status as MaintenanceStatus}
                      meta={MAINTENANCE_STATUS_META}
                      group="maintenanceStatus"
                    />
                  ),
                },
                {
                  key: 'period',
                  label: t('maintenance.plannedPeriod'),
                  children:
                    record.plannedStartAt && record.plannedEndAt
                      ? t('maintenance.plannedPeriodValue', {
                          start: formatDateTime(record.plannedStartAt),
                          end: formatDateTime(record.plannedEndAt),
                        })
                      : t('maintenance.notScheduled'),
                },
                ...(record.odometerKm != null
                  ? [
                      {
                        key: 'km',
                        label: t('maintenance.odometer'),
                        children: fmt.km(record.odometerKm),
                      },
                    ]
                  : []),
                ...(record.providerName
                  ? [
                      {
                        key: 'provider',
                        label: t('maintenance.provider'),
                        children: record.providerName,
                      },
                    ]
                  : []),
                // Chi phí là quyền RIÊNG — thiếu quyền thì dòng vắng mặt hẳn, không hiện 0đ giả.
                ...(canViewCost && record.cost != null
                  ? [
                      {
                        key: 'cost',
                        label: t('maintenance.cost'),
                        children: fmt.money(record.cost),
                      },
                    ]
                  : []),
                ...(record.notes
                  ? [{ key: 'notes', label: t('maintenance.notes'), children: record.notes }]
                  : []),
              ]}
            />

            <div className={styles.actions}>
              <Link href={vehicleTabPath(vehicleId, VEHICLE_EDIT_TAB.MAINTENANCE)}>
                <Button>{t('maintenance.openProfile')}</Button>
              </Link>
              {canManage && status === MAINTENANCE_STATUS.SCHEDULED ? (
                <>
                  <Button danger onClick={() => confirmCancel(record)}>
                    {t('maintenance.cancel')}
                  </Button>
                  <Button onClick={() => setRecordDialog({ mode: 'edit', record })}>
                    {t('maintenance.reschedule')}
                  </Button>
                  <Button type="primary" loading={pendingAction} onClick={() => void start(record)}>
                    {t('maintenance.start')}
                  </Button>
                </>
              ) : null}
              {canManage && status === MAINTENANCE_STATUS.IN_PROGRESS ? (
                <>
                  <Button danger onClick={() => confirmCancel(record)}>
                    {t('maintenance.cancel')}
                  </Button>
                  <Button
                    type="primary"
                    onClick={() => setRecordDialog({ mode: 'complete', record })}
                  >
                    {t('maintenance.complete')}
                  </Button>
                </>
              ) : null}
            </div>
          </>
        )}
      </ResponsiveDialog>

      {/* Dời lịch / hoàn tất dùng NGUYÊN dialog của Wave 6 — không dựng form thứ hai. */}
      <MaintenanceRecordDialog
        state={recordDialog}
        vehicleId={vehicleId}
        canViewFiles={canViewFiles}
        onClose={() => setRecordDialog(null)}
        onSaved={() => {
          setRecordDialog(null);
          invalidate();
        }}
      />
    </>
  );
}

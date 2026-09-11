import { useState } from 'react';
import { YStack } from 'tamagui';
import { useTranslations } from 'use-intl';
import {
  MAINTENANCE_STATUS,
  MAINTENANCE_STATUS_META,
  MAINTENANCE_TYPE,
  PERMISSION,
  type MaintenanceStatus,
} from '@xeprime/types';
import { AlertDialog } from '@/components/ui/AlertDialog';
import { BottomSheet } from '@/components/ui/BottomSheet';
import { Button } from '@/components/ui/Button';
import { DataRow } from '@/components/ui/DataRow';
import { SkeletonText } from '@/components/ui/Skeleton';
import { StatusBadge } from '@/components/ui/StatusBadge';
import { ScreenMessage } from '@/components/state/ScreenMessage';
import { useAppToast } from '@/components/feedback/use-app-toast';
import { usePermissions } from '@/features/auth/hooks/use-permissions';
import type { MaintenanceRecord } from '@/features/vehicle-maintenance/api';
import { MaintenanceRecordSheet } from '@/features/vehicle-maintenance/components/MaintenanceRecordSheet';
import {
  useMaintenanceRecords,
  useTransitionMaintenanceRecord,
} from '@/features/vehicle-maintenance/hooks/use-maintenance';
import { useAppFormat } from '@/i18n/use-app-format';
import { useDomainLabel } from '@/i18n/domain';
import { useErrorMessage } from '@/i18n/use-error-message';
import { space } from '@/theme/tokens';

/**
 * Chi tiết lịch bảo dưỡng NGAY TRÊN LỊCH — chạm event `maintenance` mở ra đây.
 *
 * KHÔNG dựng lại state machine bảo dưỡng: mọi thao tác đi qua đúng API/tấm trượt của module bảo
 * dưỡng (`useTransitionMaintenanceRecord` + `MaintenanceRecordSheet`), nên việc nhả/đổi chỗ trên
 * `vehicle_occupancies` vẫn do `MaintenanceService` quyết trong transaction của nó (ADR 0006).
 *
 * Quyền: xem cần `vehicles.maintenance.view`; chi phí chỉ hiện với `view_cost`; hành động cần
 * `manage` — cùng ba trục web dùng.
 */
export function MaintenanceEventSheet({
  vehicleId,
  vehicleName,
  recordId,
  open,
  onClose,
  onOpenProfile,
}: {
  vehicleId: string;
  vehicleName: string;
  recordId: string;
  open: boolean;
  onClose: () => void;
  onOpenProfile: (vehicleId: string) => void;
}) {
  const t = useTranslations('Calendar');
  const tCommon = useTranslations('Common.actions');
  const fmt = useAppFormat();
  const domainLabel = useDomainLabel();
  const toast = useAppToast();
  const errorMessage = useErrorMessage();
  const { has } = usePermissions();

  const canView = has(PERMISSION.VEHICLE_MAINTENANCE_VIEW);
  const canManage = has(PERMISSION.VEHICLE_MAINTENANCE_MANAGE);
  const canViewCost = has(PERMISSION.VEHICLE_MAINTENANCE_COST_VIEW);
  /* Quyền RIÊNG cho chứng từ — web truyền đúng cờ này xuống tấm trượt phiếu. */
  const canViewFiles = has(PERMISSION.VEHICLE_MAINTENANCE_FILE_VIEW);

  const records = useMaintenanceRecords(open && canView ? vehicleId : undefined, canView);
  const transition = useTransitionMaintenanceRecord(vehicleId);
  const [confirmingCancel, setConfirmingCancel] = useState(false);
  const [recordSheet, setRecordSheet] = useState<{
    mode: 'edit' | 'complete';
    record: MaintenanceRecord;
  } | null>(null);

  const record = (records.data ?? []).find((r) => r.id === recordId) ?? null;
  const status = record?.status as MaintenanceStatus | undefined;

  function start(current: MaintenanceRecord) {
    transition.mutate(
      { action: 'start', recordId: current.id, expectedRowVersion: current.rowVersion },
      {
        onSuccess: () => toast.showSuccess(t('maintenance.started')),
        onError: (error) => toast.showError(errorMessage(error)),
      },
    );
  }

  function cancel(current: MaintenanceRecord) {
    transition.mutate(
      { action: 'cancel', recordId: current.id, expectedRowVersion: current.rowVersion },
      {
        onSuccess: () => {
          setConfirmingCancel(false);
          toast.showSuccess(t('maintenance.canceled'));
          onClose();
        },
        onError: (error) => {
          setConfirmingCancel(false);
          toast.showError(errorMessage(error));
        },
      },
    );
  }

  const typeLabel = record
    ? record.type === MAINTENANCE_TYPE.OTHER && record.customTypeName
      ? record.customTypeName
      : domainLabel('maintenanceType', record.type)
    : '';

  const statusMeta = status ? MAINTENANCE_STATUS_META[status] : undefined;

  return (
    <>
      <BottomSheet
        open={open}
        onClose={onClose}
        title={t('maintenance.title')}
        footer={
          record ? (
            <>
              {canManage && status === MAINTENANCE_STATUS.SCHEDULED ? (
                <>
                  <Button
                    label={t('maintenance.start')}
                    icon="play-outline"
                    onPress={() => start(record)}
                    loading={transition.isPending}
                  />
                  <Button
                    label={t('maintenance.reschedule')}
                    icon="calendar-outline"
                    variant="secondary"
                    onPress={() => setRecordSheet({ mode: 'edit', record })}
                  />
                  <Button
                    label={t('maintenance.cancel')}
                    icon="trash-outline"
                    variant="danger"
                    onPress={() => setConfirmingCancel(true)}
                  />
                </>
              ) : null}
              {canManage && status === MAINTENANCE_STATUS.IN_PROGRESS ? (
                <>
                  <Button
                    label={t('maintenance.complete')}
                    icon="checkmark-done-outline"
                    onPress={() => setRecordSheet({ mode: 'complete', record })}
                  />
                  <Button
                    label={t('maintenance.cancel')}
                    icon="trash-outline"
                    variant="danger"
                    onPress={() => setConfirmingCancel(true)}
                  />
                </>
              ) : null}
              {/* Web bày lối này cho BẤT KỲ ai xem được phiếu, không riêng người quản lý. */}
              <Button
                label={t('maintenance.openProfile')}
                icon="document-text-outline"
                variant="ghost"
                onPress={() => onOpenProfile(vehicleId)}
              />
            </>
          ) : (
            <Button
              label={tCommon('close')}
              icon="close-outline"
              variant="secondary"
              onPress={onClose}
            />
          )
        }
      >
        {!canView ? (
          <ScreenMessage icon="lock-closed-outline" title={t('maintenance.forbiddenTitle')} />
        ) : records.isPending ? (
          <SkeletonText lines={4} />
        ) : !record ? (
          <ScreenMessage
            icon="construct-outline"
            title={t('maintenance.notFoundTitle')}
            description={t('maintenance.notFoundDescription')}
          />
        ) : (
          <YStack gap={space.xs}>
            <DataRow label={t('maintenance.vehicle')} value={vehicleName} />
            <DataRow label={t('maintenance.type')} value={typeLabel} />
            {record.title ? (
              <DataRow label={t('maintenance.recordTitle')} value={record.title} block />
            ) : null}
            {statusMeta ? (
              <DataRow
                label={t('maintenance.status')}
                value=""
                action={
                  <StatusBadge
                    label={domainLabel('maintenanceStatus', record.status, statusMeta.label)}
                    color={statusMeta.color}
                  />
                }
              />
            ) : null}
            <DataRow
              label={t('maintenance.plannedPeriod')}
              value={
                record.plannedStartAt && record.plannedEndAt
                  ? t('maintenance.plannedPeriodValue', {
                      start: fmt.dateTime(record.plannedStartAt),
                      end: fmt.dateTime(record.plannedEndAt),
                    })
                  : t('maintenance.notScheduled')
              }
              block
            />
            {record.odometerKm != null ? (
              <DataRow label={t('maintenance.odometer')} value={fmt.km(record.odometerKm)} />
            ) : null}
            {record.providerName ? (
              <DataRow label={t('maintenance.provider')} value={record.providerName} />
            ) : null}
            {/* Chi phí là quyền RIÊNG — thiếu quyền thì dòng vắng mặt hẳn, không hiện 0đ giả. */}
            {canViewCost && record.cost != null ? (
              <DataRow label={t('maintenance.cost')} value={fmt.money(record.cost)} />
            ) : null}
            {record.notes ? (
              <DataRow label={t('maintenance.notes')} value={record.notes} block />
            ) : null}
          </YStack>
        )}
      </BottomSheet>

      {record ? (
        <AlertDialog
          open={confirmingCancel}
          title={t('maintenance.confirmCancelTitle')}
          message={t('maintenance.confirmCancelContent')}
          confirmLabel={t('maintenance.confirmCancelOk')}
          cancelLabel={t('maintenance.confirmCancelCancel')}
          destructive
          loading={transition.isPending}
          onConfirm={() => cancel(record)}
          onCancel={() => setConfirmingCancel(false)}
        />
      ) : null}

      {/* Dời lịch / hoàn tất dùng NGUYÊN tấm trượt của module bảo dưỡng — không dựng form thứ hai. */}
      {recordSheet ? (
        <MaintenanceRecordSheet
          vehicleId={vehicleId}
          state={recordSheet}
          canViewFiles={canViewFiles}
          onClose={() => setRecordSheet(null)}
        />
      ) : null}
    </>
  );
}

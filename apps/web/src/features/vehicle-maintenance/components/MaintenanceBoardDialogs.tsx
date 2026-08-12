'use client';

import { Alert, Skeleton } from 'antd';
import { useMaintenanceProfile, useMaintenanceRecords } from '../hooks';
import type { MaintenanceBoardItem } from '../types';
import { MaintenanceRecordDialog } from './MaintenanceRecordDialog';
import { OdometerCorrectionDialog } from './OdometerCorrectionDialog';
import { PERMISSION } from '@xeprime/types';
import { usePermissions } from '@/hooks/use-permissions';
import { ResponsiveDialog } from '@/components/overlay/ResponsiveDialog';

interface BoardDialogState {
  kind: 'schedule' | 'complete' | 'odometer';
  row: MaintenanceBoardItem;
}

/**
 * Cầu nối giữa Trung tâm bảo dưỡng và các hộp thoại tác vụ đã có ở tab của xe.
 *
 * Dòng ở trung tâm chỉ mang bản TÓM TẮT (đủ để quyết định), còn form cần `rowVersion` và các
 * trường đầy đủ — nên khi mở hộp thoại mới tải hồ sơ/phiếu của đúng xe đó. Cố ý KHÔNG dựng
 * bản sao form thứ hai: một form bảo dưỡng, hai nơi gọi (docs §3.3).
 */
export function MaintenanceBoardDialogs({
  state,
  onClose,
  onSaved,
}: {
  state: BoardDialogState | null;
  onClose: () => void;
  onSaved: () => void;
}) {
  const permissions = usePermissions();
  const canViewFiles = permissions.has(PERMISSION.VEHICLE_MAINTENANCE_FILE_VIEW);
  const canDecrease = permissions.has(PERMISSION.VEHICLE_ODOMETER_DECREASE);
  const vehicleId = state?.row.vehicleId ?? '';

  const profile = useMaintenanceProfile(vehicleId, Boolean(state));
  const records = useMaintenanceRecords(vehicleId, state?.kind !== 'odometer' && Boolean(state));

  if (!state) return null;

  if (state.kind === 'odometer') {
    if (!profile.data) return <LoadingDialog onClose={onClose} loading={profile.isLoading} />;
    return (
      <OdometerCorrectionDialog
        open
        vehicleId={vehicleId}
        profile={profile.data}
        canDecrease={canDecrease}
        onClose={onClose}
        onSaved={onSaved}
      />
    );
  }

  const activeRecord = records.data?.find((row) => row.id === state.row.activeRecord?.id) ?? null;
  if (records.isLoading) return <LoadingDialog onClose={onClose} loading />;

  return (
    <MaintenanceRecordDialog
      state={
        activeRecord
          ? { mode: state.kind === 'complete' ? 'complete' : 'edit', record: activeRecord }
          : { mode: 'create' }
      }
      vehicleId={vehicleId}
      canViewFiles={canViewFiles}
      onClose={onClose}
      onSaved={onSaved}
    />
  );
}

/** Giữ khung hộp thoại trong lúc tải dữ liệu đầy đủ — không nháy mở/đóng. */
function LoadingDialog({ onClose, loading }: { onClose: () => void; loading: boolean }) {
  return (
    <ResponsiveDialog open title="Đang tải…" size="sm" onClose={onClose} footer={null}>
      {loading ? (
        <Skeleton active paragraph={{ rows: 3 }} />
      ) : (
        <Alert type="error" showIcon message="Không tải được dữ liệu bảo dưỡng của xe này" />
      )}
    </ResponsiveDialog>
  );
}

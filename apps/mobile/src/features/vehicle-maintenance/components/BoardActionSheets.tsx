import { Text, YStack } from 'tamagui';
import { useTranslations } from 'use-intl';
import type { MaintenanceBoardItem } from '@xeprime/api-client';
import { useAppToast } from '@/components/feedback/use-app-toast';
import { AlertDialog } from '@/components/ui/AlertDialog';
import { BottomSheet } from '@/components/ui/BottomSheet';
import { SkeletonText } from '@/components/ui/Skeleton';
import { useErrorMessage } from '@/i18n/use-error-message';
import { colors, fontSize, space } from '@/theme/tokens';
import { useMaintenanceProfile, useTransitionMaintenanceRecord } from '../hooks/use-maintenance';
import { MaintenanceRecordSheet } from './MaintenanceRecordSheet';
import { OdometerCorrectionSheet } from './OdometerCorrectionSheet';

/** Thao tác đang mở trên MỘT dòng của Trung tâm bảo dưỡng. */
export type BoardAction =
  | { kind: 'odometer'; row: MaintenanceBoardItem }
  | { kind: 'schedule'; row: MaintenanceBoardItem }
  | { kind: 'complete'; row: MaintenanceBoardItem }
  | { kind: 'cancel'; row: MaintenanceBoardItem };

/**
 * Cầu nối giữa Trung tâm bảo dưỡng và các tấm trượt tác vụ đã có ở tab của xe — bản native của
 * `MaintenanceBoardDialogs`.
 *
 * Cố ý KHÔNG dựng bản sao form thứ hai: một form bảo dưỡng, một form hiệu chỉnh KM, hai nơi gọi.
 *
 * Khác web đúng một chỗ và có lý do: web tải lại danh sách phiếu để tìm `activeRecord` đầy đủ,
 * còn ở đây `row.activeRecord` ĐÃ là `MaintenanceRecordDto` trọn vẹn — backend dựng nó bằng chính
 * `toRecordDto` với cùng `RECORD_INCLUDE` và cùng scope quyền. Thêm một vòng mạng nữa chỉ để lấy
 * lại thứ đang cầm trên tay là bắt người dùng nhìn khung "Đang tải…" cho một cú chạm đáng lẽ mở
 * ra ngay. Riêng hiệu chỉnh KM thì vẫn phải tải hồ sơ: dòng ở bảng không mang `rowVersion` của
 * XE, mà thiếu nó là mất khoá lạc quan.
 */
export function BoardActionSheets({
  action,
  onClose,
}: {
  action: BoardAction | null;
  onClose: () => void;
}) {
  const t = useTranslations('Maintenance');
  const toast = useAppToast();
  const errorMessage = useErrorMessage();

  const vehicleId = action?.row.vehicleId ?? '';
  const profile = useMaintenanceProfile(vehicleId, action?.kind === 'odometer');
  const transition = useTransitionMaintenanceRecord(vehicleId);

  if (!action) return null;

  const record = action.row.activeRecord ?? null;

  if (action.kind === 'cancel') {
    return (
      <AlertDialog
        open
        title={t('actions.cancelSchedule')}
        message={t('actions.cancelScheduleConfirm')}
        confirmLabel={t('actions.cancelSchedule')}
        destructive
        loading={transition.isPending}
        onCancel={onClose}
        onConfirm={() => {
          // Nút chỉ hiện khi có phiếu đang mở; giữ chốt này để không gửi một lệnh huỷ rỗng.
          if (!record) {
            onClose();
            return;
          }
          transition.mutate(
            { action: 'cancel', recordId: record.id, expectedRowVersion: record.rowVersion },
            {
              onSuccess: () => {
                onClose();
                toast.showSuccess(t('toast.canceled'));
              },
              onError: (error) => toast.showError(errorMessage(error)),
            },
          );
        }}
      />
    );
  }

  if (action.kind === 'odometer') {
    if (!profile.data) {
      return (
        <BottomSheet open onClose={onClose} title={t('dialog.loading')}>
          {profile.isPending ? (
            <SkeletonText lines={4} />
          ) : (
            <YStack py={space.sm}>
              <Text col={colors.danger} fos={fontSize.bodySm}>
                {t('dialog.loadError')}
              </Text>
            </YStack>
          )}
        </BottomSheet>
      );
    }
    return (
      <OdometerCorrectionSheet
        open
        vehicleId={vehicleId}
        currentOdometerKm={profile.data.currentOdometerKm ?? null}
        rowVersion={profile.data.rowVersion}
        onClose={onClose}
      />
    );
  }

  /*
   * "Lên lịch" trên một xe chưa có phiếu nào mở ra form TẠO — cùng luật với web: nhãn nút và chế
   * độ form cùng đọc một điều kiện `activeRecord`, nên không có cảnh bấm "Sửa lịch" mà hiện form
   * trống.
   */
  return (
    <MaintenanceRecordSheet
      vehicleId={vehicleId}
      state={
        record
          ? { mode: action.kind === 'complete' ? 'complete' : 'edit', record }
          : { mode: 'create' }
      }
      onClose={onClose}
    />
  );
}

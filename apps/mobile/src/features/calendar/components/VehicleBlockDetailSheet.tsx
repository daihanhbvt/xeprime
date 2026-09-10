import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { YStack } from 'tamagui';
import { useTranslations } from 'use-intl';
import { queryKeys } from '@xeprime/api-client';
import { PERMISSION, type VehicleBlockReason } from '@xeprime/types';
import { AlertDialog } from '@/components/ui/AlertDialog';
import { BottomSheet } from '@/components/ui/BottomSheet';
import { Button } from '@/components/ui/Button';
import { DataRow } from '@/components/ui/DataRow';
import { StatusBadge } from '@/components/ui/StatusBadge';
import { SkeletonText } from '@/components/ui/Skeleton';
import { ScreenMessage } from '@/components/state/ScreenMessage';
import { useAppToast } from '@/components/feedback/use-app-toast';
import { usePermissions } from '@/features/auth/hooks/use-permissions';
import { useAppFormat } from '@/i18n/use-app-format';
import { useDomainLabel } from '@/i18n/domain';
import { useErrorMessage } from '@/i18n/use-error-message';
import { space } from '@/theme/tokens';
import { calendarApi, type VehicleBlock } from '../api';
import { useDeleteVehicleBlock } from '../hooks/use-calendar-mutations';
import { blockReasonColor } from '../event-tone';

/**
 * Chi tiết một lịch khoá xe — chạm event `blocked_range` trên lịch mở ra đây.
 *
 * Sửa/Gỡ khoá chỉ hiện với `vehicles.block_schedule`; guard backend vẫn là lớp chặn thật (ẩn nút
 * chỉ là trang trí — ADR 0027 điều 4). Gỡ khoá là hành động PHÁ, nên luôn qua xác nhận.
 */
export function VehicleBlockDetailSheet({
  blockId,
  open,
  onClose,
  onEdit,
}: {
  blockId: string;
  open: boolean;
  onClose: () => void;
  /** Mở form sửa với dữ liệu khoá hiện tại — màn lịch đổi state, sheet này không tự dựng form. */
  onEdit: (block: VehicleBlock) => void;
}) {
  const t = useTranslations('Calendar');
  const tCommon = useTranslations('Common.actions');
  const fmt = useAppFormat();
  const domainLabel = useDomainLabel();
  const toast = useAppToast();
  const errorMessage = useErrorMessage();
  const { has } = usePermissions();

  const canManage = has(PERMISSION.VEHICLE_BLOCK_SCHEDULE);
  const remove = useDeleteVehicleBlock();
  const [confirming, setConfirming] = useState(false);

  const block = useQuery({
    queryKey: queryKeys.calendar.block(blockId),
    queryFn: () => calendarApi.block(blockId),
    enabled: open && Boolean(blockId),
    // 404 là CÂU TRẢ LỜI (khoá vừa bị gỡ ở thiết bị khác), không phải lỗi tạm — đừng thử lại.
    retry: false,
  });

  const data = block.data;

  function release(current: VehicleBlock) {
    remove.mutate(current.id, {
      onSuccess: () => {
        setConfirming(false);
        toast.showSuccess(t('blockDetail.released'));
        onClose();
      },
      onError: (error) => {
        setConfirming(false);
        toast.showError(errorMessage(error));
      },
    });
  }

  return (
    <>
      <BottomSheet
        open={open}
        onClose={onClose}
        title={t('blockDetail.title')}
        footer={
          <>
            {data && canManage ? (
              <>
                <Button
                  label={t('blockDetail.edit')}
                  icon="create-outline"
                  onPress={() => onEdit(data)}
                />
                <Button
                  label={t('blockDetail.release')}
                  icon="lock-open-outline"
                  variant="danger"
                  onPress={() => setConfirming(true)}
                  loading={remove.isPending}
                />
              </>
            ) : null}
            {/* Lối ĐÓNG luôn có, kể cả khi có quyền sửa — web cũng giữ nút này ở mọi trạng thái. */}
            <Button
              label={tCommon('close')}
              icon="close-outline"
              variant="secondary"
              onPress={onClose}
            />
          </>
        }
      >
        {block.isPending ? (
          <SkeletonText lines={4} />
        ) : block.isError || !data ? (
          <ScreenMessage
            icon="calendar-outline"
            title={t('blockDetail.notFoundTitle')}
            description={t('blockDetail.notFoundDescription')}
          />
        ) : (
          <YStack gap={space.xs}>
            <DataRow
              label={t('blockDetail.vehicle')}
              value={
                data.vehiclePlate ? `${data.vehicleName} · ${data.vehiclePlate}` : data.vehicleName
              }
            />
            <DataRow
              label={t('blockDetail.period')}
              value={t('blockDetail.periodValue', {
                start: fmt.dateTime(data.startAt),
                end: fmt.dateTime(data.endAt),
              })}
              block
            />
            <DataRow
              label={t('blockDetail.reason')}
              value=""
              action={
                <StatusBadge
                  label={domainLabel('vehicleBlockReason', data.reason)}
                  color={blockReasonColor(data.reason as VehicleBlockReason)}
                />
              }
            />
            {data.note ? <DataRow label={t('blockDetail.note')} value={data.note} block /> : null}
            <DataRow
              label={t('blockDetail.createdBy')}
              value={t('blockDetail.createdByValue', {
                name: data.createdByName ?? t('blockDetail.unknownAuthor'),
                at: fmt.dateTime(data.createdAt),
              })}
              block
            />
          </YStack>
        )}
      </BottomSheet>

      {data ? (
        <AlertDialog
          open={confirming}
          title={t('blockDetail.confirmReleaseTitle')}
          message={t('blockDetail.confirmReleaseContent', { vehicle: data.vehicleName })}
          confirmLabel={t('blockDetail.release')}
          cancelLabel={tCommon('cancel')}
          destructive
          loading={remove.isPending}
          onConfirm={() => release(data)}
          onCancel={() => setConfirming(false)}
        />
      ) : null}
    </>
  );
}

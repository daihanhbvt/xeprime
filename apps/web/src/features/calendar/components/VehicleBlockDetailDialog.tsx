'use client';

import { App, Button, Descriptions, Skeleton } from 'antd';
import { useQuery } from '@tanstack/react-query';
import { useTranslations } from 'next-intl';
import { PERMISSION, VEHICLE_BLOCK_REASON_META, type VehicleBlockReason } from '@xeprime/types';
import { StatusTag } from '@/components/data-display/StatusTag';
import { EmptyState } from '@/components/feedback/EmptyState';
import { ResponsiveDialog } from '@/components/overlay/ResponsiveDialog';
import { usePermissions } from '@/hooks/use-permissions';
import { getErrorMessage } from '@/services/api-client';
import { queryKeys } from '@/services/query-keys';
import { fetchVehicleBlock } from '../api';
import { useDeleteVehicleBlock } from '../hooks/use-calendar-mutations';
import { formatDateTime } from '../utils/calendar-date.util';
import type { VehicleBlock } from '../types/calendar.types';
import styles from './VehicleBlockDialog.module.css';

/**
 * Chi tiết một lịch khoá xe — bấm event `blocked_range` trên lịch mở ra đây.
 *
 * Sửa/Gỡ khoá chỉ hiện với `vehicles.block_schedule` (guard backend vẫn là lớp chặn thật).
 * Gỡ khoá là hành động phá — luôn qua xác nhận.
 */
export function VehicleBlockDetailDialog({
  blockId,
  open,
  onClose,
  onEdit,
}: {
  blockId: string;
  open: boolean;
  onClose: () => void;
  /** Mở dialog sửa với dữ liệu block hiện tại (scheduler đổi state). */
  onEdit: (block: VehicleBlock) => void;
}) {
  const { has } = usePermissions();
  const t = useTranslations('Calendar');
  const tCommon = useTranslations('Common');
  const { modal, message } = App.useApp();
  const canManage = has(PERMISSION.VEHICLE_BLOCK_SCHEDULE);
  const remove = useDeleteVehicleBlock();

  const block = useQuery({
    queryKey: queryKeys.calendar.block(blockId),
    queryFn: () => fetchVehicleBlock(blockId),
    enabled: open && Boolean(blockId),
    retry: false, // 404 là câu trả lời (block vừa bị gỡ), không phải lỗi tạm.
  });

  function confirmDelete(data: VehicleBlock) {
    modal.confirm({
      title: t('blockDetail.confirmReleaseTitle'),
      content: t('blockDetail.confirmReleaseContent', { vehicle: data.vehicleName }),
      okText: t('blockDetail.release'),
      okButtonProps: { danger: true },
      cancelText: tCommon('actions.cancel'),
      onOk: () =>
        remove.mutateAsync(data.id).then(
          () => {
            message.success(t('blockDetail.released'));
            onClose();
          },
          (error: unknown) => {
            message.error(getErrorMessage(error));
          },
        ),
    });
  }

  const data = block.data;

  return (
    <ResponsiveDialog
      open={open}
      onClose={onClose}
      size="md"
      title={t('blockDetail.title')}
      footer={null}
    >
      {block.isLoading ? (
        <Skeleton active paragraph={{ rows: 4 }} />
      ) : block.isError || !data ? (
        <EmptyState
          variant="empty"
          title={t('blockDetail.notFoundTitle')}
          description={t('blockDetail.notFoundDescription')}
          action={<Button onClick={onClose}>{tCommon('actions.close')}</Button>}
        />
      ) : (
        <>
          <Descriptions
            column={1}
            size="small"
            items={[
              {
                key: 'vehicle',
                label: t('blockDetail.vehicle'),
                children: data.vehiclePlate
                  ? `${data.vehicleName} · ${data.vehiclePlate}`
                  : data.vehicleName,
              },
              {
                key: 'period',
                label: t('blockDetail.period'),
                children: t('blockDetail.periodValue', {
                  start: formatDateTime(data.startAt),
                  end: formatDateTime(data.endAt),
                }),
              },
              {
                key: 'reason',
                label: t('blockDetail.reason'),
                children: (
                  <StatusTag
                    value={data.reason as VehicleBlockReason}
                    meta={VEHICLE_BLOCK_REASON_META}
                    group="vehicleBlockReason"
                  />
                ),
              },
              ...(data.note
                ? [{ key: 'note', label: t('blockDetail.note'), children: data.note }]
                : []),
              {
                key: 'created',
                label: t('blockDetail.createdBy'),
                children: t('blockDetail.createdByValue', {
                  name: data.createdByName ?? t('blockDetail.unknownAuthor'),
                  at: formatDateTime(data.createdAt),
                }),
              },
            ]}
          />
          <div className={styles.actions}>
            <Button onClick={onClose}>{tCommon('actions.close')}</Button>
            {canManage ? (
              <>
                <Button danger loading={remove.isPending} onClick={() => confirmDelete(data)}>
                  {t('blockDetail.release')}
                </Button>
                <Button type="primary" onClick={() => onEdit(data)}>
                  {t('blockDetail.edit')}
                </Button>
              </>
            ) : null}
          </div>
        </>
      )}
    </ResponsiveDialog>
  );
}

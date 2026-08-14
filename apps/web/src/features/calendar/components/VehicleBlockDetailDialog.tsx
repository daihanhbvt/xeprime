'use client';

import { App, Button, Descriptions, Skeleton } from 'antd';
import { useQuery } from '@tanstack/react-query';
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
      title: 'Gỡ khoá xe?',
      content: `${data.vehicleName} sẽ nhận đặt lại trong khoảng thời gian này.`,
      okText: 'Gỡ khoá',
      okButtonProps: { danger: true },
      cancelText: 'Huỷ',
      onOk: () =>
        remove.mutateAsync(data.id).then(
          () => {
            message.success('Đã gỡ khoá xe');
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
    <ResponsiveDialog open={open} onClose={onClose} size="md" title="Lịch khoá xe" footer={null}>
      {block.isLoading ? (
        <Skeleton active paragraph={{ rows: 4 }} />
      ) : block.isError || !data ? (
        <EmptyState
          variant="empty"
          title="Không tìm thấy lịch khoá"
          description="Lịch khoá có thể vừa được gỡ — lưới lịch sẽ tự cập nhật."
          action={<Button onClick={onClose}>Đóng</Button>}
        />
      ) : (
        <>
          <Descriptions
            column={1}
            size="small"
            items={[
              {
                key: 'vehicle',
                label: 'Xe',
                children: data.vehiclePlate
                  ? `${data.vehicleName} · ${data.vehiclePlate}`
                  : data.vehicleName,
              },
              {
                key: 'period',
                label: 'Thời gian',
                children: `${formatDateTime(data.startAt)} → ${formatDateTime(data.endAt)}`,
              },
              {
                key: 'reason',
                label: 'Lý do',
                children: (
                  <StatusTag
                    value={data.reason as VehicleBlockReason}
                    meta={VEHICLE_BLOCK_REASON_META}
                  />
                ),
              },
              ...(data.note ? [{ key: 'note', label: 'Ghi chú', children: data.note }] : []),
              {
                key: 'created',
                label: 'Tạo bởi',
                children: `${data.createdByName ?? 'Không rõ'} · ${formatDateTime(data.createdAt)}`,
              },
            ]}
          />
          <div className={styles.actions}>
            <Button onClick={onClose}>Đóng</Button>
            {canManage ? (
              <>
                <Button danger loading={remove.isPending} onClick={() => confirmDelete(data)}>
                  Gỡ khoá
                </Button>
                <Button type="primary" onClick={() => onEdit(data)}>
                  Sửa
                </Button>
              </>
            ) : null}
          </div>
        </>
      )}
    </ResponsiveDialog>
  );
}

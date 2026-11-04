'use client';

import { CalendarOutlined, DeleteOutlined, EditOutlined, ToolOutlined } from '@ant-design/icons';
import { App, Button, Popconfirm, Tooltip } from 'antd';
import { useTranslations } from 'next-intl';
import { SUPPORT_CAPABILITY } from '@xeprime/types';
import { useSupportSession } from '@/features/tenant-support/support-session';
import { useErrorMessage } from '@/i18n/use-error-message';
import { decorativeIcon } from '@/lib/decorative-icon';
import { useRepairVehicleListing } from '../hooks/use-vehicle-mutations';
import type { VehicleDetail } from '../types';
import styles from './Vehicle360Overview.module.css';

export interface VehicleDetailActionsProps {
  vehicle: VehicleDetail;
  canEdit: boolean;
  canDelete: boolean;
  deletePending: boolean;
  onEdit: () => void;
  onSchedule: () => void;
  onDelete: () => void;
}

/**
 * Hàng nút của Hồ sơ xe — Figma `23672:20509`: Xoá (nút biểu tượng viền đỏ) · Chỉnh sửa · Xem lịch
 * xe (nút chính vàng, CUỐI). Trang đặt hàng này ở vùng phải của tiêu đề; modal hồ sơ xe (không
 * có tiêu đề trang) đặt nó trên thẻ xe — cùng một component, nên hai nơi không lệch nút.
 *
 * Mỗi nút tự gác: Chỉnh sửa cần `vehicles.update`, Xoá cần `vehicles.delete` (vắng hẳn khi
 * thiếu — không vẽ nút cho hành động không mở). "Xem lịch xe" không gác: nó chỉ dẫn sang màn lịch,
 * nơi tự gác quyền của nó.
 *
 * "Đồng bộ lại hiển thị công khai" chỉ có trong phiên hỗ trợ (ADR 0050 §13) — thao tác SỬA CHỮA
 * của nền tảng khi bản ngoài chợ kẹt, không phải việc của chủ xe.
 */
export function VehicleDetailActions({
  vehicle,
  canEdit,
  canDelete,
  deletePending,
  onEdit,
  onSchedule,
  onDelete,
}: VehicleDetailActionsProps) {
  const t = useTranslations('Vehicles.overview');
  const tActions = useTranslations('Common.actions');
  const { message } = App.useApp();
  const errorMessage = useErrorMessage();
  const support = useSupportSession();
  const canRepairListing = support?.can(SUPPORT_CAPABILITY.LISTING_REPAIR) ?? false;
  const repairListing = useRepairVehicleListing(vehicle.id);

  function repair() {
    repairListing.mutate(undefined, {
      onSuccess: (result) =>
        message.success(result.changed ? t('repairListing.fixed') : t('repairListing.unchanged')),
      onError: (err) => message.error(errorMessage(err)),
    });
  }

  return (
    <div className={styles.actions}>
      {canDelete ? (
        <Popconfirm
          title={t('deleteConfirmTitle', { name: vehicle.name })}
          description={t('deleteConfirmBody')}
          okText={tActions('delete')}
          okButtonProps={{ danger: true, loading: deletePending }}
          cancelText={tActions('cancel')}
          onConfirm={onDelete}
          placement="bottomRight"
        >
          <Tooltip title={t('delete')}>
            <Button
              size="large"
              danger
              className={styles.deleteButton}
              icon={decorativeIcon(<DeleteOutlined />)}
              loading={deletePending}
              aria-label={t('deleteLabel', { name: vehicle.name })}
            />
          </Tooltip>
        </Popconfirm>
      ) : null}
      {canRepairListing ? (
        <Button
          size="large"
          className={styles.actionButton}
          icon={decorativeIcon(<ToolOutlined />)}
          loading={repairListing.isPending}
          onClick={repair}
        >
          {t('repairListing.action')}
        </Button>
      ) : null}
      {canEdit ? (
        <Button
          size="large"
          className={styles.actionButton}
          icon={decorativeIcon(<EditOutlined />)}
          onClick={onEdit}
        >
          {t('edit')}
        </Button>
      ) : null}
      <Button
        size="large"
        type="primary"
        className={styles.actionButton}
        icon={decorativeIcon(<CalendarOutlined />)}
        onClick={onSchedule}
      >
        {t('scheduleFull')}
      </Button>
    </div>
  );
}

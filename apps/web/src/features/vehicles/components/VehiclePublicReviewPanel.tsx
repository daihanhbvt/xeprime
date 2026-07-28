'use client';

import { CloudUploadOutlined } from '@ant-design/icons';
import { Alert, App, Button, Typography } from 'antd';
import {
  PERMISSION,
  VEHICLE_PUBLIC_STATUS,
  VEHICLE_PUBLIC_STATUS_SUBMITTABLE,
  type VehiclePublicStatus,
} from '@xeprime/types';
import { usePermissions } from '@/hooks/use-permissions';
import { getErrorMessage } from '@/services/api-client';
import { useSubmitVehiclePublic } from '../hooks/use-vehicle-mutations';
import type { VehicleDetail } from '../types';
import styles from './VehiclePublicReviewPanel.module.css';

/** Điều kiện tối thiểu để xe được lên chợ — khớp `missingPublicFields` ở backend. */
const REQUIRED: readonly { present: (v: VehicleDetail) => boolean; label: string }[] = [
  { present: (v) => Boolean(v.weekdayPrice), label: 'Giá thuê' },
  { present: (v) => Boolean(v.mainImageUrl), label: 'Ảnh đại diện' },
  { present: (v) => Boolean(v.plateNumber), label: 'Biển số' },
  { present: (v) => Boolean(v.description), label: 'Mô tả xe' },
];

interface StatusPresentation {
  type: 'success' | 'info' | 'warning' | 'error';
  message: string;
  description: string;
}

function presentationFor(
  status: VehiclePublicStatus,
  reason: string | null | undefined,
): StatusPresentation {
  switch (status) {
    case VEHICLE_PUBLIC_STATUS.PENDING_PUBLIC_REVIEW:
      return {
        type: 'info',
        message: 'Đang chờ nền tảng duyệt công khai',
        description: 'Xe sẽ hiển thị trên chợ ngay sau khi được duyệt.',
      };
    case VEHICLE_PUBLIC_STATUS.APPROVED_PUBLIC:
      return {
        type: 'success',
        message: 'Xe đang hiển thị trên chợ',
        description: 'Sửa giá, biển số, loại xe hoặc ảnh đại diện sẽ cần duyệt lại.',
      };
    case VEHICLE_PUBLIC_STATUS.REJECTED:
      return {
        type: 'error',
        message: 'Xe bị từ chối',
        description: reason ?? 'Hãy chỉnh sửa theo yêu cầu của nền tảng rồi gửi duyệt lại.',
      };
    case VEHICLE_PUBLIC_STATUS.NEEDS_REVISION:
      return {
        type: 'warning',
        message: 'Cần bổ sung thông tin',
        description: reason ?? 'Hãy bổ sung thông tin còn thiếu rồi gửi duyệt lại.',
      };
    case VEHICLE_PUBLIC_STATUS.HIDDEN:
      return {
        type: 'warning',
        message: 'Xe đang bị ẩn khỏi chợ',
        description: 'Gửi duyệt lại để xe hiển thị trở lại trên marketplace.',
      };
    default:
      return {
        type: 'info',
        message: 'Xe chưa đăng lên chợ',
        description: 'Gửi duyệt để khách hàng thấy xe trên marketplace.',
      };
  }
}

/**
 * Bảng trạng thái công khai của xe: hiện kết quả duyệt gần nhất (kèm lý do), danh sách điều kiện
 * còn thiếu, và nút gửi/gửi-lại duyệt. Gửi duyệt đi qua luồng nền tảng (ADR 0008) — client không
 * tự set `approved_public`.
 */
export function VehiclePublicReviewPanel({ vehicle }: { vehicle: VehicleDetail }) {
  const { message } = App.useApp();
  const { has } = usePermissions();
  const submit = useSubmitVehiclePublic(vehicle.id);

  const status = vehicle.publicStatus as VehiclePublicStatus;
  const canSubmit =
    has(PERMISSION.VEHICLE_SUBMIT_PUBLIC) && VEHICLE_PUBLIC_STATUS_SUBMITTABLE.includes(status);
  const missing = REQUIRED.filter((r) => !r.present(vehicle)).map((r) => r.label);
  const isResubmit = status !== VEHICLE_PUBLIC_STATUS.DRAFT;
  const presentation = presentationFor(status, vehicle.latestPublicReview?.reason);

  function onSubmit() {
    submit.mutate(undefined, {
      onSuccess: () => message.success('Đã gửi xe đi duyệt công khai'),
      onError: (err) => message.error(getErrorMessage(err)),
    });
  }

  return (
    <Alert
      className={styles.panel}
      type={presentation.type}
      showIcon
      message={presentation.message}
      description={
        <div className={styles.body}>
          <Typography.Text type="secondary">{presentation.description}</Typography.Text>
          {canSubmit && missing.length > 0 ? (
            <ul className={styles.missing}>
              {missing.map((label) => (
                <li key={label}>Thiếu: {label}</li>
              ))}
            </ul>
          ) : null}
        </div>
      }
      action={
        canSubmit ? (
          <Button
            type="primary"
            icon={<CloudUploadOutlined />}
            loading={submit.isPending}
            disabled={missing.length > 0}
            onClick={onSubmit}
          >
            {isResubmit ? 'Gửi duyệt lại' : 'Gửi duyệt công khai'}
          </Button>
        ) : null
      }
    />
  );
}

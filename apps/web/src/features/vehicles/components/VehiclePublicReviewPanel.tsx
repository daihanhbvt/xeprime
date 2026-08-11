'use client';

import { CheckCircleFilled, CloseCircleOutlined, CloudUploadOutlined } from '@ant-design/icons';
import { Alert, App, Button, Card } from 'antd';
import {
  PERMISSION,
  VEHICLE_PUBLIC_STATUS,
  VEHICLE_PUBLIC_STATUS_SUBMITTABLE,
  type VehiclePublicStatus,
} from '@xeprime/types';
import { usePermissions } from '@/hooks/use-permissions';
import { decorativeIcon } from '@/lib/decorative-icon';
import { getErrorMessage } from '@/services/api-client';
import { useSubmitVehiclePublic } from '../hooks/use-vehicle-mutations';
import { PUBLISH_REQUIREMENTS, publicStatusPresentation } from '../publication';
import type { VehicleDetail } from '../types';
import styles from './VehiclePublicReviewPanel.module.css';

/**
 * Tiến trình gửi duyệt công khai (Figma `65:240` cột phải · `65:3754` Requirements Checklist).
 *
 * Khác bản trước Wave 3A: hiện **toàn bộ** danh sách điều kiện kèm trạng thái đạt/chưa đạt, thay
 * vì chỉ liệt kê phần còn thiếu. Chủ xe cần thấy mình còn cách bao xa, không chỉ thấy lỗi.
 *
 * Gửi duyệt đi qua luồng nền tảng (ADR 0008) — client không tự set `approved_public`.
 */
export function VehiclePublicReviewPanel({ vehicle }: { vehicle: VehicleDetail }) {
  const { message } = App.useApp();
  const { has } = usePermissions();
  const submit = useSubmitVehiclePublic(vehicle.id);

  const status = vehicle.publicStatus as VehiclePublicStatus;
  const canSubmit =
    has(PERMISSION.VEHICLE_SUBMIT_PUBLIC) && VEHICLE_PUBLIC_STATUS_SUBMITTABLE.includes(status);
  const checklist = PUBLISH_REQUIREMENTS.map((item) => ({
    label: item.label,
    met: item.present(vehicle),
  }));
  const missingCount = checklist.filter((item) => !item.met).length;
  const isResubmit = status !== VEHICLE_PUBLIC_STATUS.DRAFT;
  const presentation = publicStatusPresentation(status, vehicle.latestPublicReview?.reason);

  function onSubmit() {
    submit.mutate(undefined, {
      onSuccess: () => message.success('Đã gửi xe đi duyệt công khai'),
      onError: (err) => message.error(getErrorMessage(err)),
    });
  }

  return (
    <Card title="Tiến trình gửi duyệt công khai" className={styles.panel}>
      <Alert
        type={presentation.type}
        showIcon
        message={presentation.message}
        description={presentation.description}
      />

      {canSubmit ? (
        <>
          <ul className={styles.checklist}>
            {checklist.map((item) => (
              <li key={item.label} className={item.met ? styles.met : styles.unmet}>
                {item.met
                  ? decorativeIcon(<CheckCircleFilled />)
                  : decorativeIcon(<CloseCircleOutlined />)}
                <span>{item.label}</span>
                {/* Chữ mang nghĩa, không phải icon — icon là trang trí nên trình đọc bỏ qua. */}
                <span className={styles.state}>{item.met ? 'Đã có' : 'Chưa có'}</span>
              </li>
            ))}
          </ul>

          <Button
            type="primary"
            block
            icon={<CloudUploadOutlined />}
            loading={submit.isPending}
            disabled={missingCount > 0}
            onClick={onSubmit}
          >
            {isResubmit ? 'Gửi duyệt lại' : 'Gửi duyệt công khai'}
          </Button>
        </>
      ) : null}
    </Card>
  );
}

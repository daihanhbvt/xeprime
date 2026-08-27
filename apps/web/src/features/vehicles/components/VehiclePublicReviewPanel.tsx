'use client';

import { CheckCircleFilled, CloseCircleOutlined, CloudUploadOutlined } from '@ant-design/icons';
import { Alert, App, Button, Card } from 'antd';
import { useTranslations } from 'next-intl';
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
import { usePublicationLabels } from '../hooks/use-publication-labels';
import { applicablePublishRequirements } from '../publication';
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
  const t = useTranslations('Vehicles.publish.panel');
  const { message } = App.useApp();
  const { requirement, statusCopy } = usePublicationLabels();
  const { has } = usePermissions();
  const submit = useSubmitVehiclePublic(vehicle.id);

  const status = vehicle.publicStatus as VehiclePublicStatus;
  const canSubmit =
    has(PERMISSION.VEHICLE_SUBMIT_PUBLIC) && VEHICLE_PUBLIC_STATUS_SUBMITTABLE.includes(status);
  // Checklist chỉ gồm điều kiện ÁP DỤNG với xe này — giá kiểm theo dịch vụ xe đăng (17/08).
  const checklist = applicablePublishRequirements(vehicle).map((item) => ({
    key: item.key,
    label: requirement(item.key),
    met: item.present(vehicle),
  }));
  const missingCount = checklist.filter((item) => !item.met).length;
  const isResubmit = status !== VEHICLE_PUBLIC_STATUS.DRAFT;
  const presentation = statusCopy(status, vehicle.latestPublicReview?.reason);

  function onSubmit() {
    submit.mutate(undefined, {
      onSuccess: () => message.success(t('submitted')),
      onError: (err) => message.error(getErrorMessage(err)),
    });
  }

  return (
    <Card title={t('title')} className={styles.panel}>
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
              <li key={item.key} className={item.met ? styles.met : styles.unmet}>
                {item.met
                  ? decorativeIcon(<CheckCircleFilled />)
                  : decorativeIcon(<CloseCircleOutlined />)}
                <span>{item.label}</span>
                {/* Chữ mang nghĩa, không phải icon — icon là trang trí nên trình đọc bỏ qua. */}
                <span className={styles.state}>{item.met ? t('met') : t('unmet')}</span>
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
            {isResubmit ? t('resubmit') : t('submit')}
          </Button>
        </>
      ) : null}
    </Card>
  );
}

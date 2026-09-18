'use client';

import { CheckCircleFilled, CloseCircleOutlined, CloudUploadOutlined } from '@ant-design/icons';
import { Alert, App, Button, Card } from 'antd';
import { useTranslations } from 'next-intl';
import { useState } from 'react';
import {
  PERMISSION,
  VEHICLE_PUBLIC_STATUS,
  VEHICLE_PUBLIC_STATUS_SUBMITTABLE,
  type VehiclePublicStatus,
} from '@xeprime/types';
import { ShopListingGateAlert } from '@/features/shop/components/ShopListingGateAlert';
import { packageShopListingGateFrom } from '@xeprime/domain';
import { usePermissions } from '@/hooks/use-permissions';
import { useErrorMessage } from '@/i18n/use-error-message';
import { decorativeIcon } from '@/lib/decorative-icon';
import { useSubmitVehiclePublic } from '../hooks/use-vehicle-mutations';
import { usePublicationLabels } from '../hooks/use-publication-labels';
import { publishChecklist } from '../publication';
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
  const errorMessage = useErrorMessage();
  const { requirement, statusCopy } = usePublicationLabels();
  const { has } = usePermissions();
  const submit = useSubmitVehiclePublic(vehicle.id);
  /**
   * Hồ sơ GIAN HÀNG còn thiếu gì (ADR 0040) — `null` = không phải lỗi đó.
   *
   * Giữ trong state thay vì đọc từ `submit.error`: dải này phải ĐỨNG LẠI cho tới khi người dùng
   * sửa xong (họ sẽ mở tab khác để tải logo rồi quay về), còn `submit.error` biến mất ngay khi
   * mutation được gọi lại. Và nó phải tự dọn khi lượt gửi kế tiếp đi qua được — nếu không, một
   * dải nói về logo còn đứng đó sau khi logo đã có.
   */
  const [listingGate, setListingGate] = useState<ReturnType<
    typeof packageShopListingGateFrom
  > | null>(null);

  const status = vehicle.publicStatus as VehiclePublicStatus;
  const canSubmit =
    has(PERMISSION.VEHICLE_SUBMIT_PUBLIC) && VEHICLE_PUBLIC_STATUS_SUBMITTABLE.includes(status);
  // Checklist chỉ gồm điều kiện ÁP DỤNG với xe này — giá kiểm theo dịch vụ xe đăng (17/08).
  const checklist = publishChecklist(vehicle).map((item) => ({
    ...item,
    label: requirement(item.key),
  }));
  const missingCount = checklist.filter((item) => !item.met).length;
  const isResubmit = status !== VEHICLE_PUBLIC_STATUS.DRAFT;
  const presentation = statusCopy(status, vehicle.latestPublicReview?.reason);

  function onSubmit() {
    submit.mutate(undefined, {
      onSuccess: () => {
        setListingGate(null);
        message.success(t('submitted'));
      },
      onError: (err) => {
        /*
         * Cổng hồ sơ gian hàng có một dải RIÊNG vì nó cần một cái link (xem
         * `ShopListingGateAlert`). Mọi lỗi khác vẫn là một toast — chúng không có lối đi tiếp
         * nào ngoài "thử lại".
         */
        const gate = packageShopListingGateFrom(err);
        setListingGate(gate);
        if (!gate) message.error(errorMessage(err));
      },
    });
  }

  return (
    <Card title={t('title')} className={styles.panel}>
      <Alert
        type={presentation.type}
        showIcon
        title={presentation.message}
        description={presentation.description}
      />

      {listingGate ? <ShopListingGateAlert missing={listingGate} /> : null}

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

'use client';

import { CheckOutlined, CarOutlined } from '@ant-design/icons';
import { Button, Tag } from 'antd';
import Link from 'next/link';
import {
  VEHICLE_OPERATION_STATUS_META,
  VEHICLE_SOURCE_TYPE_LABEL,
  type VehicleOperationStatus,
  type VehicleSourceType,
} from '@xeprime/types';
import { VEHICLE_EDIT_TAB, vehiclePath, vehicleTabPath } from '@/constants/routes';
import type { VehicleDetail } from '../types';
import { PreviewImage } from '@/components/data-display/PreviewImage';
import styles from './VehicleCreateSuccess.module.css';

interface VehicleCreateSuccessProps {
  vehicle: VehicleDetail;
  submittedForReview: boolean;
  onCreateAnother: () => void;
}

export function VehicleCreateSuccess({
  vehicle,
  submittedForReview,
  onCreateAnother,
}: VehicleCreateSuccessProps) {
  const operation =
    VEHICLE_OPERATION_STATUS_META[vehicle.operationStatus as VehicleOperationStatus];
  const sourceLabel = VEHICLE_SOURCE_TYPE_LABEL[vehicle.sourceType as VehicleSourceType];

  return (
    <main className={styles.root} aria-labelledby="create-success-title">
      <div className={styles.successIcon} aria-hidden="true">
        <CheckOutlined />
      </div>
      <h1 id="create-success-title">Tạo xe thành công!</h1>
      <p>
        {submittedForReview
          ? 'Hồ sơ xe đã được lưu và gửi đi duyệt công khai.'
          : 'Phương tiện đã được lưu vào cơ sở dữ liệu nội bộ ở trạng thái lưu nháp.'}
      </p>

      <section className={styles.vehicleCard} aria-label="Xe vừa tạo">
        <div className={styles.thumb}>
          {vehicle.mainImageUrl ? (
            <PreviewImage src={vehicle.mainImageUrl} alt="" />
          ) : (
            <CarOutlined aria-hidden="true" />
          )}
        </div>
        <div className={styles.vehicleInfo}>
          <strong>{vehicle.name}</strong>
          <span>
            {[vehicle.plateNumber, vehicle.code, sourceLabel].filter(Boolean).join(' · ')}
          </span>
        </div>
        <Tag color={operation?.color}>{operation?.label ?? vehicle.operationStatus}</Tag>
      </section>

      <section className={styles.checklist} aria-labelledby="complete-profile-title">
        <h2 id="complete-profile-title">Hoàn thiện hồ sơ xe</h2>
        <p>Cân bổ sung các thông tin cốt lõi trước khi đăng công khai lên sàn dịch vụ.</p>
        <ul>
          <li>
            <span>Kiểm tra thông tin và thông số xe</span>
            <Link href={vehicleTabPath(vehicle.id, VEHICLE_EDIT_TAB.INFORMATION)}>
              Tab Thông tin →
            </Link>
          </li>
          <li>
            <span>Thêm ảnh thực tế và tiện ích</span>
            <Link href={vehicleTabPath(vehicle.id, VEHICLE_EDIT_TAB.MEDIA)}>Tab Hình ảnh →</Link>
          </li>
          <li>
            <span>Kiểm tra giá, cọc và chính sách thuê</span>
            <Link href={vehiclePath.pricing(vehicle.id)}>Giá & chính sách →</Link>
          </li>
          <li>
            <span>Hoàn thiện thông tin nguồn xe & tài chính</span>
            <Link href={vehicleTabPath(vehicle.id, VEHICLE_EDIT_TAB.SOURCE)}>Tab Nguồn xe →</Link>
          </li>
          <li className={styles.futureItem}>
            <span>Giấy tờ xe và bảo dưỡng</span>
            <span>Sẽ mở ở các wave tiếp theo</span>
          </li>
        </ul>
      </section>

      <div className={styles.actions}>
        <Link href={vehiclePath.detail(vehicle.id)}>
          <Button type="primary" size="large">
            Xem hồ sơ xe chi tiết
          </Button>
        </Link>
        <Button size="large" onClick={onCreateAnother}>
          Thêm xe khác
        </Button>
      </div>
    </main>
  );
}

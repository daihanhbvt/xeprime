'use client';

import { Button } from 'antd';
import {
  VEHICLE_OPERATION_STATUS_META,
  VEHICLE_SOURCE_TYPE_LABEL,
  type VehicleOperationStatus,
  type VehicleSourceType,
} from '@xeprime/types';
import type { VehicleFormValues } from '@xeprime/validators';
import { formatMoneyVnd } from '@/lib/money';
import { useCatalogLabels, type CatalogLabels } from '@/features/catalog/use-catalog';
import { serviceTypeLabel, vehicleTypeLabel } from '../constants';
import styles from './VehicleReviewStep.module.css';

/** Nhãn trạng thái vận hành lấy từ META dùng chung — không khai lại bảng ánh xạ thứ hai. */
const operationStatusLabel = (value: string): string =>
  VEHICLE_OPERATION_STATUS_META[value as VehicleOperationStatus]?.label ?? value;

const EMPTY = '—';

function text(value: string | number | null | undefined): string {
  return value == null || value === '' ? EMPTY : String(value);
}

function money(value: number | null | undefined): string {
  return value == null ? EMPTY : formatMoneyVnd(String(value));
}

interface ReviewGroup {
  key: string;
  title: string;
  /** Bước cần quay lại khi bấm "Chỉnh sửa". */
  step: number;
  items: { label: string; value: string }[];
}

function groupsOf(values: VehicleFormValues, labels: CatalogLabels): ReviewGroup[] {
  const gallery = values.images?.length ?? 0;
  const features = values.features?.length ?? 0;

  return [
    {
      key: 'basic',
      title: 'Thông tin cơ bản',
      step: 0,
      items: [
        { label: 'Tên xe', value: text(values.name) },
        { label: 'Mã xe', value: text(values.code) },
        {
          label: 'Phân loại / Dịch vụ',
          value: `${vehicleTypeLabel(values.vehicleType)} / ${serviceTypeLabel(values.serviceType)}`,
        },
        { label: 'Vận hành', value: operationStatusLabel(values.operationStatus) },
        {
          label: 'Nguồn xe',
          value:
            VEHICLE_SOURCE_TYPE_LABEL[values.sourceType as VehicleSourceType] ?? values.sourceType,
        },
      ],
    },
    {
      key: 'specs',
      title: 'Thông số vận hành',
      step: 0,
      items: [
        { label: 'Biển số', value: text(values.plateNumber) },
        {
          label: 'Hãng & Kiểu dáng',
          value: [labels.brandLabel(values.brand), values.model].filter(Boolean).join(' ')
            ? `${[labels.brandLabel(values.brand), values.model].filter(Boolean).join(' ')}${values.bodyType ? ` (${labels.bodyTypeLabel(values.bodyType)})` : ''}`
            : EMPTY,
        },
        {
          label: 'Số chỗ / Năng lượng',
          value:
            [
              values.seatCount ? `${values.seatCount} chỗ` : null,
              values.fuelType ? labels.fuelTypeLabel(values.fuelType) : null,
            ]
              .filter(Boolean)
              .join(' / ') || EMPTY,
        },
        {
          label: 'Năm & Màu sắc',
          value: [values.manufactureYear, values.color].filter(Boolean).join(' / ') || EMPTY,
        },
      ],
    },
    {
      key: 'pricing',
      title: 'Giá thuê & Chính sách',
      step: 1,
      items: [
        { label: 'Đơn giá ngày thường', value: money(values.weekdayPrice) },
        { label: 'Giá cuối tuần', value: money(values.weekendPrice) },
        {
          label: 'Giảm giá',
          value: values.discountPercent == null ? EMPTY : `-${values.discountPercent}%`,
        },
        {
          label: 'Chính sách',
          value:
            [
              values.deliveryEnabled ? 'Giao tận nơi' : null,
              values.noCollateral ? 'Miễn thế chấp' : null,
            ]
              .filter(Boolean)
              .join(' · ') || 'Không áp dụng',
        },
      ],
    },
    {
      key: 'media',
      title: 'Hình ảnh & Tiện ích',
      step: 2,
      items: [
        {
          label: 'Tổng quan',
          value: `${values.mainImageUrl ? 'Ảnh đại diện đã thiết lập' : 'Chưa có ảnh đại diện'} • ${gallery} ảnh thư viện • ${features} tiện ích được chọn`,
        },
      ],
    },
  ];
}

interface VehicleReviewStepProps {
  values: VehicleFormValues;
  onEditStep: (step: number) => void;
}

/**
 * Bước xác nhận cuối wizard TẠO (Figma `193:2009`): bốn thẻ tổng kết đúng những gì đã nhập
 * trong bốn bước, mỗi thẻ có lối "Chỉnh sửa" quay về ĐÚNG bước của nó. Thông số kỹ thuật
 * nâng cao không xuất hiện — luồng tạo không thu thập chúng.
 *
 * (Hình thái "tóm tắt thay đổi" cho luồng sửa đã gỡ cùng wizard sửa — chỉnh sửa nay đi qua
 * `VehicleEditWorkspace` dạng tab, xác nhận nhạy cảm nằm ở dialog của workspace.)
 */
export function VehicleReviewStep({ values, onEditStep }: VehicleReviewStepProps) {
  // Bảng tổng kết phải hiện TÊN hãng/kiểu dáng, không phải key đã lưu.
  const labels = useCatalogLabels();

  return (
    <div className={styles.groups}>
      {groupsOf(values, labels).map((group) => (
        <section key={group.key} className={styles.group}>
          <header className={styles.groupHeader}>
            <h3 className={styles.groupTitle}>{group.title}</h3>
            <Button type="link" size="small" onClick={() => onEditStep(group.step)}>
              Chỉnh sửa
            </Button>
          </header>
          <dl className={styles.items}>
            {group.items.map((item) => (
              <div key={item.label}>
                <dt>{item.label}</dt>
                <dd>{item.value}</dd>
              </div>
            ))}
          </dl>
        </section>
      ))}
    </div>
  );
}

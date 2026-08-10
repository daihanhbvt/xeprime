'use client';

import { Button, Empty } from 'antd';
import { VEHICLE_OPERATION_STATUS_META, type VehicleOperationStatus } from '@xeprime/types';
import type { VehicleFormValues } from '@xeprime/validators';
import { formatMoneyVnd } from '@/lib/money';
import { bodyTypeLabelOf, fuelTypeLabel, serviceTypeLabel, vehicleTypeLabel } from '../constants';

/** Nhãn trạng thái vận hành lấy từ META dùng chung — không khai lại bảng ánh xạ thứ hai. */
const operationStatusLabel = (value: string): string =>
  VEHICLE_OPERATION_STATUS_META[value as VehicleOperationStatus]?.label ?? value;
import { sensitiveChanges } from '../sensitive-changes';
import styles from './VehicleReviewStep.module.css';

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

function groupsOf(values: VehicleFormValues): ReviewGroup[] {
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
      ],
    },
    {
      key: 'specs',
      title: 'Chi tiết kỹ thuật',
      step: 1,
      items: [
        { label: 'Biển số', value: text(values.plateNumber) },
        {
          label: 'Hãng & Kiểu dáng',
          value: [values.brand, values.model].filter(Boolean).join(' ')
            ? `${[values.brand, values.model].filter(Boolean).join(' ')}${values.bodyType ? ` (${bodyTypeLabelOf(values.bodyType)})` : ''}`
            : EMPTY,
        },
        {
          label: 'Số chỗ / Động cơ',
          value:
            [
              values.seatCount ? `${values.seatCount} chỗ` : null,
              values.fuelType ? fuelTypeLabel(values.fuelType) : null,
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
      step: 2,
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
            [values.deliveryEnabled ? 'Giao tận nơi' : null, values.noCollateral ? 'Miễn thế chấp' : null]
              .filter(Boolean)
              .join(' · ') || 'Không áp dụng',
        },
      ],
    },
    {
      key: 'media',
      title: 'Hình ảnh & Tiện ích',
      step: 3,
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
  /** Có → hiện bảng thay đổi (luồng sửa); không → tổng kết toàn hồ sơ (luồng tạo). */
  initialValues?: VehicleFormValues;
  onEditStep: (step: number) => void;
}

/**
 * Bước xác nhận cuối wizard.
 *
 * Hai hình thái theo đúng hai frame Figma:
 *  - **tạo** (`193:2009`) — bốn thẻ tổng kết toàn bộ hồ sơ, mỗi thẻ có lối "Chỉnh sửa" quay đúng
 *    về bước của nó;
 *  - **sửa** — chỉ liệt kê thứ ĐÃ ĐỔI kèm giá trị cũ → mới. Nhắc lại toàn bộ giá trị hiện tại
 *    thì người sửa không thấy được mình vừa đổi gì, tức mất luôn mục đích của bước này.
 */
export function VehicleReviewStep({ values, initialValues, onEditStep }: VehicleReviewStepProps) {
  const isEdit = Boolean(initialValues);

  if (isEdit) {
    const groups = groupsOf(values);
    const before = groupsOf(initialValues!);
    const changed = groups.flatMap((group, groupIndex) =>
      group.items
        .map((item, itemIndex) => ({
          group,
          label: item.label,
          after: item.value,
          before: before[groupIndex]!.items[itemIndex]!.value,
        }))
        .filter((row) => row.before !== row.after),
    );
    const sensitive = new Set(sensitiveChanges(initialValues, values).map((change) => change.label));

    if (changed.length === 0) {
      return (
        <Empty
          image={Empty.PRESENTED_IMAGE_SIMPLE}
          description="Bạn chưa thay đổi thông tin nào. Quay lại các bước trước để chỉnh sửa."
        />
      );
    }

    return (
      <div className={styles.groups}>
        <p className={styles.lead}>Tóm tắt thay đổi</p>
        <ul className={styles.changes}>
          {changed.map((row) => (
            <li key={`${row.group.key}-${row.label}`} className={styles.change}>
              <span className={styles.changeLabel}>
                {row.label}
                {sensitive.has(row.label) ? (
                  <span className={styles.sensitiveMark}> (cần duyệt lại)</span>
                ) : null}
              </span>
              <span className={styles.changeValues}>
                <span className={styles.before}>{row.before}</span>
                <span aria-hidden="true"> → </span>
                <b>{row.after}</b>
              </span>
              <Button type="link" size="small" onClick={() => onEditStep(row.group.step)}>
                Chỉnh sửa
              </Button>
            </li>
          ))}
        </ul>
      </div>
    );
  }

  return (
    <div className={styles.groups}>
      {groupsOf(values).map((group) => (
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

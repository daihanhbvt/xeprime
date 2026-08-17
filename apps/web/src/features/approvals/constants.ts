import {
  APPROVAL_STATUS_META,
  APPROVAL_STATUS_VALUES,
  APPROVAL_TARGET_TYPE,
  BODY_TYPE_LABEL,
  FUEL_TYPE_LABEL,
  VEHICLE_TYPE_LABEL,
  serviceTypeLabel,
  serviceTypesLabel,
  type BodyType,
  type FuelType,
  type VehicleType,
} from '@xeprime/types';
import { formatMoneyVnd } from '@/lib/money';

export const APPROVAL_STATUS_OPTIONS = APPROVAL_STATUS_VALUES.map((value) => ({
  value,
  label: APPROVAL_STATUS_META[value].label,
}));

const TARGET_LABELS: Record<string, string> = {
  [APPROVAL_TARGET_TYPE.TENANT]: 'Gian hàng',
  [APPROVAL_TARGET_TYPE.VEHICLE]: 'Xe',
  [APPROVAL_TARGET_TYPE.TENANT_DOCUMENT]: 'Giấy tờ gian hàng',
  [APPROVAL_TARGET_TYPE.VEHICLE_DOCUMENT]: 'Giấy tờ xe',
};

export const targetTypeLabel = (value: string): string => TARGET_LABELS[value] ?? value;

export interface SnapshotField {
  key: string;
  label: string;
  /** Định dạng giá trị hiển thị (mã enum → nhãn, tiền → VND). Mặc định String(value). */
  format?: (value: unknown) => string;
}

/** Nhãn các trường trong snapshot hồ sơ gian hàng, theo thứ tự hiển thị. */
export const SHOP_SNAPSHOT_FIELDS: readonly SnapshotField[] = [
  { key: 'displayName', label: 'Tên hiển thị' },
  { key: 'bio', label: 'Giới thiệu' },
  { key: 'address', label: 'Địa chỉ' },
  { key: 'provinceName', label: 'Tỉnh/Thành' },
  { key: 'taxCode', label: 'Mã số thuế' },
  { key: 'businessLicenseNo', label: 'Số giấy phép KD' },
  { key: 'bankName', label: 'Ngân hàng' },
  { key: 'bankAccountNo', label: 'Số tài khoản' },
  { key: 'bankAccountName', label: 'Chủ tài khoản' },
  { key: 'logoUrl', label: 'Logo' },
];

/** Nhãn + định dạng các trường snapshot xe (không gồm `mainImageUrl` — hiển thị dạng ảnh riêng). */
export const VEHICLE_SNAPSHOT_FIELDS: readonly SnapshotField[] = [
  { key: 'name', label: 'Tên xe' },
  { key: 'code', label: 'Mã xe' },
  { key: 'plateNumber', label: 'Biển số' },
  {
    key: 'vehicleType',
    label: 'Loại xe',
    format: (v) => VEHICLE_TYPE_LABEL[v as VehicleType] ?? String(v),
  },
  /*
   * Snapshot là jsonb ĐÓNG BĂNG, không migrate: phiếu cũ mang key `serviceType` (string, có thể
   * là 'both' đã khai tử), phiếu từ 17/08 mang `serviceTypes` (mảng). Renderer chỉ hiện key có
   * trong snapshot nên khai cả hai — mỗi phiếu khớp đúng một dòng.
   */
  {
    key: 'serviceType',
    label: 'Dịch vụ',
    format: (v) => serviceTypeLabel(String(v)),
  },
  {
    key: 'serviceTypes',
    label: 'Dịch vụ',
    format: (v) => (Array.isArray(v) ? serviceTypesLabel(v as string[]) : serviceTypeLabel(String(v))),
  },
  { key: 'brand', label: 'Hãng' },
  { key: 'model', label: 'Dòng xe' },
  { key: 'manufactureYear', label: 'Đời xe' },
  { key: 'seatCount', label: 'Số chỗ' },
  {
    key: 'fuelType',
    label: 'Nguồn năng lượng',
    format: (v) => FUEL_TYPE_LABEL[v as FuelType] ?? String(v),
  },
  {
    key: 'bodyType',
    label: 'Kiểu dáng',
    format: (v) => BODY_TYPE_LABEL[v as BodyType] ?? String(v),
  },
  { key: 'color', label: 'Màu sắc' },
  { key: 'weekdayPrice', label: 'Giá ngày thường', format: (v) => formatMoneyVnd(String(v)) },
  { key: 'weekendPrice', label: 'Giá cuối tuần', format: (v) => formatMoneyVnd(String(v)) },
  { key: 'hourlyPrice', label: 'Giá thuê giờ', format: (v) => formatMoneyVnd(String(v)) },
  { key: 'monthlyPrice', label: 'Giá tháng (dài hạn)', format: (v) => formatMoneyVnd(String(v)) },
  {
    key: 'withDriverDailyPrice',
    label: 'Giá/ngày có tài xế',
    format: (v) => formatMoneyVnd(String(v)),
  },
  { key: 'discountPercent', label: 'Giảm giá', format: (v) => `${String(v)}%` },
  { key: 'deliveryEnabled', label: 'Giao xe tận nơi', format: (v) => (v ? 'Có' : 'Không') },
  { key: 'noCollateral', label: 'Miễn thế chấp', format: (v) => (v ? 'Có' : 'Không') },
  { key: 'description', label: 'Mô tả' },
];

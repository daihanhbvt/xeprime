import {
  APPROVAL_STATUS_META,
  APPROVAL_STATUS_VALUES,
  APPROVAL_TARGET_TYPE,
} from '@xeprime/types';

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

/** Nhãn các trường trong snapshot hồ sơ gian hàng, theo thứ tự hiển thị. */
export const SHOP_SNAPSHOT_FIELDS: readonly { key: string; label: string }[] = [
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

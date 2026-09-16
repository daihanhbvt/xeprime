import {
  APPROVAL_STATUS_VALUES,
  APPROVAL_TARGET_TYPE,
  type ApprovalTargetType,
} from '@xeprime/types';
import type { useTranslations } from 'next-intl';
import type { AppFormat } from '@/i18n/use-app-format';
import type { DomainLabel } from '@/i18n/domain';

/**
 * Loại phiếu mà HÀNG ĐỢI NÀY duyệt được.
 *
 * `PlatformApprovalService.review()` chỉ điều phối hai nhánh `tenant` và `vehicle`; ba loại còn
 * lại rơi vào `throw 'Loại phiếu này chưa được hỗ trợ duyệt'`. Nhưng phiếu `seller_profile` VẪN
 * được `SellerProfileService` ghi vào cùng bảng `approval_tasks`, và hàng đợi không lọc theo
 * `targetType` — nên trước bản này reviewer thấy một dòng nhãn thô `seller_profile`, bấm "Duyệt"
 * và nhận 400.
 *
 * Danh sách này là nguồn để màn hình KHOÁ nút thay vì mời bấm rồi báo lỗi. Nơi duyệt thật của
 * hồ sơ người bán là `/manage/admin/sellers`.
 */
export const REVIEWABLE_TARGET_TYPES: readonly ApprovalTargetType[] = [
  APPROVAL_TARGET_TYPE.TENANT,
  APPROVAL_TARGET_TYPE.VEHICLE,
];

export function isReviewableTargetType(value: string): boolean {
  return (REVIEWABLE_TARGET_TYPES as readonly string[]).includes(value);
}

/**
 * Khoá nhãn trong nhóm `Approvals.snapshot.fields` — union ĐÓNG lấy thẳng từ bó message, nên gõ
 * sai là lỗi biên dịch chứ không phải một ô trống trên màn duyệt của production.
 */
export type SnapshotLabelKey = Parameters<
  ReturnType<typeof useTranslations<'Approvals.snapshot.fields'>>
>[0];

export interface SnapshotField {
  key: string;
  /** Khoá nhãn dưới nhóm message ở trên. */
  labelKey: SnapshotLabelKey;
  /**
   * Định dạng giá trị hiển thị (mã enum → nhãn, tiền → VND). Mặc định `String(value)`.
   * Nhận `fmt`/`domainLabel` qua tham số vì bảng này ở module scope — nó không gọi hook được,
   * và tiền/ngày/nhãn thì phụ thuộc ngôn ngữ của request.
   */
  format?: (value: unknown, ctx: { fmt: AppFormat; domainLabel: DomainLabel }) => string;
}

/**
 * Nhãn các trường trong snapshot hồ sơ gian hàng, theo thứ tự hiển thị.
 *
 * ⚠️ Bốn trường đầu là bổ sung 14/09/2026 và chúng KHÔNG phải trang trí: `ownerFullName` và
 * `ownerPhone` nằm trong `missingShopProfileRequirements` — tức là **hai thứ bắt buộc phải có
 * mới gửi duyệt được** — nhưng bảng cũ không khai chúng, nên reviewer đang duyệt danh tính một
 * chủ xe mà không nhìn thấy tên và số điện thoại của người đó. Snapshot đã mang sẵn dữ liệu
 * (`PROFILE_SELECT` ở backend chọn đủ), chỉ là màn hình không vẽ ra.
 */
export const SHOP_SNAPSHOT_FIELDS: readonly SnapshotField[] = [
  { key: 'ownerFullName', labelKey: 'ownerFullName' },
  { key: 'ownerPhone', labelKey: 'ownerPhone' },
  { key: 'ownerEmail', labelKey: 'ownerEmail' },
  { key: 'displayName', labelKey: 'displayName' },
  { key: 'bio', labelKey: 'bio' },
  { key: 'address', labelKey: 'address' },
  { key: 'wardName', labelKey: 'wardName' },
  { key: 'provinceName', labelKey: 'provinceName' },
  { key: 'taxCode', labelKey: 'taxCode' },
  { key: 'businessLicenseNo', labelKey: 'businessLicenseNo' },
  { key: 'bankName', labelKey: 'bankName' },
  { key: 'bankAccountNo', labelKey: 'bankAccountNo' },
  { key: 'bankAccountName', labelKey: 'bankAccountName' },
  { key: 'logoUrl', labelKey: 'logoUrl' },
];

/**
 * Nhãn + định dạng các trường snapshot xe.
 *
 * Không gồm `mainImageUrl` và `images` — chúng hiển thị dạng THƯ VIỆN ẢNH riêng. Cổng gửi duyệt
 * bắt buộc ≥4 ảnh, nên duyệt bằng một tấm là duyệt thứ mình không thấy.
 */
export const VEHICLE_SNAPSHOT_FIELDS: readonly SnapshotField[] = [
  { key: 'name', labelKey: 'vehicleName' },
  { key: 'code', labelKey: 'vehicleCode' },
  { key: 'plateNumber', labelKey: 'plateNumber' },
  // Xe nằm ở đâu là điều kiện để nó lên chợ (`BRANCH_LOCATION_REQUIRED`) — và cũng là thứ
  // reviewer cần để đối chiếu với hồ sơ gian hàng.
  { key: 'branchName', labelKey: 'branchName' },
  { key: 'provinceName', labelKey: 'provinceName' },
  {
    key: 'vehicleType',
    labelKey: 'vehicleType',
    format: (v, { domainLabel }) => domainLabel('vehicleType', String(v), String(v)),
  },
  /*
   * Snapshot là jsonb ĐÓNG BĂNG, không migrate: phiếu cũ mang key `serviceType` (string, có thể
   * là 'both' đã khai tử), phiếu từ 17/08 mang `serviceTypes` (mảng). Renderer chỉ hiện key có
   * trong snapshot nên khai cả hai — mỗi phiếu khớp đúng một dòng.
   */
  {
    key: 'serviceType',
    labelKey: 'serviceType',
    format: (v, { domainLabel }) => domainLabel('serviceType', String(v), String(v)),
  },
  {
    key: 'serviceTypes',
    labelKey: 'serviceType',
    format: (v, { domainLabel }) =>
      (Array.isArray(v) ? (v as string[]) : [String(v)])
        .map((code) => domainLabel('serviceType', code, code))
        .join(', '),
  },
  { key: 'brand', labelKey: 'brand' },
  { key: 'model', labelKey: 'model' },
  { key: 'manufactureYear', labelKey: 'manufactureYear' },
  { key: 'seatCount', labelKey: 'seatCount' },
  {
    key: 'fuelType',
    labelKey: 'fuelType',
    format: (v, { domainLabel }) => domainLabel('fuelType', String(v), String(v)),
  },
  {
    key: 'bodyType',
    labelKey: 'bodyType',
    format: (v, { domainLabel }) => domainLabel('bodyType', String(v), String(v)),
  },
  { key: 'color', labelKey: 'color' },
  { key: 'weekdayPrice', labelKey: 'weekdayPrice', format: (v, { fmt }) => fmt.money(String(v)) },
  { key: 'weekendPrice', labelKey: 'weekendPrice', format: (v, { fmt }) => fmt.money(String(v)) },
  { key: 'hourlyPrice', labelKey: 'hourlyPrice', format: (v, { fmt }) => fmt.money(String(v)) },
  { key: 'monthlyPrice', labelKey: 'monthlyPrice', format: (v, { fmt }) => fmt.money(String(v)) },
  {
    key: 'withDriverDailyPrice',
    labelKey: 'withDriverDailyPrice',
    format: (v, { fmt }) => fmt.money(String(v)),
  },
  { key: 'discountPercent', labelKey: 'discountPercent', format: (v) => `${String(v)}%` },
  { key: 'description', labelKey: 'description' },
];

/** Ảnh trong snapshot xe — gộp `mainImageUrl` với thư viện và khử trùng. */
export function snapshotImages(snapshot: Record<string, unknown>): string[] {
  const gallery = Array.isArray(snapshot.images) ? (snapshot.images as unknown[]) : [];
  const main = typeof snapshot.mainImageUrl === 'string' ? snapshot.mainImageUrl : null;
  return [
    ...new Set(
      [main, ...gallery].filter((url): url is string => typeof url === 'string' && url !== ''),
    ),
  ];
}

export const APPROVAL_STATUS_FILTER_VALUES = APPROVAL_STATUS_VALUES;

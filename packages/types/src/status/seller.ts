/**
 * XÁC MINH NGƯỜI BÁN — ADR 0028 release gate 1, Gap Analysis §3.A (R3).
 *
 * Hồ sơ người bán là điều kiện TRƯỚC khi nhận tiền khách thật: loại chủ thể quyết định cách
 * phân loại thuế (ADR 0028 điều 4), tài khoản nhận tiền quyết định tiền đi đâu ở R4. Ở R3 hồ
 * sơ được thu thập và duyệt; nó CHƯA chặn việc đăng xe hay nhận đơn — cổng chặn đó thuộc gate
 * tiền thật (R4), và chặn sớm hơn là đuổi người bán đi trước khi họ thấy lý do phải khai.
 *
 * `tenants.tenant_type` VẪN là nhãn hiển thị (ADR 0014 điều 2) — `entityType` ở đây mới là dữ
 * liệu pháp lý/thuế, do người bán khai và admin duyệt.
 */

import { STATUS_COLOR, type StatusMeta } from './meta';

/** Loại chủ thể — quyết định nghĩa vụ thuế; tư vấn thuế chốt tỷ lệ theo từng loại. */
export const SELLER_ENTITY_TYPE = {
  /** Cá nhân cư trú. */
  INDIVIDUAL: 'individual',
  /** Hộ kinh doanh. */
  HOUSEHOLD_BUSINESS: 'household_business',
  /** Doanh nghiệp. */
  COMPANY: 'company',
} as const;

export type SellerEntityType = (typeof SELLER_ENTITY_TYPE)[keyof typeof SELLER_ENTITY_TYPE];
export const SELLER_ENTITY_TYPE_VALUES = Object.values(SELLER_ENTITY_TYPE) as SellerEntityType[];

export function isSellerEntityType(value: unknown): value is SellerEntityType {
  return typeof value === 'string' && (SELLER_ENTITY_TYPE_VALUES as string[]).includes(value);
}

export const SELLER_ENTITY_TYPE_LABEL: Readonly<Record<SellerEntityType, string>> = {
  [SELLER_ENTITY_TYPE.INDIVIDUAL]: 'Cá nhân',
  [SELLER_ENTITY_TYPE.HOUSEHOLD_BUSINESS]: 'Hộ kinh doanh',
  [SELLER_ENTITY_TYPE.COMPANY]: 'Doanh nghiệp',
};

/**
 * Vòng đời hồ sơ. `changes_requested` tách khỏi `rejected`: một bên là "sửa rồi gửi lại", một
 * bên là "không nhận" — người bán phải biết mình đang ở đâu.
 */
export const SELLER_PROFILE_STATUS = {
  DRAFT: 'draft',
  SUBMITTED: 'submitted',
  VERIFIED: 'verified',
  CHANGES_REQUESTED: 'changes_requested',
  REJECTED: 'rejected',
} as const;

export type SellerProfileStatus =
  (typeof SELLER_PROFILE_STATUS)[keyof typeof SELLER_PROFILE_STATUS];
export const SELLER_PROFILE_STATUS_VALUES = Object.values(
  SELLER_PROFILE_STATUS,
) as SellerProfileStatus[];

export function isSellerProfileStatus(value: unknown): value is SellerProfileStatus {
  return typeof value === 'string' && (SELLER_PROFILE_STATUS_VALUES as string[]).includes(value);
}

export const SELLER_PROFILE_STATUS_META: Readonly<Record<SellerProfileStatus, StatusMeta>> = {
  [SELLER_PROFILE_STATUS.DRAFT]: { label: 'Chưa gửi', color: STATUS_COLOR.NEUTRAL },
  [SELLER_PROFILE_STATUS.SUBMITTED]: { label: 'Chờ xác minh', color: STATUS_COLOR.WAITING },
  [SELLER_PROFILE_STATUS.VERIFIED]: { label: 'Đã xác minh', color: STATUS_COLOR.SUCCESS },
  [SELLER_PROFILE_STATUS.CHANGES_REQUESTED]: {
    label: 'Cần bổ sung',
    color: STATUS_COLOR.WARNING,
  },
  [SELLER_PROFILE_STATUS.REJECTED]: { label: 'Bị từ chối', color: STATUS_COLOR.DANGER },
};

/** Người bán được SỬA hồ sơ ở trạng thái nào. `verified` sửa = gửi lại xác minh (tài khoản nhận tiền đổi là việc nhạy cảm). */
export const SELLER_PROFILE_EDITABLE: readonly SellerProfileStatus[] = [
  SELLER_PROFILE_STATUS.DRAFT,
  SELLER_PROFILE_STATUS.CHANGES_REQUESTED,
  SELLER_PROFILE_STATUS.REJECTED,
  SELLER_PROFILE_STATUS.VERIFIED,
];

export function canEditSellerProfile(status: SellerProfileStatus): boolean {
  return SELLER_PROFILE_EDITABLE.includes(status);
}

/**
 * Che số tài khoản/CCCD khi hiện ở DANH SÁCH và cho vai không có quyền xem PII: giữ 4 ký tự
 * cuối — đủ để người bán nhận ra tài khoản của mình, không đủ để người khác dùng.
 */
export function maskAccountNumber(value: string | null | undefined): string | null {
  if (!value) return null;
  const digits = value.replace(/\s+/g, '');
  if (digits.length <= 4) return '••••';
  return `${'•'.repeat(Math.max(4, digits.length - 4))}${digits.slice(-4)}`;
}

import {
  MEMBERSHIP_STATUS,
  STATUS_COLOR,
  TENANT_ROLE,
  TENANT_ROLE_VALUES,
  type MembershipStatus,
  type StatusMeta,
  type TenantRole,
} from '@xeprime/types';

/**
 * MÃ vai trò, không phải nhãn — nhãn dựng lúc render qua `useDomainLabel('tenantRole', …)`.
 *
 * Trước đây hai mảng này mang sẵn `TENANT_ROLE_LABEL[role]`, tức là chữ tiếng Việt đóng băng ở
 * module scope: giao diện tiếng Anh vẫn hiện "Nhân viên gian hàng", và module scope chạy một lần
 * cho cả tiến trình nên nó còn đóng băng ngôn ngữ của request ĐẦU TIÊN ở SSR.
 */
export const ASSIGNABLE_ROLES: readonly TenantRole[] = TENANT_ROLE_VALUES.filter(
  (role) => role !== TENANT_ROLE.SHOP_OWNER,
);

/** Toàn bộ vai trò (kèm owner) — dùng cho bộ lọc. */
export const ALL_ROLES: readonly TenantRole[] = TENANT_ROLE_VALUES;

/** Meta trạng thái thành viên (chưa có trong @xeprime/types) — gói ở FE để StatusTag dùng chung. */
export const MEMBERSHIP_STATUS_META: Readonly<Record<MembershipStatus, StatusMeta>> = {
  [MEMBERSHIP_STATUS.ACTIVE]: { label: 'Đang hoạt động', color: STATUS_COLOR.SUCCESS },
  [MEMBERSHIP_STATUS.INVITED]: { label: 'Đã mời', color: STATUS_COLOR.WAITING },
  [MEMBERSHIP_STATUS.LOCKED]: { label: 'Bị khoá', color: STATUS_COLOR.DANGER },
  [MEMBERSHIP_STATUS.REMOVED]: { label: 'Đã gỡ', color: STATUS_COLOR.NEUTRAL },
};

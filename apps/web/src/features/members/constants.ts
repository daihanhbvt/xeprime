import {
  MEMBERSHIP_STATUS,
  STATUS_COLOR,
  TENANT_ROLE,
  TENANT_ROLE_LABEL,
  TENANT_ROLE_VALUES,
  type MembershipStatus,
  type StatusMeta,
} from '@xeprime/types';

/** Vai trò có thể GÁN cho thành viên — bỏ chủ shop (owner là người tạo gian hàng). */
export const ASSIGNABLE_ROLE_OPTIONS = TENANT_ROLE_VALUES.filter(
  (role) => role !== TENANT_ROLE.SHOP_OWNER,
).map((role) => ({ value: role, label: TENANT_ROLE_LABEL[role] }));

/** Toàn bộ vai trò (kèm owner) — dùng cho bộ lọc. */
export const ALL_ROLE_OPTIONS = TENANT_ROLE_VALUES.map((role) => ({
  value: role,
  label: TENANT_ROLE_LABEL[role],
}));

/** Meta trạng thái thành viên (chưa có trong @xeprime/types) — gói ở FE để StatusTag dùng chung. */
export const MEMBERSHIP_STATUS_META: Readonly<Record<MembershipStatus, StatusMeta>> = {
  [MEMBERSHIP_STATUS.ACTIVE]: { label: 'Đang hoạt động', color: STATUS_COLOR.SUCCESS },
  [MEMBERSHIP_STATUS.INVITED]: { label: 'Đã mời', color: STATUS_COLOR.WAITING },
  [MEMBERSHIP_STATUS.LOCKED]: { label: 'Bị khoá', color: STATUS_COLOR.DANGER },
  [MEMBERSHIP_STATUS.REMOVED]: { label: 'Đã gỡ', color: STATUS_COLOR.NEUTRAL },
};

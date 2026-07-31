/**
 * Role, scope và permission key.
 *
 * CLAUDE.md mục 7: role đã đổi tên so với source Firebase cũ (`owner` → `shop_owner`, …).
 * CLAUDE.md mục 6: guard backend là nguồn bảo vệ chính — hằng số ở đây chỉ để cả hai phía
 * gọi cùng một tên, KHÔNG phải để frontend tự quyết định quyền.
 */

/** Phạm vi dữ liệu. Một user có thể vừa là thành viên tenant, vừa là nhân sự nền tảng. */
export const SCOPE = {
  TENANT: 'tenant',
  PLATFORM: 'platform',
} as const;

export type Scope = (typeof SCOPE)[keyof typeof SCOPE];

/** Role trong gian hàng. */
export const TENANT_ROLE = {
  SHOP_OWNER: 'shop_owner',
  SHOP_MANAGER: 'shop_manager',
  SHOP_STAFF: 'shop_staff',
  SHOP_VIEWER: 'shop_viewer',
} as const;

export type TenantRole = (typeof TENANT_ROLE)[keyof typeof TENANT_ROLE];
export const TENANT_ROLE_VALUES = Object.values(TENANT_ROLE) as TenantRole[];

export const TENANT_ROLE_LABEL: Readonly<Record<TenantRole, string>> = {
  [TENANT_ROLE.SHOP_OWNER]: 'Chủ gian hàng',
  [TENANT_ROLE.SHOP_MANAGER]: 'Quản lý gian hàng',
  [TENANT_ROLE.SHOP_STAFF]: 'Nhân viên gian hàng',
  [TENANT_ROLE.SHOP_VIEWER]: 'Chỉ xem',
};

/**
 * Role nền tảng.
 *
 * MVP chỉ dùng `platform_admin` và `platform_staff`; ba role còn lại đã khai báo sẵn để
 * mở sau mà không phải migrate (screen_spec §4.3).
 */
export const PLATFORM_ROLE = {
  PLATFORM_ADMIN: 'platform_admin',
  PLATFORM_STAFF: 'platform_staff',
  REVIEWER: 'reviewer',
  SUPPORT: 'support',
  FINANCE_ADMIN: 'finance_admin',
} as const;

export type PlatformRole = (typeof PLATFORM_ROLE)[keyof typeof PLATFORM_ROLE];
export const PLATFORM_ROLE_VALUES = Object.values(PLATFORM_ROLE) as PlatformRole[];

export const PLATFORM_ROLE_LABEL: Readonly<Record<PlatformRole, string>> = {
  [PLATFORM_ROLE.PLATFORM_ADMIN]: 'Super Admin',
  [PLATFORM_ROLE.PLATFORM_STAFF]: 'Nhân viên nền tảng',
  [PLATFORM_ROLE.REVIEWER]: 'Nhân viên kiểm duyệt',
  [PLATFORM_ROLE.SUPPORT]: 'Nhân viên hỗ trợ',
  [PLATFORM_ROLE.FINANCE_ADMIN]: 'Nhân viên tài chính',
};

/** Role khách thuê. Không phải membership — suy ra từ việc user không thuộc tenant/platform. */
export const CUSTOMER_ROLE = 'customer' as const;

/**
 * Permission key, dạng `<module>.<action>`.
 *
 * Đây là danh sách Phase 0/1. Thêm key mới phải seed vào bảng `permissions` cùng lúc,
 * nếu không guard sẽ từ chối vì không tìm thấy permission.
 */
export const PERMISSION = {
  // Tenant / hồ sơ gian hàng
  TENANT_VIEW: 'tenant.view',
  TENANT_UPDATE: 'tenant.update',
  TENANT_SUBMIT_REVIEW: 'tenant.submit_review',

  // Nhân sự gian hàng
  MEMBER_VIEW: 'members.view',
  MEMBER_INVITE: 'members.invite',
  MEMBER_UPDATE_ROLE: 'members.update_role',
  MEMBER_REMOVE: 'members.remove',

  // Xe
  VEHICLE_VIEW: 'vehicles.view',
  VEHICLE_CREATE: 'vehicles.create',
  VEHICLE_UPDATE: 'vehicles.update',
  VEHICLE_DELETE: 'vehicles.delete',
  VEHICLE_SUBMIT_PUBLIC: 'vehicles.submit_public',
  VEHICLE_BLOCK_SCHEDULE: 'vehicles.block_schedule',

  // Đơn đặt xe / đơn thuê
  BOOKING_REQUEST_VIEW: 'booking_requests.view',
  BOOKING_REQUEST_APPROVE: 'booking_requests.approve',
  BOOKING_VIEW: 'bookings.view',
  BOOKING_CREATE: 'bookings.create',
  BOOKING_UPDATE: 'bookings.update',
  BOOKING_CANCEL: 'bookings.cancel',

  // Lịch
  CALENDAR_VIEW: 'calendar.view',

  // Tài chính
  FINANCE_VIEW: 'finance.view',
  RECEIPT_CREATE: 'receipts.create',
  RECEIPT_APPROVE: 'receipts.approve',
  PAYMENT_RECORD: 'payments.record',
  PAYMENT_VOID: 'payments.void',
  CONTRACT_MANAGE: 'contracts.manage',

  // Nền tảng
  PLATFORM_DASHBOARD_VIEW: 'platform.dashboard.view',
  PLATFORM_TENANT_MANAGE: 'platform.tenants.manage',
  PLATFORM_APPROVAL_REVIEW: 'platform.approvals.review',
  PLATFORM_AUDIT_VIEW: 'platform.audit.view',
  PLATFORM_STAFF_MANAGE: 'platform.staff.manage',
  PLATFORM_BILLING_MANAGE: 'platform.billing.manage',
} as const;

export type Permission = (typeof PERMISSION)[keyof typeof PERMISSION];
export const PERMISSION_VALUES = Object.values(PERMISSION) as Permission[];

/**
 * Permission mặc định của từng role hệ thống. Dùng để seed `role_permissions`.
 *
 * Đây KHÔNG phải nguồn kiểm tra quyền lúc chạy — guard luôn đọc từ DB, để chủ shop tạo
 * custom role và admin thu hồi quyền có hiệu lực ngay (ADR 0002).
 */
export const DEFAULT_TENANT_ROLE_PERMISSIONS: Readonly<Record<TenantRole, readonly Permission[]>> =
  {
    [TENANT_ROLE.SHOP_OWNER]: PERMISSION_VALUES.filter((p) => !p.startsWith('platform.')),
    [TENANT_ROLE.SHOP_MANAGER]: [
      PERMISSION.TENANT_VIEW,
      PERMISSION.MEMBER_VIEW,
      PERMISSION.MEMBER_INVITE,
      PERMISSION.VEHICLE_VIEW,
      PERMISSION.VEHICLE_CREATE,
      PERMISSION.VEHICLE_UPDATE,
      PERMISSION.VEHICLE_SUBMIT_PUBLIC,
      PERMISSION.VEHICLE_BLOCK_SCHEDULE,
      PERMISSION.BOOKING_REQUEST_VIEW,
      PERMISSION.BOOKING_REQUEST_APPROVE,
      PERMISSION.BOOKING_VIEW,
      PERMISSION.BOOKING_CREATE,
      PERMISSION.BOOKING_UPDATE,
      PERMISSION.BOOKING_CANCEL,
      PERMISSION.CALENDAR_VIEW,
      PERMISSION.FINANCE_VIEW,
      PERMISSION.RECEIPT_CREATE,
      PERMISSION.RECEIPT_APPROVE,
      PERMISSION.PAYMENT_RECORD,
      PERMISSION.PAYMENT_VOID,
      PERMISSION.CONTRACT_MANAGE,
    ],
    [TENANT_ROLE.SHOP_STAFF]: [
      PERMISSION.TENANT_VIEW,
      PERMISSION.VEHICLE_VIEW,
      PERMISSION.BOOKING_REQUEST_VIEW,
      PERMISSION.BOOKING_VIEW,
      PERMISSION.BOOKING_CREATE,
      PERMISSION.BOOKING_UPDATE,
      PERMISSION.CALENDAR_VIEW,
      PERMISSION.RECEIPT_CREATE,
      PERMISSION.PAYMENT_RECORD,
    ],
    [TENANT_ROLE.SHOP_VIEWER]: [
      PERMISSION.TENANT_VIEW,
      PERMISSION.VEHICLE_VIEW,
      PERMISSION.BOOKING_REQUEST_VIEW,
      PERMISSION.BOOKING_VIEW,
      PERMISSION.CALENDAR_VIEW,
    ],
  };

export const DEFAULT_PLATFORM_ROLE_PERMISSIONS: Readonly<
  Record<PlatformRole, readonly Permission[]>
> = {
  [PLATFORM_ROLE.PLATFORM_ADMIN]: PERMISSION_VALUES,
  // Build plan §11.2: "Platform staff không có quyền super admin mặc định".
  [PLATFORM_ROLE.PLATFORM_STAFF]: [
    PERMISSION.PLATFORM_DASHBOARD_VIEW,
    PERMISSION.VEHICLE_VIEW,
    PERMISSION.BOOKING_VIEW,
    PERMISSION.BOOKING_REQUEST_VIEW,
  ],
  [PLATFORM_ROLE.REVIEWER]: [
    PERMISSION.PLATFORM_DASHBOARD_VIEW,
    PERMISSION.PLATFORM_APPROVAL_REVIEW,
    PERMISSION.VEHICLE_VIEW,
  ],
  [PLATFORM_ROLE.SUPPORT]: [
    PERMISSION.PLATFORM_DASHBOARD_VIEW,
    PERMISSION.BOOKING_VIEW,
    PERMISSION.BOOKING_REQUEST_VIEW,
    PERMISSION.VEHICLE_VIEW,
  ],
  [PLATFORM_ROLE.FINANCE_ADMIN]: [
    PERMISSION.PLATFORM_DASHBOARD_VIEW,
    PERMISSION.FINANCE_VIEW,
    PERMISSION.PLATFORM_TENANT_MANAGE,
    PERMISSION.PLATFORM_BILLING_MANAGE,
  ],
};

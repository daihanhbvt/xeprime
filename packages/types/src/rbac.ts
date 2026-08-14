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

  // Chi nhánh gian hàng — nơi xe thực sự nằm, và là nguồn vị trí công khai của xe.
  /** Xem danh sách chi nhánh + dùng bộ chọn chi nhánh ở thanh trên. */
  BRANCH_VIEW: 'branches.view',
  /** Tạo/sửa/đổi mặc định/ngưng hoạt động chi nhánh. */
  BRANCH_MANAGE: 'branches.manage',

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

  // Giấy tờ xe (Wave 5/5.1 — docs/design/12 §10). Bốn mức tách bạch có chủ đích:
  // staff vận hành thấy TRẠNG THÁI nhưng không mặc định thấy PII hay mở được FILE nhạy cảm.
  /** Xem TRẠNG THÁI giấy tờ (loại/hạn/cảnh báo) — KHÔNG thấy PII, không mở được file. */
  VEHICLE_DOCUMENT_VIEW: 'vehicles.documents.view',
  /**
   * Xem metadata nhạy cảm của giấy tờ (tên/địa chỉ chủ xe, số giấy tờ, số khung/máy…).
   * KHÔNG tự động kèm quyền mở file — file là mức riêng bên dưới.
   */
  VEHICLE_DOCUMENT_DETAIL_VIEW: 'vehicles.documents.view_details',
  /** Mở/tải file giấy tờ riêng tư — cùng kiểu tách như `platform.customers.view_pii`. */
  VEHICLE_DOCUMENT_FILE_VIEW: 'vehicles.documents.view_files',
  /** Thêm/sửa/lưu trữ giấy tờ, tải file, chạy và áp kết quả OCR. */
  VEHICLE_DOCUMENT_MANAGE: 'vehicles.documents.manage',

  // Bảo dưỡng & KM (Wave 6 — docs/design/12 §9+§10). Tách quyền theo mức thiệt hại nếu
  // bị lạm dụng: xem ≠ ghi ≠ sửa số KM có thẩm quyền ≠ giảm KM ≠ thấy tiền.
  /** Xem KM, chu kỳ, lịch và lịch sử bảo dưỡng (không thấy chi phí). */
  VEHICLE_MAINTENANCE_VIEW: 'vehicles.maintenance.view',
  /** Thêm/sửa/hoàn tất/hủy phiếu bảo dưỡng và cấu hình chu kỳ. */
  VEHICLE_MAINTENANCE_MANAGE: 'vehicles.maintenance.manage',
  /** Mở/tải chứng từ bảo dưỡng riêng tư (hóa đơn, phiếu chi) — tách như `documents.view_files`. */
  VEHICLE_MAINTENANCE_FILE_VIEW: 'vehicles.maintenance.view_files',
  /**
   * Xem CHI PHÍ bảo dưỡng. Nhân viên vận hành làm được việc bảo dưỡng/KM nhưng không
   * đương nhiên thấy tiền (docs §10) — quyền tiền luôn phải cấp riêng.
   */
  VEHICLE_MAINTENANCE_COST_VIEW: 'vehicles.maintenance.view_cost',
  /** Chỉnh tay KM hiện tại (bắt buộc kèm lý do + ghi audit). */
  VEHICLE_ODOMETER_CORRECT: 'vehicles.odometer.correct',
  /**
   * GIẢM KM — quyền cao hơn hẳn: KM là số có thẩm quyền dùng để tính bảo dưỡng và đối
   * soát bàn giao, hạ nó xuống có thể che giấu quãng đường đã chạy (docs §9.1).
   */
  VEHICLE_ODOMETER_DECREASE: 'vehicles.odometer.decrease',

  // Bàn giao xe (Wave 7 — docs/design/12 §9.1+§10). Bốn mức tách bạch: xem đơn KHÔNG đương
  // nhiên xem được biên bản, xem biên bản không đương nhiên xác nhận được, và không mức nào
  // trong ba mức đó mở được ảnh bằng chứng riêng tư.
  /** Xem biên bản bàn giao (KM, nhiên liệu, tình trạng) — KHÔNG mở được ảnh riêng tư. */
  HANDOVER_VIEW: 'handovers.view',
  /** Lập/sửa bản nháp, tải ảnh hiện trạng, hủy nháp. */
  HANDOVER_MANAGE: 'handovers.manage',
  /**
   * XÁC NHẬN bàn giao — thao tác duy nhất có hệ quả thật: đổi trạng thái đơn, ghi KM có thẩm
   * quyền, đụng lịch xe. Tách riêng vì mức thiệt hại khác hẳn việc nhập nháp.
   */
  HANDOVER_CONFIRM: 'handovers.confirm',
  /** Mở/tải ảnh hiện trạng riêng tư — cùng kiểu tách như `documents.view_files`. */
  HANDOVER_FILE_VIEW: 'handovers.view_files',

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
  /**
   * Quản lý danh mục lọc (hãng xe / kiểu dáng / nhiên liệu / tiện ích). Sửa ở đây đổi luôn ô chọn
   * trong form tạo xe của MỌI gian hàng và bộ lọc ngoài chợ — quyền riêng, không gộp vào
   * `platform.vehicles.moderate` vốn chỉ tác động một xe.
   */
  PLATFORM_CATALOG_MANAGE: 'platform.catalog.manage',
  /**
   * Quản lý banner hero trang chủ Marketplace. Quyền riêng vì nội dung này hiển thị với TOÀN BỘ
   * khách truy cập — không gộp vào quyền quản trị nội bộ nào khác.
   */
  PLATFORM_BANNER_MANAGE: 'platform.banners.manage',

  // Nền tảng — giám sát toàn hệ thống (build plan §11.1). Tách khỏi `vehicles.*`/`bookings.*`
  // của gian hàng: quyền tenant chỉ có nghĩa TRONG một tenant, còn đây là đọc xuyên tenant.
  PLATFORM_VEHICLE_VIEW: 'platform.vehicles.view',
  /** Ẩn / bỏ ẩn xe vi phạm khỏi Marketplace (ghi qua ListingsService — ADR 0008). */
  PLATFORM_VEHICLE_MODERATE: 'platform.vehicles.moderate',
  PLATFORM_BOOKING_VIEW: 'platform.bookings.view',
  PLATFORM_CUSTOMER_VIEW: 'platform.customers.view',
  /**
   * Xem SĐT/email khách ở dạng ĐẦY ĐỦ. Mặc định mọi endpoint giám sát trả bản đã masking;
   * bỏ mask là hành động riêng, có quyền riêng và ghi `audit_logs` từng lần.
   */
  PLATFORM_CUSTOMER_PII_VIEW: 'platform.customers.view_pii',

  /**
   * Danh mục hành chính (tỉnh/thành) — dữ liệu DÙNG CHUNG cho mọi gian hàng, nên nằm ở nền tảng
   * chứ không ở tenant. Tách view/manage vì bật-tắt hiển thị công khai một tỉnh làm cả một vùng
   * biến mất khỏi marketplace: đó là hành động của admin, không phải của người đang tra cứu.
   */
  PLATFORM_LOCATION_VIEW: 'platform.locations.view',
  PLATFORM_LOCATION_MANAGE: 'platform.locations.manage',
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
      PERMISSION.BRANCH_VIEW,
      PERMISSION.BRANCH_MANAGE,
      PERMISSION.MEMBER_VIEW,
      PERMISSION.MEMBER_INVITE,
      PERMISSION.VEHICLE_VIEW,
      PERMISSION.VEHICLE_CREATE,
      PERMISSION.VEHICLE_UPDATE,
      PERMISSION.VEHICLE_SUBMIT_PUBLIC,
      PERMISSION.VEHICLE_BLOCK_SCHEDULE,
      PERMISSION.VEHICLE_DOCUMENT_VIEW,
      PERMISSION.VEHICLE_DOCUMENT_DETAIL_VIEW,
      PERMISSION.VEHICLE_DOCUMENT_FILE_VIEW,
      PERMISSION.VEHICLE_DOCUMENT_MANAGE,
      PERMISSION.VEHICLE_MAINTENANCE_VIEW,
      PERMISSION.VEHICLE_MAINTENANCE_MANAGE,
      PERMISSION.VEHICLE_MAINTENANCE_FILE_VIEW,
      PERMISSION.VEHICLE_MAINTENANCE_COST_VIEW,
      PERMISSION.VEHICLE_ODOMETER_CORRECT,
      // KHÔNG có `vehicles.odometer.decrease`: giảm KM là quyền cấp riêng, mặc định chỉ chủ
      // gian hàng có (docs §9.1 "giảm KM cần quyền cao hơn").
      PERMISSION.HANDOVER_VIEW,
      PERMISSION.HANDOVER_MANAGE,
      PERMISSION.HANDOVER_CONFIRM,
      PERMISSION.HANDOVER_FILE_VIEW,
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
      // Xem để lọc theo chi nhánh mình đang trực; sửa chi nhánh là việc của quản lý/chủ shop.
      PERMISSION.BRANCH_VIEW,
      PERMISSION.VEHICLE_VIEW,
      // Chỉ TRẠNG THÁI giấy tờ (còn hạn/sắp hết hạn) — không mở được file nhạy cảm (docs §10).
      PERMISSION.VEHICLE_DOCUMENT_VIEW,
      // "Nhập KM/record được giao" (docs §10): làm được việc bảo dưỡng, nhưng KHÔNG kèm
      // `view_cost`/`view_files`/`odometer.decrease` — quyền tiền và quyền hạ KM cấp riêng.
      PERMISSION.VEHICLE_MAINTENANCE_VIEW,
      PERMISSION.VEHICLE_MAINTENANCE_MANAGE,
      PERMISSION.VEHICLE_ODOMETER_CORRECT,
      // docs §10 — staff vận hành "Thực hiện" bàn giao: lập nháp, chụp ảnh, xác nhận tại quầy.
      // KHÔNG kèm `handovers.view_files`: chụp lên là một việc, mở lại kho ảnh bằng chứng của
      // mọi chuyến cũ là việc khác (cùng kỷ luật với giấy tờ xe).
      PERMISSION.HANDOVER_VIEW,
      PERMISSION.HANDOVER_MANAGE,
      PERMISSION.HANDOVER_CONFIRM,
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
      PERMISSION.BRANCH_VIEW,
      PERMISSION.VEHICLE_VIEW,
      PERMISSION.VEHICLE_DOCUMENT_VIEW,
      // Read-only, không nhạy cảm: thấy tình trạng bảo dưỡng nhưng không thấy chi phí (docs §10).
      PERMISSION.VEHICLE_MAINTENANCE_VIEW,
      // "Read-only theo quyền" (docs §10): đọc được biên bản, không lập/không xác nhận/không mở ảnh.
      PERMISSION.HANDOVER_VIEW,
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
  // Chỉ quyền `platform.*`: key tenant (`vehicles.view`…) không cấp được gì cho người không
  // thuộc tenant nào, để lại chỉ gây hiểu nhầm là staff đọc được dữ liệu shop.
  [PLATFORM_ROLE.PLATFORM_STAFF]: [
    PERMISSION.PLATFORM_DASHBOARD_VIEW,
    PERMISSION.PLATFORM_VEHICLE_VIEW,
    PERMISSION.PLATFORM_BOOKING_VIEW,
    PERMISSION.PLATFORM_CUSTOMER_VIEW,
    // Tra cứu danh mục tỉnh: cần để đọc hiểu dữ liệu giám sát. Bật/tắt hiển thị là quyền riêng.
    PERMISSION.PLATFORM_LOCATION_VIEW,
  ],
  [PLATFORM_ROLE.REVIEWER]: [
    PERMISSION.PLATFORM_DASHBOARD_VIEW,
    PERMISSION.PLATFORM_APPROVAL_REVIEW,
    PERMISSION.PLATFORM_VEHICLE_VIEW,
    PERMISSION.PLATFORM_VEHICLE_MODERATE,
  ],
  // Hỗ trợ cần liên hệ được khách → là role duy nhất ngoài admin được bỏ mask PII.
  [PLATFORM_ROLE.SUPPORT]: [
    PERMISSION.PLATFORM_DASHBOARD_VIEW,
    PERMISSION.PLATFORM_VEHICLE_VIEW,
    PERMISSION.PLATFORM_BOOKING_VIEW,
    PERMISSION.PLATFORM_CUSTOMER_VIEW,
    PERMISSION.PLATFORM_CUSTOMER_PII_VIEW,
  ],
  [PLATFORM_ROLE.FINANCE_ADMIN]: [
    PERMISSION.PLATFORM_DASHBOARD_VIEW,
    PERMISSION.FINANCE_VIEW,
    PERMISSION.PLATFORM_TENANT_MANAGE,
    PERMISSION.PLATFORM_BILLING_MANAGE,
    PERMISSION.PLATFORM_BOOKING_VIEW,
  ],
};

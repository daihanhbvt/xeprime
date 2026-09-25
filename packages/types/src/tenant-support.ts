/**
 * Không gian hỗ trợ gian hàng — ADR 0050.
 *
 * Nhân sự nền tảng mở một PHIÊN HỖ TRỢ (support context) cho một gian hàng: có lý do, có hạn, gắn
 * với đúng người và đúng phiên đăng nhập đã mở nó. Trong phiên, họ nhìn thấy khu làm việc của gian
 * hàng qua chính các endpoint tenant-scoped hiện có, nhưng:
 *
 *  - Danh tính KHÔNG đổi: request vẫn là của nhân sự nền tảng, audit ghi `actorScope = platform`.
 *    Không có membership tạm, không đăng nhập thành chủ xe.
 *  - Quyền KHÔNG phải quyền nền tảng gộp vào quyền gian hàng. Server cấp một danh sách
 *    CAPABILITY hẹp dưới đây; mỗi capability mở đúng một bộ quyền tenant (`SUPPORT_CAPABILITY_
 *    PERMISSIONS`), và mỗi endpoint phải TỰ khai capability nó chấp nhận — endpoint không khai là
 *    từ chối (default-deny).
 *
 * File này chỉ chứa hằng số + bảng tra dùng chung web↔api. Phép SUY capability từ gian hàng và từ
 * quyền của người mở phiên sống ở backend (`TenantSupportService`) — client không bao giờ gửi nó.
 */
import { PERMISSION, type Permission } from './rbac';
import { PLAN_FEATURE, type PlanFeature } from './status/billing';

/**
 * Header mang id phiên hỗ trợ trên các request tenant-scoped.
 *
 * Nó KHÔNG phải một cách chọn tenant: giá trị là id phiên (ngẫu nhiên, vô nghĩa), server tra
 * ra tenant từ bản ghi phiên sau khi kiểm người + phiên đăng nhập + hạn + quyền. Gửi id phiên
 * của người khác, hay của phiên đăng nhập khác, đều nhận `SUPPORT_CONTEXT_INVALID`.
 */
export const SUPPORT_CONTEXT_HEADER = 'x-support-context';

/** Chế độ phiên — chọn lúc mở, không đổi được giữa chừng. */
export const SUPPORT_MODE = {
  /** Chỉ xem khu làm việc. */
  VIEW: 'view',
  /** Xem + sửa hộ trong danh sách cho phép của Đợt 1. */
  ASSIST: 'assist',
} as const;
export type SupportMode = (typeof SUPPORT_MODE)[keyof typeof SUPPORT_MODE];
export const SUPPORT_MODE_VALUES = Object.values(SUPPORT_MODE) as SupportMode[];

/**
 * Bộ giao diện gian hàng đang dùng — server suy từ TUYẾN, không nhận từ client.
 *
 *  - `manage`: tuyến gói còn hiệu lực/ân hạn → bộ Full Manage.
 *  - `owner_lite`: tuyến hoa hồng, hoặc gian hàng đã hết gói → bộ Owner Lite.
 *  - `onboarding`: `package_pending` — chưa trả tiền gói đầu tiên, KHÔNG mở bộ quản lý nào; phiên
 *    chỉ đọc được trạng thái đăng ký/thanh toán.
 */
export const SUPPORT_WORKSPACE = {
  MANAGE: 'manage',
  OWNER_LITE: 'owner_lite',
  ONBOARDING: 'onboarding',
} as const;
export type SupportWorkspace = (typeof SUPPORT_WORKSPACE)[keyof typeof SUPPORT_WORKSPACE];
export const SUPPORT_WORKSPACE_VALUES = Object.values(SUPPORT_WORKSPACE) as SupportWorkspace[];

/**
 * Capability của phiên hỗ trợ. Tách theo LĨNH VỰC — một endpoint chỉ đòi đúng một capability, và
 * không có capability "xem mọi thứ" nào (ADR 0050 §10). Capability ĐỌC mở Đợt 2A; capability GHI
 * vẫn đúng bộ của Đợt 1.
 *
 * Những việc KHÔNG có ở đây thì không có đường nào làm qua phiên hỗ trợ: tạo/xoá xe, gửi duyệt,
 * công tắc lên chợ, sửa giá & chính sách, sửa lịch, dịch vụ, giao nhận, thành viên, gói, ví, KYC,
 * thuế, chuyển trạng thái đơn, tiền, chat, sửa KM, huỷ/xoá phiếu bảo dưỡng — và mọi màn TÀI CHÍNH
 * (sổ thu chi, công nợ, quyết toán/cọc, hợp đồng), mọi FILE riêng tư (giấy tờ khách, ảnh bàn giao,
 * chứng từ), ghi chú khách và hồ sơ pháp lý.
 */
export const SUPPORT_CAPABILITY = {
  // ── Đọc (Đợt 2A) ──
  /** Danh sách xe, thống kê, cảnh báo, hồ sơ 360 của xe. */
  VEHICLE_VIEW: 'vehicle.view',
  /** Danh sách + chi tiết chi nhánh. */
  BRANCH_VIEW: 'branch.view',
  /** Lịch xe: tài nguyên, sự kiện, khoảng trống, giá theo ngày. */
  CALENDAR_VIEW: 'calendar.view',
  /** Yêu cầu thuê (danh sách + chi tiết) — liên hệ khách bị che. */
  BOOKING_REQUEST_VIEW: 'booking_request.view',
  /** Đơn thuê (danh sách + chi tiết) — liên hệ khách bị che; KHÔNG quyết toán/cọc, KHÔNG hợp đồng. */
  BOOKING_VIEW: 'booking.view',
  /** Trạng thái bàn giao — KHÔNG ảnh/file bàn giao. */
  HANDOVER_VIEW: 'handover.view',
  /** Sổ khách ở dạng CHE (SĐT/email/địa chỉ) — không ghi chú, không giấy tờ. */
  CUSTOMER_VIEW_MASKED: 'customer.view_masked',
  /** Tài xế, chỉ đọc — SĐT/số giấy tờ bị che. */
  DRIVER_VIEW: 'driver.view',
  /** Thành viên + lời mời, chỉ đọc — email bị che. */
  MEMBER_VIEW: 'member.view',
  /** Thông tin hiển thị công khai của gian hàng (mặt tiền), chỉ đọc. */
  TENANT_PROFILE_VIEW: 'tenant_profile.view',
  /** Chính sách thuê của gian hàng + giá theo xe, chỉ đọc. */
  RENTAL_POLICY_VIEW: 'rental_policy.view',
  /** Gói, hạn mức, trạng thái hoá đơn gói — chỉ đọc, không thông tin chuyển khoản. */
  SUBSCRIPTION_STATUS_VIEW: 'subscription_status.view',
  /** Case hỗ trợ/tranh chấp của gian hàng, chỉ đọc. */
  SUPPORT_CASE_VIEW: 'support_case.view',
  /** Hồ sơ + lịch sử bảo dưỡng, KHÔNG chi phí, KHÔNG mở chứng từ (chỉ bộ Full Manage). */
  MAINTENANCE_VIEW: 'maintenance.view',
  // ── Ghi (Đợt 1) ──
  /** Sửa trường của tab Thông tin xe (không gồm giá, dịch vụ, chi nhánh, trạng thái vận hành). */
  VEHICLE_INFO_EDIT: 'vehicle.info.edit',
  /** Tải lên, thay, sắp xếp, gỡ ảnh xe. */
  VEHICLE_MEDIA_MANAGE: 'vehicle.media.manage',
  /** Tạo và sửa NỘI DUNG phiếu bảo dưỡng, đính chứng từ (chỉ bộ Full Manage). */
  MAINTENANCE_MANAGE: 'maintenance.manage',
} as const;
export type SupportCapability = (typeof SUPPORT_CAPABILITY)[keyof typeof SUPPORT_CAPABILITY];
export const SUPPORT_CAPABILITY_VALUES = Object.values(SUPPORT_CAPABILITY) as SupportCapability[];

/** Capability ghi — rơi mất khi phiên ở chế độ xem, gian hàng bị khoá, hay người mở mất quyền. */
export const SUPPORT_WRITE_CAPABILITIES: readonly SupportCapability[] = [
  SUPPORT_CAPABILITY.VEHICLE_INFO_EDIT,
  SUPPORT_CAPABILITY.VEHICLE_MEDIA_MANAGE,
  SUPPORT_CAPABILITY.MAINTENANCE_MANAGE,
];

export function isSupportCapability(value: unknown): value is SupportCapability {
  return typeof value === 'string' && (SUPPORT_CAPABILITY_VALUES as string[]).includes(value);
}

/**
 * Quyền TENANT mà mỗi capability mở trong phiên — để các endpoint đang dùng
 * `@RequirePermissions(...)` chạy nguyên vẹn, và để giao diện hiện đúng nút.
 *
 * Quyền ở đây RỘNG hơn capability (vd. `vehicles.update` cũng mở sửa giá). Đó là lý do nó KHÔNG
 * phải cổng: cổng là capability khai trên từng endpoint + danh sách trường cho phép của lệnh sửa
 * xe. Bảng này chỉ để các guard/hook hiện có không phải biết về phiên hỗ trợ.
 *
 * Cố ý KHÔNG có `vehicles.maintenance.view_cost`: chi phí và mã phiếu chi là dữ liệu tài chính
 * của gian hàng. Phiên không thấy chúng (response lược hẳn trường) và không ghi được chúng — form
 * bỏ hai trường khỏi lệnh, backend từ chối nếu chúng có mặt, và vắng mặt thì giữ nguyên bản đang
 * lưu (`assertCostWritable`).
 */
export const SUPPORT_CAPABILITY_PERMISSIONS: Readonly<
  Record<SupportCapability, readonly Permission[]>
> = {
  [SUPPORT_CAPABILITY.VEHICLE_VIEW]: [PERMISSION.VEHICLE_VIEW],
  [SUPPORT_CAPABILITY.BRANCH_VIEW]: [PERMISSION.BRANCH_VIEW],
  [SUPPORT_CAPABILITY.CALENDAR_VIEW]: [PERMISSION.CALENDAR_VIEW],
  [SUPPORT_CAPABILITY.BOOKING_REQUEST_VIEW]: [PERMISSION.BOOKING_REQUEST_VIEW],
  [SUPPORT_CAPABILITY.BOOKING_VIEW]: [PERMISSION.BOOKING_VIEW],
  [SUPPORT_CAPABILITY.HANDOVER_VIEW]: [PERMISSION.HANDOVER_VIEW],
  [SUPPORT_CAPABILITY.CUSTOMER_VIEW_MASKED]: [PERMISSION.CUSTOMER_VIEW],
  [SUPPORT_CAPABILITY.DRIVER_VIEW]: [PERMISSION.DRIVER_VIEW],
  [SUPPORT_CAPABILITY.MEMBER_VIEW]: [PERMISSION.MEMBER_VIEW],
  // `tenant.view` còn mở mục chat/trung tâm hỗ trợ trong menu — giao diện lọc chúng theo bảng route
  // của phiên, và server không có `@SupportAction` nào cho chat.
  [SUPPORT_CAPABILITY.TENANT_PROFILE_VIEW]: [PERMISSION.TENANT_VIEW],
  [SUPPORT_CAPABILITY.RENTAL_POLICY_VIEW]: [PERMISSION.TENANT_VIEW, PERMISSION.VEHICLE_VIEW],
  [SUPPORT_CAPABILITY.SUBSCRIPTION_STATUS_VIEW]: [PERMISSION.SUBSCRIPTION_VIEW],
  [SUPPORT_CAPABILITY.SUPPORT_CASE_VIEW]: [PERMISSION.SUPPORT_VIEW],
  [SUPPORT_CAPABILITY.VEHICLE_INFO_EDIT]: [PERMISSION.VEHICLE_UPDATE],
  [SUPPORT_CAPABILITY.VEHICLE_MEDIA_MANAGE]: [PERMISSION.VEHICLE_UPDATE],
  // Cũng KHÔNG có `view_files`: chứng từ phiếu là hoá đơn/biên lai — mang đúng những con số chi phí
  // mà phiên không được thấy. Phiên vẫn ĐÍNH thêm được chứng từ (presign → xác minh), chỉ không mở.
  [SUPPORT_CAPABILITY.MAINTENANCE_VIEW]: [PERMISSION.VEHICLE_MAINTENANCE_VIEW],
  [SUPPORT_CAPABILITY.MAINTENANCE_MANAGE]: [PERMISSION.VEHICLE_MAINTENANCE_MANAGE],
};

/** Hợp các quyền tenant của một bộ capability — thứ tự ổn định, không trùng. */
export function supportPermissionsFor(capabilities: readonly SupportCapability[]): Permission[] {
  const out = new Set<Permission>();
  for (const capability of capabilities) {
    for (const permission of SUPPORT_CAPABILITY_PERMISSIONS[capability]) out.add(permission);
  }
  return [...out];
}

/**
 * Trường của lệnh sửa xe (`PATCH /vehicles/:id`) mà phiên hỗ trợ được GHI, theo capability.
 *
 * Mô tả + tiện ích đi cùng Thông tin: màn Thông tin của Owner Lite gửi chúng, và ở Full Manage
 * chúng nằm dưới thẻ ảnh nhưng vẫn là mô tả chiếc xe, không phải giá hay điều kiện thuê.
 */
export const SUPPORT_VEHICLE_FIELDS: Readonly<
  Partial<Record<SupportCapability, readonly string[]>>
> = {
  [SUPPORT_CAPABILITY.VEHICLE_INFO_EDIT]: [
    'name',
    'plateNumber',
    'brand',
    'model',
    'color',
    'fuelType',
    'bodyType',
    'motorbikeCategory',
    'vehicleCatalogModelId',
    'manufactureYear',
    'seatCount',
    'lengthMm',
    'widthMm',
    'heightMm',
    'curbWeightKg',
    'engineDisplacementCc',
    'horsepowerHp',
    'transmission',
    'fuelConsumptionCity',
    'fuelConsumptionHighway',
    'fuelConsumptionCombined',
    'electricRangeKm',
    'batteryCapacityKwh',
    'electricConsumptionKwhPer100Km',
    'description',
    'features',
  ],
  [SUPPORT_CAPABILITY.VEHICLE_MEDIA_MANAGE]: ['mainImageUrl', 'images', 'media'],
};

/**
 * Cờ gói mà trong phiên hỗ trợ LUÔN là `hidden`, bất kể gói của gian hàng (ADR 0050 §10): tiền
 * (sổ thu chi, lịch sử tiền của đơn, thu tiền), công nợ, hợp đồng, thu cọc qua sàn. Các khu này
 * không có endpoint nào khai `@SupportAction`; đặt cờ về `hidden` là để MỌI component dùng lại đang
 * gác bằng `useFeature(...)` tự ẩn — không một component nào phải biết mình đang ở trong phiên.
 */
export const SUPPORT_HIDDEN_FEATURES: readonly PlanFeature[] = [
  PLAN_FEATURE.FINANCE,
  PLAN_FEATURE.DEBTS,
  PLAN_FEATURE.CONTRACTS,
  PLAN_FEATURE.ESCROW_HOLD,
];

/**
 * Trường mà form Thông tin của Full Manage LUÔN gửi kèm nhưng phiên hỗ trợ KHÔNG được đổi: chi
 * nhánh (vị trí công khai), loại xe, dịch vụ, trạng thái vận hành. Có mặt trong lệnh sửa là được
 * nếu giá trị GIỐNG HỆT bản đang lưu — server so với bản ghi, không tin client.
 */
export const SUPPORT_VEHICLE_PINNED_FIELDS: readonly string[] = [
  'branchId',
  'vehicleType',
  'serviceTypes',
  'operationStatus',
];

/** Thời hạn một phiên — ADR 0050 điều 3. Không gia hạn: hết là mở phiên mới, kèm lý do mới. */
export const SUPPORT_CONTEXT_TTL_MINUTES = 45;

/** Độ dài lý do — đủ để người đọc audit hiểu vì sao, không phải một ô ký hiệu. */
export const SUPPORT_REASON_LIMITS = { min: 10, max: 500 } as const;

/** Chiều dài id phiên (ký tự Crockford base32, ~130 bit ngẫu nhiên). */
export const SUPPORT_CONTEXT_ID_LENGTH = 26;

/** Cùng bảng chữ Crockford base32 với ULID — id phiên có dáng một id bình thường trong URL. */
const SUPPORT_CONTEXT_ID_PATTERN = /^[0-9A-HJKMNP-TV-Z]{26}$/;

export function isSupportContextId(value: unknown): value is string {
  return typeof value === 'string' && SUPPORT_CONTEXT_ID_PATTERN.test(value);
}

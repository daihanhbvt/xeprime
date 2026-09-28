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

/**
 * Header mang LÝ DO RIÊNG của một thao tác mức trung bình/cao (ADR 0050 §13) — mã hoá bằng
 * `encodeURIComponent` vì header chỉ nhận ASCII. Client không tự quyết khi nào gửi: server trả
 * `SUPPORT_REASON_REQUIRED` (428) trước khi ghi, client hỏi người thao tác rồi gửi lại.
 */
export const SUPPORT_REASON_HEADER = 'x-support-reason';

/** Chế độ phiên — chọn lúc mở, không đổi được giữa chừng. */
export const SUPPORT_MODE = {
  /** Chỉ xem khu làm việc. */
  VIEW: 'view',
  /** Xem + thao tác hộ trong đúng danh sách capability GHI (Đợt 1 + 2B). */
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
 * Những việc KHÔNG có ở đây thì không có đường nào làm qua phiên hỗ trợ: xoá xe, công tắc lên chợ,
 * SỬA HỒ SƠ GIAN HÀNG (mặt tiền công khai chỉ đọc qua `tenant_profile.view` — kể cả logo/ảnh bìa), sửa giá & chính sách, sửa lịch, dịch vụ, giao nhận, thành viên, gói, ví, KYC,
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
  /**
   * Tạo và sửa NỘI DUNG phiếu bảo dưỡng, đính chứng từ (chỉ bộ Full Manage). Tên giữ nguyên từ Đợt 1
   * (đề bài 2B gọi là `maintenance.record.manage`) — đổi tên là viết lại dữ liệu phiên đã lưu.
   */
  MAINTENANCE_MANAGE: 'maintenance.manage',
  // ── Ghi (Đợt 2B) ──
  /** Tạo xe ở trạng thái NHÁP (chỉ bộ Full Manage) — không giá, không gửi duyệt, không lên chợ. */
  VEHICLE_CREATE_DRAFT: 'vehicle.create_draft',
  /** Thêm giấy tờ xe, sửa loại/ngày/ghi chú, tải phiên bản mới — KHÔNG xem chi tiết/file, KHÔNG OCR. */
  VEHICLE_DOCUMENT_MANAGE: 'vehicle.document.manage',
  /** Chuyển xe sang chi nhánh khác của gian hàng (đổi vị trí công khai) — Full Manage có cờ chi nhánh. */
  VEHICLE_BRANCH_REASSIGN: 'vehicle.branch.reassign',
  /** Loại dịch vụ, trạng thái vận hành, khung giờ giao/nhận, thời gian chết, điều kiện thuê không dính tiền. */
  VEHICLE_OPERATIONS_UPDATE: 'vehicle.operations.update',
  /** Tạo khoá lịch tương lai; sửa/gỡ khoá lịch do CHÍNH phiên tạo. */
  VEHICLE_SCHEDULE_BLOCK_MANAGE: 'vehicle.schedule_block.manage',
  /** Tạo chi nhánh, sửa tên/liên hệ/địa chỉ — KHÔNG ngưng, KHÔNG đổi mặc định (chỉ Full Manage). */
  BRANCH_BASIC_MANAGE: 'branch.basic_manage',
  /** Gửi xe vào hàng đợi duyệt công khai thay chủ xe — không bao giờ tự duyệt. */
  VEHICLE_SUBMIT_REVIEW: 'vehicle.submit_review',
  /** Đồng bộ lại snapshot công khai của MỘT xe từ dữ liệu nguồn — thao tác sửa chữa của nền tảng. */
  LISTING_REPAIR: 'listing.repair',
} as const;
export type SupportCapability = (typeof SUPPORT_CAPABILITY)[keyof typeof SUPPORT_CAPABILITY];
export const SUPPORT_CAPABILITY_VALUES = Object.values(SUPPORT_CAPABILITY) as SupportCapability[];

/** Capability ghi — rơi mất khi phiên ở chế độ xem, gian hàng bị khoá, hay người mở mất quyền. */
export const SUPPORT_WRITE_CAPABILITIES: readonly SupportCapability[] = [
  SUPPORT_CAPABILITY.VEHICLE_INFO_EDIT,
  SUPPORT_CAPABILITY.VEHICLE_MEDIA_MANAGE,
  SUPPORT_CAPABILITY.MAINTENANCE_MANAGE,
  SUPPORT_CAPABILITY.VEHICLE_CREATE_DRAFT,
  SUPPORT_CAPABILITY.VEHICLE_DOCUMENT_MANAGE,
  SUPPORT_CAPABILITY.VEHICLE_BRANCH_REASSIGN,
  SUPPORT_CAPABILITY.VEHICLE_OPERATIONS_UPDATE,
  SUPPORT_CAPABILITY.VEHICLE_SCHEDULE_BLOCK_MANAGE,
  SUPPORT_CAPABILITY.BRANCH_BASIC_MANAGE,
  SUPPORT_CAPABILITY.VEHICLE_SUBMIT_REVIEW,
  SUPPORT_CAPABILITY.LISTING_REPAIR,
];

/**
 * Capability GHI mức trung bình/cao — mỗi lần dùng cần LÝ DO RIÊNG (header `x-support-reason`),
 * không kế thừa lý do của phiên (ADR 0050 §13). Chúng đổi thứ khách nhìn thấy (vị trí công khai,
 * snapshot listing), đổi lịch nhận chuyến, hay đưa xe vào hàng đợi duyệt. Ba capability còn lại (thông tin,
 * ảnh, nội dung phiếu bảo dưỡng) là rủi ro thấp và dùng lý do của phiên.
 */
export const SUPPORT_REASON_REQUIRED_CAPABILITIES: readonly SupportCapability[] = [
  SUPPORT_CAPABILITY.VEHICLE_CREATE_DRAFT,
  SUPPORT_CAPABILITY.VEHICLE_DOCUMENT_MANAGE,
  SUPPORT_CAPABILITY.VEHICLE_BRANCH_REASSIGN,
  SUPPORT_CAPABILITY.VEHICLE_OPERATIONS_UPDATE,
  SUPPORT_CAPABILITY.VEHICLE_SCHEDULE_BLOCK_MANAGE,
  SUPPORT_CAPABILITY.BRANCH_BASIC_MANAGE,
  SUPPORT_CAPABILITY.VEHICLE_SUBMIT_REVIEW,
  SUPPORT_CAPABILITY.LISTING_REPAIR,
];

export function supportCapabilityNeedsReason(capability: SupportCapability): boolean {
  return SUPPORT_REASON_REQUIRED_CAPABILITIES.includes(capability);
}

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
  [SUPPORT_CAPABILITY.VEHICLE_CREATE_DRAFT]: [PERMISSION.VEHICLE_CREATE],
  // KHÔNG `view_details`/`view_files`: tải lên được nhưng không đọc được số giấy tờ, tên/địa chỉ
  // chủ giấy tờ, hay file — đúng bốn mức quyền mà domain giấy tờ xe đã tách.
  [SUPPORT_CAPABILITY.VEHICLE_DOCUMENT_MANAGE]: [
    PERMISSION.VEHICLE_DOCUMENT_VIEW,
    PERMISSION.VEHICLE_DOCUMENT_MANAGE,
  ],
  [SUPPORT_CAPABILITY.VEHICLE_BRANCH_REASSIGN]: [PERMISSION.VEHICLE_UPDATE],
  [SUPPORT_CAPABILITY.VEHICLE_OPERATIONS_UPDATE]: [PERMISSION.VEHICLE_UPDATE],
  [SUPPORT_CAPABILITY.VEHICLE_SCHEDULE_BLOCK_MANAGE]: [PERMISSION.VEHICLE_BLOCK_SCHEDULE],
  [SUPPORT_CAPABILITY.BRANCH_BASIC_MANAGE]: [PERMISSION.BRANCH_MANAGE],
  [SUPPORT_CAPABILITY.VEHICLE_SUBMIT_REVIEW]: [PERMISSION.VEHICLE_SUBMIT_PUBLIC],
  // Không quyền tenant nào: đây là thao tác của NỀN TẢNG, chỉ có trong phiên (endpoint tự kiểm).
  [SUPPORT_CAPABILITY.LISTING_REPAIR]: [],
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
 * Trường của `PATCH /vehicles/:id` mà phiên CHỈ được ĐỔI khi có capability riêng — có mặt với giá
 * trị GIỐNG HỆT bản đang lưu thì là no-op (form Thông tin luôn gửi kèm chúng). Server so trong
 * transaction sau khi khoá xe; đổi thật thì đòi đúng capability + lý do riêng.
 */
export const SUPPORT_VEHICLE_CONDITIONAL_FIELDS: Readonly<Record<string, SupportCapability>> = {
  branchId: SUPPORT_CAPABILITY.VEHICLE_BRANCH_REASSIGN,
  serviceTypes: SUPPORT_CAPABILITY.VEHICLE_OPERATIONS_UPDATE,
  operationStatus: SUPPORT_CAPABILITY.VEHICLE_OPERATIONS_UPDATE,
  deliveryEnabled: SUPPORT_CAPABILITY.VEHICLE_OPERATIONS_UPDATE,
};

/**
 * Trường của `POST /vehicles` phiên được gửi (tạo xe NHÁP). Cố ý thiếu: mọi trường GIÁ và giảm
 * giá, `sourceType` (nguồn xe — sổ sách tài chính), `operationStatus` (xe mới luôn ở mặc định).
 */
export const SUPPORT_VEHICLE_CREATE_FIELDS: readonly string[] = [
  'code',
  'name',
  'branchId',
  'vehicleType',
  'serviceTypes',
  'deliveryEnabled',
  ...(SUPPORT_VEHICLE_FIELDS[SUPPORT_CAPABILITY.VEHICLE_INFO_EDIT] ?? []),
  ...(SUPPORT_VEHICLE_FIELDS[SUPPORT_CAPABILITY.VEHICLE_MEDIA_MANAGE] ?? []),
];

/**
 * Trường của `PATCH /vehicles/:id/service-settings/:serviceType` phiên được đổi — điều kiện vận
 * hành. Cố ý thiếu: `autoAcceptEnabled` (tự tạo cam kết với khách), `termsText`/
 * `requireTermsAcceptance` (điều khoản có tác động pháp lý), `depositMode` (tiền cọc). Ba nhóm đó
 * có mặt với giá trị GIỐNG HỆT bản đang lưu thì được bỏ qua — form gửi cả khối.
 */
export const SUPPORT_SERVICE_SETTING_FIELDS: readonly string[] = [
  'minRentalMinutes',
  'preferredRouteTypes',
  'requiredDocuments',
  'identityVerifyMethod',
];
export const SUPPORT_SERVICE_SETTING_PINNED_FIELDS: readonly string[] = [
  'autoAcceptEnabled',
  'termsText',
  'requireTermsAcceptance',
  'depositMode',
];

/**
 * Trường của lệnh tạo/sửa giấy tờ xe phiên được GHI. Số giấy tờ, tên/địa chỉ chủ giấy tờ, số khung,
 * số máy, biển số là dữ liệu định danh mà phiên không XEM được — nên cũng không ghi đè mù. Có mặt
 * với giá trị rỗng (form để trống) thì bị bỏ qua; có giá trị thì từ chối.
 */
export const SUPPORT_VEHICLE_DOCUMENT_FIELDS: readonly string[] = [
  'type',
  'customTypeName',
  'issuedAt',
  'expiresAt',
  'notes',
  'expectedRowVersion',
];
export const SUPPORT_VEHICLE_DOCUMENT_BLANK_ONLY_FIELDS: readonly string[] = [
  'documentNumber',
  'holderName',
  'holderAddress',
  'plateNumber',
  'chassisNumber',
  'engineNumber',
];

/** Trường của `POST/PATCH /branches` phiên được gửi — tên, liên hệ, địa chỉ + ghim. */
export const SUPPORT_BRANCH_FIELDS: readonly string[] = [
  'name',
  'phone',
  'provinceCode',
  'wardCode',
  'addressLine',
  'address',
  'placeId',
  'latitude',
  'longitude',
  'locationSource',
];

/**
 * Lý do có "đủ nghĩa" không (ADR 0050 §13) — dùng cho lý do mở phiên LẪN lý do riêng từng thao tác.
 *
 * Một mã ticket/yêu cầu (`#1234`, `SC-000123`) là đủ. Ngoài ra phải ≥ 10 ký tự và KHÔNG chỉ gồm
 * những chữ chung chung ("hỗ trợ", "admin sửa", "theo yêu cầu"…): người đọc audit phải biết VÌ SAO,
 * không chỉ biết là có người đã làm.
 */
export function isMeaningfulSupportReason(raw: string): boolean {
  const text = raw.trim();
  if (text.length > SUPPORT_REASON_LIMITS.max) return false;
  if (SUPPORT_TICKET_PATTERN.test(text)) return true;
  if (text.length < SUPPORT_REASON_LIMITS.min) return false;
  const words = normalizeReason(text).split(/\s+/).filter(Boolean);
  return words.some((word) => !GENERIC_REASON_WORDS.has(word));
}

/** Mã ticket / case / yêu cầu của chủ xe — `#1234`, `SC-000123`, `TK-42`. */
const SUPPORT_TICKET_PATTERN = /(^|\s)(#\d{2,}|[A-Za-z]{2,5}-\d{2,})(\s|$|[.,;:])/;

/**
 * Chữ không mang thông tin khi đứng một mình. Lý do chỉ gồm các chữ này (dù dài) bị từ chối:
 * "hỗ trợ theo yêu cầu", "admin sửa giúp", "chủ xe nhờ sửa".
 */
const GENERIC_REASON_WORDS: ReadonlySet<string> = new Set([
  'ho', 'tro', 'admin', 'sua', 'theo', 'yeu', 'cau', 'giup', 'dum', 'nho', 'chu', 'xe',
  'gian', 'hang', 'khach', 'cap', 'nhat', 'thay', 'doi', 'lai', 'da', 'can', 'de', 'cho', 'va',
  'la', 'thao', 'tac', 'xu', 'ly', 'kiem', 'tra', 'test', 'support', 'fix', 'update', 'edit',
  'request', 'requested', 'by', 'owner', 'help', 'the', 'a', 'per', 'as', 'thong', 'tin', 'tu',
  'nen', 'tang', 'phien', 'viec', 'mot', 'so', 'bi', 'loi', 'ok', 'duoc',
]);

function normalizeReason(text: string): string {
  return text
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/đ/gi, 'd')
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, ' ');
}

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
 * Trường mà form Thông tin LUÔN gửi kèm nhưng KHÔNG capability nào của phiên đổi được: loại xe (căn
 * cước chiếc xe). Có mặt với giá trị GIỐNG HỆT bản đang lưu thì là no-op. Chi nhánh, dịch vụ, trạng
 * thái vận hành, giao xe là trường CÓ ĐIỀU KIỆN (`SUPPORT_VEHICLE_CONDITIONAL_FIELDS`) từ Đợt 2B.
 */
export const SUPPORT_VEHICLE_PINNED_FIELDS: readonly string[] = ['vehicleType'];

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

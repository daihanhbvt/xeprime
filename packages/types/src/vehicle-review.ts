/**
 * DUYỆT XE của nền tảng — luật và hình dạng mà backend (cổng thật), web (checklist) và seed cùng
 * đọc (24/09/2026).
 *
 * Ba thứ sống ở đây, và cả ba đều là thứ hai phía KHÔNG được phép hiểu khác nhau:
 *
 *  1. **Danh mục kiểm tra THỦ CÔNG** (`VEHICLE_REVIEW_CHECK`) — năm câu hỏi chỉ con người trả lời
 *     được (ảnh có đúng chiếc xe không, biển số có đọc được không…). Backend chặn phê duyệt khi
 *     còn mục chưa đạt; web khoá nút theo CÙNG hàm `missingVehicleReviewChecks`. Hai bản luật lệch
 *     nhau là đúng cái kịch bản "nút sáng, bấm ra 409" mà `vehicle-publication.ts` đã phải dọn.
 *  2. **Danh mục kiểm tra TỰ ĐỘNG** — KHÔNG có bộ luật thứ hai: `vehicleReviewAutoChecks` chỉ
 *     đưa snapshot vào `applicablePublishRequirements`/`missingPublishRequirements`, tức chính cổng
 *     gửi duyệt của chủ xe.
 *  3. **Hình dạng snapshot v2** (`VehicleReviewSnapshot`) — thứ được DUYỆT là thứ chủ xe đã gửi,
 *     không phải bản ghi sống có thể đã đổi sau đó.
 *
 * ⚠️ Không có giấy tờ xe ở đây, có chủ đích. Luồng đăng xe hiện KHÔNG thu đăng ký, đăng kiểm hay
 * bảo hiểm TNDS; một mục "Đăng kiểm còn hạn" trong danh mục kiểm tra là bảo người duyệt xác nhận
 * một thứ không ai nộp. Khi luồng đăng xe thu giấy tờ thật, thêm mục vào đây CÙNG lúc với dữ liệu.
 */

import { applicablePublishRequirements, missingPublishRequirements } from './vehicle-publication';
import type { PublishRequirement, VehiclePublicationInput } from './vehicle-publication';
import type { StorefrontKind } from './shop-storefront';
import { VEHICLE_LOCKED_AFTER_APPROVAL_FIELDS, type VehicleLockedField } from './status/vehicle';

// ---------------------------------------------------------------------------
// Quyết định
// ---------------------------------------------------------------------------

/** Ba quyết định trên một phiếu duyệt — mã đi trên dây và trong route, không phải chữ. */
export const APPROVAL_DECISION = {
  APPROVE: 'approve',
  REJECT: 'reject',
  REQUEST_REVISION: 'request_revision',
} as const;

export type ApprovalDecision = (typeof APPROVAL_DECISION)[keyof typeof APPROVAL_DECISION];

export const APPROVAL_DECISION_VALUES = Object.values(APPROVAL_DECISION) as ApprovalDecision[];

// ---------------------------------------------------------------------------
// Kiểm tra thủ công
// ---------------------------------------------------------------------------

export const VEHICLE_REVIEW_CHECK = {
  /** Ảnh là ảnh THẬT của chính chiếc xe, không phải ảnh mạng/ảnh mẫu của hãng. */
  PHOTOS_MATCH: 'photos_match',
  /** Biển số đọc được trong ít nhất một tấm ảnh và khớp biển số đã khai. */
  PLATE_VISIBLE: 'plate_visible',
  /** Hãng · dòng · đời · thông số hợp lý với nhau và với giá. */
  INFO_PLAUSIBLE: 'info_plausible',
  /** Không phải một chiếc xe đã có trên hệ thống (cùng biển số / cùng bộ ảnh). */
  NOT_DUPLICATE: 'not_duplicate',
  /** Tên, mô tả, điều khoản không hứa điều xe không có. */
  CONTENT_NOT_MISLEADING: 'content_not_misleading',
} as const;

export type VehicleReviewCheck = (typeof VEHICLE_REVIEW_CHECK)[keyof typeof VEHICLE_REVIEW_CHECK];

/** Thứ tự HIỂN THỊ — cũng là thứ tự người duyệt đi qua: nhìn ảnh trước, đọc chữ sau. */
export const VEHICLE_REVIEW_CHECK_VALUES = Object.values(
  VEHICLE_REVIEW_CHECK,
) as VehicleReviewCheck[];

export function isVehicleReviewCheck(value: unknown): value is VehicleReviewCheck {
  return typeof value === 'string' && (VEHICLE_REVIEW_CHECK_VALUES as string[]).includes(value);
}

/**
 * Mục thủ công CHƯA đạt — rỗng ⇒ được phê duyệt.
 *
 * Nhận danh sách trạng thái đã lưu (mục chưa từng được đánh dấu thì không có dòng nào, và điều đó
 * nghĩa là CHƯA đạt — không phải "không áp dụng"). Cả năm mục đều bắt buộc: mỗi mục là một câu
 * hỏi mà nếu bỏ qua thì chiếc xe lên chợ với đúng rủi ro câu hỏi đó sinh ra để chặn.
 */
export function missingVehicleReviewChecks(
  states: ReadonlyArray<{ key: string; passed: boolean }>,
): VehicleReviewCheck[] {
  const passed = new Set(states.filter((s) => s.passed).map((s) => s.key));
  return VEHICLE_REVIEW_CHECK_VALUES.filter((key) => !passed.has(key));
}

/** Lý do gửi chủ xe khi từ chối / yêu cầu bổ sung — cùng trần ở DTO và ở ô nhập. */
export const APPROVAL_REASON_MAX_LENGTH = 2000;

/**
 * Ghi chú NỘI BỘ của người duyệt — không bao giờ gửi cho chủ xe.
 *
 * Trần giữ bằng CHECK ở DB (`approval_tasks_internal_note_length_check`), DTO và ô nhập cùng đọc
 * hằng này.
 */
export const APPROVAL_INTERNAL_NOTE_MAX_LENGTH = 2000;

// ---------------------------------------------------------------------------
// Snapshot
// ---------------------------------------------------------------------------

/**
 * Phiên bản hình dạng `approval_tasks.snapshot_json` của phiếu duyệt xe.
 *
 * v1 (không có khoá `schemaVersion`) là hình dạng PHẲNG cũ: thiếu chính sách giao xe, giới hạn
 * km, tự nhận chuyến, điều khoản, tiện nghi và địa chỉ nhận xe. Snapshot là jsonb ĐÓNG BĂNG,
 * không migrate — nơi đọc nhận ra v1 bằng việc thiếu khoá này và nói thẳng điều đó với người
 * duyệt thay vì vẽ một hồ sơ trông như đầy đủ.
 */
export const VEHICLE_REVIEW_SNAPSHOT_VERSION = 2;

/**
 * Dữ liệu trên màn chi tiết phiếu đến từ ĐÂU.
 *
 * `snapshot` — ảnh chụp v2 lúc gửi: đúng thứ được duyệt. `live` — phiếu cũ (v1 hoặc không có
 * snapshot) được dựng từ dữ liệu HIỆN TẠI của xe; giao diện phải nói rõ điều đó, vì người duyệt
 * đang nhìn một thứ có thể khác với thứ chủ xe đã gửi.
 */
export const VEHICLE_REVIEW_BASIS = {
  SNAPSHOT: 'snapshot',
  LIVE: 'live',
} as const;

export type VehicleReviewBasis = (typeof VEHICLE_REVIEW_BASIS)[keyof typeof VEHICLE_REVIEW_BASIS];

export const VEHICLE_REVIEW_BASIS_VALUES = Object.values(
  VEHICLE_REVIEW_BASIS,
) as VehicleReviewBasis[];

/** Thiết lập theo DỊCH VỤ xe đăng (`vehicle_service_settings`) — tự nhận chuyến, điều khoản. */
export interface VehicleReviewServiceSnapshot {
  serviceType: string;
  autoAcceptEnabled: boolean;
  termsText: string | null;
}

/**
 * Chính sách thuê HIỆU LỰC của xe lúc gửi — bản ghi đè riêng, nếu không thì mặc định gian hàng
 * (cùng precedence với `PricingService.effectivePolicy`, và `source` nói nó đến từ đâu).
 */
export interface VehicleReviewPolicySnapshot {
  /** @xeprime/types → PolicySource */
  source: string;
  /** @xeprime/types → CollateralMode */
  collateralMode: string;
  collateralAssetTypes: string[];
  depositAmount: string;
  deliveryEnabled: boolean;
  deliveryMaxRadiusKm: number | null;
  /** Bậc phí theo khoảng cách, `toKm` tăng dần; `fee = '0'` là vùng miễn phí. */
  deliveryTiers: Array<{ toKm: number; fee: string }>;
  /** `null` cùng `excessDistanceFeePerKm` = không giới hạn quãng đường. */
  includedDistanceKmPerDay: number | null;
  excessDistanceFeePerKm: string | null;
  overtimeFeePerHour: string | null;
  /** Ưu đãi cam kết thời hạn — chỉ có nghĩa với dịch vụ thuê dài hạn (ADR 0011). */
  discountEnabled: boolean;
  discountTiers: Array<{ minMonths: number; percent: number }>;
}

/** Điểm nhận xe = chi nhánh xe thuộc về, với địa chỉ ĐẦY ĐỦ lúc gửi. */
export interface VehicleReviewPickupSnapshot {
  branchId: string;
  branchName: string;
  /** Chuỗi địa chỉ server đã ghép (số nhà · xã · tỉnh). */
  address: string | null;
  /** Phần chi tiết người dùng gõ (số nhà, đường). */
  addressLine: string | null;
  wardName: string | null;
  provinceCode: string | null;
  provinceName: string | null;
}

/**
 * NGUỒN ĐĂNG lúc gửi — Gian hàng hay Cá nhân, suy bằng `resolveStorefrontKind` từ tuyến thu phí
 * hiệu lực (KHÔNG từ `tenant_type` — ADR 0014 điều 2).
 */
export interface VehicleReviewSourceSnapshot {
  storefrontKind: StorefrontKind;
  tenantId: string;
  name: string;
}

export interface VehicleReviewVehicleSnapshot {
  id: string;
  code: string;
  name: string;
  plateNumber: string | null;
  vehicleType: string;
  serviceTypes: string[];
  brand: string | null;
  model: string | null;
  manufactureYear: number | null;
  color: string | null;
  seatCount: number | null;
  bodyType: string | null;
  motorbikeCategory: string | null;
  fuelType: string | null;
  transmission: string | null;
  /** Decimal → string (ADR 0007), kể cả khi không phải tiền: không đi qua float. */
  fuelConsumptionCombined: string | null;
  engineDisplacementCc: number | null;
  electricRangeKm: number | null;
  batteryCapacityKwh: string | null;
  electricConsumptionKwhPer100Km: string | null;
  description: string | null;
  mainImageUrl: string | null;
  /** TOÀN BỘ ảnh lúc gửi — ảnh đại diện đứng đầu, đã khử trùng. */
  images: string[];
  /** Khoá tiện nghi (`vehicle_features.feature_key`). */
  features: string[];
}

export interface VehicleReviewPricingSnapshot {
  weekdayPrice: string | null;
  weekendPrice: string | null;
  hourlyPrice: string | null;
  monthlyPrice: string | null;
  withDriverDailyPrice: string | null;
  withDriverInterCityPrice: string | null;
  withDriverOneWayPrice: string | null;
  discountPercent: number | null;
}

/** `approval_tasks.snapshot_json` của phiếu duyệt xe từ 24/09/2026. */
export interface VehicleReviewSnapshot {
  schemaVersion: typeof VEHICLE_REVIEW_SNAPSHOT_VERSION;
  /** ISO-8601 UTC. */
  capturedAt: string;
  vehicle: VehicleReviewVehicleSnapshot;
  pricing: VehicleReviewPricingSnapshot;
  services: VehicleReviewServiceSnapshot[];
  policy: VehicleReviewPolicySnapshot | null;
  pickup: VehicleReviewPickupSnapshot | null;
  source: VehicleReviewSourceSnapshot;
}

// ---------------------------------------------------------------------------
// Xe đã đổi sau khi gửi
// ---------------------------------------------------------------------------

type LockedFieldValues = { [K in VehicleLockedField]?: string | number | null };

function lockedValue(value: string | number | null | undefined): string {
  return value === null || value === undefined ? '' : String(value).trim();
}

/**
 * Các trường CĂN CƯỚC (khoá sau khi duyệt — `VEHICLE_LOCKED_AFTER_APPROVAL_FIELDS`) mà xe hiện tại
 * khác với lúc gửi.
 *
 * Vì sao chỉ nhóm này: giá, ảnh, mô tả, chính sách vẫn sửa tự do SAU khi duyệt (hiệu lực ngay), nên
 * chúng đổi trong lúc chờ cũng không làm lời duyệt sai. Căn cước thì khác — duyệt là KHOÁ nó lại, và
 * khoá một biển số người duyệt chưa từng thấy là biến danh mục kiểm tra thành bằng chứng về một
 * chiếc xe khác. Backend chặn Phê duyệt khi danh sách này khác rỗng; web hiện cảnh báo trước.
 */
export function changedLockedVehicleFields(
  submitted: LockedFieldValues,
  current: LockedFieldValues,
): VehicleLockedField[] {
  return VEHICLE_LOCKED_AFTER_APPROVAL_FIELDS.filter(
    (field) => lockedValue(submitted[field]) !== lockedValue(current[field]),
  );
}

// ---------------------------------------------------------------------------
// Kiểm tra tự động
// ---------------------------------------------------------------------------

/**
 * Lát cắt tối thiểu để chấm cổng lên chợ — khai LỎNG (mọi trường tuỳ chọn) để cả snapshot của
 * backend lẫn DTO sinh từ OpenAPI ở web đều đưa vào được mà không phải nhào nặn.
 */
export interface VehicleReviewPublicationSource {
  vehicle: Omit<VehiclePublicationInput, 'branchProvinceCode' | 'serviceTypes'> & {
    serviceTypes?: readonly string[] | null;
    images?: readonly string[] | null;
  };
  pricing: Pick<VehiclePublicationInput, 'weekdayPrice' | 'monthlyPrice' | 'withDriverDailyPrice'>;
  pickup?: { provinceCode?: string | null } | null;
}

export interface VehicleReviewAutoCheck {
  key: PublishRequirement;
  passed: boolean;
}

/**
 * Danh mục kiểm tra TỰ ĐỘNG của một phiếu — chính cổng gửi duyệt, chấm trên snapshot.
 *
 * Chỉ trả những điều kiện ÁP DỤNG với chiếc xe này (xe chỉ chạy tự lái không bị chấm giá có tài
 * xế). Số ảnh đếm trên `images` của snapshot — cùng tập URL khác nhau mà backend đếm lúc gửi.
 */
export function vehicleReviewAutoChecks(
  review: VehicleReviewPublicationSource,
): VehicleReviewAutoCheck[] {
  const input: VehiclePublicationInput = {
    ...review.vehicle,
    serviceTypes: review.vehicle.serviceTypes ?? [],
    weekdayPrice: review.pricing.weekdayPrice,
    monthlyPrice: review.pricing.monthlyPrice,
    withDriverDailyPrice: review.pricing.withDriverDailyPrice,
    branchProvinceCode: review.pickup?.provinceCode ?? null,
  };
  const imageCount = new Set(
    [review.vehicle.mainImageUrl, ...(review.vehicle.images ?? [])].filter(
      (url): url is string => typeof url === 'string' && url !== '',
    ),
  ).size;
  const missing = new Set(missingPublishRequirements(input, imageCount));
  return applicablePublishRequirements(input).map((item) => ({
    key: item.key,
    passed: !missing.has(item.key),
  }));
}

/**
 * Bậc gói gian hàng — hình dạng núm vặn của một bậc và cách đọc nó an toàn.
 * ADR 0041 (ghi đè ADR 0015 điều 1/3/8 và ADR 0029 điều 3) · ADR 0024 · ADR 0038.
 *
 * `plans.limits_json` là DỮ LIỆU admin sửa được (trần xe / trần chi nhánh / bảng giá / số ngày
 * ân hạn / cờ năng lực); QUY TẮC nằm trong code (BillingService). File này chỉ đóng đinh HÌNH
 * DẠNG và cung cấp parser phòng thủ — một jsonb hỏng/thiếu key không được phép làm sập đường
 * đọc gói ở api, web hay mobile.
 *
 * Tiền trong JSON là CHUỖI thập phân (cùng kỷ luật ADR 0007 — không bao giờ `number` cho tiền);
 * số đếm (xe, chi nhánh, tháng, ngày) là `number`.
 */

import { isPlanFeature, type PlanFeature } from './status/billing';

// ── Kỳ hạn ──────────────────────────────────────────────────────────────────

/**
 * Các kỳ hạn bán được, tính bằng THÁNG LỊCH (ADR 0015 điều 2) —
 * `endsAt = addCalendarMonthsVn(startsAt, termMonths)`, không bao giờ `× 30 ngày`.
 * DB canh cùng danh sách này bằng CHECK `tenant_subscriptions_term_months_check`
 * — thêm kỳ hạn mới thì sửa CẢ HAI nơi.
 */
export const SUBSCRIPTION_TERM_MONTHS = [1, 3, 6, 12] as const;
export type SubscriptionTermMonths = (typeof SUBSCRIPTION_TERM_MONTHS)[number];

export function isSubscriptionTermMonths(value: unknown): value is SubscriptionTermMonths {
  return (SUBSCRIPTION_TERM_MONTHS as readonly number[]).includes(value as number);
}

/**
 * Hạn chuyển khoản của một hoá đơn gói `issued` (ADR 0015 điều 5). Quá hạn job vòng đời lật
 * `void` — mã đối soát chết theo, tiền chuyển muộn rơi vào hàng khớp tay của admin (ADR 0022).
 */
export const SUBSCRIPTION_INVOICE_TTL_HOURS = 72;

/** Nhắc gia hạn trước khi gói hết hạn bao nhiêu ngày (job vòng đời — ADR 0016 điều 3). */
export const SUBSCRIPTION_RENEWAL_REMINDER_DAYS = 7;

/**
 * Kỳ hạn của một dòng thuê bao TUYẾN HOA HỒNG do hệ thống tự gán — 0đ, không hoá đơn.
 *
 * Dùng ở HAI đường, và cả hai đều là "tenant phải luôn có một gói hiện hành" (ADR 0015 điều 9):
 *  - `registerShop` gán gói mặc định ngay lúc mở gian hàng;
 *  - job vòng đời gán lại khi gói hết hạn + ân hạn (ADR 0020 điều 5).
 *
 * 12 tháng để không đường nào phải tự gia hạn mỗi tháng. Không có gói hiện hành là trạng thái
 * KHÔNG được phép tồn tại: guard năng lực (ADR 0027) đọc cờ từ gói, nên tenant không gói sẽ mất
 * sạch tính năng nâng cao ngay ngày bật cổng chặn.
 */
export const COMMISSION_TRACK_TERM_MONTHS = 12;

/**
 * Mã của GÓI MẶC ĐỊNH tuyến hoa hồng — bậc duy nhất của tuyến đó, và nó không phải một SKU.
 *
 * Tuyến hoa hồng có ĐÚNG MỘT bậc (quyết định sản phẩm 15/09/2026): mọi chủ xe cá nhân vào cửa
 * bằng chính nó, phí dịch vụ 10% thu qua khoản giữ chỗ của KHÁCH (ADR 0029 điều 2), không có kỳ
 * hạn nào để mua và không có gì để gia hạn. Vì thế nó:
 *
 *  - KHÔNG xuất hiện trong danh mục gói bán cho gian hàng (`listPlansForTenant` lọc nó ra);
 *  - KHÔNG được archive — archive nó là gỡ mất tuyến vào cửa của toàn sàn;
 *  - KHÔNG được đổi sang `package`, và không được có bậc hoa hồng thứ hai bên cạnh.
 *
 * Hằng này là mã mà SEED tạo ra. Phép nhận diện thật ở backend là `billingMode = commission`
 * (bậc duy nhất mang chế độ đó), không phải so chuỗi — mã ở đây để seed, tài liệu và màn quản
 * trị gói gọi cùng một thứ bằng cùng một tên.
 */
export const DEFAULT_COMMISSION_PLAN_CODE = 'free';

// ── Phạm vi loại xe của một bậc gói (ADR 0065) ─────────────────────────────

/**
 * Một bậc gói bán cho LOẠI XE nào — ADR 0065 (chủ sản phẩm chốt 21/10/2026).
 *
 * Gian hàng mua gói theo từng loại xe: tối đa MỘT gói `motorbike` và MỘT gói `car` chạy song
 * song; gói `all` (bậc doanh nghiệp, và mọi bậc trước ADR 0065) phủ cả hai loại và LOẠI TRỪ hai
 * gói kia. DB canh bất biến đó bằng EXCLUDE `tenant_subscriptions_package_scope_no_overlap`
 * (migration `20261021110000_per_vehicle_type_plans`) — đổi danh sách ở đây thì sửa CẢ hàm
 * `plan_vehicle_scope_span()` và các CHECK ở đó.
 *
 * Bậc tuyến hoa hồng LUÔN là `all` (CHECK `plans_commission_scope_all`): tuyến đó không bán gì
 * theo loại xe, trần Owner Lite là TỔNG (ADR 0038 điều 12).
 */
export const PLAN_VEHICLE_SCOPE = {
  MOTORBIKE: 'motorbike',
  CAR: 'car',
  /** Phủ mọi loại xe — bậc doanh nghiệp, tuyến hoa hồng, và mọi dòng trước ADR 0065. */
  ALL: 'all',
} as const;

export type PlanVehicleScope = (typeof PLAN_VEHICLE_SCOPE)[keyof typeof PLAN_VEHICLE_SCOPE];

/** Thứ tự đọc/hiển thị: bậc phủ-hết trước, rồi ô tô, rồi xe máy. "Bậc doanh nghiệp thắng". */
export const PLAN_VEHICLE_SCOPE_VALUES: readonly PlanVehicleScope[] = [
  PLAN_VEHICLE_SCOPE.ALL,
  PLAN_VEHICLE_SCOPE.CAR,
  PLAN_VEHICLE_SCOPE.MOTORBIKE,
];

export function isPlanVehicleScope(value: unknown): value is PlanVehicleScope {
  return typeof value === 'string' && (PLAN_VEHICLE_SCOPE_VALUES as readonly string[]).includes(value);
}

/**
 * Đọc phạm vi của một dòng — thiếu/lạ ⇒ `all`.
 *
 * `all` là cách đọc ĐÚNG của dữ liệu trước ADR 0065 (mọi bậc khi đó phủ cả hai loại, trần TỔNG),
 * không phải một mặc định cho tiện: migration backfill đúng giá trị này cho mọi dòng cũ.
 */
export function planVehicleScopeOf(value: unknown): PlanVehicleScope {
  return isPlanVehicleScope(value) ? value : PLAN_VEHICLE_SCOPE.ALL;
}

/** Bậc phạm vi `scope` có phủ loại xe `vehicleType` không. */
export function planScopeCoversVehicleType(scope: PlanVehicleScope, vehicleType: string): boolean {
  return scope === PLAN_VEHICLE_SCOPE.ALL || scope === vehicleType;
}

/**
 * Hai kỳ ở hai phạm vi này có ĐƯỢC chạy chồng thời gian không — `true` = KHÔNG được (xung đột).
 *
 * Cùng phạm vi thì xung đột; `all` xung đột với mọi phạm vi. Ô tô và xe máy thì không. Đây đúng là
 * phép `&&` của `plan_vehicle_scope_span()` ở DB — chuỗi kỳ (`planSubscriptionChain`) và khoá chuỗi
 * kỳ dùng chung luật này để không bao giờ đề xuất một lượt gán mà EXCLUDE sẽ từ chối.
 */
export function planScopesConflict(a: PlanVehicleScope, b: PlanVehicleScope): boolean {
  return a === b || a === PLAN_VEHICLE_SCOPE.ALL || b === PLAN_VEHICLE_SCOPE.ALL;
}

/**
 * Thứ tự TRÌNH BÀY phạm vi cho người dùng: xe máy → ô tô → doanh nghiệp (`all`).
 *
 * Khác `PLAN_VEHICLE_SCOPE_VALUES` (thứ tự ĐỌC "bậc phủ-hết thắng" của server) có chủ đích: bảng giá,
 * danh mục `GET /subscription/plan-catalog`, các làn mua ở web và danh sách kỳ ở màn quản trị đều
 * đi từ bậc nhỏ nhất lên — một nguồn để bốn nơi đó không xếp lệch nhau.
 */
export const PLAN_VEHICLE_SCOPE_DISPLAY_ORDER: readonly PlanVehicleScope[] = [
  PLAN_VEHICLE_SCOPE.MOTORBIKE,
  PLAN_VEHICLE_SCOPE.CAR,
  PLAN_VEHICLE_SCOPE.ALL,
];

/** Hạng trình bày của một phạm vi — khoá sắp xếp theo `PLAN_VEHICLE_SCOPE_DISPLAY_ORDER`. */
export function planVehicleScopeDisplayRank(scope: unknown): number {
  return PLAN_VEHICLE_SCOPE_DISPLAY_ORDER.indexOf(planVehicleScopeOf(scope));
}

/**
 * Hình dạng hạn mức THEO LOẠI xe (`VehicleTypeQuotaDto.kind` — `BillingService.vehicleQuotaFor`).
 *
 * Khác `PARTNER_QUOTA_KIND` (drawer quản trị, có thêm "không áp dụng"): đây là ba trạng thái mà
 * cổng tạo xe / gửi chợ thật sự thi hành (ADR 0065 điều 3–4).
 */
export const VEHICLE_QUOTA_KIND = {
  UNLIMITED: 'unlimited',
  TOTAL: 'total',
  /** Gian hàng tuyến gói chưa có gói phủ loại xe này — tạo xe / lên chợ bị chặn `PLAN_SCOPE_REQUIRED`. */
  SCOPE_REQUIRED: 'scope_required',
} as const;
export type VehicleQuotaKind = (typeof VEHICLE_QUOTA_KIND)[keyof typeof VEHICLE_QUOTA_KIND];
export const VEHICLE_QUOTA_KIND_VALUES = Object.values(VEHICLE_QUOTA_KIND) as VehicleQuotaKind[];

/**
 * ĐIỂM THI HÀNH của trần xe — `PLAN_LIMIT_REACHED.details.scope` (`BillingService.assertVehicleQuota`).
 *
 * `fleet` = tạo hồ sơ xe; `marketplace` = gửi / đưa thêm xe lên chợ. Trần không trả tiền (Owner
 * Lite, `billing_unconfigured`) chỉ gác `fleet` (ADR 0038 điều 12); trần đã trả gác cả hai.
 */
export const PLAN_QUOTA_GATE_POINT = {
  FLEET: 'fleet',
  MARKETPLACE: 'marketplace',
} as const;
export type PlanQuotaGatePoint = (typeof PLAN_QUOTA_GATE_POINT)[keyof typeof PLAN_QUOTA_GATE_POINT];

/**
 * Bảy bậc gian hàng mà SEED tạo ra (ADR 0065, thay ba bậc của ADR 0041 điều 7) — mã để seed,
 * migration và tài liệu gọi cùng một thứ bằng cùng một tên.
 *
 * Khác `DEFAULT_COMMISSION_PLAN_CODE` ở một điểm quan trọng: đây **không** phải bất biến. Danh
 * mục được phép có nhiều hơn hoặc ít hơn, và `BillingService` không đếm bậc, không biết tên nào —
 * nơi nào cần "bậc nào đang bán" thì hỏi `listPlansForTenant`, không hỏi hằng này. Bất biến duy
 * nhất của danh mục là ĐÚNG MỘT bậc `commission` (ADR 0038 điều 13). Trần xe, phạm vi loại xe và
 * giá đọc từ `plans`, không từ mã.
 */
export const SHOP_PLAN_CODE = {
  MOTO_1: 'moto_1',
  MOTO_5: 'moto_5',
  MOTO_10: 'moto_10',
  CAR_1: 'car_1',
  CAR_5: 'car_5',
  CAR_10: 'car_10',
  /** Bậc doanh nghiệp — phạm vi `all`, `salesOnly`, admin gán tay với giá đàm phán (ADR 0041 điều 5). */
  ENTERPRISE: 'enterprise_contact',
} as const;

/**
 * Ba bậc của ADR 0041 — nghỉ hưu bởi ADR 0065. Seed ARCHIVE chúng (còn thuê bao lịch sử + hoá đơn
 * đã phát hành trỏ tới), migration `20261021110000_per_vehicle_type_plans` ánh xạ thuê bao còn hạn
 * sang bảy bậc mới. Hoá đơn `issued` của chúng vẫn kích hoạt được (phạm vi `all`, trần TỔNG).
 */
export const RETIRED_SHOP_PLAN_CODE = {
  BASIC: 'shop-basic',
  ADVANCED: 'shop-advanced',
  PRO: 'shop-pro',
} as const;

/**
 * Bậc gói theo CHỖ XE của ADR 0029 — nghỉ hưu bởi ADR 0041.
 *
 * Giữ hằng vì seed vẫn phải NHẬN RA nó để gỡ khỏi danh mục (`retireLegacyPlans`), và migration
 * ánh xạ thuê bao cũ sang ba bậc mới cần gọi tên nó. Không nơi nào được tạo mới bậc này.
 */
export const RETIRED_PER_VEHICLE_PLAN_CODE = 'per-vehicle';

/**
 * Trần số xe của Owner Lite — TỔNG ô tô + xe máy, không phải 3 mỗi loại.
 *
 * Tuyến hoa hồng không bán gói nên nó không có `quota_json` để đọc hạn mức; trần này là quy tắc
 * SẢN PHẨM viết trong code, cùng hạng với `COMMISSION_TRACK_TERM_MONTHS`. Đếm GỘP hai loại vì
 * câu hỏi là "người này đang tự cho thuê vài chiếc, hay đang vận hành một đội xe" — ba ô tô cộng
 * ba xe máy đã là một đội xe.
 *
 * ⚠️ Trần này CHẶN TẠO MỚI, không gỡ thứ đang có (ADR 0038, mục "Hạn mức xe khi chuyển tuyến").
 * Gian hàng 10 xe rơi khỏi gói vẫn giữ nguyên 10 xe trên chợ, đơn vẫn chạy, tiền vẫn về ví; thứ
 * bị khoá là chiếc TIẾP THEO.
 */
export const OWNER_LITE_VEHICLE_LIMIT = 3;

// ── Hình dạng limits_json ───────────────────────────────────────────────────

/**
 * MỘT lựa chọn mua của bậc gói: kỳ hạn + tiền CẢ KỲ (ADR 0041 điều 2).
 *
 * `price` là số TUYỆT ĐỐI admin gõ, không phải kết quả của một phép nhân — 3 tháng 250.000đ là
 * 250.000đ, không phải "100.000 × 3 trừ 16,67%". % tiết kiệm hiển thị được TÍNH RA từ bảng này
 * (`planTermSavingPercent`), và không bao giờ đi vào một dòng tiền.
 */
export interface PlanTermPrice {
  months: number;
  /** VND, chuỗi thập phân — ADR 0007. */
  price: string;
}

/** Hình dạng chốt của `plans.limits_json` — ADR 0041 điều 1. */
export interface PlanLimitsJson {
  /** Trần TỔNG số xe (ô tô + xe máy). `null` = không giới hạn. */
  maxVehicles: number | null;
  /** `null` = không giới hạn. */
  maxBranches: number | null;
  maxMembers: number | null;
  /** Bảng giá = danh sách kỳ hạn ĐƯỢC BÁN. Rỗng = bậc không bán trực tiếp. */
  termPrices: PlanTermPrice[];
  /**
   * Bậc bán bằng TƯ VẤN: tenant không tự mua được (`PLAN_NOT_SELF_SERVE`), admin gán tay với
   * giá đàm phán (ADR 0041 điều 5). Bảng giá vẫn hiện thẻ của nó, kèm nút liên hệ.
   */
  salesOnly: boolean;
  /** Nhãn "Được đề xuất" trên bảng giá — lựa chọn marketing của admin, không đổi hành vi nào. */
  recommended: boolean;
  /** Số ngày ân hạn sau `ends_at` trước khi rơi về tuyến hoa hồng (ADR 0038 điều 1). */
  graceDays: number;
  /** Cờ năng lực (ADR 0027) — chỉ chứa giá trị của `PLAN_FEATURE`. */
  features: PlanFeature[];
}

/**
 * Hạn mức ĐÃ MUA, chụp lại trên `tenant_subscriptions.quota_json` — ADR 0041 điều 3.
 *
 * Tồn tại vì cùng lý do `billing_mode` được snapshot (ADR 0024 điều 2): admin sửa trần của một
 * bậc là quyết định về DANH MỤC, và nó không được lật hạn mức của gian hàng đang giữa kỳ đã trả
 * tiền. `null` ở một trường = KHÔNG GIỚI HẠN (tường minh), không phải "chưa khai".
 */
export interface PlanQuotaSnapshot {
  maxVehicles: number | null;
  maxBranches: number | null;
  maxMembers: number | null;
}

// ── Hoá đơn gói — hình dạng lines_json (ADR 0015 điều 5) ───────────────────

/**
 * Một dòng snapshot của hoá đơn — hoá đơn phải tự giải thích được, không cần join.
 *
 * Chỉ `package` được GHI từ ADR 0041 (một dòng: bậc gói cho N tháng). Ba giá trị còn lại là hoá
 * đơn phát hành TRƯỚC ADR 0041 theo mô hình chỗ xe — giữ trong union để chứng từ cũ còn đọc
 * được, không bao giờ ghi mới.
 */
export interface PlanInvoiceLine {
  kind: 'package' | 'base' | 'slot' | 'add_slot';
  /** Chỉ có ở dòng chỗ xe của hoá đơn cũ. */
  vehicleType?: 'car' | 'motorbike';
  quantity: number;
  months: number;
  /** VND, chuỗi — ADR 0007. */
  unitPrice: string;
  amount: string;
}

/** Gốc `subscription_invoices.lines_json` — đủ dữ kiện để KÍCH HOẠT gói khi tiền về. */
export interface PlanInvoiceSnapshot {
  planId: string;
  planCode: string;
  termMonths: number;
  /**
   * Phạm vi loại xe của bậc lúc phát hành (ADR 0065). Hoá đơn trước ADR 0065 không có khoá này ⇒
   * parser đọc `all` — đúng phạm vi của mọi bậc thời đó.
   */
  vehicleScope: PlanVehicleScope;
  /** Hạn mức sẽ ghi lên dòng thuê bao khi hoá đơn này kích hoạt gói (ADR 0041 điều 3). */
  quota: PlanQuotaSnapshot;
  lines: PlanInvoiceLine[];
}

// ── Parser phòng thủ ────────────────────────────────────────────────────────

const EMPTY_LIMITS: PlanLimitsJson = {
  maxVehicles: null,
  maxBranches: null,
  maxMembers: null,
  termPrices: [],
  salesOnly: false,
  recommended: false,
  graceDays: 0,
  features: [],
};

function asRecord(value: unknown): Record<string, unknown> | null {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : null;
}

/** Số nguyên ≥ 0, mọi thứ khác trả `fallback` — jsonb là đầu vào không tin được. */
function asCount(value: unknown, fallback: number): number {
  return typeof value === 'number' && Number.isInteger(value) && value >= 0 ? value : fallback;
}

function asNullableCount(value: unknown): number | null {
  return typeof value === 'number' && Number.isInteger(value) && value >= 0 ? value : null;
}

/** Chuỗi tiền thập phân hợp lệ, mọi thứ khác (kể cả `number`) → `null`. */
function asMoneyString(value: unknown): string | null {
  return typeof value === 'string' && /^\d{1,12}(\.\d{1,2})?$/.test(value) ? value : null;
}

function asFlag(value: unknown): boolean {
  return value === true;
}

/**
 * Đọc `plans.limits_json` về hình dạng chốt. KHÔNG ném với dữ liệu hỏng — key thiếu/sai kiểu
 * rơi về giá trị an toàn (không giới hạn, không bán, không cờ), chuỗi lạ trong `features` bị BỎ
 * chứ không lọt ra ngoài union.
 *
 * Kỳ hạn trùng nhau trong `termPrices` được rút về LẦN ĐẦU xuất hiện: hai giá cho cùng một kỳ
 * hạn là dữ liệu hỏng, và để cả hai lọt ra thì bảng giá hiện hai thẻ "3 tháng" cạnh nhau với
 * hai con số khác nhau — còn tệ hơn chọn sai một trong hai.
 */
export function parsePlanLimits(value: unknown): PlanLimitsJson {
  const raw = asRecord(value);
  if (!raw) return { ...EMPTY_LIMITS, termPrices: [], features: [] };

  const seen = new Set<number>();
  const termPrices: PlanTermPrice[] = Array.isArray(raw['termPrices'])
    ? (raw['termPrices'] as unknown[])
        .map((t) => {
          const r = asRecord(t);
          if (!r) return null;
          const months = asCount(r['months'], 0);
          const price = asMoneyString(r['price']);
          if (months < 1 || price === null || seen.has(months)) return null;
          seen.add(months);
          return { months, price };
        })
        .filter((t): t is PlanTermPrice => t !== null)
        .sort((a, b) => a.months - b.months)
    : [];

  return {
    maxVehicles: asNullableCount(raw['maxVehicles']),
    maxBranches: asNullableCount(raw['maxBranches']),
    maxMembers: asNullableCount(raw['maxMembers']),
    termPrices,
    salesOnly: asFlag(raw['salesOnly']),
    recommended: asFlag(raw['recommended']),
    graceDays: asCount(raw['graceDays'], 0),
    features: Array.isArray(raw['features'])
      ? (raw['features'] as unknown[]).filter(isPlanFeature)
      : [],
  };
}

/**
 * Đọc `tenant_subscriptions.quota_json` — `null` = dòng KHÔNG có snapshot (thuê bao tuyến hoa
 * hồng, hoặc dòng lịch sử trước ADR 0041), caller rơi về `limits` của bậc gói.
 *
 * Khoá `maxVehicles` phải CÓ MẶT (số nguyên hoặc `null` tường minh) thì snapshot mới được công
 * nhận. Khác biệt đó là cố ý: một jsonb hỏng/rỗng đọc thành `{maxVehicles: null}` sẽ là "không
 * giới hạn" — mức RỘNG NHẤT — ở đúng chỗ tốn tiền nhất. Không có snapshot thì hỏi bậc gói, và
 * bậc gói luôn có câu trả lời.
 */
export function parsePlanQuota(value: unknown): PlanQuotaSnapshot | null {
  const raw = asRecord(value);
  if (!raw || !('maxVehicles' in raw)) return null;
  if (raw['maxVehicles'] !== null && asNullableCount(raw['maxVehicles']) === null) return null;
  return {
    maxVehicles: asNullableCount(raw['maxVehicles']),
    maxBranches: asNullableCount(raw['maxBranches']),
    maxMembers: asNullableCount(raw['maxMembers']),
  };
}

/**
 * Đọc `subscription_invoices.lines_json` — `null` khi thiếu trường BẮT BUỘC để kích hoạt.
 *
 * Khác `parsePlanLimits` (rơi về mặc định rỗng): mặc định hoá một snapshot hoá đơn là kích hoạt
 * một gói 0 tháng không trần — với DỮ LIỆU TIỀN, "không làm gì và đẩy sang hàng đợi admin" đúng
 * hơn "đoán một giá trị". Caller nhận `null` thì để giao dịch nằm ở trạng thái chưa khớp kèm
 * ghi chú.
 *
 * ⚠️ Đọc được CẢ hoá đơn trước ADR 0041: những hoá đơn đó mang `slots: {car, motorbike}` thay
 * cho `quota`, và một hoá đơn `issued` như thế có thể đang chờ tiền ngay lúc deploy. Tổng hai
 * loại chỗ thành `maxVehicles` là đúng ánh xạ mà migration dùng cho thuê bao (ADR 0041 điều 8).
 */
export function parsePlanInvoiceSnapshot(value: unknown): PlanInvoiceSnapshot | null {
  const raw = asRecord(value);
  if (!raw) return null;

  const planId = typeof raw['planId'] === 'string' ? raw['planId'] : null;
  const planCode = typeof raw['planCode'] === 'string' ? raw['planCode'] : null;
  const termMonths = asCount(raw['termMonths'], 0);
  if (!planId || !planCode || termMonths < 1) return null;

  const lines: PlanInvoiceLine[] = Array.isArray(raw['lines'])
    ? (raw['lines'] as unknown[])
        .map((l) => {
          const r = asRecord(l);
          if (!r) return null;
          const kind = r['kind'];
          if (kind !== 'package' && kind !== 'base' && kind !== 'slot' && kind !== 'add_slot') {
            return null;
          }
          const unitPrice = asMoneyString(r['unitPrice']);
          const amount = asMoneyString(r['amount']);
          if (unitPrice === null || amount === null) return null;
          const vehicleType = r['vehicleType'];
          return {
            kind,
            ...(vehicleType === 'car' || vehicleType === 'motorbike' ? { vehicleType } : {}),
            quantity: asCount(r['quantity'], 0),
            months: asCount(r['months'], 0),
            unitPrice,
            amount,
          };
        })
        .filter((l): l is PlanInvoiceLine => l !== null)
    : [];

  return {
    planId,
    planCode,
    termMonths,
    vehicleScope: planVehicleScopeOf(raw['vehicleScope']),
    quota: invoiceQuota(raw),
    lines,
  };
}

/** `quota` của hoá đơn mới; hoá đơn trước ADR 0041 suy từ `slots` cũ. */
function invoiceQuota(raw: Record<string, unknown>): PlanQuotaSnapshot {
  const quota = parsePlanQuota(raw['quota']);
  if (quota) return quota;
  const legacy = asRecord(raw['slots']);
  if (!legacy) return { maxVehicles: null, maxBranches: null, maxMembers: null };
  return {
    maxVehicles: asCount(legacy['car'], 0) + asCount(legacy['motorbike'], 0),
    maxBranches: null,
    maxMembers: null,
  };
}

// ── Phép đọc bảng giá ───────────────────────────────────────────────────────

/** Kỳ hạn bậc gói BÁN được, tăng dần. Rỗng = không bán trực tiếp (bậc tư vấn hoặc chưa khai). */
export function planSellableTerms(limits: PlanLimitsJson): number[] {
  return limits.termPrices.map((t) => t.months);
}

/** Tiền CẢ KỲ của một kỳ hạn — `null` khi bậc gói không bán kỳ hạn đó. */
export function planTermPrice(limits: PlanLimitsJson, termMonths: number): string | null {
  return limits.termPrices.find((t) => t.months === termMonths)?.price ?? null;
}

/**
 * Tenant có TỰ MUA được bậc này không (ADR 0041 điều 5).
 *
 * Phép xem trước cho UI; lớp chặn thật là `BillingService.purchase` — bậc `salesOnly` ném
 * `PLAN_NOT_SELF_SERVE`, bậc không có bảng giá thì không có khoản phải trả.
 */
export function isPlanSelfServe(limits: PlanLimitsJson): boolean {
  return !limits.salesOnly && limits.termPrices.length > 0;
}

/**
 * Bậc TỰ MUA được nhỏ nhất của phạm vi `scope` còn chứa nổi `count` xe — `null` khi không có bậc
 * nào (đội xe vượt trần mọi bậc tự phục vụ ⇒ lối đi tiếp là bậc tư vấn). Bậc không giới hạn
 * (`maxVehicles = null`) xếp sau mọi bậc có trần.
 *
 * Hàm chọn để GỢI Ý (lời chào gói của job vòng đời, màn chọn gói) — không bao giờ để tự gán.
 */
export function smallestSelfServePlanFor<P extends { vehicleScope: string; limits: PlanLimitsJson }>(
  plans: readonly P[],
  scope: PlanVehicleScope,
  count: number,
): P | null {
  const capOf = (plan: P) => plan.limits.maxVehicles ?? Number.POSITIVE_INFINITY;
  return (
    plans
      .filter(
        (plan) =>
          plan.vehicleScope === scope && isPlanSelfServe(plan.limits) && capOf(plan) >= count,
      )
      .sort((a, b) => capOf(a) - capOf(b))[0] ?? null
  );
}

/**
 * % TIẾT KIỆM của một kỳ hạn so với việc mua từng tháng — CHỈ ĐỂ HIỂN THỊ (ADR 0041 điều 2).
 *
 * Mốc so là giá kỳ 1 tháng của chính bậc đó. Bậc không bán kỳ 1 tháng thì không có mốc ⇒ trả 0
 * (không hiện nhãn) thay vì bịa một mốc từ kỳ ngắn nhất: "tiết kiệm 12% so với mua 3 tháng" là
 * một câu không ai kiểm chứng được trên bảng giá đang nhìn.
 *
 * ⚠️ Con số này KHÔNG bao giờ đi vào một dòng tiền. Hoá đơn ghi `subtotal = total = price(N)`,
 * `discountAmount = 0` — một dòng "giảm giá" trên chứng từ phải ứng với một giá gốc THẬT.
 */
export function planTermSavingPercent(limits: PlanLimitsJson, termMonths: number): number {
  if (termMonths <= 1) return 0;
  const monthly = planTermPrice(limits, 1);
  const total = planTermPrice(limits, termMonths);
  if (monthly === null || total === null) return 0;
  const reference = Number(monthly) * termMonths;
  if (!Number.isFinite(reference) || reference <= 0) return 0;
  const saving = Math.round((1 - Number(total) / reference) * 100);
  return saving > 0 ? saving : 0;
}

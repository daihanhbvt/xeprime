/**
 * Gói theo CHỖ XE — hình dạng núm vặn của một bậc gói và cách đọc nó an toàn.
 * ADR 0015 điều 3–4 · ADR 0020 · ADR 0024.
 *
 * `plans.limits_json` là DỮ LIỆU admin sửa được (giá / % / số chỗ / số ngày); QUY TẮC nằm
 * trong code (BillingService). File này chỉ đóng đinh HÌNH DẠNG và cung cấp parser phòng thủ
 * — một jsonb hỏng/thiếu key không được phép làm sập đường đọc gói ở api, web hay mobile.
 *
 * Tiền trong JSON là CHUỖI thập phân (cùng kỷ luật ADR 0007 — không bao giờ `number` cho
 * tiền); số đếm (chỗ, tháng, ngày, %) là `number`.
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
 * trị gọi cùng một thứ bằng cùng một tên.
 */
export const DEFAULT_COMMISSION_PLAN_CODE = 'free';

/**
 * Mã SKU duy nhất của TUYẾN GÓI — bậc mà gian hàng thật sự mua.
 *
 * Khác `DEFAULT_COMMISSION_PLAN_CODE` ở một điểm quan trọng: đây **không** phải một bất biến.
 * Danh mục được phép có nhiều bậc `package` (một bậc có trần chỗ khác, một bậc mở thêm cờ năng
 * lực…), và backend không chặn gì cả. Hằng này chỉ để seed và tài liệu gọi cùng một thứ bằng
 * cùng một tên thay vì rải chuỗi `per-vehicle` khắp nơi — nơi nào cần "bậc nào đang bán" thì
 * hỏi `listPlansForTenant`, không hỏi hằng này.
 */
export const DEFAULT_PACKAGE_PLAN_CODE = 'per-vehicle';

/**
 * Trần số xe của Owner Lite — TỔNG ô tô + xe máy, không phải 3 mỗi loại.
 *
 * Tuyến hoa hồng không bán chỗ nên nó không có `slots_json` để đọc hạn mức; trần này là quy tắc
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

/** Đơn giá MỘT chỗ / tháng theo loại xe. `null` = bậc gói chưa bán loại chỗ đó. */
export interface PlanVehicleSlotPrice {
  car: string | null;
  motorbike: string | null;
}

/** Một kỳ hạn bậc gói bán, kèm % giảm cho cam kết dài (ADR 0015 điều 3). */
export interface PlanTermOption {
  months: number;
  discountPercent: number;
}

/** Hình dạng chốt của `plans.limits_json` — ADR 0015 điều 4. */
export interface PlanLimitsJson {
  perVehiclePrice: PlanVehicleSlotPrice;
  /** Số chỗ gồm sẵn trong phí nền của gói gian hàng. */
  includedCars: number;
  includedMotorbikes: number;
  /** `null` = không giới hạn. */
  maxCars: number | null;
  maxMotorbikes: number | null;
  maxMembers: number | null;
  maxBranches: number | null;
  terms: PlanTermOption[];
  graceDays: number;
  /** Cờ năng lực (ADR 0027) — chỉ chứa giá trị của `PLAN_FEATURE`. */
  features: PlanFeature[];
}

/** Số chỗ một dòng thuê bao đã mua (`tenant_subscriptions.slots_json`) — ADR 0015 điều 1. */
export interface PlanSlots {
  car: number;
  motorbike: number;
}

/**
 * Giả định admin nhập cho phép KIỂM ĐIỂM GIAO (ADR 0020) — `plans.assumed_monthly_gmv_json`.
 * Cả hai đầu vào đều là giả định thị trường, không phải cấu hình hệ thống: G (doanh thu một xe
 * một tháng) và % hoa hồng của tuyến A để so.
 */
export interface PlanAssumedGmvJson {
  /** Doanh thu giả định của MỘT xe trong MỘT tháng — chuỗi tiền VND. */
  monthlyGmvPerCar: string;
  /** % hoa hồng tuyến A dùng để so (thường là % của gói mặc định). */
  commissionPercent: number;
}

// ── Hoá đơn gói — hình dạng lines_json (ADR 0015 điều 5) ───────────────────

/** Một dòng snapshot của hoá đơn gói — hoá đơn phải tự giải thích được, không cần join. */
export interface PlanInvoiceLine {
  /** `base` = phí nền · `slot` = chỗ mua thêm · `add_slot` = mua thêm chỗ giữa kỳ (prorate). */
  kind: 'base' | 'slot' | 'add_slot';
  /** Chỉ có ở dòng chỗ xe. */
  vehicleType?: 'car' | 'motorbike';
  quantity: number;
  months: number;
  /** VND, chuỗi — ADR 0007. */
  unitPrice: string;
  amount: string;
}

/** Gốc `subscription_invoices.lines_json` — đủ dữ kiện để KÍCH HOẠT gói khi tiền về (W4). */
export interface PlanInvoiceSnapshot {
  planId: string;
  planCode: string;
  termMonths: number;
  slots: PlanSlots;
  lines: PlanInvoiceLine[];
}

// ── Parser phòng thủ ────────────────────────────────────────────────────────

const EMPTY_LIMITS: PlanLimitsJson = {
  perVehiclePrice: { car: null, motorbike: null },
  includedCars: 0,
  includedMotorbikes: 0,
  maxCars: null,
  maxMotorbikes: null,
  maxMembers: null,
  maxBranches: null,
  terms: [],
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

function asPercent(value: unknown, fallback: number): number {
  return typeof value === 'number' && Number.isFinite(value) && value >= 0 && value <= 100
    ? value
    : fallback;
}

/**
 * Đọc `plans.limits_json` về hình dạng chốt. KHÔNG ném với dữ liệu hỏng — key thiếu/sai kiểu
 * rơi về giá trị an toàn (không giới hạn, không gồm sẵn, không cờ), chuỗi lạ trong `features`
 * bị BỎ chứ không lọt ra ngoài union.
 */
export function parsePlanLimits(value: unknown): PlanLimitsJson {
  const raw = asRecord(value);
  if (!raw) return { ...EMPTY_LIMITS, perVehiclePrice: { ...EMPTY_LIMITS.perVehiclePrice } };

  const price = asRecord(raw['perVehiclePrice']);
  const terms: PlanTermOption[] = Array.isArray(raw['terms'])
    ? (raw['terms'] as unknown[])
        .map((t) => {
          const r = asRecord(t);
          if (!r) return null;
          const months = asCount(r['months'], 0);
          if (months < 1) return null;
          return { months, discountPercent: asPercent(r['discountPercent'], 0) };
        })
        .filter((t): t is PlanTermOption => t !== null)
    : [];

  return {
    perVehiclePrice: {
      car: asMoneyString(price?.['car']),
      motorbike: asMoneyString(price?.['motorbike']),
    },
    includedCars: asCount(raw['includedCars'], 0),
    includedMotorbikes: asCount(raw['includedMotorbikes'], 0),
    maxCars: asNullableCount(raw['maxCars']),
    maxMotorbikes: asNullableCount(raw['maxMotorbikes']),
    maxMembers: asNullableCount(raw['maxMembers']),
    maxBranches: asNullableCount(raw['maxBranches']),
    terms,
    graceDays: asCount(raw['graceDays'], 0),
    features: Array.isArray(raw['features'])
      ? (raw['features'] as unknown[]).filter(isPlanFeature)
      : [],
  };
}

/** Đọc `tenant_subscriptions.slots_json` — NULL/hỏng = chưa mua chỗ nào, không ném. */
export function parsePlanSlots(value: unknown): PlanSlots {
  const raw = asRecord(value);
  return { car: asCount(raw?.['car'], 0), motorbike: asCount(raw?.['motorbike'], 0) };
}

/**
 * Đọc `subscription_invoices.lines_json` — `null` khi thiếu trường BẮT BUỘC để kích hoạt.
 *
 * Khác `parsePlanLimits` (rơi về mặc định rỗng): mặc định hoá một snapshot hoá đơn là kích hoạt
 * một gói 0 tháng 0 chỗ — với DỮ LIỆU TIỀN, "không làm gì và đẩy sang hàng đợi admin" đúng hơn
 * "đoán một giá trị". Caller nhận `null` thì để giao dịch nằm ở trạng thái chưa khớp kèm ghi chú.
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
          if (kind !== 'base' && kind !== 'slot' && kind !== 'add_slot') return null;
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

  return { planId, planCode, termMonths, slots: parsePlanSlots(raw['slots']), lines };
}

/** Đọc `plans.assumed_monthly_gmv_json` — `null` khi thiếu/hỏng, để caller quyết đường đi. */
export function parsePlanAssumedGmv(value: unknown): PlanAssumedGmvJson | null {
  const raw = asRecord(value);
  if (!raw) return null;
  const monthlyGmvPerCar = asMoneyString(raw['monthlyGmvPerCar']);
  const commissionPercent = raw['commissionPercent'];
  if (
    monthlyGmvPerCar == null ||
    typeof commissionPercent !== 'number' ||
    !Number.isFinite(commissionPercent) ||
    commissionPercent <= 0 ||
    commissionPercent > 100
  ) {
    return null;
  }
  return { monthlyGmvPerCar, commissionPercent };
}

/** % giảm của một kỳ hạn theo bảng `terms` của bậc gói — kỳ không khai báo = 0%. */
export function termDiscountPercent(limits: PlanLimitsJson, termMonths: number): number {
  return limits.terms.find((t) => t.months === termMonths)?.discountPercent ?? 0;
}

/**
 * Tiền CẢ KỲ của một lượt mua gói — phép XEM TRƯỚC cho form gán/gia hạn, cùng công thức
 * `BillingService.termTotal`: (phí nền + chỗ mua thêm × đơn giá) × tháng × (1 − % giảm).
 * Trả `null` khi cần mua thêm loại chỗ mà bậc gói không bán (đơn giá null).
 */
export function subscriptionTermTotalPreview(
  basePriceMonthly: string,
  limits: PlanLimitsJson,
  slots: PlanSlots,
  termMonths: number,
): number | null {
  let monthly = Number(basePriceMonthly) || 0;
  for (const [bought, included, unitPrice] of [
    [slots.car, limits.includedCars, limits.perVehiclePrice.car],
    [slots.motorbike, limits.includedMotorbikes, limits.perVehiclePrice.motorbike],
  ] as const) {
    const extra = bought - included;
    if (extra <= 0) continue;
    if (unitPrice === null) return null;
    monthly += Number(unitPrice) * extra;
  }
  const discount = termDiscountPercent(limits, termMonths);
  return Math.round(monthly * termMonths * (1 - discount / 100));
}

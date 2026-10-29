/**
 * Tiền công tài xế — ADR 0075 (đặc tả BA `SPEC-BUS-07`).
 *
 * XePrime chỉ GHI NHẬN con số chủ xe và tài xế thoả thuận; chủ xe trả TRỰC TIẾP. Tiền công không
 * bao giờ đi vào báo giá, tiền giữ chỗ, quyết toán, Ví điểm, thuế hay hoa hồng — nên mọi luật ở đây
 * là luật GHI SỐ (khoảng hợp lệ, hạn sửa), không phải luật tiền.
 *
 * Server (`DriversService`) chặn thật; web/mobile đọc cùng các hàm này để báo trước.
 */
import { DRIVER_ASSIGNMENT_OUTCOME, type DriverAssignmentOutcome } from './status/driver';
import { isThousandStep } from './fee-policy';

/** Khoảng tiền VND (string nguyên) — `min ≤ x ≤ max`. */
export interface MoneyRange {
  min: string;
  max: string;
}

/**
 * Giới hạn CHẶN SỐ VÔ LÝ của chuyến có tài xế — dữ liệu `fee_policies.with_driver_limits`.
 * Không phải điều tiết giá: chỉ để bắt gõ thừa/thiếu số 0.
 */
export interface WithDriverLimits {
  /** Giá có tài xế/ngày của xe — áp cho giá nội thành, liên tỉnh khứ hồi, liên tỉnh một chiều. */
  priceDaily: MoneyRange;
  /** Tiền công tài xế/ngày — mức mặc định của gian hàng và (× số ngày) tiền công một lượt gán. */
  wageDaily: MoneyRange;
  /**
   * Mức tiền công/ngày GỢI Ý — chỉ là lời nhắc theo thị trường cho gian hàng chưa đặt mức chung
   * (hiện ở ô nhập), KHÔNG bao giờ tự ghi vào gian hàng hay lượt gán. Nằm trong `wageDaily`.
   */
  wageDailySuggested: string;
}

/**
 * Mặc định nền tảng (căn cứ thị trường ở SPEC-BUS-07 §4.6) — áp khi bản chính sách hiện hành chưa
 * khai `with_driver_limits` (các bản trước tính năng).
 */
export const WITH_DRIVER_LIMITS_DEFAULTS: WithDriverLimits = {
  priceDaily: { min: '500000', max: '5000000' },
  wageDaily: { min: '200000', max: '2000000' },
  wageDailySuggested: '500000',
};

/** Chủ xe sửa được tiền công tới `ended_at` + ngần này giờ; sau đó khoá. */
export const DRIVER_WAGE_EDIT_WINDOW_HOURS = 72;

/** Trần độ dài lý do sửa tiền công (cột `reason VARCHAR(255)`). */
export const DRIVER_WAGE_REASON_MAX_LENGTH = 255;

function rangeValid(r: MoneyRange): boolean {
  const min = Number(r.min);
  const max = Number(r.max);
  return isThousandStep(r.min) && isThousandStep(r.max) && min > 0 && min < max;
}

/** Bộ giới hạn hợp lệ: mỗi khoảng `0 < min < max`, bội 1.000đ (ADR 0069); mức gợi ý nằm trong khoảng tiền công. */
export function withDriverLimitsValid(limits: WithDriverLimits): boolean {
  const suggested = Number(limits.wageDailySuggested);
  return (
    rangeValid(limits.priceDaily) &&
    rangeValid(limits.wageDaily) &&
    isThousandStep(limits.wageDailySuggested) &&
    suggested >= Number(limits.wageDaily.min) &&
    suggested <= Number(limits.wageDaily.max)
  );
}

/**
 * Đọc jsonb `with_driver_limits`. Thiếu khoá / sai kiểu / không hợp lệ ⇒ `null` — bên gọi rơi về
 * `WITH_DRIVER_LIMITS_DEFAULTS` (đọc) hoặc chặn kích hoạt (cổng chính sách).
 */
export function parseWithDriverLimits(raw: unknown): WithDriverLimits | null {
  if (typeof raw !== 'object' || raw === null || Array.isArray(raw)) return null;
  const pick = (v: unknown): MoneyRange | null => {
    if (typeof v !== 'object' || v === null) return null;
    const { min, max } = v as Record<string, unknown>;
    const asText = (x: unknown) =>
      typeof x === 'number' ? String(x) : typeof x === 'string' && x.trim() !== '' ? x.trim() : null;
    const lo = asText(min);
    const hi = asText(max);
    return lo && hi ? { min: lo, max: hi } : null;
  };
  const { priceDaily, wageDaily, wageDailySuggested } = raw as Record<string, unknown>;
  const price = pick(priceDaily);
  const wage = pick(wageDaily);
  if (!price || !wage) return null;
  // Bản ghi trước khi có mức gợi ý: lấy mặc định nền tảng, kẹp vào khoảng tiền công của chính bản đó.
  const suggestedRaw =
    typeof wageDailySuggested === 'number'
      ? String(wageDailySuggested)
      : typeof wageDailySuggested === 'string' && wageDailySuggested.trim() !== ''
        ? wageDailySuggested.trim()
        : String(
            Math.min(
              Math.max(Number(WITH_DRIVER_LIMITS_DEFAULTS.wageDailySuggested), Number(wage.min)),
              Number(wage.max),
            ),
          );
  const limits = { priceDaily: price, wageDaily: wage, wageDailySuggested: suggestedRaw };
  return withDriverLimitsValid(limits) ? limits : null;
}

/**
 * Giai đoạn tiền công của một lượt gán — quyết định khoảng hợp lệ và có sửa được không.
 *
 *  - `offer`         — đang chờ tài xế nhận.
 *  - `running`       — đã nhận, chuyến chưa kết thúc.
 *  - `completed`     — chuyến hoàn thành: hiển thị "Đã nhận", mặc định coi là đã trả.
 *  - `not_run`       — đã nhận rồi lượt khép mà KHÔNG hoàn thành (huỷ, không đến, rút, trả lại, bị
 *                      thay): tiền công về 0, chủ xe ghi được số đã thoả thuận.
 *  - `not_applicable`— chưa từng được nhận (từ chối, quá hạn, gỡ trước khi nhận): không có tiền công.
 */
export const DRIVER_WAGE_STAGE = {
  OFFER: 'offer',
  RUNNING: 'running',
  COMPLETED: 'completed',
  NOT_RUN: 'not_run',
  NOT_APPLICABLE: 'not_applicable',
} as const;

export type DriverWageStage = (typeof DRIVER_WAGE_STAGE)[keyof typeof DRIVER_WAGE_STAGE];
export const DRIVER_WAGE_STAGE_VALUES = Object.values(DRIVER_WAGE_STAGE) as DriverWageStage[];

/** "Đã nhận" là dấu hiệu duy nhất phân biệt trả lại / huỷ sau khi nhận với từ chối / quá hạn. */
export function driverWageStage(a: {
  outcome: DriverAssignmentOutcome | string;
  acceptedAt: Date | string | null;
}): DriverWageStage {
  if (a.outcome === DRIVER_ASSIGNMENT_OUTCOME.OPEN) {
    return a.acceptedAt ? DRIVER_WAGE_STAGE.RUNNING : DRIVER_WAGE_STAGE.OFFER;
  }
  if (a.outcome === DRIVER_ASSIGNMENT_OUTCOME.COMPLETED) return DRIVER_WAGE_STAGE.COMPLETED;
  return a.acceptedAt ? DRIVER_WAGE_STAGE.NOT_RUN : DRIVER_WAGE_STAGE.NOT_APPLICABLE;
}

/**
 * Khoảng tiền công hợp lệ của MỘT lượt gán (VND, số nguyên). Chuyến chạy/đang mời/đã xong:
 * `[wMin × N; wMax × N]`; chuyến không chạy: `[0; wMax × N]`. `null` khi lượt không có tiền công.
 */
export function driverWageRange(
  stage: DriverWageStage,
  limits: WithDriverLimits,
  days: number,
): { min: number; max: number } | null {
  if (stage === DRIVER_WAGE_STAGE.NOT_APPLICABLE || !(days > 0)) return null;
  const max = Number(limits.wageDaily.max) * days;
  const min = stage === DRIVER_WAGE_STAGE.NOT_RUN ? 0 : Number(limits.wageDaily.min) * days;
  return { min, max };
}

/** Mốc khoá sửa: `ended_at + 72h`; lượt chưa kết thúc ⇒ `null` (chưa khoá). */
export function driverWageEditableUntil(endedAt: Date | string | null): Date | null {
  if (!endedAt) return null;
  return new Date(new Date(endedAt).getTime() + DRIVER_WAGE_EDIT_WINDOW_HOURS * 3_600_000);
}

/** Lượt này còn sửa được tiền công không (giai đoạn + hạn khoá). */
export function driverWageEditable(
  a: { outcome: DriverAssignmentOutcome | string; acceptedAt: Date | string | null; endedAt: Date | string | null },
  now: Date = new Date(),
): boolean {
  if (driverWageStage(a) === DRIVER_WAGE_STAGE.NOT_APPLICABLE) return false;
  const until = driverWageEditableUntil(a.endedAt);
  return until === null || until.getTime() > now.getTime();
}

/** Một khoản tiền (VND, số nguyên) có nằm trong khoảng giá có tài/ngày không. */
export function withDriverPriceInRange(amount: number, limits: WithDriverLimits): boolean {
  return amount >= Number(limits.priceDaily.min) && amount <= Number(limits.priceDaily.max);
}

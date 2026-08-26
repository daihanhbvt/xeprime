/**
 * Thao tác HÀNG LOẠT trên một ngày lịch — luật thuần cho "khoá toàn bộ xe" và "đặt giá toàn bộ xe".
 *
 * Hai phép tính ở đây quyết định tính năng đúng hay sai, và cả hai đều không cần DB:
 *
 *  1. **Giá theo phần trăm.** Nghe thì tầm thường, nhưng nó có ba cái bẫy đã làm hỏng những
 *     tính năng tương tự ở nơi khác: lấy % trên giá nào (xe có giá cuối tuần riêng), có cộng
 *     dồn khi bấm hai lần không, và số lẻ ra bao nhiêu.
 *  2. **Gom ngày lễ liền kề.** Quốc khánh 2026 về từ Google thành BA sự kiện một ngày
 *     (31/08, 01/09, 02/09). Người dùng bấm vào 31/08 và muốn "khoá cả dịp lễ" — nên khoảng
 *     mặc định phải là trọn cụm, không phải một ngày.
 */

import type { HolidayDateKey } from './holidays';
import { daysBetweenDateKeys, shiftDateKey } from './holidays';

/** Bước làm tròn mặc định cho giá thuê xe: 10.000₫ — mức người Việt đọc giá thuê. */
export const PRICE_ROUND_STEP_DEFAULT = 10_000;

/** Các bước làm tròn cho người dùng chọn. `1` = không làm tròn. */
export const PRICE_ROUND_STEPS = [1, 1_000, 10_000, 50_000] as const;

/** Trần điều chỉnh phần trăm — chặn gõ nhầm `3000` thay vì `30`. */
export const PRICE_PERCENT_MIN = -90;
export const PRICE_PERCENT_MAX = 500;

/**
 * Giá GỐC của một xe cho một ngày cụ thể.
 *
 * "Gốc" ở đây là giá NIÊM YẾT của xe (thường / cuối tuần), **cố ý bỏ qua bản ghi đè theo ngày
 * đang có**. Đó là điểm mấu chốt khiến thao tác idempotent: "tăng 30% dịp lễ" nghĩa là 30% so
 * với giá bình thường, không phải 30% so với con số ai đó vừa đặt hôm qua. Lấy gốc là giá hiện
 * hành thì bấm hai lần ra +69%, và không ai truy được vì sao.
 */
export interface VehicleDayBasePrice {
  /** Giá ngày thường. `null` = xe chưa cấu hình giá — không tính được, phải bỏ qua. */
  readonly weekdayPrice: string | null;
  /** Giá cuối tuần; `null` ⇒ dùng giá ngày thường (khớp `PricingService`). */
  readonly weekendPrice: string | null;
}

/** T7/CN theo lịch Việt Nam — cùng quy ước với `PricingService.quote`. */
export function isWeekendDateKey(dateKey: HolidayDateKey): boolean {
  const dow = new Date(`${dateKey}T00:00:00.000Z`).getUTCDay();
  return dow === 0 || dow === 6;
}

/**
 * Giá niêm yết áp cho đúng ngày `dateKey` của một xe.
 *
 * Vì sao phải phân biệt cuối tuần: nếu lấy phẳng `weekdayPrice` thì lệnh "+30% cho Thứ Bảy
 * 30/08" sẽ tính trên giá ngày thường và cho ra một con số THẤP HƠN giá cuối tuần đang chạy —
 * tức là một lệnh tăng giá lại thành giảm giá, đúng vào ngày đắt khách nhất.
 */
export function listedPriceForDay(
  vehicle: VehicleDayBasePrice,
  dateKey: HolidayDateKey,
): string | null {
  if (isWeekendDateKey(dateKey)) return vehicle.weekendPrice ?? vehicle.weekdayPrice;
  return vehicle.weekdayPrice;
}

/**
 * Làm tròn LÊN/XUỐNG về bội gần nhất của `step`.
 *
 * Nửa chừng làm tròn LÊN (`Math.round`), và đó là lựa chọn có lợi cho gian hàng ở một thao tác
 * mà 99% trường hợp là tăng giá dịp lễ.
 */
export function roundPriceTo(value: number, step: number): number {
  if (!Number.isFinite(step) || step <= 1) return Math.round(value);
  return Math.round(value / step) * step;
}

/**
 * Giá gốc + phần trăm → giá mới, đã làm tròn.
 *
 * Tiền đi bằng CHUỖI (ADR 0007) nên vào/ra đều là chuỗi; phép nhân đi qua `number` là chấp
 * nhận được ở đây vì giá thuê xe nằm rất xa giới hạn an toàn của số thực (`Number.MAX_SAFE_INTEGER`
 * là ~9·10¹⁵, giá thuê tính bằng triệu).
 *
 * Trả `null` khi xe chưa có giá gốc — KHÔNG bịa 0₫: một chiếc xe chưa cấu hình giá mà bị đặt
 * thành 0 đồng trong ngày lễ là lỗi tốn tiền thật.
 */
export function applyPercentToPrice(
  basePrice: string | null,
  percent: number,
  step: number = PRICE_ROUND_STEP_DEFAULT,
): string | null {
  if (basePrice === null || basePrice === '') return null;
  const base = Number(basePrice);
  if (!Number.isFinite(base)) return null;

  const raw = base * (1 + percent / 100);
  // Không cho giá âm: -120% là dữ liệu vô nghĩa, và DB có CHECK riêng của nó.
  const rounded = Math.max(0, roundPriceTo(raw, step));
  return String(rounded);
}

/** Một xe trong bảng xem trước, sau khi đã tính giá mới. */
export interface BulkPriceRow {
  readonly vehicleId: string;
  readonly basePrice: string | null;
  readonly nextPrice: string | null;
}

export interface BulkPriceInput {
  readonly vehicleId: string;
  readonly weekdayPrice: string | null;
  readonly weekendPrice: string | null;
}

/** Hai cách đặt giá hàng loạt. Mã, không phải chữ. */
export const BULK_PRICE_MODE = {
  /** Tăng/giảm theo % giá niêm yết của TỪNG xe — mặc định, tôn trọng chênh lệch giữa các xe. */
  PERCENT: 'percent',
  /** Một con số cho mọi xe được chọn. Chỉ hợp lý khi nhóm chọn hẹp. */
  FIXED: 'fixed',
} as const;

export type BulkPriceMode = (typeof BULK_PRICE_MODE)[keyof typeof BULK_PRICE_MODE];

export interface BulkPricePlanOptions {
  readonly mode: BulkPriceMode;
  /** Dùng khi `mode = percent`. */
  readonly percent?: number;
  /** Dùng khi `mode = fixed`. */
  readonly fixedPrice?: string;
  readonly roundStep?: number;
}

/**
 * Danh sách xe + một ngày + cách đặt giá → giá mới của từng xe.
 *
 * Hàm này là thứ mà CẢ backend (lúc ghi) và frontend (lúc xem trước) gọi — một luật, một kết
 * quả. Bảng xem trước hiện đúng những con số sẽ được ghi xuống, không phải một bản mô phỏng
 * gần đúng viết lại lần thứ hai ở client.
 */
export function planBulkDayPrices(
  vehicles: readonly BulkPriceInput[],
  dateKey: HolidayDateKey,
  options: BulkPricePlanOptions,
): BulkPriceRow[] {
  const step = options.roundStep ?? PRICE_ROUND_STEP_DEFAULT;

  return vehicles.map((vehicle) => {
    const basePrice = listedPriceForDay(vehicle, dateKey);

    if (options.mode === BULK_PRICE_MODE.FIXED) {
      const fixed = options.fixedPrice ?? '';
      return { vehicleId: vehicle.vehicleId, basePrice, nextPrice: fixed === '' ? null : fixed };
    }

    return {
      vehicleId: vehicle.vehicleId,
      basePrice,
      nextPrice: applyPercentToPrice(basePrice, options.percent ?? 0, step),
    };
  });
}

/**
 * Độ lệch giá trong nhóm đang chọn, để cảnh báo trước khi ai đó đặt ĐỒNG GIÁ cho cả đội xe.
 *
 * Trả `null` khi không đủ dữ liệu để so. Con số là TỈ LỆ cao nhất / thấp nhất: đội có i10 520k
 * và Everest 1,5M cho ra 2.88 — đủ để nói "đồng giá ở đây gần như chắc chắn sai".
 */
export function priceSpreadRatio(prices: ReadonlyArray<string | null>): number | null {
  const values = prices
    .filter((p): p is string => p !== null && p !== '')
    .map(Number)
    .filter((n) => Number.isFinite(n) && n > 0);
  if (values.length < 2) return null;

  const min = Math.min(...values);
  const max = Math.max(...values);
  return Math.round((max / min) * 100) / 100;
}

/** Trên ngưỡng này thì đồng giá là một quyết định cần người dùng xác nhận có ý thức. */
export const PRICE_SPREAD_WARN_RATIO = 1.5;

// ── Gom ngày lễ liền kề ──────────────────────────────────────────────────────

/** Đủ để biết một ngày có phải ngày lễ hay không. */
export interface DayHolidayLookup {
  has(dateKey: HolidayDateKey): boolean;
}

/**
 * Cụm ngày lễ LIỀN KỀ chứa `dateKey`, để làm khoảng mặc định cho thao tác nhiều ngày.
 *
 * Vì sao cần: Google trả Quốc khánh 2026 thành BA sự kiện một ngày (31/08 và 01/09 là "ngày lễ
 * bổ sung", 02/09 là chính lễ), và Tết thành một chuỗi dài. Người vận hành bấm vào 31/08 nghĩ
 * "cả dịp lễ", không phải "đúng ngày 31". Mặc định đúng ở đây tiết kiệm cho họ ba lần thao tác
 * và một lần quên.
 *
 * `maxSpan` chặn trường hợp dữ liệu hỏng nối thành một dải vô tận.
 */
export function holidayRunAround(
  byDay: DayHolidayLookup,
  dateKey: HolidayDateKey,
  maxSpan = 31,
): { from: HolidayDateKey; to: HolidayDateKey } {
  if (!byDay.has(dateKey)) return { from: dateKey, to: dateKey };

  let from = dateKey;
  for (let i = 1; i < maxSpan; i += 1) {
    const previous = shiftDateKey(dateKey, -i);
    if (!byDay.has(previous)) break;
    from = previous;
  }

  let to = dateKey;
  for (let i = 1; i < maxSpan; i += 1) {
    const next = shiftDateKey(dateKey, i);
    if (!byDay.has(next)) break;
    to = next;
  }

  return { from, to };
}

/** Mọi ngày trong khoảng `[from, to]`, dạng khoá ngày. Có trần để không lặp vô tận. */
export function listDateKeys(
  from: HolidayDateKey,
  to: HolidayDateKey,
  maxDays = 62,
): HolidayDateKey[] {
  const span = daysBetweenDateKeys(from, to);
  if (span < 0) return [];
  const last = Math.min(span, maxDays - 1);
  return Array.from({ length: last + 1 }, (_, i) => shiftDateKey(from, i));
}

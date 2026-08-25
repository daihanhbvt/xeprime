import { Prisma } from '@xeprime/prisma';
import {
  HELD_FUNDS_RECEIPT_SOURCES,
  RECEIPT_STATUS,
  RECEIPT_TYPE,
  vnDateKey,
  vnDayStart,
  type FinanceGranularity,
} from '@xeprime/types';
import { dayEndUtc, dayRangeFilter, dayStartUtc } from './day-range';

/**
 * MỘT định nghĩa của "doanh thu" và "chi phí" cho toàn sản phẩm.
 *
 * ## Vì sao phải gom
 *
 * Trước file này, hai bề mặt cùng gộp `receipts` nhưng gộp khác nhau:
 *  - `FinanceOverviewService.summary` cộng MỌI phiếu đã duyệt ⇒ "Tổng thu" phình đúng bằng số
 *    cọc đang cầm;
 *  - `VehiclesService.stats` tự viết `source: { notIn: HELD_FUNDS_RECEIPT_SOURCES }` ⇒ doanh thu
 *    theo xe đã loại cọc.
 *
 * Cùng một gian hàng, hai màn hai con số — đúng loại lỗi khiến người dùng thôi tin cả hai.
 * [ADR 0013](../../../../docs/decisions/0013-no-online-payment-mvp.md) §3 đứng về phía thứ hai:
 * cọc là **tài sản giữ hộ**, bị loại khỏi Doanh thu.
 *
 * ## Hai lớp tiền, hai vị từ
 *
 * ```
 * DÒNG TIỀN QUỸ   (ledger)   = mọi phiếu đã duyệt      → "tôi cầm bao nhiêu tiền trong kỳ"
 * KẾT QUẢ KINH DOANH (business) = ledger − tiền giữ hộ → "kỳ này tôi lãi bao nhiêu"
 * ```
 *
 * Cả hai đều ĐÚNG, chỉ trả lời hai câu hỏi khác nhau — nên chúng được đặt tên khác nhau và hiện
 * ở hai khối khác nhau trên giao diện, không trộn vào một hàng thẻ.
 *
 * ## Cố ý KHÔNG tính vào đây
 *
 * - **Phụ phí** (`booking_surcharges`): là khoản ĐÒI, không phải tiền đổi tay — nó thuộc công nợ
 *   (`common/booking-money.ts`), không thuộc doanh thu.
 * - **Nghĩa vụ nguồn xe** (trả góp / thuê lại / hoa hồng ký gửi): chưa bao giờ sinh phiếu chi.
 *   ⇒ "Lợi nhuận" ở đây là **lãi tiền mặt theo sổ**, chưa trừ khấu hao và lãi vay. Giao diện phải
 *   nói rõ điều đó thay vì để người đọc hiểu là lãi ròng.
 * - **Tiền gói trả cho nền tảng**: dòng tiền khác hẳn (ADR 0015/0016), không nằm trong sổ gian hàng.
 */

/** Phiếu là TIỀN THẬT: đã duyệt, chưa xoá. Phiếu chờ duyệt chưa phải tiền. */
const REAL_MONEY = {
  status: RECEIPT_STATUS.APPROVED,
  deletedAt: null,
} satisfies Pick<Prisma.ReceiptWhereInput, 'status' | 'deletedAt'>;

/**
 * DÒNG TIỀN QUỸ — mọi phiếu đã duyệt rơi trong kỳ.
 *
 * Kỳ lọc theo `occurred_at` (lúc tiền di chuyển) chứ không phải `created_at` (lúc ai đó gõ vào
 * máy), và đi qua `dayRangeFilter` để `YYYY-MM-DD` nghĩa là trọn một ngày Việt Nam.
 */
export function ledgerWhere(
  tenantId: string,
  from: string | undefined,
  to: string | undefined,
): Prisma.ReceiptWhereInput {
  const occurredAt = dayRangeFilter(from, to);
  return { tenantId, ...REAL_MONEY, ...(occurredAt ? { occurredAt } : {}) };
}

/** KẾT QUẢ KINH DOANH — `ledgerWhere` trừ đi tiền giữ hộ (ADR 0013 §3). */
export function businessWhere(
  tenantId: string,
  from: string | undefined,
  to: string | undefined,
): Prisma.ReceiptWhereInput {
  return {
    ...ledgerWhere(tenantId, from, to),
    source: { notIn: [...HELD_FUNDS_RECEIPT_SOURCES] },
  };
}

/**
 * Bản SQL của cùng vị từ, cho các câu raw phải `date_trunc`/`GROUP BY` mà Prisma không diễn đạt
 * được. Giả định bảng `receipts` mang bí danh `r`.
 *
 * Hai bản (TS và SQL) phải khớp từng điều kiện — đó là lý do chúng nằm cạnh nhau trong một file
 * chứ không rải ra hai module.
 */
export const SQL_REAL_MONEY = Prisma.sql`r.status = ${RECEIPT_STATUS.APPROVED} AND r.deleted_at IS NULL`;

/** `AND r.source NOT IN (...)` — phần biến `ledger` thành `business`. */
export const SQL_BUSINESS_ONLY = Prisma.sql`r.source NOT IN (${Prisma.join([
  ...HELD_FUNDS_RECEIPT_SOURCES,
])})`;

/** `SUM` một chiều tiền, trả chuỗi thập phân đã bỏ số 0 thừa (khớp ADR 0007). */
export function sqlSumOfType(type: string): Prisma.Sql {
  return Prisma.sql`COALESCE(SUM(r.amount) FILTER (WHERE r.type = ${type}), 0)`;
}

export const SQL_SUM_INCOME = sqlSumOfType(RECEIPT_TYPE.INCOME);
export const SQL_SUM_EXPENSE = sqlSumOfType(RECEIPT_TYPE.EXPENSE);

/**
 * Biên lợi nhuận theo phần trăm — `null` khi chưa có doanh thu.
 *
 * Trả `0` cho kỳ chưa thu đồng nào là nói dối theo hướng dễ chịu: "biên 0%" đọc như hoà vốn,
 * trong khi sự thật là **chưa có gì để tính biên**. Giao diện hiện `—` cho `null`.
 */
export function profitMarginPercent(
  revenue: Prisma.Decimal,
  profit: Prisma.Decimal,
): number | null {
  if (revenue.isZero()) return null;
  return Number(profit.dividedBy(revenue).times(100).toDecimalPlaces(1));
}

/**
 * Độ mịn thực sự dùng được cho một kỳ.
 *
 * Một kỳ 400 ngày vẽ theo `day` là 400 cột không ai đọc nổi và một câu truy vấn vô ích. Server
 * nâng bậc rồi trả lại giá trị đã dùng để client hiển thị đúng thứ đã vẽ — không tự suy.
 */
export function resolveGranularity(
  requested: FinanceGranularity,
  from: Date,
  to: Date,
  maxBuckets: number,
): FinanceGranularity {
  const days = Math.max(1, Math.ceil((to.getTime() - from.getTime()) / 86_400_000));
  if (requested === 'day' && days > maxBuckets) {
    return days / 7 > maxBuckets ? 'month' : 'week';
  }
  if (requested === 'week' && days / 7 > maxBuckets) return 'month';
  return requested;
}

/** `AND r.occurred_at …` cho câu raw — bỏ hẳn vế nào không có biên, không gửi `NULL` xuống. */
export function sqlOccurredRange(from: Date | undefined, to: Date | undefined): Prisma.Sql {
  return Prisma.sql`
    ${from ? Prisma.sql`AND r.occurred_at >= ${from}` : Prisma.empty}
    ${to ? Prisma.sql`AND r.occurred_at <= ${to}` : Prisma.empty}`;
}

/**
 * Biên kỳ đã phân giải cho các báo cáo — hai đầu LUÔN có giá trị.
 *
 * `generate_series` cần cả hai đầu, nên một biểu đồ "không chọn kỳ" là một biểu đồ không vẽ được.
 * Mặc định là THÁNG HIỆN TẠI theo giờ Việt Nam — cùng thứ mà thanh kỳ nhanh của giao diện chọn
 * sẵn, để URL trống và URL có `?from=…&to=…` của tháng này cho ra đúng một kết quả.
 */
export function resolvePeriodBounds(
  from: string | undefined,
  to: string | undefined,
  now: Date = new Date(),
): { fromAt: Date; toAt: Date } {
  const todayKey = vnDateKey(now);
  return {
    fromAt: dayStartUtc(from) ?? vnDayStart(`${todayKey.slice(0, 8)}01`),
    toAt: dayEndUtc(to) ?? (dayEndUtc(todayKey) as Date),
  };
}

// ---------------------------------------------------------------------------
// Phạm vi — cùng phép tính, thu hẹp lại một chiếc xe hoặc một khách
// ---------------------------------------------------------------------------

/**
 * Thu hẹp một báo cáo về MỘT thực thể.
 *
 * Vì sao không viết endpoint riêng cho "doanh thu một chiếc xe": nó sẽ là bản thứ hai của cùng
 * phép tính, và bản thứ hai luôn trôi khỏi bản đầu. Thu hẹp vị từ thay vì nhân đôi nó nghĩa là
 * con số ở hồ sơ xe và con số ở dòng tương ứng trong bảng tổng quan **không thể khác nhau** —
 * chúng là cùng một câu truy vấn với một mệnh đề `AND` thêm vào.
 *
 * `tenantId` vẫn luôn đến từ scope của người gọi, nên một id đoán được của gian hàng khác chỉ
 * cho ra tập rỗng, không rò dữ liệu.
 */
export interface FinanceScope {
  vehicleId?: string;
  tenantCustomerId?: string;
}

/** Phần thu hẹp cho `receipts` (Prisma). Rỗng khi không thu hẹp — báo cáo giữ nguyên tầm gian hàng. */
export function scopeWhere(scope: FinanceScope): Prisma.ReceiptWhereInput {
  return {
    ...(scope.vehicleId ? { vehicleId: scope.vehicleId } : {}),
    ...(scope.tenantCustomerId ? { tenantCustomerId: scope.tenantCustomerId } : {}),
  };
}

/** Bản SQL cho `receipts` — giả định bí danh `r`. */
export function sqlReceiptScope(scope: FinanceScope): Prisma.Sql {
  return Prisma.sql`
    ${scope.vehicleId ? Prisma.sql`AND r.vehicle_id = ${scope.vehicleId}` : Prisma.empty}
    ${
      scope.tenantCustomerId
        ? Prisma.sql`AND r.tenant_customer_id = ${scope.tenantCustomerId}`
        : Prisma.empty
    }`;
}

/**
 * Bản SQL cho `bookings` — giả định bí danh `b`.
 *
 * Cần riêng vì ba con số KHÔNG đến từ `receipts`: số chuyến, cọc đang giữ và công nợ đều tính
 * trên đơn. Một chiếc xe và một khách đều gắn được vào đơn, nên cùng một phạm vi diễn đạt được
 * ở cả hai bảng — nhưng bằng hai cột khác nhau, nên không gộp được thành một hàm.
 */
export function sqlBookingScope(scope: FinanceScope): Prisma.Sql {
  return Prisma.sql`
    ${scope.vehicleId ? Prisma.sql`AND b.vehicle_id = ${scope.vehicleId}` : Prisma.empty}
    ${
      scope.tenantCustomerId
        ? Prisma.sql`AND b.tenant_customer_id = ${scope.tenantCustomerId}`
        : Prisma.empty
    }`;
}

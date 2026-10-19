import { isZeroMoney, subtractMoney } from '@xeprime/domain';
import { FEE_BEARER, type MoneyString } from '@xeprime/types';

/**
 * Luật HIỂN THỊ của một bảng giá — dòng nào vẽ, dòng nào ẩn, phần trả tay chủ xe là bao nhiêu.
 *
 * Một nguồn cho mọi bề mặt vẽ tiền từ báo giá/snapshot (`PriceBreakdown`, thẻ chi phí của màn Xem
 * lại yêu cầu thuê): hai chỗ tự lọc dòng là hai chỗ có thể lệch nhau, và khách sẽ thấy hai bảng
 * khác nhau cho cùng một chuyến. Chỉ CHỌN dòng — không cộng trừ gì ngoài phần trả tay dự phòng.
 *
 * So tiền trên CHUỖI (`isZeroMoney`), không qua `Number` (ADR 0007).
 */

interface PriceRowLike {
  key: string;
  amount: string;
}

interface FeeLineLike {
  bearer: string;
  amount: string;
}

interface FeesLike {
  customerTotalAmount: string;
  holdAmount?: string | null;
  payAtPickupAmount?: string | null;
}

/**
 * Dòng giá thuê đáng vẽ: bỏ dòng 0đ (phí ngoài giờ, dịch vụ cộng thêm là CHỖ ĐỨNG trong snapshot,
 * phát sinh lúc trả xe) và các khoá nơi gọi không muốn (vd tổng phụ). Không dòng nào bị bỏ khỏi
 * dữ liệu — chỉ khỏi màn hình.
 */
export function visiblePriceRows<T extends PriceRowLike>(
  rows: readonly T[],
  skipKeys: readonly string[] = [],
): T[] {
  return rows.filter((row) => !isZeroMoney(row.amount) && !skipKeys.includes(row.key));
}

/**
 * Dòng phụ phí đáng vẽ cho người đọc. Dòng do CHỦ XE chịu (thuế khấu trừ — ADR 0032 điều 3) không
 * cộng vào tổng khách, nên với khách nó chỉ là một con số lạ giữa hoá đơn của họ: chỉ chủ xe thấy.
 */
export function visibleFeeLines<T extends FeeLineLike>(
  lines: readonly T[],
  audience: 'customer' | 'owner',
): T[] {
  return lines.filter(
    (line) =>
      (audience === 'owner' || line.bearer !== FEE_BEARER.OWNER) && !isZeroMoney(line.amount),
  );
}

/**
 * Phần khách trả TRỰC TIẾP chủ xe lúc nhận xe (`B − D`). Server tính sẵn (`payAtPickupAmount`);
 * đơn/snapshot cũ chưa có trường đó thì rơi về `tổng khách trả − tiền giữ chỗ`. Không có tiền giữ
 * chỗ thì không có khái niệm "phần còn lại".
 */
export function payAtPickupAmount(fees: FeesLike | null | undefined): MoneyString | null {
  if (!fees) return null;
  if (fees.payAtPickupAmount) return fees.payAtPickupAmount;
  return fees.holdAmount ? subtractMoney(fees.customerTotalAmount, fees.holdAmount) : null;
}

interface QuoteFeesLike extends FeesLike {
  lines: readonly FeeLineLike[];
  promoDiscountAmount?: string | null;
}

/**
 * Con số CUỐI khách thấy cho một báo giá, và nó được gọi là gì:
 *
 *  - `subtotal` — báo giá còn phụ phí chưa tính (`estimateNote`): chỉ là tạm tính.
 *  - `customerTotal` — có phụ phí phía khách hoặc mã giảm: số cuối là "Tổng bạn trả"
 *    (`B + S + IV + IP − P`), không còn là tiền thuê (ADR 0028 điều 3).
 *  - `total` — không có gì ngoài tiền thuê: "Tổng dự kiến".
 *
 * Một nguồn cho thẻ chi phí của màn Xem lại và thẻ chuyến của hộp "Đã gửi yêu cầu" — khách vừa đọc
 * "Tổng bạn trả 1.900.000đ" thì bấm gửi xong không được thấy cùng số đó dưới một cái tên khác.
 */
export function customerTotalView(breakdown: {
  estimateNote?: string | null;
  totalAmount: string;
  fees?: QuoteFeesLike | null;
}): { kind: 'subtotal' | 'customerTotal' | 'total'; amount: string } {
  const fees = breakdown.fees ?? null;
  const hasFees =
    fees !== null &&
    (visibleFeeLines(fees.lines, 'customer').length > 0 ||
      !isZeroMoney(fees.promoDiscountAmount ?? '0'));
  return {
    kind: breakdown.estimateNote ? 'subtotal' : hasFees ? 'customerTotal' : 'total',
    amount: fees?.customerTotalAmount ?? breakdown.totalAmount,
  };
}

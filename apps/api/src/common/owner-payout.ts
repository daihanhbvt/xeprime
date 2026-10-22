import { Prisma } from '@xeprime/prisma';
import {
  BILLING_MODE,
  SERVICE_TYPE,
  feeTaxDetailOf,
  type CustomerFeeBreakdown,
  type OwnerCommissionTier,
} from '@xeprime/types';
import type { OwnerPayoutDto } from './dto/owner-payout.dto';

/**
 * Bảng cộng ví chủ xe của MỘT bảng phí — chỗ DUY NHẤT dựng `OwnerPayoutDto` (ADR 0068 điều 5).
 *
 * Hộp duyệt yêu cầu (bảng phí TẠM TÍNH, có giá từng ngày) và chi tiết đơn (bảng phí ĐÃ ĐÓNG BĂNG)
 * cùng đi qua đây, nên hai màn không thể kể hai câu chuyện về cùng một chuyến.
 *
 * Đọc các dòng của snapshot, không tính lại theo chính sách hôm nay (ADR 0024). Snapshot cũ thiếu
 * tách GTGT/TNCN thì `vat*`/`pit*` là `null` (`feeTaxDetailOf`) — client hiện thuế gộp.
 *
 * `a` và `b` được DỰNG từ `R`, `D`, `H`, `T` chứ không chép `ownerNetAmount`/`payAtPickupAmount` của
 * snapshot: `payAtPickupAmount` gồm cả phí giao `G` (tiền mặt chủ xe nhận tận tay, không phải tiền
 * thuê), và dựng từ cùng bốn con số là cách duy nhất để `a − b = D − T` đúng tới đồng ở mọi đời
 * snapshot.
 *
 * @param dayAmounts giá thuê TỪNG ngày (sau khuyến mãi trực tiếp). Bỏ trống ⇒ đọc giá từng ngày
 *   đã đóng băng trong chính bảng phí (`dayPricesOf`). Không biết (`null`) ⇒ đơn giá chỉ biết được
 *   ở chuyến 1 ngày.
 */
export function ownerPayoutOf(
  fees: CustomerFeeBreakdown,
  dayAmounts: readonly string[] | null = dayPricesOf(fees),
): OwnerPayoutDto {
  const tax = feeTaxDetailOf(fees);
  const rent = new Prisma.Decimal(tax.rentAmount);
  // Snapshot trước luồng tiền v2 không có `ownerCommissionAmount` (kiểu đọc nói có, dữ liệu thì không).
  const commission = new Prisma.Decimal(fees.ownerCommissionAmount ?? '0');
  const taxAmount = new Prisma.Decimal(fees.taxAmount ?? '0');
  const deposit = new Prisma.Decimal(fees.depositAmount ?? '0');

  const ownerNet = rent.minus(commission).minus(taxAmount);
  const payAtPickupRent = rent.minus(deposit).minus(commission);

  return {
    rentAmount: rent.toFixed(0),
    rentalDays: fees.rentalDays,
    unitAmount: uniformDayAmount(rent, fees.rentalDays, dayAmounts),
    ownerCommissionAmount: commission.toFixed(0),
    commissionTiers: commissionTiersOf(fees),
    taxAmount: taxAmount.toFixed(0),
    vatAmount: tax.vatAmount,
    pitAmount: tax.pitAmount,
    vatPercent: tax.vatPercent,
    pitPercent: tax.pitPercent,
    taxTotalPercent: tax.totalPercent,
    taxExemptReason: tax.taxExemptReason,
    ownerNetAmount: ownerNet.toFixed(0),
    payAtPickupRentAmount: payAtPickupRent.toFixed(0),
    ownerPayableAmount: ownerNet.minus(payAtPickupRent).toFixed(0),
    collectsHold: fees.holdAmount != null,
  };
}

/**
 * Giá từng ngày ĐÃ NIÊM YẾT của bảng phí — `fees.dayAmounts` (đúng mảng đã làm mẫu số `H`).
 *
 * Dài hạn thì không: giá GÓI không có cấu tạo theo ngày (ADR 0011), mảng của nó chỉ là tiền gói
 * chia đều để chia nấc hoa hồng — đọc nó thành "đơn giá / ngày" là bịa ra một giá chủ xe chưa
 * từng đặt. Snapshot trước 22/10/2026 không có mảng ⇒ `null` (không biết).
 */
function dayPricesOf(fees: CustomerFeeBreakdown): readonly string[] | null {
  if (fees.serviceType === SERVICE_TYPE.LONG_TERM) return null;
  return fees.dayAmounts ?? null;
}

/**
 * Nấc hoa hồng lũy tiến của CHÍNH SÁCH ĐÃ ĐÓNG BĂNG cùng bảng phí — để dấu "i" của dòng phí dịch
 * vụ chủ xe kể đúng các nấc đã tính ra `H` của chuyến này, không phải nấc của chính sách hôm nay
 * (ADR 0024).
 *
 * `null` khi tuyến không chịu `H` (tuyến gói — dòng bị ẩn) hoặc snapshot không mang nấc (trước
 * luồng tiền v2): màn hình nói chung chung, không bịa con số.
 */
function commissionTiersOf(fees: CustomerFeeBreakdown): OwnerCommissionTier[] | null {
  if (fees.billingMode !== BILLING_MODE.COMMISSION) return null;
  // Kiểu đọc nói luôn có; snapshot trước luồng tiền v2 thì không.
  const tiers = fees.policy.ownerCommissionTiers as readonly OwnerCommissionTier[] | undefined;
  if (!tiers || tiers.length === 0) return null;
  return tiers.map(({ fromDay, percent }) => ({ fromDay, percent }));
}

/**
 * Đơn giá / ngày — CHỈ khi biết chắc mọi ngày cùng một giá (đặc tả 05 §7.1).
 *
 * Chia đều `R / N` khi không biết giá từng ngày là bịa ra một đơn giá chủ xe chưa từng niêm yết
 * (cuối tuần, ngày giá riêng đều làm các ngày khác nhau) — trả `null` để màn hình hiện "Tiền thuê
 * N ngày". Chuyến 1 ngày thì tiền thuê CHÍNH LÀ đơn giá.
 *
 * Export cho sao kê ví: đơn lập tay không có bảng phí vẫn phải theo đúng luật này.
 */
export function uniformDayAmount(
  rent: Prisma.Decimal,
  rentalDays: number,
  dayAmounts: readonly string[] | null | undefined,
): string | null {
  if (dayAmounts && dayAmounts.length === rentalDays && dayAmounts.length > 0) {
    const first = new Prisma.Decimal(dayAmounts[0]!);
    return dayAmounts.every((amount) => new Prisma.Decimal(amount).equals(first))
      ? first.toFixed(0)
      : null;
  }
  return rentalDays === 1 ? rent.toFixed(0) : null;
}

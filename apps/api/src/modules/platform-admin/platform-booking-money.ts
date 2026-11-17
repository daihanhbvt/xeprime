import { Prisma } from '@xeprime/prisma';
import { FEE_LINE, type CustomerFeeBreakdown } from '@xeprime/types';
import { feeLineAmount } from '../../common/fee-lines';
import { ownerPayoutOf } from '../../common/owner-payout';
import type { PlatformBookingFeesDto } from './dto/platform-booking.dto';

/**
 * Bảng tiền marketplace của MỘT đơn cho người trực nền tảng - hàm THUẦN trên bảng phí đã đóng băng
 * (ADR 0024). Không đọc chính sách hôm nay, không tính lại công thức nào: mỗi dòng là một trường
 * hoặc một dòng phụ phí của snapshot, phía chủ xe đi qua `ownerPayoutOf` (một nguồn với site đối tác).
 *
 * `null` khi đơn không có bảng phí luồng tiền mới: đơn gian hàng lập tay (không có `fees`) hoặc
 * snapshot trước luồng tiền v2 (thiếu `grossOnlineAmount`). Màn hình nói "không có dữ liệu" thay vì
 * dựng một cột số 0 trông như sự thật.
 */
export function marketplaceFeesOf(
  fees: CustomerFeeBreakdown | null | undefined,
  period: { pickupAt: Date; returnAt: Date },
): PlatformBookingFeesDto | null {
  // Kiểu đọc nói các trường luôn có; snapshot đời cũ thì không.
  if (!fees || fees.grossOnlineAmount == null || fees.onlineAmount == null) return null;

  const ownerPayout = ownerPayoutOf(fees, undefined, period);
  const promo = fees.promoDiscountAmount ?? '0';
  const retained = fees.platformRetainedAmount ?? '0';

  return {
    billingMode: fees.billingMode,
    baseAmount: fees.baseAmount,
    deliveryAmount: fees.deliveryAmount ?? '0',
    serviceFeeAmount: feeLineAmount(fees, FEE_LINE.SERVICE_FEE),
    vehicleInsuranceAmount: feeLineAmount(fees, FEE_LINE.VEHICLE_PROTECTION),
    personalInsuranceAmount: feeLineAmount(fees, FEE_LINE.TRIP_INSURANCE),
    insuranceServiceFeeAmount: feeLineAmount(fees, FEE_LINE.INSURANCE_SERVICE_FEE),
    depositAmount: fees.depositAmount,
    promoDiscountAmount: promo,
    promoCode: fees.promo?.code ?? null,
    grossOnlineAmount: fees.grossOnlineAmount,
    onlineAmount: fees.onlineAmount,
    payAtPickupAmount: fees.payAtPickupAmount,
    customerTotalAmount: fees.customerTotalAmount,
    platformRetainedAmount: retained,
    // Doanh thu thật của nền tảng = S + H − P, được phép âm (chi phí marketing thật - ADR 0046).
    platformNetAmount: new Prisma.Decimal(retained).minus(promo).toFixed(0),
    ownerPayout,
  };
}

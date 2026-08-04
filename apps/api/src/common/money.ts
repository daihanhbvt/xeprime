import { Prisma } from '@xeprime/prisma';

/**
 * Công nợ còn lại của một đơn thuê = `max(0, total − paid)`.
 *
 * Phase 6 chốt: KHÔNG denormalize cột công nợ — tính động từ `total_amount`/`paid_amount` để
 * không có gì phải drift. Vì thế công thức bị lặp ở mọi nơi hiển thị đơn (danh sách đơn, hợp
 * đồng, giám sát nền tảng); gom về đây để đúng một chỗ định nghĩa "thế nào là còn nợ".
 *
 * Kẹp sàn 0 là có chủ đích: khách trả dư (đặt cọc rồi giảm giá) là công nợ 0, không phải số âm.
 */
export function bookingDebt(
  totalAmount: Prisma.Decimal | string | number,
  paidAmount: Prisma.Decimal | string | number,
): Prisma.Decimal {
  return Prisma.Decimal.max(0, new Prisma.Decimal(totalAmount).minus(paidAmount));
}

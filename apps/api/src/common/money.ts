import { Prisma } from '@xeprime/prisma';

/**
 * Phần còn phải trả **theo đúng giá thuê đã chốt** = `max(0, total − paid)`.
 *
 * ⚠️ **Đây KHÔNG còn là công nợ của đơn.** Công nợ thật (có phụ phí, có phiếu thu tay, có phần
 * cọc đã gánh) nằm ở [`booking-money.ts`](./booking-money.ts) — dùng `bookingMoney()` cho mọi
 * bề mặt hiển thị "khách còn nợ bao nhiêu".
 *
 * Hàm này giữ lại cho đúng MỘT nơi: **hợp đồng thuê**. Hợp đồng là bản đông cứng thoả thuận lúc
 * ký, còn phụ phí phát sinh sau khi ký — đưa chúng vào bản in là làm hợp đồng nói khác lúc ký.
 *
 * Kẹp sàn 0 là có chủ đích: khách trả dư (đặt cọc rồi giảm giá) là 0, không phải số âm.
 */
export function bookingDebt(
  totalAmount: Prisma.Decimal | string | number,
  paidAmount: Prisma.Decimal | string | number,
): Prisma.Decimal {
  return Prisma.Decimal.max(0, new Prisma.Decimal(totalAmount).minus(paidAmount));
}

/**
 * Tiền VND cho **nội dung thông báo/email** — nơi duy nhất backend được phép format tiền.
 *
 * Mọi trường tiền trong JSON vẫn là chuỗi thập phân thô (ADR 0007) và do FE format; hàm này chỉ
 * dùng khi số tiền nằm trong một câu văn xuôi gửi cho người đọc, vì lúc đó không còn chỗ nào
 * khác để format nữa.
 */
export function formatVnd(amount: Prisma.Decimal | string | number): string {
  const rounded = new Prisma.Decimal(amount).toDecimalPlaces(0).toFixed(0);
  return `${rounded.replace(/\B(?=(\d{3})+(?!\d))/g, '.')}đ`;
}

import { Prisma } from '@xeprime/prisma';
import { BOOKING_REQUEST_STATUS } from '@xeprime/types';
import type { BookingHoldsService } from '../../src/modules/holds/booking-holds.service';
import type { PrismaService } from '../../src/prisma/prisma.service';

type Db = {
  bookingHold: {
    findFirstOrThrow: (args: unknown) => Promise<{ id: string; code: string; amount: Prisma.Decimal }>;
  };
  bookingRequest: { findUniqueOrThrow: (args: unknown) => Promise<{ status: string }> };
  $transaction: <T>(fn: (tx: Prisma.TransactionClient) => Promise<T>) => Promise<T>;
};

/**
 * KHÁCH TRẢ ĐỦ khoản giữ chỗ của một yêu cầu — bước mà ADR 0039 chèn vào giữa "gửi/duyệt" và
 * "có đơn thuê".
 *
 * Vì sao là helper DÙNG CHUNG chứ không chép vào từng spec: từ 16/09/2026 **mọi** gian hàng đều
 * thu cọc, nên hầu hết spec chạm tới vòng đời đặt xe đều phải đi qua bước này. Chép tay mười
 * bản là mười chỗ để cách trả tiền trong test trôi khỏi cách production làm — và đường tiền là
 * thứ sai một chỗ thì không ai phát hiện ra bằng mắt.
 *
 * Gọi thẳng `applyBankPaymentWithinTx` — ĐÚNG hàm mà webhook SePay gọi — thay vì dựng payload
 * webhook: spec dùng helper này đang kiểm vòng đời đặt xe, không kiểm đường đối soát ngân hàng
 * (`booking-hold-lifecycle.spec.ts` và `sepay-webhook.spec.ts` lo phần đó). Không có nhánh nào
 * chỉ test mới chạy.
 */
export async function payHoldForRequest(
  prisma: PrismaService,
  holds: BookingHoldsService,
  requestId: string,
): Promise<void> {
  const db = prisma as unknown as Db;
  const hold = await db.bookingHold.findFirstOrThrow({
    where: { bookingRequestId: requestId },
    select: { id: true, code: true, amount: true },
  });
  await db.$transaction((tx) =>
    holds.applyBankPaymentWithinTx(tx, {
      code: hold.code,
      amount: hold.amount,
      providerTxId: `spec-hold-${hold.id}`,
    }),
  );
}

/**
 * Trả tiền NẾU chuyến đang chờ tiền — không thì để yên.
 *
 * Dùng ở spec không quan tâm chuyến này có thu cọc hay không mà chỉ muốn tới được ĐƠN THUÊ: hai
 * ngoại lệ của ADR 0039 điều 4 (thuê dài hạn, báo giá tạm tính) đi qua `awaiting_hold` còn phần
 * lớn chuyến khác cũng vậy, nhưng một vài cấu hình vẫn tạo đơn thẳng. Hỏi trạng thái rồi mới
 * quyết định giữ cho spec không phải biết luật cọc của chính nó.
 */
export async function settleIfAwaitingHold(
  prisma: PrismaService,
  holds: BookingHoldsService,
  requestId: string,
): Promise<void> {
  const db = prisma as unknown as Db;
  const row = await db.bookingRequest.findUniqueOrThrow({
    where: { id: requestId },
    select: { status: true },
  });
  if (row.status !== BOOKING_REQUEST_STATUS.AWAITING_HOLD) return;
  await payHoldForRequest(prisma, holds, requestId);
}

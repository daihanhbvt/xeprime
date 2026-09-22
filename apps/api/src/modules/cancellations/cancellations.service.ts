import { Injectable } from '@nestjs/common';
import { newId, Prisma } from '@xeprime/prisma';
import {
  AUDIT_ACTOR_SCOPE,
  CANCELLATION_PARTY,
  cancellationCountsAgainstHost,
  type AuditActorScope,
  type CancellationParty,
  type CancellationReasonCategory,
  type CancellationStage,
} from '@xeprime/types';

/** Một lượt huỷ, như nơi gọi mô tả nó. `responsibleParty` KHÔNG có ở đây — xem docblock. */
export interface RecordCancellationInput {
  tenantId: string;
  bookingRequestId?: string | null;
  bookingId?: string | null;
  stage: CancellationStage;
  reasonCategory: CancellationReasonCategory;
  reason?: string | null;
  actorUserId: string | null;
  actorScope: AuditActorScope;
  /**
   * Ghi đè PHÍA CHỊU TRÁCH NHIỆM — **chỉ đường của `platform_admin`**.
   *
   * Tồn tại cho đúng một ca: nền tảng xác minh được đây là sự cố ngoài kiểm soát và quyết định
   * không tính cho gian hàng. Mọi đường khác bỏ trống, và phía chịu trách nhiệm được suy từ
   * `actorScope` — nếu chủ xe tự khai được `force_majeure` thì chỉ số uy tín mất nghĩa trong
   * một tuần.
   */
  verifiedParty?: CancellationParty;
}

/**
 * Writer DUY NHẤT của `booking_cancellations` — ADR 0045 điều 1.
 *
 * Ba đường ghi vào bảng này (gian hàng rút lại chuyến chưa có đơn, huỷ đơn đã tạo, khách tự
 * huỷ), và cả ba phải đồng ý về **ai chịu trách nhiệm**. Để mỗi service tự dựng lấy một object
 * là để ba nơi tự trả lời câu hỏi đó, và sớm muộn một nơi trả lời sai theo hướng có lợi cho
 * người đang bấm nút.
 *
 * Module LÁ: chỉ Prisma. `BookingsModule` và `BookingRequestsModule` đều import được mà không
 * tạo vòng.
 */
@Injectable()
export class CancellationsService {
  /**
   * Ghi MỘT dòng huỷ, TRONG transaction của nơi gọi.
   *
   * Không mở transaction riêng là bắt buộc chứ không phải tối ưu: dòng này phải sống hoặc chết
   * cùng lượt đóng hold/nhả lịch/ghi khoản hoàn. Một chuyến đã huỷ mà không có dòng nào giải
   * thích ai huỷ là đúng thứ bảng này sinh ra để chấm dứt.
   *
   * Idempotent bằng UNIQUE ở DB (`booking_request_id`, `booking_id`), không bằng một phép đọc
   * trước: hai lượt bấm huỷ song song, hoặc một lượt huỷ đua với webhook tiền về, chỉ có đúng
   * một bên ghi được — và bên thua nhận `P2002`, quay đầu cả transaction.
   */
  async recordWithinTx(
    tx: Prisma.TransactionClient,
    input: RecordCancellationInput,
  ): Promise<void> {
    const party = input.verifiedParty ?? partyFromScope(input.actorScope);
    await tx.bookingCancellation.create({
      data: {
        id: newId(),
        tenantId: input.tenantId,
        bookingRequestId: input.bookingRequestId ?? null,
        bookingId: input.bookingId ?? null,
        responsibleParty: party,
        reasonCategory: input.reasonCategory,
        reason: input.reason?.trim() || null,
        stage: input.stage,
        actorUserId: input.actorUserId,
        actorScope: input.actorScope,
        /*
         * Cột dẫn xuất nhưng ĐÔNG LẠNH: đổi luật phân loại về sau không được viết lại lịch sử
         * của một gian hàng (kỷ luật snapshot ADR 0024). CHECK ở DB canh hai cột khớp nhau.
         */
        countsAgainstHost: cancellationCountsAgainstHost(party),
      },
    });
  }
}

/**
 * Bề mặt người bấm → PHÍA chịu trách nhiệm.
 *
 * `system` được xếp vào `platform`: một lượt huỷ do worker là hệ quả của luật nền tảng đặt ra,
 * không phải của một quyết định nào từ gian hàng. Xếp nó vào `host` sẽ phạt chủ xe vì đồng hồ
 * của chính XePrime.
 */
function partyFromScope(scope: AuditActorScope): CancellationParty {
  if (scope === AUDIT_ACTOR_SCOPE.CUSTOMER) return CANCELLATION_PARTY.CUSTOMER;
  if (scope === AUDIT_ACTOR_SCOPE.PLATFORM || scope === AUDIT_ACTOR_SCOPE.SYSTEM) {
    return CANCELLATION_PARTY.PLATFORM;
  }
  return CANCELLATION_PARTY.HOST;
}

import { Prisma, type PrismaClient } from '@xeprime/prisma';
import {
  INSURANCE_ISSUE_ERROR,
  INSURANCE_POLICY_STATUS,
  insuranceRetryDelayMinutes,
} from '@xeprime/types';

const BATCH = 50;

/**
 * PHÁT HÀNH bảo hiểm chuyến — Phase 7 (ADR 0032 điều 4).
 *
 * ## Vì sao việc này ở worker chứ không ở transaction chuyển trạng thái
 *
 * Phát hành là một lời gọi HTTP ra ngoài. Đặt nó vào transaction của `to = ACTIVE` nghĩa là một
 * đối tác treo 30 giây sẽ giữ khoá trên `bookings` và `vehicle_occupancies` suốt 30 giây đó — sự
 * cố của họ thành sự cố của cả sàn. `BookingsService` chỉ đặt `next_attempt_at`; ở đây mới đi ra.
 *
 * ## Bản này CHƯA gọi đối tác thật
 *
 * Chưa có adapter nào được cắm (`NoopInsurancePartner` ở `apps/api`), và worker **không import
 * được service của `apps/api`** — cùng tiền lệ `lib/notify.ts`. Nên job này làm đúng phần nó làm
 * được mà không cần đối tác: **đánh dấu `failed` với `partner_not_configured`** để phí đã thu
 * hiện ra ở hàng đợi admin và nằm đúng vế GIỮ HỘ của đối soát ba vế.
 *
 * ⚠️ Nó **không bao giờ** ghi `issued`. Một số chứng nhận bịa là lời khẳng định với khách rằng
 * họ có bảo hiểm; `CHECK booking_insurance_policies_issued_needs_certificate_check` chặn ở tầng
 * DB, và job này không có gì để điền vào đó.
 *
 * Ngày cắm đối tác thật: hoặc chuyển phần gọi sang một HTTP client ở đây, hoặc để `apps/api` lộ
 * một endpoint nội bộ cho worker gọi. Cả hai đều không đổi bảng và không đổi trạng thái.
 *
 * ## Chống gọi đôi
 *
 * `updateMany` có điều kiện `status` trong WHERE là bước CHIẾM: hai worker (rolling deploy) thì
 * đúng một bên thấy `count = 1`. Đọc rồi mới ghi sẽ cho cả hai cùng gọi đối tác trên cùng một
 * hợp đồng — và lúc đó khoá idempotency của đối tác là thứ duy nhất cứu, tức là nhờ họ sửa lỗi
 * của mình.
 */
export interface InsuranceIssueResult {
  claimed: number;
  failed: number;
}

export async function sweepInsuranceIssue(
  prisma: PrismaClient,
  now: Date = new Date(),
): Promise<InsuranceIssueResult> {
  const due = await prisma.bookingInsurancePolicy.findMany({
    where: {
      status: { in: [INSURANCE_POLICY_STATUS.RESERVED, INSURANCE_POLICY_STATUS.FAILED] },
      nextAttemptAt: { not: null, lte: now },
    },
    orderBy: { nextAttemptAt: 'asc' },
    take: BATCH,
    select: { id: true, status: true, issueAttempts: true },
  });
  if (due.length === 0) return { claimed: 0, failed: 0 };

  let claimed = 0;
  let failed = 0;

  for (const policy of due) {
    // CHIẾM: `status` trong WHERE loại bên đến sau.
    const won = await prisma.bookingInsurancePolicy.updateMany({
      where: { id: policy.id, status: policy.status, nextAttemptAt: { not: null, lte: now } },
      data: { status: INSURANCE_POLICY_STATUS.ISSUING, lastAttemptAt: now },
    });
    if (won.count !== 1) continue;
    claimed += 1;

    const attempts = policy.issueAttempts + 1;
    /*
     * `partner_not_configured` là lỗi VĨNH VIỄN: không có gì để gọi lại. `nextAttemptAt = null`
     * nên worker thôi nhặt nó, và nó nằm im trong hàng đợi admin. Quay vòng mỗi phút trên một
     * lỗi cấu hình chỉ làm log ngập và giấu mất những lỗi thật sự tạm thời.
     */
    await prisma.bookingInsurancePolicy.update({
      where: { id: policy.id },
      data: {
        status: INSURANCE_POLICY_STATUS.FAILED,
        issueAttempts: attempts,
        lastErrorCode: INSURANCE_ISSUE_ERROR.PARTNER_NOT_CONFIGURED,
        lastErrorMessage:
          'Chưa cấu hình đối tác bảo hiểm — phí đã thu đang được giữ hộ, chưa có chứng nhận nào được cấp',
        nextAttemptAt: null,
        responsePayloadJson: {
          code: INSURANCE_ISSUE_ERROR.PARTNER_NOT_CONFIGURED,
          at: now.toISOString(),
        } as unknown as Prisma.InputJsonValue,
      },
    });
    failed += 1;
  }

  return { claimed, failed };
}

/**
 * Mốc thử lại kế tiếp — export để test khoá luật backoff mà không phải dựng cả một lượt quét.
 *
 * Dùng chung hàm thuần ở `@xeprime/types` để worker và `InsuranceService` không trôi khỏi nhau:
 * hai công thức backoff khác nhau cho cùng một bảng là hai hành vi không ai giải thích được.
 */
export function nextAttemptAfter(attempts: number, now: Date): Date {
  return new Date(now.getTime() + insuranceRetryDelayMinutes(attempts) * 60_000);
}

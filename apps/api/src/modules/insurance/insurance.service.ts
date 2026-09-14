import { ConflictException, Inject, Injectable, Logger, NotFoundException } from '@nestjs/common';
import { newId, Prisma } from '@xeprime/prisma';
import {
  API_ERROR_CODE,
  AUDIT_ACTOR_SCOPE,
  FEE_LINE,
  INSURANCE_ISSUE_ERROR,
  INSURANCE_POLICY_STATUS,
  INSURANCE_PRODUCT_KIND,
  insuranceRetryDelayMinutes,
  type BookingPriceSnapshot,
  type InsuranceConsentSource,
  type InsuranceIssueError,
  type InsuranceProductKind,
} from '@xeprime/types';
import { AuditService } from '../audit/audit.service';
import { PrismaService } from '../../prisma/prisma.service';
import { INSURANCE_PARTNER, type InsurancePartner } from './partner/insurance-partner.port';

/** Dòng phí bảo hiểm đọc từ snapshot — `IV` và `IP` là hai sản phẩm, không phải một tổng. */
interface PremiumLines {
  vehicleTrip: Prisma.Decimal;
  personalAccident: Prisma.Decimal;
}

/**
 * Writer DUY NHẤT của `booking_insurance_policies` — Phase 7 (ADR 0032 điều 4).
 *
 * ## Ba mốc, và KHÔNG có HTTP ở hai mốc đầu
 *
 *  1. **Đơn ra đời** → `reserveForBookingWithinTx`: tạo dòng `reserved`, `next_attempt_at = NULL`.
 *     Phí đã thu từ khách rồi (nó nằm trong khoản chuyển online), nhưng chưa mua gì cả.
 *  2. **Chuyến BẮT ĐẦU** (`to = ACTIVE`) → `markDueWithinTx`: chỉ đặt `next_attempt_at = now`.
 *     **Tuyệt đối không gọi đối tác trong transaction** — một request HTTP treo 30 giây bên
 *     trong một transaction đang giữ khoá trên `bookings` là cách khoá cả hệ thống bằng sự cố
 *     của người khác (CLAUDE.md cấm).
 *  3. **Worker** → `claimDue` + `applyIssueResult`: đây mới là nơi gọi ra ngoài.
 *
 * Huỷ TRƯỚC bàn giao → `cancelForBookingWithinTx` trong CÙNG transaction với phân bổ hold, vì
 * `resolveHoldAllocation` đã hoàn 100% `IV + IP` về ví khách: hai việc đó phải cùng thành công
 * hoặc cùng không, nếu không sẽ có khách được hoàn tiền trên một hợp đồng vẫn đang chờ phát hành.
 */
@Injectable()
export class InsuranceService {
  private readonly logger = new Logger(InsuranceService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
    @Inject(INSURANCE_PARTNER) private readonly partner: InsurancePartner,
  ) {}

  // ── 1. Đơn ra đời: giữ chỗ hợp đồng ──────────────────────────────────────

  /**
   * Tạo hợp đồng `reserved` cho một đơn vừa tạo, đọc phí từ SNAPSHOT đã đóng băng.
   *
   * Không sinh dòng nào khi phí bằng 0 — cổng bảo hiểm tắt, hoặc khách không chọn `IP`. CHECK
   * `premium_amount > 0` ở DB là chốt chặn thứ hai: một dòng 0đ là một hợp đồng không có nội
   * dung, và nó sẽ làm hàng đợi admin đầy những việc không có gì để làm.
   *
   * Idempotent bằng `skipDuplicates`: đơn được tạo lại (retry webhook) không mua hai lần.
   */
  async reserveForBookingWithinTx(
    tx: Prisma.TransactionClient,
    input: {
      bookingId: string;
      tenantId: string;
      holdId: string | null;
      snapshot: BookingPriceSnapshot;
      consent: { at: Date; source: InsuranceConsentSource } | null;
    },
  ): Promise<void> {
    const premiums = premiumsFromSnapshot(input.snapshot);
    const rows: Prisma.BookingInsurancePolicyCreateManyInput[] = [];

    const push = (kind: InsuranceProductKind, amount: Prisma.Decimal, needsConsent: boolean) => {
      if (amount.lte(0)) return;
      rows.push({
        id: newId(),
        bookingId: input.bookingId,
        tenantId: input.tenantId,
        holdId: input.holdId,
        productKind: kind,
        status: INSURANCE_POLICY_STATUS.RESERVED,
        premiumAmount: amount,
        partnerName: input.snapshot.fees?.policy.insurancePartnerName ?? this.partner.partnerName,
        /*
         * Khoá idempotency sinh MỘT lần, từ id đơn + sản phẩm. Không dùng random: worker thử lại
         * phải gửi ĐÚNG khoá cũ, nếu không đối tác coi đó là một hợp đồng mới và khách bị mua đôi.
         */
        idempotencyKey: `${input.bookingId}:${kind}`,
        // Bằng chứng khách chọn — chỉ có nghĩa với `IP`; `IV` bắt buộc nên không có gì để chọn.
        ...(needsConsent && input.consent
          ? { consentAt: input.consent.at, consentSource: input.consent.source }
          : {}),
      });
    };

    push(INSURANCE_PRODUCT_KIND.VEHICLE_TRIP, premiums.vehicleTrip, false);
    push(INSURANCE_PRODUCT_KIND.PERSONAL_ACCIDENT, premiums.personalAccident, true);
    if (rows.length === 0) return;

    await tx.bookingInsurancePolicy.createMany({ data: rows, skipDuplicates: true });
  }

  // ── 2. Chuyến bắt đầu: tới lúc phát hành ─────────────────────────────────

  /**
   * Đánh dấu "tới lúc phát hành" — CHỈ đặt mốc, không gọi ai.
   *
   * `updateMany` có điều kiện `status = reserved` nên chạy lại bao nhiêu lần cũng chỉ đặt mốc
   * một lần, và không kéo một hợp đồng đã `failed` (đang có backoff riêng) về lại hàng đầu.
   */
  async markDueWithinTx(
    tx: Prisma.TransactionClient,
    bookingId: string,
    now: Date = new Date(),
  ): Promise<number> {
    const { count } = await tx.bookingInsurancePolicy.updateMany({
      where: {
        bookingId,
        status: INSURANCE_POLICY_STATUS.RESERVED,
        nextAttemptAt: null,
      },
      data: { nextAttemptAt: now },
    });
    return count;
  }

  /**
   * Huỷ TRƯỚC bàn giao — hợp đồng chưa bao giờ được mua nên không phải làm việc với đối tác.
   *
   * Chỉ đụng `reserved`/`failed`. Một hợp đồng đã `issued` KHÔNG bị huỷ ở đây: nó cần `void`
   * qua đối tác, và gộp hai đường là cách để một hợp đồng có hiệu lực biến mất khỏi sổ mà hãng
   * bảo hiểm vẫn đang tính phí.
   */
  async cancelForBookingWithinTx(
    tx: Prisma.TransactionClient,
    bookingId: string,
    now: Date = new Date(),
  ): Promise<number> {
    const { count } = await tx.bookingInsurancePolicy.updateMany({
      where: {
        bookingId,
        status: { in: [INSURANCE_POLICY_STATUS.RESERVED, INSURANCE_POLICY_STATUS.FAILED] },
      },
      data: {
        status: INSURANCE_POLICY_STATUS.CANCELLED,
        cancelledAt: now,
        nextAttemptAt: null,
      },
    });
    return count;
  }

  // ── 3. Worker: gọi đối tác ───────────────────────────────────────────────

  /**
   * CHIẾM một lô hợp đồng tới hạn — `updateMany` có điều kiện, không đọc-rồi-ghi.
   *
   * Hai worker chạy song song (deploy chồng) thì đúng một bên chiếm được mỗi dòng: bên thua thấy
   * `count` nhỏ hơn và bỏ qua. Đọc danh sách rồi mới update sẽ cho cả hai cùng gọi đối tác trên
   * cùng một hợp đồng — và khoá idempotency là thứ duy nhất cứu, tức là dựa vào đối tác để sửa
   * lỗi của mình.
   */
  async claimDue(limit: number, now: Date = new Date()): Promise<string[]> {
    const due = await this.prisma.bookingInsurancePolicy.findMany({
      where: {
        status: { in: [INSURANCE_POLICY_STATUS.RESERVED, INSURANCE_POLICY_STATUS.FAILED] },
        nextAttemptAt: { not: null, lte: now },
      },
      orderBy: { nextAttemptAt: 'asc' },
      take: limit,
      select: { id: true, status: true },
    });

    const claimed: string[] = [];
    for (const row of due) {
      const { count } = await this.prisma.bookingInsurancePolicy.updateMany({
        // `status` trong WHERE là phần CHIẾM: ai đổi nó trước thì bên còn lại trượt.
        where: { id: row.id, status: row.status, nextAttemptAt: { not: null, lte: now } },
        data: { status: INSURANCE_POLICY_STATUS.ISSUING, lastAttemptAt: now },
      });
      if (count === 1) claimed.push(row.id);
    }
    return claimed;
  }

  /** Dữ liệu đủ để gọi đối tác cho một hợp đồng đã chiếm. */
  async loadForIssue(policyId: string) {
    return this.prisma.bookingInsurancePolicy.findUniqueOrThrow({
      where: { id: policyId },
      select: {
        id: true,
        tenantId: true,
        bookingId: true,
        productKind: true,
        premiumAmount: true,
        idempotencyKey: true,
        issueAttempts: true,
        consentAt: true,
        consentSource: true,
        booking: {
          select: {
            pickupAt: true,
            returnAt: true,
            customerName: true,
            customerPhone: true,
            vehicle: { select: { name: true, plateNumber: true } },
          },
        },
      },
    });
  }

  /**
   * Ghi kết quả một lần gọi đối tác.
   *
   * Thành công ⇒ `issued` + số chứng nhận (CHECK ở DB đòi nó, nên không có đường đánh dấu đã cấp
   * mà tay không). Thất bại ⇒ `failed` + backoff, hoặc dừng hẳn nếu lỗi không thử lại được.
   */
  async applyIssueResult(
    policyId: string,
    result:
      | {
          ok: true;
          certificateNumber: string;
          certificateUrl?: string;
          partnerProductCode?: string;
          coverageFrom: Date;
          coverageTo: Date;
          raw: unknown;
        }
      | { ok: false; code: InsuranceIssueError; message: string; retryable: boolean; raw?: unknown },
    now: Date = new Date(),
  ): Promise<void> {
    if (result.ok) {
      await this.prisma.bookingInsurancePolicy.update({
        where: { id: policyId },
        data: {
          status: INSURANCE_POLICY_STATUS.ISSUED,
          certificateNumber: result.certificateNumber,
          certificateUrl: result.certificateUrl ?? null,
          partnerProductCode: result.partnerProductCode ?? null,
          coverageFrom: result.coverageFrom,
          coverageTo: result.coverageTo,
          issuedAt: now,
          nextAttemptAt: null,
          lastErrorCode: null,
          lastErrorMessage: null,
          issueAttempts: { increment: 1 },
          responsePayloadJson: toJson(result.raw),
        },
      });
      return;
    }

    const current = await this.prisma.bookingInsurancePolicy.findUniqueOrThrow({
      where: { id: policyId },
      select: { issueAttempts: true },
    });
    const attempts = current.issueAttempts + 1;
    /*
     * Lỗi KHÔNG thử lại được (đối tác từ chối, chưa cắm đối tác) ⇒ `nextAttemptAt = null`: worker
     * thôi nhặt nó, và nó nằm im trong hàng đợi admin cho tới khi có người xử lý. Quay vòng vô
     * hạn trên một lỗi vĩnh viễn chỉ đốt hạn mức API và giấu mất những lỗi thật sự tạm thời.
     */
    const nextAttemptAt = result.retryable
      ? new Date(now.getTime() + insuranceRetryDelayMinutes(attempts) * 60_000)
      : null;

    await this.prisma.bookingInsurancePolicy.update({
      where: { id: policyId },
      data: {
        status: INSURANCE_POLICY_STATUS.FAILED,
        issueAttempts: attempts,
        lastErrorCode: result.code,
        lastErrorMessage: result.message.slice(0, 2000),
        nextAttemptAt,
        responsePayloadJson: toJson(result.raw),
      },
    });
  }

  /** Gọi đối tác cho MỘT hợp đồng đã chiếm — worker gọi; không chạy trong transaction nào. */
  async issueOne(policyId: string, now: Date = new Date()): Promise<'issued' | 'failed'> {
    const policy = await this.loadForIssue(policyId);
    const request = {
      idempotencyKey: policy.idempotencyKey,
      productKind: policy.productKind as InsuranceProductKind,
      premiumAmount: policy.premiumAmount.toFixed(0),
      coverageFrom: policy.booking.pickupAt,
      coverageTo: policy.booking.returnAt,
      vehicle: {
        name: policy.booking.vehicle.name,
        plateNumber: policy.booking.vehicle.plateNumber,
      },
      customer: {
        name: policy.booking.customerName,
        phone: policy.booking.customerPhone,
      },
      consent:
        policy.consentAt && policy.consentSource
          ? { at: policy.consentAt, source: policy.consentSource as InsuranceConsentSource }
          : null,
    };

    await this.prisma.bookingInsurancePolicy.update({
      where: { id: policyId },
      data: { requestPayloadJson: toJson(request) },
    });

    let result;
    try {
      result = await this.partner.issue(request);
    } catch (err) {
      /*
       * Adapter ném thay vì trả lỗi — coi là tạm thời và thử lại. Một exception rơi ra đây mà
       * không được bắt sẽ để hợp đồng kẹt vĩnh viễn ở `issuing`, tức là worker không bao giờ
       * nhặt lại nó và phí của khách nằm im không ai biết.
       */
      result = {
        ok: false as const,
        code: INSURANCE_ISSUE_ERROR.PARTNER_UNAVAILABLE,
        message: err instanceof Error ? err.message : String(err),
        retryable: true,
      };
    }

    await this.applyIssueResult(
      policyId,
      result.ok
        ? {
            ok: true,
            certificateNumber: result.certificateNumber,
            ...(result.certificateUrl === undefined
              ? {}
              : { certificateUrl: result.certificateUrl }),
            ...(result.partnerProductCode === undefined
              ? {}
              : { partnerProductCode: result.partnerProductCode }),
            coverageFrom: policy.booking.pickupAt,
            coverageTo: policy.booking.returnAt,
            raw: result.raw,
          }
        : result,
      now,
    );
    return result.ok ? 'issued' : 'failed';
  }

  // ── Admin ────────────────────────────────────────────────────────────────

  /**
   * Admin bấm THỬ LẠI — đặt mốc về `now`, worker nhặt ở vòng kế tiếp.
   *
   * Không tự gọi đối tác ngay tại request: một endpoint admin treo vì đối tác chậm là một tab
   * trình duyệt quay mãi và một người bấm lại năm lần.
   */
  async retry(policyId: string, actorUserId: string): Promise<void> {
    const policy = await this.prisma.bookingInsurancePolicy.findUnique({
      where: { id: policyId },
      select: { id: true, tenantId: true, status: true },
    });
    if (!policy) {
      throw new NotFoundException({
        code: API_ERROR_CODE.NOT_FOUND,
        message: 'Không tìm thấy hợp đồng bảo hiểm',
      });
    }
    if (policy.status !== INSURANCE_POLICY_STATUS.FAILED) {
      throw new ConflictException({
        code: API_ERROR_CODE.INVALID_STATUS_TRANSITION,
        message: 'Chỉ hợp đồng đang lỗi mới thử lại được',
        details: { status: policy.status },
      });
    }

    await this.prisma.$transaction(async (tx) => {
      await tx.bookingInsurancePolicy.updateMany({
        where: { id: policyId, status: INSURANCE_POLICY_STATUS.FAILED },
        data: { nextAttemptAt: new Date() },
      });
      await this.audit.record(
        {
          tenantId: policy.tenantId,
          actorUserId,
          actorScope: AUDIT_ACTOR_SCOPE.PLATFORM,
          action: 'insurance_policy.retry',
          targetType: 'booking_insurance_policy',
          targetId: policyId,
        },
        tx,
      );
    });
  }

  /**
   * THU HỒI một hợp đồng — bắt buộc lý do, có audit.
   *
   * Dùng cho hai ca khác nhau: hợp đồng `issued` phải huỷ (chuyến bị huỷ sau bàn giao), và hợp
   * đồng `failed` vĩnh viễn cần đóng sổ để thôi nằm trong hàng đợi. Cả hai đều là quyết định
   * TIỀN của người thật, nên lý do là bắt buộc chứ không phải tuỳ chọn.
   */
  async voidPolicy(policyId: string, actorUserId: string, reason: string): Promise<void> {
    const policy = await this.prisma.bookingInsurancePolicy.findUnique({
      where: { id: policyId },
      select: { id: true, tenantId: true, status: true },
    });
    if (!policy) {
      throw new NotFoundException({
        code: API_ERROR_CODE.NOT_FOUND,
        message: 'Không tìm thấy hợp đồng bảo hiểm',
      });
    }
    const voidable: string[] = [INSURANCE_POLICY_STATUS.ISSUED, INSURANCE_POLICY_STATUS.FAILED];
    if (!voidable.includes(policy.status)) {
      throw new ConflictException({
        code: API_ERROR_CODE.INVALID_STATUS_TRANSITION,
        message: 'Chỉ hợp đồng đã cấp hoặc đang lỗi mới thu hồi được',
        details: { status: policy.status },
      });
    }

    await this.prisma.$transaction(async (tx) => {
      await tx.bookingInsurancePolicy.updateMany({
        where: { id: policyId, status: policy.status },
        data: {
          status: INSURANCE_POLICY_STATUS.VOIDED,
          voidedAt: new Date(),
          nextAttemptAt: null,
          lastErrorMessage: reason,
        },
      });
      await this.audit.record(
        {
          tenantId: policy.tenantId,
          actorUserId,
          actorScope: AUDIT_ACTOR_SCOPE.PLATFORM,
          action: 'insurance_policy.void',
          targetType: 'booking_insurance_policy',
          targetId: policyId,
          before: { status: policy.status },
          after: { status: INSURANCE_POLICY_STATUS.VOIDED, reason },
        },
        tx,
      );
    });
  }
}

// ── Hàm thuần ───────────────────────────────────────────────────────────────

/**
 * Phí `IV`/`IP` đọc từ snapshot ĐÃ ĐÓNG BĂNG của đơn.
 *
 * Đọc từ `fees.lines` chứ không tính lại theo chính sách hiện hành: chính sách có thể đã đổi
 * phiên bản giữa lúc khách trả tiền và lúc chuyến bắt đầu, và mua bảo hiểm bằng số của hôm nay
 * cho một khoản phí đã thu hôm qua là hai con số khác nhau (ADR 0024).
 */
export function premiumsFromSnapshot(snapshot: BookingPriceSnapshot): PremiumLines {
  const lines = snapshot.fees?.lines ?? [];
  const amountOf = (key: string) =>
    new Prisma.Decimal(lines.find((l) => l.key === key)?.amount ?? '0');
  return {
    vehicleTrip: amountOf(FEE_LINE.VEHICLE_PROTECTION),
    personalAccident: amountOf(FEE_LINE.TRIP_INSURANCE),
  };
}

function toJson(value: unknown): Prisma.InputJsonValue {
  return (value ?? null) as Prisma.InputJsonValue;
}

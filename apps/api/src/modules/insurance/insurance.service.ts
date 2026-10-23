import { ConflictException, Inject, Injectable, NotFoundException } from '@nestjs/common';
import {
  activeInsuranceProductSnapshots,
  applyInsuranceIssueResult,
  claimDueInsurancePolicies,
  insuranceIssuingStaleBefore,
  issueInsurancePolicy,
  newId,
  Prisma,
  type InsuranceIssueOutcome,
  type InsuranceProductSnapshot,
} from '@xeprime/prisma';
import {
  API_ERROR_CODE,
  AUDIT_ACTOR_SCOPE,
  FEE_LINE,
  INSURANCE_POLICY_STATUS,
  INSURANCE_PRODUCT_KIND,
  type BookingPriceSnapshot,
  type InsuranceConsentSource,
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
    if (premiums.vehicleTrip.lte(0) && premiums.personalAccident.lte(0)) return;
    const rows: Prisma.BookingInsurancePolicyCreateManyInput[] = [];

    /*
     * Snapshot SẢN PHẨM (ADR 0064): tên, quyền lợi, khấu trừ khách đã thấy lúc chọn — admin sửa
     * hay TẮT danh mục sau đó không viết lại lời hứa.
     *
     * Nguồn là bản ĐÓNG BĂNG LÚC DUYỆT trên snapshot giá của hold (`freezeInsuranceProducts`) —
     * cùng mốc với giá (ADR 0024). Khách trả tiền sau lúc duyệt tới 120 phút, và admin tắt sản
     * phẩm trong khoảng đó không được làm hợp đồng của một khoản phí ĐÃ THU mất mô tả. Chỉ snapshot
     * trước 21/10/2026 (không mang `insuranceProducts`) mới đọc danh mục hiện hành, trong CÙNG
     * transaction tạo đơn.
     */
    const frozen = input.snapshot.insuranceProducts;
    const products: Map<InsuranceProductKind, InsuranceProductSnapshot> = frozen
      ? new Map(
          Object.entries(frozen).filter(
            (entry): entry is [InsuranceProductKind, InsuranceProductSnapshot] => entry[1] != null,
          ),
        )
      : await activeInsuranceProductSnapshots(tx);

    const push = (kind: InsuranceProductKind, amount: Prisma.Decimal) => {
      if (amount.lte(0)) return;
      const product = products.get(kind) ?? null;
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
        ...(product
          ? {
              productSnapshotJson: product as unknown as Prisma.InputJsonValue,
              partnerProductCode: product.partnerProductCode,
            }
          : {}),
        // Bằng chứng khách chọn — từ luồng tiền v2 CẢ HAI sản phẩm đều tuỳ chọn, nên cả hai cần nó.
        ...(input.consent
          ? { consentAt: input.consent.at, consentSource: input.consent.source }
          : {}),
      });
    };

    push(INSURANCE_PRODUCT_KIND.VEHICLE_TRIP, premiums.vehicleTrip);
    push(INSURANCE_PRODUCT_KIND.PERSONAL_ACCIDENT, premiums.personalAccident);
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
  //
  // Ba hàm dưới đây là LỚP VỎ của `@xeprime/prisma` (insurance-issue.ts) — đúng đoạn code worker
  // chạy mỗi phút (apps/worker/src/jobs/insurance-issue.ts). Giữ chúng ở đây để spec của API khoá
  // luật trên bản thật, và để một lệnh vận hành tương lai gọi được mà không phải dựng worker.

  /** CHIẾM một lô hợp đồng tới hạn — `updateMany` có điều kiện, không đọc-rồi-ghi. */
  claimDue(limit: number, now: Date = new Date()): Promise<string[]> {
    return claimDueInsurancePolicies(this.prisma, limit, now);
  }

  /** Ghi kết quả một lần gọi đối tác lên một hợp đồng đang `issuing`. */
  applyIssueResult(policyId: string, result: InsuranceIssueOutcome, now: Date = new Date()) {
    return applyInsuranceIssueResult(this.prisma, policyId, result, now);
  }

  /** Gọi đối tác cho MỘT hợp đồng đã chiếm — không chạy trong transaction nào. */
  async issueOne(policyId: string, now: Date = new Date()): Promise<'issued' | 'failed'> {
    const outcome = await issueInsurancePolicy(this.prisma, this.partner, policyId, now);
    return outcome === 'issued' ? 'issued' : 'failed';
  }

  // ── Admin ────────────────────────────────────────────────────────────────

  /**
   * Admin bấm THỬ LẠI — đặt mốc về `now`, worker nhặt ở vòng kế tiếp.
   *
   * Không tự gọi đối tác ngay tại request: một endpoint admin treo vì đối tác chậm là một tab
   * trình duyệt quay mãi và một người bấm lại năm lần.
   *
   * Nhận `failed` và `issuing` ĐÃ QUÁ HẠN THUÊ (`INSURANCE_ISSUING_LEASE_MINUTES` — worker chết giữa
   * chừng). Một `issuing` còn trong hạn là lượt đang chờ đối tác: đặt lại nó là mời gọi đôi.
   */
  async retry(policyId: string, actorUserId: string): Promise<void> {
    const now = new Date();
    const policy = await this.prisma.bookingInsurancePolicy.findUnique({
      where: { id: policyId },
      select: { id: true, tenantId: true, status: true, lastAttemptAt: true },
    });
    if (!policy) {
      throw new NotFoundException({
        code: API_ERROR_CODE.NOT_FOUND,
        message: 'Không tìm thấy hợp đồng bảo hiểm',
      });
    }
    const staleBefore = insuranceIssuingStaleBefore(now);
    const staleIssuing =
      policy.status === INSURANCE_POLICY_STATUS.ISSUING &&
      (policy.lastAttemptAt == null || policy.lastAttemptAt < staleBefore);
    if (policy.status !== INSURANCE_POLICY_STATUS.FAILED && !staleIssuing) {
      throw new ConflictException({
        code: API_ERROR_CODE.INVALID_STATUS_TRANSITION,
        message: 'Chỉ hợp đồng đang lỗi (hoặc kẹt ở bước phát hành) mới thử lại được',
        details: { status: policy.status },
      });
    }
    /*
     * Chưa cắm đối tác (`INSURANCE_PARTNER=none`) ⇒ lượt thử CHẮC CHẮN hỏng lại với đúng mã cũ.
     * Từ chối ngay, nói đúng lý do, thay vì xếp một việc vô ích cho worker rồi để người trực
     * tưởng nút thử lại bị hỏng. API và worker đọc cùng một file env (docker-compose.prod.yml).
     */
    if (!this.partner.configured) {
      throw new ConflictException({
        code: API_ERROR_CODE.INSURANCE_PARTNER_NOT_CONFIGURED,
        message: 'Chưa cắm đối tác bảo hiểm — thử phát hành lại sẽ không cấp được chứng nhận',
      });
    }

    await this.prisma.$transaction(async (tx) => {
      const { count } = await tx.bookingInsurancePolicy.updateMany({
        where: staleIssuing
          ? {
              id: policyId,
              status: INSURANCE_POLICY_STATUS.ISSUING,
              lastAttemptAt: policy.lastAttemptAt,
            }
          : { id: policyId, status: INSURANCE_POLICY_STATUS.FAILED },
        /*
         * Thử lại là một lượt MỚI: xoá mã lỗi cũ để hàng đợi không hiện lỗi của lượt trước như
         * thể nó vừa xảy ra. Số lần thử giữ nguyên — đó là lịch sử thật. Một `issuing` bỏ dở về
         * lại `failed` để worker chiếm nó bằng đúng đường thường.
         */
        data: {
          status: INSURANCE_POLICY_STATUS.FAILED,
          nextAttemptAt: now,
          lastErrorCode: null,
          lastErrorMessage: null,
        },
      });
      if (count === 0) {
        // Worker vừa nhặt (hoặc vừa ghi kết quả) xen giữa — không ghi đè lượt đang chạy.
        throw new ConflictException({
          code: API_ERROR_CODE.INVALID_STATUS_TRANSITION,
          message: 'Hợp đồng vừa đổi trạng thái — tải lại để xem kết quả mới nhất',
        });
      }
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


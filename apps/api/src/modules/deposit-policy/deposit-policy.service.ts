import { ForbiddenException, Injectable } from '@nestjs/common';
import { Prisma } from '@xeprime/prisma';
import {
  API_ERROR_CODE,
  AUDIT_ACTOR_SCOPE,
  BILLING_MODE,
  DEPOSIT_POLICY_REASON,
  PLAN_FEATURE,
  PLAN_FEATURE_LABEL,
  type BillingMode,
  type DepositPolicyReason,
} from '@xeprime/types';
import { planFeatureFlags } from '../../common/plan/feature-state';
import { PrismaService } from '../../prisma/prisma.service';
import { AuditService } from '../audit/audit.service';
import { BillingService } from '../billing/billing.service';

/**
 * Chuyến này có thu cọc `D` qua XePrime không — và VÌ SAO.
 *
 * Bốn cờ đi kèm `required` không phải để trang trí: giao diện phải nói được câu khác nhau cho
 * "gian hàng chọn không thu" và "gói chưa có năng lực này", còn `commitDecision` cần phân biệt
 * `direct` (có cọc, gian hàng tự thu) với `none` (không có cọc ở đâu cả) khi đóng băng
 * `bookings.deposit_collection_mode`.
 */
export interface DepositPolicyResolution {
  /** Chế độ thu phí hiện hành — trả kèm để caller không phải hỏi `BillingService` lần thứ hai. */
  billingMode: BillingMode;
  /** XePrime có thu cọc của chuyến này không. */
  required: boolean;
  /** Gói hiện hành có mở QUYỀN bật công tắc không. Tuyến hoa hồng luôn `true` (không qua gói). */
  planAllows: boolean;
  /** Công tắc của gian hàng. Tuyến hoa hồng luôn `true` và KHOÁ. */
  toggleEnabled: boolean;
  /** Công tắc có sửa được không — `false` ở tuyến hoa hồng và khi gói thiếu cờ. */
  editable: boolean;
  reason: DepositPolicyReason;
}

/**
 * HAI TRỤC, kiểm NỐI TIẾP — ADR 0027 điều 2.
 *
 *   1. Tuyến thu phí (`BillingService.billingModeFor`) — hoa hồng thì cọc BẮT BUỘC, hết chuyện.
 *   2. Với tuyến gói: năng lực GÓI (`escrow_hold`) rồi mới tới công tắc của GIAN HÀNG.
 *
 * ⚠️ Đọc tuyến từ **gói hiện hành**, KHÔNG từ `tenants.tenant_type` (ADR 0024 · CLAUDE.md cấm).
 * Cột đó là nhãn lịch sử; một gian hàng đổi gói mà cột không đổi sẽ làm khách của họ bị thu hoặc
 * không bị thu một khoản tiền thật.
 *
 * Writer DUY NHẤT của `tenant_payment_settings`.
 */
@Injectable()
export class DepositPolicyService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly billing: BillingService,
    private readonly audit: AuditService,
  ) {}

  /**
   * Quyết định cho MỘT gian hàng tại thời điểm `now`.
   *
   * Gọi ở đường duyệt yêu cầu (cả duyệt tay lẫn tự nhận) và ở báo giá — nên nó chỉ ĐỌC, không
   * bao giờ tạo dòng `tenant_payment_settings`. Vắng dòng = tắt, và đó là câu trả lời đủ.
   */
  async resolveForTenant(
    tenantId: string,
    now: Date = new Date(),
    tx?: Prisma.TransactionClient,
  ): Promise<DepositPolicyResolution> {
    const billingMode = await this.billing.billingModeFor(tenantId, now, tx);

    /*
     * Tuyến hoa hồng: dừng ở đây. Không đọc gói, không đọc công tắc — hai thứ đó không có tiếng
     * nói nào (ADR 0032 điều 2). Đọc rồi bỏ qua kết quả chỉ tạo ấn tượng là chúng có ảnh hưởng.
     */
    if (billingMode === BILLING_MODE.COMMISSION) {
      return {
        billingMode,
        required: true,
        planAllows: true,
        toggleEnabled: true,
        editable: false,
        reason: DEPOSIT_POLICY_REASON.COMMISSION_MANDATORY,
      };
    }

    const [planAllows, toggleEnabled] = await Promise.all([
      this.planAllowsEscrow(tenantId, now, tx),
      this.toggleEnabledFor(tenantId, tx),
    ]);

    if (!planAllows) {
      /*
       * Gói mất cờ (hết hạn, hạ bậc) trong khi công tắc vẫn đang bật: KHÔNG thu nữa. Thu tiền
       * khách bằng một năng lực gian hàng không còn trả tiền để có là cách nhanh nhất để một
       * khoản giữ hộ không có ai chịu trách nhiệm. Giá trị công tắc giữ nguyên để gia hạn xong
       * là chạy lại ngay, không bắt bấm lại (ADR 0027 điều 5).
       */
      return {
        billingMode,
        required: false,
        planAllows: false,
        toggleEnabled,
        editable: false,
        reason: DEPOSIT_POLICY_REASON.PACKAGE_FEATURE_MISSING,
      };
    }

    return {
      billingMode,
      required: toggleEnabled,
      planAllows: true,
      toggleEnabled,
      editable: true,
      reason: toggleEnabled
        ? DEPOSIT_POLICY_REASON.PACKAGE_ENABLED
        : DEPOSIT_POLICY_REASON.PACKAGE_DISABLED,
    };
  }

  /**
   * Bật/tắt công tắc — `tenant_id` từ membership, KHÔNG bao giờ từ body.
   *
   * Hai lớp chặn ở SERVER, cả hai ném 403 và cả hai là chặn THẬT:
   *
   *  - Tuyến hoa hồng → `DEPOSIT_ALWAYS_REQUIRED`.
   *  - Tuyến gói thiếu `escrow_hold` → `FEATURE_NOT_IN_PLAN`.
   *
   * Lớp thứ hai KHÔNG dựa vào `PlanFeatureGuard`: guard đó chạy ở chế độ `warn` mặc định
   * (`PLAN_FEATURE_ENFORCEMENT`) nên nó mới chỉ ghi log chứ chưa chặn ai. Một cấu hình quyết
   * định việc nhận tiền của khách không được phép nằm sau một công tắc thi hành đang tắt —
   * decorator trên controller là để tài liệu và menu nói đúng, câu lệnh ở đây mới là cái chặn.
   */
  async updateSettings(
    tenantId: string,
    actorUserId: string,
    depositCollectionEnabled: boolean,
  ): Promise<DepositPolicyResolution> {
    const now = new Date();
    const billingMode = await this.billing.billingModeFor(tenantId, now);

    if (billingMode === BILLING_MODE.COMMISSION) {
      throw new ForbiddenException({
        code: API_ERROR_CODE.DEPOSIT_ALWAYS_REQUIRED,
        message: 'Gian hàng tuyến hoa hồng luôn thu cọc qua XePrime — không tắt được',
        details: { billingMode },
      });
    }
    if (!(await this.planAllowsEscrow(tenantId, now))) {
      throw new ForbiddenException({
        code: API_ERROR_CODE.FEATURE_NOT_IN_PLAN,
        message: `"${PLAN_FEATURE_LABEL[PLAN_FEATURE.ESCROW_HOLD]}" thuộc gói dịch vụ mà gian hàng chưa có`,
        details: { feature: PLAN_FEATURE.ESCROW_HOLD },
      });
    }

    const before = await this.toggleEnabledFor(tenantId);
    await this.prisma.$transaction(async (tx) => {
      await tx.tenantPaymentSettings.upsert({
        where: { tenantId },
        create: { tenantId, depositCollectionEnabled, updatedBy: actorUserId },
        update: { depositCollectionEnabled, updatedBy: actorUserId },
      });
      /*
       * Audit kể cả khi giá trị không đổi: "ai đó vào màn này và bấm lưu" là một sự kiện có
       * nghĩa khi sau đó có tranh chấp về việc khách có phải chuyển tiền hay không.
       */
      await this.audit.record(
        {
          tenantId,
          actorUserId,
          actorScope: AUDIT_ACTOR_SCOPE.TENANT,
          action: 'tenant_payment_settings.update',
          targetType: 'tenant_payment_settings',
          targetId: tenantId,
          before: { depositCollectionEnabled: before },
          after: { depositCollectionEnabled },
        },
        tx,
      );
    });

    return this.resolveForTenant(tenantId, now);
  }

  // ── Nội bộ ────────────────────────────────────────────────────────────────

  /**
   * Gói hiện hành có cờ `escrow_hold` không.
   *
   * Cố ý KHÔNG dùng ba trạng thái của `featureStatesFrom`: `read_only` (từng dùng, nay hết hạn)
   * cho phép ĐỌC sổ sách cũ, nhưng thu thêm một khoản tiền mới của khách là GHI — và ghi thì
   * `read_only` không mở. Ở đây chỉ có cờ-hay-không-cờ.
   */
  private async planAllowsEscrow(
    tenantId: string,
    now: Date,
    tx?: Prisma.TransactionClient,
  ): Promise<boolean> {
    const limits = await this.billing.currentPlanLimitsFor(tenantId, now, tx);
    return planFeatureFlags(limits).has(PLAN_FEATURE.ESCROW_HOLD);
  }

  private async toggleEnabledFor(
    tenantId: string,
    tx?: Prisma.TransactionClient,
  ): Promise<boolean> {
    const client = tx ?? this.prisma;
    const row = await client.tenantPaymentSettings.findUnique({
      where: { tenantId },
      select: { depositCollectionEnabled: true },
    });
    return row?.depositCollectionEnabled ?? false;
  }
}

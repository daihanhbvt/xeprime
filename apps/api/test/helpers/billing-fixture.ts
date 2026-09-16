import { newId, type PrismaClient } from '@xeprime/prisma';
import {
  BILLING_MODE,
  COMMISSION_TRACK_TERM_MONTHS,
  OWNER_LITE_FEATURES,
  PLAN_STATUS,
  SUBSCRIPTION_STATUS,
  addCalendarMonthsVn,
  type BillingMode,
} from '@xeprime/types';

/**
 * Gán một dòng thuê bao cho tenant của fixture — BẮT BUỘC với mọi spec chạm đường duyệt yêu cầu.
 *
 * Vì sao nó phải tồn tại: trên production, **không tenant nào không có gói**. `registerShop` gọi
 * `assignDefaultPlanWithinTx` trong cùng transaction mở gian hàng, và migration
 * `20260830120000_backfill_default_plan` đã vá toàn bộ dữ liệu cũ. Fixture tạo tenant bằng
 * `prisma.tenant.create` trần thì bỏ qua đường đó, nên nó dựng ra một trạng thái mà sản phẩm
 * không cho phép tồn tại.
 *
 * Trước 15/09/2026 điều đó vô hại vì `billingModeFor` lặng lẽ đoán `package` (0đ/chuyến). Nay
 * đường ghi tiền từ chối đoán (`TENANT_BILLING_NOT_CONFIGURED`), nên fixture phải nói thật.
 *
 * Idempotent theo `planCode`: nhiều spec chạy song song trên cùng một database dùng chung một
 * bậc gói, và `plans.code` là unique.
 */
export async function giveTenantPlan(
  prisma: PrismaClient,
  tenantId: string,
  options: {
    /**
     * BẮT BUỘC, cố ý không có mặc định.
     *
     * Tuyến quyết định đường duyệt đi nhánh nào: hoa hồng sinh `booking_holds` và yêu cầu dừng ở
     * `awaiting_hold`; tuyến gói tạo đơn ngay. Một mặc định ngầm ở đây làm cả một spec đổi nhánh
     * mà không dòng nào trong spec nói ra điều đó.
     */
    billingMode: BillingMode;
    /** Cờ năng lực của bậc gói. Mặc định theo tuyến: hoa hồng rỗng, gói đầy đủ. */
    features?: readonly string[];
    /** Đặt ở quá khứ để dựng mốc hết hạn / ân hạn. Mặc định: còn hạn 12 tháng. */
    endsAt?: Date;
    graceDays?: number;
  },
): Promise<{ planId: string; subscriptionId: string }> {
  const billingMode = options.billingMode;
  const features = options.features ?? (billingMode === BILLING_MODE.COMMISSION ? OWNER_LITE_FEATURES : []);
  const graceDays = options.graceDays ?? 7;
  const planCode = `fixture-${billingMode}-${graceDays}-${[...features].sort().join('.') || 'none'}`;

  const plan = await prisma.plan.upsert({
    where: { code: planCode },
    update: {},
    create: {
      id: newId(),
      code: planCode,
      name: `Fixture ${billingMode}`,
      status: PLAN_STATUS.ACTIVE,
      billingMode,
      // CHECK ở DB: bậc hoa hồng BẮT BUỘC có `commission_percent` trong [1, 20].
      commissionPercent: billingMode === BILLING_MODE.COMMISSION ? 10 : null,
      basePriceMonthly: 0,
      durationDays: 30,
      /*
       * 900, KHÔNG để mặc định 0.
       *
       * `loadDefaultCommissionPlanOrThrow` (và job vòng đời) chọn bậc `commission` có
       * `sort_order` NHỎ NHẤT. Bậc `free` của seed nằm ở 0, nên một plan fixture cũng ở 0 khiến
       * Postgres trả hàng nào là tuỳ — và mọi spec đi qua `registerShop` thành chập chờn theo
       * thứ tự chạy, không theo code.
       */
      sortOrder: 900,
      limitsJson: { features: [...features], graceDays },
    },
    select: { id: true },
  });

  const now = new Date();
  const subscription = await prisma.tenantSubscription.create({
    data: {
      id: newId(),
      tenantId,
      planId: plan.id,
      status: SUBSCRIPTION_STATUS.ACTIVE,
      price: 0,
      termMonths: COMMISSION_TRACK_TERM_MONTHS,
      billingMode,
      commissionPercent: billingMode === BILLING_MODE.COMMISSION ? 10 : null,
      startsAt: new Date(now.getTime() - 60_000),
      endsAt: options.endsAt ?? addCalendarMonthsVn(now, COMMISSION_TRACK_TERM_MONTHS),
    },
    select: { id: true },
  });

  return { planId: plan.id, subscriptionId: subscription.id };
}

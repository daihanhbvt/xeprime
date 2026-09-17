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

/** Postgres báo vi phạm unique bằng mã này — Prisma giữ nguyên trong `code`. */
const UNIQUE_VIOLATION = 'P2002';

/**
 * `plan.upsert` chịu được HAI suite chạy song song cùng dựng một bậc gói.
 *
 * ## Vì sao `upsert` không tự lo được
 *
 * `plans.code` là unique nhưng KHÔNG phải khoá chính, nên Prisma không compile được thành một
 * `INSERT ... ON CONFLICT` duy nhất — nó SELECT rồi mới INSERT. Hai worker của Jest cùng chạy
 * qua khe hở giữa hai câu đó thì một bên INSERT thắng, bên kia lĩnh `P2002`:
 *
 *     Invalid `prisma.plan.upsert()` invocation
 *     Unique constraint failed on the fields: (`code`)
 *
 * Đó không phải lỗi giả: nó đã làm `booking-handovers.spec.ts` đỏ ở CI trong khi bản thân spec
 * đó chẳng liên quan gì tới gói. Và nó CHẬP CHỜN — số suite dùng fixture càng tăng thì xác suất
 * càng cao, nên "chạy lại là xanh" là cách chắc chắn để nó quay lại vào một ngày tệ hơn.
 *
 * ## Vì sao không đặt mã gói RIÊNG cho từng suite
 *
 * Dùng chung là chủ đích (xem docblock `giveTenantPlan`): mã riêng cho mỗi suite sẽ rải hàng
 * chục bậc gói rác vào database dùng chung, và `loadDefaultCommissionPlanOrThrow` chọn bậc
 * `commission` có `sort_order` nhỏ nhất — càng nhiều bậc thì càng dễ có ngày chọn nhầm.
 *
 * Nên cách đúng là CHẤP NHẬN cuộc đua và đọc lại kết quả của bên thắng — cùng khuôn với
 * `ChatService.getOrCreateFor`, nơi bất biến thật nằm ở constraint DB chứ không ở câu `findFirst`
 * mở đầu.
 */
async function upsertSharedPlan(
  prisma: PrismaClient,
  args: Parameters<PrismaClient['plan']['upsert']>[0],
): Promise<{ id: string }> {
  try {
    return (await prisma.plan.upsert(args)) as { id: string };
  } catch (error) {
    const isUniqueViolation =
      typeof error === 'object' &&
      error !== null &&
      (error as { code?: string }).code === UNIQUE_VIOLATION;
    if (!isUniqueViolation) throw error;

    // Bên kia vừa INSERT xong — hàng đã có, đọc lại là đủ.
    return prisma.plan.findUniqueOrThrow({
      where: args.where,
      select: { id: true },
    });
  }
}

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

  const plan = await upsertSharedPlan(prisma, {
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
      /*
       * 900, KHÔNG để mặc định 0.
       *
       * `loadDefaultCommissionPlanOrThrow` (và job vòng đời) chọn bậc `commission` có
       * `sort_order` NHỎ NHẤT. Bậc `free` của seed nằm ở 0, nên một plan fixture cũng ở 0 khiến
       * Postgres trả hàng nào là tuỳ — và mọi spec đi qua `registerShop` thành chập chờn theo
       * thứ tự chạy, không theo code.
       */
      sortOrder: 900,
      /*
       * Không trần nào và không bảng giá: fixture này dựng một tenant ĐÃ có tuyến thu phí, không
       * dựng một SKU để bán. Spec nào cần trần thật (chạm hạn mức xe/chi nhánh) thì khai
       * `limits_json` của riêng nó — nhét một con số mặc định ở đây sẽ làm hàng chục spec không
       * liên quan bắt đầu đỏ ở chiếc xe thứ N.
       */
      limitsJson: { features: [...features], graceDays, maxVehicles: null, termPrices: [] },
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

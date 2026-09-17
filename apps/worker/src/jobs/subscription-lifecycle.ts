import { newId, Prisma, type PrismaClient } from '@xeprime/prisma';
import {
  BANK_MATCH_TARGET_TYPE,
  BILLING_MODE,
  FREE_TRIP_ALLOWANCE,
  COMMISSION_TRACK_TERM_MONTHS,
  NOTIFICATION_TYPE,
  PLAN_STATUS,
  SUBSCRIPTION_INVOICE_STATUS,
  SUBSCRIPTION_RENEWAL_REMINDER_DAYS,
  SUBSCRIPTION_STATUS,
  addCalendarMonthsVn,
  parsePlanLimits,
  type PlanInvoiceSnapshot,
} from '@xeprime/types';
import { notifyTenantMembers, recordSystemAudit } from '../lib/notify';
import { newReferenceCode } from '../lib/reference-code';

/** Trần bản ghi mỗi lượt — job chạy mỗi giờ, tồn dư sẽ được lượt sau dọn nốt. */
const BATCH = 100;

const MS_PER_DAY = 86_400_000;

/** Hạn chuyển khoản của hoá đơn CHÀO gói (ADR 0026 điều 4) — dài hơn hoá đơn tự mua (72h):
 *  tin nhắc nằm trong chuông vài ngày, mã chết sớm hơn tin là một lời mời hỏng. */
const FREE_TRIP_OFFER_TTL_DAYS = 7;

/** Kết quả một lượt — để log và để khẳng định "chạy lại ra 0 dòng". */
export interface SubscriptionLifecycleResult {
  renewalReminders: number;
  expiryNotices: number;
  lapsed: number;
  invoicesVoided: number;
  freeTripOffers: number;
}

/**
 * Vòng đời gói (ADR 0015 điều 10 · ADR 0020 điều 5 · ADR 0026 điều 4) — năm việc của ĐỒNG HỒ:
 *
 *  1. nhắc gia hạn trước {@link SUBSCRIPTION_RENEWAL_REMINDER_DAYS} ngày;
 *  2. báo "đã hết hạn, đang trong ân hạn" đúng ngày hết hạn;
 *  3. hết `ends_at + graceDays` ⇒ CHUYỂN TENANT VỀ TUYẾN HOA HỒNG — gán dòng thuê bao
 *     commission 0đ từ gói mặc định. ⚠️ KHÔNG ẩn xe khỏi chợ: ADR 0020 điều 5 đã SỬA
 *     ADR 0015 điều 6 — xe ở lại, chỉ chế độ thu phí đổi. (`public_listings` đợt này chưa có
 *     cột nào phụ thuộc chế độ thu phí — denormalize là việc W5; khi cột đó có, bước này phải
 *     đồng bộ QUA ListingsService chứ không tự ghi — ADR 0008.)
 *  4. lật `void` hoá đơn `issued` quá hạn chuyển khoản;
 *  5. tenant tiêu hết lượt miễn phí ⇒ sinh sẵn hoá đơn gói + nhắc (ADR 0026 điều 4).
 *     TUYỆT ĐỐI không kích hoạt gói chưa trả tiền — hoá đơn là lời chào, không phải quyền dùng.
 *
 * Mỗi hành động một-lần claim bằng chính câu `UPDATE … WHERE <cột claim> IS NULL`
 * (cùng khuôn `booking-request-deadlines`) ⇒ chạy lại hoặc chạy song song ra 0 dòng.
 */
export async function sweepSubscriptionLifecycle(
  prisma: PrismaClient,
  now: Date = new Date(),
): Promise<SubscriptionLifecycleResult> {
  return {
    renewalReminders: await remindRenewal(prisma, now),
    expiryNotices: await notifyExpiry(prisma, now),
    lapsed: await lapseToCommission(prisma, now),
    invoicesVoided: await voidExpiredInvoices(prisma, now),
    freeTripOffers: await offerPlanOnFreeTripsExhausted(prisma, now),
  };
}

/** Chỉ nhắc gói TUYẾN GÓI — thuê bao hoa hồng 0đ hết hạn không có gì để "gia hạn". */
async function remindRenewal(prisma: PrismaClient, now: Date): Promise<number> {
  const dueBefore = new Date(now.getTime() + SUBSCRIPTION_RENEWAL_REMINDER_DAYS * MS_PER_DAY);
  const candidates = await prisma.tenantSubscription.findMany({
    where: {
      status: SUBSCRIPTION_STATUS.ACTIVE,
      billingMode: BILLING_MODE.PACKAGE,
      renewalRemindedAt: null,
      endsAt: { gt: now, lte: dueBefore },
    },
    orderBy: { endsAt: 'asc' },
    take: BATCH,
    select: { id: true, tenantId: true, endsAt: true, plan: { select: { name: true } } },
  });

  let sent = 0;
  for (const sub of candidates) {
    const claimed = await prisma.tenantSubscription.updateMany({
      where: { id: sub.id, status: SUBSCRIPTION_STATUS.ACTIVE, renewalRemindedAt: null },
      data: { renewalRemindedAt: now },
    });
    if (claimed.count === 0) continue;

    await notifyTenantMembers(prisma, sub.tenantId, {
      type: NOTIFICATION_TYPE.SUBSCRIPTION_EXPIRING,
      title: `Gói ${sub.plan.name} sắp hết hạn`,
      body: `Hết hạn ${sub.endsAt.toLocaleDateString('vi-VN')} — gia hạn ở màn "Gói của tôi" để giữ 0đ trên chuyến.`,
      tenantId: sub.tenantId,
    });
    sent += 1;
  }
  return sent;
}

/** Đúng hạn: báo còn ân hạn bao nhiêu ngày trước khi chuyển sang tính hoa hồng. */
async function notifyExpiry(prisma: PrismaClient, now: Date): Promise<number> {
  const candidates = await prisma.tenantSubscription.findMany({
    where: {
      status: SUBSCRIPTION_STATUS.ACTIVE,
      billingMode: BILLING_MODE.PACKAGE,
      expiryNotifiedAt: null,
      endsAt: { lte: now },
    },
    orderBy: { endsAt: 'asc' },
    take: BATCH,
    select: {
      id: true,
      tenantId: true,
      endsAt: true,
      plan: { select: { name: true, limitsJson: true } },
    },
  });

  let sent = 0;
  for (const sub of candidates) {
    const claimed = await prisma.tenantSubscription.updateMany({
      where: { id: sub.id, status: SUBSCRIPTION_STATUS.ACTIVE, expiryNotifiedAt: null },
      data: { expiryNotifiedAt: now },
    });
    if (claimed.count === 0) continue;

    const graceDays = parsePlanLimits(sub.plan.limitsJson).graceDays;
    await notifyTenantMembers(prisma, sub.tenantId, {
      type: NOTIFICATION_TYPE.SUBSCRIPTION_EXPIRED,
      title: `Gói ${sub.plan.name} đã hết hạn`,
      body:
        graceDays > 0
          ? `Còn ${graceDays} ngày ân hạn — gia hạn ngay để không chuyển sang tính hoa hồng theo chuyến. Xe vẫn ở trên chợ.`
          : 'Gia hạn ngay để không chuyển sang tính hoa hồng theo chuyến. Xe vẫn ở trên chợ.',
      tenantId: sub.tenantId,
    });
    sent += 1;
  }
  return sent;
}

/**
 * Hết ân hạn ⇒ rơi về tuyến hoa hồng (ADR 0020 điều 5): gán dòng thuê bao commission 0đ từ gói
 * mặc định (gói `billing_mode = commission` có `sort_order` nhỏ nhất). Đơn đang chạy không đổi
 * (ADR 0024 điều 6) — chỉ đơn TẠO SAU chịu hoa hồng.
 */
async function lapseToCommission(prisma: PrismaClient, now: Date): Promise<number> {
  const candidates = await prisma.tenantSubscription.findMany({
    where: {
      status: SUBSCRIPTION_STATUS.ACTIVE,
      lapseHandledAt: null,
      endsAt: { lte: now },
    },
    orderBy: { endsAt: 'asc' },
    take: BATCH,
    select: {
      id: true,
      tenantId: true,
      endsAt: true,
      billingMode: true,
      plan: { select: { name: true, limitsJson: true } },
    },
  });
  if (candidates.length === 0) return 0;

  const fallbackPlan = await prisma.plan.findFirst({
    where: { status: PLAN_STATUS.ACTIVE, billingMode: BILLING_MODE.COMMISSION },
    orderBy: { sortOrder: 'asc' },
    select: { id: true, code: true, commissionPercent: true },
  });
  if (!fallbackPlan) {
    // Không claim gì cả — thiếu gói hoa hồng mặc định là lỗi CẤU HÌNH, phải sửa dữ liệu chứ
    // không phải để job im lặng đánh dấu "đã xử lý" rồi bỏ tenant lơ lửng không gói.
    console.error(
      'vòng đời gói: KHÔNG có gói tuyến hoa hồng nào đang bán — không chuyển tuyến được. Tạo/mở lại gói commission ở màn quản trị.',
    );
    return 0;
  }

  let handled = 0;
  for (const sub of candidates) {
    /*
     * ÂN HẠN CHỈ ÁP CHO DÒNG GÓI (15/09/2026).
     *
     * Ân hạn là ưu đãi dành cho người ĐÃ TRẢ TIỀN — "gói hết hạn rồi nhưng chưa mất gì trong N
     * ngày". Áp nó cho dòng thuê bao hoa hồng 0đ do chính hệ thống tự gán thì không giữ lại
     * được gì (không có năng lực nào để mất, không có gì để gia hạn) nhưng vẫn để lại hậu quả
     * thật: suốt cửa sổ đó tenant KHÔNG có dòng thuê bao nào còn hạn.
     *
     * Với `COMMISSION_TRACK_TERM_MONTHS = 12`, seed `graceDays = 7`, và migration backfill gán
     * gói mặc định cho toàn bộ tenant trong CÙNG MỘT NGÀY, đó là 7 ngày mỗi năm mà mọi chủ xe
     * trên sàn cùng lúc không thu phí dịch vụ và không thu cọc.
     *
     * `resolveEffectiveBilling` đã bịt lỗ này ở tầng ĐỌC (pha `grace` giữ nguyên tuyến của dòng
     * vừa hết hạn). Điều kiện dưới đây bịt nó ở tầng DỮ LIỆU, để trạng thái "không có dòng thuê
     * bao hiệu lực" biến mất khỏi hệ thống thay vì chỉ được diễn giải đúng ở một nơi.
     */
    const graceDays = parsePlanLimits(sub.plan.limitsJson).graceDays;
    const graceEndsAt = new Date(sub.endsAt.getTime() + graceDays * MS_PER_DAY);
    const isPackage = sub.billingMode === BILLING_MODE.PACKAGE;
    if (isPackage && now < graceEndsAt) continue; // còn trong ân hạn — lượt sau tính tiếp

    /*
     * Mốc dòng mới bắt đầu — nối LIỀN, không bắt đầu từ `now`.
     *
     * Dòng gói rơi xuống thì tuyến hoa hồng có hiệu lực từ lúc HẾT ÂN HẠN: trong ân hạn tenant
     * vẫn là tuyến gói, và một dòng commission `starts_at` lùi về `ends_at` sẽ nói dối về bảy
     * ngày đã qua. Dòng hoa hồng tự nối lại thì nối thẳng từ `ends_at` — giữa hai kỳ của cùng
     * một tuyến không có khoảng nào cả.
     *
     * Cả hai nhánh đều KHÔNG dùng `now`: job chạy mỗi giờ và có thể dừng vài tiếng khi deploy,
     * và `now` để lại một khe hở đúng bằng độ trễ đó.
     */
    const chainFrom = isPackage ? graceEndsAt : sub.endsAt;

    const done = await prisma.$transaction(async (tx) => {
      const claimed = await tx.tenantSubscription.updateMany({
        where: { id: sub.id, status: SUBSCRIPTION_STATUS.ACTIVE, lapseHandledAt: null },
        data: { lapseHandledAt: now },
      });
      if (claimed.count === 0) return false;

      // Đã gia hạn / được gán gói khác trong lúc chờ ân hạn → không chuyển tuyến nữa.
      const hasCurrent = await tx.tenantSubscription.findFirst({
        where: {
          tenantId: sub.tenantId,
          status: SUBSCRIPTION_STATUS.ACTIVE,
          startsAt: { lte: now },
          endsAt: { gt: now },
        },
        select: { id: true },
      });
      if (hasCurrent) return true;

      const commissionSub = await tx.tenantSubscription.create({
        data: {
          id: newId(),
          tenantId: sub.tenantId,
          planId: fallbackPlan.id,
          status: SUBSCRIPTION_STATUS.ACTIVE,
          price: 0,
          termMonths: COMMISSION_TRACK_TERM_MONTHS,
          billingMode: BILLING_MODE.COMMISSION,
          commissionPercent: fallbackPlan.commissionPercent,
          /*
           * Nối LIỀN vào dòng vừa hết hạn, không bắt đầu từ `now`.
           *
           * `startsAt = sub.endsAt` khiến dòng mới phủ kín khoảng job chạy trễ (job chạy mỗi
           * giờ, và có thể dừng vài tiếng khi deploy). Bắt đầu từ `now` để lại một khe hở đúng
           * bằng độ trễ đó, và trong khe hở ấy tenant không có dòng thuê bao nào còn hạn — lại
           * đúng trạng thái mà cả thay đổi này lẫn `resolveEffectiveBilling` sinh ra để xoá bỏ.
           *
           * `startsAt` ở quá khứ hoàn toàn hợp lệ với vị từ `startsAt <= now`, và `endsAt` vẫn
           * đếm đủ 12 tháng lịch kể từ mốc đó (ADR 0011: cộng THÁNG LỊCH, không nhân 30 ngày).
           */
          startsAt: chainFrom,
          endsAt: addCalendarMonthsVn(chainFrom, COMMISSION_TRACK_TERM_MONTHS),
          note: 'Tự chuyển về tuyến hoa hồng khi gói hết hạn + ân hạn (job vòng đời — ADR 0020 điều 5).',
        },
        select: { id: true },
      });

      await recordSystemAudit(tx, {
        tenantId: sub.tenantId,
        action: 'subscription.lapse_to_commission',
        targetType: 'tenant_subscription',
        targetId: commissionSub.id,
        before: { lapsedSubscriptionId: sub.id, billingMode: sub.billingMode },
        after: {
          planCode: fallbackPlan.code,
          billingMode: BILLING_MODE.COMMISSION,
          commissionPercent: fallbackPlan.commissionPercent?.toString() ?? null,
          graceDays,
        },
      });

      // Chỉ báo khi thật sự ĐỔI chế độ (gói package rơi xuống). Thuê bao hoa hồng 0đ tự nối
      // lại là việc sổ sách — báo tin cho nó là dạy người dùng bỏ qua chuông.
      if (sub.billingMode === BILLING_MODE.PACKAGE) {
        await notifyTenantMembers(tx, sub.tenantId, {
          type: NOTIFICATION_TYPE.SUBSCRIPTION_LAPSED,
          title: `Gói ${sub.plan.name} đã hết hạn — chuyển sang tính hoa hồng`,
          body: `Xe của bạn VẪN Ở TRÊN CHỢ. Từ nay mỗi chuyến mới chịu hoa hồng ${fallbackPlan.commissionPercent?.toString() ?? ''}%; mua lại gói để về 0đ trên chuyến.`,
          tenantId: sub.tenantId,
        });
      }
      return true;
    });
    if (done) handled += 1;
  }
  return handled;
}

/** Hoá đơn `issued` quá hạn chuyển khoản → `void` — mã đối soát chết theo (ADR 0015 điều 5). */
async function voidExpiredInvoices(prisma: PrismaClient, now: Date): Promise<number> {
  const voided = await prisma.subscriptionInvoice.updateMany({
    where: { status: SUBSCRIPTION_INVOICE_STATUS.ISSUED, expiresAt: { lte: now } },
    data: { status: SUBSCRIPTION_INVOICE_STATUS.VOID },
  });
  return voided.count;
}

/**
 * Tiêu hết lượt miễn phí (ADR 0026 điều 4): sinh SẴN hoá đơn gói mặc định + nhắc — và ghi audit
 * để sau này dò cụm lách ưu đãi (ADR 0026 §chống lách). KHÔNG kích hoạt gì: gói chỉ bật khi
 * tiền về.
 *
 * Hoá đơn chào dựng theo **đội xe hiện có** và **kỳ hạn nhỏ nhất plan còn bán** (ADR 0029 §Hệ
 * quả). Bản đầu nhân phí nền × 1 tháng, và với gói giá phẳng (`base_price_monthly = 0`) thì đó
 * là một hoá đơn 0đ — một lời chào không mua nổi.
 *
 * Đây là người ghi `subscription_invoices` THỨ HAI ngoài BillingService — cùng tiền lệ
 * `lib/notify.ts`: hình dạng hàng khoá bằng `@xeprime/types` + kiểu Prisma, unique mã do DB gác.
 */
async function offerPlanOnFreeTripsExhausted(prisma: PrismaClient, now: Date): Promise<number> {
  const candidates = await prisma.tenant.findMany({
    where: {
      deletedAt: null,
      freeTripsOfferedAt: null,
      freeTripsUsed: { gte: FREE_TRIP_ALLOWANCE },
    },
    take: BATCH,
    select: { id: true, freeTripsUsed: true },
  });
  if (candidates.length === 0) return 0;

  /*
   * Bậc để CHÀO: bậc `package` đang bán, sort_order nhỏ nhất, VÀ có bảng giá.
   *
   * Điều kiện cuối là bậc `salesOnly` (ADR 0041 điều 5): nó bán bằng tư vấn nên không có giá để
   * dựng hoá đơn, và nếu nó tình cờ đứng đầu `sort_order` thì mọi lời chào sẽ rơi về "chỉ nhắc".
   * Lọc ở Postgres thay vì đọc hết rồi lọc trong JS — `jsonb_array_length` không có ở Prisma
   * query API, nên dùng chính vị từ `termPrices` khác mảng rỗng.
   */
  const offerPlan = await prisma.plan.findFirst({
    where: {
      status: PLAN_STATUS.ACTIVE,
      billingMode: BILLING_MODE.PACKAGE,
      NOT: { limitsJson: { path: ['termPrices'], equals: [] } },
    },
    orderBy: { sortOrder: 'asc' },
    select: { id: true, code: true, name: true, limitsJson: true },
  });

  let offered = 0;
  for (const tenant of candidates) {
    const done = await prisma.$transaction(async (tx) => {
      const claimed = await tx.tenant.updateMany({
        where: { id: tenant.id, freeTripsOfferedAt: null },
        data: { freeTripsOfferedAt: now },
      });
      if (claimed.count === 0) return false;

      // Chống lách (ADR 0026): mốc "tiêu hết lượt" luôn để lại vết, kể cả khi không chào gói.
      await recordSystemAudit(tx, {
        tenantId: tenant.id,
        action: 'tenant.free_trips_exhausted',
        targetType: 'tenant',
        targetId: tenant.id,
        after: { freeTripsUsed: tenant.freeTripsUsed, allowance: FREE_TRIP_ALLOWANCE },
      });

      // Đang có gói hiện hành tuyến gói → không cần chào; thiếu gói package đang bán → chỉ nhắc.
      const current = await tx.tenantSubscription.findFirst({
        where: {
          tenantId: tenant.id,
          status: SUBSCRIPTION_STATUS.ACTIVE,
          billingMode: BILLING_MODE.PACKAGE,
          startsAt: { lte: now },
          endsAt: { gt: now },
        },
        select: { id: true },
      });
      if (current) return true;

      /*
       * Đã có hoá đơn gói đang chờ tiền ⇒ CHỈ NHẮC, không chào thêm một hoá đơn nữa (16/09/2026).
       *
       * Bất biến của `subscription_invoices`: mỗi tenant tối đa MỘT hoá đơn trả được
       * (`issued`/`partially_paid`) — `BillingService.purchase` giữ nó ở đường người dùng, và từ
       * migration `…_subscription_invoice_single_payable` chính DB giữ nó. Job này là writer THỨ
       * HAI của bảng đó, nên nếu chào bừa một hoá đơn nữa thì hoặc sinh hai mã XPG cùng kích hoạt
       * được gói (trước khi có index), hoặc chết cả transaction vì đụng unique (sau khi có).
       *
       * Vì sao NHẮC chứ không void hoá đơn cũ: hoá đơn đang chờ là thứ gian hàng có thể đang
       * chuyển khoản ngay lúc này, và nó có thể đã nhận một phần tiền. Lời nhắc chung vẫn dẫn họ
       * về màn gói — nơi hoá đơn đó đang nằm sẵn với QR của nó.
       */
      const pendingInvoice = await tx.subscriptionInvoice.findFirst({
        where: {
          tenantId: tenant.id,
          status: {
            in: [SUBSCRIPTION_INVOICE_STATUS.ISSUED, SUBSCRIPTION_INVOICE_STATUS.PARTIALLY_PAID],
          },
        },
        select: { id: true },
      });

      let body =
        'Từ đơn tiếp theo, mỗi chuyến chịu hoa hồng của nền tảng. Mua gói theo chỗ ở màn "Gói của tôi" để về 0đ trên chuyến.';

      if (offerPlan && !pendingInvoice) {
        /*
         * ADR 0041 — bậc gói bán theo TRẦN SỐ XE và KỲ HẠN, giá là con số niêm yết của kỳ hạn.
         *
         * Lời chào dựng ở kỳ hạn NHỎ NHẤT mà bậc còn bán: mời một chủ xe vừa hết lượt miễn phí
         * trả trước 12 tháng là mời họ bỏ đi. Bậc `salesOnly` (bán bằng tư vấn) không có bảng giá
         * nên không chào được — `offerPlan` đã lọc nó ra bằng chính điều kiện "có termPrices".
         *
         * Bản trước (mô hình chỗ xe) đếm đội xe rồi nhân đơn giá; ở mô hình bậc thì đội xe không
         * vào giá, nó chỉ quyết bậc NÀO phù hợp — và việc chọn bậc là của người dùng, không phải
         * của một job. Job chào bậc rẻ nhất; họ đổi bậc ở màn "Gói của tôi".
         */
        const limits = parsePlanLimits(offerPlan.limitsJson);
        const cheapest = limits.termPrices[0];

        // Không có bảng giá = không có gì để chào, chỉ nhắc. Một hoá đơn 0đ là rác trong sổ và
        // webhook không có gì để khớp.
        if (cheapest && Number(cheapest.price) > 0) {
          const termMonths = cheapest.months;
          const total = new Prisma.Decimal(cheapest.price).toDecimalPlaces(2);
          const snapshot: PlanInvoiceSnapshot = {
            planId: offerPlan.id,
            planCode: offerPlan.code,
            termMonths,
            quota: {
              maxVehicles: limits.maxVehicles,
              maxBranches: limits.maxBranches,
              maxMembers: limits.maxMembers,
            },
            lines: [
              {
                kind: 'package',
                quantity: 1,
                months: termMonths,
                unitPrice: total.toString(),
                amount: total.toString(),
              },
            ],
          };
          const invoice = await tx.subscriptionInvoice.create({
            data: {
              id: newId(),
              tenantId: tenant.id,
              subscriptionId: null,
              code: newReferenceCode(BANK_MATCH_TARGET_TYPE.SUBSCRIPTION_INVOICE),
              periodFrom: now,
              periodTo: addCalendarMonthsVn(now, termMonths),
              linesJson: snapshot as unknown as Prisma.InputJsonValue,
              subtotal: total,
              // Giá niêm yết của kỳ hạn LÀ tổng phải trả — không có khoản giảm nào trên một giá
              // gốc (ADR 0041 điều 2).
              discountAmount: 0,
              totalAmount: total,
              paidAmount: 0,
              status: SUBSCRIPTION_INVOICE_STATUS.ISSUED,
              expiresAt: new Date(now.getTime() + FREE_TRIP_OFFER_TTL_DAYS * MS_PER_DAY),
            },
            select: { code: true, totalAmount: true },
          });
          body = `Từ đơn tiếp theo, mỗi chuyến chịu phí dịch vụ của nền tảng. Đã tạo sẵn hoá đơn gói ${offerPlan.name} (${invoice.totalAmount.toString()}đ/${termMonths} tháng) — chuyển khoản với nội dung ${invoice.code} để kích hoạt, hoặc chọn gói khác ở màn "Gói của tôi".`;
        }
      }

      await notifyTenantMembers(tx, tenant.id, {
        type: NOTIFICATION_TYPE.FREE_TRIPS_EXHAUSTED,
        title: 'Đã dùng hết 2 lượt miễn phí',
        body,
        tenantId: tenant.id,
      });
      return true;
    });
    if (done) offered += 1;
  }
  return offered;
}

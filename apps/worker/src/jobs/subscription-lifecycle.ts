import {
  enqueuePlanGuideForSubscription,
  newId,
  Prisma,
  type PrismaClient,
} from '@xeprime/prisma';
import {
  subscriptionChainLockKey,
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
  PLAN_GUIDE_REASON,
  PLAN_VEHICLE_SCOPE,
  VEHICLE_TYPE,
  graceEndsAtFor,
  planVehicleScopeOf,
  smallestSelfServePlanFor,
  type PlanInvoiceSnapshot,
  type PlanVehicleScope,
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
  /** Email hướng dẫn gói mốc "đang ân hạn" vừa xếp hàng (chỉ khi `isPlanPromotionEnabled` bật). */
  graceGuides: number;
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
    graceGuides: await remindDuringGrace(prisma, now),
  };
}

/**
 * Gom các dòng ứng viên theo TENANT, giữ thứ tự `ends_at`.
 *
 * Từ ADR 0065 một gian hàng có thể mang hai kỳ gói (ô tô + xe máy) hết hạn CÙNG lúc — điển hình là
 * cặp dòng do migration ánh xạ từ một bậc cũ. Báo từng dòng là hai tin "gói … sắp hết hạn" liền nhau
 * cho cùng một quyết định gia hạn; gom lại là một tin nói đủ cả hai loại xe.
 */
function groupByTenant<T extends { tenantId: string }>(rows: readonly T[]): T[][] {
  const groups = new Map<string, T[]>();
  for (const row of rows) {
    const list = groups.get(row.tenantId) ?? [];
    list.push(row);
    groups.set(row.tenantId, list);
  }
  return [...groups.values()];
}

/** "Gói Ô tô · 5 xe và Xe máy · 1 xe" — tên các gói trong MỘT tin. */
function planNamesOf(rows: readonly { plan: { name: string } }[]): string {
  return [...new Set(rows.map((row) => row.plan.name))].join(' và ');
}

/** "ô tô và xe máy" — loại xe mà các kỳ này gác (tin vòng đời lưu tiếng Việt như mọi tin hệ thống). */
function scopeLabelsOf(rows: readonly { vehicleScope: string }[]): string {
  return [...new Set(rows.map((row) => vehicleScopeLabel(planVehicleScopeOf(row.vehicleScope))))].join(
    ' và ',
  );
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
    select: {
      id: true,
      tenantId: true,
      endsAt: true,
      vehicleScope: true,
      plan: { select: { name: true } },
    },
  });

  let sent = 0;
  for (const group of groupByTenant(candidates)) {
    const claimed: typeof group = [];
    for (const sub of group) {
      const res = await prisma.tenantSubscription.updateMany({
        where: { id: sub.id, status: SUBSCRIPTION_STATUS.ACTIVE, renewalRemindedAt: null },
        data: { renewalRemindedAt: now },
      });
      if (res.count > 0) claimed.push(sub);
    }
    const first = claimed[0];
    if (!first) continue;

    await notifyTenantMembers(prisma, first.tenantId, {
      type: NOTIFICATION_TYPE.SUBSCRIPTION_EXPIRING,
      title: `Gói ${planNamesOf(claimed)} sắp hết hạn`,
      body: `Hết hạn ${first.endsAt.toLocaleDateString('vi-VN')} — gia hạn gói ${scopeLabelsOf(claimed)} ở màn "Gói của tôi" để giữ 0đ trên chuyến.`,
      tenantId: first.tenantId,
    });
    // MỘT thư hướng dẫn cho cả nhóm — dedupe của outbox theo thuê bao, nên neo vào dòng đầu.
    await enqueuePlanGuideForSubscription(prisma, {
      tenantId: first.tenantId,
      subscriptionId: first.id,
      endsAt: first.endsAt,
      reason: PLAN_GUIDE_REASON.EXPIRING,
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
      vehicleScope: true,
      plan: { select: { name: true, limitsJson: true } },
    },
  });

  let sent = 0;
  for (const group of groupByTenant(candidates)) {
    const claimed: typeof group = [];
    for (const sub of group) {
      const res = await prisma.tenantSubscription.updateMany({
        where: { id: sub.id, status: SUBSCRIPTION_STATUS.ACTIVE, expiryNotifiedAt: null },
        data: { expiryNotifiedAt: now },
      });
      if (res.count > 0) claimed.push(sub);
    }
    const first = claimed[0];
    if (!first) continue;

    const graceDays = Math.min(...claimed.map((sub) => parsePlanLimits(sub.plan.limitsJson).graceDays));
    const typeLabel = scopeLabelsOf(claimed);
    /*
     * Gói của MỘT loại xe hết hạn trong khi gói loại kia còn chạy (ADR 0065): gian hàng KHÔNG
     * chuyển sang hoa hồng — thứ mất đi khi hết ân hạn là đăng thêm và đưa thêm xe loại đó lên chợ.
     * Nói "sẽ tính hoa hồng" lúc đó là doạ một hậu quả không xảy ra.
     */
    const keepsPackageTrack = await otherPackageTermRunning(
      prisma,
      first.tenantId,
      claimed.map((sub) => sub.id),
      now,
    );
    const body = keepsPackageTrack
      ? graceDays > 0
        ? `Còn ${graceDays} ngày ân hạn — gia hạn để tiếp tục đăng và đưa ${typeLabel} lên chợ. Xe đang bán vẫn ở trên chợ.`
        : `Gia hạn để tiếp tục đăng và đưa ${typeLabel} lên chợ. Xe đang bán vẫn ở trên chợ.`
      : graceDays > 0
        ? `Còn ${graceDays} ngày ân hạn — gia hạn gói ${typeLabel} ngay để không chuyển sang tính hoa hồng theo chuyến. Xe vẫn ở trên chợ.`
        : `Gia hạn gói ${typeLabel} ngay để không chuyển sang tính hoa hồng theo chuyến. Xe vẫn ở trên chợ.`;
    await notifyTenantMembers(prisma, first.tenantId, {
      type: NOTIFICATION_TYPE.SUBSCRIPTION_EXPIRED,
      title: `Gói ${planNamesOf(claimed)} đã hết hạn`,
      body,
      tenantId: first.tenantId,
    });
    await enqueuePlanGuideForSubscription(prisma, {
      tenantId: first.tenantId,
      subscriptionId: first.id,
      endsAt: first.endsAt,
      reason: PLAN_GUIDE_REASON.EXPIRED,
    });
    sent += 1;
  }
  return sent;
}

/**
 * Mốc "đang ân hạn" của email hướng dẫn gói: từ ngày THỨ HAI sau `ends_at` (mốc "đúng ngày hết
 * hạn" đã có thư riêng) tới trước khi ân hạn kết thúc. Một thuê bao một mốc: CLAIM
 * `grace_guide_notified_at` (updateMany WHERE NULL) rồi mới xếp hàng — như `renewalRemindedAt` /
 * `expiryNotifiedAt`, mốc được đánh dấu CẢ KHI `isPlanPromotionEnabled` đang tắt, nên bật cờ về sau
 * KHÔNG gửi bù thư cho mốc đã qua. `dedupe_key` UNIQUE của outbox là lớp gác thứ hai.
 *
 * Lọc trong SQL, không ở Node: cận dưới `ends_at > now − max(graceDays)` của các gói tuyến gói,
 * loại thuê bao đã qua mốc (`grace_guide_notified_at IS NOT NULL`), sắp tăng dần và đi theo trang keyset
 * `(ends_at, id)` — thuê bao không có email người nhận không chặn những trang sau.
 * `pageSize` chỉ để test ép nhiều trang.
 */
export async function remindDuringGrace(
  prisma: PrismaClient,
  now: Date,
  pageSize: number = BATCH,
): Promise<number> {
  // Mọi gói (không chỉ gói đang bán): thuê bao cũ có thể gắn gói đã ngừng.
  const plans = await prisma.plan.findMany({
    select: { limitsJson: true },
  });
  const maxGraceDays = plans.reduce(
    (max, p) => Math.max(max, parsePlanLimits(p.limitsJson).graceDays),
    0,
  );
  if (maxGraceDays <= 1) return 0;

  const upper = new Date(now.getTime() - MS_PER_DAY);
  const lower = new Date(now.getTime() - maxGraceDays * MS_PER_DAY);
  let queued = 0;
  let cursor: { endsAt: Date; id: string } | null = null;
  for (;;) {
    const afterCursor: Prisma.Sql = cursor
      ? Prisma.sql`AND (s.ends_at, s.id) > (${cursor.endsAt}, ${cursor.id})`
      : Prisma.empty;
    const page: { id: string; tenant_id: string; ends_at: Date; limits_json: unknown }[] =
      await prisma.$queryRaw`
      SELECT s.id, s.tenant_id, s.ends_at, p.limits_json
        FROM tenant_subscriptions s
        JOIN plans p ON p.id = s.plan_id
       WHERE s.status = ${SUBSCRIPTION_STATUS.ACTIVE}
         AND s.billing_mode = ${BILLING_MODE.PACKAGE}
         AND s.ends_at <= ${upper}
         AND s.ends_at > ${lower}
         AND s.grace_guide_notified_at IS NULL
         ${afterCursor}
       ORDER BY s.ends_at ASC, s.id ASC
       LIMIT ${pageSize}`;

    for (const sub of page) {
      const graceDays = parsePlanLimits(sub.limits_json).graceDays;
      const graceEndsAt = new Date(sub.ends_at.getTime() + graceDays * MS_PER_DAY);
      if (now >= graceEndsAt) continue; // hết ân hạn — `lapseToCommission` lo
      const claimed = await prisma.tenantSubscription.updateMany({
        where: { id: sub.id, graceGuideNotifiedAt: null },
        data: { graceGuideNotifiedAt: now },
      });
      if (claimed.count === 0) continue;
      const added = await enqueuePlanGuideForSubscription(prisma, {
        tenantId: sub.tenant_id,
        subscriptionId: sub.id,
        endsAt: sub.ends_at,
        reason: PLAN_GUIDE_REASON.GRACE,
      });
      if (added) queued += 1;
    }
    if (page.length < pageSize) break;
    const last = page[page.length - 1]!;
    cursor = { endsAt: last.ends_at, id: last.id };
  }
  return queued;
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
      /*
       * Cùng khoá chuỗi kỳ với mọi đường ghi thuê bao ở api (admin gán/huỷ, webhook kích hoạt):
       * không có nó, job này và một lượt admin gán chạy song song cùng thấy "chưa có gói hiện
       * hành", cùng ghi — và dòng hoa hồng 12 tháng (ends_at muộn hơn) thắng phép chấm tuyến,
       * đẩy một gian hàng vừa trả tiền về tuyến hoa hồng.
       */
      await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${subscriptionChainLockKey(sub.tenantId)}))`;
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

      /*
       * Gói của LOẠI XE KIA còn đang ân hạn (ADR 0065) ⇒ gian hàng vẫn ở tuyến gói: chưa hạ. Dòng
       * này đã claim xong, nên chính dòng còn lại — khi tới lượt nó hết ân hạn — mới là dòng gán
       * hoa hồng, nối liền từ mốc hết ân hạn MUỘN NHẤT. Chỉ hạ tuyến khi KHÔNG còn phạm vi nào
       * giữ được gói (`resolveEffectiveBilling` đọc đúng luật đó).
       */
      if (await otherPackageTermInGrace(tx, sub.tenantId, sub.id, now)) return true;

      /*
       * Hai phạm vi cùng qua ân hạn trong MỘT lượt (cặp dòng ánh xạ, hay job dừng vài ngày): dòng
       * hoa hồng phải nối từ mốc hết ân hạn MUỘN NHẤT của các kỳ gói chưa xử lý, đọc TRONG khoá —
       * nối từ mốc của dòng đang xét (sớm hơn) là ghi lùi tuyến hoa hồng vào những ngày gói kia
       * vẫn còn giữ tuyến.
       */
      const startFrom = await latestLapsedGraceEnd(tx, sub.tenantId, chainFrom, now);

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
          // Tuyến hoa hồng phủ mọi loại xe (CHECK `plans_commission_scope_all`).
          vehicleScope: PLAN_VEHICLE_SCOPE.ALL,
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
          startsAt: startFrom,
          endsAt: addCalendarMonthsVn(startFrom, COMMISSION_TRACK_TERM_MONTHS),
          // Không ghi chú chữ: dòng hệ thống nói bằng `origin` và giao diện tự dịch (ADR 0012).
          // Dấu vết "vì sao" nằm ở audit `subscription.lapse_to_commission` ngay dưới.
          note: null,
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
   * Bậc để CHÀO (ADR 0065): bậc `package` đang bán, TỰ MUA được (có bảng giá, không `salesOnly`),
   * theo phạm vi loại xe. Gian hàng mua gói theo từng loại xe, nên lời chào cũng theo từng loại
   * xe gian hàng ĐANG CÓ — bậc nhỏ nhất chứa được đội xe loại đó (`smallestSelfServePlanFor`).
   * Đội xe vượt mọi bậc tự phục vụ ⇒ không chào giá nào (bậc doanh nghiệp bán bằng tư vấn).
   */
  const offerPlans = (
    await prisma.plan.findMany({
      where: { status: PLAN_STATUS.ACTIVE, billingMode: BILLING_MODE.PACKAGE },
      orderBy: { sortOrder: 'asc' },
      select: { id: true, code: true, name: true, vehicleScope: true, limitsJson: true },
    })
  ).map((plan) => ({ ...plan, limits: parsePlanLimits(plan.limitsJson) }));

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
       * Bất biến của `subscription_invoices`: mỗi tenant tối đa MỘT hoá đơn trả được cho mỗi phạm
       * vi loại xe (`…_one_payable_per_tenant_scope`). Job này là writer THỨ HAI của bảng đó, nên
       * chào bừa một hoá đơn nữa là chết cả transaction vì đụng unique. Và vì sao NHẮC chứ không
       * void: hoá đơn đang chờ là thứ gian hàng có thể đang chuyển khoản ngay lúc này — kể cả
       * hoá đơn của phạm vi khác, đó là gian hàng đã tự chọn gói, không cần job chọn hộ.
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
        'Từ đơn tiếp theo, mỗi chuyến chịu hoa hồng của nền tảng. Mua gói theo loại xe ở màn "Gói của tôi" để về 0đ trên chuyến.';

      if (!pendingInvoice) {
        const fleet = await tx.vehicle.groupBy({
          by: ['vehicleType'],
          where: { tenantId: tenant.id, deletedAt: null },
          _count: { _all: true },
        });
        const offers: string[] = [];
        for (const [vehicleType, scope] of [
          [VEHICLE_TYPE.CAR, PLAN_VEHICLE_SCOPE.CAR],
          [VEHICLE_TYPE.MOTORBIKE, PLAN_VEHICLE_SCOPE.MOTORBIKE],
        ] as const) {
          const count = fleet.find((row) => row.vehicleType === vehicleType)?._count._all ?? 0;
          if (count === 0) continue;
          const plan = smallestSelfServePlanFor(offerPlans, scope, count);
          // Kỳ hạn NHỎ NHẤT bậc còn bán: mời một chủ xe vừa hết lượt miễn phí trả trước 12 tháng là
          // mời họ bỏ đi. Không có bảng giá = không có gì để chào; một hoá đơn 0đ là rác trong sổ.
          const cheapest = plan?.limits.termPrices[0];
          if (!plan || !cheapest || Number(cheapest.price) <= 0) continue;

          const termMonths = cheapest.months;
          const total = new Prisma.Decimal(cheapest.price).toDecimalPlaces(2);
          const vehicleScope = planVehicleScopeOf(plan.vehicleScope);
          const snapshot: PlanInvoiceSnapshot = {
            planId: plan.id,
            planCode: plan.code,
            termMonths,
            vehicleScope,
            quota: {
              maxVehicles: plan.limits.maxVehicles,
              maxBranches: plan.limits.maxBranches,
              maxMembers: plan.limits.maxMembers,
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
              vehicleScope,
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
          offers.push(
            `gói ${plan.name} (${invoice.totalAmount.toString()}đ/${termMonths} tháng) — nội dung chuyển khoản ${invoice.code}`,
          );
        }
        if (offers.length > 0) {
          body = `Từ đơn tiếp theo, mỗi chuyến chịu phí dịch vụ của nền tảng. Đã tạo sẵn hoá đơn ${offers.join('; ')}. Chuyển khoản đúng nội dung để kích hoạt, hoặc chọn gói khác ở màn "Gói của tôi".`;
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

/** Nhãn loại xe trong tin vòng đời gói (tin lưu tiếng Việt như mọi tin hệ thống của job này). */
function vehicleScopeLabel(scope: PlanVehicleScope): string {
  return scope === PLAN_VEHICLE_SCOPE.MOTORBIKE
    ? 'xe máy'
    : scope === PLAN_VEHICLE_SCOPE.CAR
      ? 'ô tô'
      : 'xe';
}

/** Tenant còn một kỳ GÓI khác đang chạy (phạm vi loại xe khác — ADR 0065) không. */
async function otherPackageTermRunning(
  client: PrismaClient | Prisma.TransactionClient,
  tenantId: string,
  exceptIds: readonly string[],
  now: Date,
): Promise<boolean> {
  const row = await client.tenantSubscription.findFirst({
    where: {
      tenantId,
      id: { notIn: [...exceptIds] },
      status: SUBSCRIPTION_STATUS.ACTIVE,
      billingMode: BILLING_MODE.PACKAGE,
      startsAt: { lte: now },
      endsAt: { gt: now },
    },
    select: { id: true },
  });
  return row !== null;
}

/**
 * Tenant còn một kỳ GÓI khác ĐANG ÂN HẠN không (ADR 0065: gói ô tô và gói xe máy hết hạn lệch
 * ngày nhau). Kỳ đang ân hạn chưa bao giờ được claim `lapse_handled_at` (vòng lặp chính bỏ qua
 * nó), nên chỉ cần soát các kỳ CHƯA xử lý — số dòng mỗi tenant là một-hai.
 */
async function otherPackageTermInGrace(
  tx: Prisma.TransactionClient,
  tenantId: string,
  exceptId: string,
  now: Date,
): Promise<boolean> {
  const rows = await tx.tenantSubscription.findMany({
    where: {
      tenantId,
      id: { not: exceptId },
      status: SUBSCRIPTION_STATUS.ACTIVE,
      billingMode: BILLING_MODE.PACKAGE,
      lapseHandledAt: null,
      endsAt: { lte: now },
    },
    select: { endsAt: true, plan: { select: { limitsJson: true } } },
  });
  return rows.some(
    (row) => graceEndsAtFor(row.endsAt, parsePlanLimits(row.plan.limitsJson).graceDays) > now,
  );
}

/**
 * Mốc hết ân hạn muộn nhất trong các kỳ GÓI đã hết hạn mà job chưa xử lý của tenant, không sớm hơn
 * `floor` (mốc của chính dòng đang xét). Chỉ xét kỳ đã QUA ân hạn — kỳ còn ân hạn đã khiến lượt
 * này dừng ở `otherPackageTermInGrace`.
 */
async function latestLapsedGraceEnd(
  tx: Prisma.TransactionClient,
  tenantId: string,
  floor: Date,
  now: Date,
): Promise<Date> {
  const rows = await tx.tenantSubscription.findMany({
    where: {
      tenantId,
      status: SUBSCRIPTION_STATUS.ACTIVE,
      billingMode: BILLING_MODE.PACKAGE,
      lapseHandledAt: null,
      endsAt: { lte: now },
    },
    select: { endsAt: true, plan: { select: { limitsJson: true } } },
  });
  return rows.reduce<Date>((latest, row) => {
    const graceEnd = graceEndsAtFor(row.endsAt, parsePlanLimits(row.plan.limitsJson).graceDays);
    return graceEnd <= now && graceEnd > latest ? graceEnd : latest;
  }, floor);
}

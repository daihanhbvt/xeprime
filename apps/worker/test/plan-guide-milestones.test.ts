import { after, before, test } from 'node:test';
import assert from 'node:assert/strict';
import { createPrismaClient, newId } from '@xeprime/prisma';
import {
  ACCOUNT_REALM,
  APP_CONFIG_KEY,
  BILLING_MODE,
  PLAN_GUIDE_REASON,
  PLAN_GUIDE_REASON_VARIANT,
  PLAN_GUIDE_VARIANT,
  PLAN_STATUS,
  SUBSCRIPTION_STATUS,
  TENANT_STATUS,
  planGuideDedupeKey,
  type PlanGuideReason,
} from '@xeprime/types';

import { remindDuringGrace, sweepSubscriptionLifecycle } from '../src/jobs/subscription-lifecycle';

/**
 * Email "Hướng dẫn đăng ký và gia hạn gói" ở các mốc vòng đời gói (docs/app-config.md):
 *  - `isPlanPromotionEnabled` TẮT ⇒ không mốc nào xếp thư, và bật lại sau mốc không gửi bù;
 *  - BẬT ⇒ ≤7 ngày / đúng hạn / đang ân hạn, MỖI mốc MỘT thư cho một thuê bao — quét lại bao
 *    nhiêu lần cũng vậy (UNIQUE `email_outbox.dedupe_key`, không phải check ở app).
 *
 * ⚠️ Công tắc là một dòng toàn hệ thống — giữ giá trị đầu, trả lại ở `after`.
 */
const prisma = createPrismaClient();
const DAY = 86_400_000;
const RUN = newId().slice(-8).toLowerCase();
const START = new Date();

let dbAvailable = false;
let initialFlag = false;
let ownerId: string;
let noEmailOwnerId: string;
let planId: string;
const tenantIds: string[] = [];

async function setFlag(on: boolean): Promise<void> {
  await prisma.platformAppConfig.upsert({
    where: { key: APP_CONFIG_KEY.PARTNER },
    create: { key: APP_CONFIG_KEY.PARTNER, isPlanPromotionEnabled: on },
    update: { isPlanPromotionEnabled: on },
  });
}

async function mkPackageSub(label: string, endsAt: Date, owner?: string): Promise<string> {
  const tenantId = newId();
  await prisma.tenant.create({
    data: {
      id: tenantId,
      code: `PG-${tenantId.slice(-8)}`,
      slug: `pg-${tenantId.toLowerCase().slice(-10)}`,
      name: `PlanGuide-${label}-${RUN}`,
      status: TENANT_STATUS.ACTIVE,
      ownerUserId: owner ?? ownerId,
    },
  });
  tenantIds.push(tenantId);
  const id = newId();
  await prisma.tenantSubscription.create({
    data: {
      id,
      tenantId,
      planId,
      status: SUBSCRIPTION_STATUS.ACTIVE,
      price: 100000,
      termMonths: 1,
      billingMode: BILLING_MODE.PACKAGE,
      startsAt: new Date(endsAt.getTime() - 30 * DAY),
      endsAt,
    },
  });
  return id;
}

const count = (reason: PlanGuideReason, subscriptionId: string) =>
  prisma.emailOutbox.count({ where: { dedupeKey: planGuideDedupeKey(reason, { subscriptionId }) } });

before(async () => {
  try {
    await prisma.$connect();
    await prisma.$queryRaw`SELECT 1`;
    dbAvailable = true;
  } catch {
    console.warn('\n[skip] Không kết nối được PostgreSQL. Chạy `pnpm db:up` trước.\n');
    return;
  }
  initialFlag =
    (await prisma.platformAppConfig.findUnique({ where: { key: APP_CONFIG_KEY.PARTNER } }))?.isPlanPromotionEnabled ??
    false;
  ownerId = newId();
  noEmailOwnerId = newId();
  planId = newId();
  await prisma.user.create({
    data: { id: noEmailOwnerId, realm: ACCOUNT_REALM.PARTNER, displayName: 'Không email' },
  });
  await prisma.user.create({
    data: {
      id: ownerId,
      realm: ACCOUNT_REALM.PARTNER,
      displayName: 'Chủ gói',
      email: `pg-${RUN}@xeprime.test`,
    },
  });
  await prisma.plan.create({
    data: {
      id: planId,
      code: `pg-package-${RUN}`,
      name: 'Gói thử',
      status: PLAN_STATUS.ACTIVE,
      billingMode: BILLING_MODE.PACKAGE,
      basePriceMonthly: 0,
      limitsJson: {
        features: [],
        graceDays: 7,
        maxVehicles: 3,
        maxBranches: 1,
        termPrices: [{ months: 1, price: '100000' }],
      },
    },
  });
});

after(async () => {
  if (dbAvailable) {
    await setFlag(initialFlag);
    await prisma.emailOutbox.deleteMany({
      where: { OR: [{ toEmail: `pg-${RUN}@xeprime.test` }, { createdAt: { gte: START }, toEmail: { endsWith: '.test' } }] },
    });
    await prisma.notification.deleteMany({ where: { tenantId: { in: tenantIds } } });
    await prisma.auditLog.deleteMany({ where: { tenantId: { in: tenantIds } } });
    await prisma.subscriptionInvoice.deleteMany({ where: { tenantId: { in: tenantIds } } });
    await prisma.tenantSubscription.deleteMany({ where: { tenantId: { in: tenantIds } } });
    await prisma.tenant.deleteMany({ where: { id: { in: tenantIds } } });
    await prisma.plan.deleteMany({ where: { id: planId } });
    await prisma.user.deleteMany({ where: { id: { in: [ownerId, noEmailOwnerId] } } });
  }
  await prisma.$disconnect();
});

test('isPlanPromotionEnabled TẮT ⇒ không mốc nào xếp thư', async () => {
  if (!dbAvailable) return;
  await setFlag(false);
  const expiring = await mkPackageSub('off-expiring', new Date(Date.now() + 3 * DAY));
  const grace = await mkPackageSub('off-grace', new Date(Date.now() - 2 * DAY));

  await sweepSubscriptionLifecycle(prisma, new Date());

  assert.equal(await count(PLAN_GUIDE_REASON.EXPIRING, expiring), 0);
  assert.equal(await count(PLAN_GUIDE_REASON.EXPIRED, grace), 0);
  assert.equal(await count(PLAN_GUIDE_REASON.GRACE, grace), 0);

  // Bật cờ SAU mốc: không gửi bù — cả ba mốc đã được đánh dấu lúc cờ tắt.
  const sub = await prisma.tenantSubscription.findUniqueOrThrow({ where: { id: grace } });
  assert.notEqual(sub.graceGuideNotifiedAt, null);
  await setFlag(true);
  await sweepSubscriptionLifecycle(prisma, new Date());
  assert.equal(await count(PLAN_GUIDE_REASON.EXPIRING, expiring), 0);
  assert.equal(await count(PLAN_GUIDE_REASON.EXPIRED, grace), 0);
  assert.equal(await count(PLAN_GUIDE_REASON.GRACE, grace), 0);
});

test('isPlanPromotionEnabled BẬT ⇒ ≤7 ngày / đúng hạn / ân hạn: mỗi mốc ĐÚNG MỘT thư, quét lại không thêm', async () => {
  if (!dbAvailable) return;
  await setFlag(true);
  const expiring = await mkPackageSub('on-expiring', new Date(Date.now() + 3 * DAY));
  const justExpired = await mkPackageSub('on-expired', new Date(Date.now() - 2 * 3_600_000));
  const inGrace = await mkPackageSub('on-grace', new Date(Date.now() - 2 * DAY));
  const farAway = await mkPackageSub('on-far', new Date(Date.now() + 30 * DAY));

  for (let i = 0; i < 3; i++) await sweepSubscriptionLifecycle(prisma, new Date());

  assert.equal(await count(PLAN_GUIDE_REASON.EXPIRING, expiring), 1);
  assert.equal(await count(PLAN_GUIDE_REASON.EXPIRED, justExpired), 1);
  // Mới hết 2 giờ: chưa tới mốc "ân hạn" (từ ngày thứ hai).
  assert.equal(await count(PLAN_GUIDE_REASON.GRACE, justExpired), 0);
  assert.equal(await count(PLAN_GUIDE_REASON.EXPIRED, inGrace), 1);
  assert.equal(await count(PLAN_GUIDE_REASON.GRACE, inGrace), 1);
  assert.equal(await count(PLAN_GUIDE_REASON.EXPIRING, farAway), 0);

  const row = await prisma.emailOutbox.findFirstOrThrow({
    where: { dedupeKey: planGuideDedupeKey(PLAN_GUIDE_REASON.GRACE, { subscriptionId: inGrace }) },
  });
  assert.equal(row.toEmail, `pg-${RUN}@xeprime.test`);
  assert.equal((row.payloadJson as { shopName?: string }).shopName, `PlanGuide-on-grace-${RUN}`);

  // Thư của mỗi mốc mang ĐÚNG lý do, và lý do đó chọn đúng nội dung trong bộ mẫu đang dùng.
  const expected: [string, PlanGuideReason, string][] = [
    [expiring, PLAN_GUIDE_REASON.EXPIRING, PLAN_GUIDE_VARIANT.EXPIRING],
    [justExpired, PLAN_GUIDE_REASON.EXPIRED, PLAN_GUIDE_VARIANT.EXPIRED],
    [inGrace, PLAN_GUIDE_REASON.GRACE, PLAN_GUIDE_VARIANT.GRACE],
  ];
  for (const [subscriptionId, reason, variant] of expected) {
    const r = await prisma.emailOutbox.findFirstOrThrow({
      where: { dedupeKey: planGuideDedupeKey(reason, { subscriptionId }) },
    });
    const payloadReason = (r.payloadJson as { reason: PlanGuideReason }).reason;
    assert.equal(payloadReason, reason);
    assert.equal(PLAN_GUIDE_REASON_VARIANT[payloadReason], variant);
    // Hợp đồng ảnh chụp (docs/app-config.md): payload chỉ chở NGUỒN của ngày (thuê bao + ends_at);
    // % phí chuyến, số ngày nhắc/ân hạn đọc lúc DỰNG thư ở API — không đóng băng vào hàng đợi.
    const payload = r.payloadJson as Record<string, unknown>;
    assert.equal(payload['subscriptionId'], subscriptionId);
    assert.equal(typeof payload['endsAt'], 'string');
    for (const key of ['commissionPercent', 'packageCommissionPercent', 'graceDays', 'reminderDays']) {
      assert.equal(key in payload, false, key);
    }
  }
});

test('ân hạn: lọc trong SQL + phân trang keyset — thuê bao không email không chặn trang sau', async () => {
  if (!dbAvailable) return;
  await setFlag(true);
  const now = new Date();
  // Các thuê bao không email đứng ĐẦU (ends_at sớm nhất) — trang đầu toàn "không gửi được".
  for (let i = 0; i < 3; i++) {
    await mkPackageSub(`nomail-${i}`, new Date(now.getTime() - 5 * DAY - i * 60_000), noEmailOwnerId);
  }
  const subs: string[] = [];
  for (let i = 0; i < 5; i++) {
    subs.push(await mkPackageSub(`page-${i}`, new Date(now.getTime() - 3 * DAY - i * 60_000)));
  }
  // Ngoài cửa sổ (quá max graceDays = 7): không bao giờ được chọn.
  const lapsedOut = await mkPackageSub('too-old', new Date(now.getTime() - 9 * DAY));

  await remindDuringGrace(prisma, now, 2);
  for (const id of subs) assert.equal(await count(PLAN_GUIDE_REASON.GRACE, id), 1);
  assert.equal(await count(PLAN_GUIDE_REASON.GRACE, lapsedOut), 0);
  // Quét lại: `grace_guide_notified_at IS NULL` loại sạch các thuê bao đã qua mốc.
  assert.equal(await remindDuringGrace(prisma, now, 2), 0);
});

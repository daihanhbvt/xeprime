import {
  type CanActivate,
  type ExecutionContext,
  type INestApplication,
  Injectable,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { APP_GUARD, Reflector } from '@nestjs/core';
import { Test } from '@nestjs/testing';
import { createPrismaClient, newId } from '@xeprime/prisma';
import {
  ACCOUNT_REALM,
  API_ERROR_CODE,
  APP_CONFIG_AUDIT_ACTION,
  APP_CONFIG_KEY,
  EMAIL_OUTBOX_KIND,
  EMAIL_OUTBOX_MAX_ATTEMPTS,
  EMAIL_OUTBOX_STATUS,
  FEE_POLICY_STATUS,
  MEMBERSHIP_STATUS,
  PLAN_GUIDE_REASON,
  PLAN_GUIDE_REASON_VARIANT,
  PLAN_GUIDE_VARIANT,
  PLAN_GUIDE_VARIANT_VALUES,
  BILLING_MODE,
  PLATFORM_ROLE,
  REGISTRATION_TRACK,
  SUBSCRIPTION_RENEWAL_REMINDER_DAYS,
  SUPPORT_CASE_CATEGORY,
  planGuideDedupeKey,
  vnDateKey,
  type AccountRealm,
} from '@xeprime/types';
import request from 'supertest';

import { createValidationPipe } from '../src/bootstrap';
import { AllExceptionsFilter } from '../src/common/filters/all-exceptions.filter';
import { PermissionGuard } from '../src/common/guards/permission.guard';
import { PlatformScopeGuard } from '../src/common/guards/platform-scope.guard';
import { RealmGuard } from '../src/common/guards/realm.guard';
import { SupportRequestStore } from '../src/common/support/support-request.store';
import type { RequestContext } from '../src/common/types/request-context';
import { AppConfigController } from '../src/modules/app-config/app-config.controller';
import { AppConfigService } from '../src/modules/app-config/app-config.service';
import { BillingService } from '../src/modules/billing/billing.service';
import { FeePoliciesService } from '../src/modules/fee-policies/fee-policies.service';
import { PlanGuideTemplatesService } from '../src/modules/app-config/plan-guide-templates.service';
import { EmailOutboxDispatcher } from '../src/modules/app-config/email-outbox.dispatcher';
import type { EmailService } from '../src/modules/email/email.service';
import { PlatformAppConfigController } from '../src/modules/app-config/platform-app-config.controller';
import { PlatformPlanGuideTemplatesController } from '../src/modules/app-config/platform-plan-guide-templates.controller';
import { AuditService } from '../src/modules/audit/audit.service';
import { renderPlanGuideTemplate } from '../src/modules/email/plan-guide-email';
import { NotificationService } from '../src/modules/notification/notification.service';
import { RbacService } from '../src/modules/rbac/rbac.service';
import { SupportService } from '../src/modules/support/support.service';
import type { PrismaService } from '../src/prisma/prisma.service';
import { PrismaService as PrismaServiceToken } from '../src/prisma/prisma.service';
import { makeBillingService, makeTenantsService } from './helpers/service-factory';

/**
 * Cấu hình app `isPlanPromotionEnabled` + email hướng dẫn gói + mẫu do admin quản lý
 * (docs/app-config.md), trên PostgreSQL THẬT.
 *
 * ⚠️ Công tắc `platform_app_configs.partner` là MỘT dòng toàn hệ thống: bộ này ghi lại giá trị đầu
 * và trả lại ở `afterAll`. Các bước bật/tắt nằm trong cùng một file nên tuần tự với nhau.
 */

const prisma = createPrismaClient();
const asService = prisma as unknown as PrismaService;

@Injectable()
class HeaderAuthGuard implements CanActivate {
  async canActivate(ctx: ExecutionContext): Promise<boolean> {
    const req = ctx.switchToHttp().getRequest<RequestContext>();
    const userId = req.headers['x-test-user'];
    if (typeof userId === 'string') {
      const { realm } = await prisma.user.findUniqueOrThrow({
        where: { id: userId },
        select: { realm: true },
      });
      req.realm = realm as AccountRealm;
      req.user = {
        id: userId,
        realm: realm as AccountRealm,
        transport: req.headers['x-test-transport'] === 'cookie' ? 'cookie' : 'bearer',
        displayName: 'test',
        email: null,
        phoneVerified: true,
        sessionId: 'S-app-config',
      };
    }
    return true;
  }
}

const silentNotifications = new Proxy(
  {},
  { get: (_target, prop) => (prop === 'then' ? undefined : async () => undefined) },
);

const RUN = newId().slice(-8).toLowerCase();
const ids = {
  admin: newId(),
  staff: newId(),
  partner: newId(),
  customer: newId(),
  packageOwner: newId(),
};
const emailOf = (k: string) => `appcfg-${k}-${RUN}@xeprime.test`;
const createdTemplateIds: string[] = [];
const createdCaseIds: string[] = [];

let dbAvailable = false;
let app: INestApplication;
let appConfig: AppConfigService;
let support: SupportService;
let initialFlag = false;
let initialActiveTemplateId: string | null = null;

const as = (userId: string) => ({ 'x-test-user': userId });
const server = () => app.getHttpServer();

async function setFlag(on: boolean): Promise<void> {
  await prisma.platformAppConfig.upsert({
    where: { key: APP_CONFIG_KEY.PARTNER },
    create: { key: APP_CONFIG_KEY.PARTNER, isPlanPromotionEnabled: on },
    update: { isPlanPromotionEnabled: on },
  });
}

beforeAll(async () => {
  try {
    await prisma.$connect();
    await prisma.$queryRaw`SELECT 1`;
    dbAvailable = true;
  } catch {
    if (process.env.REQUIRE_DB === '1') throw new Error('Cần PostgreSQL ở TEST_DATABASE_URL');
    console.warn('\n[skip] Không kết nối được PostgreSQL.\n');
    return;
  }

  const current = await prisma.platformAppConfig.findUnique({
    where: { key: APP_CONFIG_KEY.PARTNER },
    select: { isPlanPromotionEnabled: true },
  });
  initialFlag = current?.isPlanPromotionEnabled ?? false;
  initialActiveTemplateId =
    (
      await prisma.planGuideEmailTemplate.findFirst({
        where: { isActive: true },
        select: { id: true },
      })
    )?.id ?? null;

  const realms: Record<keyof typeof ids, AccountRealm> = {
    admin: ACCOUNT_REALM.PLATFORM,
    staff: ACCOUNT_REALM.PLATFORM,
    partner: ACCOUNT_REALM.PARTNER,
    customer: ACCOUNT_REALM.CUSTOMER,
    packageOwner: ACCOUNT_REALM.PARTNER,
  };
  for (const [key, id] of Object.entries(ids) as [keyof typeof ids, string][]) {
    await prisma.user.create({
      data: { id, realm: realms[key], displayName: `AppCfg ${key}`, email: emailOf(key) },
    });
  }
  await prisma.platformMembership.createMany({
    data: [
      {
        id: newId(),
        userId: ids.admin,
        roleKey: PLATFORM_ROLE.PLATFORM_ADMIN,
        status: MEMBERSHIP_STATUS.ACTIVE,
      },
      {
        id: newId(),
        userId: ids.staff,
        roleKey: PLATFORM_ROLE.PLATFORM_STAFF,
        status: MEMBERSHIP_STATUS.ACTIVE,
      },
    ],
  });

  const store = new SupportRequestStore();
  const audit = new AuditService(asService, store);
  appConfig = new AppConfigService(asService, audit, new ConfigService());
  const config = new ConfigService({ WEB_PARTNER_URL: 'https://partner.xeprime.test' });
  const moduleRef = await Test.createTestingModule({
    controllers: [
      AppConfigController,
      PlatformAppConfigController,
      PlatformPlanGuideTemplatesController,
    ],
    providers: [
      Reflector,
      { provide: PrismaServiceToken, useValue: asService },
      { provide: AuditService, useValue: audit },
      { provide: ConfigService, useValue: config },
      { provide: RbacService, useValue: new RbacService(asService) },
      { provide: AppConfigService, useValue: appConfig },
      { provide: BillingService, useValue: makeBillingService(asService) },
      { provide: FeePoliciesService, useValue: new FeePoliciesService(asService, audit) },
      PlanGuideTemplatesService,
      { provide: APP_GUARD, useClass: HeaderAuthGuard },
      { provide: APP_GUARD, useClass: RealmGuard },
      { provide: APP_GUARD, useClass: PlatformScopeGuard },
      { provide: APP_GUARD, useClass: PermissionGuard },
    ],
  }).compile();
  app = moduleRef.createNestApplication();
  app.useGlobalPipes(createValidationPipe());
  app.useGlobalFilters(new AllExceptionsFilter(false));
  await app.init();
  support = new SupportService(
    asService,
    audit,
    silentNotifications as unknown as NotificationService,
    appConfig,
  );
}, 60_000);

afterAll(async () => {
  await app?.close();
  if (dbAvailable) {
    await setFlag(initialFlag);
    // Trả lại mẫu đang bật ban đầu (nếu bộ này đã đổi).
    if (initialActiveTemplateId) {
      await prisma.planGuideEmailTemplate.updateMany({
        where: { isActive: true },
        data: { isActive: false },
      });
      await prisma.planGuideEmailTemplate.update({
        where: { id: initialActiveTemplateId },
        data: { isActive: true },
      });
    }
    await prisma.planGuideEmailTemplate.deleteMany({ where: { id: { in: createdTemplateIds } } });
    const userIds = Object.values(ids);
    const tenantIds = (
      await prisma.tenant.findMany({
        where: { ownerUserId: ids.packageOwner },
        select: { id: true },
      })
    ).map((t) => t.id);
    await prisma.emailOutbox.deleteMany({
      where: {
        OR: [{ toEmail: { in: Object.keys(ids).map(emailOf) } }, { toEmail: { contains: RUN } }],
      },
    });
    await prisma.supportCase.deleteMany({ where: { id: { in: createdCaseIds } } });
    await prisma.auditLog.deleteMany({
      where: {
        OR: [
          { actorUserId: { in: userIds } },
          { targetId: { in: [...createdTemplateIds, ...createdCaseIds] } },
          ...(tenantIds.length ? [{ tenantId: { in: tenantIds } }] : []),
        ],
      },
    });
    if (tenantIds.length > 0) {
      const where = { tenantId: { in: tenantIds } };
      await prisma.tenantBranch.deleteMany({ where });
      await prisma.tenantProfile.deleteMany({ where });
      await prisma.tenantMembership.deleteMany({ where });
      await prisma.tenant.deleteMany({ where: { id: { in: tenantIds } } });
    }
    await prisma.platformAppConfig.updateMany({
      where: { updatedBy: { in: userIds } },
      data: { updatedBy: null },
    });
    await prisma.platformMembership.deleteMany({ where: { userId: { in: userIds } } });
    await prisma.user.deleteMany({ where: { id: { in: userIds } } });
  }
  await prisma.$disconnect();
});

const maybe = (name: string, fn: () => Promise<void>) =>
  it(name, async () => {
    if (!dbAvailable) return;
    await fn();
  });

// ── Bộ dựng mẫu: thuần, không cần DB ────────────────────────────────────────

/** Đủ bốn nội dung — tiêu đề/thân mang tên nội dung để kiểm "dựng đúng nội dung". */
function fullVariants() {
  return PLAN_GUIDE_VARIANT_VALUES.map((variant) => ({
    variant,
    subjectVi: `VI ${variant} {{recipientName}}`,
    subjectEn: `EN ${variant} {{recipientName}}`,
    bodyVi: `<p>body-${variant} {{reason}}</p>{{planTable}}`,
    bodyEn: `<p>body-${variant} {{reason}}</p>{{planTable}}`,
  }));
}

describe('PLAN_GUIDE_REASON_VARIANT', () => {
  it('mỗi lý do gửi map đúng một nội dung; đăng ký và tư vấn dùng chung "welcome"', () => {
    expect(PLAN_GUIDE_REASON_VARIANT).toEqual({
      [PLAN_GUIDE_REASON.REGISTERED]: PLAN_GUIDE_VARIANT.WELCOME,
      [PLAN_GUIDE_REASON.CONSULTATION]: PLAN_GUIDE_VARIANT.WELCOME,
      [PLAN_GUIDE_REASON.EXPIRING]: PLAN_GUIDE_VARIANT.EXPIRING,
      [PLAN_GUIDE_REASON.EXPIRED]: PLAN_GUIDE_VARIANT.EXPIRED,
      [PLAN_GUIDE_REASON.GRACE]: PLAN_GUIDE_VARIANT.GRACE,
    });
    // Không có nội dung "chết": mỗi nội dung có ít nhất một lý do dùng tới.
    expect(new Set(Object.values(PLAN_GUIDE_REASON_VARIANT))).toEqual(
      new Set(PLAN_GUIDE_VARIANT_VALUES),
    );
  });
});

describe('renderPlanGuideTemplate', () => {
  const base = {
    locale: 'vi' as const,
    reason: PLAN_GUIDE_REASON.EXPIRING,
    recipientName: '<img src=x onerror=alert(1)> "An"',
    shopName: 'Shop & Co',
    expiresAt: new Date('2026-10-19T10:00:00Z'),
    plans: [
      {
        name: 'Gói <b>cơ bản</b>',
        description: null,
        billingMode: BILLING_MODE.PACKAGE,
        limits: { maxVehicles: 3, recommended: true, termPrices: [{ months: 3, price: '250000' }] },
      },
      {
        name: 'Gói chuyên nghiệp',
        description: null,
        billingMode: BILLING_MODE.PACKAGE,
        limits: { maxVehicles: null, salesOnly: true, termPrices: [] },
      },
    ],
    purchaseUrl: 'https://partner.xeprime.test/subscription',
    contactUrl: 'https://partner.xeprime.test/support',
    assetBaseUrl: 'https://xeprime.test/email/',
    hotline: null,
    zalo: '0901 234 567',
    reminderDays: 7,
    graceDays: 5,
    commissionPercent: 7.5,
    packageCommissionPercent: 0,
  };
  const tpl = {
    subjectVi: 'Chào {{recipientName}}\r\nBcc: x@y.z',
    subjectEn: 'Hi',
    bodyVi:
      '<p>{{recipientName}} · {{shopName}} · {{expiresAt}}</p>{{planTable}}<a href="{{purchaseUrl}}">x</a>' +
      '{{#hotline}}<p>HOTLINE {{hotline}}</p>{{/hotline}}{{#zalo}}<p>ZALO {{zalo}}</p>{{/zalo}}{{unknown}}',
    bodyEn: '',
  };

  it('escape mọi giá trị người dùng nhập, kể cả trong bảng gói', () => {
    const r = renderPlanGuideTemplate(tpl, base);
    expect(r.html).not.toContain('<img src=x');
    expect(r.html).toContain('&lt;img src=x onerror=alert(1)&gt; &quot;An&quot;');
    expect(r.html).toContain('Shop &amp; Co');
    expect(r.html).toContain('Gói &lt;b&gt;cơ bản&lt;/b&gt;');
    expect(r.html).not.toContain('<b>cơ bản</b>');
  });

  it('subject một dòng (không chèn được header), giá CẢ KỲ nguyên văn', () => {
    const r = renderPlanGuideTemplate(tpl, base);
    expect(r.subject).not.toMatch(/[\r\n]/);
    // 3 tháng = 250.000đ đúng như termPrices — không phải 3 × đơn giá.
    expect(r.html).toMatch(/250\.000/);
  });

  it('thẻ gói theo luật hộp thoại web: giá tiêu đề theo kỳ, bậc tư vấn hiện "Liên hệ báo giá"', () => {
    const r = renderPlanGuideTemplate(tpl, base);
    expect(r.html).toContain('/3 tháng');
    expect(r.html).toContain('Tối đa 3 xe');
    expect(r.html).toContain('Gói chuyên nghiệp');
    expect(r.html).toContain('Liên hệ báo giá');
    // Zalo đã khai ⇒ "Liên hệ tư vấn" mở zalo.me (số nội địa), không còn trang hỗ trợ.
    expect(r.html).toContain('href="https://zalo.me/0901234567"');
    expect(r.html).not.toContain('href="https://partner.xeprime.test/support"');
    expect(r.html).toContain('src="https://xeprime.test/email/plan-trend.png"');
    expect(r.html).toContain('src="https://xeprime.test/email/plan-star.png"');
  });

  it('số liệu động: ngày nhắc, ân hạn, hạn ân hạn, % hai tuyến — định dạng theo ngôn ngữ', () => {
    const t = {
      subjectVi: 's',
      subjectEn: 's',
      bodyVi:
        '<p>N={{reminderDays}} G={{graceDays}} E={{graceEndsAt}} C={{commissionPercent}} P={{packageCommissionPercent}}</p>' +
        '{{#graceDays}}<p>GRACE</p>{{/graceDays}}{{#commissionPercent}}<p>FEE</p>{{/commissionPercent}}',
      bodyEn: '<p>C={{commissionPercent}} E={{graceEndsAt}}</p>',
    };
    const vi = renderPlanGuideTemplate(t, base).html;
    // 19/10 (giờ VN) + 5 ngày = 24/10/2026
    expect(vi).toContain('N=7 G=5 E=24 tháng 10, 2026 C=7,5% P=0%');
    expect(vi).toContain('GRACE');
    expect(vi).toContain('FEE');
    const en = renderPlanGuideTemplate(t, { ...base, locale: 'en' }).html;
    expect(en).toContain('C=7.5% E=24 October 2026');
    // Không có giá trị ⇒ khối biến mất, không in chữ rỗng.
    const none = renderPlanGuideTemplate(t, {
      ...base,
      graceDays: 0,
      commissionPercent: null,
      expiresAt: null,
    }).html;
    expect(none).not.toContain('GRACE');
    expect(none).not.toContain('FEE');
    expect(none).toContain('G= E= C= P=0%');
    expect(renderPlanGuideTemplate(t, { ...base, commissionPercent: 10 }).html).toContain('C=10%');
  });

  it('dòng {{reason}} dự phòng không có số cứng — đọc % và hạn ân hạn từ đầu vào', () => {
    const t = {
      subjectVi: 's',
      subjectEn: 's',
      bodyVi: '<p>{{reason}}</p>',
      bodyEn: '<p>{{reason}}</p>',
    };
    const expired = renderPlanGuideTemplate(t, {
      ...base,
      reason: PLAN_GUIDE_REASON.EXPIRED,
      commissionPercent: 12,
    });
    expect(expired.text).toContain('12%');
    const grace = renderPlanGuideTemplate(t, { ...base, reason: PLAN_GUIDE_REASON.GRACE });
    expect(grace.text).toContain('24 tháng 10, 2026');
    const expiring = renderPlanGuideTemplate(t, {
      ...base,
      reason: PLAN_GUIDE_REASON.EXPIRING,
      packageCommissionPercent: 3,
    });
    expect(expiring.text).toContain('3%');
  });

  it('khối điều kiện: hotline trống ẩn, zalo có hiện; biến lạ giữ nguyên; URL lạ bị thay', () => {
    const r = renderPlanGuideTemplate(tpl, base);
    expect(r.html).not.toContain('HOTLINE');
    expect(r.html).toContain('ZALO 0901 234 567');
    expect(r.html).toContain('{{unknown}}');
    const bad = renderPlanGuideTemplate(tpl, { ...base, purchaseUrl: 'javascript:alert(1)' });
    expect(bad.html).not.toContain('javascript:');
  });
});

// ── DB ──────────────────────────────────────────────────────────────────────

describe('app-config (DB)', () => {
  maybe('GET /app-config/partner công khai, Cache-Control no-store', async () => {
    const res = await request(server()).get('/app-config/partner').expect(200);
    expect(res.headers['cache-control']).toMatch(/no-store/);
    expect(typeof res.body.isPlanPromotionEnabled).toBe('boolean');
  });

  maybe('admin endpoint: platform_staff thiếu quyền ⇒ 403; đối tác ⇒ 403', async () => {
    await request(server()).get('/platform/app-config/partner').set(as(ids.staff)).expect(403);
    await request(server())
      .patch('/platform/app-config/partner')
      .set(as(ids.staff))
      .send({ isPlanPromotionEnabled: true })
      .expect(403);
    await request(server())
      .get('/platform/plan-guide-email-templates')
      .set(as(ids.staff))
      .expect(403);
    await request(server()).get('/platform/app-config/partner').set(as(ids.partner)).expect(403);
  });

  maybe(
    'PATCH: audit cùng transaction, version +1; không đổi ⇒ không bump (worker chỉ chiếu khi version đổi)',
    async () => {
      await setFlag(false);
      const before = await appConfig.getPartner();
      const res = await request(server())
        .patch('/platform/app-config/partner')
        .set(as(ids.admin))
        .send({ isPlanPromotionEnabled: true })
        .expect(200);
      expect(res.body.isPlanPromotionEnabled).toBe(true);
      expect(res.body.version).toBe(before.version + 1);
      // Cùng giá trị ⇒ không bump ⇒ worker không chiếu lại.
      const same = await request(server())
        .patch('/platform/app-config/partner')
        .set(as(ids.admin))
        .send({ isPlanPromotionEnabled: true })
        .expect(200);
      expect(same.body.version).toBe(before.version + 1);
      const audit = await prisma.auditLog.findFirst({
        where: { actorUserId: ids.admin, action: APP_CONFIG_AUDIT_ACTION.UPDATE },
      });
      expect(audit?.afterJson).toMatchObject({ isPlanPromotionEnabled: true });
    },
  );

  maybe(
    'tắt isPlanPromotionEnabled ⇒ không xếp thư nào (đăng ký tuyến gói + tư vấn bị từ chối)',
    async () => {
      await setFlag(false);
      const ward = await prisma.ward.findFirstOrThrow({
        where: { provinceCode: '79' },
        select: { code: true },
      });
      const shop = await makeTenantsService(asService).registerShop(ids.packageOwner, {
        name: `AppCfg Shop ${RUN}`,
        provinceCode: '79',
        wardCode: ward.code,
        addressLine: '12 Nguyễn Huệ',
        phone: '0901234567',
        registrationTrack: REGISTRATION_TRACK.PACKAGE,
      });
      const key = planGuideDedupeKey(PLAN_GUIDE_REASON.REGISTERED, { tenantId: shop.id });
      expect(await prisma.emailOutbox.count({ where: { dedupeKey: key } })).toBe(0);

      await expect(
        support.openPlanConsultation(ids.partner, {
          fullName: 'Chủ xe',
          phone: '0901234567',
          email: emailOf('partner'),
        }),
      ).rejects.toMatchObject({ response: { code: API_ERROR_CODE.PLAN_CONSULTATION_DISABLED } });

      // Bật rồi enqueue lại cùng mốc ⇒ đúng MỘT dòng (DB gác trùng).
      await setFlag(true);
      const input = {
        to: emailOf('packageOwner'),
        reason: PLAN_GUIDE_REASON.REGISTERED,
        tenantId: shop.id,
      };
      expect(await appConfig.enqueuePlanGuide(asService, input)).toBe(true);
      expect(await appConfig.enqueuePlanGuide(asService, input)).toBe(false);
      expect(await prisma.emailOutbox.count({ where: { dedupeKey: key } })).toBe(1);
    },
  );

  maybe(
    'thư gói tới email TÀI KHOẢN và email LIÊN HỆ — trùng địa chỉ thì một thư, gọi lại không thêm',
    async () => {
      await setFlag(true);
      const tenantId = `contact-${RUN}`;
      const key = planGuideDedupeKey(PLAN_GUIDE_REASON.REGISTERED, { tenantId });
      const input = {
        accountEmail: emailOf('packageOwner'),
        contactEmail: `lien-he-${RUN}@shop.test`,
        reason: PLAN_GUIDE_REASON.REGISTERED,
        tenantId,
      };
      expect(await appConfig.enqueuePlanGuideToOwnerAndContact(asService, input)).toEqual([
        input.accountEmail,
        input.contactEmail,
      ]);
      expect(await appConfig.enqueuePlanGuideToOwnerAndContact(asService, input)).toEqual([]);
      const rows = await prisma.emailOutbox.findMany({
        where: { dedupeKey: { in: [key, `${key}:contact`] } },
        select: { toEmail: true },
      });
      expect(rows.map((r) => r.toEmail).sort()).toEqual(
        [input.accountEmail, input.contactEmail].sort(),
      );

      // Chỉ có email liên hệ (đăng ký bằng SĐT) ⇒ vẫn gửi; trùng địa chỉ (khác hoa thường) ⇒ một thư.
      const phoneOnly = `phone-${RUN}`;
      await appConfig.enqueuePlanGuideToOwnerAndContact(asService, {
        ...input,
        accountEmail: null,
        tenantId: phoneOnly,
      });
      const sameTenant = `same-${RUN}`;
      await appConfig.enqueuePlanGuideToOwnerAndContact(asService, {
        ...input,
        contactEmail: input.accountEmail.toUpperCase(),
        tenantId: sameTenant,
      });
      for (const id of [phoneOnly, sameTenant]) {
        const k = planGuideDedupeKey(PLAN_GUIDE_REASON.REGISTERED, { tenantId: id });
        expect(await prisma.emailOutbox.count({ where: { dedupeKey: { startsWith: k } } })).toBe(1);
      }
    },
  );

  maybe(
    'tư vấn gói: thư tới email TÀI KHOẢN + email LIÊN HỆ ở form, tối đa 1 thư/địa chỉ/ngày',
    async () => {
      await setFlag(true);
      const typed = `lien-he-${RUN}@shop.test`;
      const result = await support.openPlanConsultation(ids.partner, {
        fullName: 'Chủ xe <b>A</b>',
        phone: '0901234567',
        email: typed,
        message: 'Tôi có 5 xe',
      });
      createdCaseIds.push(result.caseId);
      expect(result.emailQueued).toBe(true);
      expect(result.emailedTo).toBe(`${emailOf('partner')}, ${typed}`);
      const row = await prisma.supportCase.findUniqueOrThrow({ where: { id: result.caseId } });
      expect(row.category).toBe(SUPPORT_CASE_CATEGORY.PLAN_CONSULTATION);
      expect(row.description).toContain(typed);
      const key = planGuideDedupeKey(PLAN_GUIDE_REASON.CONSULTATION, {
        userId: ids.partner,
        vnDayKey: vnDateKey(new Date()),
      });
      const outbox = await prisma.emailOutbox.findMany({
        where: { dedupeKey: { in: [key, `${key}:contact`] } },
        select: { kind: true, toEmail: true },
      });
      expect(outbox.every((o) => o.kind === EMAIL_OUTBOX_KIND.PLAN_GUIDE)).toBe(true);
      expect(outbox.map((o) => o.toEmail).sort()).toEqual([emailOf('partner'), typed].sort());

      // Lần hai cùng ngày (dù đổi email liên hệ): case vẫn mở nhưng KHÔNG thêm thư.
      const again = await support.openPlanConsultation(ids.partner, {
        fullName: 'Chủ xe A',
        phone: '0901234567',
        email: `another-${RUN}@shop.test`,
      });
      createdCaseIds.push(again.caseId);
      expect(again).toMatchObject({ emailQueued: false, emailedTo: null });
      expect(await prisma.emailOutbox.count({ where: { dedupeKey: { startsWith: key } } })).toBe(2);
    },
  );

  maybe(
    'tư vấn gói: tài khoản KHÔNG có email ⇒ chỉ gửi tới email liên hệ; trùng email tài khoản ⇒ một thư',
    async () => {
      await setFlag(true);
      await prisma.user.update({ where: { id: ids.customer }, data: { email: null } });
      try {
        const typed = `typed-${RUN}@shop.test`;
        const result = await support.openPlanConsultation(ids.customer, {
          fullName: 'Không email',
          phone: '0901234567',
          email: typed,
        });
        createdCaseIds.push(result.caseId);
        expect(result).toMatchObject({ emailQueued: true, emailedTo: typed });
      } finally {
        await prisma.user.update({
          where: { id: ids.customer },
          data: { email: emailOf('customer') },
        });
      }
      const same = await support.openPlanConsultation(ids.packageOwner, {
        fullName: 'Trùng email',
        phone: '0901234567',
        email: emailOf('packageOwner').toUpperCase(),
      });
      createdCaseIds.push(same.caseId);
      expect(same).toMatchObject({ emailQueued: true, emailedTo: emailOf('packageOwner') });
    },
  );

  maybe(
    'mẫu email: đúng MỘT mẫu bật (DB gác), mẫu bật không xoá được, mọi thao tác có audit',
    async () => {
      const create = (code: string) =>
        request(server())
          .post('/platform/plan-guide-email-templates')
          .set(as(ids.admin))
          .send({ code, name: `Mẫu ${code}`, variants: fullVariants() })
          .expect(201);
      const a = (await create(`t-a-${RUN}`)).body;
      const b = (await create(`t-b-${RUN}`)).body;
      createdTemplateIds.push(a.id, b.id);

      // GET trả đủ bốn nội dung theo thứ tự PLAN_GUIDE_VARIANT.
      const got = await request(server())
        .get(`/platform/plan-guide-email-templates/${a.id}`)
        .set(as(ids.admin))
        .expect(200);
      expect(got.body.variants.map((v: { variant: string }) => v.variant)).toEqual(
        PLAN_GUIDE_VARIANT_VALUES,
      );

      // Tạo bộ thiếu một nội dung ⇒ 400, không ghi gì.
      await request(server())
        .post('/platform/plan-guide-email-templates')
        .set(as(ids.admin))
        .send({ code: `t-miss-${RUN}`, name: 'x', variants: fullVariants().slice(0, 3) })
        .expect(400);
      // Bốn phần tử nhưng một nội dung lặp (thiếu `grace`) ⇒ vẫn 400.
      const dupVariant = fullVariants();
      dupVariant[3] = { ...dupVariant[0]! };
      await request(server())
        .post('/platform/plan-guide-email-templates')
        .set(as(ids.admin))
        .send({ code: `t-miss-${RUN}`, name: 'x', variants: dupVariant })
        .expect(400);
      expect(await prisma.planGuideEmailTemplate.count({ where: { code: `t-miss-${RUN}` } })).toBe(
        0,
      );

      // Mã trùng ⇒ 409 mã riêng.
      const dup = await request(server())
        .post('/platform/plan-guide-email-templates')
        .set(as(ids.admin))
        .send({ code: `t-a-${RUN}`, name: 'x', variants: fullVariants() })
        .expect(409);
      expect(dup.body.error.code).toBe(API_ERROR_CODE.PLAN_GUIDE_TEMPLATE_CODE_TAKEN);

      await request(server())
        .post(`/platform/plan-guide-email-templates/${a.id}/activate`)
        .set(as(ids.admin))
        .expect(200);
      await request(server())
        .post(`/platform/plan-guide-email-templates/${b.id}/activate`)
        .set(as(ids.admin))
        .expect(200);
      const active = await prisma.planGuideEmailTemplate.findMany({
        where: { isActive: true },
        select: { id: true },
      });
      expect(active.map((r) => r.id)).toEqual([b.id]);

      // Ghi thẳng DB vượt service vẫn bị chặn bởi partial unique index.
      await expect(
        prisma.planGuideEmailTemplate.update({ where: { id: a.id }, data: { isActive: true } }),
      ).rejects.toThrow();

      const del = await request(server())
        .delete(`/platform/plan-guide-email-templates/${b.id}`)
        .set(as(ids.admin))
        .expect(409);
      expect(del.body.error.code).toBe(API_ERROR_CODE.PLAN_GUIDE_TEMPLATE_ACTIVE);
      await request(server())
        .delete(`/platform/plan-guide-email-templates/${a.id}`)
        .set(as(ids.admin))
        .expect(200);

      const upd = await request(server())
        .patch(`/platform/plan-guide-email-templates/${b.id}`)
        .set(as(ids.admin))
        .send({ name: 'Đổi tên', expectedVersion: 1 })
        .expect(200);
      expect(upd.body.version).toBe(2);
      await request(server())
        .patch(`/platform/plan-guide-email-templates/${b.id}`)
        .set(as(ids.admin))
        .send({ name: 'Lần nữa', expectedVersion: 1 })
        .expect(409);

      // PATCH một phần: chỉ tiêu đề vi của `grace` đổi, các trường/nội dung khác giữ nguyên.
      const patched = await request(server())
        .patch(`/platform/plan-guide-email-templates/${b.id}`)
        .set(as(ids.admin))
        .send({
          variants: [{ variant: PLAN_GUIDE_VARIANT.GRACE, subjectVi: 'Ân hạn mới' }],
          expectedVersion: 2,
        })
        .expect(200);
      expect(patched.body.version).toBe(3);
      const byVariant = (v: string) =>
        patched.body.variants.find((row: { variant: string }) => row.variant === v);
      expect(byVariant(PLAN_GUIDE_VARIANT.GRACE)).toMatchObject({
        subjectVi: 'Ân hạn mới',
        subjectEn: 'EN grace {{recipientName}}',
      });
      expect(byVariant(PLAN_GUIDE_VARIANT.WELCOME).subjectVi).toBe('VI welcome {{recipientName}}');

      // Xem trước theo từng nội dung: mỗi variant dựng đúng tiêu đề/thân của nó.
      for (const v of PLAN_GUIDE_VARIANT_VALUES) {
        const p = await request(server())
          .post(`/platform/plan-guide-email-templates/${b.id}/preview`)
          .set(as(ids.admin))
          .send({ locale: 'en', variant: v })
          .expect(200);
        expect(p.body.subject).toContain(`EN ${v}`);
        expect(p.body.html).toContain(`body-${v}`);
      }
      // Bản nháp chưa lưu thay cho bản DB của đúng nội dung đó.
      const preview = await request(server())
        .post(`/platform/plan-guide-email-templates/${b.id}/preview`)
        .set(as(ids.admin))
        .send({
          locale: 'vi',
          variant: PLAN_GUIDE_VARIANT.EXPIRED,
          body: '<p>draft {{recipientName}}</p>',
        })
        .expect(200);
      expect(preview.body.subject).toContain('VI expired');
      expect(preview.body.html).toContain('draft');
      await request(server())
        .post(`/platform/plan-guide-email-templates/${b.id}/preview`)
        .set(as(ids.admin))
        .send({ variant: 'nope' })
        .expect(400);

      const test = await request(server())
        .post(`/platform/plan-guide-email-templates/${b.id}/send-test`)
        .set(as(ids.admin))
        .send({ variant: PLAN_GUIDE_VARIANT.EXPIRING, locale: 'vi' })
        .expect(202);
      expect(test.body.to).toBe(emailOf('admin'));
      const outbox = await prisma.emailOutbox.findUniqueOrThrow({
        where: { id: test.body.outboxId },
      });
      expect(outbox.kind).toBe(EMAIL_OUTBOX_KIND.PLAN_GUIDE_TEST);

      const actions = (
        await prisma.auditLog.findMany({
          where: { actorUserId: ids.admin, targetType: 'plan_guide_template' },
          select: { action: true },
        })
      ).map((r) => r.action);
      for (const a of ['create', 'activate', 'delete', 'update', 'send_test']) {
        expect(actions).toContain(`plan_guide_template.${a}`);
      }
    },
  );

  maybe(
    'xem trước: % phí chuyến đọc từ chính sách phí ĐANG HIỆU LỰC — đổi chính sách là đổi thư',
    async () => {
      const tpl = (
        await request(server())
          .post('/platform/plan-guide-email-templates')
          .set(as(ids.admin))
          .send({ code: `t-fee-${RUN}`, name: 'Mẫu phí', variants: fullVariants() })
          .expect(201)
      ).body;
      createdTemplateIds.push(tpl.id);
      const render = async (): Promise<string> =>
        (
          await request(server())
            .post(`/platform/plan-guide-email-templates/${tpl.id}/preview`)
            .set(as(ids.admin))
            .send({
              locale: 'vi',
              variant: PLAN_GUIDE_VARIANT.GRACE,
              body: '<p>FEE={{commissionPercent}} PKG={{packageCommissionPercent}} N={{reminderDays}}</p>',
            })
            .expect(200)
        ).body.html as string;

      const active = await prisma.feePolicy.findFirst({
        where: { status: FEE_POLICY_STATUS.ACTIVE },
      });
      // Chính sách là bản ghi bất biến với API (ADR 0024) — test sửa thẳng DB rồi trả lại.
      const tempId = active ? null : newId();
      if (tempId) {
        await prisma.feePolicy.create({
          data: {
            id: tempId,
            version: 900_000 + Math.floor(Math.random() * 99_999),
            status: FEE_POLICY_STATUS.ACTIVE,
            name: `test-${RUN}`,
            serviceFeePercent: 7.5,
          },
        });
      }
      const original = active?.serviceFeePercent;
      try {
        if (active)
          await prisma.feePolicy.update({
            where: { id: active.id },
            data: { serviceFeePercent: 7.5 },
          });
        expect(await render()).toContain(`FEE=7,5% PKG=0% N=${SUBSCRIPTION_RENEWAL_REMINDER_DAYS}`);
        await prisma.feePolicy.update({
          where: { id: active?.id ?? tempId! },
          data: { serviceFeePercent: 12 },
        });
        expect(await render()).toContain('FEE=12% PKG=0%');
      } finally {
        if (active)
          await prisma.feePolicy.update({
            where: { id: active.id },
            data: { serviceFeePercent: original! },
          });
        if (tempId) await prisma.feePolicy.delete({ where: { id: tempId } });
      }
    },
  );

  maybe(
    'dispatcher: dựng bằng mẫu đang bật rồi gửi, đánh `sent`; thư thử dùng đúng mẫu chỉ định',
    async () => {
      const sent: { to: string; subject: string; html: string }[] = [];
      const email = {
        sendRendered: async (to: string, r: { subject: string; html: string }) => {
          sent.push({ to, subject: r.subject, html: r.html });
        },
      } as unknown as EmailService;
      const dispatcher = new EmailOutboxDispatcher(
        asService,
        email,
        app.get(PlanGuideTemplatesService),
        new ConfigService({ NODE_ENV: 'test' }),
      );
      // Chỉ xử lý thư của bộ này: các dòng khác đang chờ trong DB dev được đẩy lùi tạm.
      const mine = { OR: [{ toEmail: { contains: RUN } }] };
      const others = await prisma.emailOutbox.findMany({
        where: { status: 'pending', NOT: mine },
        select: { id: true, nextAttemptAt: true },
      });
      await prisma.emailOutbox.updateMany({
        where: { id: { in: others.map((o) => o.id) } },
        data: { nextAttemptAt: new Date(Date.now() + 365 * 86_400_000) },
      });
      try {
        await dispatcher.dispatch(new Date(Date.now() + 1000));
      } finally {
        for (const o of others) {
          await prisma.emailOutbox.update({
            where: { id: o.id },
            data: { nextAttemptAt: o.nextAttemptAt },
          });
        }
      }
      expect(sent.length).toBeGreaterThan(0);
      expect(sent.every((s) => s.to.includes(RUN))).toBe(true);
      const pendingMine = await prisma.emailOutbox.count({ where: { ...mine, status: 'pending' } });
      expect(pendingMine).toBe(0);
      const testMail = sent.find((s) => s.to === emailOf('admin'));
      expect(testMail?.subject).toContain('VI expiring');
    },
  );

  maybe(
    'dispatcher: lỗi gửi ⇒ lùi hàm mũ; quá trần ⇒ failed; `sending` mồ côi được thu hồi',
    async () => {
      // Mốc giả năm 2000: chỉ các dòng của test này "tới hạn", không đụng hàng thật trong DB.
      const now = new Date('2000-01-02T00:00:00Z');
      const mk = async (label: string, data: { attempts?: number; status?: string }) => {
        const id = newId();
        await prisma.emailOutbox.create({
          data: {
            id,
            kind: EMAIL_OUTBOX_KIND.PLAN_GUIDE,
            toEmail: `retry-${label}-${RUN}@xeprime.test`,
            locale: 'vi',
            payloadJson: {
              reason: PLAN_GUIDE_REASON.EXPIRING,
              displayName: null,
              tenantId: null,
              subscriptionId: null,
              endsAt: null,
            },
            status: data.status ?? EMAIL_OUTBOX_STATUS.PENDING,
            attempts: data.attempts ?? 0,
            nextAttemptAt: new Date('2000-01-01T00:00:00Z'),
          },
        });
        return id;
      };
      const fresh = await mk('fresh', {});
      const last = await mk('last', { attempts: EMAIL_OUTBOX_MAX_ATTEMPTS - 1 });
      const orphan = await mk('orphan', { status: EMAIL_OUTBOX_STATUS.SENDING });
      // Tiến trình chết giữa chừng: dòng đứng `sending` từ lâu.
      await prisma.$executeRaw`UPDATE email_outbox SET updated_at = '1999-12-01T00:00:00Z' WHERE id = ${orphan}`;

      const email = {
        sendRendered: async () => {
          throw new Error('SMTP 421');
        },
      } as unknown as EmailService;
      const templates = {
        renderOutbox: async () => ({ subject: 's', html: '<p>h</p>', text: 'h' }),
      } as unknown as PlanGuideTemplatesService;
      const dispatcher = new EmailOutboxDispatcher(
        asService,
        email,
        templates,
        new ConfigService({ NODE_ENV: 'test' }),
      );
      const report = await dispatcher.dispatch(now);
      expect(report).toMatchObject({ sent: 0, failed: 1 });

      const f = await prisma.emailOutbox.findUniqueOrThrow({ where: { id: fresh } });
      expect(f).toMatchObject({
        status: EMAIL_OUTBOX_STATUS.PENDING,
        attempts: 1,
        lastError: 'SMTP 421',
      });
      expect(f.nextAttemptAt.getTime()).toBe(now.getTime() + 60_000);

      const l = await prisma.emailOutbox.findUniqueOrThrow({ where: { id: last } });
      expect(l).toMatchObject({
        status: EMAIL_OUTBOX_STATUS.FAILED,
        attempts: EMAIL_OUTBOX_MAX_ATTEMPTS,
      });

      const o = await prisma.emailOutbox.findUniqueOrThrow({ where: { id: orphan } });
      expect(o).toMatchObject({ status: EMAIL_OUTBOX_STATUS.PENDING, attempts: 1 });

      // Trước mốc lùi: không thử lại. Sau mốc: lần 2, lùi 2 phút.
      await dispatcher.dispatch(new Date(now.getTime() + 30_000));
      expect((await prisma.emailOutbox.findUniqueOrThrow({ where: { id: fresh } })).attempts).toBe(
        1,
      );
      const later = new Date(now.getTime() + 61_000);
      await dispatcher.dispatch(later);
      const f2 = await prisma.emailOutbox.findUniqueOrThrow({ where: { id: fresh } });
      expect(f2.attempts).toBe(2);
      expect(f2.nextAttemptAt.getTime()).toBe(later.getTime() + 2 * 60_000);
    },
  );
});

describe('Công tắc gửi SMS OTP — production', () => {
  it('production: từ chối TẮT (OTP_SMS_REQUIRED_IN_PRODUCTION), không chạm DB', async () => {
    const prodConfig = new ConfigService({ NODE_ENV: 'production', APP_ENV: 'production' });
    const svc = new AppConfigService(
      {
        $transaction: () => Promise.reject(new Error('không được ghi')),
      } as never,
      {} as never,
      prodConfig,
    );
    await expect(
      svc.updatePartner('01JQZX00000000000000000000', { otpSmsEnabled: false }),
    ).rejects.toMatchObject({
      response: { code: API_ERROR_CODE.OTP_SMS_REQUIRED_IN_PRODUCTION },
    });
  });
});

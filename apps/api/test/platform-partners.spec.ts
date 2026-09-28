import 'reflect-metadata';
import {
  Injectable,
  RequestMethod,
  type CanActivate,
  type ExecutionContext,
  type INestApplication,
} from '@nestjs/common';
import { METHOD_METADATA } from '@nestjs/common/constants';
import { APP_GUARD, Reflector } from '@nestjs/core';
import { Test } from '@nestjs/testing';
import { createPrismaClient, newId } from '@xeprime/prisma';
import {
  API_ERROR_CODE,
  AUDIT_ACTION_CATEGORY,
  AUDIT_ACTOR_SCOPE,
  BILLING_MODE,
  BOOKING_REQUEST_STATUS,
  BOOKING_STATUS,
  MEMBERSHIP_STATUS,
  PERMISSION,
  PARTNER_QUOTA_KIND,
  PLATFORM_PARTNER_KIND,
  PLATFORM_ROLE,
  SELLER_ENTITY_TYPE,
  SHOP_ONBOARDING_STATE,
  SUBSCRIPTION_INVOICE_STATUS,
  TENANT_STATUS,
  VEHICLE_PUBLIC_STATUS,
  VEHICLE_TYPE,
} from '@xeprime/types';
import request from 'supertest';
import { createValidationPipe } from '../src/bootstrap';
import { AllExceptionsFilter } from '../src/common/filters/all-exceptions.filter';
import { PermissionGuard } from '../src/common/guards/permission.guard';
import { PlatformScopeGuard } from '../src/common/guards/platform-scope.guard';
import type { RequestContext } from '../src/common/types/request-context';
import { PlatformPartnerDetailService } from '../src/modules/platform-admin/platform-partner-detail.service';
import { PlatformPartnerOperationsService } from '../src/modules/platform-admin/platform-partner-operations.service';
import { PlatformPartnersController } from '../src/modules/platform-admin/platform-partners.controller';
import { RbacService } from '../src/modules/rbac/rbac.service';
import { VehicleAlertsService } from '../src/modules/vehicles/vehicle-alerts.service';
import type { PrismaService } from '../src/prisma/prisma.service';
import { PrismaService as PrismaServiceToken } from '../src/prisma/prisma.service';
import { makeBillingService, makeBranchesService } from './helpers/service-factory';

/**
 * Drawer CHI TIẾT đối tác (Platform Admin) — chạy qua bộ guard THẬT (platform scope → permission)
 * trên Postgres thật; chỉ phần xác thực là giả (`x-test-user`).
 *
 * Khoá năm lời hứa của màn hình:
 *  1. Chỉ có GET — không handler ghi nào, và đọc không để lại dấu (không audit, không
 *     `used_features`, không phiên hỗ trợ, không membership).
 *  2. Quyền: xem đối tác + quyền của miền từng tab; thiếu là 403.
 *  3. PII chỉ ở dạng che; giấy tờ không bao giờ kèm file hay số.
 *  4. Tiền chỉ ra khi có `platform.money.manage` — bị BỎ ở server, không che ở client.
 *  5. Không đọc chéo tenant; loại đối tác do server suy.
 */

const prisma = createPrismaClient();
const asService = prisma as unknown as PrismaService;

@Injectable()
class HeaderAuthGuard implements CanActivate {
  canActivate(ctx: ExecutionContext): boolean {
    const req = ctx.switchToHttp().getRequest<RequestContext>();
    const userId = req.headers['x-test-user'];
    if (typeof userId === 'string') {
      req.user = {
        id: userId,
        displayName: 'test',
        email: null,
        phoneVerified: true,
        sessionId: 'S-partner',
      };
    }
    return true;
  }
}

const ids = {
  superAdmin: newId(),
  support: newId(),
  finance: newId(),
  staff: newId(),
  auditor: newId(),
  outsider: newId(),
  customer: newId(),
  shopOwner: newId(),
  liteOwner: newId(),
  otherOwner: newId(),
  auditorRole: newId(),
  shop: newId(),
  lite: newId(),
  other: newId(),
  plan: newId(),
  branch: newId(),
  shopCar: newId(),
  shopCar2: newId(),
  liteCar: newId(),
  otherCar: newId(),
};

/** PII / số liệu thô — KHÔNG chuỗi nào được xuất hiện trong bất kỳ response nào. */
const RAW = {
  ownerPhone: '0987654321',
  ownerEmail: 'chu.shop.that@xeprime.test',
  customerName: 'Nguyễn Văn Khách Thật',
  customerPhone: '0911222333',
  customerActorName: 'Lê Thị Khách Nhật Ký',
  taxId: '0101234567',
  idNumber: '001099012345',
  docNumber: 'SO-GIAY-TO-9988',
  fileUrl: 'https://cdn.test/private/cccd.jpg',
};

let dbAvailable = false;
let app: INestApplication;

const as = (userId: string) => ({ 'x-test-user': userId });

beforeAll(async () => {
  try {
    await prisma.$connect();
    await prisma.$queryRaw`SELECT 1`;
    dbAvailable = true;
  } catch {
    console.warn('\n[skip] Không kết nối được PostgreSQL.\n');
    return;
  }

  const now = Date.now();
  const DAY = 86_400_000;

  for (const [id, name, phone, email] of [
    [ids.superAdmin, 'Quản trị nền tảng', null, `pp-${ids.superAdmin}@xeprime.test`],
    [ids.support, 'Hỗ trợ viên', null, `pp-${ids.support}@xeprime.test`],
    [ids.finance, 'Kế toán', null, `pp-${ids.finance}@xeprime.test`],
    [ids.staff, 'Nhân viên nền tảng', null, `pp-${ids.staff}@xeprime.test`],
    [ids.auditor, 'Người đọc nhật ký', null, `pp-${ids.auditor}@xeprime.test`],
    [ids.outsider, 'Khách', null, `pp-${ids.outsider}@xeprime.test`],
    [ids.customer, RAW.customerActorName, null, `pp-${ids.customer}@xeprime.test`],
    [ids.shopOwner, 'Chủ Gian Hàng', RAW.ownerPhone, RAW.ownerEmail],
    [ids.liteOwner, 'Chủ Xe Lẻ', null, `pp-${ids.liteOwner}@xeprime.test`],
    [ids.otherOwner, 'Chủ Khác', null, `pp-${ids.otherOwner}@xeprime.test`],
  ] as const) {
    await prisma.user.create({ data: { id, displayName: name, phone, email } });
  }

  for (const [userId, roleKey] of [
    [ids.superAdmin, PLATFORM_ROLE.PLATFORM_ADMIN],
    [ids.support, PLATFORM_ROLE.SUPPORT],
    [ids.finance, PLATFORM_ROLE.FINANCE_ADMIN],
    [ids.staff, PLATFORM_ROLE.PLATFORM_STAFF],
  ] as const) {
    await prisma.platformMembership.create({
      data: { id: newId(), userId, roleKey, status: MEMBERSHIP_STATUS.ACTIVE },
    });
  }

  // Vai tuỳ biến: xem đối tác + nhật ký, KHÔNG có quyền tiền — nhóm tiền phải biến khỏi nhật ký.
  const permissionId = async (key: string) =>
    (
      await prisma.permission.upsert({
        where: { key },
        update: {},
        create: { id: newId(), key, name: key, module: 'platform', scope: 'platform' },
        select: { id: true },
      })
    ).id;
  await prisma.role.create({
    data: {
      id: ids.auditorRole,
      scope: 'platform',
      key: `pp-${ids.auditorRole}`,
      name: 'Vai đọc nhật ký (test)',
      permissions: {
        create: [
          { permissionId: await permissionId(PERMISSION.PLATFORM_TENANT_VIEW) },
          { permissionId: await permissionId(PERMISSION.PLATFORM_AUDIT_VIEW) },
        ],
      },
    },
  });
  await prisma.platformMembership.create({
    data: {
      id: newId(),
      userId: ids.auditor,
      roleKey: PLATFORM_ROLE.SUPPORT,
      roleId: ids.auditorRole,
      status: MEMBERSHIP_STATUS.ACTIVE,
    },
  });

  await prisma.plan.create({
    data: {
      id: ids.plan,
      code: `pp-${ids.plan.slice(-8)}`,
      name: 'Business (test)',
      billingMode: BILLING_MODE.PACKAGE,
      limitsJson: { maxVehicles: 30, maxBranches: 5, maxMembers: 10, graceDays: 7 },
      status: 'archived',
    },
  });

  const tenant = (id: string, ownerUserId: string, onboardingState: string, name: string) =>
    prisma.tenant.create({
      data: {
        id,
        code: `PP-${id.slice(-8)}`,
        slug: `pp-${id.toLowerCase().slice(-10)}`,
        name,
        status: TENANT_STATUS.ACTIVE,
        onboardingState,
        ownerUserId,
        phone: RAW.ownerPhone,
        email: RAW.ownerEmail,
      },
    });
  await tenant(ids.shop, ids.shopOwner, SHOP_ONBOARDING_STATE.PACKAGE_ACTIVE, 'Gian Hàng Test');
  await tenant(ids.lite, ids.liteOwner, SHOP_ONBOARDING_STATE.COMMISSION, 'Xe Lẻ Test');
  await tenant(ids.other, ids.otherOwner, SHOP_ONBOARDING_STATE.COMMISSION, 'Tenant Khác');

  await prisma.tenantProfile.create({
    data: { tenantId: ids.shop, displayName: 'Gian Hàng Test', taxCode: RAW.taxId },
  });
  await prisma.sellerProfile.create({
    data: {
      id: newId(),
      tenantId: ids.shop,
      entityType: SELLER_ENTITY_TYPE.COMPANY,
      taxId: RAW.taxId,
    },
  });
  await prisma.sellerProfile.create({
    data: { id: newId(), tenantId: ids.lite, idNumber: RAW.idNumber },
  });
  await prisma.tenantDocument.create({
    data: {
      id: newId(),
      tenantId: ids.shop,
      documentType: 'business_license',
      fileUrl: RAW.fileUrl,
    },
  });

  await prisma.tenantSubscription.create({
    data: {
      id: newId(),
      tenantId: ids.shop,
      planId: ids.plan,
      price: 12_000_000,
      billingMode: BILLING_MODE.PACKAGE,
      startsAt: new Date(now - 30 * DAY),
      endsAt: new Date(now + 300 * DAY),
    },
  });
  await prisma.tenantSubscription.create({
    data: {
      id: newId(),
      tenantId: ids.lite,
      planId: ids.plan,
      price: 0,
      billingMode: BILLING_MODE.COMMISSION,
      startsAt: new Date(now - 30 * DAY),
      endsAt: new Date(now + 300 * DAY),
    },
  });
  await prisma.subscriptionInvoice.create({
    data: {
      id: newId(),
      tenantId: ids.shop,
      code: `XPG${ids.shop.slice(-8)}`,
      periodFrom: new Date(now),
      periodTo: new Date(now + 365 * DAY),
      linesJson: [],
      subtotal: 12_000_000,
      totalAmount: 12_000_000,
      status: SUBSCRIPTION_INVOICE_STATUS.ISSUED,
      expiresAt: new Date(now + 3 * DAY),
    },
  });

  await prisma.tenantBranch.create({
    data: {
      id: ids.branch,
      tenantId: ids.shop,
      code: 'CN01',
      name: 'Chi nhánh Test',
      isDefault: true,
    },
  });

  const car = (id: string, tenantId: string, extra: Record<string, unknown> = {}) =>
    prisma.vehicle.create({
      data: {
        id,
        tenantId,
        code: `XE-${id.slice(-6)}`,
        name: `Xe ${id.slice(-4)}`,
        vehicleType: VEHICLE_TYPE.CAR,
        ...extra,
      },
    });
  await car(ids.shopCar, ids.shop, {
    branchId: ids.branch,
    publicStatus: VEHICLE_PUBLIC_STATUS.APPROVED_PUBLIC,
  });
  await car(ids.shopCar2, ids.shop);
  await car(ids.liteCar, ids.lite);
  await car(ids.otherCar, ids.other);

  await prisma.vehicleDocument.create({
    data: {
      id: newId(),
      tenantId: ids.lite,
      vehicleId: ids.liteCar,
      type: 'registration',
      documentNumber: RAW.docNumber,
      expiresAt: new Date(now + 400 * DAY),
    },
  });

  const booking = (tenantId: string, vehicleId: string, extra: Record<string, unknown>) =>
    prisma.booking.create({
      data: {
        id: newId(),
        tenantId,
        vehicleId,
        code: `PP${newId().slice(-8)}`,
        customerName: RAW.customerName,
        customerPhone: RAW.customerPhone,
        pickupAt: new Date(now + 60 * 60 * 1000),
        returnAt: new Date(now + 2 * DAY),
        totalAmount: 2_400_000,
        ...extra,
      },
    });
  await booking(ids.shop, ids.shopCar, { status: BOOKING_STATUS.RESERVED });
  await booking(ids.other, ids.otherCar, { status: BOOKING_STATUS.RESERVED });
  await booking(ids.lite, ids.liteCar, {
    status: BOOKING_STATUS.COMPLETED,
    pickupAt: new Date(now - 3 * 60 * 60 * 1000),
    returnAt: new Date(now - 60 * 60 * 1000),
    actualReturnAt: new Date(now - 60 * 60 * 1000),
    totalAmount: 1_000_000,
    serviceFeeAmount: 100_000,
    taxAmount: 15_000,
    billingMode: BILLING_MODE.COMMISSION,
  });

  await prisma.bookingRequest.create({
    data: {
      id: newId(),
      tenantId: ids.shop,
      vehicleId: ids.shopCar,
      customerName: RAW.customerName,
      customerPhone: RAW.customerPhone,
      status: BOOKING_REQUEST_STATUS.PENDING_HOST_APPROVAL,
      pickupAt: new Date(now + 2 * DAY),
      returnAt: new Date(now + 3 * DAY),
      respondBy: new Date(now + DAY),
    },
  });

  const log = (tenantId: string, action: string) =>
    prisma.auditLog.create({
      data: {
        id: newId(),
        tenantId,
        actorUserId: ids.shopOwner,
        actorScope: 'tenant',
        action,
        targetType: 'test',
        ipAddress: '10.9.9.9',
        userAgent: 'secret-agent',
      },
    });
  for (const action of ['vehicle.update', 'vehicle.document.create', 'branch.create']) {
    await log(ids.shop, action);
  }
  for (const action of ['vehicle.update', 'branch.create', 'withdrawal.requested']) {
    await log(ids.lite, action);
  }
  // Khách thuê cũng ghi nhật ký vào tenant (huỷ yêu cầu…) — tên họ không được đi ra ở dạng thật.
  await prisma.auditLog.create({
    data: {
      id: newId(),
      tenantId: ids.shop,
      actorUserId: ids.customer,
      actorScope: AUDIT_ACTOR_SCOPE.CUSTOMER,
      action: 'booking_request.cancel',
      targetType: 'booking_request',
    },
  });

  await prisma.tenantSupportContext.create({
    data: {
      id: newId(),
      actorUserId: ids.support,
      sessionId: 'SESSION-SECRET',
      tenantId: ids.shop,
      mode: 'view',
      workspace: 'manage',
      reason: 'Hỗ trợ theo ticket #1234',
      expiresAt: new Date(now + 30 * 60 * 1000),
      ipAddress: '10.8.8.8',
    },
  });

  const moduleRef = await Test.createTestingModule({
    controllers: [PlatformPartnersController],
    providers: [
      Reflector,
      { provide: PrismaServiceToken, useValue: asService },
      { provide: RbacService, useValue: new RbacService(asService) },
      { provide: VehicleAlertsService, useValue: new VehicleAlertsService(asService) },
      PlatformPartnerOperationsService,
      {
        provide: PlatformPartnerDetailService,
        inject: [PlatformPartnerOperationsService],
        useFactory: (ops: PlatformPartnerOperationsService) =>
          new PlatformPartnerDetailService(
            asService,
            makeBranchesService(asService),
            ops,
            makeBillingService(asService),
          ),
      },
      { provide: APP_GUARD, useClass: HeaderAuthGuard },
      { provide: APP_GUARD, useClass: PlatformScopeGuard },
      { provide: APP_GUARD, useClass: PermissionGuard },
    ],
  }).compile();

  app = moduleRef.createNestApplication();
  app.useGlobalPipes(createValidationPipe());
  app.useGlobalFilters(new AllExceptionsFilter(false));
  await app.init();
});

afterAll(async () => {
  await app?.close();
  if (dbAvailable) {
    const tenantIds = [ids.shop, ids.lite, ids.other];
    const userIds = [
      ids.superAdmin,
      ids.support,
      ids.finance,
      ids.staff,
      ids.auditor,
      ids.outsider,
      ids.customer,
      ids.shopOwner,
      ids.liteOwner,
      ids.otherOwner,
    ];
    await prisma.auditLog.deleteMany({ where: { tenantId: { in: tenantIds } } });
    await prisma.tenantSupportContext.deleteMany({ where: { tenantId: { in: tenantIds } } });
    await prisma.bookingRequest.deleteMany({ where: { tenantId: { in: tenantIds } } });
    await prisma.booking.deleteMany({ where: { tenantId: { in: tenantIds } } });
    await prisma.vehicleDocument.deleteMany({ where: { tenantId: { in: tenantIds } } });
    await prisma.vehicle.deleteMany({ where: { tenantId: { in: tenantIds } } });
    await prisma.tenantBranch.deleteMany({ where: { tenantId: { in: tenantIds } } });
    await prisma.subscriptionInvoice.deleteMany({ where: { tenantId: { in: tenantIds } } });
    await prisma.tenantSubscription.deleteMany({ where: { tenantId: { in: tenantIds } } });
    await prisma.tenantDocument.deleteMany({ where: { tenantId: { in: tenantIds } } });
    await prisma.sellerProfile.deleteMany({ where: { tenantId: { in: tenantIds } } });
    await prisma.tenant.deleteMany({ where: { id: { in: tenantIds } } });
    await prisma.plan.deleteMany({ where: { id: ids.plan } });
    await prisma.platformMembership.deleteMany({ where: { userId: { in: userIds } } });
    await prisma.role.deleteMany({ where: { id: ids.auditorRole } });
    await prisma.user.deleteMany({ where: { id: { in: userIds } } });
  }
  await prisma.$disconnect();
});

const maybe = (name: string, fn: () => Promise<void>) =>
  it(name, async () => {
    if (!dbAvailable) return;
    await fn();
  });

const get = (path: string, userId: string) =>
  request(app.getHttpServer()).get(`/platform/partners/${path}`).set(as(userId));

const ENDPOINTS = [
  'overview',
  'vehicles',
  'bookings',
  'bookings/summary',
  'booking-requests',
  'profile',
  'billing',
  'commission',
  'activity',
  'support-sessions',
];

function expectNoRawPii(body: unknown): void {
  const json = JSON.stringify(body);
  for (const [key, value] of Object.entries(RAW)) {
    expect({ key, leaked: json.includes(value) }).toEqual({ key, leaked: false });
  }
  expect(json).not.toContain('10.9.9.9');
  expect(json).not.toContain('secret-agent');
  expect(json).not.toContain('SESSION-SECRET');
}

describe('Drawer chi tiết đối tác — chỉ đọc', () => {
  it('controller CHỈ có handler GET', () => {
    const proto = PlatformPartnersController.prototype as unknown as Record<string, unknown>;
    const handlers = Object.getOwnPropertyNames(proto).filter(
      (name) => name !== 'constructor' && typeof proto[name] === 'function',
    );
    expect(handlers.length).toBe(ENDPOINTS.length);
    for (const name of handlers) {
      expect({ name, method: Reflect.getMetadata(METHOD_METADATA, proto[name] as object) }).toEqual(
        {
          name,
          method: RequestMethod.GET,
        },
      );
    }
  });

  maybe(
    'đọc mọi tab KHÔNG để lại dấu: audit, used_features, phiên hỗ trợ, membership',
    async () => {
      const before = await Promise.all([
        // Đếm theo PHẠM VI của test, không toàn bảng: spec khác chạy song song cũng ghi audit.
        prisma.auditLog.count({
          where: {
            OR: [{ tenantId: { in: [ids.shop, ids.lite] } }, { actorUserId: ids.superAdmin }],
          },
        }),
        prisma.tenantSupportContext.count({ where: { tenantId: ids.shop } }),
        prisma.tenantMembership.count({ where: { userId: ids.superAdmin } }),
        prisma.tenant.findUniqueOrThrow({
          where: { id: ids.shop },
          select: { usedFeatures: true },
        }),
      ]);
      for (const tenantId of [ids.shop, ids.lite]) {
        for (const endpoint of ENDPOINTS) {
          const res = await get(`${tenantId}/${endpoint}`, ids.superAdmin);
          expect({ endpoint, status: res.status }).toEqual({ endpoint, status: 200 });
        }
      }
      const after = await Promise.all([
        // Đếm theo PHẠM VI của test, không toàn bảng: spec khác chạy song song cũng ghi audit.
        prisma.auditLog.count({
          where: {
            OR: [{ tenantId: { in: [ids.shop, ids.lite] } }, { actorUserId: ids.superAdmin }],
          },
        }),
        prisma.tenantSupportContext.count({ where: { tenantId: ids.shop } }),
        prisma.tenantMembership.count({ where: { userId: ids.superAdmin } }),
        prisma.tenant.findUniqueOrThrow({
          where: { id: ids.shop },
          select: { usedFeatures: true },
        }),
      ]);
      expect(after).toEqual(before);
    },
  );
});

describe('Drawer chi tiết đối tác — phân loại', () => {
  maybe(
    'gian hàng gói: có gói, chi nhánh; chủ xe cá nhân: không gói, không chi nhánh',
    async () => {
      const shop = (await get(`${ids.shop}/overview`, ids.superAdmin)).body;
      expect(shop.identity.partnerKind).toBe(PLATFORM_PARTNER_KIND.PACKAGE_SHOP);
      expect(shop.plan).toMatchObject({
        planName: 'Business (test)',
        vehicleQuota: { kind: PARTNER_QUOTA_KIND.TOTAL, limit: 30, used: 2, reason: 'plan' },
      });
      expect(shop.branches).toHaveLength(1);
      expect(shop.counts).toMatchObject({ vehicles: 2, listed: 1 });

      const lite = (await get(`${ids.lite}/overview`, ids.superAdmin)).body;
      expect(lite.identity.partnerKind).toBe(PLATFORM_PARTNER_KIND.INDIVIDUAL_OWNER);
      expect(lite.plan).toBeNull();
      expect(lite.branches).toBeNull();
      expect(lite.operating.onboardingCompleted).toBeNull();
    },
  );

  maybe(
    'hồ sơ: gian hàng có mặt tiền + pháp lý; chủ xe cá nhân có danh tính, không pháp lý',
    async () => {
      const shop = (await get(`${ids.shop}/profile`, ids.superAdmin)).body;
      expect(shop.publicProfile).not.toBeNull();
      expect(shop.legal.taxIdMasked).toBeTruthy();
      expect(shop.identity).toBeNull();

      const lite = (await get(`${ids.lite}/profile`, ids.superAdmin)).body;
      expect(lite.publicProfile).toBeNull();
      expect(lite.legal).toBeNull();
      expect(lite.identity.idNumberMasked).toBeTruthy();
      expect(lite.vehicleDocuments).toEqual([
        expect.objectContaining({ type: 'registration', expiresAt: expect.any(String) }),
      ]);
    },
  );
});

describe('Drawer chi tiết đối tác — quyền', () => {
  maybe('không có scope nền tảng → 403 ở mọi tab', async () => {
    for (const endpoint of ENDPOINTS) {
      const res = await get(`${ids.shop}/${endpoint}`, ids.outsider);
      expect({ endpoint, status: res.status }).toEqual({ endpoint, status: 403 });
    }
  });

  maybe('nhân viên nền tảng thiếu quyền xem đối tác → 403 cả Tổng quan', async () => {
    expect((await get(`${ids.shop}/overview`, ids.staff)).status).toBe(403);
  });

  maybe('thiếu quyền của miền → 403 đúng tab đó', async () => {
    // support: có xem đối tác, KHÔNG có gói/hoá đơn, KHÔNG có nhật ký.
    expect((await get(`${ids.shop}/billing`, ids.support)).status).toBe(403);
    expect((await get(`${ids.shop}/activity`, ids.support)).status).toBe(403);
    expect((await get(`${ids.shop}/support-sessions`, ids.support)).status).toBe(403);
    expect((await get(`${ids.shop}/vehicles`, ids.support)).status).toBe(200);
    // finance_admin: có gói, KHÔNG có xem xe.
    expect((await get(`${ids.shop}/billing`, ids.finance)).status).toBe(200);
    expect((await get(`${ids.shop}/vehicles`, ids.finance)).status).toBe(403);
  });

  maybe('Tổng quan tự bỏ khối của miền thiếu quyền thay vì chặn cả tab', async () => {
    const res = await get(`${ids.shop}/overview`, ids.finance);
    expect(res.status).toBe(200);
    expect(res.body.recentVehicles).toBeNull();
    // Cảnh báo xe là dữ liệu miền XE: thiếu quyền xem xe thì không có cả phần tóm tắt.
    expect(res.body.alerts).toBeNull();
    expect(res.body.counts.vehiclesWithAlerts).toBeNull();
    // "Đơn gần đây" chỉ có ở Tổng quan của chủ xe cá nhân.
    expect(res.body.recentBookings).toBeNull();
    const lite = (await get(`${ids.lite}/overview`, ids.finance)).body;
    expect(lite.recentBookings).not.toBeNull();
  });

  maybe(
    'hạn mức theo luật ĐANG CƯỠNG CHẾ: gói có trần; tuyến hoa hồng là Owner Lite, không "không giới hạn"',
    async () => {
      const shop = (await get(`${ids.shop}/billing`, ids.superAdmin)).body;
      expect(shop.quota.vehicles).toMatchObject({
        kind: PARTNER_QUOTA_KIND.TOTAL,
        limit: 30,
        reason: 'plan',
      });
      expect(shop.quota.branches).toMatchObject({ kind: PARTNER_QUOTA_KIND.TOTAL, limit: 5 });
      expect(shop.quota.members).toMatchObject({ kind: PARTNER_QUOTA_KIND.TOTAL, limit: 10 });

      const lite = (await get(`${ids.lite}/billing`, ids.superAdmin)).body;
      expect(lite.quota.vehicles).toMatchObject({
        kind: PARTNER_QUOTA_KIND.TOTAL,
        reason: 'owner_lite',
      });
      expect(lite.quota.branches.kind).toBe(PARTNER_QUOTA_KIND.NOT_APPLICABLE);
      expect(lite.quota.members.kind).toBe(PARTNER_QUOTA_KIND.NOT_APPLICABLE);
    },
  );

  maybe('tiền bị BỎ ở server khi thiếu platform.money.manage', async () => {
    const supportView = (await get(`${ids.shop}/bookings`, ids.support)).body;
    expect(supportView.data[0].totalAmount).toBeNull();
    const financeView = (await get(`${ids.shop}/bookings`, ids.finance)).body;
    expect(financeView.data[0].totalAmount).toBe('2400000.00');

    const commissionSupport = (await get(`${ids.lite}/commission`, ids.support)).body;
    expect(commissionSupport.amountsVisible).toBe(false);
    expect(commissionSupport.months.every((m: { revenue: unknown }) => m.revenue === null)).toBe(
      true,
    );
    const commissionFinance = (await get(`${ids.lite}/commission`, ids.finance)).body;
    expect(commissionFinance.amountsVisible).toBe(true);
    expect(commissionFinance.months[commissionFinance.months.length - 1]).toBeDefined();
    const current = commissionFinance.months.find((m: { closed: boolean }) => !m.closed);
    expect(current).toMatchObject({
      completedCount: 1,
      revenue: '1000000.00',
      serviceFee: '100000.00',
      tax: '15000.00',
    });
  });

  maybe('giấy tờ pháp lý chỉ liệt kê khi có platform.sellers.verify', async () => {
    expect((await get(`${ids.shop}/profile`, ids.support)).body.documents).toBeNull();
    const finance = (await get(`${ids.shop}/profile`, ids.finance)).body;
    expect(finance.documents).toEqual([
      expect.objectContaining({ documentType: 'business_license' }),
    ]);
  });
});

describe('Drawer chi tiết đối tác — PII và phạm vi', () => {
  maybe('không response nào chứa PII thô, số giấy tờ, file, IP hay id phiên', async () => {
    for (const userId of [ids.superAdmin, ids.support, ids.finance]) {
      for (const tenantId of [ids.shop, ids.lite]) {
        for (const endpoint of ENDPOINTS) {
          const res = await get(`${tenantId}/${endpoint}`, userId);
          if (res.status === 200) expectNoRawPii(res.body);
        }
      }
    }
  });

  maybe('không đọc chéo tenant: đơn/xe của tenant khác không lọt vào', async () => {
    const bookings = (await get(`${ids.shop}/bookings`, ids.superAdmin)).body;
    expect(bookings.meta.total).toBe(1);
    const vehicles = (await get(`${ids.shop}/vehicles`, ids.superAdmin)).body;
    expect(vehicles.data.map((v: { id: string }) => v.id).sort()).toEqual(
      [ids.shopCar, ids.shopCar2].sort(),
    );
    // Lọc chi nhánh bằng id của tenant KHÁC ⇒ rỗng, không phải xe của tenant đó.
    const foreign = (await get(`${ids.shop}/vehicles?branchId=${ids.other}`, ids.superAdmin)).body;
    expect(foreign.meta.total).toBe(0);
  });

  maybe('tenant không tồn tại → 404 ở mọi tab', async () => {
    for (const endpoint of ENDPOINTS) {
      const res = await get(`${newId()}/${endpoint}`, ids.superAdmin);
      expect({ endpoint, status: res.status }).toEqual({ endpoint, status: 404 });
      expect(res.body.error.code).toBe(API_ERROR_CODE.NOT_FOUND);
    }
  });

  maybe('tổng hợp đơn: sắp nhận xe trong 2 giờ + yêu cầu chờ duyệt', async () => {
    const summary = (await get(`${ids.shop}/bookings/summary`, ids.support)).body;
    expect(summary).toMatchObject({ upcoming: 1, pickupSoon: 1, pendingRequests: 1, total: 1 });
    const requests = (await get(`${ids.shop}/booking-requests`, ids.support)).body;
    expect(requests.data[0].customerNameMasked).not.toBe(RAW.customerName);
  });
});

describe('Drawer chi tiết đối tác — nhật ký', () => {
  maybe('khách thuê trong nhật ký: tên bị che, và không tìm được theo tên thật', async () => {
    const all = (await get(`${ids.shop}/activity`, ids.superAdmin)).body;
    const row = all.data.find((r: { action: string }) => r.action === 'booking_request.cancel');
    expect(row.actorScope).toBe(AUDIT_ACTOR_SCOPE.CUSTOMER);
    expect(row.actorName).toBeTruthy();
    expect(row.actorName).not.toBe(RAW.customerActorName);

    const search = (
      await get(`${ids.shop}/activity?q=${encodeURIComponent('Khách Nhật Ký')}`, ids.superAdmin)
    ).body;
    expect(search.meta.total).toBe(0);
  });

  maybe('chủ xe cá nhân: không có sự kiện chi nhánh', async () => {
    const res = (await get(`${ids.lite}/activity`, ids.superAdmin)).body;
    const actions = res.data.map((row: { action: string }) => row.action);
    expect(actions).not.toContain('branch.create');
    expect(actions).toContain('vehicle.update');
  });

  maybe('thiếu quyền tiền: nhóm tiền biến khỏi nhật ký (đếm cũng đúng)', async () => {
    const admin = (await get(`${ids.lite}/activity`, ids.superAdmin)).body;
    expect(admin.data.map((r: { action: string }) => r.action)).toContain('withdrawal.requested');
    const auditor = (await get(`${ids.lite}/activity`, ids.auditor)).body;
    expect(auditor.data.map((r: { action: string }) => r.action)).not.toContain(
      'withdrawal.requested',
    );
    expect(auditor.meta.total).toBe(admin.meta.total - 1);
  });

  maybe('lọc nhóm "Xe" không lẫn giấy tờ xe; nhóm giấy tờ lọc riêng được', async () => {
    const vehicles = (
      await get(`${ids.shop}/activity?category=${AUDIT_ACTION_CATEGORY.VEHICLE}`, ids.superAdmin)
    ).body;
    expect(vehicles.data.map((r: { action: string }) => r.action)).toEqual(['vehicle.update']);
    const docs = (
      await get(
        `${ids.shop}/activity?category=${AUDIT_ACTION_CATEGORY.VEHICLE_DOCUMENT}`,
        ids.superAdmin,
      )
    ).body;
    expect(docs.data.map((r: { action: string }) => r.action)).toEqual(['vehicle.document.create']);
  });

  maybe(
    'phiên hỗ trợ: có người mở, lý do, trạng thái — không có id phiên đăng nhập hay IP',
    async () => {
      const res = (await get(`${ids.shop}/support-sessions`, ids.superAdmin)).body;
      expect(res.data).toEqual([
        expect.objectContaining({ actorName: 'Hỗ trợ viên', mode: 'view', status: 'active' }),
      ]);
      expectNoRawPii(res);
    },
  );
});

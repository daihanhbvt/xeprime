import 'reflect-metadata';
import {
  Controller,
  Get,
  Injectable,
  type CanActivate,
  type ExecutionContext,
  type INestApplication,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { APP_GUARD, APP_INTERCEPTOR, Reflector } from '@nestjs/core';
import { Test } from '@nestjs/testing';
import { createPrismaClient, newId } from '@xeprime/prisma';
import {
  API_ERROR_CODE,
  AUDIT_ACTOR_SCOPE,
  BILLING_MODE,
  MAINTENANCE_TYPE,
  MEMBERSHIP_STATUS,
  PERMISSION,
  PLAN_FEATURE,
  PLAN_FEATURE_VALUES,
  PRIVATE_FILE_PURPOSE,
  PRIVATE_FILE_STATUS,
  PLATFORM_ROLE,
  SHOP_ONBOARDING_STATE,
  SUPPORT_CAPABILITY,
  SUPPORT_CONTEXT_HEADER,
  SUPPORT_MODE,
  SUPPORT_WORKSPACE,
  TENANT_CUSTOMER_RISK_LEVEL,
  TENANT_ROLE,
  supportPermissionsFor,
  TENANT_STATUS,
  VEHICLE_IMAGE_TYPE,
  VEHICLE_TYPE,
} from '@xeprime/types';
import { lastValueFrom, of } from 'rxjs';
import request from 'supertest';
import { createValidationPipe } from '../src/bootstrap';
import { TenantScoped } from '../src/common/decorators';
import { AllExceptionsFilter } from '../src/common/filters/all-exceptions.filter';
import { FeatureUsageInterceptor } from '../src/common/interceptors/feature-usage.interceptor';
import { PermissionGuard } from '../src/common/guards/permission.guard';
import { PlanFeatureGuard } from '../src/common/guards/plan-feature.guard';
import { PlatformScopeGuard } from '../src/common/guards/platform-scope.guard';
import { ShopOwnerGuard } from '../src/common/guards/shop-owner.guard';
import { SubscriptionTrackGuard } from '../src/common/guards/subscription-track.guard';
import { TenantScopeGuard } from '../src/common/guards/tenant-scope.guard';
import { SupportRequestStore } from '../src/common/support/support-request.store';
import type { RequestContext } from '../src/common/types/request-context';
import { AuditService } from '../src/modules/audit/audit.service';
import { OccupancyService } from '../src/modules/calendar/occupancy.service';
import { ReceiptsService } from '../src/modules/finance/receipts.service';
import { RbacService } from '../src/modules/rbac/rbac.service';
import { R2Service } from '../src/modules/storage/r2.service';
import { StorageController } from '../src/modules/storage/storage.controller';
import { TenantSupportController } from '../src/modules/tenant-support/tenant-support.controller';
import {
  TenantSupportService,
  deriveSupportCapabilities,
  newSupportContextId,
} from '../src/modules/tenant-support/tenant-support.service';
import { MaintenanceService } from '../src/modules/vehicles/maintenance/maintenance.service';
import { OdometerService } from '../src/modules/vehicles/maintenance/odometer.service';
import { VehicleMaintenanceController } from '../src/modules/vehicles/maintenance/vehicle-maintenance.controller';
import { VehicleAlertsService } from '../src/modules/vehicles/vehicle-alerts.service';
import { VehicleContractsService } from '../src/modules/vehicles/vehicle-contracts.service';
import { VehicleSourceService } from '../src/modules/vehicles/vehicle-source.service';
import { VehiclesController } from '../src/modules/vehicles/vehicles.controller';
import { VehiclesService } from '../src/modules/vehicles/vehicles.service';
import type { PrismaService } from '../src/prisma/prisma.service';
import { Prisma } from '@xeprime/prisma';
import { PrismaService as PrismaServiceToken } from '../src/prisma/prisma.service';
import { FeePoliciesService } from '../src/modules/fee-policies/fee-policies.service';
import { giveTenantPlan } from './helpers/billing-fixture';
import {
  makeBillingService,
  makeCustomersService,
  makeVehiclesService,
  vehicleCreator,
} from './helpers/service-factory';
import { CustomersController } from '../src/modules/customers/customers.controller';
import { CustomersService } from '../src/modules/customers/customers.service';
import { CustomerDocumentsController } from '../src/modules/customers/customer-documents.controller';
import { CustomerDocumentsService } from '../src/modules/customers/customer-documents.service';
import { FinanceOverviewController } from '../src/modules/finance/finance-overview.controller';
import { FinanceOverviewService } from '../src/modules/finance/finance-overview.service';
import { BookingSettlementController } from '../src/modules/bookings/settlement/booking-settlement.controller';
import { SettlementService } from '../src/modules/bookings/settlement/settlement.service';
import { MembersController } from '../src/modules/members/members.controller';
import { MembersService } from '../src/modules/members/members.service';
import { maskSupportPayload } from '../src/common/support/support-mask.interceptor';
import { SupportMaskInterceptor } from '../src/common/support/support-mask.interceptor';
import { BillingService } from '../src/modules/billing/billing.service';
import { SubscriptionsController } from '../src/modules/billing/subscriptions.controller';
import { PlatformTenantsController } from '../src/modules/platform-admin/platform-tenants.controller';
import { PlatformTenantsService } from '../src/modules/platform-admin/platform-tenants.service';

/**
 * Không gian hỗ trợ gian hàng — ADR 0050. Chạy qua BỘ GUARD THẬT (tenant scope → platform scope
 * → permission → chủ gian hàng → tuyến → cờ gói) trên Postgres thật; chỉ phần xác thực là giả
 * (`x-test-user` / `x-test-session` thay cho cookie), vì thứ đang kiểm là điều xảy ra SAU khi
 * đã biết ai đang gọi và từ phiên đăng nhập nào.
 */

const prisma = createPrismaClient();
const asService = prisma as unknown as PrismaService;

const CDN = 'https://cdn.test';

/** Xác thực giả: đọc người + phiên từ header. Mọi guard còn lại là bản thật. */
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
        sessionId: String(req.headers['x-test-session'] ?? 'S-default'),
      };
    }
    return true;
  }
}

/** Endpoint tenant-scoped KHÔNG khai `@SupportAction` — đại diện cho mọi thứ ngoài danh sách. */
@Controller('probe')
@TenantScoped()
class ProbeController {
  @Get('unlisted')
  unlisted(): { ok: boolean } {
    return { ok: true };
  }
}

const fakeR2 = {
  enabled: true,
  privateEnabled: true,
  async presignUpload(params: { prefix: string; fileName: string }) {
    // Cùng dạng key với `R2Service.presignUpload`: `<prefix>/<ULID>-<tên đã làm sạch>`.
    const key = `${params.prefix}/${newId()}-${params.fileName}`;
    return {
      key,
      uploadUrl: `https://r2.local/put/${key}`,
      publicUrl: `${CDN}/${key}`,
      expiresIn: 300,
    };
  },
  async presignPrivateUpload() {
    return { uploadUrl: 'https://r2.local/put', expiresIn: 300 };
  },
  async headPrivateObject() {
    return null;
  },
  async readPrivateObjectPrefix() {
    return null;
  },
  async presignPrivateDownload() {
    return { downloadUrl: 'https://r2.local/get', expiresIn: 120 };
  },
};

let dbAvailable = false;
let app: INestApplication;

const ids = {
  adminA: newId(),
  adminB: newId(),
  viewer: newId(),
  outsider: newId(),
  // Ba người dùng VAI HỆ THỐNG thật (không `roleId`): quyền đọc từ `role_permissions` mà
  // migration `tenant_support_permissions` đưa vào DB test — không qua seed.
  supportStaff: newId(),
  financeAdmin: newId(),
  superAdmin: newId(),
  owner: newId(),
  liteOwner: newId(),
  pendingOwner: newId(),
  packageTenant: newId(),
  liteTenant: newId(),
  pendingTenant: newId(),
  otherTenant: newId(),
  assistRole: newId(),
  viewRole: newId(),
};
let packageVehicleId: string;
let liteVehicleId: string;
let otherVehicleId: string;

const SESSION_A = 'SESSION-A';

/** Bộ capability ĐỌC của Owner Lite (ADR 0050 §10) — không sổ khách, tài xế, thành viên, gói. */
const OWNER_LITE_READS = [
  SUPPORT_CAPABILITY.VEHICLE_VIEW,
  SUPPORT_CAPABILITY.BRANCH_VIEW,
  SUPPORT_CAPABILITY.CALENDAR_VIEW,
  SUPPORT_CAPABILITY.BOOKING_REQUEST_VIEW,
  SUPPORT_CAPABILITY.BOOKING_VIEW,
  SUPPORT_CAPABILITY.HANDOVER_VIEW,
  SUPPORT_CAPABILITY.TENANT_PROFILE_VIEW,
  SUPPORT_CAPABILITY.SUPPORT_CASE_VIEW,
];

function as(userId: string, session = SESSION_A) {
  return { 'x-test-user': userId, 'x-test-session': session };
}

beforeAll(async () => {
  try {
    await prisma.$connect();
    await prisma.$queryRaw`SELECT 1`;
    dbAvailable = true;
  } catch {
    console.warn('\n[skip] Không kết nối được PostgreSQL. Chạy `pnpm db:up` trước.\n');
    return;
  }

  // ── Người ──────────────────────────────────────────────────────────────────────────────────
  for (const [id, name] of [
    [ids.adminA, 'Hỗ trợ A'],
    [ids.adminB, 'Hỗ trợ B'],
    [ids.viewer, 'Hỗ trợ chỉ xem'],
    [ids.outsider, 'Người ngoài'],
    [ids.supportStaff, 'Nhân viên hỗ trợ (vai hệ thống)'],
    [ids.financeAdmin, 'Kế toán nền tảng'],
    [ids.superAdmin, 'Quản trị nền tảng'],
    [ids.owner, 'Chủ gian hàng'],
    [ids.liteOwner, 'Chủ xe hoa hồng'],
    [ids.pendingOwner, 'Chủ gian hàng chờ gói'],
  ] as const) {
    await prisma.user.create({
      data: { id, displayName: name, email: `ts-${id}@xeprime.test` },
    });
  }

  // Vai nền tảng TUỲ BIẾN — quyền tất định, không phụ thuộc DB test đã seed bản nào.
  const permissionId = async (key: string) =>
    (
      await prisma.permission.upsert({
        where: { key },
        update: {},
        create: { id: newId(), key, name: key, module: 'platform', scope: 'platform' },
        select: { id: true },
      })
    ).id;
  const viewPerm = await permissionId(PERMISSION.PLATFORM_TENANT_SUPPORT_VIEW);
  const assistPerm = await permissionId(PERMISSION.PLATFORM_TENANT_SUPPORT_ASSIST);
  for (const [roleId, perms] of [
    [ids.assistRole, [viewPerm, assistPerm]],
    [ids.viewRole, [viewPerm]],
  ] as const) {
    await prisma.role.create({
      data: {
        id: roleId,
        scope: 'platform',
        key: `ts-${roleId}`,
        name: 'Vai hỗ trợ test',
        permissions: { create: perms.map((permissionId) => ({ permissionId })) },
      },
    });
  }
  for (const [userId, roleId] of [
    [ids.adminA, ids.assistRole],
    [ids.adminB, ids.assistRole],
    [ids.viewer, ids.viewRole],
  ] as const) {
    await prisma.platformMembership.create({
      data: {
        id: newId(),
        userId,
        roleKey: PLATFORM_ROLE.SUPPORT,
        roleId,
        status: MEMBERSHIP_STATUS.ACTIVE,
      },
    });
  }

  for (const [userId, roleKey] of [
    [ids.supportStaff, PLATFORM_ROLE.SUPPORT],
    [ids.financeAdmin, PLATFORM_ROLE.FINANCE_ADMIN],
    [ids.superAdmin, PLATFORM_ROLE.PLATFORM_ADMIN],
  ] as const) {
    await prisma.platformMembership.create({
      data: { id: newId(), userId, roleKey, status: MEMBERSHIP_STATUS.ACTIVE },
    });
  }

  // ── Gian hàng ──────────────────────────────────────────────────────────────────────────────
  const makeTenant = async (
    id: string,
    ownerUserId: string,
    onboardingState: string = SHOP_ONBOARDING_STATE.COMMISSION,
  ) => {
    await prisma.tenant.create({
      data: {
        id,
        code: `TS-${id.slice(-8)}`,
        slug: `ts-${id.toLowerCase().slice(-10)}`,
        name: `Gian hàng ${id.slice(-4)}`,
        status: TENANT_STATUS.ACTIVE,
        ownerUserId,
        onboardingState,
      },
    });
    await prisma.tenantMembership.create({
      data: {
        id: newId(),
        tenantId: id,
        userId: ownerUserId,
        roleKey: TENANT_ROLE.SHOP_OWNER,
        status: MEMBERSHIP_STATUS.ACTIVE,
      },
    });
  };
  await makeTenant(ids.packageTenant, ids.owner, SHOP_ONBOARDING_STATE.PACKAGE_ACTIVE);
  await giveTenantPlan(prisma, ids.packageTenant, {
    billingMode: BILLING_MODE.PACKAGE,
    features: [PLAN_FEATURE.MAINTENANCE],
  });
  await makeTenant(ids.liteTenant, ids.liteOwner);
  await giveTenantPlan(prisma, ids.liteTenant, { billingMode: BILLING_MODE.COMMISSION });
  await makeTenant(ids.pendingTenant, ids.pendingOwner, SHOP_ONBOARDING_STATE.PACKAGE_PENDING);
  // Gian hàng thứ tư dùng chung chủ với gian hàng gói — chỉ để có một chiếc xe "người khác".
  await prisma.tenant.create({
    data: {
      id: ids.otherTenant,
      code: `TS-${ids.otherTenant.slice(-8)}`,
      slug: `ts-${ids.otherTenant.toLowerCase().slice(-10)}`,
      name: 'Gian hàng khác',
      status: TENANT_STATUS.ACTIVE,
      ownerUserId: ids.owner,
      onboardingState: SHOP_ONBOARDING_STATE.PACKAGE_ACTIVE,
    },
  });
  await giveTenantPlan(prisma, ids.otherTenant, {
    billingMode: BILLING_MODE.PACKAGE,
    features: [PLAN_FEATURE.MAINTENANCE],
  });

  const createVehicle = vehicleCreator(makeVehiclesService(asService), asService);
  const vehicle = (tenantId: string, userId: string, code: string) =>
    createVehicle(tenantId, userId, {
      code,
      name: 'Toyota Vios',
      vehicleType: VEHICLE_TYPE.CAR,
      plateNumber: `51A-${code.slice(-3)}.45`,
      weekdayPrice: '600000',
      images: ['https://legacy.example/cu.jpg'],
    });
  packageVehicleId = (await vehicle(ids.packageTenant, ids.owner, 'TSP-001')).id;
  liteVehicleId = (await vehicle(ids.liteTenant, ids.liteOwner, 'TSL-001')).id;
  otherVehicleId = (await vehicle(ids.otherTenant, ids.owner, 'TSO-001')).id;

  // ── App với bộ guard thật ─────────────────────────────────────────────────────────────────
  const store = new SupportRequestStore();
  const config = new ConfigService({
    R2_PUBLIC_BASE_URL: CDN,
    PLAN_FEATURE_ENFORCEMENT: 'on',
  });
  const audit = new AuditService(asService, store);
  const rbac = new RbacService(asService);
  const vehicles = makeVehiclesService(asService, { config });
  const files = new VehicleContractsService(asService, fakeR2 as unknown as R2Service, audit);
  const odometer = new OdometerService(asService, audit);
  const billing = makeBillingService(asService);
  const maintenance = new MaintenanceService(
    asService,
    new OccupancyService(asService),
    odometer,
    files,
    audit,
    new ReceiptsService(asService, audit),
  );

  const moduleRef = await Test.createTestingModule({
    controllers: [
      TenantSupportController,
      PlatformTenantsController,
      // Đợt 2A — sổ khách (thật) + các màn KHÔNG mở cho phiên (service giả: guard phải chặn trước).
      CustomersController,
      CustomerDocumentsController,
      FinanceOverviewController,
      BookingSettlementController,
      MembersController,
      SubscriptionsController,
      VehiclesController,
      VehicleMaintenanceController,
      StorageController,
      ProbeController,
    ],
    providers: [
      Reflector,
      { provide: PrismaServiceToken, useValue: asService },
      { provide: ConfigService, useValue: config },
      { provide: SupportRequestStore, useValue: store },
      { provide: AuditService, useValue: audit },
      { provide: RbacService, useValue: rbac },
      TenantSupportService,
      { provide: FeePoliciesService, useValue: new FeePoliciesService(asService, audit) },
      { provide: VehiclesService, useValue: vehicles },
      { provide: VehicleSourceService, useValue: {} },
      { provide: VehicleContractsService, useValue: files },
      { provide: VehicleAlertsService, useValue: {} },
      { provide: MaintenanceService, useValue: maintenance },
      { provide: OdometerService, useValue: odometer },
      { provide: R2Service, useValue: fakeR2 },
      { provide: BillingService, useValue: billing },
      { provide: CustomersService, useValue: makeCustomersService(asService, audit) },
      { provide: CustomerDocumentsService, useValue: {} },
      { provide: FinanceOverviewService, useValue: {} },
      { provide: SettlementService, useValue: {} },
      { provide: MembersService, useValue: {} },
      {
        provide: PlatformTenantsService,
        useValue: new PlatformTenantsService(asService, audit, billing),
      },
      { provide: APP_GUARD, useClass: HeaderAuthGuard },
      { provide: APP_GUARD, useClass: TenantScopeGuard },
      { provide: APP_GUARD, useClass: PlatformScopeGuard },
      { provide: APP_GUARD, useClass: PermissionGuard },
      { provide: APP_GUARD, useClass: ShopOwnerGuard },
      { provide: APP_GUARD, useClass: SubscriptionTrackGuard },
      { provide: APP_GUARD, useClass: PlanFeatureGuard },
      { provide: APP_INTERCEPTOR, useClass: SupportMaskInterceptor },
    ],
  }).compile();

  app = moduleRef.createNestApplication();
  // Cùng việc `SupportRequestMiddleware` làm ở AppModule: mỗi request một store.
  app.use((req: RequestContext, _res: unknown, next: () => void) =>
    store.run({ support: null, capability: null, ipAddress: '10.0.0.9', userAgent: 'jest' }, next),
  );
  app.useGlobalPipes(createValidationPipe());
  app.useGlobalFilters(new AllExceptionsFilter(false));
  await app.init();
}, 60_000);

afterAll(async () => {
  await app?.close();
  if (dbAvailable) {
    const tenantIds = [ids.packageTenant, ids.liteTenant, ids.pendingTenant, ids.otherTenant];
    const userIds = [
      ids.adminA,
      ids.adminB,
      ids.viewer,
      ids.outsider,
      ids.supportStaff,
      ids.financeAdmin,
      ids.superAdmin,
      ids.owner,
      ids.liteOwner,
      ids.pendingOwner,
    ];
    await prisma.auditLog.deleteMany({
      where: { OR: [{ tenantId: { in: tenantIds } }, { actorUserId: { in: userIds } }] },
    });
    await prisma.tenantSupportContext.deleteMany({ where: { tenantId: { in: tenantIds } } });
    await prisma.tenantCustomer.deleteMany({ where: { tenantId: { in: tenantIds } } });
    await prisma.vehicleMaintenanceRecord.deleteMany({ where: { tenantId: { in: tenantIds } } });
    await prisma.vehicle.deleteMany({ where: { tenantId: { in: tenantIds } } });
    await prisma.tenantBranch.deleteMany({ where: { tenantId: { in: tenantIds } } });
    await prisma.tenantSubscription.deleteMany({ where: { tenantId: { in: tenantIds } } });
    await prisma.tenantMembership.deleteMany({ where: { tenantId: { in: tenantIds } } });
    await prisma.tenant.deleteMany({ where: { id: { in: tenantIds } } });
    await prisma.platformMembership.deleteMany({ where: { userId: { in: userIds } } });
    await prisma.role.deleteMany({ where: { id: { in: [ids.assistRole, ids.viewRole] } } });
    await prisma.user.deleteMany({ where: { id: { in: userIds } } });
  }
  await prisma.$disconnect();
});

const maybe = (name: string, fn: () => Promise<void>) =>
  it(name, async () => {
    if (!dbAvailable) return;
    await fn();
  });

async function open(
  tenantId: string,
  mode: string = SUPPORT_MODE.ASSIST,
  actor: string = ids.adminA,
  session: string = SESSION_A,
) {
  const res = await request(app.getHttpServer())
    .post('/platform/tenant-support/contexts')
    .set(as(actor, session))
    .send({ tenantId, mode, reason: 'Chủ xe nhờ cập nhật ảnh theo ticket #42' });
  return res;
}

async function openId(tenantId: string, mode: string = SUPPORT_MODE.ASSIST): Promise<string> {
  const res = await open(tenantId, mode);
  expect(res.status).toBe(201);
  return res.body.id as string;
}

function inContext(contextId: string, actor = ids.adminA, session = SESSION_A) {
  return { ...as(actor, session), [SUPPORT_CONTEXT_HEADER]: contextId };
}

describe('Mở phiên hỗ trợ', () => {
  maybe('người không có quyền nền tảng không mở được phiên (1)', async () => {
    const res = await open(ids.packageTenant, SUPPORT_MODE.VIEW, ids.outsider);
    expect(res.status).toBe(403);
    expect(await prisma.tenantSupportContext.count({ where: { actorUserId: ids.outsider } })).toBe(
      0,
    );
  });

  maybe(
    'chủ gian hàng không mở được phiên cho chính gian hàng mình (không phải nhân sự nền tảng)',
    async () => {
      const res = await open(ids.packageTenant, SUPPORT_MODE.VIEW, ids.owner);
      expect(res.status).toBe(403);
    },
  );

  maybe('người chỉ có quyền XEM không mở được phiên `assist`', async () => {
    const res = await open(ids.packageTenant, SUPPORT_MODE.ASSIST, ids.viewer);
    expect(res.status).toBe(403);
    expect(res.body.error.code).toBe(API_ERROR_CODE.MISSING_PERMISSION);
  });

  maybe('lý do quá ngắn bị từ chối', async () => {
    const res = await request(app.getHttpServer())
      .post('/platform/tenant-support/contexts')
      .set(as(ids.adminA))
      .send({ tenantId: ids.packageTenant, mode: SUPPORT_MODE.VIEW, reason: 'ngắn' });
    expect(res.status).toBe(400);
  });

  maybe(
    'mở phiên ghi audit `tenant_support.open` phía nền tảng, kèm id phiên và lý do',
    async () => {
      const id = await openId(ids.packageTenant, SUPPORT_MODE.VIEW);
      const row = await prisma.auditLog.findFirstOrThrow({
        where: { supportContextId: id, action: 'tenant_support.open' },
      });
      expect(row.actorUserId).toBe(ids.adminA);
      expect(row.actorScope).toBe(AUDIT_ACTOR_SCOPE.PLATFORM);
      expect(row.tenantId).toBe(ids.packageTenant);
      expect((row.afterJson as { reason: string }).reason).toContain('ticket #42');
    },
  );

  maybe('không tạo membership tạm nào cho nhân sự nền tảng', async () => {
    await openId(ids.packageTenant);
    expect(await prisma.tenantMembership.count({ where: { userId: ids.adminA } })).toBe(0);
  });
});

describe('Bộ giao diện theo tuyến (7, 8, 10)', () => {
  maybe('gian hàng tuyến gói → Full Manage, có bảo dưỡng', async () => {
    const res = await open(ids.packageTenant);
    expect(res.body.workspace).toBe(SUPPORT_WORKSPACE.MANAGE);
    expect(res.body.capabilities).toEqual(
      expect.arrayContaining([
        SUPPORT_CAPABILITY.VEHICLE_VIEW,
        SUPPORT_CAPABILITY.VEHICLE_INFO_EDIT,
        SUPPORT_CAPABILITY.VEHICLE_MEDIA_MANAGE,
        SUPPORT_CAPABILITY.MAINTENANCE_VIEW,
        SUPPORT_CAPABILITY.MAINTENANCE_MANAGE,
      ]),
    );
  });

  maybe('gian hàng tuyến hoa hồng → Owner Lite, KHÔNG có bảo dưỡng', async () => {
    const res = await open(ids.liteTenant);
    expect(res.body.workspace).toBe(SUPPORT_WORKSPACE.OWNER_LITE);
    expect(res.body.capabilities).not.toContain(SUPPORT_CAPABILITY.MAINTENANCE_VIEW);
    expect(res.body.capabilities).not.toContain(SUPPORT_CAPABILITY.MAINTENANCE_MANAGE);

    const maintenance = await request(app.getHttpServer())
      .get(`/vehicles/${liteVehicleId}/maintenance/records`)
      .set(inContext(res.body.id));
    expect(maintenance.status).toBe(403);
    expect(maintenance.body.error.code).toBe(API_ERROR_CODE.SUPPORT_ACTION_NOT_ALLOWED);
  });

  maybe('`package_pending` → chỉ trạng thái đăng ký, không mở khu làm việc nào', async () => {
    const res = await open(ids.pendingTenant);
    expect(res.body.workspace).toBe(SUPPORT_WORKSPACE.ONBOARDING);
    expect(res.body.capabilities).toEqual([]);
    expect(res.body.tenant.onboardingState).toBe(SHOP_ONBOARDING_STATE.PACKAGE_PENDING);

    const list = await request(app.getHttpServer()).get('/vehicles').set(inContext(res.body.id));
    expect(list.status).toBe(403);
    expect(list.body.error.code).toBe(API_ERROR_CODE.SUPPORT_ACTION_NOT_ALLOWED);
  });

  maybe(
    'phiên Owner Lite chỉ mang dữ liệu gian hàng — không có gì của tài khoản cá nhân chủ xe (9)',
    async () => {
      const res = await open(ids.liteTenant);
      expect(Object.keys(res.body).sort()).toEqual(
        [
          'actor',
          'capabilities',
          'createdAt',
          'expiresAt',
          'id',
          'mode',
          'permissions',
          'reason',
          'tenant',
          'workspace',
          'writeRestriction',
        ].sort(),
      );
      // Người thao tác là nhân sự nền tảng, không phải chủ xe.
      expect(res.body.actor.id).toBe(ids.adminA);
      // Quyền phiên = đúng bảng của capability Owner Lite (+ ghi Đợt 1) — không gì thêm.
      expect(res.body.permissions.sort()).toEqual(
        supportPermissionsFor([
          ...OWNER_LITE_READS,
          SUPPORT_CAPABILITY.VEHICLE_INFO_EDIT,
          SUPPORT_CAPABILITY.VEHICLE_MEDIA_MANAGE,
        ]).sort(),
      );
      // Không ví, không tài chính, không sổ khách, không thành viên, không chat, không file riêng tư.
      for (const sensitive of [
        PERMISSION.FINANCE_VIEW,
        PERMISSION.CUSTOMER_VIEW,
        PERMISSION.MEMBER_VIEW,
        PERMISSION.SUBSCRIPTION_VIEW,
        PERMISSION.HANDOVER_FILE_VIEW,
        PERMISSION.CUSTOMER_DOCUMENT_FILE_VIEW,
        PERMISSION.SELLER_PROFILE_VIEW,
      ]) {
        expect(res.body.permissions).not.toContain(sensitive);
      }
    },
  );
});

describe('Ràng buộc người + phiên đăng nhập + hạn (2, 3, 4)', () => {
  maybe('admin B không dùng được phiên của admin A', async () => {
    const id = await openId(ids.packageTenant);
    const res = await request(app.getHttpServer())
      .get('/vehicles')
      .set(inContext(id, ids.adminB, SESSION_A));
    expect(res.status).toBe(403);
    expect(res.body.error.code).toBe(API_ERROR_CODE.SUPPORT_CONTEXT_INVALID);

    const read = await request(app.getHttpServer())
      .get(`/platform/tenant-support/contexts/${id}`)
      .set(as(ids.adminB));
    expect(read.status).toBe(403);
    expect(read.body.error.code).toBe(API_ERROR_CODE.SUPPORT_CONTEXT_INVALID);
  });

  maybe('cùng người nhưng phiên đăng nhập KHÁC bị từ chối', async () => {
    const id = await openId(ids.packageTenant);
    const res = await request(app.getHttpServer())
      .get('/vehicles')
      .set(inContext(id, ids.adminA, 'SESSION-OTHER'));
    expect(res.status).toBe(403);
    expect(res.body.error.code).toBe(API_ERROR_CODE.SUPPORT_CONTEXT_INVALID);
  });

  maybe('phiên hết hạn trả 403 ngay', async () => {
    const id = await openId(ids.packageTenant);
    await prisma.tenantSupportContext.update({
      where: { id },
      data: { createdAt: new Date(Date.now() - 3_600_000), expiresAt: new Date(Date.now() - 1000) },
    });
    const res = await request(app.getHttpServer()).get('/vehicles').set(inContext(id));
    expect(res.status).toBe(403);
    expect(res.body.error.code).toBe(API_ERROR_CODE.SUPPORT_CONTEXT_EXPIRED);
  });

  maybe('thoát phiên → 403 ngay ở request kế tiếp; thoát lần hai vẫn OK', async () => {
    const id = await openId(ids.packageTenant);
    const ok = await request(app.getHttpServer()).get('/vehicles').set(inContext(id));
    expect(ok.status).toBe(200);

    const revoke = await request(app.getHttpServer())
      .post(`/platform/tenant-support/contexts/${id}/revoke`)
      .set(as(ids.adminA));
    expect(revoke.status).toBe(200);
    const again = await request(app.getHttpServer())
      .post(`/platform/tenant-support/contexts/${id}/revoke`)
      .set(as(ids.adminA));
    expect(again.status).toBe(200);
    expect(
      await prisma.auditLog.count({
        where: { supportContextId: id, action: 'tenant_support.revoke' },
      }),
    ).toBe(1);

    const res = await request(app.getHttpServer()).get('/vehicles').set(inContext(id));
    expect(res.status).toBe(403);
    expect(res.body.error.code).toBe(API_ERROR_CODE.SUPPORT_CONTEXT_EXPIRED);
  });

  maybe('admin B không thoát được phiên của admin A', async () => {
    const id = await openId(ids.packageTenant);
    const res = await request(app.getHttpServer())
      .post(`/platform/tenant-support/contexts/${id}/revoke`)
      .set(as(ids.adminB));
    expect(res.status).toBe(403);
    expect(
      (await prisma.tenantSupportContext.findUniqueOrThrow({ where: { id } })).revokedAt,
    ).toBeNull();
  });

  maybe('mất tư cách nhân sự nền tảng giữa phiên → 403 ngay', async () => {
    const id = await openId(ids.packageTenant);
    await prisma.platformMembership.updateMany({
      where: { userId: ids.adminA },
      data: { status: MEMBERSHIP_STATUS.REMOVED },
    });
    try {
      const res = await request(app.getHttpServer()).get('/vehicles').set(inContext(id));
      expect(res.status).toBe(403);
    } finally {
      await prisma.platformMembership.updateMany({
        where: { userId: ids.adminA },
        data: { status: MEMBERSHIP_STATUS.ACTIVE },
      });
    }
  });

  maybe('id phiên đoán bừa / sai dạng / header lặp đều là INVALID', async () => {
    for (const bogus of [newSupportContextId(), 'not-an-id', ids.packageTenant]) {
      const res = await request(app.getHttpServer()).get('/vehicles').set(inContext(bogus));
      expect(res.status).toBe(403);
      expect(res.body.error.code).toBe(API_ERROR_CODE.SUPPORT_CONTEXT_INVALID);
    }
  });
});

describe('Phạm vi gian hàng (5, 6)', () => {
  maybe('danh sách xe trong phiên chỉ có xe của gian hàng của phiên', async () => {
    const id = await openId(ids.packageTenant);
    const res = await request(app.getHttpServer()).get('/vehicles').set(inContext(id));
    expect(res.status).toBe(200);
    const vehicleIds = (res.body.data as { id: string }[]).map((v) => v.id);
    expect(vehicleIds).toContain(packageVehicleId);
    expect(vehicleIds).not.toContain(otherVehicleId);
  });

  maybe('xe của gian hàng khác: không đọc, không sửa được (404)', async () => {
    const id = await openId(ids.packageTenant);
    const read = await request(app.getHttpServer())
      .get(`/vehicles/${otherVehicleId}`)
      .set(inContext(id));
    expect(read.status).toBe(404);

    const write = await request(app.getHttpServer())
      .patch(`/vehicles/${otherVehicleId}`)
      .set(inContext(id))
      .send({ color: 'Đỏ' });
    expect(write.status).toBe(404);
    const other = await prisma.vehicle.findUniqueOrThrow({ where: { id: otherVehicleId } });
    expect(other.color).not.toBe('Đỏ');
  });

  maybe('`tenantId` gửi kèm query không đổi được phạm vi', async () => {
    const id = await openId(ids.packageTenant);
    const res = await request(app.getHttpServer())
      .get(`/vehicles?tenantId=${ids.otherTenant}`)
      .set(inContext(id));
    // Tham số lạ bị ValidationPipe chặn, hoặc bỏ qua — không bao giờ trả xe của gian hàng khác.
    if (res.status === 200) {
      const vehicleIds = (res.body.data as { id: string }[]).map((v) => v.id);
      expect(vehicleIds).not.toContain(otherVehicleId);
    } else {
      expect(res.status).toBe(400);
    }
  });

  maybe('nhân sự nền tảng gọi endpoint gian hàng KHÔNG kèm phiên → không có scope', async () => {
    const res = await request(app.getHttpServer()).get('/vehicles').set(as(ids.adminA));
    expect(res.status).toBe(403);
    expect(res.body.error.code).toBe(API_ERROR_CODE.NO_TENANT_SCOPE);
  });
});

describe('Danh sách thao tác cho phép (11)', () => {
  maybe('endpoint tenant-scoped không khai `@SupportAction` bị từ chối', async () => {
    const id = await openId(ids.packageTenant);
    const res = await request(app.getHttpServer()).get('/probe/unlisted').set(inContext(id));
    expect(res.status).toBe(403);
    expect(res.body.error.code).toBe(API_ERROR_CODE.SUPPORT_ACTION_NOT_ALLOWED);
  });

  maybe('tạo xe, xoá xe, gửi duyệt, công tắc lên chợ, giá — đều bị từ chối', async () => {
    const id = await openId(ids.packageTenant);
    const server = app.getHttpServer();
    const attempts = [
      request(server).post('/vehicles').set(inContext(id)).send({}),
      request(server).delete(`/vehicles/${packageVehicleId}`).set(inContext(id)),
      request(server).post(`/vehicles/${packageVehicleId}/submit-public`).set(inContext(id)),
      request(server)
        .patch(`/vehicles/${packageVehicleId}/marketplace-visibility`)
        .set(inContext(id))
        .send({ enabled: false }),
      request(server).put(`/vehicles/${packageVehicleId}/pricing`).set(inContext(id)).send({}),
    ];
    for (const res of await Promise.all(attempts)) {
      expect(res.status).toBe(403);
      expect(res.body.error.code).toBe(API_ERROR_CODE.SUPPORT_ACTION_NOT_ALLOWED);
    }
  });

  maybe(
    'lệnh sửa xe chạm giá / giao nhận / mã xe → SUPPORT_FIELD_NOT_ALLOWED, không ghi gì',
    async () => {
      const id = await openId(ids.packageTenant);
      const before = await prisma.vehicle.findUniqueOrThrow({ where: { id: packageVehicleId } });
      for (const body of [
        { weekdayPrice: '1' },
        { color: 'Xanh', deliveryEnabled: true },
        { code: 'HACK' },
        { discountPercent: 50 },
      ]) {
        const res = await request(app.getHttpServer())
          .patch(`/vehicles/${packageVehicleId}`)
          .set(inContext(id))
          .send(body);
        expect(res.status).toBe(403);
        expect(res.body.error.code).toBe(API_ERROR_CODE.SUPPORT_FIELD_NOT_ALLOWED);
      }
      const after = await prisma.vehicle.findUniqueOrThrow({ where: { id: packageVehicleId } });
      expect(after.weekdayPrice?.toFixed(0)).toBe(before.weekdayPrice?.toFixed(0));
      expect(after.color).toBe(before.color);
    },
  );

  maybe(
    'trường ghim đổi giá trị → từ chối và ROLLBACK cả lệnh; giữ nguyên giá trị thì qua',
    async () => {
      const id = await openId(ids.packageTenant);
      const current = await prisma.vehicle.findUniqueOrThrow({ where: { id: packageVehicleId } });

      const changed = await request(app.getHttpServer())
        .patch(`/vehicles/${packageVehicleId}`)
        .set(inContext(id))
        .send({ color: 'Tím', serviceTypes: ['with_driver'] });
      expect(changed.status).toBe(403);
      expect(changed.body.error.code).toBe(API_ERROR_CODE.SUPPORT_FIELD_NOT_ALLOWED);
      expect(changed.body.error.details.fields).toEqual(['serviceTypes']);
      expect(
        (await prisma.vehicle.findUniqueOrThrow({ where: { id: packageVehicleId } })).color,
      ).toBe(current.color);
      expect(
        await prisma.auditLog.count({
          where: { supportContextId: id, action: 'vehicle.support.update' },
        }),
      ).toBe(0);

      const same = await request(app.getHttpServer())
        .patch(`/vehicles/${packageVehicleId}`)
        .set(inContext(id))
        .send({
          color: 'Tím',
          serviceTypes: current.serviceTypes,
          operationStatus: current.operationStatus,
          branchId: current.branchId,
          vehicleType: current.vehicleType,
        });
      expect(same.status).toBe(200);
    },
  );

  maybe('bảo dưỡng: hoàn tất, huỷ, sửa chi phí, sửa KM, sửa chu kỳ — đều bị từ chối', async () => {
    const id = await openId(ids.packageTenant);
    const created = await request(app.getHttpServer())
      .post(`/vehicles/${packageVehicleId}/maintenance/records`)
      .set(inContext(id))
      .send({ type: MAINTENANCE_TYPE.OIL_CHANGE, title: 'Thay nhớt' });
    expect(created.status).toBe(201);
    const recordId = created.body.id as string;
    const base = `/vehicles/${packageVehicleId}/maintenance`;
    const server = app.getHttpServer();
    const attempts = [
      request(server).post(`${base}/records/${recordId}/complete`).set(inContext(id)).send({}),
      request(server).post(`${base}/records/${recordId}/start`).set(inContext(id)).send({}),
      request(server).post(`${base}/records/${recordId}/cancel`).set(inContext(id)).send({}),
      request(server).patch(`${base}/records/${recordId}/cost`).set(inContext(id)).send({}),
      request(server).post(`${base}/odometer/correction`).set(inContext(id)).send({}),
      request(server).put(`${base}/profile`).set(inContext(id)).send({}),
    ];
    for (const res of await Promise.all(attempts)) {
      expect(res.status).toBe(403);
      expect(res.body.error.code).toBe(API_ERROR_CODE.SUPPORT_ACTION_NOT_ALLOWED);
    }
  });

  maybe('phiên `view` không ghi được gì', async () => {
    const id = await openId(ids.packageTenant, SUPPORT_MODE.VIEW);
    const res = await request(app.getHttpServer())
      .patch(`/vehicles/${packageVehicleId}`)
      .set(inContext(id))
      .send({ color: 'Cam' });
    expect(res.status).toBe(403);
    expect(res.body.error.code).toBe(API_ERROR_CODE.SUPPORT_ACTION_NOT_ALLOWED);
    expect(res.body.error.details.capability).toBe(SUPPORT_CAPABILITY.VEHICLE_INFO_EDIT);
  });

  maybe('gian hàng bị khoá giữa phiên → quyền ghi rơi ngay, vẫn xem được', async () => {
    const id = await openId(ids.packageTenant);
    await prisma.tenant.update({
      where: { id: ids.packageTenant },
      data: { status: TENANT_STATUS.SUSPENDED },
    });
    try {
      const write = await request(app.getHttpServer())
        .patch(`/vehicles/${packageVehicleId}`)
        .set(inContext(id))
        .send({ color: 'Cam' });
      expect(write.status).toBe(403);
      const read = await request(app.getHttpServer()).get('/vehicles').set(inContext(id));
      expect(read.status).toBe(200);
      const ctx = await request(app.getHttpServer())
        .get(`/platform/tenant-support/contexts/${id}`)
        .set(as(ids.adminA));
      expect(ctx.body.writeRestriction).toBe('tenant_locked');
    } finally {
      await prisma.tenant.update({
        where: { id: ids.packageTenant },
        data: { status: TENANT_STATUS.ACTIVE },
      });
    }
  });

  maybe('DB chặn phiên `view` mang capability ghi, dù code có lỗi', async () => {
    await expect(
      prisma.tenantSupportContext.create({
        data: {
          id: newSupportContextId(),
          actorUserId: ids.adminA,
          sessionId: SESSION_A,
          tenantId: ids.packageTenant,
          mode: SUPPORT_MODE.VIEW,
          workspace: SUPPORT_WORKSPACE.MANAGE,
          reason: 'Thử vượt ràng buộc DB',
          capabilities: [SUPPORT_CAPABILITY.VEHICLE_INFO_EDIT],
          expiresAt: new Date(Date.now() + 60_000),
        },
      }),
    ).rejects.toThrow();
  });
});

describe('Ghi hợp lệ + audit (12)', () => {
  maybe(
    'sửa thông tin xe: audit phía nền tảng, đúng phiên, capability, before/after, IP/UA',
    async () => {
      const id = await openId(ids.packageTenant);
      const before = await prisma.vehicle.findUniqueOrThrow({ where: { id: packageVehicleId } });
      const res = await request(app.getHttpServer())
        .patch(`/vehicles/${packageVehicleId}`)
        .set(inContext(id))
        .send({ color: 'Xám bạc', description: 'Xe gia đình, sạch sẽ' });
      expect(res.status).toBe(200);

      const row = await prisma.auditLog.findFirstOrThrow({
        where: { supportContextId: id, action: 'vehicle.support.update' },
      });
      expect(row.actorUserId).toBe(ids.adminA);
      expect(row.actorScope).toBe(AUDIT_ACTOR_SCOPE.PLATFORM);
      expect(row.tenantId).toBe(ids.packageTenant);
      expect(row.targetType).toBe('vehicle');
      expect(row.targetId).toBe(packageVehicleId);
      expect(row.supportCapability).toBe(SUPPORT_CAPABILITY.VEHICLE_INFO_EDIT);
      expect(row.beforeJson).toEqual({ color: before.color, description: before.description });
      expect(row.afterJson).toEqual({ color: 'Xám bạc', description: 'Xe gia đình, sạch sẽ' });
      expect(row.ipAddress).toBe('10.0.0.9');
      expect(row.userAgent).toBe('jest');
      // Không có dòng audit nào của phiên ghi người thao tác là chủ gian hàng.
      expect(
        await prisma.auditLog.count({
          where: {
            supportContextId: id,
            OR: [{ actorUserId: ids.owner }, { actorScope: 'tenant' }],
          },
        }),
      ).toBe(0);
    },
  );

  maybe(
    'phiếu bảo dưỡng tạo + sửa: audit của service cũ (`tenant`) được ép sang nền tảng',
    async () => {
      const id = await openId(ids.packageTenant);
      const created = await request(app.getHttpServer())
        .post(`/vehicles/${packageVehicleId}/maintenance/records`)
        .set(inContext(id))
        .send({ type: MAINTENANCE_TYPE.OIL_CHANGE, title: 'Thay nhớt định kỳ' });
      expect(created.status).toBe(201);

      const updated = await request(app.getHttpServer())
        .put(`/vehicles/${packageVehicleId}/maintenance/records/${created.body.id}`)
        .set(inContext(id))
        .send({
          type: MAINTENANCE_TYPE.OIL_CHANGE,
          title: 'Thay nhớt + lọc gió',
          expectedRowVersion: created.body.rowVersion,
        });
      expect(updated.status).toBe(200);

      const rows = await prisma.auditLog.findMany({
        where: { supportContextId: id, targetId: created.body.id },
        orderBy: { createdAt: 'asc' },
      });
      expect(rows.map((r) => r.action)).toEqual([
        'vehicle.maintenance.create',
        'vehicle.maintenance.update',
      ]);
      for (const row of rows) {
        expect(row.actorScope).toBe(AUDIT_ACTOR_SCOPE.PLATFORM);
        expect(row.actorUserId).toBe(ids.adminA);
        expect(row.supportCapability).toBe(SUPPORT_CAPABILITY.MAINTENANCE_MANAGE);
      }
      expect((rows[1]!.beforeJson as { title: string }).title).toBe('Thay nhớt định kỳ');
      expect((rows[1]!.afterJson as { title: string }).title).toBe('Thay nhớt + lọc gió');
    },
  );

  maybe(
    'chủ gian hàng thật sửa xe như cũ: không cần phiên, được sửa giá, audit phía gian hàng (15, 16)',
    async () => {
      const res = await request(app.getHttpServer())
        .patch(`/vehicles/${packageVehicleId}`)
        .set(as(ids.owner, 'OWNER-SESSION'))
        .send({ weekdayPrice: '650000' });
      expect(res.status).toBe(200);
      expect(
        (
          await prisma.vehicle.findUniqueOrThrow({ where: { id: packageVehicleId } })
        ).weekdayPrice?.toFixed(0),
      ).toBe('650000');

      const lite = await request(app.getHttpServer())
        .patch(`/vehicles/${liteVehicleId}`)
        .set(as(ids.liteOwner, 'LITE-SESSION'))
        .send({ color: 'Trắng' });
      expect(lite.status).toBe(200);
      expect(
        await prisma.auditLog.count({
          where: {
            tenantId: ids.liteTenant,
            actorScope: AUDIT_ACTOR_SCOPE.PLATFORM,
            supportContextId: null,
          },
        }),
      ).toBe(0);
    },
  );

  maybe(
    'chủ gian hàng gửi kèm header phiên của người khác → bị từ chối, không "mượn" được phiên',
    async () => {
      const id = await openId(ids.packageTenant);
      const res = await request(app.getHttpServer())
        .get('/vehicles')
        .set({ ...as(ids.owner, SESSION_A), [SUPPORT_CONTEXT_HEADER]: id });
      expect(res.status).toBe(403);
      expect(res.body.error.code).toBe(API_ERROR_CODE.SUPPORT_CONTEXT_INVALID);
    },
  );
});

describe('Ảnh xe (14)', () => {
  maybe('presign trong phiên ghi vào kho của gian hàng CỦA PHIÊN', async () => {
    const id = await openId(ids.liteTenant);
    const res = await request(app.getHttpServer())
      .post('/uploads/vehicle-images/presign')
      .set(inContext(id))
      .send({ fileName: 'xe.jpg', contentType: 'image/jpeg', fileSize: 1024 });
    expect(res.status).toBe(201);
    expect(res.body.key.startsWith(`tenants/${ids.liteTenant}/vehicles/`)).toBe(true);
  });

  maybe('gắn ảnh của gian hàng khác hoặc URL ngoài → SUPPORT_MEDIA_OUT_OF_SCOPE', async () => {
    const id = await openId(ids.liteTenant);
    for (const url of [
      `${CDN}/tenants/${ids.otherTenant}/vehicles/anh.jpg`,
      'https://evil.example/anh.jpg',
    ]) {
      const res = await request(app.getHttpServer())
        .patch(`/vehicles/${liteVehicleId}`)
        .set(inContext(id))
        .send({ media: [{ url, type: VEHICLE_IMAGE_TYPE.FRONT }] });
      expect(res.status).toBe(403);
      expect(res.body.error.code).toBe(API_ERROR_CODE.SUPPORT_MEDIA_OUT_OF_SCOPE);
    }
  });

  maybe(
    'ảnh mới trong kho của chính gian hàng + ảnh cũ của xe → lưu được, audit before/after',
    async () => {
      const id = await openId(ids.liteTenant);
      // Đúng URL mà presign trong CHÍNH phiên này trả về.
      const presign = await request(app.getHttpServer())
        .post('/uploads/vehicle-images/presign')
        .set(inContext(id))
        .send({ fileName: 'moi.jpg', contentType: 'image/jpeg', fileSize: 1024 });
      const fresh = presign.body.publicUrl as string;
      const res = await request(app.getHttpServer())
        .patch(`/vehicles/${liteVehicleId}`)
        .set(inContext(id))
        .send({
          mainImageUrl: fresh,
          media: [
            { url: fresh, type: VEHICLE_IMAGE_TYPE.FRONT },
            { url: 'https://legacy.example/cu.jpg', type: VEHICLE_IMAGE_TYPE.INTERIOR },
          ],
        });
      expect(res.status).toBe(200);
      const row = await prisma.auditLog.findFirstOrThrow({
        where: { supportContextId: id, action: 'vehicle.support.update' },
      });
      expect(row.supportCapability).toBe(SUPPORT_CAPABILITY.VEHICLE_MEDIA_MANAGE);
      expect((row.afterJson as { mainImageUrl: string }).mainImageUrl).toBe(fresh);
      expect((row.afterJson as { media: unknown[] }).media).toHaveLength(2);
    },
  );
});

describe('Bảng luật capability (hàm thuần)', () => {
  const tenant = (overrides: Record<string, unknown> = {}) =>
    ({
      tenantStatus: TENANT_STATUS.ACTIVE,
      features: Object.fromEntries(PLAN_FEATURE_VALUES.map((f) => [f, 'enabled'])),
      ...overrides,
    }) as never;

  it('bảo dưỡng chỉ ghi khi cờ gói cho ghi — phiên không vượt cổng gói', () => {
    const { capabilities } = deriveSupportCapabilities({
      workspace: SUPPORT_WORKSPACE.MANAGE,
      mode: SUPPORT_MODE.ASSIST,
      tenant: tenant({
        features: {
          ...Object.fromEntries(PLAN_FEATURE_VALUES.map((f) => [f, 'enabled'])),
          [PLAN_FEATURE.MAINTENANCE]: 'read_only',
        },
      }),
      platformPermissions: [PERMISSION.PLATFORM_TENANT_SUPPORT_ASSIST],
    });
    expect(capabilities).toContain(SUPPORT_CAPABILITY.MAINTENANCE_VIEW);
    expect(capabilities).not.toContain(SUPPORT_CAPABILITY.MAINTENANCE_MANAGE);
  });

  it('mất quyền assist → chỉ còn xem, kèm lý do', () => {
    const derived = deriveSupportCapabilities({
      workspace: SUPPORT_WORKSPACE.OWNER_LITE,
      mode: SUPPORT_MODE.ASSIST,
      tenant: tenant(),
      platformPermissions: [PERMISSION.PLATFORM_TENANT_SUPPORT_VIEW],
    });
    expect(derived.capabilities).toEqual(OWNER_LITE_READS);
    expect(derived.writeRestriction).toBe('assist_permission_revoked');
  });
});

describe('Sau review: các đường lách đã đóng', () => {
  maybe('ghi bảo dưỡng trong phiên KHÔNG đánh dấu gian hàng đã dùng tính năng', async () => {
    const id = await openId(ids.packageTenant);
    await prisma.tenant.update({ where: { id: ids.packageTenant }, data: { usedFeatures: [] } });
    const interceptor = new FeatureUsageInterceptor(new Reflector(), asService);
    const mounted = app.get(VehicleMaintenanceController);
    expect(mounted).toBeTruthy();
    // Interceptor không nằm trong app test (không global) — chạy nó trực tiếp trên request phiên.
    const req = {
      method: 'POST',
      tenant: {
        tenantId: ids.packageTenant,
        support: { contextId: id },
        features: { maintenance: 'enabled' },
        usedFeatures: [],
      },
    };
    const ctx = {
      getHandler: () => VehicleMaintenanceController.prototype.createRecord,
      getClass: () => VehicleMaintenanceController,
      switchToHttp: () => ({ getRequest: () => req }),
    } as unknown as ExecutionContext;
    await lastValueFrom(interceptor.intercept(ctx, { handle: () => of('ok') }));
    await new Promise((r) => setTimeout(r, 50));
    const tenant = await prisma.tenant.findUniqueOrThrow({ where: { id: ids.packageTenant } });
    expect(tenant.usedFeatures).toEqual([]);
  });

  maybe(
    'URL ảnh lách tiền tố (`..`, `%2e`, gạch ngược, query, origin khác) đều bị chặn',
    async () => {
      const id = await openId(ids.liteTenant);
      const own = `${CDN}/tenants/${ids.liteTenant}/vehicles`;
      for (const url of [
        `${own}/../../${ids.otherTenant}/vehicles/01ARZ3NDEKTSV4RRFFQ69G5FAV-x.jpg`,
        `${own}/%2e%2e/%2e%2e/${ids.otherTenant}/vehicles/01ARZ3NDEKTSV4RRFFQ69G5FAV-x.jpg`,
        `${own}\\..\\x.jpg`,
        `${own}/01ARZ3NDEKTSV4RRFFQ69G5FAV-x.jpg?v=1`,
        `https://cdn.test.evil/tenants/${ids.liteTenant}/vehicles/01ARZ3NDEKTSV4RRFFQ69G5FAV-x.jpg`,
        `${own}/khong-dung-dang-key.jpg`,
      ]) {
        const res = await request(app.getHttpServer())
          .patch(`/vehicles/${liteVehicleId}`)
          .set(inContext(id))
          .send({ media: [{ url, type: VEHICLE_IMAGE_TYPE.FRONT }] });
        expect([400, 403]).toContain(res.status);
        if (res.status === 403)
          expect(res.body.error.code).toBe(API_ERROR_CODE.SUPPORT_MEDIA_OUT_OF_SCOPE);
      }
    },
  );

  maybe(
    'gửi lại `serviceTypes` y hệt không xoá giá mồ côi (không ghi giá trong phiên)',
    async () => {
      await prisma.vehicle.update({
        where: { id: packageVehicleId },
        data: { monthlyPrice: '9000000' },
      });
      const current = await prisma.vehicle.findUniqueOrThrow({ where: { id: packageVehicleId } });
      const id = await openId(ids.packageTenant);
      const res = await request(app.getHttpServer())
        .patch(`/vehicles/${packageVehicleId}`)
        .set(inContext(id))
        .send({ color: 'Nâu', serviceTypes: current.serviceTypes });
      expect(res.status).toBe(200);
      const after = await prisma.vehicle.findUniqueOrThrow({ where: { id: packageVehicleId } });
      expect(after.monthlyPrice?.toFixed(0)).toBe('9000000');
    },
  );

  maybe('gian hàng bị từ chối/hết hạn: phiên chỉ xem được', async () => {
    for (const status of [TENANT_STATUS.REJECTED, TENANT_STATUS.EXPIRED]) {
      await prisma.tenant.update({ where: { id: ids.liteTenant }, data: { status } });
      try {
        const res = await open(ids.liteTenant);
        expect(res.body.capabilities).toEqual(OWNER_LITE_READS);
      } finally {
        await prisma.tenant.update({
          where: { id: ids.liteTenant },
          data: { status: TENANT_STATUS.ACTIVE },
        });
      }
    }
  });
});

describe('Quyền gian hàng tách xem/quản lý — vai hệ thống thật, quyền từ migration (lượt 2)', () => {
  const server = () => app.getHttpServer();

  maybe('support xem được danh sách + chi tiết gian hàng', async () => {
    const list = await request(server()).get('/platform/tenants').set(as(ids.supportStaff));
    expect(list.status).toBe(200);
    const detail = await request(server())
      .get(`/platform/tenants/${ids.packageTenant}`)
      .set(as(ids.supportStaff));
    expect(detail.status).toBe(200);
  });

  maybe('support mở được phiên xem VÀ phiên hỗ trợ thao tác', async () => {
    for (const mode of [SUPPORT_MODE.VIEW, SUPPORT_MODE.ASSIST]) {
      const res = await open(ids.packageTenant, mode, ids.supportStaff, 'SUPPORT-SESSION');
      expect(res.status).toBe(201);
    }
  });

  maybe('support KHÔNG khoá/mở khoá gian hàng', async () => {
    for (const action of ['lock', 'unlock']) {
      const res = await request(server())
        .post(`/platform/tenants/${ids.packageTenant}/${action}`)
        .set(as(ids.supportStaff))
        .send({});
      expect(res.status).toBe(403);
      expect(res.body.error.code).toBe(API_ERROR_CODE.MISSING_PERMISSION);
    }
    const tenant = await prisma.tenant.findUniqueOrThrow({ where: { id: ids.packageTenant } });
    expect(tenant.status).toBe(TENANT_STATUS.ACTIVE);
  });

  maybe('support KHÔNG xem lịch sử gói, KHÔNG gán hay huỷ gói', async () => {
    const base = `/platform/tenants/${ids.packageTenant}/subscriptions`;
    const attempts = [
      request(server()).get(base).set(as(ids.supportStaff)),
      request(server()).post(base).set(as(ids.supportStaff)).send({}),
      request(server()).post(`${base}/${newId()}/cancel`).set(as(ids.supportStaff)),
    ];
    for (const res of await Promise.all(attempts)) {
      expect(res.status).toBe(403);
      expect(res.body.error.code).toBe(API_ERROR_CODE.MISSING_PERMISSION);
    }
  });

  maybe('finance_admin vẫn vào được màn Gian hàng và vẫn khoá/mở khoá được', async () => {
    const list = await request(server()).get('/platform/tenants').set(as(ids.financeAdmin));
    expect(list.status).toBe(200);
    const lock = await request(server())
      .post(`/platform/tenants/${ids.otherTenant}/lock`)
      .set(as(ids.financeAdmin))
      .send({ reason: 'Kiểm thử quyền' });
    expect(lock.status).toBe(200);
    const unlock = await request(server())
      .post(`/platform/tenants/${ids.otherTenant}/unlock`)
      .set(as(ids.financeAdmin));
    expect(unlock.status).toBe(200);
  });

  maybe('platform_admin giữ toàn quyền: gian hàng, gói, phiên hỗ trợ', async () => {
    const list = await request(server()).get('/platform/tenants').set(as(ids.superAdmin));
    expect(list.status).toBe(200);
    const subs = await request(server())
      .get(`/platform/tenants/${ids.packageTenant}/subscriptions`)
      .set(as(ids.superAdmin));
    expect(subs.status).toBe(200);
    const opened = await open(
      ids.packageTenant,
      SUPPORT_MODE.ASSIST,
      ids.superAdmin,
      'ADMIN-SESSION',
    );
    expect(opened.status).toBe(201);
  });
});

describe('Bảo dưỡng: chi phí và lịch nằm ngoài phiên (lượt 2)', () => {
  const server = () => app.getHttpServer();
  const records = () => `/vehicles/${packageVehicleId}/maintenance/records`;
  let slot = 0;

  /** Phiếu CHỦ GIAN HÀNG lập: có khung giờ (giữ chỗ lịch), có KM, có chi phí. */
  async function ownerScheduledRecord() {
    slot += 1;
    const start = new Date(Date.now() + (30 + slot) * 86_400_000);
    start.setUTCHours(1, 0, 0, 0);
    const end = new Date(start.getTime() + 4 * 3_600_000);
    const res = await request(server()).post(records()).set(as(ids.owner, 'OWNER-SESSION')).send({
      type: MAINTENANCE_TYPE.OIL_CHANGE,
      title: 'Thay nhớt',
      plannedStartAt: start.toISOString(),
      plannedEndAt: end.toISOString(),
      odometerKm: 12_000,
      cost: '750000',
      receiptCode: 'PC-777',
    });
    expect(res.status).toBe(201);
    return res.body as {
      id: string;
      rowVersion: number;
      plannedStartAt: string;
      plannedEndAt: string;
    };
  }

  const occupancyOf = (recordId: string) =>
    prisma.vehicleOccupancy.findMany({
      where: { sourceId: recordId },
      select: { id: true, startAt: true, endAt: true },
    });

  maybe('chủ gian hàng vẫn lập lịch bảo dưỡng bình thường (giữ chỗ lịch xe)', async () => {
    const record = await ownerScheduledRecord();
    expect(await occupancyOf(record.id)).toHaveLength(1);
  });

  maybe('support tạo phiếu: không sinh occupancy, không thấy chi phí', async () => {
    const id = await openId(ids.packageTenant);
    const res = await request(server())
      .post(records())
      .set(inContext(id))
      .send({ type: MAINTENANCE_TYPE.OTHER, customTypeName: 'Rửa xe', notes: 'Khách nhờ' });
    expect(res.status).toBe(201);
    expect(await occupancyOf(res.body.id)).toHaveLength(0);
    expect('cost' in res.body).toBe(false);
    expect('receiptCode' in res.body).toBe(false);
  });

  maybe('support tạo phiếu có khung giờ / KM / chi phí / mã phiếu chi → từ chối', async () => {
    const id = await openId(ids.packageTenant);
    const at = new Date(Date.now() + 90 * 86_400_000).toISOString();
    for (const extra of [
      { plannedStartAt: at, plannedEndAt: at },
      { plannedStartAt: at },
      { odometerKm: 1 },
      { cost: '1' },
      { receiptCode: 'X' },
    ]) {
      const res = await request(server())
        .post(records())
        .set(inContext(id))
        .send({ type: MAINTENANCE_TYPE.OIL_CHANGE, ...extra });
      expect(res.status).toBe(403);
      expect(res.body.error.code).toBe(API_ERROR_CODE.SUPPORT_FIELD_NOT_ALLOWED);
    }
  });

  maybe('support sửa ghi chú phiếu đã có lịch: lịch, KM, chi phí giữ nguyên', async () => {
    const record = await ownerScheduledRecord();
    const before = await occupancyOf(record.id);
    const id = await openId(ids.packageTenant);
    const res = await request(server()).put(`${records()}/${record.id}`).set(inContext(id)).send({
      type: MAINTENANCE_TYPE.OIL_CHANGE,
      title: 'Thay nhớt',
      notes: 'Chủ xe dặn dùng nhớt 5W-30',
      // Lịch y hệt bản đang lưu — được chấp nhận rồi bỏ khỏi lệnh.
      plannedStartAt: record.plannedStartAt,
      plannedEndAt: record.plannedEndAt,
      expectedRowVersion: record.rowVersion,
    });
    expect(res.status).toBe(200);
    expect('cost' in res.body).toBe(false);
    expect(await occupancyOf(record.id)).toEqual(before);
    const row = await prisma.vehicleMaintenanceRecord.findUniqueOrThrow({
      where: { id: record.id },
    });
    expect(row.notes).toBe('Chủ xe dặn dùng nhớt 5W-30');
    expect(row.cost?.toFixed(0)).toBe('750000');
    expect(row.receiptCode).toBe('PC-777');
    expect(row.odometerKm).toBe(12_000);
  });

  maybe('support đổi hoặc xoá lịch, đổi KM, gửi chi phí → từ chối cả lệnh', async () => {
    const record = await ownerScheduledRecord();
    const id = await openId(ids.packageTenant);
    const shifted = new Date(new Date(record.plannedStartAt).getTime() + 3_600_000).toISOString();
    for (const extra of [
      { plannedStartAt: shifted },
      { plannedStartAt: null, plannedEndAt: null },
      { odometerKm: 99 },
      { cost: null },
      { receiptCode: 'Y' },
    ]) {
      const res = await request(server())
        .put(`${records()}/${record.id}`)
        .set(inContext(id))
        .send({
          type: MAINTENANCE_TYPE.OIL_CHANGE,
          notes: 'x',
          expectedRowVersion: record.rowVersion,
          ...extra,
        });
      expect(res.status).toBe(403);
      expect(res.body.error.code).toBe(API_ERROR_CODE.SUPPORT_FIELD_NOT_ALLOWED);
    }
    const row = await prisma.vehicleMaintenanceRecord.findUniqueOrThrow({
      where: { id: record.id },
    });
    expect(row.plannedStartAt?.toISOString()).toBe(record.plannedStartAt);
    expect(row.notes).toBeNull();
  });

  maybe('sửa chi phí phiếu đã hoàn tất vẫn bị chặn trong phiên', async () => {
    const record = await ownerScheduledRecord();
    const id = await openId(ids.packageTenant);
    const res = await request(server())
      .patch(`${records()}/${record.id}/cost`)
      .set(inContext(id))
      .send({ cost: '1', correctionReason: 'thử', expectedRowVersion: record.rowVersion });
    expect(res.status).toBe(403);
    expect(res.body.error.code).toBe(API_ERROR_CODE.SUPPORT_ACTION_NOT_ALLOWED);
  });
});

describe('Nhân viên gian hàng thiếu quyền tiền không còn xoá chi phí (lỗi cũ, lượt 2)', () => {
  const NO_COST = { canViewCost: false, canViewFiles: false };
  const WITH_COST = { canViewCost: true, canViewFiles: true };
  const service = () => app.get(MaintenanceService);

  async function seedRecord() {
    return service().createRecord(
      ids.packageTenant,
      packageVehicleId,
      ids.owner,
      { type: MAINTENANCE_TYPE.REPAIR, title: 'Sửa phanh', cost: '1200000', receiptCode: 'PC-9' },
      WITH_COST,
    );
  }

  maybe('sửa không kèm chi phí: chi phí + mã phiếu chi đang lưu giữ nguyên', async () => {
    const record = await seedRecord();
    const updated = await service().updateRecord(
      ids.packageTenant,
      packageVehicleId,
      ids.owner,
      record.id,
      {
        type: MAINTENANCE_TYPE.REPAIR,
        notes: 'Đã thay má phanh',
        expectedRowVersion: record.rowVersion,
      },
      NO_COST,
    );
    expect('cost' in updated).toBe(false);
    const row = await prisma.vehicleMaintenanceRecord.findUniqueOrThrow({
      where: { id: record.id },
    });
    expect(row.cost?.toFixed(0)).toBe('1200000');
    expect(row.receiptCode).toBe('PC-9');
  });

  maybe(
    'thiếu quyền tiền gửi `null` (app native luôn gửi): coi như vắng mặt, chi phí giữ nguyên',
    async () => {
      const record = await seedRecord();
      const updated = await service().updateRecord(
        ids.packageTenant,
        packageVehicleId,
        ids.owner,
        record.id,
        {
          type: MAINTENANCE_TYPE.REPAIR,
          notes: 'Sửa từ app',
          cost: null,
          receiptCode: null,
          expectedRowVersion: record.rowVersion,
        },
        NO_COST,
      );
      expect('cost' in updated).toBe(false);
      const row = await prisma.vehicleMaintenanceRecord.findUniqueOrThrow({
        where: { id: record.id },
      });
      expect(row.cost?.toFixed(0)).toBe('1200000');
      expect(row.receiptCode).toBe('PC-9');
    },
  );

  maybe('thiếu quyền tiền mà gửi GIÁ TRỊ chi phí/mã phiếu chi → 403, không ghi gì', async () => {
    const record = await seedRecord();
    for (const extra of [{ cost: '0' }, { cost: '999' }, { receiptCode: 'X-1' }]) {
      await expect(
        service().updateRecord(
          ids.packageTenant,
          packageVehicleId,
          ids.owner,
          record.id,
          { type: MAINTENANCE_TYPE.REPAIR, expectedRowVersion: record.rowVersion, ...extra },
          NO_COST,
        ),
      ).rejects.toMatchObject({ status: 403 });
    }
    await expect(
      service().createRecord(
        ids.packageTenant,
        packageVehicleId,
        ids.owner,
        { type: MAINTENANCE_TYPE.REPAIR, cost: '5' },
        NO_COST,
      ),
    ).rejects.toMatchObject({ status: 403 });
    const row = await prisma.vehicleMaintenanceRecord.findUniqueOrThrow({
      where: { id: record.id },
    });
    expect(row.cost?.toFixed(0)).toBe('1200000');
  });

  maybe('có quyền tiền: vẫn sửa được chi phí như cũ', async () => {
    const record = await seedRecord();
    await service().updateRecord(
      ids.packageTenant,
      packageVehicleId,
      ids.owner,
      record.id,
      { type: MAINTENANCE_TYPE.REPAIR, cost: '1300000', expectedRowVersion: record.rowVersion },
      WITH_COST,
    );
    const row = await prisma.vehicleMaintenanceRecord.findUniqueOrThrow({
      where: { id: record.id },
    });
    expect(row.cost?.toFixed(0)).toBe('1300000');
  });
});

describe('AuditService tự điền IP/UA — hành vi chung có chủ đích (lượt 2)', () => {
  const store = new SupportRequestStore();
  const audit = new AuditService(asService, store);
  const state = (ip: string) => ({
    support: null,
    capability: null,
    ipAddress: ip,
    userAgent: `ua-${ip}`,
  });
  const rowOf = (action: string) =>
    prisma.auditLog.findFirstOrThrow({ where: { action }, orderBy: { createdAt: 'desc' } });

  afterAll(async () => {
    if (dbAvailable) {
      await prisma.auditLog.deleteMany({ where: { action: { startsWith: 'test.audit.' } } });
    }
  });

  maybe('trong request: tự điền; giá trị truyền tường minh THẮNG giá trị tự suy', async () => {
    const auto = `test.audit.auto.${newId()}`;
    const explicit = `test.audit.explicit.${newId()}`;
    await store.run(state('10.1.1.1'), async () => {
      await audit.record({
        tenantId: ids.packageTenant,
        actorScope: AUDIT_ACTOR_SCOPE.TENANT,
        action: auto,
        targetType: 't',
      });
      await audit.record({
        tenantId: ids.packageTenant,
        actorScope: AUDIT_ACTOR_SCOPE.TENANT,
        action: explicit,
        targetType: 't',
        ipAddress: '9.9.9.9',
        userAgent: 'explicit-ua',
      });
    });
    const a = await rowOf(auto);
    expect([a.ipAddress, a.userAgent]).toEqual(['10.1.1.1', 'ua-10.1.1.1']);
    const e = await rowOf(explicit);
    expect([e.ipAddress, e.userAgent]).toEqual(['9.9.9.9', 'explicit-ua']);
    // Ngoài phiên hỗ trợ: phạm vi người thao tác giữ nguyên như nơi gọi khai.
    expect(a.actorScope).toBe(AUDIT_ACTOR_SCOPE.TENANT);
    expect(a.supportContextId).toBeNull();
  });

  maybe('ngoài request HTTP (job/system): IP/UA null, không dùng ngữ cảnh cũ', async () => {
    await store.run(state('10.2.2.2'), async () => undefined);
    const action = `test.audit.job.${newId()}`;
    await audit.record({ actorScope: AUDIT_ACTOR_SCOPE.SYSTEM, action, targetType: 'job' });
    const row = await rowOf(action);
    expect([row.ipAddress, row.userAgent]).toEqual([null, null]);
  });

  maybe('hai request chạy xen nhau không rò ngữ cảnh sang nhau', async () => {
    const a = `test.audit.a.${newId()}`;
    const b = `test.audit.b.${newId()}`;
    const tick = () => new Promise((resolve) => setTimeout(resolve, 5));
    await Promise.all([
      store.run(state('10.3.3.3'), async () => {
        await tick();
        await audit.record({ actorScope: AUDIT_ACTOR_SCOPE.SYSTEM, action: a, targetType: 'x' });
      }),
      store.run(state('10.4.4.4'), async () => {
        await audit.record({ actorScope: AUDIT_ACTOR_SCOPE.SYSTEM, action: b, targetType: 'x' });
        await tick();
      }),
    ]);
    expect((await rowOf(a)).ipAddress).toBe('10.3.3.3');
    expect((await rowOf(b)).ipAddress).toBe('10.4.4.4');
  });
});

describe('Sau review lượt 2: chứng từ bảo dưỡng trong phiên', () => {
  const server = () => app.getHttpServer();

  maybe(
    'phiên không gỡ được chứng từ đang có của phiếu (attachmentFileIds thiếu file)',
    async () => {
      const record = await app
        .get(MaintenanceService)
        .createRecord(
          ids.packageTenant,
          packageVehicleId,
          ids.owner,
          { type: MAINTENANCE_TYPE.REPAIR, title: 'Có chứng từ' },
          { canViewCost: true, canViewFiles: true },
        );
      const fileId = newId();
      await prisma.vehiclePrivateFile.create({
        data: {
          id: fileId,
          tenantId: ids.packageTenant,
          vehicleId: packageVehicleId,
          purpose: PRIVATE_FILE_PURPOSE.MAINTENANCE_RECORD,
          objectKey: `tenants/${ids.packageTenant}/vehicles/${packageVehicleId}/maintenance/${record.id}/${fileId}.pdf`,
          originalName: 'hoa-don.pdf',
          mimeType: 'application/pdf',
          sizeBytes: 100,
          status: PRIVATE_FILE_STATUS.READY,
        },
      });
      await prisma.vehicleMaintenanceAttachment.create({
        data: {
          id: newId(),
          tenantId: ids.packageTenant,
          vehicleId: packageVehicleId,
          recordId: record.id,
          privateFileId: fileId,
        },
      });
      const id = await openId(ids.packageTenant);
      const res = await request(server())
        .put(`/vehicles/${packageVehicleId}/maintenance/records/${record.id}`)
        .set(inContext(id))
        .send({
          type: MAINTENANCE_TYPE.REPAIR,
          attachmentFileIds: [],
          expectedRowVersion: record.rowVersion,
        });
      expect(res.status).toBe(403);
      expect(res.body.error.code).toBe(API_ERROR_CODE.SUPPORT_FIELD_NOT_ALLOWED);
      expect(
        await prisma.vehicleMaintenanceAttachment.count({ where: { privateFileId: fileId } }),
      ).toBe(1);

      // …và không mở được chứng từ đó (hoá đơn = dữ liệu chi phí).
      const download = await request(server())
        .get(
          `/vehicles/${packageVehicleId}/maintenance/records/${record.id}/attachments/${fileId}/download`,
        )
        .set(inContext(id));
      expect(download.status).toBe(403);
      expect(download.body.error.code).toBe(API_ERROR_CODE.SUPPORT_ACTION_NOT_ALLOWED);
    },
  );
});

describe('Đợt 2A — màn đọc của gian hàng trong phiên', () => {
  const server = () => app.getHttpServer();
  let customerId: string;

  beforeAll(async () => {
    if (!dbAvailable) return;
    customerId = newId();
    await prisma.tenantCustomer.create({
      data: {
        id: customerId,
        tenantId: ids.packageTenant,
        fullName: 'Nguyễn Văn Khách',
        phone: '0912345678',
        normalizedPhone: '84912345678',
        email: 'khach.that@example.com',
        address: '12 Ngõ Riêng Tư, Hà Nội',
        riskLevel: TENANT_CUSTOMER_RISK_LEVEL.WATCHLIST,
        riskReason: 'Từng trả xe trễ, lời bình nội bộ',
      },
    });
  });

  maybe(
    'Full Manage: sổ khách đọc được, liên hệ bị CHE, địa chỉ nhà + công nợ bị lược',
    async () => {
      const id = await openId(ids.packageTenant, SUPPORT_MODE.VIEW);
      const list = await request(server()).get('/customers').set(inContext(id));
      expect(list.status).toBe(200);
      const row = (list.body.items ?? list.body.data ?? []).find(
        (c: { id: string }) => c.id === customerId,
      );
      expect(row.fullName).toBe('Nguyễn Văn Khách');
      expect(row.phone).not.toContain('2345');
      expect(row.email).not.toBe('khach.that@example.com');

      const detail = await request(server()).get(`/customers/${customerId}`).set(inContext(id));
      expect(detail.status).toBe(200);
      expect(detail.body.phone).not.toContain('2345');
      expect(detail.body.normalizedPhone).not.toContain('2345');
      expect(detail.body.address).toBeNull();
      // Lời bình rủi ro là sổ riêng của gian hàng; nhãn mức rủi ro vẫn hiện.
      expect(detail.body.riskReason).toBeNull();
      expect(detail.body.riskLevel).toBe(TENANT_CUSTOMER_RISK_LEVEL.WATCHLIST);

      const summary = await request(server()).get('/customers/summary').set(inContext(id));
      expect(summary.status).toBe(200);
      expect(summary.body.totalDebt ?? null).toBeNull();
    },
  );

  maybe(
    'chính gian hàng (ngoài phiên) vẫn thấy liên hệ đầy đủ — việc che chỉ áp cho phiên',
    async () => {
      const res = await request(server())
        .get(`/customers/${customerId}`)
        .set(as(ids.owner, 'OWNER-SESSION'));
      expect(res.status).toBe(200);
      expect(res.body.phone).toBe('0912345678');
      expect(res.body.address).toBe('12 Ngõ Riêng Tư, Hà Nội');
    },
  );

  maybe(
    'tìm kiếm không dò ngược được phần đã che: SĐT/email chỉ khớp NGUYÊN VĂN trong phiên',
    async () => {
      const id = await openId(ids.packageTenant, SUPPORT_MODE.VIEW);
      const hits = async (q: string) => {
        const res = await request(server()).get('/customers').query({ q }).set(inContext(id));
        expect(res.status).toBe(200);
        return (res.body.items ?? res.body.data ?? []).some((c: { id: string }) => c.id === customerId);
      };
      // Tiền tố/đoạn giữa của SĐT, đoạn email: không khớp — không có "oracle".
      expect(await hits('091234')).toBe(false);
      expect(await hits('2345')).toBe(false);
      expect(await hits('khach.th')).toBe(false);
      // Khách đọc đủ số / đủ email: vẫn tìm được. Tên vẫn tìm gần đúng.
      expect(await hits('0912345678')).toBe(true);
      expect(await hits('+84 912 345 678')).toBe(true);
      expect(await hits('KHACH.THAT@example.com')).toBe(true);
      expect(await hits('Văn Khách')).toBe(true);

      // Ngoài phiên: ô tìm kiếm của chính gian hàng vẫn tìm gần đúng như cũ.
      const own = await request(server())
        .get('/customers')
        .query({ q: '091234' })
        .set(as(ids.owner, 'OWNER-SESSION'));
      expect((own.body.items ?? own.body.data ?? []).some((c: { id: string }) => c.id === customerId)).toBe(true);
    },
  );

  maybe('ghi chú khách, giấy tờ + file giấy tờ khách: 403 trong phiên', async () => {
    const id = await openId(ids.packageTenant, SUPPORT_MODE.VIEW);
    for (const path of [
      `/customers/${customerId}/notes`,
      `/customers/${customerId}/documents`,
      `/customers/${customerId}/documents/${newId()}/download`,
    ]) {
      const res = await request(server()).get(path).set(inContext(id));
      expect(res.status).toBe(403);
      expect(res.body.error.code).toBe(API_ERROR_CODE.SUPPORT_ACTION_NOT_ALLOWED);
    }
  });

  maybe('tài chính, công nợ, quyết toán/cọc: 403 trong phiên dù gõ tay URL', async () => {
    const id = await openId(ids.packageTenant, SUPPORT_MODE.VIEW);
    for (const path of [
      '/finance/summary',
      '/finance/series',
      '/debts',
      `/bookings/${newId()}/settlement`,
    ]) {
      const res = await request(server()).get(path).set(inContext(id));
      expect(res.status).toBe(403);
      expect(res.body.error.code).toBe(API_ERROR_CODE.SUPPORT_ACTION_NOT_ALLOWED);
    }
  });

  maybe('Owner Lite: KHÔNG có sổ khách (capability không cấp cho tuyến hoa hồng)', async () => {
    const id = await openId(ids.liteTenant, SUPPORT_MODE.VIEW);
    const res = await request(server()).get('/customers').set(inContext(id));
    expect(res.status).toBe(403);
    expect(res.body.error.code).toBe(API_ERROR_CODE.SUPPORT_ACTION_NOT_ALLOWED);
    expect(res.body.error.details.capability).toBe(SUPPORT_CAPABILITY.CUSTOMER_VIEW_MASKED);
  });

  maybe('cổng cờ gói: gian hàng không có cờ MEMBERS thì phiên không mở thành viên', async () => {
    // Gói fixture của gian hàng tuyến gói chỉ bật MAINTENANCE.
    const opened = await open(ids.packageTenant, SUPPORT_MODE.VIEW);
    expect(opened.body.capabilities).not.toContain(SUPPORT_CAPABILITY.MEMBER_VIEW);
    expect(opened.body.capabilities).not.toContain(SUPPORT_CAPABILITY.DRIVER_VIEW);
    expect(opened.body.capabilities).toContain(SUPPORT_CAPABILITY.MAINTENANCE_VIEW);
    const res = await request(server()).get('/members').set(inContext(opened.body.id));
    expect(res.status).toBe(403);
    expect(res.body.error.code).toBe(API_ERROR_CODE.SUPPORT_ACTION_NOT_ALLOWED);
  });

  maybe('phiên đã thoát: mọi màn đọc mới đều 403 ngay', async () => {
    const id = await openId(ids.packageTenant, SUPPORT_MODE.VIEW);
    await request(server())
      .post(`/platform/tenant-support/contexts/${id}/revoke`)
      .set(as(ids.adminA));
    for (const path of ['/customers', '/vehicles', `/customers/${customerId}`]) {
      const res = await request(server()).get(path).set(inContext(id));
      expect(res.status).toBe(403);
      expect(res.body.error.code).toBe(API_ERROR_CODE.SUPPORT_CONTEXT_EXPIRED);
    }
  });
});

describe('maskSupportPayload (hàm thuần)', () => {
  it('che SĐT/email/số định danh ở mọi độ sâu, giữ nguyên shape', () => {
    const out = maskSupportPayload(
      {
        customerPhone: '0912345678',
        customerEmail: 'abc.def@example.com',
        nested: [{ phone: '0987654321', idNo: '079123456789', licenseNo: 'B2-123456' }],
        owner: { email: 'owner@shop.vn', taxCode: '0108987654' },
        name: 'Giữ nguyên',
        count: 3,
        empty: null,
      },
      { customerScope: false },
    ) as Record<string, any>; // eslint-disable-line @typescript-eslint/no-explicit-any -- đọc lại shape tự do trong test
    expect(out.customerPhone).not.toContain('2345');
    expect(out.customerEmail).not.toBe('abc.def@example.com');
    expect(out.nested[0].phone).not.toContain('7654');
    expect(out.nested[0].idNo).toBe('**********89');
    expect(out.nested[0].licenseNo.endsWith('56')).toBe(true);
    expect(out.owner.taxCode).toBe('********54');
    expect(out.name).toBe('Giữ nguyên');
    expect(out.count).toBe(3);
    expect(out.empty).toBeNull();
  });

  it('địa chỉ/công nợ chỉ bị lược trong phạm vi sổ khách', () => {
    const body = { address: '12 Ngõ A', totalDebt: '500000' };
    expect(maskSupportPayload(body, { customerScope: false })).toEqual(body);
    expect(maskSupportPayload(body, { customerScope: true })).toEqual({
      address: null,
      totalDebt: null,
    });
  });

  it('không đi vào Decimal/Date — tiền vẫn là Decimal để ResponseInterceptor ép về chuỗi', () => {
    const price = new Prisma.Decimal('850000.00');
    const at = new Date('2026-09-25T00:00:00Z');
    const out = maskSupportPayload({ weekdayPrice: price, at }, { customerScope: false }) as {
      weekdayPrice: unknown;
      at: unknown;
    };
    expect(out.weekdayPrice).toBe(price);
    expect(out.at).toBe(at);
  });
});

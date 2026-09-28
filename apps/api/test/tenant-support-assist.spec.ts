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
  BOOKING_REQUEST_STATUS,
  MEMBERSHIP_STATUS,
  PERMISSION,
  PLAN_FEATURE,
  PLATFORM_ROLE,
  SERVICE_TYPE,
  SHOP_ONBOARDING_STATE,
  SUPPORT_CAPABILITY,
  SUPPORT_CONTEXT_HEADER,
  SUPPORT_MODE,
  SUPPORT_REASON_HEADER,
  SUPPORT_WRITE_CAPABILITIES,
  TENANT_ROLE,
  TENANT_STATUS,
  VEHICLE_BLOCK_REASON,
  VEHICLE_DOCUMENT_TYPE,
  VEHICLE_PUBLIC_STATUS,
  VEHICLE_TYPE,
  VEHICLE_OPERATION_STATUS,
} from '@xeprime/types';
import request from 'supertest';
import { createValidationPipe } from '../src/bootstrap';
import { TenantScoped } from '../src/common/decorators';
import { AllExceptionsFilter } from '../src/common/filters/all-exceptions.filter';
import { PermissionGuard } from '../src/common/guards/permission.guard';
import { PlanFeatureGuard } from '../src/common/guards/plan-feature.guard';
import { PlatformScopeGuard } from '../src/common/guards/platform-scope.guard';
import { ShopOwnerGuard } from '../src/common/guards/shop-owner.guard';
import { SubscriptionTrackGuard } from '../src/common/guards/subscription-track.guard';
import { TenantScopeGuard } from '../src/common/guards/tenant-scope.guard';
import { SupportMaskInterceptor } from '../src/common/support/support-mask.interceptor';
import { SupportRequestStore } from '../src/common/support/support-request.store';
import type { RequestContext } from '../src/common/types/request-context';
import { AuditService } from '../src/modules/audit/audit.service';
import { BillingService } from '../src/modules/billing/billing.service';
import { BranchesController } from '../src/modules/branches/branches.controller';
import { BranchesService } from '../src/modules/branches/branches.service';
import { OccupancyService } from '../src/modules/calendar/occupancy.service';
import { VehicleBlocksController } from '../src/modules/calendar/vehicle-blocks.controller';
import { VehicleBlocksService } from '../src/modules/calendar/vehicle-blocks.service';
import { FeePoliciesService } from '../src/modules/fee-policies/fee-policies.service';
import { MembersController } from '../src/modules/members/members.controller';
import { MembersService } from '../src/modules/members/members.service';
import { RbacService } from '../src/modules/rbac/rbac.service';
import { R2Service } from '../src/modules/storage/r2.service';
import { StorageController } from '../src/modules/storage/storage.controller';
import { TenantSupportController } from '../src/modules/tenant-support/tenant-support.controller';
import { TenantSupportService } from '../src/modules/tenant-support/tenant-support.service';
import { TenantsController } from '../src/modules/tenants/tenants.controller';
import { TenantsService } from '../src/modules/tenants/tenants.service';
import { VehicleSettingsController } from '../src/modules/vehicle-settings/vehicle-settings.controller';
import { VehicleSettingsService } from '../src/modules/vehicle-settings/vehicle-settings.service';
import { VehicleTripHistoryService } from '../src/modules/vehicle-settings/vehicle-trip-history.service';
import { VEHICLE_DOCUMENT_OCR_PROVIDER } from '../src/modules/vehicles/documents/ocr-provider';
import { VehicleDocumentsController } from '../src/modules/vehicles/documents/vehicle-documents.controller';
import { VehicleDocumentsService } from '../src/modules/vehicles/documents/vehicle-documents.service';
import { VehicleAlertsService } from '../src/modules/vehicles/vehicle-alerts.service';
import { VehicleContractsService } from '../src/modules/vehicles/vehicle-contracts.service';
import { VehicleSourceService } from '../src/modules/vehicles/vehicle-source.service';
import { VehiclesController } from '../src/modules/vehicles/vehicles.controller';
import { VehiclesService } from '../src/modules/vehicles/vehicles.service';
import type { PrismaService } from '../src/prisma/prisma.service';
import { PrismaService as PrismaServiceToken } from '../src/prisma/prisma.service';
import { giveTenantPlan } from './helpers/billing-fixture';
import {
  makeBillingService,
  makeBranchesService,
  makeTenantsService,
  makeVehiclesService,
  seedBranch,
  vehicleCreator,
} from './helpers/service-factory';

/**
 * Phiên hỗ trợ gian hàng — Đợt 2B: capability GHI hẹp (ADR 0050 §13).
 *
 * Chạy qua BỘ GUARD THẬT trên Postgres thật (cùng khung với `tenant-support.spec.ts`); chỉ phần xác
 * thực là giả. Với mỗi capability, khoá: không có capability → 403 · chế độ xem không ghi · tenant A
 * không chạm tenant B · trường ngoài danh sách bị từ chối · phiên đã thoát bị từ chối · gian hàng
 * khoá rơi về chỉ đọc · cổng gói vẫn chạy · audit đúng người/phiên/lý do/before-after · chủ xe
 * (ngoài phiên) không đổi gì.
 */

const prisma = createPrismaClient();
const asService = prisma as unknown as PrismaService;
const CDN = 'https://cdn.test';
const SESSION = 'SESSION-2B';
const REASON = 'Chủ xe gọi hotline 14h nhờ làm hộ — ticket #5521';

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
        sessionId: String(req.headers['x-test-session'] ?? SESSION),
      };
    }
    return true;
  }
}

@Controller('probe-2b')
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
    const key = `${params.prefix}/${newId()}-${params.fileName}`;
    return { key, uploadUrl: `https://r2.local/put/${key}`, publicUrl: `${CDN}/${key}`, expiresIn: 300 };
  },
  async presignPrivateUpload() {
    return { uploadUrl: 'https://r2.local/put', expiresIn: 300 };
  },
  async headPrivateObject() {
    return null;
  },
};

let dbAvailable = false;
let app: INestApplication;

const ids = {
  admin: newId(),
  viewer: newId(),
  owner: newId(),
  liteOwner: newId(),
  otherOwner: newId(),
  packageTenant: newId(),
  liteTenant: newId(),
  otherTenant: newId(),
  assistRole: newId(),
  viewRole: newId(),
};
let vehicleId: string;
let liteVehicleId: string;
let otherVehicleId: string;
let defaultBranchId: string;
let secondBranchId: string;
let noProvinceBranchId: string;
let otherBranchId: string;

function as(userId: string, session = SESSION) {
  return { 'x-test-user': userId, 'x-test-session': session };
}
function inContext(contextId: string, reason?: string, actor = ids.admin) {
  return {
    ...as(actor),
    [SUPPORT_CONTEXT_HEADER]: contextId,
    ...(reason ? { [SUPPORT_REASON_HEADER]: encodeURIComponent(reason) } : {}),
  };
}
const server = () => app.getHttpServer();

beforeAll(async () => {
  try {
    await prisma.$connect();
    await prisma.$queryRaw`SELECT 1`;
    dbAvailable = true;
  } catch {
    console.warn('\n[skip] Không kết nối được PostgreSQL.\n');
    return;
  }

  for (const [id, name] of [
    [ids.admin, 'Hỗ trợ 2B'],
    [ids.viewer, 'Hỗ trợ chỉ xem 2B'],
    [ids.owner, 'Chủ gian hàng 2B'],
    [ids.liteOwner, 'Chủ xe hoa hồng 2B'],
    [ids.otherOwner, 'Chủ gian hàng khác 2B'],
  ] as const) {
    await prisma.user.create({ data: { id, displayName: name, email: `ts2b-${id}@xeprime.test` } });
  }

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
        key: `ts2b-${roleId}`,
        name: 'Vai hỗ trợ 2B',
        permissions: { create: perms.map((permissionId) => ({ permissionId })) },
      },
    });
  }
  for (const [userId, roleId] of [
    [ids.admin, ids.assistRole],
    [ids.viewer, ids.viewRole],
  ] as const) {
    await prisma.platformMembership.create({
      data: { id: newId(), userId, roleKey: PLATFORM_ROLE.SUPPORT, roleId, status: MEMBERSHIP_STATUS.ACTIVE },
    });
  }

  const makeTenant = async (id: string, ownerUserId: string, onboardingState: string) => {
    await prisma.tenant.create({
      data: {
        id,
        code: `T2B-${id.slice(-8)}`,
        slug: `t2b-${id.toLowerCase().slice(-10)}`,
        name: `Gian hàng 2B ${id.slice(-4)}`,
        status: TENANT_STATUS.ACTIVE,
        ownerUserId,
        onboardingState,
      },
    });
    await prisma.tenantMembership.create({
      data: { id: newId(), tenantId: id, userId: ownerUserId, roleKey: TENANT_ROLE.SHOP_OWNER, status: MEMBERSHIP_STATUS.ACTIVE },
    });
  };
  await makeTenant(ids.packageTenant, ids.owner, SHOP_ONBOARDING_STATE.PACKAGE_ACTIVE);
  await giveTenantPlan(prisma, ids.packageTenant, {
    billingMode: BILLING_MODE.PACKAGE,
    features: [PLAN_FEATURE.MAINTENANCE, PLAN_FEATURE.BRANCHES],
  });
  await makeTenant(ids.liteTenant, ids.liteOwner, SHOP_ONBOARDING_STATE.COMMISSION);
  await giveTenantPlan(prisma, ids.liteTenant, { billingMode: BILLING_MODE.COMMISSION });
  await makeTenant(ids.otherTenant, ids.otherOwner, SHOP_ONBOARDING_STATE.PACKAGE_ACTIVE);
  await giveTenantPlan(prisma, ids.otherTenant, {
    billingMode: BILLING_MODE.PACKAGE,
    features: [PLAN_FEATURE.BRANCHES],
  });

  const createVehicle = vehicleCreator(makeVehiclesService(asService), asService);
  const vehicle = (tenantId: string, userId: string, code: string) =>
    createVehicle(tenantId, userId, {
      code,
      name: 'Toyota Vios 2B',
      vehicleType: VEHICLE_TYPE.CAR,
      plateNumber: `51B-${code.slice(-3)}.67`,
      weekdayPrice: '600000',
      serviceTypes: [SERVICE_TYPE.SELF_DRIVE, SERVICE_TYPE.WITH_DRIVER],
      withDriverDailyPrice: '900000',
    });
  vehicleId = (await vehicle(ids.packageTenant, ids.owner, 'T2B-001')).id;
  liteVehicleId = (await vehicle(ids.liteTenant, ids.liteOwner, 'T2B-002')).id;
  otherVehicleId = (await vehicle(ids.otherTenant, ids.otherOwner, 'T2B-003')).id;
  defaultBranchId = (await prisma.vehicle.findUniqueOrThrow({ where: { id: vehicleId } })).branchId!;
  secondBranchId = await seedBranch(asService, { tenantId: ids.packageTenant, provinceCode: '01', isDefault: false });
  noProvinceBranchId = newId();
  await prisma.tenantBranch.create({
    data: {
      id: noProvinceBranchId,
      tenantId: ids.packageTenant,
      code: 'CN99',
      name: 'Chi nhánh chưa có địa chỉ',
      isDefault: false,
      status: 'active',
    },
  });
  otherBranchId = (await prisma.vehicle.findUniqueOrThrow({ where: { id: otherVehicleId } })).branchId!;

  const store = new SupportRequestStore();
  const config = new ConfigService({ R2_PUBLIC_BASE_URL: CDN, PLAN_FEATURE_ENFORCEMENT: 'on' });
  const audit = new AuditService(asService, store);
  const vehicles = makeVehiclesService(asService, { config });
  const files = new VehicleContractsService(asService, fakeR2 as unknown as R2Service, audit);
  const occupancy = new OccupancyService(asService);

  const moduleRef = await Test.createTestingModule({
    controllers: [
      TenantSupportController,
      VehiclesController,
      VehicleDocumentsController,
      VehicleBlocksController,
      VehicleSettingsController,
      BranchesController,
      TenantsController,
      StorageController,
      MembersController,
      ProbeController,
    ],
    providers: [
      Reflector,
      { provide: PrismaServiceToken, useValue: asService },
      { provide: ConfigService, useValue: config },
      { provide: SupportRequestStore, useValue: store },
      { provide: AuditService, useValue: audit },
      { provide: RbacService, useValue: new RbacService(asService) },
      TenantSupportService,
      { provide: FeePoliciesService, useValue: new FeePoliciesService(asService, audit) },
      { provide: VehiclesService, useValue: vehicles },
      { provide: VehicleSourceService, useValue: {} },
      { provide: VehicleContractsService, useValue: files },
      { provide: VehicleAlertsService, useValue: {} },
      {
        provide: VehicleDocumentsService,
        useValue: new VehicleDocumentsService(asService, files, vehicles, audit, {} as never),
      },
      { provide: VEHICLE_DOCUMENT_OCR_PROVIDER, useValue: {} },
      { provide: VehicleBlocksService, useValue: new VehicleBlocksService(asService, occupancy, audit) },
      { provide: VehicleSettingsService, useValue: new VehicleSettingsService(asService, audit, occupancy) },
      { provide: VehicleTripHistoryService, useValue: {} },
      { provide: BranchesService, useValue: makeBranchesService(asService) },
      { provide: TenantsService, useValue: makeTenantsService(asService) },
      { provide: BillingService, useValue: makeBillingService(asService) },
      { provide: R2Service, useValue: fakeR2 },
      { provide: MembersService, useValue: {} },
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
  app.use((req: RequestContext, _res: unknown, next: () => void) =>
    store.run({ support: null, capability: null, reason: null, ipAddress: '10.0.0.7', userAgent: 'jest-2b' }, next),
  );
  app.useGlobalPipes(createValidationPipe());
  app.useGlobalFilters(new AllExceptionsFilter(false));
  await app.init();
}, 90_000);

afterAll(async () => {
  await app?.close();
  if (dbAvailable) {
    const tenantIds = [ids.packageTenant, ids.liteTenant, ids.otherTenant];
    const userIds = [ids.admin, ids.viewer, ids.owner, ids.liteOwner, ids.otherOwner];
    await prisma.auditLog.deleteMany({
      where: { OR: [{ tenantId: { in: tenantIds } }, { actorUserId: { in: userIds } }] },
    });
    await prisma.vehicleBlock.deleteMany({ where: { tenantId: { in: tenantIds } } });
    await prisma.vehicleOccupancy.deleteMany({ where: { tenantId: { in: tenantIds } } });
    await prisma.approvalTask.deleteMany({ where: { tenantId: { in: tenantIds } } });
    await prisma.tenantSupportContext.deleteMany({ where: { tenantId: { in: tenantIds } } });
    await prisma.bookingRequest.deleteMany({ where: { tenantId: { in: tenantIds } } });
    await prisma.vehicleDocument.deleteMany({ where: { tenantId: { in: tenantIds } } });
    await prisma.publicListing.deleteMany({ where: { tenantId: { in: tenantIds } } });
    await prisma.vehicle.deleteMany({ where: { tenantId: { in: tenantIds } } });
    await prisma.tenantBranch.deleteMany({ where: { tenantId: { in: tenantIds } } });
    await prisma.tenantProfile.deleteMany({ where: { tenantId: { in: tenantIds } } });
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

async function openContext(
  tenantId: string,
  mode: string = SUPPORT_MODE.ASSIST,
  actor: string = ids.admin,
): Promise<{ id: string; capabilities: string[]; permissions: string[] }> {
  const res = await request(server())
    .post('/platform/tenant-support/contexts')
    .set(as(actor))
    .send({ tenantId, mode, reason: 'Chủ xe nhờ nhập xe và giấy tờ — ticket #5521' });
  expect(res.status).toBe(201);
  return { id: res.body.id, capabilities: res.body.capabilities, permissions: res.body.permissions };
}

async function lastAudit(action: string) {
  return prisma.auditLog.findFirstOrThrow({ where: { action }, orderBy: { createdAt: 'desc' } });
}

// ── Bảng thao tác: mỗi dòng một capability GHI mức trung bình/cao ────────────────────────────

interface Action {
  name: string;
  capability: string;
  method: 'post' | 'patch' | 'put';
  path: () => string;
  body: () => Record<string, unknown>;
}

const ACTIONS: Action[] = [
  {
    name: 'tạo xe nháp',
    capability: SUPPORT_CAPABILITY.VEHICLE_CREATE_DRAFT,
    method: 'post',
    path: () => '/vehicles',
    body: () => ({ name: 'Xe tạo hộ', vehicleType: VEHICLE_TYPE.CAR, branchId: defaultBranchId }),
  },
  {
    name: 'thêm giấy tờ',
    capability: SUPPORT_CAPABILITY.VEHICLE_DOCUMENT_MANAGE,
    method: 'post',
    path: () => `/vehicles/${vehicleId}/documents`,
    body: () => ({ type: VEHICLE_DOCUMENT_TYPE.INSURANCE, expiresAt: '2027-12-31' }),
  },
  {
    name: 'khung giờ giao nhận',
    capability: SUPPORT_CAPABILITY.VEHICLE_OPERATIONS_UPDATE,
    method: 'put',
    path: () => `/vehicles/${vehicleId}/operation-settings`,
    body: () => ({ turnaroundBufferMinutes: 60, pickupWindows: [], returnWindows: [] }),
  },
  {
    name: 'khoá lịch',
    capability: SUPPORT_CAPABILITY.VEHICLE_SCHEDULE_BLOCK_MANAGE,
    method: 'post',
    path: () => '/vehicle-blocks',
    body: () => ({
      vehicleId,
      startAt: new Date(Date.now() + 40 * 86400_000).toISOString(),
      endAt: new Date(Date.now() + 41 * 86400_000).toISOString(),
      reason: VEHICLE_BLOCK_REASON.INTERNAL_USE,
    }),
  },
  {
    name: 'tạo chi nhánh',
    capability: SUPPORT_CAPABILITY.BRANCH_BASIC_MANAGE,
    method: 'post',
    path: () => '/branches',
    body: () => ({ name: 'Chi nhánh Thủ Đức', provinceCode: '79' }),
  },
  {
    name: 'gửi duyệt',
    capability: SUPPORT_CAPABILITY.VEHICLE_SUBMIT_REVIEW,
    method: 'post',
    path: () => `/vehicles/${otherVehicleId}/submit-public`,
    body: () => ({}),
  },
];

describe('Bảng capability 2B — mọi thao tác', () => {
  maybe('phiên assist của gian hàng gói có ĐỦ capability 2B; phiên xem không có cái nào', async () => {
    const assist = await openContext(ids.packageTenant);
    for (const action of ACTIONS) expect(assist.capabilities).toContain(action.capability);
    expect(assist.capabilities).toContain(SUPPORT_CAPABILITY.VEHICLE_BRANCH_REASSIGN);
    expect(assist.capabilities).toContain(SUPPORT_CAPABILITY.LISTING_REPAIR);
    const view = await openContext(ids.packageTenant, SUPPORT_MODE.VIEW);
    for (const action of ACTIONS) expect(view.capabilities).not.toContain(action.capability);
  });

  for (const action of ACTIONS) {
    maybe(`${action.name}: chế độ xem → 403, không ghi`, async () => {
      const { id } = await openContext(ids.packageTenant, SUPPORT_MODE.VIEW);
      const res = await request(server())[action.method](action.path()).set(inContext(id, REASON)).send(action.body());
      expect(res.status).toBe(403);
      expect(res.body.error.code).toBe(API_ERROR_CODE.SUPPORT_ACTION_NOT_ALLOWED);
    });

    maybe(`${action.name}: thiếu lý do riêng → 428; lý do chung chung → 428`, async () => {
      const { id } = await openContext(ids.packageTenant);
      const missing = await request(server())[action.method](action.path()).set(inContext(id)).send(action.body());
      expect(missing.status).toBe(428);
      expect(missing.body.error.code).toBe(API_ERROR_CODE.SUPPORT_REASON_REQUIRED);
      expect(missing.body.error.details.invalid).toBe(false);
      const generic = await request(server())[action.method](action.path()).set(inContext(id, 'hỗ trợ theo yêu cầu')).send(action.body());
      expect(generic.status).toBe(428);
      expect(generic.body.error.details.invalid).toBe(true);
    });

    maybe(`${action.name}: phiên đã thoát → 403 EXPIRED`, async () => {
      const { id } = await openContext(ids.packageTenant);
      await request(server()).post(`/platform/tenant-support/contexts/${id}/revoke`).set(as(ids.admin));
      const res = await request(server())[action.method](action.path()).set(inContext(id, REASON)).send(action.body());
      expect(res.status).toBe(403);
      expect(res.body.error.code).toBe(API_ERROR_CODE.SUPPORT_CONTEXT_EXPIRED);
    });
  }

  maybe('gian hàng bị khoá: mọi capability 2B rơi, còn đọc', async () => {
    const { id } = await openContext(ids.packageTenant);
    await prisma.tenant.update({ where: { id: ids.packageTenant }, data: { status: TENANT_STATUS.SUSPENDED } });
    try {
      for (const action of ACTIONS) {
        const res = await request(server())[action.method](action.path()).set(inContext(id, REASON)).send(action.body());
        expect(res.status).toBe(403);
        expect(res.body.error.code).toBe(API_ERROR_CODE.SUPPORT_ACTION_NOT_ALLOWED);
      }
    } finally {
      await prisma.tenant.update({ where: { id: ids.packageTenant }, data: { status: TENANT_STATUS.ACTIVE } });
    }
  });

  maybe('Owner Lite: không tạo xe nháp, không chuyển chi nhánh, không quản lý chi nhánh (cổng tuyến/gói)', async () => {
    const { capabilities } = await openContext(ids.liteTenant);
    expect(capabilities).not.toContain(SUPPORT_CAPABILITY.VEHICLE_CREATE_DRAFT);
    expect(capabilities).not.toContain(SUPPORT_CAPABILITY.VEHICLE_BRANCH_REASSIGN);
    expect(capabilities).not.toContain(SUPPORT_CAPABILITY.BRANCH_BASIC_MANAGE);
    expect(capabilities).not.toContain(SUPPORT_CAPABILITY.MAINTENANCE_MANAGE);
    // Việc trên chiếc xe thì có ở cả hai bộ.
    expect(capabilities).toContain(SUPPORT_CAPABILITY.VEHICLE_DOCUMENT_MANAGE);
  });

  maybe('lý do MỞ phiên chung chung ("hỗ trợ", "admin sửa", "theo yêu cầu") → 400', async () => {
    for (const reason of ['hỗ trợ theo yêu cầu', 'admin sửa giúp chủ xe']) {
      const res = await request(server())
        .post('/platform/tenant-support/contexts')
        .set(as(ids.admin))
        .send({ tenantId: ids.packageTenant, mode: SUPPORT_MODE.ASSIST, reason });
      expect(res.status).toBe(400);
      expect(res.body.error.details.field).toBe('reason');
    }
  });

  maybe('không có capability "toàn quyền" nào trong phiên', async () => {
    const { capabilities } = await openContext(ids.packageTenant);
    for (const forbidden of ['act_as_owner', 'full_tenant_access', 'all_write', 'bypass_validation', 'shop_owner_mode']) {
      expect(capabilities).not.toContain(forbidden);
    }
  });
});

describe('Tạo xe nháp', () => {
  maybe('chỉ tạo NHÁP: không giá, không lên chợ, không gửi duyệt; audit toàn bộ dữ liệu ban đầu', async () => {
    const { id } = await openContext(ids.packageTenant);
    const res = await request(server())
      .post('/vehicles')
      .set(inContext(id, REASON))
      .send({ name: 'Honda City tạo hộ', vehicleType: VEHICLE_TYPE.CAR, branchId: defaultBranchId, weekdayPrice: null });
    expect(res.status).toBe(201);
    const row = await prisma.vehicle.findUniqueOrThrow({ where: { id: res.body.id } });
    expect(row.publicStatus).toBe(VEHICLE_PUBLIC_STATUS.DRAFT);
    expect(row.marketplaceEnabled).toBe(false);
    expect(row.weekdayPrice).toBeNull();
    expect(await prisma.approvalTask.count({ where: { tenantId: ids.packageTenant, submittedBy: ids.admin, createdAt: { gte: row.createdAt } } })).toBe(0);

    const audit = await lastAudit('vehicle.support.create_draft');
    expect(audit.actorScope).toBe(AUDIT_ACTOR_SCOPE.PLATFORM);
    expect(audit.actorUserId).toBe(ids.admin);
    expect(audit.supportContextId).toBe(id);
    expect(audit.supportCapability).toContain(SUPPORT_CAPABILITY.VEHICLE_CREATE_DRAFT);
    expect(audit.supportReason).toBe(REASON);
    expect((audit.afterJson as Record<string, unknown>).name).toBe('Honda City tạo hộ');
  });

  maybe('trường giá / giảm giá / nguồn xe mang giá trị → 403 cả lệnh', async () => {
    const { id } = await openContext(ids.packageTenant);
    for (const extra of [{ weekdayPrice: '500000' }, { discountPercent: 10 }, { sourceType: 'consignment' }]) {
      const res = await request(server())
        .post('/vehicles')
        .set(inContext(id, REASON))
        .send({ name: 'Xe giá', vehicleType: VEHICLE_TYPE.CAR, branchId: defaultBranchId, ...extra });
      expect(res.status).toBe(403);
      expect(res.body.error.code).toBe(API_ERROR_CODE.SUPPORT_FIELD_NOT_ALLOWED);
    }
  });

  maybe('ảnh ngoài kho của gian hàng → 403 SUPPORT_MEDIA_OUT_OF_SCOPE, không tạo', async () => {
    const { id } = await openContext(ids.packageTenant);
    const before = await prisma.vehicle.count({ where: { tenantId: ids.packageTenant } });
    const res = await request(server())
      .post('/vehicles')
      .set(inContext(id, REASON))
      .send({
        name: 'Xe ảnh ngoài',
        vehicleType: VEHICLE_TYPE.CAR,
        branchId: defaultBranchId,
        mainImageUrl: 'https://evil.example.com/car.jpg',
      });
    expect(res.status).toBe(403);
    expect(res.body.error.code).toBe(API_ERROR_CODE.SUPPORT_MEDIA_OUT_OF_SCOPE);
    expect(await prisma.vehicle.count({ where: { tenantId: ids.packageTenant } })).toBe(before);
  });

  maybe('chi nhánh của gian hàng khác → 404, không tạo', async () => {
    const { id } = await openContext(ids.packageTenant);
    const res = await request(server())
      .post('/vehicles')
      .set(inContext(id, REASON))
      .send({ name: 'Xe sai chi nhánh', vehicleType: VEHICLE_TYPE.CAR, branchId: otherBranchId });
    expect(res.status).toBe(404);
  });

  maybe('chủ xe ngoài phiên vẫn tạo xe CÓ giá như cũ', async () => {
    const res = await request(server())
      .post('/vehicles')
      .set(as(ids.owner))
      .send({ name: 'Xe chủ tự tạo', vehicleType: VEHICLE_TYPE.CAR, branchId: defaultBranchId, weekdayPrice: '700000' });
    expect(res.status).toBe(201);
    const row = await prisma.vehicle.findUniqueOrThrow({ where: { id: res.body.id } });
    expect(row.marketplaceEnabled).toBe(true);
  });
});

describe('Chuyển chi nhánh', () => {
  maybe('chi nhánh của gian hàng khác → 404', async () => {
    const { id } = await openContext(ids.packageTenant);
    const res = await request(server()).patch(`/vehicles/${vehicleId}`).set(inContext(id, REASON)).send({ branchId: otherBranchId });
    expect(res.status).toBe(404);
  });

  maybe('không lý do riêng → 428; giữ nguyên chi nhánh (form Thông tin) thì không đòi', async () => {
    const { id } = await openContext(ids.packageTenant);
    const move = await request(server()).patch(`/vehicles/${vehicleId}`).set(inContext(id)).send({ branchId: secondBranchId });
    expect(move.status).toBe(428);
    expect(move.body.error.details.capabilities).toEqual([SUPPORT_CAPABILITY.VEHICLE_BRANCH_REASSIGN]);
    const same = await request(server())
      .patch(`/vehicles/${vehicleId}`)
      .set(inContext(id))
      .send({ name: 'Toyota Vios 2B', branchId: defaultBranchId });
    expect(same.status).toBe(200);
  });

  maybe('chi nhánh đích chưa có tỉnh → 409, xe không đổi', async () => {
    const { id } = await openContext(ids.packageTenant);
    const res = await request(server()).patch(`/vehicles/${vehicleId}`).set(inContext(id, REASON)).send({ branchId: noProvinceBranchId });
    expect(res.status).toBe(409);
    expect(res.body.error.code).toBe(API_ERROR_CODE.BRANCH_LOCATION_REQUIRED);
  });

  maybe('xe có yêu cầu thuê đang chờ → 409 SUPPORT_OPEN_TRIPS', async () => {
    const { id } = await openContext(ids.packageTenant);
    const requestId = newId();
    await prisma.bookingRequest.create({
      data: {
        id: requestId,
        tenantId: ids.packageTenant,
        vehicleId,
        customerName: 'Khách đang hỏi',
        customerPhone: '0909000111',
        status: BOOKING_REQUEST_STATUS.PENDING_HOST_APPROVAL,
        pickupAt: new Date(Date.now() + 10 * 86400_000),
        returnAt: new Date(Date.now() + 12 * 86400_000),
        respondBy: new Date(Date.now() + 86400_000),
      },
    });
    try {
      const res = await request(server()).patch(`/vehicles/${vehicleId}`).set(inContext(id, REASON)).send({ branchId: secondBranchId });
      expect(res.status).toBe(409);
      expect(res.body.error.code).toBe(API_ERROR_CODE.SUPPORT_OPEN_TRIPS);
    } finally {
      await prisma.bookingRequest.delete({ where: { id: requestId } });
    }
  });

  maybe('chuyển được: đồng bộ listing + audit riêng (chi nhánh cũ/mới, lý do, người, phiên)', async () => {
    const { id } = await openContext(ids.packageTenant);
    const res = await request(server()).patch(`/vehicles/${vehicleId}`).set(inContext(id, REASON)).send({ branchId: secondBranchId });
    expect(res.status).toBe(200);
    const audit = await lastAudit('vehicle.branch.reassign');
    expect(audit.actorScope).toBe(AUDIT_ACTOR_SCOPE.PLATFORM);
    expect(audit.actorUserId).toBe(ids.admin);
    expect(audit.supportContextId).toBe(id);
    expect(audit.supportReason).toBe(REASON);
    expect(audit.supportCapability).toContain(SUPPORT_CAPABILITY.VEHICLE_BRANCH_REASSIGN);
    expect(audit.beforeJson).toEqual({ branchId: defaultBranchId });
    expect(audit.afterJson).toEqual({ branchId: secondBranchId });
    // Trả lại cho các test sau.
    await request(server()).patch(`/vehicles/${vehicleId}`).set(inContext(id, REASON)).send({ branchId: defaultBranchId });
  });

  maybe('body đầy đủ của form sửa (kèm cột FK `vehicleCatalogModelId`) → 200, không 500', async () => {
    const { id } = await openContext(ids.packageTenant);
    try {
      const res = await request(server())
        .patch(`/vehicles/${vehicleId}`)
        .set(inContext(id, REASON))
        .send({ name: 'Toyota Vios 2B', branchId: secondBranchId, vehicleCatalogModelId: null });
      expect(res.status).toBe(200);
      const saved = await prisma.vehicle.findUniqueOrThrow({ where: { id: vehicleId }, select: { branchId: true } });
      expect(saved.branchId).toBe(secondBranchId);
    } finally {
      await prisma.vehicle.update({ where: { id: vehicleId }, data: { branchId: defaultBranchId } });
    }
  });
});

describe('Cấu hình vận hành', () => {
  maybe('bỏ dịch vụ có giá riêng → 403 (không sửa giá); giá vẫn nguyên', async () => {
    const { id } = await openContext(ids.packageTenant);
    const res = await request(server())
      .patch(`/vehicles/${vehicleId}`)
      .set(inContext(id, REASON))
      .send({ serviceTypes: [SERVICE_TYPE.SELF_DRIVE] });
    expect(res.status).toBe(403);
    expect(res.body.error.details.priceFields).toContain('withDriverDailyPrice');
    const row = await prisma.vehicle.findUniqueOrThrow({ where: { id: vehicleId } });
    expect(String(row.withDriverDailyPrice)).toBe('900000');
  });

  maybe('trường giá trong lệnh sửa xe → 403 SUPPORT_FIELD_NOT_ALLOWED', async () => {
    const { id } = await openContext(ids.packageTenant);
    const res = await request(server()).patch(`/vehicles/${vehicleId}`).set(inContext(id, REASON)).send({ weekdayPrice: '1' });
    expect(res.status).toBe(403);
    expect(res.body.error.code).toBe(API_ERROR_CODE.SUPPORT_FIELD_NOT_ALLOWED);
  });

  maybe('thiết lập dịch vụ: tự nhận chuyến đổi → 403; thời lượng tối thiểu đổi được', async () => {
    const { id } = await openContext(ids.packageTenant);
    const auto = await request(server())
      .patch(`/vehicles/${vehicleId}/service-settings/${SERVICE_TYPE.WITH_DRIVER}`)
      .set(inContext(id, REASON))
      .send({ autoAcceptEnabled: true });
    expect(auto.status).toBe(403);
    expect(auto.body.error.details.fields).toEqual(['autoAcceptEnabled']);
    const ok = await request(server())
      .patch(`/vehicles/${vehicleId}/service-settings/${SERVICE_TYPE.WITH_DRIVER}`)
      .set(inContext(id, REASON))
      .send({ autoAcceptEnabled: false, minRentalMinutes: 240 });
    expect(ok.status).toBe(200);
    const audit = await lastAudit('vehicle.service_settings.update');
    expect(audit.actorScope).toBe(AUDIT_ACTOR_SCOPE.PLATFORM);
    expect(audit.supportReason).toBe(REASON);
  });

  maybe('trạng thái vận hành: "đang cho thuê" → 403; cho xe nghỉ khi còn yêu cầu đang chờ → 409', async () => {
    const { id } = await openContext(ids.packageTenant);
    const renting = await request(server())
      .patch(`/vehicles/${vehicleId}`)
      .set(inContext(id, REASON))
      .send({ operationStatus: VEHICLE_OPERATION_STATUS.RENTING });
    expect(renting.status).toBe(403);
    expect(renting.body.error.code).toBe(API_ERROR_CODE.SUPPORT_FIELD_NOT_ALLOWED);

    const requestId = newId();
    await prisma.bookingRequest.create({
      data: {
        id: requestId,
        tenantId: ids.packageTenant,
        vehicleId,
        customerName: 'Khách đang chờ',
        customerPhone: '0909000333',
        status: BOOKING_REQUEST_STATUS.PENDING_HOST_APPROVAL,
        pickupAt: new Date(Date.now() + 10 * 86400_000),
        returnAt: new Date(Date.now() + 12 * 86400_000),
        respondBy: new Date(Date.now() + 86400_000),
      },
    });
    try {
      const rest = await request(server())
        .patch(`/vehicles/${vehicleId}`)
        .set(inContext(id, REASON))
        .send({ operationStatus: VEHICLE_OPERATION_STATUS.MAINTENANCE });
      expect(rest.status).toBe(409);
      expect(rest.body.error.code).toBe(API_ERROR_CODE.SUPPORT_OPEN_TRIPS);
    } finally {
      await prisma.bookingRequest.delete({ where: { id: requestId } });
    }
  });

  maybe('một lệnh chạm ba capability (thông tin + chi nhánh + vận hành) → 200; audit đủ capability và before/after vận hành', async () => {
    const { id } = await openContext(ids.packageTenant);
    try {
      const res = await request(server())
        .patch(`/vehicles/${vehicleId}`)
        .set(inContext(id, REASON))
        .send({
          name: 'Toyota Vios 2B',
          branchId: secondBranchId,
          operationStatus: VEHICLE_OPERATION_STATUS.MAINTENANCE,
        });
      expect(res.status).toBe(200);
      const audit = await lastAudit('vehicle.support.update');
      for (const capability of [
        SUPPORT_CAPABILITY.VEHICLE_INFO_EDIT,
        SUPPORT_CAPABILITY.VEHICLE_BRANCH_REASSIGN,
        SUPPORT_CAPABILITY.VEHICLE_OPERATIONS_UPDATE,
      ]) {
        expect(audit.supportCapability).toContain(capability);
      }
      expect((audit.beforeJson as Record<string, unknown>).operationStatus).toBe(VEHICLE_OPERATION_STATUS.AVAILABLE);
      expect((audit.afterJson as Record<string, unknown>).operationStatus).toBe(VEHICLE_OPERATION_STATUS.MAINTENANCE);
    } finally {
      await prisma.vehicle.update({
        where: { id: vehicleId },
        data: { branchId: defaultBranchId, operationStatus: VEHICLE_OPERATION_STATUS.AVAILABLE },
      });
    }
  });

  maybe('phụ phí có tài xế: không mở cho phiên', async () => {
    const { id } = await openContext(ids.packageTenant);
    const res = await request(server())
      .put(`/vehicles/${vehicleId}/driver-surcharge-rules`)
      .set(inContext(id, REASON))
      .send({ rules: [] });
    expect(res.status).toBe(403);
    expect(res.body.error.code).toBe(API_ERROR_CODE.SUPPORT_ACTION_NOT_ALLOWED);
  });
});

describe('Khoá lịch', () => {
  const future = (days: number) => new Date(Date.now() + days * 86400_000).toISOString();

  maybe('không lùi ngày; khoá tương lai mang id phiên; trùng khoá khác → 409', async () => {
    const { id } = await openContext(ids.packageTenant);
    const past = await request(server())
      .post('/vehicle-blocks')
      .set(inContext(id, REASON))
      .send({ vehicleId, startAt: new Date(Date.now() - 86400_000).toISOString(), endAt: future(1), reason: VEHICLE_BLOCK_REASON.REPAIR });
    expect(past.status).toBe(400);

    const created = await request(server())
      .post('/vehicle-blocks')
      .set(inContext(id, REASON))
      .send({ vehicleId, startAt: future(60), endAt: future(62), reason: VEHICLE_BLOCK_REASON.REPAIR });
    expect(created.status).toBe(201);
    expect(created.body.supportContextId).toBe(id);

    const overlap = await request(server())
      .post('/vehicle-blocks')
      .set(inContext(id, REASON))
      .send({ vehicleId, startAt: future(61), endAt: future(63), reason: VEHICLE_BLOCK_REASON.REPAIR });
    expect(overlap.status).toBe(409);
    expect(overlap.body.error.code).toBe(API_ERROR_CODE.BOOKING_SCHEDULE_CONFLICT);

    const audit = await lastAudit('vehicle.block.create');
    expect(audit.actorScope).toBe(AUDIT_ACTOR_SCOPE.PLATFORM);
    expect(audit.supportReason).toBe(REASON);
  });

  maybe('khoá của chủ xe / của phiên khác: phiên không sửa, không gỡ', async () => {
    const ownerBlock = await request(server())
      .post('/vehicle-blocks')
      .set(as(ids.owner))
      .send({ vehicleId, startAt: future(80), endAt: future(81), reason: VEHICLE_BLOCK_REASON.INTERNAL_USE });
    expect(ownerBlock.status).toBe(201);
    expect(ownerBlock.body.supportContextId).toBeNull();

    const a = await openContext(ids.packageTenant);
    const del = await request(server()).delete(`/vehicle-blocks/${ownerBlock.body.id}`).set(inContext(a.id, REASON));
    expect(del.status).toBe(403);
    expect(del.body.error.code).toBe(API_ERROR_CODE.SUPPORT_BLOCK_NOT_OWNED);

    const mine = await request(server())
      .post('/vehicle-blocks')
      .set(inContext(a.id, REASON))
      .send({ vehicleId, startAt: future(90), endAt: future(91), reason: VEHICLE_BLOCK_REASON.INTERNAL_USE });
    const b = await openContext(ids.packageTenant);
    const fromOther = await request(server()).delete(`/vehicle-blocks/${mine.body.id}`).set(inContext(b.id, REASON));
    expect(fromOther.status).toBe(403);
    const own = await request(server()).delete(`/vehicle-blocks/${mine.body.id}`).set(inContext(a.id, REASON));
    expect(own.status).toBe(204);
  });
});

describe('Giấy tờ xe', () => {
  maybe('ĐỌC danh sách không đòi lý do; phiên chỉ-xem vẫn 403', async () => {
    const assist = await openContext(ids.packageTenant);
    const list = await request(server()).get(`/vehicles/${vehicleId}/documents`).set(inContext(assist.id));
    expect(list.status).toBe(200);
    const view = await openContext(ids.packageTenant, SUPPORT_MODE.VIEW);
    const denied = await request(server()).get(`/vehicles/${vehicleId}/documents`).set(inContext(view.id));
    expect(denied.status).toBe(403);
  });

  maybe('dữ liệu định danh: tạo có giá trị → 403; tạo để trống → được, response không lộ định danh', async () => {
    const { id } = await openContext(ids.packageTenant);
    const withNumber = await request(server())
      .post(`/vehicles/${vehicleId}/documents`)
      .set(inContext(id, REASON))
      .send({ type: VEHICLE_DOCUMENT_TYPE.REGISTRATION, documentNumber: '123456789' });
    expect(withNumber.status).toBe(403);
    expect(withNumber.body.error.details.fields).toEqual(['documentNumber']);

    const blank = await request(server())
      .post(`/vehicles/${vehicleId}/documents`)
      .set(inContext(id, REASON))
      .send({ type: VEHICLE_DOCUMENT_TYPE.REGISTRATION, documentNumber: null, holderName: '', expiresAt: '2028-01-01' });
    expect(blank.status).toBe(201);
    expect(blank.body.holderName ?? null).toBeNull();
  });

  maybe('sửa: trường định danh có mặt (kể cả null) → 403; không có trạng thái "đã xác minh" nào để đặt', async () => {
    const { id } = await openContext(ids.packageTenant);
    const created = await request(server())
      .post(`/vehicles/${vehicleId}/documents`)
      .set(inContext(id, REASON))
      .send({ type: VEHICLE_DOCUMENT_TYPE.INSPECTION });
    const clear = await request(server())
      .patch(`/vehicles/${vehicleId}/documents/${created.body.id}`)
      .set(inContext(id, REASON))
      .send({ type: VEHICLE_DOCUMENT_TYPE.INSPECTION, holderName: null });
    expect(clear.status).toBe(403);
    const verified = await request(server())
      .patch(`/vehicles/${vehicleId}/documents/${created.body.id}`)
      .set(inContext(id, REASON))
      .send({ type: VEHICLE_DOCUMENT_TYPE.INSPECTION, status: 'verified' });
    expect(verified.status).toBe(403);
  });

  maybe('không xem chi tiết/file, không lưu trữ', async () => {
    const { id } = await openContext(ids.packageTenant);
    const created = await request(server())
      .post(`/vehicles/${vehicleId}/documents`)
      .set(inContext(id, REASON))
      .send({ type: VEHICLE_DOCUMENT_TYPE.OTHER, customTypeName: 'Sổ đăng kiểm cũ' });
    for (const [method, path] of [
      ['get', `/vehicles/${vehicleId}/documents/${created.body.id}`],
      ['get', `/vehicles/${vehicleId}/documents/${created.body.id}/versions`],
      ['post', `/vehicles/${vehicleId}/documents/${created.body.id}/archive`],
    ] as const) {
      const res = await request(server())[method](path).set(inContext(id, REASON));
      expect(res.status).toBe(403);
      expect(res.body.error.code).toBe(API_ERROR_CODE.SUPPORT_ACTION_NOT_ALLOWED);
    }
  });

  maybe('xe của gian hàng khác → 404', async () => {
    const { id } = await openContext(ids.packageTenant);
    const res = await request(server())
      .post(`/vehicles/${otherVehicleId}/documents`)
      .set(inContext(id, REASON))
      .send({ type: VEHICLE_DOCUMENT_TYPE.INSURANCE });
    expect(res.status).toBe(404);
  });
});

/**
 * Hồ sơ gian hàng (mặt tiền công khai) CHỈ ĐỌC trong phiên — quyết định 28/09/2026, ADR 0050 §13.
 * Không capability ghi nào, không `tenant.update`; `PATCH /tenants/current/profile` và presign
 * logo/ảnh bìa rơi vào default-deny ở MỌI bộ giao diện và MỌI chế độ. Chủ xe ngoài phiên không đổi gì.
 */
describe('Hồ sơ gian hàng — chỉ đọc trong phiên', () => {
  /** Capability đã rút — so bằng CHUỖI vì hằng của nó không còn trong `@xeprime/types`. */
  const REMOVED_CAPABILITY = 'tenant.public_profile.update';
  const WORKSPACES = [
    { label: 'Full Manage', tenant: () => ids.packageTenant },
    { label: 'Owner Lite', tenant: () => ids.liteTenant },
  ];
  const MODES = [SUPPORT_MODE.VIEW, SUPPORT_MODE.ASSIST];
  const presignBody = { fileName: 'logo.png', contentType: 'image/png', fileSize: 1000 };

  async function resetProfile(tenantId: string, displayName: string) {
    await prisma.tenantProfile.upsert({
      where: { tenantId },
      create: { tenantId, displayName, bio: 'Giới thiệu gốc', logoUrl: null },
      update: { displayName, bio: 'Giới thiệu gốc', logoUrl: null },
    });
  }

  maybe('Full Manage và Owner Lite, cả hai chế độ: không capability sửa hồ sơ, không `tenant.update`', async () => {
    for (const { tenant } of WORKSPACES) {
      for (const mode of MODES) {
        const ctx = await openContext(tenant(), mode);
        expect(ctx.capabilities).not.toContain(REMOVED_CAPABILITY);
        expect(ctx.permissions).not.toContain(PERMISSION.TENANT_UPDATE);
        // Xem hồ sơ thì vẫn có.
        expect(ctx.capabilities).toContain(SUPPORT_CAPABILITY.TENANT_PROFILE_VIEW);
      }
    }
  });

  maybe('các capability 2B còn lại không đổi (Full Manage đủ bộ ghi; Owner Lite đủ việc trên xe)', async () => {
    const manage = await openContext(ids.packageTenant);
    for (const capability of SUPPORT_WRITE_CAPABILITIES) expect(manage.capabilities).toContain(capability);
    const lite = await openContext(ids.liteTenant);
    for (const capability of [
      SUPPORT_CAPABILITY.VEHICLE_INFO_EDIT,
      SUPPORT_CAPABILITY.VEHICLE_MEDIA_MANAGE,
      SUPPORT_CAPABILITY.VEHICLE_DOCUMENT_MANAGE,
      SUPPORT_CAPABILITY.VEHICLE_OPERATIONS_UPDATE,
      SUPPORT_CAPABILITY.VEHICLE_SCHEDULE_BLOCK_MANAGE,
      SUPPORT_CAPABILITY.VEHICLE_SUBMIT_REVIEW,
      SUPPORT_CAPABILITY.LISTING_REPAIR,
    ]) {
      expect(lite.capabilities).toContain(capability);
    }
  });

  for (const { label, tenant } of WORKSPACES) {
    for (const mode of MODES) {
      maybe(`${label} · ${mode}: PATCH hồ sơ + presign logo/ảnh bìa → 403 SUPPORT_ACTION_NOT_ALLOWED, không ghi`, async () => {
        await resetProfile(tenant(), 'Tên gốc');
        const { id } = await openContext(tenant(), mode);
        // Có lý do riêng hay không đều như nhau: default-deny chặn TRƯỚC cả bước hỏi lý do (không 428).
        for (const headers of [inContext(id, REASON), inContext(id)]) {
          const patch = await request(server())
            .patch('/tenants/current/profile')
            .set(headers)
            .send({ displayName: 'Tên do nền tảng đặt', bio: 'Sửa hộ', logoUrl: `${CDN}/tenants/${tenant()}/shop/${newId()}-logo.png` });
          expect(patch.status).toBe(403);
          expect(patch.body.error.code).toBe(API_ERROR_CODE.SUPPORT_ACTION_NOT_ALLOWED);

          const presign = await request(server()).post('/uploads/shop-media/presign').set(headers).send(presignBody);
          expect(presign.status).toBe(403);
          expect(presign.body.error.code).toBe(API_ERROR_CODE.SUPPORT_ACTION_NOT_ALLOWED);
        }
        const row = await prisma.tenantProfile.findUniqueOrThrow({ where: { tenantId: tenant() } });
        expect(row.displayName).toBe('Tên gốc');
        expect(row.bio).toBe('Giới thiệu gốc');
        expect(row.logoUrl).toBeNull();
      });

      maybe(`${label} · ${mode}: GET hồ sơ vẫn đọc được`, async () => {
        await resetProfile(tenant(), 'Tên đọc được');
        const { id } = await openContext(tenant(), mode);
        const res = await request(server()).get('/tenants/current/shop').set(inContext(id));
        expect(res.status).toBe(200);
        expect(res.body.id).toBe(tenant());
        expect(res.body.profile.displayName).toBe('Tên đọc được');
      });
    }
  }

  maybe('chủ xe ngoài phiên (gói lẫn hoa hồng) vẫn tải logo và sửa hồ sơ như cũ', async () => {
    for (const [tenantId, ownerId] of [
      [ids.packageTenant, ids.owner],
      [ids.liteTenant, ids.liteOwner],
    ] as const) {
      await resetProfile(tenantId, 'Tên gốc');
      const presign = await request(server()).post('/uploads/shop-media/presign').set(as(ownerId)).send(presignBody);
      expect(presign.status).toBe(201);
      expect(presign.body.publicUrl).toMatch(new RegExp(`^${CDN}/tenants/${tenantId}/shop/`));
      const res = await request(server())
        .patch('/tenants/current/profile')
        .set(as(ownerId))
        .send({ displayName: 'Tên chủ tự đặt', bio: 'Chủ tự viết', logoUrl: presign.body.publicUrl });
      expect(res.status).toBe(200);
      const row = await prisma.tenantProfile.findUniqueOrThrow({ where: { tenantId } });
      expect(row.displayName).toBe('Tên chủ tự đặt');
      expect(row.bio).toBe('Chủ tự viết');
      expect(row.logoUrl).toBe(presign.body.publicUrl);
    }
  });

  maybe('tenant khác không bị ảnh hưởng: phiên bị chặn không chạm hồ sơ của ai, chủ tenant khác vẫn sửa được', async () => {
    await resetProfile(ids.otherTenant, 'Gian hàng khác');
    const { id } = await openContext(ids.packageTenant);
    const blocked = await request(server())
      .patch('/tenants/current/profile')
      .set(inContext(id, REASON))
      .send({ displayName: 'Không được ghi' });
    expect(blocked.status).toBe(403);
    expect((await prisma.tenantProfile.findUniqueOrThrow({ where: { tenantId: ids.otherTenant } })).displayName).toBe(
      'Gian hàng khác',
    );

    const own = await request(server())
      .patch('/tenants/current/profile')
      .set(as(ids.otherOwner))
      .send({ displayName: 'Gian hàng khác — đã đổi' });
    expect(own.status).toBe(200);
    expect((await prisma.tenantProfile.findUniqueOrThrow({ where: { tenantId: ids.otherTenant } })).displayName).toBe(
      'Gian hàng khác — đã đổi',
    );
  });
});

describe('Chi nhánh cơ bản', () => {
  maybe('tạo được; ngưng / đổi mặc định / mở lại → 403', async () => {
    const { id } = await openContext(ids.packageTenant);
    const created = await request(server()).post('/branches').set(inContext(id, REASON)).send({ name: 'CN tạo hộ', provinceCode: '79' });
    expect(created.status).toBe(201);
    const audit = await lastAudit('branch.create');
    expect(audit.actorScope).toBe(AUDIT_ACTOR_SCOPE.PLATFORM);
    expect(audit.supportReason).toBe(REASON);
    for (const action of ['deactivate', 'set-default', 'activate']) {
      const res = await request(server()).post(`/branches/${created.body.id}/${action}`).set(inContext(id, REASON));
      expect(res.status).toBe(403);
      expect(res.body.error.code).toBe(API_ERROR_CODE.SUPPORT_ACTION_NOT_ALLOWED);
    }
  });

  maybe('đổi địa chỉ chi nhánh có chuyến mở → 409; đổi tên thì được', async () => {
    const { id } = await openContext(ids.packageTenant);
    const requestId = newId();
    await prisma.bookingRequest.create({
      data: {
        id: requestId,
        tenantId: ids.packageTenant,
        vehicleId,
        customerName: 'Khách giữ chỗ',
        customerPhone: '0909000222',
        status: BOOKING_REQUEST_STATUS.PENDING_HOST_APPROVAL,
        pickupAt: new Date(Date.now() + 10 * 86400_000),
        returnAt: new Date(Date.now() + 12 * 86400_000),
        respondBy: new Date(Date.now() + 86400_000),
      },
    });
    try {
      const moved = await request(server()).patch(`/branches/${defaultBranchId}`).set(inContext(id, REASON)).send({ addressLine: '12 Đường Mới, khu phố 3' });
      expect(moved.status).toBe(409);
      expect(moved.body.error.code).toBe(API_ERROR_CODE.SUPPORT_OPEN_TRIPS);
      // Form chi nhánh gửi CẢ cụm địa chỉ đang có — địa chỉ không đổi thì đổi tên vẫn được.
      const current = await prisma.tenantBranch.findUniqueOrThrow({ where: { id: defaultBranchId } });
      const renamed = await request(server())
        .patch(`/branches/${defaultBranchId}`)
        .set(inContext(id, REASON))
        .send({
          name: 'Chi nhánh chính',
          provinceCode: current.provinceCode ?? undefined,
          addressLine: current.addressLine ?? undefined,
        });
      expect(renamed.status).toBe(200);
    } finally {
      await prisma.bookingRequest.delete({ where: { id: requestId } });
    }
  });

  maybe('trường lạ → 403 cả lệnh', async () => {
    const { id } = await openContext(ids.packageTenant);
    const res = await request(server()).patch(`/branches/${defaultBranchId}`).set(inContext(id, REASON)).send({ isDefault: true });
    expect([400, 403]).toContain(res.status);
  });
});

describe('Gửi duyệt thay chủ xe', () => {
  maybe('vào hàng đợi, không tự duyệt; người gửi là nhân sự nền tảng, audit riêng', async () => {
    const { id } = await openContext(ids.otherTenant);
    const res = await request(server()).post(`/vehicles/${otherVehicleId}/submit-public`).set(inContext(id, REASON));
    // Cổng đăng xe hiện hành vẫn chạy (hồ sơ gian hàng gói cần logo…) — 200 hoặc từ chối có mã.
    if (res.status === 200) {
      expect(res.body.publicStatus).toBe(VEHICLE_PUBLIC_STATUS.PENDING_PUBLIC_REVIEW);
      const task = await prisma.approvalTask.findFirstOrThrow({ where: { tenantId: ids.otherTenant }, orderBy: { createdAt: 'desc' } });
      expect(task.submittedBy).toBe(ids.admin);
      expect(task.status).not.toBe('approved');
      const audit = await lastAudit('vehicle.support.submit_review');
      expect(audit.supportReason).toBe(REASON);
      expect(audit.actorScope).toBe(AUDIT_ACTOR_SCOPE.PLATFORM);
    } else {
      expect(res.status).toBeGreaterThanOrEqual(400);
      expect(res.body.error.code).not.toBe(API_ERROR_CODE.SUPPORT_ACTION_NOT_ALLOWED);
    }
  });
});

describe('Sửa listing', () => {
  maybe('idempotent: lần hai không đổi gì; chủ xe ngoài phiên không gọi được', async () => {
    const { id } = await openContext(ids.packageTenant);
    const first = await request(server()).post(`/vehicles/${vehicleId}/listing/resync`).set(inContext(id, REASON));
    expect(first.status).toBe(200);
    const second = await request(server()).post(`/vehicles/${vehicleId}/listing/resync`).set(inContext(id, REASON));
    expect(second.status).toBe(200);
    expect(second.body.changed).toBe(false);
    const audit = await lastAudit('listing.support.repair');
    expect(audit.supportReason).toBe(REASON);
    const owner = await request(server()).post(`/vehicles/${vehicleId}/listing/resync`).set(as(ids.owner));
    expect(owner.status).toBe(403);
  });
});

describe('Khu vẫn cấm trong phiên assist', () => {
  maybe('thành viên, công tắc lên chợ, xoá xe, endpoint không khai → 403', async () => {
    const { id } = await openContext(ids.packageTenant);
    for (const [method, path, body] of [
      ['patch', `/members/${ids.owner}`, { roleKey: TENANT_ROLE.SHOP_VIEWER }],
      ['delete', `/members/${ids.owner}`, {}],
      ['patch', `/vehicles/${vehicleId}/marketplace-visibility`, { enabled: false }],
      ['delete', `/vehicles/${vehicleId}`, {}],
      ['put', `/vehicles/${vehicleId}/pricing`, {}],
      ['get', '/probe-2b/unlisted', {}],
    ] as const) {
      const res = await request(server())[method](path).set(inContext(id, REASON)).send(body);
      expect(res.status).toBe(403);
      expect(res.body.error.code).toBe(API_ERROR_CODE.SUPPORT_ACTION_NOT_ALLOWED);
    }
  });

  maybe('tenant A không chạm tenant B: xe, khoá lịch, giấy tờ của gian hàng khác → 404', async () => {
    const { id } = await openContext(ids.packageTenant);
    const vehicle = await request(server()).patch(`/vehicles/${otherVehicleId}`).set(inContext(id)).send({ name: 'Đổi xe người khác' });
    expect(vehicle.status).toBe(404);
    const block = await request(server())
      .post('/vehicle-blocks')
      .set(inContext(id, REASON))
      .send({ vehicleId: otherVehicleId, startAt: new Date(Date.now() + 99 * 86400_000).toISOString(), endAt: new Date(Date.now() + 100 * 86400_000).toISOString(), reason: VEHICLE_BLOCK_REASON.OTHER });
    expect(block.status).toBe(404);
    const lite = await request(server()).patch(`/vehicles/${liteVehicleId}`).set(inContext(id)).send({ name: 'Đổi xe lite' });
    expect(lite.status).toBe(404);
  });
});

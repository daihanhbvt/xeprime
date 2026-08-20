import { createPrismaClient, newId } from '@xeprime/prisma';
import {
  APPROVAL_STATUS,
  APPROVAL_TARGET_TYPE,
  MEMBERSHIP_STATUS,
  NOTIFICATION_TYPE,
  TENANT_ROLE,
  TENANT_STATUS,
  VEHICLE_PUBLIC_STATUS,
  VEHICLE_TYPE,
} from '@xeprime/types';
import { AuditService } from '../src/modules/audit/audit.service';
import { ListingsService } from '../src/modules/public-listings/listings.service';
import { NotificationService } from '../src/modules/notification/notification.service';
import { PlatformApprovalService } from '../src/modules/platform-admin/platform-approval.service';
import type { PrismaService } from '../src/prisma/prisma.service';
import { makeVehiclesService, seedBranch } from './helpers/service-factory';

/**
 * WS0 — vòng đăng xe → duyệt → công khai (ADR 0008) chạy trên PostgreSQL THẬT. Kiểm chứng:
 * submit tạo phiếu + hạ trạng thái đúng, chặn gửi trùng, thiếu điều kiện thì chặn, platform
 * duyệt/từ chối đổi `publicStatus` + thông báo chủ shop, và sửa trường nhạy cảm khi đang công
 * khai tự hạ về chờ duyệt lại. Không có DB thì tự skip.
 *
 * Chạy: pnpm db:up && pnpm --filter @xeprime/api test
 */
const prisma = createPrismaClient();
const asService = prisma as unknown as PrismaService;
const audit = new AuditService(asService);
const notifications = new NotificationService(asService);
const listings = new ListingsService(asService);
const vehicles = makeVehiclesService(asService);
const approvals = new PlatformApprovalService(asService, audit, notifications, listings);

let dbAvailable = false;
let ownerId: string;
let reviewerId: string;
let tenantId: string;
let draftTenantId: string;
let vehicleId: string;
/** Chi nhánh mặc định của từng tenant trong spec — xe phải thuộc một chi nhánh có tỉnh. */
const branchByTenant = new Map<string, string>();

async function seedVehicle(
  tenant: string,
  overrides: Record<string, unknown> = {},
): Promise<string> {
  const id = newId();
  await prisma.vehicle.create({
    data: {
      id,
      tenantId: tenant,
      // Gửi duyệt công khai đòi xe có chi nhánh CÓ TỈNH — vị trí là điều kiện để lên chợ.
      branchId: branchByTenant.get(tenant),
      code: `V-${id.slice(-6)}`,
      name: 'Toyota Vios',
      vehicleType: VEHICLE_TYPE.CAR,
      plateNumber: '51K-123.45',
      description: 'Xe gia đình 5 chỗ, máy xăng.',
      mainImageUrl: 'https://img.example/vios.jpg',
      weekdayPrice: '600000',
      weekendPrice: '750000',
      ...overrides,
    },
  });
  return id;
}

async function pendingTaskId(vehicle: string): Promise<string> {
  const task = await prisma.approvalTask.findFirstOrThrow({
    where: {
      targetType: APPROVAL_TARGET_TYPE.VEHICLE,
      targetId: vehicle,
      status: APPROVAL_STATUS.PENDING,
    },
    orderBy: { submittedAt: 'desc' },
    select: { id: true },
  });
  return task.id;
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

  ownerId = newId();
  reviewerId = newId();
  tenantId = newId();
  draftTenantId = newId();

  await prisma.user.createMany({
    data: [
      { id: ownerId, displayName: 'Chủ shop', email: `own-${ownerId}@xeprime.test` },
      { id: reviewerId, displayName: 'Reviewer', email: `rev-${reviewerId}@xeprime.test` },
    ],
  });
  await prisma.tenant.createMany({
    data: [
      {
        id: tenantId,
        code: `T-${tenantId.slice(-8)}`,
        slug: `t-${tenantId.toLowerCase().slice(-8)}`,
        name: 'Shop Active',
        status: TENANT_STATUS.ACTIVE,
        ownerUserId: ownerId,
      },
      {
        id: draftTenantId,
        code: `T-${draftTenantId.slice(-8)}`,
        slug: `t-${draftTenantId.toLowerCase().slice(-8)}`,
        name: 'Shop Draft',
        status: TENANT_STATUS.DRAFT,
        ownerUserId: ownerId,
      },
    ],
  });
  await prisma.tenantMembership.create({
    data: {
      id: newId(),
      tenantId,
      userId: ownerId,
      roleKey: TENANT_ROLE.SHOP_OWNER,
      status: MEMBERSHIP_STATUS.ACTIVE,
    },
  });
  for (const t of [tenantId, draftTenantId]) {
    branchByTenant.set(t, await seedBranch(asService, { tenantId: t }));
  }
  vehicleId = await seedVehicle(tenantId);
});

afterAll(async () => {
  if (dbAvailable) {
    const tenantIds = [tenantId, draftTenantId];
    const tasks = await prisma.approvalTask.findMany({
      where: { tenantId: { in: tenantIds } },
      select: { id: true },
    });
    await prisma.approvalLog.deleteMany({
      where: { approvalTaskId: { in: tasks.map((t) => t.id) } },
    });
    await prisma.approvalTask.deleteMany({ where: { tenantId: { in: tenantIds } } });
    await prisma.notification.deleteMany({ where: { userId: { in: [ownerId, reviewerId] } } });
    await prisma.auditLog.deleteMany({ where: { tenantId: { in: tenantIds } } });
    await prisma.vehicle.deleteMany({ where: { tenantId: { in: tenantIds } } });
    await prisma.tenantMembership.deleteMany({ where: { tenantId: { in: tenantIds } } });
    await prisma.tenantBranch.deleteMany({ where: { tenantId: { in: tenantIds } } });
    await prisma.tenant.deleteMany({ where: { id: { in: tenantIds } } });
    await prisma.user.deleteMany({ where: { id: { in: [ownerId, reviewerId] } } });
  }
  await prisma.$disconnect();
});

const maybe = (name: string, fn: () => Promise<void>) =>
  it(name, async () => {
    if (!dbAvailable) return;
    await fn();
  });

describe('Vehicle public approval (WS0)', () => {
  maybe('submit tạo phiếu duyệt xe (pending) + hạ xe về chờ duyệt', async () => {
    const result = await vehicles.submitForPublicReview(tenantId, vehicleId, ownerId);
    expect(result.publicStatus).toBe(VEHICLE_PUBLIC_STATUS.PENDING_PUBLIC_REVIEW);

    const task = await prisma.approvalTask.findFirstOrThrow({
      where: { targetType: APPROVAL_TARGET_TYPE.VEHICLE, targetId: vehicleId },
      select: { status: true, tenantId: true, snapshot: true },
    });
    expect(task.status).toBe(APPROVAL_STATUS.PENDING);
    expect(task.tenantId).toBe(tenantId);
    // Snapshot chụp giá dạng string (ADR 0007), không phải Decimal.
    expect((task.snapshot as Record<string, unknown>).weekdayPrice).toBe('600000');
  });

  maybe('gửi lại khi đang chờ duyệt bị chặn', async () => {
    await expect(vehicles.submitForPublicReview(tenantId, vehicleId, ownerId)).rejects.toThrow(
      /chờ duyệt/,
    );
  });

  maybe('platform duyệt → xe approved_public + thông báo chủ shop', async () => {
    const taskId = await pendingTaskId(vehicleId);
    const detail = await approvals.approve(taskId, reviewerId);
    expect(detail.status).toBe(APPROVAL_STATUS.APPROVED);

    const vehicle = await prisma.vehicle.findUniqueOrThrow({
      where: { id: vehicleId },
      select: { publicStatus: true },
    });
    expect(vehicle.publicStatus).toBe(VEHICLE_PUBLIC_STATUS.APPROVED_PUBLIC);

    const notif = await prisma.notification.findFirst({
      where: { userId: ownerId, type: NOTIFICATION_TYPE.VEHICLE_APPROVED },
    });
    expect(notif).not.toBeNull();
  });

  maybe('sửa giá xe đang công khai → tự hạ về chờ duyệt lại + phiếu mới', async () => {
    const updated = await vehicles.update(tenantId, vehicleId, ownerId, { weekdayPrice: '650000' });
    expect(updated.publicStatus).toBe(VEHICLE_PUBLIC_STATUS.PENDING_PUBLIC_REVIEW);

    const pending = await prisma.approvalTask.count({
      where: {
        targetType: APPROVAL_TARGET_TYPE.VEHICLE,
        targetId: vehicleId,
        status: APPROVAL_STATUS.PENDING,
      },
    });
    expect(pending).toBe(1);
  });

  maybe('sửa trường không nhạy cảm (mô tả) không đụng trạng thái duyệt', async () => {
    // Xe đang pending sau test trên; đổi mô tả không được đổi publicStatus.
    const updated = await vehicles.update(tenantId, vehicleId, ownerId, {
      description: 'Mô tả mới, không nhạy cảm.',
    });
    expect(updated.publicStatus).toBe(VEHICLE_PUBLIC_STATUS.PENDING_PUBLIC_REVIEW);
  });

  maybe('platform từ chối (cần lý do) → xe rejected', async () => {
    const taskId = await pendingTaskId(vehicleId);
    await expect(approvals.reject(taskId, reviewerId)).rejects.toThrow(/lý do/);

    const detail = await approvals.reject(taskId, reviewerId, 'Ảnh mờ, thiếu giấy tờ.');
    expect(detail.status).toBe(APPROVAL_STATUS.REJECTED);

    const vehicle = await prisma.vehicle.findUniqueOrThrow({
      where: { id: vehicleId },
      select: { publicStatus: true },
    });
    expect(vehicle.publicStatus).toBe(VEHICLE_PUBLIC_STATUS.REJECTED);
  });

  maybe('thiếu điều kiện (không giá/ảnh) → chặn gửi duyệt', async () => {
    const bare = await seedVehicle(tenantId, {
      weekdayPrice: null,
      weekendPrice: null,
      mainImageUrl: null,
    });
    await expect(vehicles.submitForPublicReview(tenantId, bare, ownerId)).rejects.toThrow(
      /bổ sung/,
    );
  });

  maybe('gian hàng chưa active → chặn gửi duyệt', async () => {
    const v = await seedVehicle(draftTenantId);
    await expect(vehicles.submitForPublicReview(draftTenantId, v, ownerId)).rejects.toThrow(
      /hoạt động/,
    );
  });

  maybe('đăng dịch vụ nào phải có GIÁ CHUYÊN BIỆT của dịch vụ đó mới gửi duyệt được (17/08)', async () => {
    // with_driver không có giá tài xế → chặn (không âm thầm trưng giá tự lái như tổng giá).
    const withDriver = await seedVehicle(tenantId, {
      serviceTypes: ['self_drive', 'with_driver'],
    });
    await expect(vehicles.submitForPublicReview(tenantId, withDriver, ownerId)).rejects.toThrow(
      /có tài xế/,
    );

    // long_term không có giá tháng → chặn.
    const longTerm = await seedVehicle(tenantId, { serviceTypes: ['self_drive', 'long_term'] });
    await expect(vehicles.submitForPublicReview(tenantId, longTerm, ownerId)).rejects.toThrow(
      /giá tháng/,
    );

    // Đủ giá chuyên biệt → gửi duyệt trôi.
    const ready = await seedVehicle(tenantId, {
      serviceTypes: ['self_drive', 'with_driver', 'long_term'],
      monthlyPrice: '12000000',
      withDriverDailyPrice: '1300000',
    });
    const submitted = await vehicles.submitForPublicReview(tenantId, ready, ownerId);
    expect(submitted.publicStatus).toBe(VEHICLE_PUBLIC_STATUS.PENDING_PUBLIC_REVIEW);

    // Xe CHỈ có tài xế (không tự lái): không bị ép giá ngày thường.
    const driverOnly = await seedVehicle(tenantId, {
      serviceTypes: ['with_driver'],
      weekdayPrice: null,
      weekendPrice: null,
      withDriverDailyPrice: '2500000',
    });
    const submitted2 = await vehicles.submitForPublicReview(tenantId, driverOnly, ownerId);
    expect(submitted2.publicStatus).toBe(VEHICLE_PUBLIC_STATUS.PENDING_PUBLIC_REVIEW);
  });

  maybe('bỏ dịch vụ → giá chuyên biệt của nó bị XOÁ theo (không giữ giá stale)', async () => {
    const v = await seedVehicle(tenantId, {
      serviceTypes: ['self_drive', 'long_term', 'with_driver'],
      monthlyPrice: '9000000',
      withDriverDailyPrice: '1500000',
      withDriverInterCityPrice: '1800000',
    });
    await vehicles.update(tenantId, v, ownerId, { serviceTypes: ['self_drive'] });
    const after = await prisma.vehicle.findUniqueOrThrow({
      where: { id: v },
      select: {
        monthlyPrice: true,
        withDriverDailyPrice: true,
        withDriverInterCityPrice: true,
        withDriverOneWayPrice: true,
      },
    });
    expect(after.monthlyPrice).toBeNull();
    expect(after.withDriverDailyPrice).toBeNull();
    expect(after.withDriverInterCityPrice).toBeNull();
    expect(after.withDriverOneWayPrice).toBeNull();
  });

  maybe('savePricing chặn đặt giá cho dịch vụ xe KHÔNG đăng', async () => {
    const v = await seedVehicle(tenantId, { serviceTypes: ['self_drive'] });
    await expect(
      vehicles.savePricing(tenantId, v, ownerId, {
        source: 'vehicle',
        monthlyPrice: '9000000',
        policy: {
          collateralMode: 'none',
          collateralAssetTypes: [],
          depositAmount: '0',
          deliveryEnabled: false,
          deliveryTiers: [],
          overtimeFeePerHour: null,
          overtimeGraceMinutes: null,
          overtimeRoundingMinutes: null,
          discountEnabled: false,
          discountTiers: [],
        },
      }),
    ).rejects.toThrow(/thuê dài hạn/);
  });
});

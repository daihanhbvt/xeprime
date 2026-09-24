import { createPrismaClient, newId } from '@xeprime/prisma';
import {
  API_ERROR_CODE,
  APPROVAL_STATUS,
  APPROVAL_TARGET_TYPE,
  BOOKING_REQUEST_STATUS,
  LISTING_STATUS,
  MARKETPLACE_VISIBILITY_REASON,
  MEMBERSHIP_STATUS,
  OCCUPANCY_SOURCE_TYPE,
  TENANT_ROLE,
  TENANT_STATUS,
  VEHICLE_PUBLIC_STATUS,
  VEHICLE_TYPE,
} from '@xeprime/types';
import { AuditService } from '../src/modules/audit/audit.service';
import { ListingsService } from '../src/modules/public-listings/listings.service';
import { PlatformApprovalService } from '../src/modules/platform-admin/platform-approval.service';
import { PlatformVehiclesService } from '../src/modules/platform-admin/platform-vehicles.service';
import type { PrismaService } from '../src/prisma/prisma.service';
import {
  makeNotificationService,
  makePublicListingsService,
  makeVehiclesService,
  seedBranch,
  seedProvince,
} from './helpers/service-factory';

/**
 * ADR 0048 — công tắc HIỂN THỊ TRÊN CHỢ của chủ xe, tách khỏi trạng thái kiểm duyệt.
 *
 * Chạy qua các service THẬT trên PostgreSQL thật: `public_listings` là bảng snapshot có một
 * writer duy nhất, và điều bộ này khoá chính là "hai trục nhân với nhau thì ra đúng một kết quả,
 * ở mọi đường vào". Mock không chứng minh được điều đó.
 *
 * Cô lập bằng một MÃ TỈNH riêng (ngoài danh mục chính thức) — cùng cách với `listings-sync.spec`.
 */
const prisma = createPrismaClient();
const asService = prisma as unknown as PrismaService;
const audit = new AuditService(asService);
const notifications = makeNotificationService(asService);
const listings = new ListingsService(asService);
const vehicles = makeVehiclesService(asService, { listings });
const approvals = new PlatformApprovalService(asService, audit, notifications, listings);
const platformVehicles = new PlatformVehiclesService(asService, audit, listings);
const publicListings = makePublicListingsService(asService);

const PROV = 'Z4';
const PROV_NAME = 'Zone Visibility';

let dbAvailable = false;
let ownerId: string;
let reviewerId: string;
let customerId: string;
let tenantId: string;
let otherTenantId: string;
let otherOwnerId: string;
let branchId: string;

/** Xe đủ điều kiện lên chợ (ảnh ≥4 URL khác nhau, danh tính + thông số năng lượng đầy đủ). */
async function seedVehicle(over: { tenantId?: string; branchId?: string } = {}): Promise<string> {
  const id = newId();
  await prisma.vehicle.create({
    data: {
      id,
      tenantId: over.tenantId ?? tenantId,
      branchId: over.branchId ?? branchId,
      code: `V-${id.slice(-6)}`,
      name: 'Toyota Vios',
      vehicleType: VEHICLE_TYPE.CAR,
      plateNumber: `51K-${id.slice(-3)}.45`,
      description: 'Xe 5 chỗ máy xăng.',
      mainImageUrl: `https://img.example/main-${id.slice(-4)}.jpg`,
      brand: 'toyota',
      model: 'Vios',
      manufactureYear: 2022,
      seatCount: 5,
      fuelType: 'gasoline',
      transmission: 'automatic',
      fuelConsumptionCombined: 7.5,
      bodyType: 'sedan',
      weekdayPrice: '600000',
    },
  });
  await prisma.vehicleImage.createMany({
    data: [1, 2, 3].map((n) => ({
      id: newId(),
      tenantId: over.tenantId ?? tenantId,
      vehicleId: id,
      imageUrl: `https://img.example/${id.slice(-4)}-${n}.jpg`,
      sortOrder: n,
    })),
  });
  return id;
}

/** Đưa một chiếc xe qua trọn cổng duyệt THẬT — không ghi tay `approved_public`. */
async function approve(vehicleId: string, forTenant = tenantId): Promise<void> {
  await vehicles.submitForPublicReview(forTenant, vehicleId, ownerId);
  const task = await prisma.approvalTask.findFirstOrThrow({
    where: {
      targetType: APPROVAL_TARGET_TYPE.VEHICLE,
      targetId: vehicleId,
      status: APPROVAL_STATUS.PENDING,
    },
    select: { id: true },
  });
  await approvals.approve(task.id, reviewerId);
}

const listingStatus = (vehicleId: string): Promise<string | undefined> =>
  prisma.publicListing
    .findUnique({ where: { vehicleId }, select: { status: true } })
    .then((row) => row?.status);

const inSearch = async (vehicleId: string): Promise<boolean> => {
  const res = await publicListings.search({ provinceCode: PROV, limit: 48 } as never);
  return res.data.some((v) => v.id === vehicleId);
};

const visibilityAudits = (vehicleId: string): Promise<number> =>
  prisma.auditLog.count({
    where: { targetType: 'vehicle', targetId: vehicleId, action: 'vehicle.marketplace_visibility.update' },
  });

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
  customerId = newId();
  otherOwnerId = newId();
  tenantId = newId();
  otherTenantId = newId();

  await prisma.user.createMany({
    data: [
      { id: ownerId, displayName: 'Chủ shop', email: `own-${ownerId}@xeprime.test` },
      { id: reviewerId, displayName: 'Reviewer', email: `rev-${reviewerId}@xeprime.test` },
      { id: customerId, displayName: 'Khách', email: `cus-${customerId}@xeprime.test` },
      { id: otherOwnerId, displayName: 'Chủ shop 2', email: `own2-${otherOwnerId}@xeprime.test` },
    ],
  });
  await prisma.tenant.createMany({
    data: [
      {
        id: tenantId,
        code: `T-${tenantId.slice(-8)}`,
        slug: `t-${tenantId.toLowerCase().slice(-10)}`,
        name: 'Shop Visibility',
        status: TENANT_STATUS.ACTIVE,
        ownerUserId: ownerId,
      },
      {
        id: otherTenantId,
        code: `T-${otherTenantId.slice(-8)}`,
        slug: `t-${otherTenantId.toLowerCase().slice(-10)}`,
        name: 'Shop Khác',
        status: TENANT_STATUS.ACTIVE,
        ownerUserId: otherOwnerId,
      },
    ],
  });
  await seedProvince(asService, PROV, PROV_NAME);
  await prisma.tenantProfile.createMany({
    data: [
      { tenantId, displayName: 'Shop Visibility', provinceCode: PROV, provinceName: PROV_NAME },
      {
        tenantId: otherTenantId,
        displayName: 'Shop Khác',
        provinceCode: PROV,
        provinceName: PROV_NAME,
      },
    ],
  });
  branchId = await seedBranch(asService, { tenantId, provinceCode: PROV });
  await prisma.tenantMembership.create({
    data: {
      id: newId(),
      tenantId,
      userId: ownerId,
      roleKey: TENANT_ROLE.SHOP_OWNER,
      status: MEMBERSHIP_STATUS.ACTIVE,
    },
  });
});

afterAll(async () => {
  if (dbAvailable) {
    const tenantIds = [tenantId, otherTenantId];
    const tasks = await prisma.approvalTask.findMany({
      where: { tenantId: { in: tenantIds } },
      select: { id: true },
    });
    await prisma.approvalLog.deleteMany({
      where: { approvalTaskId: { in: tasks.map((t) => t.id) } },
    });
    await prisma.approvalTask.deleteMany({ where: { tenantId: { in: tenantIds } } });
    await prisma.notification.deleteMany({
      where: { userId: { in: [ownerId, reviewerId, customerId, otherOwnerId] } },
    });
    await prisma.auditLog.deleteMany({ where: { tenantId: { in: tenantIds } } });
    await prisma.vehicleOccupancy.deleteMany({ where: { tenantId: { in: tenantIds } } });
    await prisma.bookingRequest.deleteMany({ where: { tenantId: { in: tenantIds } } });
    await prisma.publicListing.deleteMany({ where: { tenantId: { in: tenantIds } } });
    await prisma.vehicleImage.deleteMany({ where: { tenantId: { in: tenantIds } } });
    await prisma.vehicle.deleteMany({ where: { tenantId: { in: tenantIds } } });
    await prisma.tenantProfile.deleteMany({ where: { tenantId: { in: tenantIds } } });
    await prisma.tenantMembership.deleteMany({ where: { tenantId: { in: tenantIds } } });
    await prisma.tenantBranch.deleteMany({ where: { tenantId: { in: tenantIds } } });
    await prisma.tenant.deleteMany({ where: { id: { in: tenantIds } } });
    await prisma.user.deleteMany({
      where: { id: { in: [ownerId, reviewerId, customerId, otherOwnerId] } },
    });
    await prisma.province.deleteMany({ where: { code: PROV } });
  }
  await prisma.$disconnect();
});

const maybe = (name: string, fn: () => Promise<void>) =>
  it(name, async () => {
    if (!dbAvailable) return;
    await fn();
  });

/* ─── Hai trục nhân với nhau ─────────────────────────────────────────────── */

describe('ADR 0048 — trạng thái hiệu lực của listing', () => {
  maybe('approved_public + marketplaceEnabled=true → listing active và ra được search', async () => {
    const v = await seedVehicle();
    await approve(v);

    expect(await listingStatus(v)).toBe(LISTING_STATUS.ACTIVE);
    expect(await inSearch(v)).toBe(true);

    const detail = await vehicles.getOne(tenantId, v);
    expect(detail.marketplaceEnabled).toBe(true);
    expect(detail.isMarketplaceVisible).toBe(true);
    expect(detail.marketplaceVisibilityReason).toBe(MARKETPLACE_VISIBILITY_REASON.VISIBLE);
  });

  maybe('approved_public + marketplaceEnabled=false → listing hidden, KHÔNG đổi publicStatus', async () => {
    const v = await seedVehicle();
    await approve(v);

    const after = await vehicles.setMarketplaceVisibility(tenantId, v, ownerId, false);

    expect(await listingStatus(v)).toBe(LISTING_STATUS.HIDDEN);
    expect(await inSearch(v)).toBe(false);
    // Trục kiểm duyệt KHÔNG bị đụng tới — đó là toàn bộ điểm của ADR 0048.
    expect(after.publicStatus).toBe(VEHICLE_PUBLIC_STATUS.APPROVED_PUBLIC);
    expect(after.marketplaceEnabled).toBe(false);
    expect(after.isMarketplaceVisible).toBe(false);
    expect(after.marketplaceVisibilityReason).toBe(MARKETPLACE_VISIBILITY_REASON.OWNER_PAUSED);
  });

  maybe('bật lại xe approved → active ngay, KHÔNG sinh phiếu duyệt mới', async () => {
    const v = await seedVehicle();
    await approve(v);
    const tasksBefore = await prisma.approvalTask.count({
      where: { targetType: APPROVAL_TARGET_TYPE.VEHICLE, targetId: v },
    });

    await vehicles.setMarketplaceVisibility(tenantId, v, ownerId, false);
    const after = await vehicles.setMarketplaceVisibility(tenantId, v, ownerId, true);

    expect(after.isMarketplaceVisible).toBe(true);
    expect(await listingStatus(v)).toBe(LISTING_STATUS.ACTIVE);
    expect(await inSearch(v)).toBe(true);
    expect(
      await prisma.approvalTask.count({
        where: { targetType: APPROVAL_TARGET_TYPE.VEHICLE, targetId: v },
      }),
    ).toBe(tasksBefore);
  });

  maybe('gian hàng ngừng hoạt động thắng cả hai trục kia trong lý do trả về', async () => {
    const v = await seedVehicle();
    await approve(v);
    await prisma.tenant.update({
      where: { id: tenantId },
      data: { status: TENANT_STATUS.SUSPENDED },
    });

    const detail = await vehicles.getOne(tenantId, v);
    expect(detail.isMarketplaceVisible).toBe(false);
    expect(detail.marketplaceVisibilityReason).toBe(MARKETPLACE_VISIBILITY_REASON.SHOP_INACTIVE);

    await prisma.tenant.update({ where: { id: tenantId }, data: { status: TENANT_STATUS.ACTIVE } });
  });
});

/* ─── Tắt KHÔNG chạm vào bất cứ thứ gì đang chạy ─────────────────────────── */

describe('ADR 0048 điều 2 — tắt hiển thị không đụng nghiệp vụ đang chạy', () => {
  maybe('yêu cầu, lịch bận và trạng thái vận hành đều nguyên vẹn sau khi tắt', async () => {
    const v = await seedVehicle();
    await approve(v);

    const pickupAt = new Date(Date.now() + 86_400_000);
    const returnAt = new Date(Date.now() + 3 * 86_400_000);
    const requestId = newId();
    await prisma.bookingRequest.create({
      data: {
        id: requestId,
        tenantId,
        vehicleId: v,
        customerUserId: customerId,
        customerName: 'Khách',
        customerPhone: '0900000001',
        status: BOOKING_REQUEST_STATUS.PENDING_HOST_APPROVAL,
        pickupAt,
        returnAt,
        respondBy: new Date(Date.now() + 3_600_000),
      },
    });
    const occupancyId = newId();
    await prisma.vehicleOccupancy.create({
      data: {
        id: occupancyId,
        tenantId,
        vehicleId: v,
        sourceType: OCCUPANCY_SOURCE_TYPE.BOOKING,
        sourceId: newId(),
        startAt: pickupAt,
        endAt: returnAt,
      },
    });
    const before = await prisma.vehicle.findUniqueOrThrow({
      where: { id: v },
      select: { operationStatus: true },
    });

    await vehicles.setMarketplaceVisibility(tenantId, v, ownerId, false);

    const request = await prisma.bookingRequest.findUniqueOrThrow({
      where: { id: requestId },
      select: { status: true },
    });
    expect(request.status).toBe(BOOKING_REQUEST_STATUS.PENDING_HOST_APPROVAL);
    expect(await prisma.vehicleOccupancy.count({ where: { id: occupancyId } })).toBe(1);
    expect(
      (await prisma.vehicle.findUniqueOrThrow({ where: { id: v }, select: { operationStatus: true } }))
        .operationStatus,
    ).toBe(before.operationStatus);
  });
});

/* ─── Cổng bật ───────────────────────────────────────────────────────────── */

describe('ADR 0048 điều 3 — chỉ xe đã duyệt mới bật lên được', () => {
  maybe('xe nháp: VEHICLE_NOT_APPROVED_PUBLIC, và không ghi gì vào DB', async () => {
    const v = await seedVehicle();
    await prisma.vehicle.update({ where: { id: v }, data: { marketplaceEnabled: false } });

    await expect(vehicles.setMarketplaceVisibility(tenantId, v, ownerId, true)).rejects.toMatchObject(
      { response: { code: API_ERROR_CODE.VEHICLE_NOT_APPROVED_PUBLIC } },
    );
    const row = await prisma.vehicle.findUniqueOrThrow({
      where: { id: v },
      select: { marketplaceEnabled: true, publicStatus: true },
    });
    expect(row.marketplaceEnabled).toBe(false);
    expect(row.publicStatus).toBe(VEHICLE_PUBLIC_STATUS.DRAFT);
  });

  maybe('xe đang chờ duyệt và xe bị từ chối cũng không bật được', async () => {
    const pending = await seedVehicle();
    await vehicles.submitForPublicReview(tenantId, pending, ownerId);
    await prisma.vehicle.update({ where: { id: pending }, data: { marketplaceEnabled: false } });
    await expect(
      vehicles.setMarketplaceVisibility(tenantId, pending, ownerId, true),
    ).rejects.toMatchObject({ response: { code: API_ERROR_CODE.VEHICLE_NOT_APPROVED_PUBLIC } });

    const rejected = await seedVehicle();
    await prisma.vehicle.update({
      where: { id: rejected },
      data: { publicStatus: VEHICLE_PUBLIC_STATUS.REJECTED, marketplaceEnabled: false },
    });
    await expect(
      vehicles.setMarketplaceVisibility(tenantId, rejected, ownerId, true),
    ).rejects.toMatchObject({ response: { code: API_ERROR_CODE.VEHICLE_NOT_APPROVED_PUBLIC } });
  });

  maybe('xe bị NỀN TẢNG ẩn: mã riêng VEHICLE_PLATFORM_HIDDEN, chủ xe không tự mở lại', async () => {
    const v = await seedVehicle();
    await approve(v);
    await platformVehicles.hide(v, reviewerId, { reason: 'Ảnh sai xe' } as never);
    await prisma.vehicle.update({ where: { id: v }, data: { marketplaceEnabled: false } });

    await expect(vehicles.setMarketplaceVisibility(tenantId, v, ownerId, true)).rejects.toMatchObject(
      { response: { code: API_ERROR_CODE.VEHICLE_PLATFORM_HIDDEN } },
    );
    expect(await listingStatus(v)).toBe(LISTING_STATUS.HIDDEN);
  });

  maybe('gian hàng bị khoá: SHOP_NOT_ACTIVE khi bật, nhưng TẮT thì vẫn được', async () => {
    const v = await seedVehicle();
    await approve(v);
    await vehicles.setMarketplaceVisibility(tenantId, v, ownerId, false);
    await prisma.tenant.update({
      where: { id: tenantId },
      data: { status: TENANT_STATUS.SUSPENDED },
    });

    await expect(vehicles.setMarketplaceVisibility(tenantId, v, ownerId, true)).rejects.toMatchObject(
      { response: { code: API_ERROR_CODE.SHOP_NOT_ACTIVE } },
    );

    // Tắt LUÔN được — kể cả khi gian hàng đang khoá (ADR 0048 điều 3).
    await prisma.vehicle.update({ where: { id: v }, data: { marketplaceEnabled: true } });
    const off = await vehicles.setMarketplaceVisibility(tenantId, v, ownerId, false);
    expect(off.marketplaceEnabled).toBe(false);

    await prisma.tenant.update({ where: { id: tenantId }, data: { status: TENANT_STATUS.ACTIVE } });
  });
});

/* ─── Kiểm duyệt của nền tảng và lựa chọn của chủ xe không ghi đè nhau ───── */

describe('ADR 0048 điều 4 — admin bỏ ẩn vẫn tôn trọng lựa chọn của chủ xe', () => {
  maybe('unhide một xe đang bị chủ xe tắt: publicStatus về approved nhưng listing vẫn hidden', async () => {
    const v = await seedVehicle();
    await approve(v);
    await vehicles.setMarketplaceVisibility(tenantId, v, ownerId, false);
    await platformVehicles.hide(v, reviewerId, { reason: 'Kiểm tra' } as never);

    await platformVehicles.unhide(v, reviewerId);

    const row = await prisma.vehicle.findUniqueOrThrow({
      where: { id: v },
      select: { publicStatus: true, marketplaceEnabled: true },
    });
    expect(row.publicStatus).toBe(VEHICLE_PUBLIC_STATUS.APPROVED_PUBLIC);
    // Admin KHÔNG được bật hộ công tắc của chủ xe.
    expect(row.marketplaceEnabled).toBe(false);
    expect(await listingStatus(v)).toBe(LISTING_STATUS.HIDDEN);
    expect(await inSearch(v)).toBe(false);

    // …và chủ xe bật lại thì xe hiện ngay, không cần duyệt lần nữa.
    await vehicles.setMarketplaceVisibility(tenantId, v, ownerId, true);
    expect(await listingStatus(v)).toBe(LISTING_STATUS.ACTIVE);
  });

  maybe('xe bị nền tảng ẩn KHÔNG còn nằm trong bộ trạng thái gửi duyệt lại', async () => {
    const v = await seedVehicle();
    await approve(v);
    await platformVehicles.hide(v, reviewerId, { reason: 'Vi phạm' } as never);

    await expect(vehicles.submitForPublicReview(tenantId, v, ownerId)).rejects.toMatchObject({
      response: { code: API_ERROR_CODE.INVALID_STATUS_TRANSITION },
    });
  });
});

/* ─── Idempotent + scope ─────────────────────────────────────────────────── */

describe('ADR 0048 — idempotent, tenant scope', () => {
  maybe('gửi lại cùng giá trị: không lỗi, và KHÔNG có dòng audit thứ hai', async () => {
    const v = await seedVehicle();
    await approve(v);

    await vehicles.setMarketplaceVisibility(tenantId, v, ownerId, false);
    expect(await visibilityAudits(v)).toBe(1);

    await vehicles.setMarketplaceVisibility(tenantId, v, ownerId, false);
    await vehicles.setMarketplaceVisibility(tenantId, v, ownerId, false);
    expect(await visibilityAudits(v)).toBe(1);

    // Đổi thật thì có dòng mới, kèm before/after.
    await vehicles.setMarketplaceVisibility(tenantId, v, ownerId, true);
    expect(await visibilityAudits(v)).toBe(2);
    const last = await prisma.auditLog.findFirstOrThrow({
      where: { targetId: v, action: 'vehicle.marketplace_visibility.update' },
      orderBy: { createdAt: 'desc' },
      select: { beforeJson: true, afterJson: true, actorUserId: true, actorScope: true },
    });
    expect(last.beforeJson).toEqual({ marketplaceEnabled: false });
    expect(last.afterJson).toEqual({ marketplaceEnabled: true });
    expect(last.actorUserId).toBe(ownerId);
    expect(last.actorScope).toBe('tenant');
  });

  maybe('xe của gian hàng khác: 404, và bản ghi bên kia không suy suyển', async () => {
    const otherBranchId = await seedBranch(asService, {
      tenantId: otherTenantId,
      provinceCode: PROV,
    });
    const foreign = await seedVehicle({ tenantId: otherTenantId, branchId: otherBranchId });

    await expect(
      vehicles.setMarketplaceVisibility(tenantId, foreign, ownerId, false),
    ).rejects.toMatchObject({ response: { code: API_ERROR_CODE.NOT_FOUND } });

    const row = await prisma.vehicle.findUniqueOrThrow({
      where: { id: foreign },
      select: { marketplaceEnabled: true },
    });
    expect(row.marketplaceEnabled).toBe(true);
    expect(await visibilityAudits(foreign)).toBe(0);
  });
});

/* ─── Màn kiểm duyệt đọc được CẢ HAI trục ────────────────────────────────── */

describe('ADR 0048 — bảng xe toàn hệ thống của nền tảng', () => {
  maybe('trả lựa chọn của chủ xe + kết quả hiệu lực + lý do, không bắt admin tự ghép', async () => {
    const v = await seedVehicle();
    await approve(v);

    const live = await platformVehicles.getOne(v);
    expect(live.marketplaceEnabled).toBe(true);
    expect(live.isMarketplaceVisible).toBe(true);
    expect(live.marketplaceVisibilityReason).toBe(MARKETPLACE_VISIBILITY_REASON.VISIBLE);

    await vehicles.setMarketplaceVisibility(tenantId, v, ownerId, false);

    const paused = await platformVehicles.getOne(v);
    // `public_status` vẫn `approved_public` — đúng cái làm người kiểm duyệt bối rối nếu thiếu
    // hai trường dưới.
    expect(paused.publicStatus).toBe(VEHICLE_PUBLIC_STATUS.APPROVED_PUBLIC);
    expect(paused.marketplaceEnabled).toBe(false);
    expect(paused.isMarketplaceVisible).toBe(false);
    expect(paused.marketplaceVisibilityReason).toBe(MARKETPLACE_VISIBILITY_REASON.OWNER_PAUSED);
  });

  maybe('lọc "đang hiển thị" theo KẾT QUẢ: xe chủ xe tạm ẩn rơi ra khỏi danh sách', async () => {
    const live = await seedVehicle();
    const paused = await seedVehicle();
    await approve(live);
    await approve(paused);
    await vehicles.setMarketplaceVisibility(tenantId, paused, ownerId, false);

    const idsOf = async (marketplaceVisible: boolean | undefined): Promise<string[]> => {
      const res = await platformVehicles.list({ tenantId, limit: 100, marketplaceVisible } as never);
      return res.data.map((row) => row.id);
    };

    // Lọc theo trạng thái KIỂM DUYỆT thì cả hai cùng lọt — đây chính là lỗi của nhãn cũ.
    const approved = await platformVehicles.list({
      tenantId,
      limit: 100,
      publicStatus: VEHICLE_PUBLIC_STATUS.APPROVED_PUBLIC,
    } as never);
    const approvedIds = approved.data.map((row) => row.id);
    expect(approvedIds).toContain(live);
    expect(approvedIds).toContain(paused);

    const visible = await idsOf(true);
    expect(visible).toContain(live);
    expect(visible).not.toContain(paused);

    const invisible = await idsOf(false);
    expect(invisible).toContain(paused);
    expect(invisible).not.toContain(live);
  });

  maybe('gian hàng bị khoá: mọi xe của nó rơi khỏi bộ lọc "đang hiển thị"', async () => {
    const v = await seedVehicle();
    await approve(v);
    await prisma.tenant.update({
      where: { id: tenantId },
      data: { status: TENANT_STATUS.SUSPENDED },
    });

    const res = await platformVehicles.list({
      tenantId,
      limit: 100,
      marketplaceVisible: true,
    } as never);
    expect(res.data.map((row) => row.id)).not.toContain(v);

    await prisma.tenant.update({ where: { id: tenantId }, data: { status: TENANT_STATUS.ACTIVE } });
  });
});

/* ─── Không có đường vòng nào cho khách ──────────────────────────────────── */

describe('ADR 0048 — xe đang tắt không đi vòng được qua bất kỳ đường công khai nào', () => {
  maybe('chi tiết xe ngoài chợ trả 404 dù biết đúng id', async () => {
    const v = await seedVehicle();
    await approve(v);
    expect((await publicListings.getById(v)).id).toBe(v);

    await vehicles.setMarketplaceVisibility(tenantId, v, ownerId, false);

    await expect(publicListings.getById(v)).rejects.toMatchObject({
      response: { code: API_ERROR_CODE.NOT_FOUND },
    });
  });
});

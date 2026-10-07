import { createPrismaClient, newId } from '@xeprime/prisma';
import {
  ACCOUNT_REALM,
  API_ERROR_CODE,
  LISTING_STATUS,
  PLATFORM_VEHICLE_SORT,
  SERVICE_TYPE,
  TENANT_STATUS,
  VEHICLE_OPERATION_STATUS,
  VEHICLE_PUBLIC_STATUS,
  VEHICLE_TYPE,
} from '@xeprime/types';
import { AuditService } from '../src/modules/audit/audit.service';
import { PlatformVehiclesService } from '../src/modules/platform-admin/platform-vehicles.service';
import { ListingsService } from '../src/modules/public-listings/listings.service';
import type { PrismaService } from '../src/prisma/prisma.service';

/**
 * Phase 7 — Xe toàn hệ thống + kiểm duyệt ẩn/bỏ ẩn, chạy trên PostgreSQL THẬT.
 *
 * Điểm quan trọng nhất được kiểm chứng: ẩn xe KHÔNG chỉ đổi `publicStatus` mà còn hạ snapshot
 * `public_listings` xuống `hidden` trong cùng transaction (ADR 0008) — nếu không, xe vẫn nằm
 * trên Marketplace dù admin đã ẩn.
 */
const prisma = createPrismaClient();
const asService = prisma as unknown as PrismaService;
const service = new PlatformVehiclesService(
  asService,
  new AuditService(asService),
  new ListingsService(asService),
);

let dbAvailable = false;
let adminId: string;
let activeTenant: string;
let suspendedTenant: string;
let publicVehicle: string;
let draftVehicle: string;
let otherShopVehicle: string;
/** Xe thứ hai của gian hàng bị khoá — giá rẻ hơn, dịch vụ có tài xế: để kiểm sắp xếp và lọc dịch vụ. */
let cheapVehicle: string;
let branchId: string;
let tag: string;

/** Mã tỉnh TP. Hồ Chí Minh — bảng `provinces` do migration nạp sẵn. */
const HCM_PROVINCE_CODE = '79';

beforeAll(async () => {
  try {
    await prisma.$connect();
    await prisma.$queryRaw`SELECT 1`;
    dbAvailable = true;
  } catch {
    console.warn('\n[skip] Không kết nối được PostgreSQL. Chạy `pnpm db:up` trước.\n');
    return;
  }

  adminId = newId();
  activeTenant = newId();
  suspendedTenant = newId();
  publicVehicle = newId();
  draftVehicle = newId();
  otherShopVehicle = newId();
  cheapVehicle = newId();
  branchId = newId();
  tag = activeTenant.slice(-6);

  await prisma.user.create({
    data: {
      realm: ACCOUNT_REALM.PARTNER,
      id: adminId,
      displayName: 'Admin',
      email: `pv-${adminId}@xeprime.test`,
    },
  });

  const mkTenant = (id: string, status: string) =>
    prisma.tenant.create({
      data: {
        id,
        code: `T-${id.slice(-8)}`,
        slug: `t-${id.toLowerCase().slice(-10)}`,
        name: `Shop-${id.slice(-6)}`,
        status,
        ownerUserId: adminId,
      },
    });
  await mkTenant(activeTenant, TENANT_STATUS.ACTIVE);
  await mkTenant(suspendedTenant, TENANT_STATUS.SUSPENDED);

  // Chi nhánh gắn xe = vị trí công khai của xe (cùng nguồn `public_listings` đọc).
  await prisma.tenantBranch.create({
    data: {
      id: branchId,
      tenantId: activeTenant,
      code: `CN${branchId.slice(-4)}`,
      name: `Chi nhanh-${tag}`,
      provinceCode: HCM_PROVINCE_CODE,
      addressLine: '12 Nguyễn Huệ',
      isDefault: true,
    },
  });

  const mkVehicle = (
    id: string,
    tenantId: string,
    name: string,
    publicStatus: string,
    extra: { weekdayPrice?: string | null; serviceTypes?: string[]; branchId?: string } = {},
  ) =>
    prisma.vehicle.create({
      data: {
        id,
        tenantId,
        code: `XE-${id.slice(-6)}`,
        name,
        plateNumber: `51A-${id.slice(-5)}`,
        vehicleType: VEHICLE_TYPE.CAR,
        publicStatus,
        operationStatus: VEHICLE_OPERATION_STATUS.AVAILABLE,
        weekdayPrice: '700000',
        ...extra,
      },
    });
  await mkVehicle(
    publicVehicle,
    activeTenant,
    `Vios-${tag}`,
    VEHICLE_PUBLIC_STATUS.APPROVED_PUBLIC,
    { branchId },
  );
  await mkVehicle(draftVehicle, activeTenant, `Nhap-${tag}`, VEHICLE_PUBLIC_STATUS.DRAFT);
  await mkVehicle(
    otherShopVehicle,
    suspendedTenant,
    `Khoa-${tag}`,
    VEHICLE_PUBLIC_STATUS.APPROVED_PUBLIC,
  );
  await mkVehicle(cheapVehicle, suspendedTenant, `Re-${tag}`, VEHICLE_PUBLIC_STATUS.DRAFT, {
    weekdayPrice: '300000',
    serviceTypes: [SERVICE_TYPE.WITH_DRIVER],
  });

  // Ảnh: đại diện + gallery có lặp lại chính ảnh đại diện — chi tiết phải khử trùng.
  await prisma.vehicle.update({
    where: { id: publicVehicle },
    data: { mainImageUrl: `https://img.test/${tag}/main.jpg` },
  });
  await prisma.vehicleImage.createMany({
    data: [
      {
        id: newId(),
        vehicleId: publicVehicle,
        tenantId: activeTenant,
        imageUrl: `https://img.test/${tag}/2.jpg`,
        sortOrder: 2,
      },
      {
        id: newId(),
        vehicleId: publicVehicle,
        tenantId: activeTenant,
        imageUrl: `https://img.test/${tag}/main.jpg`,
        sortOrder: 0,
      },
      {
        id: newId(),
        vehicleId: publicVehicle,
        tenantId: activeTenant,
        imageUrl: `https://img.test/${tag}/1.jpg`,
        sortOrder: 1,
      },
    ],
  });

  // Snapshot Marketplace của xe đã duyệt — dựng qua chính writer hợp lệ (ADR 0008).
  const listings = new ListingsService(asService);
  await listings.syncFromVehicle(publicVehicle);
  await listings.syncFromVehicle(otherShopVehicle);
});

afterAll(async () => {
  if (dbAvailable) {
    const tenantIds = [activeTenant, suspendedTenant];
    await prisma.auditLog.deleteMany({ where: { tenantId: { in: tenantIds } } });
    await prisma.publicListing.deleteMany({ where: { tenantId: { in: tenantIds } } });
    await prisma.vehicle.deleteMany({ where: { tenantId: { in: tenantIds } } });
    await prisma.tenantBranch.deleteMany({ where: { tenantId: { in: tenantIds } } });
    await prisma.tenant.deleteMany({ where: { id: { in: tenantIds } } });
    await prisma.user.deleteMany({ where: { id: adminId } });
  }
  await prisma.$disconnect();
});

const maybe = (name: string, fn: () => Promise<void>) =>
  it(name, async () => {
    if (!dbAvailable) return;
    await fn();
  });

describe('Platform vehicles (Phase 7)', () => {
  maybe('list: tìm theo tên/biển số, lọc trạng thái duyệt + trạng thái gian hàng', async () => {
    const byName = await service.list({ q: `Vios-${tag}` });
    expect(byName.data.map((v) => v.id)).toContain(publicVehicle);
    expect(byName.data[0]?.tenantName).toMatch(/^Shop-/);
    expect(byName.data[0]?.listingStatus).toBe(LISTING_STATUS.ACTIVE);

    const row = byName.data.find((v) => v.id === publicVehicle);
    // Service trả Decimal; ResponseInterceptor mới ép sang string ở biên HTTP (ADR 0007).
    // Điều cần chắc ở tầng này: giá trị không bị làm tròn/đổi kiểu trên đường đi.
    expect(String(row?.weekdayPrice)).toBe('700000');

    const byPlate = await service.list({ q: publicVehicle.slice(-5) });
    expect(byPlate.data.map((v) => v.id)).toContain(publicVehicle);

    const drafts = await service.list({
      tenantId: activeTenant,
      publicStatus: VEHICLE_PUBLIC_STATUS.DRAFT,
    });
    expect(drafts.data.map((v) => v.id)).toEqual([draftVehicle]);
    // Xe chưa từng duyệt thì không có snapshot.
    expect(drafts.data[0]?.listingStatus).toBeNull();

    const ofSuspended = await service.list({
      tenantStatus: TENANT_STATUS.SUSPENDED,
      q: `Khoa-${tag}`,
    });
    expect(ofSuspended.data.map((v) => v.id)).toEqual([otherShopVehicle]);
  });

  maybe('phân trang: limit=1 trong 1 tenant → hasNext đúng, không trùng dòng', async () => {
    const p1 = await service.list({ tenantId: activeTenant, limit: 1, page: 1 });
    expect(p1.data).toHaveLength(1);
    expect(p1.meta).toMatchObject({ page: 1, limit: 1, total: 2, hasNext: true });

    const p2 = await service.list({ tenantId: activeTenant, limit: 1, page: 2 });
    expect(p2.meta.hasNext).toBe(false);
    expect(p1.data[0]!.id).not.toBe(p2.data[0]!.id);
  });

  maybe('sắp xếp ở server: giá hai chiều, tên A→Z, NULL giá luôn xuống cuối', async () => {
    const scope = { tenantId: suspendedTenant };
    const ids = (res: { data: { id: string }[] }) => res.data.map((v) => v.id);

    expect(ids(await service.list({ ...scope, sort: PLATFORM_VEHICLE_SORT.PRICE_ASC }))).toEqual([
      cheapVehicle,
      otherShopVehicle,
    ]);
    expect(ids(await service.list({ ...scope, sort: PLATFORM_VEHICLE_SORT.PRICE_DESC }))).toEqual([
      otherShopVehicle,
      cheapVehicle,
    ]);
    // "Khoa-…" < "Re-…"
    expect(ids(await service.list({ ...scope, sort: PLATFORM_VEHICLE_SORT.NAME }))).toEqual([
      otherShopVehicle,
      cheapVehicle,
    ]);

    // Xe chưa đặt giá không phải "giá 0": đứng cuối ở cả hai chiều.
    await prisma.vehicle.update({ where: { id: cheapVehicle }, data: { weekdayPrice: null } });
    try {
      expect(ids(await service.list({ ...scope, sort: PLATFORM_VEHICLE_SORT.PRICE_ASC }))).toEqual(
        [otherShopVehicle, cheapVehicle],
      );
      expect(
        ids(await service.list({ ...scope, sort: PLATFORM_VEHICLE_SORT.PRICE_DESC })),
      ).toEqual([otherShopVehicle, cheapVehicle]);
    } finally {
      await prisma.vehicle.update({
        where: { id: cheapVehicle },
        data: { weekdayPrice: '300000' },
      });
    }
  });

  maybe('lọc theo dịch vụ (mảng) và theo tỉnh của CHI NHÁNH gắn xe', async () => {
    const withDriver = await service.list({
      tenantId: suspendedTenant,
      serviceType: SERVICE_TYPE.WITH_DRIVER,
    });
    expect(withDriver.data.map((v) => v.id)).toEqual([cheapVehicle]);

    const hcm = await service.list({ tenantId: activeTenant, provinceCode: HCM_PROVINCE_CODE });
    expect(hcm.data.map((v) => v.id)).toEqual([publicVehicle]);
    // Tên tỉnh trên dòng đến từ chi nhánh (bảng `provinces`), không phải hồ sơ gian hàng.
    expect(hcm.data[0]?.provinceName).toBe('Hồ Chí Minh');

    const nowhere = await service.list({ tenantId: activeTenant, provinceCode: 'ZZ' });
    expect(nowhere.data).toEqual([]);
  });

  maybe('counts: cùng phạm vi lọc với bảng nhưng KHÔNG bị góc nhìn đang chọn thu hẹp', async () => {
    const scoped = await service.list({ tenantId: suspendedTenant });
    expect(scoped.counts).toEqual({
      all: 2,
      visible: 0,
      pending_review: 0,
      platform_hidden: 0,
      suspended_shop: 2,
    });

    // Đứng ở góc nhìn "nháp": bảng còn một dòng, nhưng số của các góc nhìn khác vẫn nguyên.
    const drafts = await service.list({
      tenantId: suspendedTenant,
      publicStatus: VEHICLE_PUBLIC_STATUS.DRAFT,
    });
    expect(drafts.data.map((v) => v.id)).toEqual([cheapVehicle]);
    expect(drafts.counts.all).toBe(2);
    expect(drafts.counts.suspended_shop).toBe(2);

    // Bộ lọc NGOÀI góc nhìn (dịch vụ) thì thu hẹp cả số đếm.
    const narrowed = await service.list({
      tenantId: suspendedTenant,
      serviceType: SERVICE_TYPE.WITH_DRIVER,
    });
    expect(narrowed.counts.all).toBe(1);

    const live = await service.list({ tenantId: activeTenant });
    expect(live.counts.visible).toBe(1);
    expect(live.counts.all).toBe(2);
  });

  maybe('chi tiết: ảnh khử trùng (đại diện đứng đầu), chi nhánh, chủ shop, chưa có phiếu duyệt', async () => {
    const detail = await service.getOne(publicVehicle);
    expect(detail.images).toEqual([
      `https://img.test/${tag}/main.jpg`,
      `https://img.test/${tag}/1.jpg`,
      `https://img.test/${tag}/2.jpg`,
    ]);
    expect(detail.branchName).toBe(`Chi nhanh-${tag}`);
    expect(detail.branchAddress).toBe('12 Nguyễn Huệ');
    expect(detail.provinceName).toBe('Hồ Chí Minh');
    expect(detail.ownerName).toBe('Admin');
    expect(detail.latestApproval).toBeNull();
    expect(detail.platformHide).toBeNull();
    expect(detail.deliveryEnabled).toBe(false);

    const bare = await service.getOne(draftVehicle);
    expect(bare.images).toEqual([]);
    expect(bare.branchName).toBeNull();
  });

  maybe('ẩn xe: publicStatus → hidden, snapshot Marketplace → hidden, ghi audit', async () => {
    const res = await service.hide(publicVehicle, adminId, { reason: 'Ảnh vi phạm' });
    expect(res.publicStatus).toBe(VEHICLE_PUBLIC_STATUS.HIDDEN);
    expect(res.listingStatus).toBe(LISTING_STATUS.HIDDEN);
    // Lượt ẩn đang hiệu lực kể lại được: lý do + ai + lúc nào — người gỡ ẩn phải đọc trước khi bấm.
    expect(res.platformHide).toMatchObject({ reason: 'Ảnh vi phạm', hiddenByName: 'Admin' });

    const listing = await prisma.publicListing.findUnique({ where: { vehicleId: publicVehicle } });
    expect(listing?.status).toBe(LISTING_STATUS.HIDDEN);

    const audit = await prisma.auditLog.findFirst({
      where: { targetId: publicVehicle, action: 'vehicle.platform_hide' },
      orderBy: { createdAt: 'desc' },
    });
    expect(audit?.actorScope).toBe('platform');
    expect(audit?.afterJson).toMatchObject({ reason: 'Ảnh vi phạm' });
  });

  maybe('ẩn lần nữa → INVALID_STATUS_TRANSITION (không ghi đè im lặng)', async () => {
    await expect(service.hide(publicVehicle, adminId, { reason: 'x' })).rejects.toMatchObject({
      response: { code: API_ERROR_CODE.INVALID_STATUS_TRANSITION },
    });
  });

  maybe('bỏ ẩn: hidden → approved_public, snapshot bật lại active', async () => {
    const res = await service.unhide(publicVehicle, adminId);
    expect(res.publicStatus).toBe(VEHICLE_PUBLIC_STATUS.APPROVED_PUBLIC);
    expect(res.listingStatus).toBe(LISTING_STATUS.ACTIVE);
    expect(res.platformHide).toBeNull();

    const listing = await prisma.publicListing.findUnique({ where: { vehicleId: publicVehicle } });
    expect(listing?.status).toBe(LISTING_STATUS.ACTIVE);
  });

  maybe('không ẩn được xe chưa duyệt public; không bỏ ẩn được xe đang hiển thị', async () => {
    await expect(service.hide(draftVehicle, adminId, { reason: 'x' })).rejects.toMatchObject({
      response: { code: API_ERROR_CODE.INVALID_STATUS_TRANSITION },
    });
    await expect(service.unhide(publicVehicle, adminId)).rejects.toMatchObject({
      response: { code: API_ERROR_CODE.INVALID_STATUS_TRANSITION },
    });
  });

  maybe('getOne / hide với id lạ → NOT_FOUND', async () => {
    await expect(service.getOne(newId())).rejects.toMatchObject({
      response: { code: API_ERROR_CODE.NOT_FOUND },
    });
    await expect(service.hide(newId(), adminId, { reason: 'x' })).rejects.toMatchObject({
      response: { code: API_ERROR_CODE.NOT_FOUND },
    });
  });
});

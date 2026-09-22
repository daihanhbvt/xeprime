import { createPrismaClient, newId } from '@xeprime/prisma';
import {
  BILLING_MODE,
  PLAN_STATUS,
  STOREFRONT_KIND,
  SUBSCRIPTION_STATUS,
  TENANT_STATUS,
  VEHICLE_PUBLIC_STATUS,
  VEHICLE_TYPE,
} from '@xeprime/types';
import { ListingsService } from '../src/modules/public-listings/listings.service';
import type { PrismaService } from '../src/prisma/prisma.service';
import { makePublicListingsService, seedBranch } from './helpers/service-factory';

/**
 * Phase 3 — trang gian hàng công khai `/shops/[slug]` chạy trên PostgreSQL THẬT. Kiểm chứng:
 * chỉ shop `active` mở được (404 nếu draft/không tồn tại), chỉ xe `approved_public` của đúng shop
 * lọt, và phân trang `meta` đúng. Không có DB thì tự skip.
 *
 * Chạy: pnpm db:up && pnpm --filter @xeprime/api test
 */
const prisma = createPrismaClient();
const asService = prisma as unknown as PrismaService;
const service = makePublicListingsService(asService);
const listings = new ListingsService(asService);

/** Tỉnh chính thức 79 — có sẵn sau migration danh mục, không cần seed riêng. */
const PROV = '79';
const PROV_NAME = 'Hồ Chí Minh';
const OWNER_AVATAR = 'https://img.example/owner-avatar.jpg';
const branchByTenant = new Map<string, string>();

let dbAvailable = false;
let ownerId: string;
let activeTenantId: string;
let draftTenantId: string;
let otherTenantId: string;
let activeSlug: string;
let draftSlug: string;
let otherSlug: string;
let packagePlanId: string;

async function seedTenant(status: string): Promise<{ id: string; slug: string }> {
  const id = newId();
  const slug = `shop-${id.toLowerCase().slice(-10)}`;
  await prisma.tenant.create({
    data: {
      id,
      code: `T-${id.slice(-8)}`,
      slug,
      name: `Shop ${status}`,
      status,
      ownerUserId: ownerId,
      ratingAvg: '4.50',
      ratingCount: 3,
    },
  });
  // Tỉnh CHÍNH THỨC (79 = Hồ Chí Minh) có sẵn trong mọi database sau migration danh mục —
  // spec không phải tự dựng dữ liệu tham chiếu.
  await prisma.tenantProfile.create({
    data: {
      tenantId: id,
      displayName: `Shop ${status}`,
      provinceCode: PROV,
      provinceName: PROV_NAME,
    },
  });
  branchByTenant.set(id, await seedBranch(asService, { tenantId: id, provinceCode: PROV }));
  return { id, slug };
}

async function seedVehicle(tenantId: string, publicStatus: string): Promise<string> {
  const id = newId();
  await prisma.vehicle.create({
    data: {
      id,
      tenantId,
      branchId: branchByTenant.get(tenantId),
      code: `V-${id.slice(-6)}`,
      name: 'Toyota Vios',
      vehicleType: VEHICLE_TYPE.CAR,
      publicStatus,
      mainImageUrl: 'https://img.example/vios.jpg',
      weekdayPrice: '600000',
    },
  });
  return id;
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
  await prisma.user.create({
    data: {
      id: ownerId,
      displayName: 'Chủ shop',
      email: `own-${ownerId}@xeprime.test`,
      avatarUrl: OWNER_AVATAR,
    },
  });

  const active = await seedTenant(TENANT_STATUS.ACTIVE);
  const draft = await seedTenant(TENANT_STATUS.DRAFT);
  const other = await seedTenant(TENANT_STATUS.ACTIVE);
  activeTenantId = active.id;
  activeSlug = active.slug;
  draftTenantId = draft.id;
  draftSlug = draft.slug;
  otherTenantId = other.id;
  otherSlug = other.slug;

  /*
   * Shop "other" là tenant TUYẾN GÓI của spec này — nó tồn tại để thẻ xe có hai đầu để so.
   * Gói dựng qua `plans` + `tenant_subscriptions` chứ không set thẳng cờ nào: `shopVerified`
   * phải đi đúng con đường `resolveEffectiveBilling` mà request thật đi, nếu không spec sẽ
   * xanh cả khi phép chấm pha hỏng.
   */
  packagePlanId = newId();
  await prisma.plan.create({
    data: {
      id: packagePlanId,
      code: `shops-package-${packagePlanId.slice(-8).toLowerCase()}`,
      name: 'Gói theo chỗ xe',
      status: PLAN_STATUS.ACTIVE,
      billingMode: BILLING_MODE.PACKAGE,
      basePriceMonthly: 0,
    },
  });
  const subNow = Date.now();
  await prisma.tenantSubscription.create({
    data: {
      id: newId(),
      tenantId: otherTenantId,
      planId: packagePlanId,
      status: SUBSCRIPTION_STATUS.ACTIVE,
      price: 0,
      termMonths: 12,
      billingMode: BILLING_MODE.PACKAGE,
      startsAt: new Date(subNow - 60_000),
      endsAt: new Date(subNow + 365 * 24 * 60 * 60 * 1000),
    },
  });

  // Shop active: 2 xe approved + 1 draft + 1 hidden (chỉ 2 approved được hiển thị).
  await seedVehicle(activeTenantId, VEHICLE_PUBLIC_STATUS.APPROVED_PUBLIC);
  await seedVehicle(activeTenantId, VEHICLE_PUBLIC_STATUS.APPROVED_PUBLIC);
  await seedVehicle(activeTenantId, VEHICLE_PUBLIC_STATUS.DRAFT);
  await seedVehicle(activeTenantId, VEHICLE_PUBLIC_STATUS.HIDDEN);
  // Shop khác: 1 xe approved — không được lọt vào danh sách của shop active.
  await seedVehicle(otherTenantId, VEHICLE_PUBLIC_STATUS.APPROVED_PUBLIC);

  // Reads đọc từ public_listings (ADR 0008) → sync mọi xe seed vào snapshot.
  const seeded = await prisma.vehicle.findMany({
    where: { tenantId: { in: [activeTenantId, draftTenantId, otherTenantId] } },
    select: { id: true },
  });
  for (const { id } of seeded) await listings.syncFromVehicle(id);
});

afterAll(async () => {
  if (dbAvailable) {
    const tenantIds = [activeTenantId, draftTenantId, otherTenantId];
    await prisma.vehicle.deleteMany({ where: { tenantId: { in: tenantIds } } });
    await prisma.tenantSubscription.deleteMany({ where: { tenantId: { in: tenantIds } } });
    await prisma.plan.deleteMany({ where: { id: packagePlanId } });
    await prisma.tenantProfile.deleteMany({ where: { tenantId: { in: tenantIds } } });
    await prisma.tenantBranch.deleteMany({ where: { tenantId: { in: tenantIds } } });
    await prisma.tenant.deleteMany({ where: { id: { in: tenantIds } } });
    await prisma.user.deleteMany({ where: { id: ownerId } });
  }
  await prisma.$disconnect();
});

const maybe = (name: string, fn: () => Promise<void>) =>
  it(name, async () => {
    if (!dbAvailable) return;
    await fn();
  });

describe('Public shop page (/shops/[slug])', () => {
  maybe('getShopBySlug shop active → hồ sơ công khai (rating string)', async () => {
    const shop = await service.getShopBySlug(activeSlug);
    expect(shop.slug).toBe(activeSlug);
    // Tên CHUẨN từ danh mục ('Hồ Chí Minh'), không phải chuỗi tự do kiểu 'TP. Hồ Chí Minh'.
    expect(shop.provinceName).toBe(PROV_NAME);
    expect(shop.ratingCount).toBe(3);
    // ADR 0007: tiền/decimal qua JSON là string (ResponseInterceptor ép ở tầng response;
    // ở service Decimal vẫn là Decimal nên so khớp giá trị).
    expect(String(shop.ratingAvg)).toBe('4.5');
  });

  /*
   * Ba tenant trong spec này KHÔNG có dòng thuê bao nào ⇒ `resolveEffectiveBilling` trả
   * `unconfigured`. Đây chính là ca mà ADR 0038 điều 1 cấm mặc định về tuyến gói, và trên trang
   * công khai thì hậu quả cụ thể là DẤU XÁC THỰC: gắn nó cho một tenant chưa xác định được tuyến
   * là nói với khách một điều mà đường ghi tiền đang từ chối.
   */
  maybe('getShopBySlug tenant chưa có gói → mặt tiền cá nhân, KHÔNG dấu xác thực', async () => {
    const shop = await service.getShopBySlug(activeSlug);
    expect(shop.storefrontKind).toBe(STOREFRONT_KIND.PERSONAL);
    expect(shop.verified).toBe(false);
  });

  /*
   * SỐ ĐIỆN THOẠI không có mặt trên hồ sơ công khai — trang này không cần đăng nhập, nên một số
   * in ra ở đây là số bị công khai cho mọi trình thu thập. Bài test khoá điều đó ở tầng DTO chứ
   * không chỉ ở tầng vẽ: ẩn ở component thì lần sau ai đó thêm lại một nút "Gọi" là số lại ra.
   */
  maybe('getShopBySlug KHÔNG trả số điện thoại', async () => {
    const shop = await service.getShopBySlug(activeSlug);
    expect('phone' in shop).toBe(false);
  });

  /*
   * Tenant chưa xác định được tuyến ⇒ mặt tiền cá nhân ⇒ hộp thư KHÔNG mở công khai. Mặc định
   * về "mở" khi không biết là mở kênh thông báo đẩy tới một người thật dựa trên phỏng đoán.
   */
  maybe('getShopBySlug mặt tiền cá nhân → chatOpen = false', async () => {
    const shop = await service.getShopBySlug(activeSlug);
    expect(shop.chatOpen).toBe(false);
  });

  /*
   * Chưa có logo gian hàng ⇒ rơi về avatar của chủ tài khoản. Với tuyến hoa hồng, "gian hàng" và
   * "con người" là một, nên trang gian hàng hiện chữ cái trong khi chính người đó có ảnh ở góc
   * màn hình là một sự không đồng bộ mà người dùng nhìn ra ngay.
   */
  maybe('getShopBySlug chưa có logo → dùng avatar chủ tài khoản', async () => {
    const shop = await service.getShopBySlug(activeSlug);
    expect(shop.logoUrl).toBe(OWNER_AVATAR);
  });

  maybe('getShopBySlug đếm đúng số liệu hiển thị', async () => {
    const shop = await service.getShopBySlug(activeSlug);
    // 2 xe approved — cùng con số mà listShopVehicles trả, cùng luật publicListingScope().
    expect(shop.vehicleCount).toBe(2);
    expect(shop.serviceProvinceNames).toEqual([PROV_NAME]);
    expect(shop.branchCount).toBe(1);
    expect(shop.completedTripCount).toBe(0);
    /*
     * Chưa có yêu cầu thuê nào tới hạn quyết ⇒ ba chỉ số đều `null` và `sampleCount = 0`
     * (ADR 0045 điều 2). `null` KHÔNG phải 0%: "chưa ai hỏi" và "hỏi mà không trả lời" là hai
     * điều hoàn toàn khác nhau với người đang cân nhắc thuê xe.
     */
    expect(shop.metrics.sampleCount).toBe(0);
    expect(shop.metrics.responseRatePercent).toBeNull();
    expect(shop.metrics.acceptKeepRatePercent).toBeNull();
    expect(shop.metrics.responseMinutesMedian).toBeNull();
    expect(shop.metrics.instantBook).toBe(false);
    expect(shop.deliveryAvailable).toBe(false);
    expect(new Date(shop.joinedAt).getTime()).toBeGreaterThan(0);
  });

  maybe('getShopBySlug shop draft → 404', async () => {
    await expect(service.getShopBySlug(draftSlug)).rejects.toThrow(/không/i);
  });

  maybe('getShopBySlug slug không tồn tại → 404', async () => {
    await expect(service.getShopBySlug('khong-ton-tai-xyz')).rejects.toThrow(/không/i);
  });

  maybe('listShopVehicles chỉ trả xe approved của đúng shop', async () => {
    const res = await service.listShopVehicles(activeSlug, {});
    expect(res.meta.total).toBe(2); // 2 approved, bỏ draft + hidden
    expect(res.data).toHaveLength(2);
    expect(res.data.every((v) => v.shopSlug === activeSlug)).toBe(true);
  });

  /*
   * THẺ XE cũng phải phân biệt được hai tuyến, không chỉ trang gian hàng: khách gặp thẻ trước,
   * ở lưới kết quả, và thường không bao giờ mở trang gian hàng. `shopVerified` đọc tuyến thu
   * tiền HIỆU LỰC của tenant — nó không nằm trên snapshot `public_listings`, nên hai assert
   * này cũng là chỗ duy nhất bắt được việc ai đó denormalize nó vào snapshot rồi quên refresh.
   */
  maybe('listShopVehicles: tenant chưa có gói → thẻ xe KHÔNG có dấu xác thực', async () => {
    const res = await service.listShopVehicles(activeSlug, {});
    expect(res.data).not.toHaveLength(0);
    expect(res.data.every((v) => v.shopVerified === false)).toBe(true);
  });

  maybe('listShopVehicles: tenant tuyến gói → thẻ xe CÓ dấu xác thực', async () => {
    const [card, ...rest] = await service
      .listShopVehicles(otherSlug, {})
      .then((res) => res.data);
    expect(rest).toHaveLength(0);
    expect(card?.shopVerified).toBe(true);
  });

  maybe('getById: chi tiết xe nói cùng một điều với thẻ ở lưới', async () => {
    const [card] = await service.listShopVehicles(otherSlug, {}).then((res) => res.data);
    if (!card) throw new Error('seed thiếu xe của tenant tuyến gói');
    const detail = await service.getById(card.id);
    expect(detail.shopVerified).toBe(true);
  });

  maybe('listShopVehicles phân trang (limit 1 → hasNext)', async () => {
    const page1 = await service.listShopVehicles(activeSlug, { limit: 1, page: 1 });
    expect(page1.data).toHaveLength(1);
    expect(page1.meta.total).toBe(2);
    expect(page1.meta.hasNext).toBe(true);

    const page2 = await service.listShopVehicles(activeSlug, { limit: 1, page: 2 });
    expect(page2.data).toHaveLength(1);
    expect(page2.meta.hasNext).toBe(false);
    expect(page1.data[0]?.id).not.toBe(page2.data[0]?.id);
  });

  maybe('listShopVehicles shop draft → rỗng (trang shop đã 404 từ getShopBySlug)', async () => {
    const res = await service.listShopVehicles(draftSlug, {});
    expect(res.meta.total).toBe(0);
    expect(res.data).toHaveLength(0);
  });
});

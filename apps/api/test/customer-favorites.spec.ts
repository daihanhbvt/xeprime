import { ForbiddenException, type ExecutionContext } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { createPrismaClient, newId } from '@xeprime/prisma';
import {
  ACCOUNT_REALM,
  API_ERROR_CODE,
  SERVICE_TYPE,
  TENANT_STATUS,
  VEHICLE_PUBLIC_STATUS,
  VEHICLE_TYPE,
  type AccountRealm,
} from '@xeprime/types';
import { RealmGuard } from '../src/common/guards/realm.guard';
import { FavoritesController } from '../src/modules/favorites/favorites.controller';
import { FavoritesService } from '../src/modules/favorites/favorites.service';
import { ListingsService } from '../src/modules/public-listings/listings.service';
import type { PrismaService } from '../src/prisma/prisma.service';
import { seedBranch } from './helpers/service-factory';

/**
 * Xe yêu thích của tài khoản khách (BRD customer favorites) — trên PostgreSQL THẬT.
 *
 * Thứ được kiểm là bảo đảm của tính năng chứ không phải lối đi đẹp: thích lại/bấm song song chỉ
 * ra MỘT dòng (unique), bỏ thích idempotent, chỉ xe đang ở chợ mới lưu được, xe bị ẩn biến khỏi
 * danh sách mà KHÔNG mất mục yêu thích, tab lọc theo loại xe hiện hành, tài khoản khác không thấy
 * gì của nhau, và realm partner bị chặn ở CẢ guard lẫn FK tổ hợp.
 */
const prisma = createPrismaClient();
const asService = prisma as unknown as PrismaService;
const favorites = new FavoritesService(asService);
const listings = new ListingsService(asService);

const PROV = '79';

let dbAvailable = false;
let ownerId: string;
let tenantId: string;
let branchId: string;
const customerIds: string[] = [];

async function newCustomer(): Promise<string> {
  const id = newId();
  await prisma.user.create({
    data: {
      id,
      realm: ACCOUNT_REALM.CUSTOMER,
      displayName: 'Khách yêu thích',
      email: `fav-${id}@xeprime.test`,
    },
  });
  customerIds.push(id);
  return id;
}

async function seedVehicle(
  input: {
    vehicleType?: string;
    publicStatus?: string;
    serviceTypes?: string[];
    name?: string;
  } = {},
): Promise<string> {
  const id = newId();
  const vehicleType = input.vehicleType ?? VEHICLE_TYPE.CAR;
  await prisma.vehicle.create({
    data: {
      id,
      tenantId,
      branchId,
      code: `F-${id.slice(-6)}`,
      name: input.name ?? 'Toyota Vios',
      vehicleType,
      seatCount: vehicleType === VEHICLE_TYPE.CAR ? 5 : null,
      publicStatus: input.publicStatus ?? VEHICLE_PUBLIC_STATUS.APPROVED_PUBLIC,
      serviceTypes: input.serviceTypes ?? [SERVICE_TYPE.SELF_DRIVE],
      mainImageUrl: 'https://img.example/fav.jpg',
      weekdayPrice: '650000',
    },
  });
  await listings.syncFromVehicle(id);
  return id;
}

async function setPublicStatus(vehicleId: string, publicStatus: string): Promise<void> {
  await prisma.vehicle.update({ where: { id: vehicleId }, data: { publicStatus } });
  await listings.syncFromVehicle(vehicleId);
}

const rowsOf = (userId: string) => prisma.customerFavorite.count({ where: { userId } });

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
      realm: ACCOUNT_REALM.PARTNER,
      displayName: 'Chủ xe yêu thích',
      email: `fav-owner-${ownerId}@xeprime.test`,
    },
  });
  tenantId = newId();
  await prisma.tenant.create({
    data: {
      id: tenantId,
      code: `T-${tenantId.slice(-8)}`,
      slug: `fav-${tenantId.toLowerCase().slice(-10)}`,
      name: 'Shop yêu thích',
      status: TENANT_STATUS.ACTIVE,
      ownerUserId: ownerId,
    },
  });
  await prisma.tenantProfile.create({
    data: { tenantId, provinceCode: PROV, provinceName: 'Hồ Chí Minh' },
  });
  branchId = await seedBranch(asService, { tenantId, provinceCode: PROV });
});

afterAll(async () => {
  if (dbAvailable && tenantId) {
    await prisma.customerFavorite.deleteMany({ where: { userId: { in: customerIds } } });
    await prisma.vehicle.deleteMany({ where: { tenantId } });
    await prisma.tenantProfile.deleteMany({ where: { tenantId } });
    await prisma.tenantBranch.deleteMany({ where: { tenantId } });
    await prisma.tenant.deleteMany({ where: { id: tenantId } });
    await prisma.user.deleteMany({ where: { id: { in: [...customerIds, ownerId] } } });
  }
  await prisma.$disconnect();
});

const maybe = (name: string, fn: () => Promise<void>) =>
  it(name, async () => {
    if (!dbAvailable) return;
    await fn();
  });

const expectCode = async (promise: Promise<unknown>, code: string) => {
  await expect(promise).rejects.toMatchObject({ response: expect.objectContaining({ code }) });
};

describe('Thêm / bỏ — idempotent', () => {
  maybe('thích hai lần và năm lượt song song ⇒ đúng MỘT dòng', async () => {
    const userId = await newCustomer();
    const vehicleId = await seedVehicle();

    await expect(favorites.add(userId, vehicleId)).resolves.toEqual({
      vehicleId,
      favorited: true,
    });
    await expect(favorites.add(userId, vehicleId)).resolves.toEqual({
      vehicleId,
      favorited: true,
    });
    await Promise.all(Array.from({ length: 5 }, () => favorites.add(userId, vehicleId)));

    expect(await rowsOf(userId)).toBe(1);
  });

  maybe('bỏ thích xe chưa từng lưu / id lạ ⇒ 200 favorited=false, không lỗi', async () => {
    const userId = await newCustomer();
    const vehicleId = await seedVehicle();
    await expect(favorites.remove(userId, vehicleId)).resolves.toEqual({
      vehicleId,
      favorited: false,
    });
    await expect(favorites.remove(userId, 'KHONG-TON-TAI')).resolves.toMatchObject({
      favorited: false,
    });

    await favorites.add(userId, vehicleId);
    await favorites.remove(userId, vehicleId);
    await favorites.remove(userId, vehicleId);
    expect(await rowsOf(userId)).toBe(0);
  });

  maybe('xe có nhiều dịch vụ vẫn là MỘT mục; bỏ thích bỏ cả xe', async () => {
    const userId = await newCustomer();
    const vehicleId = await seedVehicle({
      serviceTypes: [SERVICE_TYPE.SELF_DRIVE, SERVICE_TYPE.WITH_DRIVER, SERVICE_TYPE.LONG_TERM],
    });
    await favorites.add(userId, vehicleId);
    expect(await rowsOf(userId)).toBe(1);
    await favorites.remove(userId, vehicleId);
    expect(await rowsOf(userId)).toBe(0);
  });
});

describe('Chỉ xe đang ở chợ mới lưu được', () => {
  maybe(
    'xe bị ẩn / chưa duyệt / id lạ ⇒ FAVORITE_VEHICLE_UNAVAILABLE, không ghi dòng',
    async () => {
      const userId = await newCustomer();
      const hidden = await seedVehicle({ publicStatus: VEHICLE_PUBLIC_STATUS.HIDDEN });
      const draft = await seedVehicle({ publicStatus: VEHICLE_PUBLIC_STATUS.DRAFT });

      await expectCode(favorites.add(userId, hidden), API_ERROR_CODE.FAVORITE_VEHICLE_UNAVAILABLE);
      await expectCode(favorites.add(userId, draft), API_ERROR_CODE.FAVORITE_VEHICLE_UNAVAILABLE);
      await expectCode(favorites.add(userId, newId()), API_ERROR_CODE.FAVORITE_VEHICLE_UNAVAILABLE);
      expect(await rowsOf(userId)).toBe(0);
    },
  );

  maybe('đã lưu rồi xe bị ẩn ⇒ thích lại vẫn trả favorited=true (idempotent)', async () => {
    const userId = await newCustomer();
    const vehicleId = await seedVehicle();
    await favorites.add(userId, vehicleId);
    await setPublicStatus(vehicleId, VEHICLE_PUBLIC_STATUS.HIDDEN);

    await expect(favorites.add(userId, vehicleId)).resolves.toEqual({
      vehicleId,
      favorited: true,
    });
    expect(await rowsOf(userId)).toBe(1);
  });
});

describe('Danh sách', () => {
  maybe('tab theo loại xe, mới lưu lên trước, phân trang đúng meta', async () => {
    const userId = await newCustomer();
    const carA = await seedVehicle({ name: 'Xe A' });
    const carB = await seedVehicle({ name: 'Xe B' });
    const carC = await seedVehicle({ name: 'Xe C' });
    const bike = await seedVehicle({ vehicleType: VEHICLE_TYPE.MOTORBIKE, name: 'Xe máy' });
    for (const id of [carA, carB, carC, bike]) {
      await favorites.add(userId, id);
      await new Promise((resolve) => setTimeout(resolve, 5));
    }

    const page1 = await favorites.list(userId, { limit: 2 });
    expect(page1.data.map((v) => v.id)).toEqual([carC, carB]);
    expect(page1.meta).toEqual({ page: 1, limit: 2, total: 3, hasNext: true });

    const page2 = await favorites.list(userId, {
      vehicleType: VEHICLE_TYPE.CAR,
      page: 2,
      limit: 2,
    });
    expect(page2.data.map((v) => v.id)).toEqual([carA]);
    expect(page2.meta.hasNext).toBe(false);

    const bikes = await favorites.list(userId, { vehicleType: VEHICLE_TYPE.MOTORBIKE });
    expect(bikes.data.map((v) => v.id)).toEqual([bike]);
    expect(bikes.data[0]).toMatchObject({ vehicleType: VEHICLE_TYPE.MOTORBIKE, seatCount: null });
  });

  maybe('thẻ mang dữ liệu chợ HIỆN HÀNH — dịch vụ đổi thì tag đổi theo', async () => {
    const userId = await newCustomer();
    const vehicleId = await seedVehicle({ serviceTypes: [SERVICE_TYPE.SELF_DRIVE] });
    await favorites.add(userId, vehicleId);

    const before = await favorites.list(userId, {});
    expect(before.data[0]).toMatchObject({
      id: vehicleId,
      name: 'Toyota Vios',
      serviceTypes: [SERVICE_TYPE.SELF_DRIVE],
      mainImageUrl: 'https://img.example/fav.jpg',
      seatCount: 5,
    });
    expect(String(before.data[0]!.weekdayPrice)).toBe('650000');
    expect(typeof before.data[0]!.favoritedAt).toBe('string');

    await prisma.vehicle.update({
      where: { id: vehicleId },
      data: { serviceTypes: [SERVICE_TYPE.WITH_DRIVER], weekdayPrice: '700000' },
    });
    await listings.syncFromVehicle(vehicleId);

    const after = await favorites.list(userId, {});
    expect(after.data[0]!.serviceTypes).toEqual([SERVICE_TYPE.WITH_DRIVER]);
    expect(String(after.data[0]!.weekdayPrice)).toBe('700000');
  });

  maybe('xe bị ẩn ⇒ biến khỏi danh sách nhưng KHÔNG mất mục; mở bán lại ⇒ hiện lại', async () => {
    const userId = await newCustomer();
    const vehicleId = await seedVehicle();
    await favorites.add(userId, vehicleId);

    await setPublicStatus(vehicleId, VEHICLE_PUBLIC_STATUS.HIDDEN);
    const hidden = await favorites.list(userId, {});
    expect(hidden.data).toHaveLength(0);
    expect(hidden.meta.total).toBe(0);
    expect(await rowsOf(userId)).toBe(1);

    await setPublicStatus(vehicleId, VEHICLE_PUBLIC_STATUS.APPROVED_PUBLIC);
    const back = await favorites.list(userId, {});
    expect(back.data.map((v) => v.id)).toEqual([vehicleId]);
  });

  maybe('xe bị xoá cứng ⇒ mục yêu thích đi theo (CASCADE)', async () => {
    const userId = await newCustomer();
    const vehicleId = await seedVehicle();
    await favorites.add(userId, vehicleId);
    await prisma.vehicle.delete({ where: { id: vehicleId } });
    expect(await rowsOf(userId)).toBe(0);
  });
});

describe('Trạng thái trái tim + ranh giới tài khoản', () => {
  maybe('status trả đúng tập con của CHÍNH tài khoản hỏi', async () => {
    const me = await newCustomer();
    const other = await newCustomer();
    const v1 = await seedVehicle();
    const v2 = await seedVehicle();
    const v3 = await seedVehicle();
    await favorites.add(me, v1);
    await favorites.add(other, v2);

    const mine = await favorites.status(me, [v1, v2, v3, v1]);
    expect(mine.vehicleIds).toEqual([v1]);
    expect((await favorites.status(other, [v1, v2])).vehicleIds).toEqual([v2]);
    expect((await favorites.list(other, {})).data.map((v) => v.id)).toEqual([v2]);
  });

  maybe('DB: tài khoản partner KHÔNG mang được dòng yêu thích (FK tổ hợp realm)', async () => {
    const vehicleId = await seedVehicle();
    await expect(
      prisma.customerFavorite.create({ data: { id: newId(), userId: ownerId, vehicleId } }),
    ).rejects.toThrow();
    await expect(
      prisma.$executeRaw`INSERT INTO customer_favorites (id, user_id, realm, vehicle_id)
        VALUES (${newId()}, ${ownerId}, 'partner', ${vehicleId})`,
    ).rejects.toThrow();
  });
});

describe('RealmGuard trên FavoritesController', () => {
  const guard = new RealmGuard(new Reflector());
  const ctx = (handler: string, realm: AccountRealm): ExecutionContext =>
    ({
      getType: () => 'http',
      getHandler: () =>
        (FavoritesController.prototype as unknown as Record<string, unknown>)[handler],
      getClass: () => FavoritesController,
      switchToHttp: () => ({
        getRequest: <T>() =>
          ({
            headers: {},
            user: {
              id: '01J00000000000000000000USR',
              realm,
              displayName: 'u',
              email: null,
              phoneVerified: true,
              sessionId: 'S',
              transport: 'cookie',
            },
          }) as T,
      }),
    }) as unknown as ExecutionContext;

  it.each(['list', 'status', 'add', 'remove'])('%s: khách qua, partner/platform bị chặn', (h) => {
    expect(guard.canActivate(ctx(h, ACCOUNT_REALM.CUSTOMER))).toBe(true);
    for (const realm of [ACCOUNT_REALM.PARTNER, ACCOUNT_REALM.PLATFORM]) {
      try {
        guard.canActivate(ctx(h, realm));
        throw new Error('guard cho qua');
      } catch (error) {
        expect(error).toBeInstanceOf(ForbiddenException);
        expect((error as ForbiddenException).getResponse()).toMatchObject({
          code: API_ERROR_CODE.REALM_NOT_ALLOWED,
        });
      }
    }
  });
});

import { BadRequestException, ConflictException } from '@nestjs/common';
import { createPrismaClient, newId } from '@xeprime/prisma';
import {
  ACCOUNT_REALM,
  API_ERROR_CODE,
  FUEL_TYPE,
  TRANSMISSION_TYPE_EXT,
  VEHICLE_TYPE,
} from '@xeprime/types';
import { AuditService } from '../src/modules/audit/audit.service';
import { CatalogModelService } from '../src/modules/catalog/catalog-model.service';
import type { PrismaService } from '../src/prisma/prisma.service';

/**
 * MẪU XE của danh mục — chạy trên PostgreSQL THẬT vì các tính chất đều là về DB:
 *
 *   1. xoá là xoá MỀM, và thêm lại đúng tên đó thì khôi phục dòng cũ (seed nhận ra mẫu đã xoá
 *      nhờ `key` còn đó, nên không tạo lại mẫu admin vừa gỡ);
 *   2. ngày đối chiếu chỉ đổi khi link nguồn ĐỔI — lưu lại form không được đóng dấu "vừa kiểm";
 *   3. hộp số phải khớp nguồn năng lượng, số chỗ chỉ dành cho ô tô (cùng luật form đăng xe);
 *   4. bộ đếm theo hãng đếm đúng số mẫu và số mẫu thiếu thông số, không đếm mẫu đã xoá.
 */
const prisma = createPrismaClient();
const asService = prisma as unknown as PrismaService;
const models = new CatalogModelService(asService, new AuditService(asService));

let dbAvailable = false;
let adminId: string;
/** Nhãn riêng cho từng lần chạy — bảng mẫu xe là bảng dùng chung. */
const TAG = `ZZ${newId().slice(-6)}`;
const BRAND = 'toyota';

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
  await prisma.user.create({
    data: {
      realm: ACCOUNT_REALM.PLATFORM,
      id: adminId,
      displayName: 'Platform admin',
      email: `adm-${adminId}@xeprime.test`,
    },
  });
  // Hãng phải tồn tại và bán ô tô — migration nền đã nạp, nhưng DB test có thể thiếu chiều áp dụng.
  await prisma.catalogItem.upsert({
    where: { type_key: { type: 'vehicle_brand', key: BRAND } },
    update: {},
    create: { id: newId(), type: 'vehicle_brand', key: BRAND, label: 'Toyota' },
  });
});

afterAll(async () => {
  if (dbAvailable) {
    await prisma.vehicleCatalogModel.deleteMany({ where: { label: { startsWith: TAG } } });
    await prisma.auditLog.deleteMany({ where: { actorUserId: adminId } });
    await prisma.user.deleteMany({ where: { id: adminId } });
  }
  await prisma.$disconnect();
});

const maybe = (name: string, fn: () => Promise<void>) =>
  it(name, async () => {
    if (!dbAvailable) return;
    await fn();
  });

function create(label: string, extra: Record<string, unknown> = {}) {
  return models.create(adminId, {
    label: `${TAG} ${label}`,
    brandKey: BRAND,
    vehicleType: VEHICLE_TYPE.CAR,
    ...extra,
  });
}

describe('Mẫu xe của danh mục', () => {
  maybe('số chỗ được bỏ trùng và sắp tăng dần', async () => {
    const row = await create('Seats', { seatCounts: [8, 7, 7] });
    expect(row.seatCounts).toEqual([7, 8]);
  });

  maybe('xe máy không nhận số chỗ', async () => {
    await expect(
      models.create(adminId, {
        label: `${TAG} Bike`,
        brandKey: 'honda',
        vehicleType: VEHICLE_TYPE.MOTORBIKE,
        seatCounts: [2],
      }),
    ).rejects.toBeInstanceOf(BadRequestException);
  });

  maybe('hộp số phải khớp nguồn năng lượng — xe điện không có số sàn', async () => {
    await expect(
      create('EV manual', {
        fuelTypes: [FUEL_TYPE.ELECTRIC],
        transmissions: [TRANSMISSION_TYPE_EXT.MANUAL],
      }),
    ).rejects.toBeInstanceOf(BadRequestException);

    // Đổi nguồn năng lượng mà giữ hộp số cũ cũng bị bắt, dù request không gửi lại hộp số.
    const gas = await create('Gas', {
      fuelTypes: [FUEL_TYPE.GASOLINE],
      transmissions: [TRANSMISSION_TYPE_EXT.MANUAL],
    });
    await expect(
      models.update(adminId, gas.id, { fuelTypes: [FUEL_TYPE.ELECTRIC] }),
    ).rejects.toBeInstanceOf(BadRequestException);
  });

  maybe('ngày đối chiếu chỉ đổi khi link nguồn đổi', async () => {
    const url = 'https://www.toyota.com.vn/danh-sach-xe';
    const row = await create('Verified', { sourceUrl: url });
    const old = new Date('2026-01-01T00:00:00.000Z');
    await prisma.vehicleCatalogModel.update({ where: { id: row.id }, data: { verifiedAt: old } });

    // Form luôn gửi lại `sourceUrl` — cùng giá trị thì ngày giữ nguyên.
    await models.update(adminId, row.id, { sourceUrl: url, active: false });
    const same = await prisma.vehicleCatalogModel.findUniqueOrThrow({ where: { id: row.id } });
    expect(same.verifiedAt?.toISOString()).toBe(old.toISOString());

    await models.update(adminId, row.id, { sourceUrl: `${url}?v=2` });
    const changed = await prisma.vehicleCatalogModel.findUniqueOrThrow({ where: { id: row.id } });
    expect(changed.verifiedAt!.getTime()).toBeGreaterThan(old.getTime());
  });

  maybe('xoá là xoá mềm; thêm lại đúng tên thì khôi phục dòng cũ', async () => {
    const row = await create('Revive', { seatCounts: [5] });
    await models.remove(adminId, row.id);

    const deleted = await prisma.vehicleCatalogModel.findUniqueOrThrow({ where: { id: row.id } });
    expect(deleted.deletedAt).not.toBeNull();
    const listed = await models.listForAdmin({ vehicleType: VEHICLE_TYPE.CAR, brandKey: BRAND });
    expect(listed.some((m) => m.id === row.id)).toBe(false);
    await expect(models.update(adminId, row.id, { active: true })).rejects.toBeTruthy();

    const revived = await create('Revive', { seatCounts: [7] });
    expect(revived.id).toBe(row.id);
    expect(revived.seatCounts).toEqual([7]);
    const back = await prisma.vehicleCatalogModel.findUniqueOrThrow({ where: { id: row.id } });
    expect(back.deletedAt).toBeNull();
  });

  maybe('thêm trùng một mẫu đang sống thì báo trùng, kèm mã lỗi riêng', async () => {
    await create('Dup');
    const err = await create('Dup').catch((e: unknown) => e);
    expect(err).toBeInstanceOf(ConflictException);
    expect((err as ConflictException).getResponse()).toMatchObject({
      code: API_ERROR_CODE.CATALOG_MODEL_DUPLICATE,
    });
  });

  maybe('khôi phục mẫu xe máy đã xoá thành mẫu ô tô cùng tên — ghi lại loại xe', async () => {
    // `key` không mang loại xe: "honda-zz… cross" của xe máy và của ô tô là cùng một khoá.
    const bike = await models.create(adminId, {
      label: `${TAG} Cross`,
      brandKey: 'honda',
      vehicleType: VEHICLE_TYPE.MOTORBIKE,
    });
    await models.remove(adminId, bike.id);

    const car = await models.create(adminId, {
      label: `${TAG} Cross`,
      brandKey: 'honda',
      vehicleType: VEHICLE_TYPE.CAR,
      seatCounts: [5],
    });
    expect(car.id).toBe(bike.id);
    expect(car.vehicleType).toBe(VEHICLE_TYPE.CAR);
    expect(car.seatCounts).toEqual([5]);
  });

  maybe('mọi lượt sửa của admin đóng mốc để seed không điền đè', async () => {
    const row = await create('Edited');
    await prisma.vehicleCatalogModel.update({ where: { id: row.id }, data: { adminEditedAt: null } });
    await models.update(adminId, row.id, { seatCounts: [] });
    const after = await prisma.vehicleCatalogModel.findUniqueOrThrow({ where: { id: row.id } });
    expect(after.adminEditedAt).not.toBeNull();
  });

  maybe('bộ đếm theo hãng: tổng, đang bật, thiếu thông số — không đếm mẫu đã xoá', async () => {
    const before = (await models.brandSummary(VEHICLE_TYPE.CAR)).find((s) => s.brandKey === BRAND);

    await create('Full', {
      seatCounts: [5],
      fuelTypes: [FUEL_TYPE.GASOLINE],
      transmissions: [TRANSMISSION_TYPE_EXT.AUTOMATIC],
    });
    const partial = await create('Partial', { active: false });
    const gone = await create('Gone');
    await models.remove(adminId, gone.id);

    const after = (await models.brandSummary(VEHICLE_TYPE.CAR)).find((s) => s.brandKey === BRAND)!;
    expect(after.total - (before?.total ?? 0)).toBe(2);
    expect(after.active - (before?.active ?? 0)).toBe(1);
    expect(after.missingSpecs - (before?.missingSpecs ?? 0)).toBe(1);
    expect(partial.active).toBe(false);
  });
});

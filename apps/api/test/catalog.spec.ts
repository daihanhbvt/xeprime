import { createPrismaClient, newId } from '@xeprime/prisma';
import {
  ACCOUNT_REALM,
  CATALOG_TYPE,
  MEMBERSHIP_STATUS,
  TENANT_ROLE,
  TENANT_STATUS,
  VEHICLE_TYPE,
} from '@xeprime/types';
import { AuditService } from '../src/modules/audit/audit.service';
import { CatalogService } from '../src/modules/catalog/catalog.service';
import type { PrismaService } from '../src/prisma/prisma.service';

/**
 * Danh mục lọc dùng chung — chạy trên PostgreSQL THẬT vì mọi khẳng định ở đây đều là về DB:
 * unique (type, key), số xe đang dùng, và ràng buộc "đã có xe thì không xoá".
 *
 * Bốn tính chất bảo vệ lời hứa "ba màn cùng một nguồn dữ liệu":
 *   1. xe KHÔNG lưu được key không có trong danh mục (nếu không, bộ lọc mọc ô trống);
 *   2. TẮT một mục vẫn sửa được xe cũ đang dùng nó (admin ẩn hãng ≠ khoá xe của shop);
 *   3. mục đang có xe dùng thì KHÔNG xoá được (mất luôn nhãn hiển thị của xe người khác);
 *   4. sắp thứ tự phải gửi trọn danh sách (gửi thiếu = phần còn lại lệch số âm thầm).
 */
const prisma = createPrismaClient();
const asService = prisma as unknown as PrismaService;
const catalog = new CatalogService(asService, new AuditService(asService));

let dbAvailable = false;
let adminId: string;
let ownerId: string;
let tenantId: string;
/** Prefix riêng cho từng lần chạy — bộ test này thêm/xoá mục trong bảng dùng chung. */
const PREFIX = `zz${newId().toLowerCase().slice(-6)}`;

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
  ownerId = newId();
  tenantId = newId();
  await prisma.user.createMany({
    data: [
      {
        realm: ACCOUNT_REALM.CUSTOMER,
        id: adminId,
        displayName: 'Platform admin',
        email: `adm-${adminId}@xeprime.test`,
      },
      {
        realm: ACCOUNT_REALM.PARTNER,
        id: ownerId,
        displayName: 'Chủ shop',
        email: `own-${ownerId}@xeprime.test`,
      },
    ],
  });
  await prisma.tenant.create({
    data: {
      id: tenantId,
      code: `T-${tenantId.slice(-8)}`,
      slug: `t-${tenantId.toLowerCase().slice(-10)}`,
      name: 'Shop Catalog',
      status: TENANT_STATUS.ACTIVE,
      ownerUserId: ownerId,
    },
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
});

afterAll(async () => {
  if (dbAvailable) {
    await prisma.vehicle.deleteMany({ where: { tenantId } });
    await prisma.tenantMembership.deleteMany({ where: { tenantId } });
    await prisma.tenant.deleteMany({ where: { id: tenantId } });
    await prisma.user.deleteMany({ where: { id: { in: [adminId, ownerId] } } });
    await prisma.auditLog.deleteMany({ where: { actorUserId: adminId } });
    await prisma.catalogItem.deleteMany({ where: { key: { startsWith: PREFIX } } });
  }
  await prisma.$disconnect();
});

const maybe = (name: string, fn: () => Promise<void>) =>
  it(name, async () => {
    if (!dbAvailable) return;
    await fn();
  });

describe('Danh mục lọc dùng chung', () => {
  maybe('migration đã nạp đủ bốn chiều, kiểu dáng có ảnh', async () => {
    const items = await catalog.list({});
    const byType = (type: string) => items.filter((i) => i.type === type);

    expect(byType(CATALOG_TYPE.VEHICLE_BRAND).length).toBeGreaterThan(0);
    expect(byType(CATALOG_TYPE.FUEL_TYPE).length).toBeGreaterThan(0);
    expect(byType(CATALOG_TYPE.VEHICLE_FEATURE).length).toBeGreaterThan(0);

    const bodyTypes = byType(CATALOG_TYPE.BODY_TYPE);
    expect(bodyTypes.length).toBeGreaterThan(0);
    // Ảnh là điểm chính của chiều này — thiếu hết thì thẻ chọn rơi về glyph trung tính.
    expect(bodyTypes.filter((i) => i.iconUrl).length).toBeGreaterThan(0);
  });

  maybe('xe KHÔNG lưu được giá trị ngoài danh mục', async () => {
    await expect(catalog.assertVehicleValues({ brand: 'khong-co-hang-nay' })).rejects.toThrow(
      /không có trong danh mục/i,
    );
    await expect(
      catalog.assertVehicleValues({ features: ['bluetooth', 'tinh-nang-ma'] }),
    ).rejects.toThrow(/tinh-nang-ma/);
  });

  maybe('mục ĐÃ TẮT vẫn hợp lệ khi sửa xe cũ đang dùng nó', async () => {
    const created = await catalog.create(adminId, {
      type: CATALOG_TYPE.BODY_TYPE,
      key: `${PREFIX}-tat`,
      label: 'Kiểu dáng tạm',
      active: false,
    });

    // Tắt = ẩn khỏi ô chọn…
    const offered = await catalog.list({ type: CATALOG_TYPE.BODY_TYPE });
    expect(offered.some((i) => i.key === created.key)).toBe(false);
    // …nhưng không khoá xe đang trỏ vào nó.
    await expect(catalog.assertVehicleValues({ bodyType: created.key })).resolves.toBeUndefined();
  });

  maybe('mục đang có xe dùng thì không xoá được, mục chưa ai dùng thì xoá được', async () => {
    const used = await catalog.create(adminId, {
      type: CATALOG_TYPE.BODY_TYPE,
      key: `${PREFIX}-dung`,
      label: 'Kiểu dáng có xe',
    });
    const unused = await catalog.create(adminId, {
      type: CATALOG_TYPE.BODY_TYPE,
      key: `${PREFIX}-trong`,
      label: 'Kiểu dáng chưa ai dùng',
    });

    await prisma.vehicle.create({
      data: {
        id: newId(),
        tenantId,
        code: `V-${newId().slice(-8)}`,
        name: 'Xe test danh mục',
        vehicleType: VEHICLE_TYPE.CAR,
        bodyType: used.key,
      },
    });

    await expect(catalog.remove(adminId, used.id)).rejects.toThrow(/1 xe/);
    await expect(catalog.remove(adminId, unused.id)).resolves.toBeUndefined();

    const admin = await catalog.listForAdmin({ type: CATALOG_TYPE.BODY_TYPE });
    expect(admin.find((i) => i.key === used.key)?.usageCount).toBe(1);
  });

  maybe('sắp thứ tự phải gửi TRỌN danh sách của một chiều', async () => {
    const items = await catalog.listForAdmin({ type: CATALOG_TYPE.FUEL_TYPE });
    const ids = items.map((i) => i.id);

    await expect(
      catalog.reorder(adminId, { type: CATALOG_TYPE.FUEL_TYPE, ids: ids.slice(1) }),
    ).rejects.toThrow(/toàn bộ/);

    const reversed = [...ids].reverse();
    const after = await catalog.reorder(adminId, {
      type: CATALOG_TYPE.FUEL_TYPE,
      ids: reversed,
    });
    expect(after.map((i) => i.id)).toEqual(reversed);

    // Trả lại thứ tự cũ — bảng này dùng chung với các bộ test khác.
    await catalog.reorder(adminId, { type: CATALOG_TYPE.FUEL_TYPE, ids });
  });

  maybe('trùng mã trong cùng một chiều bị chặn', async () => {
    const key = `${PREFIX}-trung`;
    await catalog.create(adminId, {
      type: CATALOG_TYPE.VEHICLE_FEATURE,
      key,
      label: 'Tiện ích A',
    });
    await expect(
      catalog.create(adminId, { type: CATALOG_TYPE.VEHICLE_FEATURE, key, label: 'Tiện ích B' }),
    ).rejects.toThrow(/đã tồn tại/);
  });

  /**
   * Khối "Loại xe" trang chủ đọc thẳng danh mục kiểu dáng: chỉ KIỂU DÁNG có trường trang chủ, và
   * bật hiện thì phải có ảnh lớn — trang chủ không bao giờ dựng một thẻ thiếu ảnh.
   */
  maybe('trang chủ: chỉ kiểu dáng có trường trang chủ, bật hiện thì phải có ảnh lớn', async () => {
    await expect(
      catalog.create(adminId, {
        type: CATALOG_TYPE.FUEL_TYPE,
        key: `${PREFIX}-nl`,
        label: 'Nhiên liệu',
        showcaseExamples: 'Không thuộc chỗ này',
      }),
    ).rejects.toThrow(/Chỉ kiểu dáng/);

    await expect(
      catalog.create(adminId, {
        type: CATALOG_TYPE.BODY_TYPE,
        key: `${PREFIX}-thieu-anh`,
        label: 'Bật mà thiếu ảnh',
        showOnHome: true,
      }),
    ).rejects.toThrow(/phải tải ảnh/);

    const item = await catalog.create(adminId, {
      type: CATALOG_TYPE.BODY_TYPE,
      key: `${PREFIX}-trang-chu`,
      label: 'Coupe',
      showOnHome: true,
      showcaseImageUrl: 'https://cdn.example.com/catalog/coupe.webp',
      showcaseExamples: 'Mazda MX-5',
    });
    expect(item.showOnHome).toBe(true);

    // Sửa phần khác giữ nguyên trang chủ; gỡ ảnh khi đang bật thì bị chặn; tắt rồi gỡ thì được.
    const renamed = await catalog.update(adminId, item.id, { label: 'Coupe 2 cửa' });
    expect(renamed.showcaseImageUrl).toBe('https://cdn.example.com/catalog/coupe.webp');
    await expect(catalog.update(adminId, item.id, { showcaseImageUrl: null })).rejects.toThrow(
      /phải tải ảnh/,
    );
    const hidden = await catalog.update(adminId, item.id, {
      showOnHome: false,
      showcaseImageUrl: null,
    });
    expect(hidden.showOnHome).toBe(false);
    expect(hidden.showcaseImageUrl).toBeNull();
    expect(hidden.showcaseExamples).toBe('Mazda MX-5');

    // Danh sách công khai mang trường trang chủ — trang chủ lọc đúng mục đang bật.
    const publicList = await catalog.list({ type: CATALOG_TYPE.BODY_TYPE });
    expect(publicList.find((i) => i.key === item.key)?.showOnHome).toBe(false);
  });

  maybe('ảnh danh mục chỉ nhận http(s) hoặc đường dẫn nội bộ', async () => {
    const { validate } = await import('class-validator');
    const { plainToInstance } = await import('class-transformer');
    const { UpdateCatalogItemDto } = await import('../src/modules/catalog/dto/catalog.dto');
    for (const [field, value] of [
      ['iconUrl', 'javascript:alert(1)'],
      ['showcaseImageUrl', 'data:image/png;base64,AAAA'],
    ] as const) {
      const errors = await validate(plainToInstance(UpdateCatalogItemDto, { [field]: value }));
      expect(errors.map((e) => e.property)).toContain(field);
    }
  });
});

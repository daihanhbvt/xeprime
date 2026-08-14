import { createPrismaClient, newId } from '@xeprime/prisma';
import {
  API_ERROR_CODE,
  PROVINCE_CATALOG,
  PROVINCE_CODES,
  buildProvinceAliasSeeds,
  normalizeProvinceAlias,
} from '@xeprime/types';
import type { PrismaService } from '../src/prisma/prisma.service';
import { makeProvincesService } from './helpers/service-factory';

/**
 * Danh mục hành chính TRONG DATABASE — kiểm chính thứ migration đã nạp, không kiểm lại hằng số
 * TypeScript (`packages/types/src/province.test.ts` lo phần đó).
 *
 * Vì sao phải có test chạm DB: dữ liệu này nằm trong MIGRATION chứ không phải seed demo. Nếu
 * migration nạp thiếu/sai, mọi môi trường mới sẽ dựng lên với danh mục hỏng và không ai biết
 * cho tới khi một shop không chọn được tỉnh của mình.
 */
const prisma = createPrismaClient();
const asService = prisma as unknown as PrismaService;
const provinces = makeProvincesService(asService);

let dbAvailable = false;

beforeAll(async () => {
  try {
    await prisma.$connect();
    await prisma.$queryRaw`SELECT 1`;
    dbAvailable = true;
  } catch {
    console.warn('\n[skip] Không kết nối được PostgreSQL. Chạy `pnpm db:up` trước.\n');
  }
});

afterAll(async () => {
  await prisma.$disconnect();
});

const maybe = (name: string, fn: () => Promise<void>) =>
  it(name, async () => {
    if (!dbAvailable) return;
    await fn();
  });

describe('Danh mục tỉnh do migration nạp', () => {
  maybe('có đủ 34 mã chính thức, đúng tên và đúng loại đơn vị', async () => {
    const rows = await prisma.province.findMany({
      where: { code: { in: [...PROVINCE_CODES] } },
      select: { code: true, name: true, administrativeType: true },
    });
    expect(rows).toHaveLength(34);

    const byCode = new Map(rows.map((r) => [r.code, r]));
    for (const p of PROVINCE_CATALOG) {
      expect(byCode.get(p.code)?.name).toBe(p.name);
      expect(byCode.get(p.code)?.administrativeType).toBe(p.administrativeType);
    }
  });

  maybe('mã là khoá chính — không thể có hai tỉnh cùng mã', async () => {
    await expect(
      prisma.province.create({
        data: { code: '79', name: 'Trùng mã', administrativeType: 'province', slug: 'trung-ma' },
      }),
    ).rejects.toThrow();
  });

  maybe('bí danh trong DB khớp bản soạn và `normalized_alias` là duy nhất', async () => {
    const seeds = buildProvinceAliasSeeds();
    const rows = await prisma.provinceAlias.findMany({
      where: { normalizedAlias: { in: seeds.map((s) => s.normalizedAlias) } },
      select: { normalizedAlias: true, provinceCode: true },
    });
    expect(rows).toHaveLength(seeds.length);

    const byNormalized = new Map(rows.map((r) => [r.normalizedAlias, r.provinceCode]));
    for (const s of seeds) {
      expect(byNormalized.get(s.normalizedAlias)).toBe(s.provinceCode);
    }
  });

  maybe('tên tỉnh CŨ trước sáp nhập quy đúng về tỉnh hiện hành', async () => {
    const cases: [string, string][] = [
      ['Hà Giang', '08'],
      ['Bà Rịa - Vũng Tàu', '79'],
      ['Bình Dương', '79'],
      ['Kiên Giang', '91'],
      ['Thừa Thiên Huế', '46'],
      ['Quảng Nam', '48'],
    ];
    for (const [legacy, code] of cases) {
      expect(await provinces.resolveCode(legacy)).toBe(code);
    }
  });

  maybe('các cách viết của TP.HCM đều ra mã 79', async () => {
    for (const raw of ['TPHCM', 'TP. HCM', 'tp hcm', 'Thành phố Hồ Chí Minh', '  hồ chí minh ']) {
      expect(await provinces.resolveCode(raw)).toBe('79');
    }
  });

  maybe('chuỗi lạ KHÔNG bị đoán thành một tỉnh nào', async () => {
    for (const raw of ['Vientiane', 'Chi nhánh 1', '   ', '', null]) {
      expect(await provinces.resolveCode(raw)).toBeNull();
    }
  });
});

describe('Tỉnh đang được tham chiếu thì không xoá cứng được', () => {
  maybe('FK RESTRICT chặn xoá tỉnh còn chi nhánh trỏ tới', async () => {
    const ownerId = newId();
    const tenantId = newId();
    const branchId = newId();
    await prisma.user.create({
      data: { id: ownerId, displayName: 'Chủ shop', email: `own-${ownerId}@xeprime.test` },
    });
    await prisma.tenant.create({
      data: {
        id: tenantId,
        code: `T-${tenantId.slice(-8)}`,
        slug: `t-${tenantId.toLowerCase().slice(-10)}`,
        name: 'Shop giữ tỉnh',
        status: 'active',
        ownerUserId: ownerId,
      },
    });
    await prisma.province.upsert({
      where: { code: 'Z9' },
      update: {},
      create: {
        code: 'Z9',
        name: 'Zone Restrict',
        administrativeType: 'province',
        slug: 'zone-restrict',
      },
    });
    await prisma.tenantBranch.create({
      data: { id: branchId, tenantId, code: 'CN01', name: 'CN', provinceCode: 'Z9' },
    });

    await expect(prisma.province.delete({ where: { code: 'Z9' } })).rejects.toThrow();

    await prisma.tenantBranch.delete({ where: { id: branchId } });
    await prisma.province.delete({ where: { code: 'Z9' } });
    await prisma.tenant.delete({ where: { id: tenantId } });
    await prisma.user.delete({ where: { id: ownerId } });
  });
});

describe('Quản trị danh mục (nền tảng)', () => {
  maybe('tỉnh đã tắt KHÔNG chọn được cho dữ liệu mới, nhưng vẫn còn trong DB', async () => {
    await prisma.province.update({ where: { code: '04' }, data: { isEnabled: false } });
    try {
      await expect(provinces.assertSelectable('04')).rejects.toMatchObject({
        response: { code: API_ERROR_CODE.VALIDATION_FAILED },
      });
      const enabled = await provinces.listEnabled();
      expect(enabled.some((p) => p.code === '04')).toBe(false);
      // Vẫn tồn tại — tắt là ngừng nhận đăng ký mới, không phải xoá dữ liệu.
      expect(await prisma.province.count({ where: { code: '04' } })).toBe(1);
    } finally {
      await prisma.province.update({ where: { code: '04' }, data: { isEnabled: true } });
    }
  });

  maybe('danh sách cho admin có đủ 34 tỉnh kể cả tỉnh chưa có xe nào', async () => {
    const rows = await provinces.listForPlatform();
    expect(rows.length).toBeGreaterThanOrEqual(34);
    for (const code of PROVINCE_CODES) {
      const row = rows.find((r) => r.code === code);
      expect(row).toBeDefined();
      expect(row?.branchCount).toBeGreaterThanOrEqual(0);
      expect(row?.vehicleCount).toBeGreaterThanOrEqual(0);
      expect(row?.publicVehicleCount).toBeGreaterThanOrEqual(0);
    }
  });

  maybe('tìm theo mã, theo tên có/không dấu, và theo bí danh cũ', async () => {
    const byCode = await provinces.listForPlatform('79');
    expect(byCode.some((p) => p.code === '79')).toBe(true);

    const byName = await provinces.listForPlatform('ho chi minh');
    expect(byName.some((p) => p.code === '79')).toBe(true);

    const byAlias = await provinces.listForPlatform('Bà Rịa');
    expect(byAlias.some((p) => p.code === '79')).toBe(true);
  });

  maybe('đổi tên hiển thị: ghi audit, thêm bí danh, KHÔNG đụng chi nhánh/xe', async () => {
    const adminId = newId();
    await prisma.user.create({
      data: { id: adminId, displayName: 'Admin', email: `adm-${adminId}@xeprime.test` },
    });
    const before = await prisma.province.findUniqueOrThrow({ where: { code: '96' } });
    const branchesBefore = await prisma.tenantBranch.count({ where: { provinceCode: '96' } });

    await provinces.update('96', adminId, { name: 'Cà Mau (mới)' });
    try {
      const after = await prisma.province.findUniqueOrThrow({ where: { code: '96' } });
      expect(after.name).toBe('Cà Mau (mới)');
      // Bí danh mới để tên vừa đổi vẫn tra được.
      expect(await provinces.resolveCode('Cà Mau (mới)')).toBe('96');
      // Tên CŨ vẫn resolve — link/dữ liệu cũ không chết.
      expect(await provinces.resolveCode('Cà Mau')).toBe('96');
      expect(await prisma.tenantBranch.count({ where: { provinceCode: '96' } })).toBe(
        branchesBefore,
      );

      const log = await prisma.auditLog.findFirst({
        where: { action: 'platform.location.update', targetId: '96', actorUserId: adminId },
      });
      expect(log).not.toBeNull();
    } finally {
      await prisma.province.update({
        where: { code: '96' },
        data: { name: before.name, slug: before.slug },
      });
      await prisma.provinceAlias.deleteMany({
        where: { normalizedAlias: normalizeProvinceAlias('Cà Mau (mới)') },
      });
      await prisma.auditLog.deleteMany({ where: { actorUserId: adminId } });
      await prisma.user.delete({ where: { id: adminId } });
    }
  });
});

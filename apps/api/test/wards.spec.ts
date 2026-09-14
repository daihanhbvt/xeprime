import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { createPrismaClient } from '@xeprime/prisma';
import {
  API_ERROR_CODE,
  normalizeWardName,
  WARD_ADMINISTRATIVE_TYPE,
  type WardCatalogEntry,
} from '@xeprime/types';
import type { PrismaService } from '../src/prisma/prisma.service';
import { makeAddressService, makeWardsService } from './helpers/service-factory';

/**
 * Danh mục CẤP XÃ trong database — kiểm chính thứ migration đã nạp.
 *
 * Vì sao phải chạm DB: 3.321 dòng này nằm trong MIGRATION chứ không phải seed demo. Nạp
 * thiếu/sai thì mọi môi trường mới dựng lên với danh mục hỏng, và không ai biết cho tới khi một
 * chủ shop không tìm thấy phường của mình.
 *
 * Bản soạn để đối chiếu là `prisma/data/ward-catalog.json` — tải từ nguồn nhà nước bằng
 * `prisma/scripts/fetch-ward-catalog.ts`, và migration sinh ra TỪ chính nó.
 */
const catalog = JSON.parse(
  readFileSync(resolve(__dirname, '../../../prisma/data/ward-catalog.json'), 'utf8'),
) as { _source: { legalBasis: string }; wards: WardCatalogEntry[] };

const prisma = createPrismaClient();
const asService = prisma as unknown as PrismaService;
const wards = makeWardsService(asService);
const address = makeAddressService(asService);

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

describe('Danh mục cấp xã do migration nạp', () => {
  maybe('đủ 3.321 đơn vị, đúng cơ cấu 13 đặc khu / 697 phường / 2.611 xã', async () => {
    const [total, byType] = await Promise.all([
      prisma.ward.count(),
      prisma.ward.groupBy({ by: ['administrativeType'], _count: { _all: true } }),
    ]);
    expect(total).toBe(catalog.wards.length);
    expect(total).toBe(3321);

    const count = (type: string) =>
      byType.find((g) => g.administrativeType === type)?._count._all ?? 0;
    expect(count(WARD_ADMINISTRATIVE_TYPE.SPECIAL_ZONE)).toBe(13);
    expect(count(WARD_ADMINISTRATIVE_TYPE.WARD)).toBe(697);
    expect(count(WARD_ADMINISTRATIVE_TYPE.COMMUNE)).toBe(2611);
  });

  maybe('từng dòng khớp bản soạn: mã, tên, tỉnh chứa nó, và khoá tìm kiếm', async () => {
    const rows = await prisma.ward.findMany({
      select: { code: true, provinceCode: true, name: true, normalizedName: true },
    });
    const byCode = new Map(rows.map((r) => [r.code, r]));

    for (const w of catalog.wards) {
      const row = byCode.get(w.code);
      expect(row?.name).toBe(w.name);
      expect(row?.provinceCode).toBe(w.provinceCode);
      // Khoá tìm SUY RA từ tên: lệch nghĩa là migration đã sinh bằng một luật chuẩn hoá khác,
      // và ô tìm sẽ trượt đúng những lần gõ bỏ dấu mà người dùng cần nó nhất.
      expect(row?.normalizedName).toBe(normalizeWardName(w.name));
    }
  });

  maybe('mọi mã xã đều trỏ tới một tỉnh CÓ THẬT trong danh mục', async () => {
    const orphans = await prisma.$queryRaw<{ count: bigint }[]>`
      SELECT count(*)::bigint AS count
      FROM "wards" w
      LEFT JOIN "provinces" p ON p."code" = w."province_code"
      WHERE p."code" IS NULL`;
    expect(Number(orphans[0]?.count ?? 0)).toBe(0);
  });
});

describe('WardsService', () => {
  maybe('lọc theo tỉnh và tìm bỏ dấu, bỏ tiền tố loại đơn vị', async () => {
    const hanoi = await wards.listByProvince('01');
    expect(hanoi.total).toBe(126);
    expect(hanoi.items.every((w) => w.provinceCode === '01')).toBe(true);

    // Ba cách gõ CÙNG một phường phải ra cùng một kết quả — đó là toàn bộ lý do có cột
    // `normalized_name` thay vì so chuỗi con trên tên có dấu.
    for (const q of ['ba dinh', 'Ba Đình', 'phuong ba dinh']) {
      const found = await wards.listByProvince('01', q);
      expect(found.items.some((w) => w.name === 'Phường Ba Đình')).toBe(true);
    }
  });

  maybe('`total` là tổng CỦA TỈNH, không phải số dòng khớp ô tìm', async () => {
    const searched = await wards.listByProvince('01', 'ba dinh');
    expect(searched.total).toBe(126);
    expect(searched.items.length).toBeLessThan(126);
  });

  maybe('từ chối mã xã KHÔNG thuộc tỉnh đã chọn', async () => {
    // `00004` là Phường Ba Đình của Hà Nội; gắn nó vào TP.HCM là đúng loại sai mà FK tổ hợp
    // `(ward_code, province_code)` chặn ở DB — lớp này chỉ lo cho thông báo gọi được tên đơn vị.
    await expect(wards.assertSelectable('00004', '79')).rejects.toMatchObject({
      response: { code: API_ERROR_CODE.VALIDATION_FAILED },
    });
  });

  maybe('từ chối mã xã không tồn tại', async () => {
    await expect(wards.assertSelectable('99999', '01')).rejects.toMatchObject({
      response: { code: API_ERROR_CODE.VALIDATION_FAILED },
    });
  });
});

describe('AddressService', () => {
  maybe('ghép chuỗi hiển thị từ nhỏ tới lớn: số nhà → xã/phường → tỉnh', async () => {
    const resolved = await address.resolve(
      { provinceCode: '01', wardCode: '00004', addressLine: '12 Nguyễn Thái Học' },
      { skipGeocode: true },
    );
    expect(resolved.displayAddress).toBe('12 Nguyễn Thái Học, Phường Ba Đình, Hà Nội');
    expect(resolved.needsReview).toBe(false);
  });

  maybe('thiếu mã xã vẫn lưu được, nhưng bị đánh dấu CHỜ XÁC NHẬN', async () => {
    const resolved = await address.resolve(
      { provinceCode: '01', addressLine: '12 Nguyễn Thái Học' },
      { skipGeocode: true },
    );
    expect(resolved.wardCode).toBeNull();
    expect(resolved.needsReview).toBe(true);
    expect(resolved.displayAddress).toBe('12 Nguyễn Thái Học, Hà Nội');
  });

  maybe('`requireWard` chặn hẳn ở những luồng đòi địa chỉ đủ', async () => {
    await expect(
      address.resolve({ provinceCode: '01' }, { requireWard: true, skipGeocode: true }),
    ).rejects.toMatchObject({ response: { code: API_ERROR_CODE.VALIDATION_FAILED } });
  });

  maybe('client tự khai "đã ghim" mà không gửi toạ độ thì KHÔNG được tin', async () => {
    const resolved = await address.resolve(
      { provinceCode: '01', wardCode: '00004', locationSource: 'map_pin' },
      { skipGeocode: true },
    );
    // Không có toạ độ nào ⇒ `manual`, bất kể client khai gì. Nếu không, một ghim đáng ngờ sẽ
    // đội lốt "người dùng đã xác nhận" và thoát khỏi lời nhắc kiểm lại trên giao diện.
    expect(resolved.locationSource).toBe('manual');
    expect(resolved.latitude).toBeNull();
  });

  maybe('`resolveOptional` trả null khi client chưa gửi phần hành chính nào', async () => {
    expect(await address.resolveOptional({ addressLine: '12 Nguyễn Thái Học' })).toBeNull();
  });
});

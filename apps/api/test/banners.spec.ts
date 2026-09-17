import { createPrismaClient, newId } from '@xeprime/prisma';
import { AuditService } from '../src/modules/audit/audit.service';
import { BannersService } from '../src/modules/banners/banners.service';
import type { PrismaService } from '../src/prisma/prisma.service';

/**
 * Banner trang chủ — chạy trên PostgreSQL THẬT vì các khẳng định đều thuộc về DB:
 * public trả đầy đủ, tối đa 10 banner trùng lịch, CHECK lịch ngược, reorder trọn danh sách.
 *
 * Cô lập bằng cách tắt (active=false) các banner sẵn có của seed trong lúc chạy rồi trả lại —
 * bảng này là singleton toàn hệ thống, không có chiều tenant để né.
 */
const prisma = createPrismaClient();
const asService = prisma as unknown as PrismaService;
const banners = new BannersService(asService, new AuditService(asService));

let dbAvailable = false;
let adminId: string;
let preexistingActiveIds: string[] = [];
const createdIds: string[] = [];

const HOUR = 60 * 60 * 1000;

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
    data: { id: adminId, displayName: 'Banner admin', email: `ban-${adminId}@xeprime.test` },
  });

  const active = await prisma.marketplaceBanner.findMany({
    where: { active: true },
    select: { id: true },
  });
  preexistingActiveIds = active.map((b) => b.id);
  await prisma.marketplaceBanner.updateMany({
    where: { id: { in: preexistingActiveIds } },
    data: { active: false },
  });
});

afterAll(async () => {
  if (dbAvailable) {
    await prisma.marketplaceBanner.deleteMany({ where: { id: { in: createdIds } } });
    await prisma.marketplaceBanner.updateMany({
      where: { id: { in: preexistingActiveIds } },
      data: { active: true },
    });
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

async function make(input: {
  title: string;
  active?: boolean;
  sortOrder?: number;
  startsAt?: string | null;
  endsAt?: string | null;
}) {
  const banner = await banners.create(adminId, {
    title: input.title,
    imageUrl: 'https://example.com/banner.jpg',
    altText: `Alt của ${input.title}`,
    sortOrder: input.sortOrder,
    active: input.active,
    startsAt: input.startsAt,
    endsAt: input.endsAt,
  });
  createdIds.push(banner.id);
  return banner;
}

describe('Banner trang chủ', () => {
  maybe(
    'admin lưu không giới hạn, chỉ 10 banner được trùng lịch và public trả đầy đủ',
    async () => {
      const now = Date.now();
      const visibleIds: string[] = [];
      for (const sortOrder of [1, 0, 2, 3, 4, 5, 6, 7, 8, 9]) {
        const banner = await make({
          title: `B${sortOrder}`,
          sortOrder,
          endsAt: new Date(now + HOUR).toISOString(),
        });
        visibleIds.push(banner.id);
      }

      await expect(
        make({
          title: 'Banner thứ 11',
          sortOrder: 10,
          endsAt: new Date(now + HOUR).toISOString(),
        }),
      ).rejects.toThrow(/tối đa 10 banner/);

      const disabled = await make({ title: 'Đã tắt', sortOrder: 10, active: false });
      await expect(
        banners.update(adminId, disabled.id, {
          active: true,
          endsAt: new Date(now + HOUR).toISOString(),
        }),
      ).rejects.toThrow(/tối đa 10 banner/);

      // Không có trần tổng số: banner tắt, hết hạn hoặc có lịch KHÔNG chồng 10 banner trên vẫn tạo được.
      await make({
        title: 'Chưa tới giờ',
        sortOrder: 11,
        startsAt: new Date(now + 2 * HOUR).toISOString(),
        endsAt: new Date(now + 3 * HOUR).toISOString(),
      });
      await make({
        title: 'Đã hết hạn',
        sortOrder: 12,
        endsAt: new Date(now - HOUR).toISOString(),
      });

      const rows = await banners.publicList();
      expect(rows).toHaveLength(10);
      // Chỉ các trường render — tuyệt đối không lộ title nội bộ/lịch/metadata.
      expect(Object.keys(rows[0]!).sort()).toEqual(
        ['altText', 'id', 'imageUrl', 'linkUrl', 'mobileImageUrl', 'tabletImageUrl'].sort(),
      );
      const alts = rows.map((r) => r.altText);
      expect(alts).toEqual(Array.from({ length: 10 }, (_, index) => `Alt của B${index}`));
      expect(alts.some((a) => a.includes('Đã tắt'))).toBe(false);
      expect(alts.some((a) => a.includes('Chưa tới giờ'))).toBe(false);
      expect(alts.some((a) => a.includes('Đã hết hạn'))).toBe(false);

      const adminRows = await banners.listForAdmin();
      expect(adminRows.filter((row) => createdIds.includes(row.id)).length).toBeGreaterThan(10);

      // Nhường sức chứa cho các test sau; cleanup cuối suite vẫn xoá toàn bộ các hàng này.
      await prisma.marketplaceBanner.updateMany({
        where: { id: { in: visibleIds } },
        data: { active: false },
      });
    },
  );

  maybe('lịch ngược bị chặn ở cả service lẫn CHECK của DB', async () => {
    const now = Date.now();
    await expect(
      make({
        title: 'Lịch ngược',
        startsAt: new Date(now + HOUR).toISOString(),
        endsAt: new Date(now).toISOString(),
      }),
    ).rejects.toThrow(/sau thời điểm bắt đầu/);

    // Đâm thẳng vào DB bỏ qua service — CHECK constraint vẫn phải đỡ.
    await expect(
      prisma.marketplaceBanner.create({
        data: {
          id: newId(),
          title: 'Lách service',
          imageUrl: 'https://example.com/x.jpg',
          altText: 'x',
          startsAt: new Date(now + HOUR),
          endsAt: new Date(now),
        },
      }),
    ).rejects.toThrow();
  });

  maybe('reorder phải gửi TRỌN danh sách; gửi đủ thì thứ tự mới được ghi', async () => {
    const all = await banners.listForAdmin();
    const ids = all.map((b) => b.id);

    await expect(banners.reorder(adminId, { ids: ids.slice(1) })).rejects.toThrow(/toàn bộ/);

    const reversed = [...ids].reverse();
    const after = await banners.reorder(adminId, { ids: reversed });
    expect(after.map((b) => b.id)).toEqual(reversed);
  });

  maybe('update ghép lịch với giá trị cũ trước khi kiểm tra thứ tự', async () => {
    const now = Date.now();
    const banner = await make({
      title: 'Ghép lịch',
      startsAt: new Date(now - HOUR).toISOString(),
      endsAt: new Date(now + HOUR).toISOString(),
    });
    // Chỉ sửa endsAt xuống TRƯỚC startsAt hiện có → phải bị chặn dù payload thiếu startsAt.
    await expect(
      banners.update(adminId, banner.id, { endsAt: new Date(now - 2 * HOUR).toISOString() }),
    ).rejects.toThrow(/sau thời điểm bắt đầu/);
    // Gửi null để XOÁ lịch → hợp lệ.
    const cleared = await banners.update(adminId, banner.id, { startsAt: null, endsAt: null });
    expect(cleared.startsAt).toBeNull();
    expect(cleared.endsAt).toBeNull();
    expect(cleared.visibleNow).toBe(true);
  });

  maybe('mutation ghi audit_logs', async () => {
    const banner = await make({ title: 'Audit check' });
    await banners.remove(adminId, banner.id);
    const logs = await prisma.auditLog.findMany({
      where: { actorUserId: adminId, targetType: 'marketplace_banner' },
      select: { action: true },
    });
    const actions = new Set(logs.map((l) => l.action));
    expect(actions.has('banner.create')).toBe(true);
    expect(actions.has('banner.delete')).toBe(true);
  });
});

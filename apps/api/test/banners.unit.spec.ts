import type { PrismaService } from '../src/prisma/prisma.service';
import { AuditService } from '../src/modules/audit/audit.service';
import { BannersService } from '../src/modules/banners/banners.service';

const input = {
  title: 'Banner mới',
  imageUrl: 'https://example.com/banner.jpg',
  altText: 'Banner mới',
  sortOrder: 100,
};

function serviceWith(transaction: Record<string, unknown>) {
  const prisma = {
    $transaction: jest.fn(async (run: (tx: unknown) => Promise<unknown>) => run(transaction)),
  } as unknown as PrismaService;
  const audit = { record: jest.fn().mockResolvedValue(undefined) } as unknown as AuditService;
  return { service: new BannersService(prisma, audit), audit };
}

describe('BannersService — giới hạn hiển thị', () => {
  it('public trả toàn bộ kết quả phù hợp, không cắt cứng bằng take', async () => {
    const rows = Array.from({ length: 12 }, (_, index) => ({
      id: `b${index}`,
      imageUrl: `https://example.com/${index}.jpg`,
      tabletImageUrl: null,
      mobileImageUrl: null,
      altText: `Banner ${index}`,
      linkUrl: null,
    }));
    const findMany = jest.fn().mockResolvedValue(rows);
    const prisma = { marketplaceBanner: { findMany } } as unknown as PrismaService;
    const service = new BannersService(prisma, {} as AuditService);

    await expect(service.publicList()).resolves.toEqual(rows);
    expect(findMany.mock.calls[0]![0]).not.toHaveProperty('take');
  });

  it('từ chối tạo banner thứ 11 có lịch chồng nhau', async () => {
    const transaction = {
      // Khoá singleton dùng $executeRaw — xem `lockBannerVisibility`: `pg_advisory_xact_lock`
      // trả kiểu `void`, mà $queryRaw ánh xạ kiểu từng cột và không có nhánh cho nó.
      $executeRaw: jest.fn().mockResolvedValue(0),
      marketplaceBanner: {
        findMany: jest
          .fn()
          .mockResolvedValue(Array.from({ length: 10 }, () => ({ startsAt: null, endsAt: null }))),
        create: jest.fn(),
      },
    };
    const { service } = serviceWith(transaction);

    await expect(service.create('admin', input)).rejects.toThrow(/tối đa 10 banner/);
    expect(transaction.marketplaceBanner.create).not.toHaveBeenCalled();
  });

  it('vẫn cho tạo thêm banner đã tắt khi đã có 10 banner khác', async () => {
    const now = new Date();
    const created = {
      id: 'inactive-extra',
      ...input,
      tabletImageUrl: null,
      mobileImageUrl: null,
      linkUrl: null,
      active: false,
      startsAt: null,
      endsAt: null,
      createdAt: now,
      updatedAt: now,
    };
    const transaction = {
      // Khoá singleton dùng $executeRaw — xem `lockBannerVisibility`: `pg_advisory_xact_lock`
      // trả kiểu `void`, mà $queryRaw ánh xạ kiểu từng cột và không có nhánh cho nó.
      $executeRaw: jest.fn().mockResolvedValue(0),
      marketplaceBanner: {
        findMany: jest.fn(),
        create: jest.fn().mockResolvedValue(created),
      },
    };
    const { service } = serviceWith(transaction);

    await expect(service.create('admin', { ...input, active: false })).resolves.toMatchObject({
      id: 'inactive-extra',
      active: false,
      visibleNow: false,
    });
    expect(transaction.marketplaceBanner.findMany).not.toHaveBeenCalled();
    expect(transaction.marketplaceBanner.create).toHaveBeenCalledTimes(1);
  });
});

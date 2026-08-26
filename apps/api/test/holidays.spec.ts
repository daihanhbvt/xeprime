import { createPrismaClient, newId } from '@xeprime/prisma';
import { API_ERROR_CODE, HOLIDAY_EVENT_TYPE, HOLIDAY_SOURCE } from '@xeprime/types';
import 'reflect-metadata';
import { HOLIDAY_MAX_QUERY_DAYS, HolidaysService } from '../src/modules/holidays/holidays.service';
import type { PrismaService } from '../src/prisma/prisma.service';

/**
 * Đọc lịch nghỉ lễ trên PostgreSQL THẬT.
 *
 * Điều được khoá là phép lọc OVERLAP — thứ duy nhất trong endpoint này có thể sai âm thầm:
 * lọc theo `start_date BETWEEN from AND to` cũng chạy, cũng trả dữ liệu, và chỉ sai đúng vào
 * lúc quan trọng nhất (mở lịch giữa kỳ nghỉ Tết thì Tết biến mất). Cùng với nó là bẫy lệch một
 * ngày của `end_date`: một ngày lễ đúng một ngày phải kết thúc đúng ngày đó.
 */
const prisma = createPrismaClient();
const holidays = new HolidaysService(prisma as unknown as PrismaService);

let dbAvailable = false;
const createdIds: string[] = [];

/** Ngày lễ do test tạo, đánh dấu bằng tiền tố tên để dọn sạch mà không đụng dữ liệu khác. */
const TEST_PREFIX = 'TEST-HOLIDAY';

async function seedHoliday(over: {
  name: string;
  startDate: string;
  endDate: string;
  eventType?: string;
  source?: string;
  description?: string | null;
}): Promise<string> {
  const id = newId();
  await prisma.publicHoliday.create({
    data: {
      id,
      googleEventId: (over.source ?? HOLIDAY_SOURCE.GOOGLE_CALENDAR) === HOLIDAY_SOURCE.MANUAL
        ? null
        : `${TEST_PREFIX}-${id}`,
      startDate: new Date(`${over.startDate}T00:00:00.000Z`),
      endDate: new Date(`${over.endDate}T00:00:00.000Z`),
      name: `${TEST_PREFIX} ${over.name}`,
      description: over.description ?? null,
      eventType: over.eventType ?? HOLIDAY_EVENT_TYPE.PUBLIC_HOLIDAY,
      source: over.source ?? HOLIDAY_SOURCE.GOOGLE_CALENDAR,
      syncedAt: new Date(),
    },
  });
  createdIds.push(id);
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

  // 30/04 và 01/05: hai ngày lễ liền nhau, mỗi cái ĐÚNG một ngày.
  await seedHoliday({ name: 'Giải phóng miền Nam', startDate: '2026-04-30', endDate: '2026-04-30' });
  await seedHoliday({ name: 'Quốc tế Lao động', startDate: '2026-05-01', endDate: '2026-05-01' });
  // Tết: kỳ nghỉ nhiều ngày, dùng để kiểm truy vấn vắt qua biên.
  await seedHoliday({ name: 'Tết Nguyên đán', startDate: '2026-02-17', endDate: '2026-02-23' });
  // Ngoài mọi khoảng được hỏi — không được lọt vào kết quả nào.
  await seedHoliday({ name: 'Quốc khánh', startDate: '2026-09-02', endDate: '2026-09-02' });
});

afterAll(async () => {
  if (dbAvailable && createdIds.length > 0) {
    await prisma.publicHoliday.deleteMany({ where: { id: { in: createdIds } } });
  }
  await prisma.$disconnect();
});

const maybe = (name: string, fn: () => Promise<void>) =>
  it(name, async () => {
    if (!dbAvailable) return;
    await fn();
  });

/** Chỉ giữ bản ghi do chính spec này tạo — database dev có thể đã có dữ liệu đồng bộ thật. */
function onlyTestRows<T extends { name: string }>(rows: T[]): T[] {
  return rows.filter((row) => row.name.startsWith(TEST_PREFIX));
}

describe('GET /holidays — khoảng ngày', () => {
  maybe('trả đúng ngày lễ trong khoảng, endDate KHÔNG dư một ngày', async () => {
    const items = onlyTestRows(await holidays.listInRange('2026-04-25', '2026-05-05'));

    expect(items).toHaveLength(2);
    expect(items[0]).toMatchObject({ startDate: '2026-04-30', endDate: '2026-04-30' });
    expect(items[1]).toMatchObject({ startDate: '2026-05-01', endDate: '2026-05-01' });
  });

  maybe('ngày lễ ngoài khoảng không lọt vào', async () => {
    const items = onlyTestRows(await holidays.listInRange('2026-04-25', '2026-05-05'));

    expect(items.some((i) => i.name.includes('Quốc khánh'))).toBe(false);
  });

  maybe('kỳ nghỉ nhiều ngày vắt qua biên TRÁI vẫn trả về', async () => {
    // Hỏi từ 20/02: Tết đã bắt đầu từ 17/02 và vẫn đang diễn ra.
    const items = onlyTestRows(await holidays.listInRange('2026-02-20', '2026-02-28'));

    expect(items).toHaveLength(1);
    expect(items[0]).toMatchObject({ startDate: '2026-02-17', endDate: '2026-02-23' });
  });

  maybe('kỳ nghỉ nhiều ngày vắt qua biên PHẢI vẫn trả về', async () => {
    const items = onlyTestRows(await holidays.listInRange('2026-02-10', '2026-02-18'));

    expect(items).toHaveLength(1);
    expect(items[0]?.name).toContain('Tết');
  });

  maybe('hỏi đúng MỘT ngày nằm giữa kỳ nghỉ vẫn thấy kỳ nghỉ đó', async () => {
    const items = onlyTestRows(await holidays.listInRange('2026-02-19', '2026-02-19'));

    expect(items).toHaveLength(1);
  });

  maybe('khoảng không có ngày lễ nào → mảng rỗng, không phải lỗi', async () => {
    const items = onlyTestRows(await holidays.listInRange('2026-06-01', '2026-06-30'));

    expect(items).toEqual([]);
  });

  maybe('trả đủ trường hiển thị và KHÔNG lộ chi tiết đồng bộ của Google', async () => {
    const items = onlyTestRows(await holidays.listInRange('2026-04-30', '2026-04-30'));
    const item = items[0]!;

    expect(Object.keys(item).sort()).toEqual(
      ['description', 'endDate', 'eventType', 'id', 'name', 'source', 'startDate', 'syncedAt'].sort(),
    );
    expect(item).not.toHaveProperty('googleEventId');
    expect(item).not.toHaveProperty('googleUpdatedAt');
  });
});

describe('GET /holidays — chặn khoảng vô lý', () => {
  maybe('khoảng quá dài → 400 VALIDATION_FAILED', async () => {
    await expect(holidays.listInRange('2020-01-01', '2030-12-31')).rejects.toMatchObject({
      response: { code: API_ERROR_CODE.VALIDATION_FAILED },
      status: 400,
    });
  });

  maybe(`đúng trần ${HOLIDAY_MAX_QUERY_DAYS} ngày thì vẫn chạy`, async () => {
    // from + (trần - 1) ngày = đúng `HOLIDAY_MAX_QUERY_DAYS` ngày tính cả hai đầu.
    const from = new Date('2026-01-01T00:00:00.000Z');
    const to = new Date(from.getTime() + (HOLIDAY_MAX_QUERY_DAYS - 1) * 86_400_000);

    await expect(
      holidays.listInRange('2026-01-01', to.toISOString().slice(0, 10)),
    ).resolves.toBeInstanceOf(Array);
  });

  maybe('to đứng trước from → 400 VALIDATION_FAILED', async () => {
    await expect(holidays.listInRange('2026-05-05', '2026-04-25')).rejects.toMatchObject({
      response: { code: API_ERROR_CODE.VALIDATION_FAILED },
    });
  });
});

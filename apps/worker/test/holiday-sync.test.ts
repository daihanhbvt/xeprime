import { test } from 'node:test';
import assert from 'node:assert/strict';
import type { PrismaClient } from '@xeprime/prisma';
import { HOLIDAY_SYNC_STATUS, HOLIDAY_SYNC_TRIGGER } from '@xeprime/types';
import { redactSecrets, shouldRunHolidaySync, syncHolidays } from '../src/jobs/holiday-sync';

/**
 * `syncHolidays` — khoá lại HÀNH VI KHI HỎNG, thứ không thể kiểm bằng hàm thuần.
 *
 * Điều quan trọng nhất của job này không phải "đồng bộ đúng" (đã kiểm ở
 * `packages/domain/src/holidays.test.ts`) mà là: **Google hỏng thì dữ liệu cũ nguyên vẹn**. Một
 * lượt fail được phép để lại một dòng nhật ký; nó KHÔNG được phép chạm vào `public_holidays` —
 * nếu chạm, một sự cố mạng 30 giây sẽ xoá sạch lịch nghỉ lễ của cả nền tảng.
 *
 * Prisma giả, fetcher giả: không DB, không mạng. Cái được kiểm là job GỌI GÌ, theo thứ tự nào.
 */

interface Recorded {
  readonly table: string;
  readonly op: string;
  readonly args: unknown;
}

/**
 * Prisma giả ghi lại mọi lệnh. Chỉ implement đúng bề mặt mà job dùng — thêm nữa là dựng lại
 * Prisma, và một bản dựng lại sai sẽ kiểm chứng nhầm thứ.
 */
function fakePrisma(existingRows: unknown[] = []): {
  prisma: PrismaClient;
  calls: Recorded[];
} {
  const calls: Recorded[] = [];
  const record = (table: string, op: string) => (args: unknown) => {
    calls.push({ table, op, args });
    return Promise.resolve(op === 'findMany' ? existingRows : { count: 0 });
  };

  const client = {
    holidaySyncRun: {
      create: record('holidaySyncRun', 'create'),
      update: record('holidaySyncRun', 'update'),
      findFirst: record('holidaySyncRun', 'findFirst'),
    },
    publicHoliday: {
      findMany: record('publicHoliday', 'findMany'),
      createMany: record('publicHoliday', 'createMany'),
      update: record('publicHoliday', 'update'),
      deleteMany: record('publicHoliday', 'deleteMany'),
    },
    auditLog: { create: record('auditLog', 'create') },
    // Transaction chạy callback ngay trên chính client giả — đủ để quan sát thứ tự lệnh.
    $transaction: (fn: (tx: unknown) => Promise<unknown>) => fn(client),
  };

  return { prisma: client as unknown as PrismaClient, calls };
}

const DEPS = {
  calendarId: 'vi.vietnamese#holiday@group.v.calendar.google.com',
  apiKey: 'test-holiday-key',
  now: new Date('2026-08-26T02:00:00.000Z'), // 09:00 giờ VN
};

const HOLIDAY_EVENT = {
  id: 'evt-2-9',
  status: 'confirmed',
  summary: 'Quốc khánh',
  description: 'Ngày lễ công cộng',
  updated: '2026-01-01T00:00:00.000Z',
  start: { date: '2026-09-02' },
  end: { date: '2026-09-03' },
};

test('fetcher NÉM → không một lệnh ghi nào lên public_holidays', async () => {
  const { prisma, calls } = fakePrisma();

  const result = await syncHolidays(prisma, {
    ...DEPS,
    fetchEvents: () => Promise.reject(new Error('getaddrinfo ENOTFOUND googleapis.com')),
  });

  assert.equal(result.status, HOLIDAY_SYNC_STATUS.FAILED);

  const touchedHolidays = calls.filter((c) => c.table === 'publicHoliday');
  assert.deepEqual(touchedHolidays, [], 'lượt fail không được chạm vào bảng ngày lễ');
});

test('fetcher NÉM → sổ chạy đóng lại là failed, kèm lý do đọc được', async () => {
  const { prisma, calls } = fakePrisma();

  await syncHolidays(prisma, {
    ...DEPS,
    fetchEvents: () => Promise.reject(new Error('Google Calendar API trả HTTP 403')),
  });

  const closing = calls.find((c) => c.table === 'holidaySyncRun' && c.op === 'update');
  assert.ok(closing, 'phải có lệnh đóng sổ');
  const data = (closing.args as { data: Record<string, unknown> }).data;
  assert.equal(data.status, HOLIDAY_SYNC_STATUS.FAILED);
  assert.match(String(data.errorMessage), /HTTP 403/);
  assert.ok(data.finishedAt instanceof Date);
});

test('mở sổ TRƯỚC khi gọi Google — một lượt chết giữa chừng vẫn để lại dấu vết', async () => {
  const { prisma, calls } = fakePrisma();
  let fetchedAfterOpen = false;

  await syncHolidays(prisma, {
    ...DEPS,
    fetchEvents: () => {
      fetchedAfterOpen = calls.some((c) => c.table === 'holidaySyncRun' && c.op === 'create');
      return Promise.resolve([]);
    },
  });

  assert.equal(fetchedAfterOpen, true);
});

test('lượt thành công ghi đủ bốn con số + đóng sổ success', async () => {
  const { prisma, calls } = fakePrisma();

  const result = await syncHolidays(prisma, {
    ...DEPS,
    fetchEvents: () => Promise.resolve([HOLIDAY_EVENT]),
  });

  assert.equal(result.status, HOLIDAY_SYNC_STATUS.SUCCESS);
  assert.deepEqual(
    { found: result.found, created: result.created, updated: result.updated, deleted: result.deleted },
    { found: 1, created: 1, updated: 0, deleted: 0 },
  );

  const created = calls.find((c) => c.table === 'publicHoliday' && c.op === 'createMany');
  assert.ok(created);
  const rows = (created.args as { data: Array<Record<string, unknown>> }).data;
  // endDate INCLUSIVE: end.date=2026-09-03 end-exclusive → ngày cuối là 02/09, không phải 03/09.
  assert.equal((rows[0]?.endDate as Date).toISOString().slice(0, 10), '2026-09-02');

  const closing = calls.filter((c) => c.table === 'holidaySyncRun' && c.op === 'update').at(-1);
  const data = (closing?.args as { data: Record<string, unknown> }).data;
  assert.equal(data.status, HOLIDAY_SYNC_STATUS.SUCCESS);
  assert.equal(data.eventsCreated, 1);
});

/*
 * Hồi quy cho lỗi thật ngày 26/08/2026: lượt đồng bộ thứ hai chết vì
 * `Unique constraint failed on (google_event_id)`.
 *
 * Nguyên nhân: dòng hiện có được đọc CHỈ theo cửa sổ ngày, trong khi `timeMin`/`timeMax` của
 * Google lọc theo mốc thời gian — hai phép lọc lệch nhau ở biên. Một ngày lễ 31/12/2024 có
 * `end.date = 2025-01-01` nên vẫn được Google trả về, nhưng dòng lưu lại mang
 * `end_date = 2024-12-31`, nằm ngoài cửa sổ 2025-01-01…2027-12-31. Lượt sau không thấy nó
 * trong `existing` → coi là sự kiện mới → `createMany` đụng unique.
 */
test('đọc dòng hiện có PHẢI hỏi thêm theo google_event_id vừa nhận, không chỉ theo cửa sổ ngày', async () => {
  const { prisma, calls } = fakePrisma();

  await syncHolidays(prisma, { ...DEPS, fetchEvents: () => Promise.resolve([HOLIDAY_EVENT]) });

  const read = calls.find((c) => c.table === 'publicHoliday' && c.op === 'findMany');
  assert.ok(read, 'phải có lệnh đọc dòng hiện có');

  const where = (read.args as { where: { OR?: Array<Record<string, unknown>> } }).where;
  assert.ok(Array.isArray(where.OR), 'điều kiện đọc phải là OR hai vế, không phải chỉ cửa sổ ngày');

  const byEventId = where.OR.find((clause) => 'googleEventId' in clause) as
    | { googleEventId: { in: string[] } }
    | undefined;
  assert.ok(byEventId, 'thiếu vế hỏi theo google_event_id — chính là lỗi đã xảy ra');
  assert.deepEqual(byEventId.googleEventId.in, ['evt-2-9']);

  const byWindow = where.OR.find((clause) => 'startDate' in clause);
  assert.ok(byWindow, 'vẫn phải giữ vế cửa sổ ngày để phát hiện dòng Google đã gỡ');
});

test('lỗi ở phần GHI cũng đóng sổ failed, không ném ra ngoài và không để dòng treo', async () => {
  const { prisma, calls } = fakePrisma();
  // Ép transaction hỏng đúng như lúc `createMany` đụng unique constraint.
  (prisma as unknown as { $transaction: unknown }).$transaction = () =>
    Promise.reject(new Error('Unique constraint failed on the fields: (`google_event_id`)'));

  const result = await syncHolidays(prisma, {
    ...DEPS,
    fetchEvents: () => Promise.resolve([HOLIDAY_EVENT]),
  });

  assert.equal(result.status, HOLIDAY_SYNC_STATUS.FAILED);

  const closing = calls.filter((c) => c.table === 'holidaySyncRun' && c.op === 'update').at(-1);
  const data = (closing?.args as { data: Record<string, unknown> }).data;
  assert.equal(data.status, HOLIDAY_SYNC_STATUS.FAILED);
  assert.ok(data.finishedAt instanceof Date, 'không được để dòng nhật ký treo lơ lửng');
  assert.match(String(data.errorMessage), /google_event_id/);
});

test('không có thay đổi nào → KHÔNG ghi audit (sổ kiểm toán không phải nhật ký nhịp tim)', async () => {
  const { prisma, calls } = fakePrisma();

  await syncHolidays(prisma, { ...DEPS, fetchEvents: () => Promise.resolve([]) });

  assert.deepEqual(
    calls.filter((c) => c.table === 'auditLog'),
    [],
  );
});

test('có thay đổi thật → ghi audit hệ thống action holiday.sync', async () => {
  const { prisma, calls } = fakePrisma();

  await syncHolidays(prisma, { ...DEPS, fetchEvents: () => Promise.resolve([HOLIDAY_EVENT]) });

  const audit = calls.find((c) => c.table === 'auditLog');
  assert.ok(audit);
  const data = (audit.args as { data: Record<string, unknown> }).data;
  assert.equal(data.action, 'holiday.sync');
  assert.equal(data.targetType, 'holiday_sync_run');
  assert.equal(data.actorUserId, null, 'không người nào bấm nút ở đây');
});

test('trigger mặc định là scheduled; script thủ công ghi manual', async () => {
  const scheduled = fakePrisma();
  await syncHolidays(scheduled.prisma, { ...DEPS, fetchEvents: () => Promise.resolve([]) });
  const openedScheduled = scheduled.calls.find((c) => c.op === 'create');
  assert.equal(
    (openedScheduled?.args as { data: Record<string, unknown> }).data.trigger,
    HOLIDAY_SYNC_TRIGGER.SCHEDULED,
  );

  const manual = fakePrisma();
  await syncHolidays(manual.prisma, {
    ...DEPS,
    trigger: HOLIDAY_SYNC_TRIGGER.MANUAL,
    fetchEvents: () => Promise.resolve([]),
  });
  const openedManual = manual.calls.find((c) => c.op === 'create');
  assert.equal(
    (openedManual?.args as { data: Record<string, unknown> }).data.trigger,
    HOLIDAY_SYNC_TRIGGER.MANUAL,
  );
});

test('redactSecrets che key cả khi nó nằm trong URL lẫn khi đứng trần', () => {
  const key = 'AIza-bí-mật';

  assert.ok(
    !redactSecrets(`request tới https://x/events?key=${key}&timeMin=1 lỗi`, key).includes(key),
  );
  assert.ok(!redactSecrets(`key ${key} bị từ chối`, key).includes(key));
});

test('cổng chạy: trước 06:00 giờ VN thì chưa tới lượt, không hỏi DB', async () => {
  const { prisma, calls } = fakePrisma();

  // 22:00Z ngày 25/08 = 05:00 giờ VN ngày 26/08.
  const ok = await shouldRunHolidaySync(prisma, new Date('2026-08-25T22:00:00.000Z'));

  assert.equal(ok, false);
  assert.deepEqual(calls, [], 'chưa tới giờ thì không đụng DB');
});

test('cổng chạy: sau 06:00 và hôm nay chưa có lượt success → chạy', async () => {
  const client = {
    holidaySyncRun: { findFirst: () => Promise.resolve(null) },
  } as unknown as PrismaClient;

  assert.equal(await shouldRunHolidaySync(client, new Date('2026-08-26T02:00:00.000Z')), true);
});

test('cổng chạy: hôm nay đã có lượt success → bỏ qua', async () => {
  const client = {
    holidaySyncRun: { findFirst: () => Promise.resolve({ id: 'run-1' }) },
  } as unknown as PrismaClient;

  assert.equal(await shouldRunHolidaySync(client, new Date('2026-08-26T02:00:00.000Z')), false);
});

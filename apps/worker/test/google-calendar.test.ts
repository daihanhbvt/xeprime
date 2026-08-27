import { after, beforeEach, test } from 'node:test';
import assert from 'node:assert/strict';
import { fetchHolidayEvents } from '../src/lib/google-calendar';

/**
 * `fetchHolidayEvents` — phần DUY NHẤT của luồng ngày lễ nói chuyện ra ngoài.
 *
 * Vì sao spec này tồn tại: mọi thứ khác trong luồng đã kiểm được bằng hàm thuần
 * (`packages/domain/src/holidays.test.ts`) hoặc bằng fake prisma (`holiday-sync.test.ts`). Chỗ
 * chưa ai kiểm là HÌNH của request — calendarId có escape chưa, `singleEvents`/`showDeleted` có
 * đúng tên không, phân trang có đi tiếp không. Đó chính là phần sẽ vỡ lúc cắm key thật, và nếu
 * không khoá ở đây thì cách phát hiện duy nhất là một lịch trống trơn không ai giải thích được.
 *
 * `fetch` bị chặn hoàn toàn: **không một byte nào rời khỏi máy**, kể cả khi ai đó lỡ để key
 * thật trong `.env`. Cùng khuôn với `apps/api/test/google-geo-provider.spec.ts`.
 */
const PARAMS = {
  calendarId: 'vi.vietnamese#holiday@group.v.calendar.google.com',
  apiKey: 'test-holiday-key',
  timeMin: '2025-01-01T00:00:00+07:00',
  timeMax: '2027-12-31T23:59:59+07:00',
};

const realFetch = global.fetch;
let calls: string[] = [];

/** Trả lần lượt từng response đã dựng sẵn, và ghi lại mọi URL đã gọi để assert. */
function stubFetch(pages: Array<{ body: unknown; ok?: boolean; status?: number }>): void {
  let index = 0;
  global.fetch = ((url: string | URL) => {
    calls.push(String(url));
    const page = pages[Math.min(index, pages.length - 1)];
    index += 1;
    return Promise.resolve({
      ok: page?.ok ?? true,
      status: page?.status ?? 200,
      json: () => Promise.resolve(page?.body),
    } as Response);
  }) as typeof fetch;
}

beforeEach(() => {
  calls = [];
});

after(() => {
  global.fetch = realFetch;
});

test('calendarId được escape — dấu # không cắt cụt đường dẫn', async () => {
  stubFetch([{ body: { items: [] } }]);

  await fetchHolidayEvents(PARAMS);

  const url = new URL(calls[0]!);
  assert.equal(
    url.pathname,
    '/calendar/v3/calendars/vi.vietnamese%23holiday%40group.v.calendar.google.com/events',
  );
  // Không escape thì `#` biến phần sau thành fragment và pathname cụt ở `vi.vietnamese`.
  assert.ok(!url.pathname.endsWith('vi.vietnamese/events'));
  assert.equal(url.hash, '');
});

test('request mang đủ tham số bắt buộc, kể cả showDeleted', async () => {
  stubFetch([{ body: { items: [] } }]);

  await fetchHolidayEvents(PARAMS);

  const params = new URL(calls[0]!).searchParams;
  assert.equal(params.get('key'), 'test-holiday-key');
  assert.equal(params.get('timeMin'), PARAMS.timeMin);
  assert.equal(params.get('timeMax'), PARAMS.timeMax);
  // Bung sự kiện lặp — không có nó thì ngày lễ hằng năm về dưới dạng một luật RRULE.
  assert.equal(params.get('singleEvents'), 'true');
  // Đường DUY NHẤT biết một ngày lễ đã bị gỡ khỏi lịch nguồn.
  assert.equal(params.get('showDeleted'), 'true');
  assert.equal(params.get('orderBy'), 'startTime');
  assert.equal(params.get('maxResults'), '2500');
});

test('đi hết phân trang bằng nextPageToken và gộp mọi trang', async () => {
  stubFetch([
    { body: { items: [{ id: 'a' }], nextPageToken: 'trang-2' } },
    { body: { items: [{ id: 'b' }] } },
  ]);

  const events = await fetchHolidayEvents(PARAMS);

  assert.deepEqual(
    events.map((e) => e.id),
    ['a', 'b'],
  );
  assert.equal(calls.length, 2);
  assert.equal(new URL(calls[0]!).searchParams.get('pageToken'), null);
  assert.equal(new URL(calls[1]!).searchParams.get('pageToken'), 'trang-2');
});

test('HTTP lỗi thì NÉM — "không hỏi được" khác hẳn "không có ngày lễ nào"', async () => {
  stubFetch([{ body: {}, ok: false, status: 403 }]);

  await assert.rejects(() => fetchHolidayEvents(PARAMS), /HTTP 403/);
});

test('thông điệp lỗi KHÔNG mang theo API key', async () => {
  stubFetch([{ body: {}, ok: false, status: 429 }]);

  await assert.rejects(
    () => fetchHolidayEvents(PARAMS),
    (err: Error) => !err.message.includes('test-holiday-key'),
  );
});

test('body mang error của Google (HTTP 200) vẫn là lỗi', async () => {
  stubFetch([{ body: { error: { status: 'PERMISSION_DENIED', message: 'Calendar API chưa bật' } } }]);

  await assert.rejects(() => fetchHolidayEvents(PARAMS), /PERMISSION_DENIED/);
});

test('token tự trỏ mãi về chính nó thì dừng ở trần trang, không lặp vô hạn', async () => {
  stubFetch([{ body: { items: [{ id: 'x' }], nextPageToken: 'mãi-mãi' } }]);

  await assert.rejects(() => fetchHolidayEvents(PARAMS), /trang sau/);
});

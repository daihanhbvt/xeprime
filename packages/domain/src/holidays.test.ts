import { describe, expect, it } from 'vitest';
import { HOLIDAY_EVENT_TYPE, HOLIDAY_SOURCE } from '@xeprime/types';

import {
  classifyHolidayEventType,
  expandHolidaysByDay,
  googleAllDayEndToInclusive,
  holidaySyncWindow,
  normalizeGoogleHolidayEvent,
  normalizeGoogleHolidayEvents,
  planHolidaySync,
  type ExistingHolidayRow,
  type GoogleCalendarEventLike,
  type NormalizedHoliday,
} from './holidays';

/**
 * Luật ngày lễ — ba thứ mà tính năng này sai được, khoá lại ở đây vì cả ba đều không cần
 * mạng lẫn DB để chứng minh.
 *
 * Cái được kiểm KHÔNG phải "hàm chạy không lỗi" mà là ba câu khẳng định nghiệp vụ:
 *  - ngày lễ không được dài thêm một ngày (bẫy `end.date` end-exclusive của Google);
 *  - đồng bộ lần hai với dữ liệu y hệt không được ghi một dòng nào;
 *  - đồng bộ không bao giờ xoá dòng do người vận hành nhập tay.
 */

/** Event all-day theo đúng hình Google trả về cho lịch nghỉ lễ. */
function allDay(over: Partial<GoogleCalendarEventLike> = {}): GoogleCalendarEventLike {
  return {
    id: 'evt-30-4',
    status: 'confirmed',
    summary: 'Ngày Giải phóng miền Nam',
    description: 'Ngày lễ công cộng',
    updated: '2026-01-02T03:04:05.000Z',
    start: { date: '2026-04-30' },
    end: { date: '2026-05-01' },
    ...over,
  };
}

function normalized(over: Partial<NormalizedHoliday> = {}): NormalizedHoliday {
  return {
    googleEventId: 'evt-30-4',
    startDate: '2026-04-30',
    endDate: '2026-04-30',
    name: 'Ngày Giải phóng miền Nam',
    description: 'Ngày lễ công cộng',
    eventType: HOLIDAY_EVENT_TYPE.PUBLIC_HOLIDAY,
    googleUpdatedAt: '2026-01-02T03:04:05.000Z',
    ...over,
  };
}

/** Dòng DB tương ứng với `normalized()` — dùng để chứng minh lần đồng bộ thứ hai là no-op. */
function existingRow(over: Partial<ExistingHolidayRow> = {}): ExistingHolidayRow {
  const base = normalized();
  return {
    id: 'row-1',
    googleEventId: base.googleEventId,
    startDate: base.startDate,
    endDate: base.endDate,
    name: base.name,
    description: base.description,
    eventType: base.eventType,
    source: HOLIDAY_SOURCE.GOOGLE_CALENDAR,
    googleUpdatedAt: base.googleUpdatedAt,
    ...over,
  };
}

describe('end.date của Google là END-EXCLUSIVE', () => {
  it('sự kiện MỘT ngày: end.date 01/05 → endDate 30/04, không dư một ngày', () => {
    const result = normalizeGoogleHolidayEvent(allDay());

    expect(result).toMatchObject({ startDate: '2026-04-30', endDate: '2026-04-30' });
  });

  it('sự kiện NHIỀU ngày: Tết 17→23/02 khai end.date 24/02 → endDate 23/02', () => {
    const result = normalizeGoogleHolidayEvent(
      allDay({
        id: 'evt-tet',
        summary: 'Tết Nguyên đán',
        start: { date: '2026-02-17' },
        end: { date: '2026-02-24' },
      }),
    );

    expect(result).toMatchObject({ startDate: '2026-02-17', endDate: '2026-02-23' });
  });

  it('thiếu hẳn end.date → sự kiện một ngày, không phải sự kiện vô hạn', () => {
    const result = normalizeGoogleHolidayEvent(allDay({ end: null }));

    expect(result).toMatchObject({ startDate: '2026-04-30', endDate: '2026-04-30' });
  });

  it('hàm quy đổi đứng riêng cũng phải đúng ở biên tháng và biên năm', () => {
    expect(googleAllDayEndToInclusive('2026-05-01')).toBe('2026-04-30');
    expect(googleAllDayEndToInclusive('2027-01-01')).toBe('2026-12-31');
  });
});

describe('event có GIỜ quy về ngày Việt Nam', () => {
  it('mốc UTC rơi vào ngày hôm sau theo giờ VN thì lấy ngày VN', () => {
    // 22:00Z ngày 01/09 = 05:00 ngày 02/09 giờ VN.
    const result = normalizeGoogleHolidayEvent({
      id: 'evt-timed',
      summary: 'Quốc khánh',
      description: 'Ngày lễ công cộng',
      start: { dateTime: '2026-09-01T22:00:00.000Z' },
      end: { dateTime: '2026-09-02T10:00:00.000Z' },
    });

    expect(result).toMatchObject({ startDate: '2026-09-02', endDate: '2026-09-02' });
  });

  it('kết thúc đúng 00:00 giờ VN thuộc về ngày hôm trước (cùng quy ước nửa mở)', () => {
    const result = normalizeGoogleHolidayEvent({
      id: 'evt-timed-midnight',
      summary: 'Giao thừa',
      start: { dateTime: '2026-02-16T01:00:00.000Z' }, // 08:00 VN ngày 16/02
      end: { dateTime: '2026-02-16T17:00:00.000Z' }, // 00:00 VN ngày 17/02
    });

    expect(result).toMatchObject({ startDate: '2026-02-16', endDate: '2026-02-16' });
  });
});

describe('phân loại theo mô tả của Google', () => {
  /*
   * HAI mô tả DUY NHẤT mà lịch `vi.vietnamese#holiday` thật sự trả về — chép nguyên văn từ dữ
   * liệu đồng bộ ngày 26/08/2026. Đây là cặp quan trọng nhất trong cả file: bản đầu tiên của
   * bảng từ khoá đoán là "Ngày lễ công cộng" và trượt cả 45 ngày nghỉ chính thức, không test
   * nào đỏ vì mọi test đều dùng chuỗi tôi tự nghĩ ra.
   */
  const GOOGLE_PUBLIC_HOLIDAY = 'Ngày lễ';
  const GOOGLE_OBSERVANCE =
    'Ngày lễ kỷ niệm\nĐể ẩn các ngày lễ kỷ niệm, hãy chuyển đến phần Cài đặt Lịch Google > Ngày lễ ở Việt Nam';

  it('mô tả THẬT của Google: "Ngày lễ" trơn là ngày nghỉ chính thức', () => {
    expect(classifyHolidayEventType(GOOGLE_PUBLIC_HOLIDAY)).toBe(
      HOLIDAY_EVENT_TYPE.PUBLIC_HOLIDAY,
    );
  });

  it('mô tả THẬT của Google: "Ngày lễ kỷ niệm" là ngày kỷ niệm, KHÔNG phải ngày nghỉ', () => {
    // Chuỗi này chứa trọn "ngày lễ" — nếu luật public_holiday chạy trước thì 20/10 sẽ được
    // báo là ngày cả nước nghỉ.
    expect(classifyHolidayEventType(GOOGLE_OBSERVANCE)).toBe(HOLIDAY_EVENT_TYPE.OBSERVANCE);
  });

  it('nhận cả tiếng Việt lẫn tiếng Anh', () => {
    expect(classifyHolidayEventType('Ngày lễ công cộng')).toBe(HOLIDAY_EVENT_TYPE.PUBLIC_HOLIDAY);
    expect(classifyHolidayEventType('Public holiday')).toBe(HOLIDAY_EVENT_TYPE.PUBLIC_HOLIDAY);
    expect(classifyHolidayEventType('Ngày kỷ niệm')).toBe(HOLIDAY_EVENT_TYPE.OBSERVANCE);
    expect(classifyHolidayEventType('Observance')).toBe(HOLIDAY_EVENT_TYPE.OBSERVANCE);
    expect(classifyHolidayEventType('Season')).toBe(HOLIDAY_EVENT_TYPE.SEASON);
  });

  it('không đọc được thì là OTHER — KHÔNG đoán thành ngày nghỉ chính thức', () => {
    expect(classifyHolidayEventType(null)).toBe(HOLIDAY_EVENT_TYPE.OTHER);
    expect(classifyHolidayEventType('   ')).toBe(HOLIDAY_EVENT_TYPE.OTHER);
    expect(classifyHolidayEventType('Một mô tả lạ')).toBe(HOLIDAY_EVENT_TYPE.OTHER);
  });
});

describe('bỏ qua event không dùng được', () => {
  it('thiếu id / thiếu tên / thiếu ngày đều có lý do đọc được, không ném lỗi', () => {
    expect(normalizeGoogleHolidayEvent(allDay({ id: null }))).toHaveProperty('reason');
    expect(normalizeGoogleHolidayEvent(allDay({ summary: '  ' }))).toHaveProperty('reason');
    expect(normalizeGoogleHolidayEvent(allDay({ start: null, end: null }))).toHaveProperty('reason');
  });

  it('dải kéo dài cả mùa bị chặn — nó sẽ tô trọn một quý trên lưới điều phối', () => {
    const result = normalizeGoogleHolidayEvent(
      allDay({ id: 'evt-mua', start: { date: '2026-06-01' }, end: { date: '2026-09-01' } }),
    );

    expect(result).toHaveProperty('reason');
  });

  it('một event hỏng không kéo theo cả lượt: event tốt vẫn qua', () => {
    const result = normalizeGoogleHolidayEvents([allDay({ id: null }), allDay()]);

    expect(result.holidays).toHaveLength(1);
    expect(result.skipped).toHaveLength(1);
  });

  it('event trùng id giữa hai trang chỉ giữ bản đầu (unique google_event_id)', () => {
    const result = normalizeGoogleHolidayEvents([allDay(), allDay({ summary: 'Bản trùng' })]);

    expect(result.holidays).toHaveLength(1);
    expect(result.holidays[0]?.name).toBe('Ngày Giải phóng miền Nam');
  });
});

describe('planHolidaySync — idempotent', () => {
  it('lần đầu: chưa có gì trong DB → tất cả là toCreate', () => {
    const plan = planHolidaySync([], normalizeGoogleHolidayEvents([allDay()]));

    expect(plan.toCreate).toHaveLength(1);
    expect(plan.toUpdate).toHaveLength(0);
    expect(plan.toDelete).toHaveLength(0);
  });

  it('lần hai với dữ liệu Y HỆT → 0/0/0, không dòng trùng', () => {
    const plan = planHolidaySync([existingRow()], normalizeGoogleHolidayEvents([allDay()]));

    expect(plan.toCreate).toHaveLength(0);
    expect(plan.toUpdate).toHaveLength(0);
    expect(plan.toDelete).toHaveLength(0);
  });

  it('Google đổi TÊN → nằm trong toUpdate, không phải create thêm dòng mới', () => {
    const plan = planHolidaySync(
      [existingRow()],
      normalizeGoogleHolidayEvents([allDay({ summary: 'Ngày Thống nhất đất nước' })]),
    );

    expect(plan.toCreate).toHaveLength(0);
    expect(plan.toDelete).toHaveLength(0);
    expect(plan.toUpdate).toHaveLength(1);
    expect(plan.toUpdate[0]).toMatchObject({
      id: 'row-1',
      changes: { name: 'Ngày Thống nhất đất nước' },
    });
  });

  it('Google đổi NGÀY → toUpdate mang ngày mới', () => {
    const plan = planHolidaySync(
      [existingRow()],
      normalizeGoogleHolidayEvents([
        allDay({ start: { date: '2026-04-29' }, end: { date: '2026-05-01' } }),
      ]),
    );

    expect(plan.toUpdate[0]?.changes).toMatchObject({
      startDate: '2026-04-29',
      endDate: '2026-04-30',
    });
  });
});

describe('planHolidaySync — xoá', () => {
  it('Google trả status=cancelled → dòng đó vào toDelete', () => {
    const plan = planHolidaySync(
      [existingRow()],
      normalizeGoogleHolidayEvents([allDay({ status: 'cancelled' })]),
    );

    expect(plan.toDelete).toEqual(['row-1']);
    expect(plan.toCreate).toHaveLength(0);
  });

  it('event biến mất hẳn khỏi kết quả → dòng đó vào toDelete', () => {
    const plan = planHolidaySync([existingRow()], normalizeGoogleHolidayEvents([]));

    expect(plan.toDelete).toEqual(['row-1']);
  });

  it('dòng source=manual KHÔNG BAO GIỜ bị đồng bộ xoá', () => {
    const manual = existingRow({
      id: 'row-manual',
      googleEventId: null,
      source: HOLIDAY_SOURCE.MANUAL,
      name: 'Nghỉ bù nội bộ',
    });

    const plan = planHolidaySync([manual], normalizeGoogleHolidayEvents([]));

    expect(plan.toDelete).toEqual([]);
    expect(plan.toUpdate).toEqual([]);
  });

  it('dòng manual đứng cạnh dòng Google: chỉ dòng Google bị gỡ', () => {
    const manual = existingRow({
      id: 'row-manual',
      googleEventId: null,
      source: HOLIDAY_SOURCE.MANUAL,
    });

    const plan = planHolidaySync([existingRow(), manual], normalizeGoogleHolidayEvents([]));

    expect(plan.toDelete).toEqual(['row-1']);
  });
});

describe('expandHolidaysByDay', () => {
  it('event nhiều ngày nở ra đủ từng ngày, không dư ngày sau endDate', () => {
    const map = expandHolidaysByDay([
      { startDate: '2026-02-17', endDate: '2026-02-19', eventType: HOLIDAY_EVENT_TYPE.PUBLIC_HOLIDAY },
    ]);

    expect([...map.keys()].sort()).toEqual(['2026-02-17', '2026-02-18', '2026-02-19']);
  });

  it('hai event trùng ngày: ngày nghỉ chính thức thắng mốc mùa vụ', () => {
    const map = expandHolidaysByDay([
      { startDate: '2026-02-04', endDate: '2026-02-04', eventType: HOLIDAY_EVENT_TYPE.SEASON },
      {
        startDate: '2026-02-04',
        endDate: '2026-02-04',
        eventType: HOLIDAY_EVENT_TYPE.PUBLIC_HOLIDAY,
      },
    ]);

    expect(map.get('2026-02-04')?.eventType).toBe(HOLIDAY_EVENT_TYPE.PUBLIC_HOLIDAY);
  });

  it('endDate trước startDate là dữ liệu hỏng → bỏ qua, không sinh vòng lặp vô hạn', () => {
    const map = expandHolidaysByDay([
      { startDate: '2026-05-02', endDate: '2026-05-01', eventType: HOLIDAY_EVENT_TYPE.OTHER },
    ]);

    expect(map.size).toBe(0);
  });
});

describe('holidaySyncWindow', () => {
  it('phủ năm trước, năm nay và năm sau — đủ cho lịch 30 ngày vắt qua giao thừa', () => {
    const window = holidaySyncWindow(new Date('2026-12-20T10:00:00.000Z'));

    expect(window.fromDate).toBe('2025-01-01');
    expect(window.toDate).toBe('2027-12-31');
    expect(window.timeMin).toBe('2025-01-01T00:00:00+07:00');
    expect(window.timeMax).toBe('2027-12-31T23:59:59+07:00');
  });

  it('biên năm tính theo giờ VN, không theo UTC', () => {
    // 31/12/2026 18:00Z = 01/01/2027 01:00 giờ VN → cửa sổ đã là của năm 2027.
    const window = holidaySyncWindow(new Date('2026-12-31T18:00:00.000Z'));

    expect(window.fromDate).toBe('2026-01-01');
    expect(window.toDate).toBe('2028-12-31');
  });
});

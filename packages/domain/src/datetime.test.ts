import { afterEach, describe, expect, it } from 'vitest';

import {
  APP_TIME_ZONE,
  DAY_PARAM_FORMAT,
  appWallClockToCalendarDate,
  appWallClockToInstant,
  appWallClockToIso,
  calendarDateToAppWallClock,
  dayjs,
  nowInAppTz,
  rentalDurationParts,
  startOfAppDay,
  toAppTz,
} from './datetime';
import { draftFromFilters, draftToFilterPatch } from './search-draft';

/**
 * Phần KHÔNG phụ thuộc ngôn ngữ của ngày giờ: quy đổi múi giờ và phép đếm thời lượng thuê.
 *
 * Cách HIỂN THỊ (thứ viết tắt, "3 ngày 4 giờ", mốc `T6, 08/08 · 10:00`) đã chuyển sang
 * `useAppFormat` vì nó đổi theo ngôn ngữ — test của nó ở `src/i18n/use-app-format.test.tsx`.
 * Ở đây chỉ khoá con số, và con số thì giống nhau ở mọi ngôn ngữ.
 */
describe('toAppTz', () => {
  it('quy về giờ Việt Nam bất kể mốc gốc ghi bằng UTC', () => {
    // 01:00Z = 08:00 giờ Việt Nam (UTC+7, không DST).
    expect(toAppTz('2026-08-17T01:00:00.000Z').format('HH:mm')).toBe('08:00');
    expect(toAppTz('2026-08-17T01:00:00.000Z').format('DD/MM/YYYY')).toBe('17/08/2026');
  });

  it('mốc sau 17:00Z đã sang ngày hôm sau theo giờ Việt Nam', () => {
    expect(toAppTz('2026-08-17T17:30:00.000Z').format('DD/MM HH:mm')).toBe('18/08 00:30');
  });
});

describe('startOfAppDay', () => {
  it('00:00 giờ Việt Nam của một ngày = 17:00Z hôm trước', () => {
    expect(startOfAppDay('2026-08-17').toISOString()).toBe('2026-08-16T17:00:00.000Z');
  });

  it('múi giờ ứng dụng không đổi theo ngôn ngữ', () => {
    expect(APP_TIME_ZONE).toBe('Asia/Ho_Chi_Minh');
  });
});

describe('rentalDurationParts', () => {
  const at = (iso: string) => dayjs(iso);

  it('tròn ngày', () => {
    expect(rentalDurationParts(at('2026-08-08T10:00:00'), at('2026-08-10T10:00:00'))).toEqual({
      days: 2,
      hours: 0,
    });
  });

  it('ngày lẻ giờ', () => {
    expect(rentalDurationParts(at('2026-08-08T10:00:00'), at('2026-08-10T13:00:00'))).toEqual({
      days: 2,
      hours: 3,
    });
  });

  it('dưới một ngày đếm theo giờ', () => {
    expect(rentalDurationParts(at('2026-08-08T10:00:00'), at('2026-08-08T15:00:00'))).toEqual({
      days: 0,
      hours: 5,
    });
  });

  it('23h59 không tụt về 0 — tối thiểu là 1 giờ', () => {
    expect(rentalDurationParts(at('2026-08-08T10:00:00'), at('2026-08-08T10:20:00'))).toEqual({
      days: 0,
      hours: 1,
    });
  });

  it('khoảng âm (dữ liệu hỏng) kẹp về 0 chứ không ra số âm', () => {
    expect(rentalDurationParts(at('2026-08-10T10:00:00'), at('2026-08-08T10:00:00'))).toEqual({
      days: 0,
      hours: 1,
    });
  });
});

// =============================================================================================
// Múi giờ của MÁY không được rò vào dữ liệu nghiệp vụ
// =============================================================================================

/**
 * Ba múi giờ máy đủ để bắt mọi kiểu lệch:
 *   - `Asia/Ho_Chi_Minh` — cấu hình thật của người dùng, và của `ci.yml`;
 *   - `UTC` — runner GitHub mặc định, và mọi container không set `TZ`;
 *   - `America/New_York` — offset ÂM và có DST. Máy ở đây từng làm một mốc 00:30 giờ VN lùi
 *     hẳn sang ngày hôm trước.
 *
 * Trước đợt 03/09/2026, `ci.yml` phải ghim `TZ: Asia/Ho_Chi_Minh` để bộ test không đỏ. Những
 * test dưới đây tồn tại để dòng ghim đó không còn là thứ che lỗi: chúng tự đổi múi giờ máy.
 */
const HOST_TIME_ZONES = ['Asia/Ho_Chi_Minh', 'UTC', 'America/New_York'] as const;

/**
 * Biến môi trường của MÁY CHẠY TEST.
 *
 * Đọc qua `globalThis` chứ không `process.env` trực tiếp: `@xeprime/domain` cố ý không cài
 * `@types/node` — package này phải không biết mình đang chạy ở đâu (CLAUDE.md mục 5), và
 * `TZ` ở đây là thuộc tính của cái MÁY chạy test, không phải cấu hình của thư viện.
 */
const hostEnv = (globalThis as unknown as { process: { env: Record<string, string | undefined> } })
  .process.env;

const ORIGINAL_TZ = hostEnv.TZ;
afterEach(() => {
  hostEnv.TZ = ORIGINAL_TZ;
});

/** Chạy `fn` như thể máy đang đặt ở `tz` — Node đọc lại `TZ` ở lần dựng `Date` kế tiếp. */
function onHost<T>(tz: string, fn: () => T): T {
  hostEnv.TZ = tz;
  try {
    return fn();
  } finally {
    hostEnv.TZ = ORIGINAL_TZ;
  }
}

describe('appWallClockToIso — ô chọn → API', () => {
  it.each(HOST_TIME_ZONES)('máy đặt ở %s: chọn 03/09/2026 12:00 vẫn gửi lên 05:00Z', (hostTz) => {
    onHost(hostTz, () => {
      // Đúng thứ Ant Design đưa ra sau khi người dùng gõ/bấm: một Dayjs theo GIỜ MÁY.
      const picked = dayjs('2026-09-03T12:00:00');
      expect(picked.format('YYYY-MM-DD HH:mm')).toBe('2026-09-03 12:00');
      expect(appWallClockToIso(picked)).toBe('2026-09-03T05:00:00.000Z');
    });
  });

  it.each(HOST_TIME_ZONES)('máy đặt ở %s: giá trị ĐÃ gắn giờ VN cho cùng kết quả', (hostTz) => {
    onHost(hostTz, () => {
      // Đường form SỬA: `toAppTz(iso)` → người dùng không đụng gì → bấm lưu.
      expect(appWallClockToIso(toAppTz('2026-09-03T05:00:00.000Z'))).toBe(
        '2026-09-03T05:00:00.000Z',
      );
    });
  });

  it('giữ nguyên mili giây — không cắt cụt khi quy đổi', () => {
    expect(appWallClockToIso(dayjs('2026-09-03T12:00:00.123'))).toBe('2026-09-03T05:00:00.123Z');
  });

  it('idempotent: quy đổi hai lần vẫn ra đúng một mốc', () => {
    const once = appWallClockToInstant(dayjs('2026-09-03T12:00:00'));
    expect(appWallClockToInstant(once).toISOString()).toBe(once.toISOString());
  });

  it('nửa đêm không trượt sang ngày khác', () => {
    expect(appWallClockToIso(dayjs('2026-09-03T00:00:00'))).toBe('2026-09-02T17:00:00.000Z');
    expect(appWallClockToIso(dayjs('2026-09-03T23:59:59.999'))).toBe('2026-09-03T16:59:59.999Z');
  });
});

describe('toAppTz — API → ô chọn', () => {
  it.each(HOST_TIME_ZONES)('máy đặt ở %s: 05:00Z hiện ra 03/09/2026 12:00', (hostTz) => {
    onHost(hostTz, () => {
      expect(toAppTz('2026-09-03T05:00:00.000Z').format('YYYY-MM-DD HH:mm')).toBe(
        '2026-09-03 12:00',
      );
    });
  });

  it.each(HOST_TIME_ZONES)('máy đặt ở %s: mốc 17:30Z đã sang ngày hôm sau', (hostTz) => {
    onHost(hostTz, () => {
      expect(toAppTz('2026-09-03T17:30:00.000Z').format('YYYY-MM-DD HH:mm')).toBe(
        '2026-09-04 00:30',
      );
    });
  });
});

describe('round-trip API → ô chọn → API', () => {
  const INSTANTS = [
    '2026-09-03T05:00:00.000Z',
    '2026-09-03T17:00:00.000Z',
    '2026-01-01T00:00:00.000Z',
    '2026-06-30T16:59:59.999Z',
  ];

  it.each(HOST_TIME_ZONES)('máy đặt ở %s: mốc không đổi sau một vòng', (hostTz) => {
    onHost(hostTz, () => {
      for (const iso of INSTANTS) {
        expect(appWallClockToIso(toAppTz(iso))).toBe(iso);
      }
    });
  });
});

describe('cầu nối react-day-picker (Date giờ máy ↔ Dayjs giờ VN)', () => {
  it.each(HOST_TIME_ZONES)('máy đặt ở %s: ô lịch mang đúng NGÀY nghiệp vụ', (hostTz) => {
    onHost(hostTz, () => {
      // 00:30 ngày 04/09 giờ VN. `.toDate()` trần sẽ cho lịch tô ô 03/09 trên máy UTC.
      const cell = appWallClockToCalendarDate(toAppTz('2026-09-03T17:30:00.000Z'));
      expect(cell.getFullYear()).toBe(2026);
      expect(cell.getMonth()).toBe(8);
      expect(cell.getDate()).toBe(4);
      expect(cell.getHours()).toBe(0);
      expect(cell.getMinutes()).toBe(30);
    });
  });

  it.each(HOST_TIME_ZONES)('máy đặt ở %s: bấm một ô lịch cho mốc giờ VN', (hostTz) => {
    onHost(hostTz, () => {
      // Đúng thứ react-day-picker phát ra: nửa đêm GIỜ MÁY của ô vừa bấm.
      const clicked = new Date(2026, 8, 12, 0, 0, 0, 0);
      const picked = calendarDateToAppWallClock(clicked).hour(10);
      expect(picked.format(DAY_PARAM_FORMAT)).toBe('2026-09-12');
      expect(picked.toISOString()).toBe('2026-09-12T03:00:00.000Z');
    });
  });

  it.each(HOST_TIME_ZONES)('máy đặt ở %s: hai chiều là nghịch đảo của nhau', (hostTz) => {
    onHost(hostTz, () => {
      const from = toAppTz('2026-09-03T17:30:00.000Z');
      const back = calendarDateToAppWallClock(appWallClockToCalendarDate(from));
      expect(back.toISOString()).toBe(from.toISOString());
    });
  });
});

describe('ngày lịch (date-only) không bao giờ đi qua UTC', () => {
  it.each(HOST_TIME_ZONES)('máy đặt ở %s: 2026-09-03 vẫn là 2026-09-03', (hostTz) => {
    onHost(hostTz, () => {
      const day = startOfAppDay('2026-09-03');
      expect(day.format(DAY_PARAM_FORMAT)).toBe('2026-09-03');
      expect(day.toISOString()).toBe('2026-09-02T17:00:00.000Z');
      // Và vòng qua ô chọn rồi quay lại vẫn là ĐÚNG ngày đó.
      expect(
        calendarDateToAppWallClock(appWallClockToCalendarDate(day)).format(DAY_PARAM_FORMAT),
      ).toBe('2026-09-03');
    });
  });
});

describe('nowInAppTz', () => {
  it.each(HOST_TIME_ZONES)('máy đặt ở %s: "hôm nay" là ngày Việt Nam', (hostTz) => {
    onHost(hostTz, () => {
      const vnKey = new Date(Date.now() + 7 * 3_600_000).toISOString().slice(0, 10);
      expect(nowInAppTz().format(DAY_PARAM_FORMAT)).toBe(vnKey);
      expect(nowInAppTz().utcOffset()).toBe(420);
    });
  });
});

describe('bản nháp tìm kiếm — link chia sẻ không mang múi giờ của người gửi', () => {
  it.each(HOST_TIME_ZONES)('máy đặt ở %s: URL → ô chọn → URL giữ nguyên mốc', (hostTz) => {
    onHost(hostTz, () => {
      const draft = draftFromFilters({
        pickupAt: '2026-09-03T05:00:00.000Z',
        returnAt: '2026-09-06T05:00:00.000Z',
      });
      expect(draft.rental.pickupAt?.format('YYYY-MM-DD HH:mm')).toBe('2026-09-03 12:00');

      const patch = draftToFilterPatch(draft);
      expect(patch.pickupAt).toBe('2026-09-03T05:00:00.000Z');
      expect(patch.returnAt).toBe('2026-09-06T05:00:00.000Z');
    });
  });

  it.each(HOST_TIME_ZONES)('máy đặt ở %s: khoảng mặc định luôn là 10:00 giờ VN', (hostTz) => {
    onHost(hostTz, () => {
      const draft = draftFromFilters({});
      expect(draft.rental.pickupAt?.format('HH:mm')).toBe('10:00');
      expect(draft.rental.returnAt?.format('HH:mm')).toBe('10:00');
      expect(draftToFilterPatch(draft).pickupAt?.endsWith('T03:00:00.000Z')).toBe(true);
    });
  });
});

describe('APP_TIME_ZONE', () => {
  it('là tên vùng IANA, không phải một offset gõ tay', () => {
    expect(APP_TIME_ZONE).toBe('Asia/Ho_Chi_Minh');
  });
});

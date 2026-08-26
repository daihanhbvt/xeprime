/**
 * Ngày lễ Việt Nam — phần LUẬT THUẦN của luồng đồng bộ Google Calendar → PostgreSQL → lịch xe.
 *
 * Vì sao ở đây chứ không nằm trong job của worker: ba phép tính dưới đây là chỗ tính năng này
 * sai được, và cả ba đều KHÔNG cần mạng, không cần DB, không cần Nest — nên chúng phải test
 * được bằng một hàm gọi thẳng, không phải bằng cách dựng lại nửa hệ thống:
 *
 *   1. `end.date` của Google là END-EXCLUSIVE. Ngày 30/04 về dưới dạng
 *      `start.date=2026-04-30`, `end.date=2026-05-01`. Quên trừ một ngày là mọi ngày lễ trên
 *      lịch dài thêm một ngày — và không ai phát hiện ra cho tới khi có người xếp lịch giao xe
 *      vào ngày 01/05 rồi thấy nó bị tô là ngày lễ.
 *   2. Diff giữa "đang có trong DB" và "Google vừa trả" phải IDEMPOTENT. Chạy đồng bộ lần thứ
 *      hai với dữ liệu y hệt mà sinh ra một dòng update là cuốn sổ `holiday_sync_runs` nói dối,
 *      và cách duy nhất để biết điều đó là so từng trường.
 *   3. Mở một event nhiều ngày thành từng ngày để lưới lịch tra O(1) theo cột.
 *
 * Ngày lễ ở XePrime CHỈ là thông tin hiển thị: không khoá xe, không đổi giá, không đụng
 * `vehicle_occupancies`. Không hàm nào trong file này được phép mọc thêm ý nghĩa nghiệp vụ.
 */

import {
  HOLIDAY_EVENT_TYPE,
  HOLIDAY_SOURCE,
  type HolidayEventType,
  type HolidaySource,
} from '@xeprime/types';

import { APP_TIME_ZONE, dayjs } from './datetime';

/** `YYYY-MM-DD` theo lịch Việt Nam. Không mang giờ, không mang múi giờ. */
export type HolidayDateKey = string;

const DATE_KEY_FORMAT = 'YYYY-MM-DD';
const DATE_KEY_PATTERN = /^\d{4}-\d{2}-\d{2}$/;
const MS_PER_DAY = 24 * 60 * 60 * 1000;

/**
 * Trần độ dài một ngày lễ, tính bằng ngày.
 *
 * Vì sao phải có trần: lịch `#holiday` của Google không chỉ chứa ngày nghỉ — nó còn có những
 * mốc "mùa" kéo dài hàng tháng. Một bản ghi 92 ngày sẽ tô trọn một quý trên lưới điều phối và
 * biến lớp thông tin này thành nhiễu. Tết Nguyên đán — kỳ nghỉ dài nhất trong năm — hiếm khi
 * quá 9 ngày, nên 31 vừa dư dả cho mọi kỳ nghỉ thật vừa chặn được dải kéo dài cả mùa.
 */
export const HOLIDAY_MAX_SPAN_DAYS = 31;

/**
 * Cửa sổ đồng bộ: từ 01/01 của năm TRƯỚC tới 31/12 của năm SAU.
 *
 * Vì sao không phải "chỉ năm nay": lịch điều phối xem được tối đa 62 ngày và người dùng có
 * quyền lùi về quá khứ. Một khoảng 30 ngày mở ngày 20/12 chạy sang giữa tháng 1 năm sau — nếu
 * cửa sổ dừng ở 31/12 năm nay thì đúng dịp Tết dương lịch là lúc lịch trống trơn.
 */
export const HOLIDAY_SYNC_YEARS_BEFORE = 1;
export const HOLIDAY_SYNC_YEARS_AFTER = 1;

// ── Hình dạng dữ liệu ────────────────────────────────────────────────────────

/**
 * Đúng phần của một event Google mà luồng này đọc.
 *
 * Cố ý KHÔNG dùng type của SDK: file này không được biết Google tồn tại ở dạng thư viện, và
 * mọi trường đều tuỳ chọn vì đây là dữ liệu của bên khác — "API luôn trả trường này" là một
 * giả định, không phải một bảo đảm.
 */
export interface GoogleCalendarEventLike {
  readonly id?: string | null;
  /** `cancelled` = Google đã huỷ event; các giá trị khác coi như còn hiệu lực. */
  readonly status?: string | null;
  readonly summary?: string | null;
  readonly description?: string | null;
  /** RFC3339 — lần sửa gần nhất phía Google. */
  readonly updated?: string | null;
  readonly start?: { readonly date?: string | null; readonly dateTime?: string | null } | null;
  readonly end?: { readonly date?: string | null; readonly dateTime?: string | null } | null;
}

/** Một ngày lễ đã chuẩn hoá, sẵn sàng ghi xuống `public_holidays`. */
export interface NormalizedHoliday {
  readonly googleEventId: string;
  readonly startDate: HolidayDateKey;
  /** Ngày CUỐI CÙNG của kỳ nghỉ — INCLUSIVE, đã trừ khỏi `end.date` end-exclusive của Google. */
  readonly endDate: HolidayDateKey;
  readonly name: string;
  readonly description: string | null;
  readonly eventType: HolidayEventType;
  /** ISO-8601 UTC, hoặc `null` khi Google không nói. */
  readonly googleUpdatedAt: string | null;
}

/** Event bị bỏ qua, kèm lý do đọc được — caller ghi một dòng log, không nuốt im lặng. */
export interface SkippedHolidayEvent {
  readonly eventId: string | null;
  readonly reason: string;
}

export interface NormalizeHolidaysResult {
  readonly holidays: readonly NormalizedHoliday[];
  /** Event Google báo `status = cancelled` — phải xoá khỏi DB nếu đang có. */
  readonly cancelledEventIds: readonly string[];
  readonly skipped: readonly SkippedHolidayEvent[];
}

/** Dòng `public_holidays` đang có trong cửa sổ đồng bộ, ở dạng mà phép diff cần. */
export interface ExistingHolidayRow {
  readonly id: string;
  readonly googleEventId: string | null;
  readonly startDate: HolidayDateKey;
  readonly endDate: HolidayDateKey;
  readonly name: string;
  readonly description: string | null;
  readonly eventType: string;
  readonly source: string;
  readonly googleUpdatedAt: string | null;
}

export interface HolidayUpdate {
  /** Khoá chính của dòng đang có — cập nhật theo `id`, không theo `googleEventId`. */
  readonly id: string;
  readonly changes: NormalizedHoliday;
}

export interface HolidaySyncPlan {
  readonly toCreate: readonly NormalizedHoliday[];
  readonly toUpdate: readonly HolidayUpdate[];
  /** `id` của các dòng phải xoá. */
  readonly toDelete: readonly string[];
}

// ── Ngày tháng ───────────────────────────────────────────────────────────────

function isDateKey(value: unknown): value is HolidayDateKey {
  return typeof value === 'string' && DATE_KEY_PATTERN.test(value);
}

/**
 * Cộng/trừ ngày trên một khoá ngày trần.
 *
 * Đi qua nửa đêm UTC chứ không qua giờ địa phương: `YYYY-MM-DD` không mang múi giờ, nên mượn
 * múi giờ của máy đang chạy để làm phép cộng là cách chắc chắn nhất để cùng một dữ liệu ra hai
 * kết quả khác nhau trên máy dev và trên VPS.
 */
export function shiftDateKey(day: HolidayDateKey, deltaDays: number): HolidayDateKey {
  const base = new Date(`${day}T00:00:00.000Z`).getTime();
  return new Date(base + deltaDays * MS_PER_DAY).toISOString().slice(0, 10);
}

/** Số ngày giữa hai khoá ngày (cùng ngày = 0). */
export function daysBetweenDateKeys(from: HolidayDateKey, to: HolidayDateKey): number {
  const a = new Date(`${from}T00:00:00.000Z`).getTime();
  const b = new Date(`${to}T00:00:00.000Z`).getTime();
  return Math.round((b - a) / MS_PER_DAY);
}

/**
 * `end.date` END-EXCLUSIVE của Google → ngày cuối cùng INCLUSIVE.
 *
 * Đây là cái bẫy trung tâm của toàn bộ tính năng, nên nó là một hàm có tên chứ không phải một
 * phép trừ nằm lẫn trong vòng lặp: một sự kiện đúng một ngày (30/04) về với
 * `start.date=2026-04-30`, `end.date=2026-05-01`, và ai đọc `end.date` như ngày kết thúc sẽ
 * tô nhầm luôn ngày 01/05.
 */
export function googleAllDayEndToInclusive(endDateExclusive: HolidayDateKey): HolidayDateKey {
  return shiftDateKey(endDateExclusive, -1);
}

/**
 * Mốc thời gian có giờ → ngày lịch VIỆT NAM.
 *
 * Event trong lịch nghỉ lễ gần như luôn là all-day, nhưng "gần như" không phải là một hợp
 * đồng: một event có giờ lọt vào mà bị bỏ qua sẽ là một ngày lễ lặng lẽ vắng mặt.
 */
export function holidayDateKeyOfInstant(isoInstant: string): HolidayDateKey | null {
  const at = dayjs(isoInstant);
  if (!at.isValid()) return null;
  return at.tz(APP_TIME_ZONE).format(DATE_KEY_FORMAT);
}

// ── Phân loại ────────────────────────────────────────────────────────────────

/**
 * Bảng quy MÔ TẢ của Google về một mã phân loại. Xét theo thứ tự, khớp đầu tiên thắng.
 *
 * Google không trả mã phân loại — nó trả một câu mô tả bằng ngôn ngữ của lịch. Lịch
 * `vi.vietnamese#holiday` thực tế chỉ dùng ĐÚNG HAI câu (đã đối chiếu với dữ liệu thật
 * 26/08/2026, 62 sự kiện trong ba năm):
 *
 *   "Ngày lễ"        → ngày nghỉ chính thức (45 sự kiện: Tết, 30/4, 1/5, 2/9 và các ngày bù)
 *   "Ngày lễ kỷ niệm…" → ngày kỷ niệm không được nghỉ (17 sự kiện: 8/3, 20/10, Valentine…)
 *
 * ⚠ THỨ TỰ Ở ĐÂY LÀ MỘT PHẦN CỦA LUẬT, không phải cách sắp xếp cho đẹp. "Ngày lễ kỷ niệm"
 * chứa trọn chuỗi "ngày lễ", nên luật hẹp hơn PHẢI đứng trước: đảo lại là mọi ngày kỷ niệm
 * biến thành ngày nghỉ chính thức, và giao diện sẽ nói với người xếp lịch rằng ngày 20/10 cả
 * nước được nghỉ.
 *
 * Vẫn nhận tiếng Anh vì cấu hình có thể trỏ sang lịch `en.vietnamese#holiday`.
 */
const EVENT_TYPE_RULES: ReadonlyArray<{
  readonly keywords: readonly string[];
  readonly type: HolidayEventType;
}> = [
  // Hẹp nhất trước.
  { keywords: ['kỷ niệm', 'observance'], type: HOLIDAY_EVENT_TYPE.OBSERVANCE },
  { keywords: ['mùa', 'season'], type: HOLIDAY_EVENT_TYPE.SEASON },
  {
    keywords: [
      // "ngày lễ" trơn là cách lịch tiếng Việt của Google gọi *public holiday* — chỉ an toàn
      // vì hai luật hẹp hơn đã lọc xong ở trên.
      'ngày lễ',
      'công cộng',
      'nghỉ lễ',
      'ngày nghỉ',
      'public holiday',
      'national holiday',
      'bank holiday',
    ],
    type: HOLIDAY_EVENT_TYPE.PUBLIC_HOLIDAY,
  },
];

/**
 * Mô tả của Google → mã phân loại.
 *
 * Mặc định `OTHER`, KHÔNG phải `PUBLIC_HOLIDAY`: nói với người đang xếp lịch rằng ngày 20/10 là
 * ngày nghỉ chính thức thì tệ hơn hẳn so với nói "ngày đặc biệt" rồi để họ tự đọc tên nó.
 */
export function classifyHolidayEventType(description: string | null | undefined): HolidayEventType {
  const text = (description ?? '').toLowerCase();
  if (!text.trim()) return HOLIDAY_EVENT_TYPE.OTHER;
  for (const rule of EVENT_TYPE_RULES) {
    if (rule.keywords.some((keyword) => text.includes(keyword))) return rule.type;
  }
  return HOLIDAY_EVENT_TYPE.OTHER;
}

// ── Chuẩn hoá ────────────────────────────────────────────────────────────────

/** Cặp `start`/`end` của một event → cặp ngày INCLUSIVE, hoặc `null` khi không đọc được. */
function readDateSpan(
  event: GoogleCalendarEventLike,
): { startDate: HolidayDateKey; endDate: HolidayDateKey } | null {
  const startDate = event.start?.date;
  if (isDateKey(startDate)) {
    // All-day: `end.date` end-exclusive, và thiếu `end` thì mặc định là sự kiện một ngày.
    const rawEnd = event.end?.date;
    const endDate = isDateKey(rawEnd) ? googleAllDayEndToInclusive(rawEnd) : startDate;
    return { startDate, endDate: endDate < startDate ? startDate : endDate };
  }

  const startInstant = event.start?.dateTime;
  if (typeof startInstant !== 'string' || !startInstant) return null;
  const startKey = holidayDateKeyOfInstant(startInstant);
  if (!startKey) return null;

  const endInstant = event.end?.dateTime;
  if (typeof endInstant !== 'string' || !endInstant) {
    return { startDate: startKey, endDate: startKey };
  }
  const endAt = dayjs(endInstant);
  if (!endAt.isValid()) return { startDate: startKey, endDate: startKey };

  /*
   * Event kết thúc đúng 00:00 giờ VN thuộc về ngày HÔM TRƯỚC: một sự kiện "từ 08:00 ngày 30/04
   * đến 00:00 ngày 01/05" diễn ra trọn trong ngày 30/04. Cùng quy ước nửa mở với `end.date` của
   * event all-day, chỉ khác đơn vị.
   */
  const endLocal = endAt.tz(APP_TIME_ZONE);
  const endKey =
    endLocal.hour() === 0 && endLocal.minute() === 0 && endLocal.second() === 0
      ? shiftDateKey(endLocal.format(DATE_KEY_FORMAT), -1)
      : endLocal.format(DATE_KEY_FORMAT);

  return { startDate: startKey, endDate: endKey < startKey ? startKey : endKey };
}

/**
 * Một event Google → bản ghi chuẩn hoá, hoặc lý do bỏ qua.
 *
 * Trả lý do thay vì ném: một event rác lẫn giữa 300 event tốt không được phép làm hỏng cả lượt
 * đồng bộ.
 */
export function normalizeGoogleHolidayEvent(
  event: GoogleCalendarEventLike,
): NormalizedHoliday | SkippedHolidayEvent {
  const googleEventId = typeof event.id === 'string' ? event.id.trim() : '';
  if (!googleEventId) return { eventId: null, reason: 'event không có id' };

  const span = readDateSpan(event);
  if (!span) return { eventId: googleEventId, reason: 'event không có ngày đọc được' };

  const spanDays = daysBetweenDateKeys(span.startDate, span.endDate) + 1;
  if (spanDays > HOLIDAY_MAX_SPAN_DAYS) {
    return {
      eventId: googleEventId,
      reason: `event kéo dài ${spanDays} ngày, vượt trần ${HOLIDAY_MAX_SPAN_DAYS}`,
    };
  }

  const name = (event.summary ?? '').trim();
  if (!name) return { eventId: googleEventId, reason: 'event không có tên' };

  const description = (event.description ?? '').trim();
  const updated = typeof event.updated === 'string' ? dayjs(event.updated) : null;

  return {
    googleEventId,
    startDate: span.startDate,
    endDate: span.endDate,
    name,
    description: description || null,
    eventType: classifyHolidayEventType(description),
    googleUpdatedAt: updated?.isValid() ? updated.toISOString() : null,
  };
}

function isSkipped(value: NormalizedHoliday | SkippedHolidayEvent): value is SkippedHolidayEvent {
  return 'reason' in value;
}

/**
 * Cả kết quả trả về của Google → dữ liệu dùng được.
 *
 * Event trùng `id` (Google phân trang chồng lấn khi lịch được sửa giữa chừng) chỉ giữ bản
 * ĐẦU TIÊN: kết quả đã sắp theo `startTime` nên bản đầu là bản đúng thứ tự, và để lọt bản thứ
 * hai sẽ làm `createMany` vi phạm unique `google_event_id`.
 */
export function normalizeGoogleHolidayEvents(
  events: readonly GoogleCalendarEventLike[],
): NormalizeHolidaysResult {
  const holidays: NormalizedHoliday[] = [];
  const cancelledEventIds: string[] = [];
  const skipped: SkippedHolidayEvent[] = [];
  const seen = new Set<string>();

  for (const event of events) {
    const id = typeof event.id === 'string' ? event.id.trim() : '';

    // Huỷ là một CÂU TRẢ LỜI, không phải dữ liệu hỏng — nó nói "xoá dòng này đi".
    if (event.status === 'cancelled') {
      if (id) cancelledEventIds.push(id);
      continue;
    }

    const result = normalizeGoogleHolidayEvent(event);
    if (isSkipped(result)) {
      skipped.push(result);
      continue;
    }
    if (seen.has(result.googleEventId)) continue;
    seen.add(result.googleEventId);
    holidays.push(result);
  }

  return { holidays, cancelledEventIds, skipped };
}

// ── Diff ─────────────────────────────────────────────────────────────────────

/** Dòng đang có đã khớp với bản Google mới nhất chưa? So từng trường, không so tham chiếu. */
function isUnchanged(row: ExistingHolidayRow, next: NormalizedHoliday): boolean {
  return (
    row.startDate === next.startDate &&
    row.endDate === next.endDate &&
    row.name === next.name &&
    row.description === next.description &&
    row.eventType === next.eventType &&
    row.googleUpdatedAt === next.googleUpdatedAt
  );
}

/**
 * Dòng đang có + kết quả Google → ba việc phải làm.
 *
 * Hai bảo đảm mà hàm này tồn tại để giữ:
 *
 *  - **Idempotent.** Chạy lại với dữ liệu y hệt trả về ba mảng RỖNG. Không có nó, mỗi lượt
 *    đồng bộ lại ghi đè hàng trăm dòng và cột `events_updated` trong `holiday_sync_runs` mất
 *    hết ý nghĩa.
 *  - **Dòng `manual` bất khả xâm phạm.** Đồng bộ chỉ được phép xoá thứ chính nó tạo ra. Một
 *    ngày nghỉ bù do người vận hành khai tay mà biến mất lúc 06:00 sáng hôm sau là kiểu lỗi
 *    không ai truy ra nguyên nhân.
 *
 * `existing` PHẢI đã được lọc theo đúng cửa sổ đồng bộ trước khi vào đây — hàm này không biết
 * cửa sổ là gì, nên mọi dòng Google nó không thấy trong `fetched` đều bị coi là đã bị gỡ.
 */
export function planHolidaySync(
  existing: readonly ExistingHolidayRow[],
  fetched: NormalizeHolidaysResult,
): HolidaySyncPlan {
  const byEventId = new Map<string, ExistingHolidayRow>();
  for (const row of existing) {
    if (row.googleEventId) byEventId.set(row.googleEventId, row);
  }

  const toCreate: NormalizedHoliday[] = [];
  const toUpdate: HolidayUpdate[] = [];
  const stillPresent = new Set<string>();

  for (const holiday of fetched.holidays) {
    stillPresent.add(holiday.googleEventId);
    const row = byEventId.get(holiday.googleEventId);
    if (!row) {
      toCreate.push(holiday);
      continue;
    }
    if (!isUnchanged(row, holiday)) toUpdate.push({ id: row.id, changes: holiday });
  }

  const cancelled = new Set(fetched.cancelledEventIds);
  const toDelete = existing
    .filter((row) => row.source === HOLIDAY_SOURCE.GOOGLE_CALENDAR)
    .filter((row) => {
      if (!row.googleEventId) return false;
      return cancelled.has(row.googleEventId) || !stillPresent.has(row.googleEventId);
    })
    .map((row) => row.id);

  return { toCreate, toUpdate, toDelete };
}

// ── Đọc ra lưới lịch ─────────────────────────────────────────────────────────

/** Đủ để lưới lịch tô một cột và mở thẻ xem nhanh. */
export interface HolidayLike {
  readonly startDate: HolidayDateKey;
  readonly endDate: HolidayDateKey;
  readonly eventType: string;
  readonly source?: HolidaySource | string;
}

/**
 * Ngày nào che ngày nào khi hai sự kiện trùng ngày. Số nhỏ = quan trọng hơn.
 *
 * Một cột chỉ tô được một màu và một thẻ chỉ mở được một tên, nên phải có luật. "Tiết lập
 * xuân" không được phép che "Mùng Một Tết".
 */
const EVENT_TYPE_RANK: Readonly<Record<string, number>> = {
  [HOLIDAY_EVENT_TYPE.PUBLIC_HOLIDAY]: 0,
  [HOLIDAY_EVENT_TYPE.OBSERVANCE]: 1,
  [HOLIDAY_EVENT_TYPE.SEASON]: 2,
  [HOLIDAY_EVENT_TYPE.OTHER]: 3,
};

const FALLBACK_RANK = EVENT_TYPE_RANK[HOLIDAY_EVENT_TYPE.OTHER] ?? 3;

function rankOf(eventType: string): number {
  return EVENT_TYPE_RANK[eventType] ?? FALLBACK_RANK;
}

/**
 * Danh sách event → bản đồ `YYYY-MM-DD` → event, để lưới lịch tra O(1) theo từng cột ngày.
 *
 * Một event nhiều ngày (Tết) nở ra thành từng ngày; hai event trùng ngày thì bản QUAN TRỌNG
 * HƠN thắng (xem `EVENT_TYPE_RANK`), hoà thì bản đứng trước trong danh sách thắng — kết quả
 * không phụ thuộc thứ tự duyệt của Map.
 *
 * Trần `HOLIDAY_MAX_SPAN_DAYS` được áp lại ở đây dù `normalizeGoogleHolidayEvent` đã chặn:
 * dữ liệu vào hàm này tới từ API chứ không phải từ luồng đồng bộ, và một vòng lặp mở ngày
 * không có trần là một vòng lặp treo trình duyệt khi gặp dòng hỏng.
 */
export function expandHolidaysByDay<T extends HolidayLike>(
  holidays: readonly T[],
): ReadonlyMap<HolidayDateKey, T> {
  const byDay = new Map<HolidayDateKey, T>();

  for (const holiday of holidays) {
    if (!isDateKey(holiday.startDate) || !isDateKey(holiday.endDate)) continue;
    const span = daysBetweenDateKeys(holiday.startDate, holiday.endDate);
    if (span < 0) continue;

    const lastOffset = Math.min(span, HOLIDAY_MAX_SPAN_DAYS - 1);
    for (let offset = 0; offset <= lastOffset; offset += 1) {
      const key = shiftDateKey(holiday.startDate, offset);
      const current = byDay.get(key);
      if (!current || rankOf(holiday.eventType) < rankOf(current.eventType)) {
        byDay.set(key, holiday);
      }
    }
  }

  return byDay;
}

// ── Cửa sổ đồng bộ ───────────────────────────────────────────────────────────

export interface HolidaySyncWindow {
  /** `YYYY-MM-DD` — biên dưới, dùng để lọc dòng đang có trong DB. */
  readonly fromDate: HolidayDateKey;
  /** `YYYY-MM-DD` — biên trên, INCLUSIVE. */
  readonly toDate: HolidayDateKey;
  /** RFC3339 cho tham số `timeMin` của Google. */
  readonly timeMin: string;
  /** RFC3339 cho tham số `timeMax` của Google. */
  readonly timeMax: string;
}

/**
 * Cửa sổ đồng bộ tính theo NĂM LỊCH VIỆT NAM quanh thời điểm `now`.
 *
 * Theo năm lịch chứ không phải "365 ngày quanh hôm nay" để cửa sổ ĐỨNG YÊN suốt cả năm: một
 * cửa sổ trượt theo ngày sẽ khiến mỗi lượt đồng bộ lại thấy một event rơi ra ngoài biên và xoá
 * nó đi, rồi hôm sau tạo lại.
 */
export function holidaySyncWindow(now: Date): HolidaySyncWindow {
  const year = dayjs(now).tz(APP_TIME_ZONE).year();
  const fromDate = `${year - HOLIDAY_SYNC_YEARS_BEFORE}-01-01`;
  const toDate = `${year + HOLIDAY_SYNC_YEARS_AFTER}-12-31`;

  /*
   * Offset +07:00 viết thẳng: `Asia/Ho_Chi_Minh` là UTC+7 cố định, không có DST. Đi qua một
   * phép đổi múi giờ ở đây chỉ thêm một chỗ để lệch, trong khi biên cửa sổ vốn đã rộng cả năm.
   */
  return {
    fromDate,
    toDate,
    timeMin: `${fromDate}T00:00:00+07:00`,
    timeMax: `${toDate}T23:59:59+07:00`,
  };
}

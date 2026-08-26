import type { GoogleCalendarEventLike } from '@xeprime/domain';

/**
 * Google Calendar API v3 — `events.list`. Phần DUY NHẤT của luồng ngày lễ nói chuyện ra ngoài.
 *
 * Gọi bằng `fetch` trần, không SDK: một request REST không đáng đánh đổi bằng `googleapis` —
 * một dependency kéo theo cả cây `google-auth-library` cho thứ mà ở đây thậm chí không cần
 * xác thực người dùng. Cùng lý do và cùng khuôn với `apps/api/src/modules/geo/google-geo.provider.ts`.
 *
 * **API key, không OAuth, không service account.** Lịch nghỉ lễ VN là lịch CÔNG KHAI của
 * Google; đọc nó chỉ cần một key đã bật Calendar API. Dựng OAuth cho dữ liệu ai cũng xem được
 * là thêm một luồng token phải bảo quản mà không đổi lấy điều gì.
 *
 * Vì sao client này ở `apps/worker` chứ không ở `apps/api`: key không bao giờ được rời backend,
 * và trong hai backend thì chỉ worker có việc gọi ra ngoài theo đồng hồ. API chỉ ĐỌC bảng
 * `public_holidays` — nó không biết Google tồn tại.
 */
const CALENDAR_API_BASE = 'https://www.googleapis.com/calendar/v3/calendars';

/**
 * Timeout rộng tay hơn hẳn luồng bản đồ (3–4 giây) vì đây là việc NỀN: không có ai đang ngồi
 * chờ trước một cái form. Nhưng vẫn phải có trần — một request treo vô hạn sẽ giữ advisory
 * lock và làm mọi lượt sau bỏ qua trong im lặng.
 */
const REQUEST_TIMEOUT_MS = 10_000;

/** Trần Google cho phép mỗi trang. Xin đủ để lịch một năm thường về gọn trong một request. */
const MAX_RESULTS_PER_PAGE = 2500;

/**
 * Trần số vòng phân trang.
 *
 * Không phải phòng xa: `nextPageToken` là dữ liệu của bên khác, và một token tự trỏ về chính nó
 * (lỗi phía họ, hoặc một proxy ở giữa) biến vòng lặp này thành một vòng lặp vô hạn có tính
 * tiền. Ba năm lịch nghỉ lễ chưa tới 200 event, nên chạm tới trần 10 nghĩa là có gì đó sai chứ
 * không phải dữ liệu nhiều.
 */
const MAX_PAGES = 10;

interface EventsListResponse {
  readonly items?: readonly GoogleCalendarEventLike[];
  readonly nextPageToken?: string;
  readonly error?: { readonly message?: string; readonly code?: number; readonly status?: string };
}

export interface FetchHolidayEventsParams {
  readonly calendarId: string;
  readonly apiKey: string;
  /** RFC3339 — biên dưới cửa sổ đồng bộ (`holidaySyncWindow` ở @xeprime/domain). */
  readonly timeMin: string;
  /** RFC3339 — biên trên. */
  readonly timeMax: string;
}

/** Chữ ký mà job phụ thuộc vào — để test bơm một fetcher giả, không cần mạng. */
export type HolidayEventFetcher = (
  params: FetchHolidayEventsParams,
) => Promise<readonly GoogleCalendarEventLike[]>;

function buildUrl(params: FetchHolidayEventsParams, pageToken?: string): URL {
  // `encodeURIComponent` là BẮT BUỘC: calendarId chứa `@` và `#`
  // (`vi.vietnamese#holiday@group.v.calendar.google.com`), và `#` không escape sẽ cắt cụt
  // đường dẫn thành `.../vi.vietnamese` — Google trả 404 cho một lịch không tồn tại.
  const url = new URL(`${CALENDAR_API_BASE}/${encodeURIComponent(params.calendarId)}/events`);

  url.searchParams.set('key', params.apiKey);
  url.searchParams.set('timeMin', params.timeMin);
  url.searchParams.set('timeMax', params.timeMax);
  // Bung sự kiện lặp thành từng lần xuất hiện — không có nó, một ngày lễ hằng năm về dưới dạng
  // MỘT event kèm luật lặp, và ta sẽ phải tự diễn giải RRULE.
  url.searchParams.set('singleEvents', 'true');
  // Xin cả event ĐÃ HUỶ: đó là cách duy nhất biết một ngày lễ bị gỡ khỏi lịch nguồn. Không có
  // nó thì event bị huỷ chỉ đơn giản vắng mặt, và ta không phân biệt được "Google gỡ đi" với
  // "trang này chưa tải xong".
  url.searchParams.set('showDeleted', 'true');
  url.searchParams.set('maxResults', String(MAX_RESULTS_PER_PAGE));
  url.searchParams.set('orderBy', 'startTime');
  if (pageToken) url.searchParams.set('pageToken', pageToken);

  return url;
}

/**
 * Lấy TOÀN BỘ event trong cửa sổ, đi hết phân trang.
 *
 * Ném lỗi có ngữ cảnh (HTTP status, hoặc `error.message` của Google) thay vì trả mảng rỗng:
 * "không có ngày lễ nào" và "không hỏi được Google" là hai câu khác hẳn nhau, và nhầm câu thứ
 * hai thành câu thứ nhất sẽ khiến job xoá sạch bảng vì tưởng Google đã gỡ hết. Job ở tầng trên
 * bắt lỗi này và ghi `holiday_sync_runs.failed` mà KHÔNG chạm vào `public_holidays`.
 */
export const fetchHolidayEvents: HolidayEventFetcher = async (params) => {
  const events: GoogleCalendarEventLike[] = [];
  let pageToken: string | undefined;

  for (let page = 0; page < MAX_PAGES; page += 1) {
    const res = await fetch(buildUrl(params, pageToken), {
      signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
    });

    if (!res.ok) {
      // KHÔNG in URL ra: nó mang `key` trong query string, và thông điệp lỗi này đi vào log.
      throw new Error(`Google Calendar API trả HTTP ${res.status}`);
    }

    const body = (await res.json()) as EventsListResponse;
    if (body.error) {
      throw new Error(
        `Google Calendar API: ${body.error.status ?? body.error.code ?? ''} ${body.error.message ?? ''}`.trim(),
      );
    }

    events.push(...(body.items ?? []));

    pageToken = body.nextPageToken;
    if (!pageToken) return events;
  }

  throw new Error(`Google Calendar API vẫn còn trang sau ${MAX_PAGES} lượt — dừng để khỏi lặp vô hạn`);
};

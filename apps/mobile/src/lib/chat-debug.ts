import { logger } from './logger';

/**
 * Log chẩn đoán của Communication — chat realtime (COM-02), thông báo trong app (COM-04) và
 * thông báo đẩy (COM-07).
 *
 * Vì sao cần một cửa riêng thay vì gọi thẳng `logger`: đường realtime hỏng ÂM THẦM. Custom token
 * mint được không chứng minh projection còn sống; `onSnapshot` không bao giờ ném khi worker
 * outbox chết; polling vẫn mang tin về nên màn hình trông vẫn đúng, chỉ chậm. Không có dấu vết
 * theo bước thì cách duy nhất để biết realtime có chạy hay không là ngồi bấm thử hai máy.
 *
 * ## Cái gì ĐƯỢC ghi
 *
 * Chỉ SỰ KIỆN và số đo: tên bước, nguồn (`realtime` / `poll` / `rest`), thời lượng, số lượng,
 * mã lỗi đã chuẩn hoá. Không nội dung.
 *
 * ## Cái gì KHÔNG BAO GIỜ được ghi
 *
 * Custom token Firebase, **registration token của FCM**, access/refresh token, nội dung tin
 * nhắn, tiêu đề/thân thông báo đẩy, email, số điện thoại, tên người dùng, URL đã ký của R2, và
 * ID ĐẦY ĐỦ của người dùng/hội thoại/đơn. Log của app native đi
 * thẳng vào logcat/Console.app — nơi mọi app khác trên máy dev đọc được, và nơi ảnh chụp màn
 * hình bug report chộp nguyên vẹn.
 *
 * ID rút gọn qua {@link shortId} để vẫn nối được các dòng log của cùng một thread mà không phơi
 * khoá tra cứu. Chuỗi lỗi đi qua {@link errorCode} để một `message` của backend (tiếng Việt, có
 * thể kèm dữ liệu) không lọt vào log.
 */

/**
 * Bật khi CẢ HAI đúng: cờ env và bản dev. Bản phát hành không bao giờ ghi dòng nào.
 *
 * `process.env.EXPO_PUBLIC_*` được babel THAY BẰNG HẰNG lúc transform, nên giá trị này chốt ở
 * thời điểm bundle — đổi `.env` khi Metro đang chạy thì phải khởi động lại.
 */
let enabled = process.env.EXPO_PUBLIC_CHAT_DEBUG === 'true' && __DEV__;

/** Bao nhiêu ký tự đầu của một ULID được giữ lại — đủ để nối log, không đủ để tra ngược. */
const ID_PREFIX_LENGTH = 6;

/** Nguồn mang dữ liệu về màn hình — câu hỏi trung tâm của mọi lần gỡ lỗi realtime. */
export const CHAT_DEBUG_SOURCE = {
  REALTIME: 'realtime',
  POLL: 'poll',
  REST: 'rest',
} as const;

export type ChatDebugSource = (typeof CHAT_DEBUG_SOURCE)[keyof typeof CHAT_DEBUG_SOURCE];

/**
 * Thông báo đẩy tới app ở TRẠNG THÁI NÀO — câu hỏi đầu tiên khi "push không hoạt động".
 *
 * Ba trạng thái đi ba đường native khác hẳn nhau: `onMessage`, `onNotificationOpenedApp` và
 * `getInitialNotification`. Một trong ba hỏng mà hai cái kia chạy là chuyện thường — không
 * phân biệt được thì mọi báo cáo lỗi đều quy về "thông báo lúc được lúc không".
 */
export const PUSH_TRIGGER = {
  /** App đang MỞ — hệ điều hành không vẽ gì, app tự báo bằng toast. */
  FOREGROUND: 'foreground',
  /** Người dùng bấm thông báo khi app đang ở NỀN. */
  BACKGROUND: 'background',
  /** Bấm thông báo khi app đã TẮT HẲN — nhánh `getInitialNotification`. */
  COLD_START: 'coldStart',
  /**
   * Payload TỚI trong lúc app ở nền — nhánh `setBackgroundMessageHandler`.
   *
   * Khác `BACKGROUND` ở trên: cái kia là người dùng BẤM vào thông báo, cái này là tin vừa TỚI
   * máy và hệ điều hành tự vẽ lên khay. Hai thứ xảy ra cách nhau hàng phút, hoặc cái thứ hai
   * không bao giờ xảy ra vì người dùng gạt thông báo đi.
   */
  BACKGROUND_DELIVERED: 'backgroundDelivered',
} as const;

export type PushTrigger = (typeof PUSH_TRIGGER)[keyof typeof PUSH_TRIGGER];

export interface ChatDebugFields {
  /** ID đã rút gọn (dùng {@link shortId}) — KHÔNG truyền id đầy đủ vào đây. */
  readonly id?: string;
  readonly source?: ChatDebugSource;
  readonly durationMs?: number;
  readonly count?: number;
  /** Mã lỗi đã chuẩn hoá (dùng {@link errorCode}) — KHÔNG truyền `message` của backend. */
  readonly code?: string;
  /** Cờ nhị phân: có cấu hình chưa, đang ở tiền cảnh không… Không dùng cho dữ liệu. */
  readonly flag?: boolean;
  /** Thông báo đẩy tới ở trạng thái nào — {@link PUSH_TRIGGER}. */
  readonly trigger?: PushTrigger;
  /** HÌNH DẠNG đường dẫn, đã bỏ id (dùng {@link routeShape}) — KHÔNG truyền `data.url` thô. */
  readonly route?: string;
}

/**
 * Sáu ký tự đầu của một id. Với ULID đó là phần MỐC THỜI GIAN — nó phân biệt được hai thread
 * đang mở trong cùng một phiên gỡ lỗi mà không phải là khoá tra cứu bản ghi nào.
 */
export function shortId(id: string | null | undefined): string {
  if (!id) return '-';
  return `${id.slice(0, ID_PREFIX_LENGTH)}…`;
}

const MESSAGE_MAX = 96;

/** Chữ cái, khoảng trắng và dấu câu của một CÂU. Không chữ số, không `/`, không `_`, không `@`. */
const STATIC_SENTENCE = /^[A-Za-z .,:;'"()!?-]+$/;
/** Một mạch chữ cái dài hơn ngần này không phải từ tiếng Anh — là token hay hash đã mất chữ số. */
const LETTER_RUN_MAX = 16;

/**
 * Câu lỗi rút gọn, chỉ dùng khi tên lớp lỗi là loại CHUNG.
 *
 * NHẬN TRỌN hoặc BỎ TRỌN, không gọt tỉa. Bản trước lọc theo từng ký tự và một JWT đã lọt qua:
 * bỏ chữ số xong, `eyJhbGciOiJSUzI1NiIs…` vỡ thành nhiều mẩu ngắn và mẩu nào cũng "hợp lệ".
 * Gọt tỉa một chuỗi bí mật thì phần còn lại vẫn là chuỗi bí mật.
 *
 * Ba điều kiện, thiếu một là bỏ cả câu:
 *  1. ngắn hơn `MESSAGE_MAX`;
 *  2. chỉ gồm chữ cái ASCII và dấu câu — chữ số, `://`, `_`, `@`, dấu tiếng Việt đều loại, nên
 *     token, URL, email, số điện thoại, số tiền và mọi câu tự do của backend rụng ngay ở đây;
 *  3. không có mạch chữ cái nào dài quá `LETTER_RUN_MAX`.
 *
 * Thứ sống sót là câu TĨNH thư viện viết sẵn — "INTERNAL ASSERTION FAILED: Expected a class
 * definition" — đúng và chỉ đúng thứ cần để lần ra lỗi.
 */
function sanitizeMessage(message: string): string {
  if (!message || message.length > MESSAGE_MAX) return '';
  if (!STATIC_SENTENCE.test(message)) return '';
  if (new RegExp(`[A-Za-z]{${LETTER_RUN_MAX + 1},}`).test(message)) return '';
  return message;
}

/**
 * Mã lỗi ĐÃ CHUẨN HOÁ để đưa vào log.
 *
 * Ba bậc, dừng ở bậc đầu tiên có thông tin:
 *  1. `code` — Firebase đặt `auth/…`, `permission-denied`; `ApiClientError` đặt mã của backend.
 *     Đã là một mã, không cần lọc gì.
 *  2. tên lớp lỗi RIÊNG (`ApiClientError`, `ULIDError`, `FirebaseError`) — tự nó đã đủ để lần ra.
 *  3. tên lớp lỗi CHUNG (`Error`, `TypeError`…) — không nói được gì, nên mới ghép thêm câu lỗi
 *     ĐÃ LỌC. Đây là bậc duy nhất chạm tới `message`, và nó tồn tại vì một lý do cụ thể:
 *     `debugFail` của Firebase ném `Error` trần, nên `firebase.auth.failed {code:"Error"}` là
 *     một dòng log không truy được gì.
 *
 * `error.message` KHÔNG bao giờ đi thẳng vào log — xem `sanitizeMessage`.
 */
const GENERIC_ERROR_NAMES: ReadonlySet<string> = new Set([
  'Error',
  'EvalError',
  'RangeError',
  'ReferenceError',
  'SyntaxError',
  'TypeError',
  'URIError',
]);

/** Vì sao listener không gắn được. Mã CỐ ĐỊNH, không phải câu lỗi tự do. */
export const LISTENER_SKIP_REASON = {
  /** Không dựng được Firestore: thiếu biến môi trường, hoặc `initializeApp` hỏng. */
  NO_CONFIG: 'noConfig',
  /** Có Firestore nhưng chưa đăng nhập Firebase — xem `firebase.auth.failed` ngay phía trên. */
  NOT_SIGNED_IN: 'notSignedIn',
} as const;

export type ListenerSkipReason =
  (typeof LISTENER_SKIP_REASON)[keyof typeof LISTENER_SKIP_REASON];

/**
 * Đổ NGUYÊN payload FCM ra log — cờ RIÊNG, mặc định TẮT.
 *
 * Đây là ngoại lệ DUY NHẤT trong file này được phép mang nội dung thật: tiêu đề, nội dung tin
 * nhắn, `data.url` đầy đủ, id hội thoại. Mọi sự kiện khác đã lọc sạch.
 *
 * Vì sao vẫn có: khi push "không hoạt động", câu hỏi đầu tiên là server GỬI GÌ — và không có
 * cách nào trả lời nếu client chỉ ghi lại "đã nhận một tin". Nhưng nó ghi vào logcat/Console
 * của MÁY THẬT, nên phải bật tay và tắt lại sau khi gỡ xong.
 *
 * Hai lớp khoá: cờ env RIÊNG (không dùng chung `EXPO_PUBLIC_CHAT_DEBUG`) và `__DEV__`. Bản
 * production không có đường nào bật được.
 */
let rawDump = process.env.EXPO_PUBLIC_PUSH_DEBUG_RAW === 'true' && __DEV__;

/** Bật/tắt trong test — cùng lý do với `setChatDebugEnabledForTest`. */
export function setPushRawDumpForTest(value: boolean): void {
  rawDump = value;
}

export function errorCode(error: unknown): string {
  if (typeof error === 'object' && error !== null) {
    const code = (error as { code?: unknown }).code;
    if (typeof code === 'string' && code) return code.slice(0, 64);

    const name = (error as { name?: unknown }).name;
    const label = typeof name === 'string' && name ? name.slice(0, 64) : '';
    if (label && !GENERIC_ERROR_NAMES.has(label)) return label;

    const message = (error as { message?: unknown }).message;
    const detail = typeof message === 'string' ? sanitizeMessage(message) : '';
    if (label && detail) return `${label}: ${detail}`;
    if (label) return label;
  }
  return 'unknown';
}

/**
 * Một đoạn đường dẫn có phải ID không.
 *
 * Hai dấu hiệu, dính MỘT là đủ (`||`): ULID luôn có CHỮ SỐ — phần mốc thời gian bắt đầu bằng
 * `01J…` — còn đoạn nào dài hơn 20 ký tự thì không phải tên route. Chỉ bắt chữ số thì một id
 * toàn chữ lọt qua; chỉ bắt độ dài thì một mã tham chiếu ngắn lọt qua. Ngưỡng đặt ở 20 vì tên
 * route dài nhất trong allowlist là `booking-requests` (16) và `notifications` (13), còn ULID
 * thì luôn đúng 26 — không có vùng chồng lấn.
 */
function isIdSegment(segment: string): boolean {
  if (!segment) return false;
  return /\d/.test(segment) || segment.length > 20;
}

/**
 * HÌNH DẠNG của một đường dẫn: giữ khung, bỏ id.
 *
 * `/manage/chat/01JB9ZK…` → `/manage/chat/:id`. Đích của thông báo là thứ phải đọc được khi đi
 * tìm "bấm vào không mở đúng màn", nhưng bản thân nó mang id của một hội thoại hay một đơn có
 * thật — tức một khoá tra cứu, trong một dòng log đi thẳng vào logcat. Khung route trả lời đúng
 * câu hỏi cần trả lời mà không mang theo dữ liệu nào.
 */
export function routeShape(url: string | null | undefined): string {
  if (!url) return '-';
  const path = url.split(/[?#]/)[0] ?? '';
  return (
    path
      .split('/')
      .map((segment) => (isIdSegment(segment) ? ':id' : segment))
      .join('/')
      .slice(0, 80) || '/'
  );
}

function write(level: 'debug' | 'warn', event: string, fields?: ChatDebugFields): void {
  if (!enabled) return;
  // `logger` nhận `Record<string, unknown>`; `ChatDebugFields` cố ý là kiểu ĐÓNG (không có index
  // signature) để không ai nhét được một trường tuỳ ý — nên trải ra ở đúng ranh giới này.
  logger[level](`[comm] ${event}`, { ...fields });
}

/**
 * Các bước ĐÁNG ghi lại của Communication.
 *
 * Danh sách đóng chứ không phải một hàm `log(string)` tự do: mỗi lời gọi là một chữ ký có kiểu,
 * nên không có đường nào nhét nguyên `message` hay `token` vào payload mà TypeScript không chặn.
 */
export const chatDebug = {
  /** Cấu hình Firebase có mặt trong bundle không — câu hỏi đầu tiên khi realtime im lặng. */
  firebaseConfig: (present: boolean) => write('debug', 'firebase.config', { flag: present }),

  customTokenOk: (durationMs: number) =>
    write('debug', 'firebase.customToken.ok', { durationMs, source: CHAT_DEBUG_SOURCE.REST }),
  /** `enabled: false` từ server (FIRESTORE_ENABLED tắt) — KHÔNG phải lỗi, là cấu hình. */
  customTokenDisabled: () => write('debug', 'firebase.customToken.disabled'),
  customTokenFailed: (error: unknown, durationMs: number) =>
    write('warn', 'firebase.customToken.failed', { code: errorCode(error), durationMs }),

  authReady: () => write('debug', 'firebase.auth.ready'),
  authFailed: (error: unknown) => write('warn', 'firebase.auth.failed', { code: errorCode(error) }),
  /**
   * Phiên Firebase đã đóng — đăng xuất, đổi người dùng, hay rời cây.
   *
   * KHÔNG mang lý do: nơi gọi (cleanup của effect) không phân biệt được ba trường hợp đó, và một
   * mã đoán sai còn tệ hơn không có mã. Dòng ngay sau nó nói hộ: có `firebase.customToken.ok` là
   * đổi người dùng, im lặng là đăng xuất.
   */
  authSignedOut: () => write('debug', 'firebase.auth.signedOut'),

  /**
   * Vì sao KHÔNG gắn listener — mắt xích trước đây đứt ở đây.
   *
   * `useThreadRealtime` bỏ qua trong im lặng khi chưa có Firestore hoặc chưa đăng nhập Firebase,
   * nên log chỉ còn `thread.transport {source:"poll"}` mà không nói được vì sao. Đọc một bản log
   * lúc đó không phân biệt nổi "realtime hỏng" với "realtime chưa từng được bật".
   *
   * `code` là lý do đã chuẩn hoá, không phải câu lỗi: `noConfig` (thiếu biến môi trường Firebase
   * hoặc dựng app hỏng) hay `notSignedIn` (custom token / `signInWithCustomToken` hỏng — dòng
   * `firebase.auth.failed` ngay trên nói rõ hơn).
   */
  listenerSkipped: (conversationId: string, reason: ListenerSkipReason) =>
    write('debug', 'listener.skipped', { id: shortId(conversationId), code: reason }),

  listenerAttached: (conversationId: string) =>
    write('debug', 'listener.attach', { id: shortId(conversationId) }),
  listenerSnapshot: (conversationId: string, count: number) =>
    write('debug', 'listener.snapshot', { id: shortId(conversationId), count }),
  listenerError: (conversationId: string, error: unknown) =>
    write('warn', 'listener.error', { id: shortId(conversationId), code: errorCode(error) }),
  listenerDetached: (conversationId: string) =>
    write('debug', 'listener.detach', { id: shortId(conversationId) }),

  /**
   * Một listener BẤT KỲ hỏng — chat thread, huy hiệu, hay thứ thêm sau này.
   *
   * `label` là nhãn tĩnh do nơi gọi đặt ('chat thread', 'badge'), KHÔNG phải dữ liệu người dùng.
   * Đây là hàm mà `useRealtimeSubscription` gọi; nó không biết gì về hội thoại nên không có `id`.
   */
  /**
   * Bản chiếu huy hiệu — ba mốc để đọc một bản log là biết realtime badge sống hay chết.
   *
   * KHÔNG log `uid` đầy đủ (đó là id người dùng) và không log con số của từng vai — chỉ
   * TỔNG, đủ để thấy nó có nhúc nhích hay không.
   */
  badgeListenerAttached: (userId: string) =>
    write('debug', 'badge.listener.attach', { id: shortId(userId) }),
  /** `flag` = snapshot đến TỪ SERVER (false ⇒ phát lại từ cache, không tính là khoẻ). */
  badgeSnapshot: (fromServer: boolean, total: number) =>
    write('debug', 'badge.snapshot', { flag: fromServer, count: total }),
  badgeRestOk: (total: number, durationMs: number) =>
    write('debug', 'badge.rest.ok', { count: total, durationMs }),

  realtimeFailed: (label: string, error: unknown) =>
    write('warn', 'realtime.failed', { flag: false, code: `${label}: ${errorCode(error)}` }),

  /** Thread đang chạy bằng đường nào — realtime + poll thưa, hay chỉ poll nhanh. */
  threadTransport: (conversationId: string, source: ChatDebugSource, pollMs: number) =>
    write('debug', 'thread.transport', {
      id: shortId(conversationId),
      source,
      durationMs: pollMs,
    }),

  refreshOk: (conversationId: string, source: ChatDebugSource, count: number, durationMs: number) =>
    write('debug', 'thread.refresh.ok', { id: shortId(conversationId), source, count, durationMs }),
  refreshFailed: (conversationId: string, source: ChatDebugSource, error: unknown, durationMs: number) =>
    write('warn', 'thread.refresh.failed', {
      id: shortId(conversationId),
      source,
      code: errorCode(error),
      durationMs,
    }),

  sendOk: (conversationId: string, durationMs: number, attachmentCount: number) =>
    write('debug', 'message.send.ok', {
      id: shortId(conversationId),
      durationMs,
      count: attachmentCount,
    }),
  sendFailed: (conversationId: string, error: unknown, durationMs: number) =>
    write('warn', 'message.send.failed', {
      id: shortId(conversationId),
      code: errorCode(error),
      durationMs,
    }),

  /** `count` là số BYTE của tệp — một con số, không phải tên hay URL. */
  attachmentUploadOk: (bytes: number, durationMs: number) =>
    write('debug', 'attachment.upload.ok', { count: bytes, durationMs }),
  attachmentUploadFailed: (error: unknown, durationMs: number) =>
    write('warn', 'attachment.upload.failed', { code: errorCode(error), durationMs }),

  /**
   * Ảnh TẢI VỀ hỏng — khác hẳn tải LÊN hỏng.
   *
   * Không có dòng này thì một ảnh không hiện ra chỉ là một ô trống: không rõ URL hỏng, mạng
   * rớt, hay `expo-image` dựng lại view. URL KHÔNG được log — nó là địa chỉ R2 của tệp thật.
   */
  attachmentRenderFailed: (error: unknown) =>
    write('warn', 'attachment.render.failed', { code: errorCode(error) }),

  /* --- Thông báo đẩy (COM-07) ------------------------------------------------------------
   *
   * Cả chuỗi này im lặng khi hỏng, và mỗi bước hỏng vì một lý do khác hẳn: bản build không có
   * module native · người dùng từ chối quyền · FCM không cấp token · API từ chối đăng ký ·
   * payload tới nhưng đích không nằm trong allowlist. Không tách được từng bước thì mọi báo
   * cáo đều quy về một câu "không nhận được thông báo".
   */

  /** Bản build có module FCM native không (Expo Go và bản thiếu credential thì KHÔNG). */
  pushAvailable: (present: boolean) => write('debug', 'push.available', { flag: present }),
  pushPermission: (granted: boolean) => write('debug', 'push.permission', { flag: granted }),
  /** Quyền đã có sẵn từ trước ⇒ đăng ký thẳng, không hộp thoại nào. */
  pushPermissionAlready: () => write('debug', 'push.permission.already'),
  /** Có phiên nhưng CHƯA có quyền và cửa chưa mở — đợi người dùng vào màn chính rồi mới hỏi. */
  pushPermissionDeferred: () => write('debug', 'push.permission.deferred'),
  /** Người dùng đã vào một màn chính — từ giờ được phép hỏi quyền thông báo. */
  pushGateOpened: () => write('debug', 'push.gate.opened'),
  /** FCM không trả token — thường là sai project trong credential, hoặc Play Services lỗi. */
  pushTokenMissing: () => write('warn', 'push.token.missing'),
  /**
   * Token KHÔNG được log; chỉ ghi nhận là đã đăng ký xong.
   *
   * `flag` là cờ `PUSH_ENABLED` **của server**, đọc từ chính response đăng ký. Không có nó thì
   * một bản log "đăng ký thành công" rồi im lặng hoàn toàn vẫn không phân biệt được hai chuyện
   * khác hẳn nhau: app hỏng, hay server đang TẮT đường đẩy (`false` ⇒ API không tạo dòng
   * `push_deliveries` nào và worker không gửi gì — `docs/push-notifications.md` §2).
   */
  pushRegistered: (durationMs: number, serverEnabled: boolean) =>
    write('debug', 'push.register.ok', { durationMs, flag: serverEnabled }),
  pushRegisterFailed: (error: unknown, durationMs: number) =>
    write('warn', 'push.register.failed', { code: errorCode(error), durationMs }),
  /** FCM xoay token (khôi phục máy, cài lại app) — không đăng ký lại thì máy im lặng vĩnh viễn. */
  pushTokenRefreshed: () => write('debug', 'push.token.refreshed'),
  /** Phiên kết thúc: app quên dấu vết đăng ký, server đã tắt thiết bị của phiên đó. */
  pushForgotten: () => write('debug', 'push.forgotten'),

  /** Một thông báo tới. `flag` = payload có khối `notification` để hiện chữ hay không. */
  pushReceived: (trigger: PushTrigger, hasCopy: boolean) =>
    write('debug', 'push.received', { trigger, flag: hasCopy }),
  /** Đã điều hướng tới đích. `route` là KHUNG đường dẫn, không mang id. */
  pushRouted: (trigger: PushTrigger, url: string | null) =>
    write('debug', 'push.routed', { trigger, route: routeShape(url) }),
  /** Đích không qua được allowlist — payload lạ, hoặc app cũ hơn server. KHÔNG mở gì cả. */
  pushRouteRejected: (trigger: PushTrigger, url: string | null) =>
    write('warn', 'push.route.rejected', { trigger, route: routeShape(url) }),
  /** Chưa đăng nhập: cất đích lại, tiêu thụ sau khi đăng nhập. */
  pushRoutePending: (trigger: PushTrigger, url: string | null) =>
    write('debug', 'push.route.pending', { trigger, route: routeShape(url) }),
  /**
   * Payload TỚI trong lúc app ở nền. Chạy trong headless task, không có cây React nào.
   *
   * Tách khỏi `pushReceived` vì nó là đường native khác hẳn: `setBackgroundMessageHandler`
   * đăng ký ở phạm vi MODULE, còn ba nhánh kia sống trong một hook.
   */
  pushBackgroundDelivered: (hasCopy: boolean) =>
    write('debug', 'push.received', {
      trigger: PUSH_TRIGGER.BACKGROUND_DELIVERED,
      flag: hasCopy,
    }),

  /**
   * NGUYÊN payload — chỉ khi `EXPO_PUBLIC_PUSH_DEBUG_RAW=true` trên bản dev.
   *
   * KHÔNG đi qua `write`: hàm đó lọc sạch mọi thứ, mà đây đúng là chỗ cần KHÔNG lọc. Cũng vì
   * vậy nó có cờ riêng — bật log chẩn đoán thường không kéo theo việc đổ nội dung tin nhắn.
   */
  pushRaw: (trigger: PushTrigger, message: unknown) => {
    if (!rawDump) return;
    logger.debug(`[comm] push.raw (${trigger})`, { message });
  },

  /** Nhận push ⇒ làm mới hộp thư + badge. Đây là chỗ COM-07 gặp COM-04. */
  pushInboxRefreshed: () => write('debug', 'push.inbox.refreshed'),

  notificationsOk: (unread: number, durationMs: number) =>
    write('debug', 'notifications.refresh.ok', { count: unread, durationMs }),
  notificationsFailed: (error: unknown, durationMs: number) =>
    write('warn', 'notifications.refresh.failed', { code: errorCode(error), durationMs }),
  notificationReadOk: (all: boolean, updated: number) =>
    write('debug', 'notifications.read.ok', { flag: all, count: updated }),
  notificationReadFailed: (error: unknown) =>
    write('warn', 'notifications.read.failed', { code: errorCode(error) }),
};

/**
 * CHỈ dùng trong test — cùng tiền lệ với `resetAuthSessionForTest` ở `auth-session.ts`.
 *
 * Cần nó vì cờ thật đến từ `process.env.EXPO_PUBLIC_CHAT_DEBUG`, thứ babel đã nội tuyến thành
 * hằng lúc transform: gán biến môi trường trong test không đổi được gì, nên nếu không có cửa này
 * thì bài test quan trọng nhất của file — "không có bí mật nào lọt vào log" — sẽ xanh một cách
 * vô nghĩa vì log đang tắt.
 */
export function setChatDebugEnabledForTest(value: boolean): void {
  enabled = value;
}

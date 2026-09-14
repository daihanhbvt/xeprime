import { logger } from '@/lib/logger';
import {
  CHAT_DEBUG_SOURCE,
  chatDebug,
  errorCode,
  setChatDebugEnabledForTest,
  shortId,
} from './chat-debug';

/**
 * Log chẩn đoán Communication — kiểm đúng MỘT bất biến, và nó là bất biến bảo mật:
 * **không có đường nào để một bí mật hay một mẩu PII lọt vào logcat/Console.app**.
 *
 * Test đi qua từng lời gọi thật của `chatDebug` với payload độc hại (token Firebase, nội dung
 * tin, email, SĐT, URL đã ký) rồi khẳng định không chuỗi nào trong đó xuất hiện ở thứ `logger`
 * nhận được — thay vì chỉ tin vào kiểu TypeScript, thứ biến mất lúc chạy.
 */
jest.mock('@/lib/logger', () => ({
  logger: { debug: jest.fn(), warn: jest.fn(), error: jest.fn() },
}));

const mockLogger = logger as jest.Mocked<typeof logger>;

/** Mọi thứ KHÔNG được phép xuất hiện trong log, dù ở khoá hay ở giá trị. */
const SECRETS = [
  'eyJhbGciOiJSUzI1NiIsImtpZCI6IkZJUkVCQVNFLUNVU1RPTS1UT0tFTiJ9.abc.def',
  'Bearer xp_access_token_123',
  'refresh_token_abcdef',
  'Chào shop, xe này còn không ạ?',
  'khach.an@xeprime.test',
  '0901234567',
  'https://r2.example.com/chat/x.jpg?X-Amz-Signature=deadbeef',
];

/** ULID thật của một hội thoại — chỉ được phép lộ tiền tố, không bao giờ lộ trọn. */
const CONVERSATION_ID = '01JB9ZK2QW3E4R5T6Y7U8I9O0P';
const USER_ID = '01JB0000000000000000000000';

function loggedPayloads(): string {
  return [...mockLogger.debug.mock.calls, ...mockLogger.warn.mock.calls]
    .map((call) => `${String(call[0])} ${JSON.stringify(call[1] ?? {})}`)
    .join('\n');
}

beforeEach(() => {
  // `restoreMocks` của jest chỉ khôi phục spy; `jest.fn()` khai trong factory của `jest.mock`
  // thì tích luỹ lời gọi qua các test.
  mockLogger.debug.mockClear();
  mockLogger.warn.mockClear();
});

afterEach(() => setChatDebugEnabledForTest(false));

describe('chatDebug — cổng bật/tắt', () => {
  it('không ghi dòng nào khi TẮT', () => {
    setChatDebugEnabledForTest(false);

    chatDebug.firebaseConfig(true);
    chatDebug.authReady();
    chatDebug.listenerSnapshot(CONVERSATION_ID, 3);
    chatDebug.sendFailed(CONVERSATION_ID, new Error('x'), 1);

    expect(mockLogger.debug).not.toHaveBeenCalled();
    expect(mockLogger.warn).not.toHaveBeenCalled();
  });

  /**
   * Mặc định của bundle là TẮT: cờ đến từ `EXPO_PUBLIC_CHAT_DEBUG`, thứ babel nội tuyến lúc
   * transform, và jest không nạp `.env` nào. Một bản build quên tắt cờ sẽ lộ ra ở đây.
   */
  it('mặc định (không có cờ env) là TẮT', () => {
    chatDebug.authReady();
    expect(mockLogger.debug).not.toHaveBeenCalled();
  });
});

describe('chatDebug — vệ sinh log', () => {
  beforeEach(() => setChatDebugEnabledForTest(true));

  it('ghi khi BẬT — và chỉ mang event + số đo', () => {
    chatDebug.refreshOk(CONVERSATION_ID, CHAT_DEBUG_SOURCE.REALTIME, 2, 137);

    expect(mockLogger.debug).toHaveBeenCalledTimes(1);
    const [message, payload] = mockLogger.debug.mock.calls[0] as [string, Record<string, unknown>];
    expect(message).toBe('[comm] thread.refresh.ok');
    expect(payload).toEqual({ id: '01JB9Z…', source: 'realtime', count: 2, durationMs: 137 });
  });

  it('nói rõ đang chạy bằng REALTIME hay POLL, kèm nhịp đang dùng', () => {
    chatDebug.threadTransport(CONVERSATION_ID, CHAT_DEBUG_SOURCE.POLL, 5_000);

    const [message, payload] = mockLogger.debug.mock.calls[0] as [string, Record<string, unknown>];
    expect(message).toBe('[comm] thread.transport');
    expect(payload).toMatchObject({ source: 'poll', durationMs: 5_000 });
  });

  it('KHÔNG BAO GIỜ ghi token, nội dung tin, email, SĐT hay URL đã ký', () => {
    /*
     * Nhồi bí mật vào MỌI khe mà một lời gọi nhận được. `error` là chỗ dễ rò nhất: một
     * `ApiClientError` mang nguyên `message` do backend soạn, và câu đó có thể chứa SĐT hay số
     * tiền của một đơn thật.
     */
    for (const secret of SECRETS) {
      const poisoned = Object.assign(new Error(secret), { response: secret });

      chatDebug.customTokenFailed(poisoned, 12);
      chatDebug.authFailed(poisoned);
      chatDebug.listenerError(secret, poisoned);
      chatDebug.refreshFailed(secret, CHAT_DEBUG_SOURCE.POLL, poisoned, 5);
      chatDebug.sendFailed(secret, poisoned, 5);
      chatDebug.attachmentUploadFailed(poisoned, 5);
      chatDebug.notificationsFailed(poisoned, 5);
      chatDebug.notificationReadFailed(poisoned);
    }

    const dump = loggedPayloads();
    expect(dump).not.toBe('');
    for (const secret of SECRETS) {
      expect(dump).not.toContain(secret);
    }
  });

  it('ID hội thoại/người dùng chỉ lộ TIỀN TỐ, không bao giờ trọn vẹn', () => {
    chatDebug.listenerAttached(CONVERSATION_ID);
    chatDebug.sendOk(CONVERSATION_ID, 40, 1);

    const dump = loggedPayloads();
    expect(dump).not.toContain(CONVERSATION_ID);
    expect(dump).not.toContain(USER_ID);
    expect(dump).toContain(shortId(CONVERSATION_ID));
  });

  /** Số byte của đính kèm là một CON SỐ — không kéo theo tên tệp hay URL công khai của nó. */
  it('log tải đính kèm chỉ mang số byte và thời lượng', () => {
    chatDebug.attachmentUploadOk(482_133, 900);

    const [, payload] = mockLogger.debug.mock.calls[0] as [string, Record<string, unknown>];
    expect(payload).toEqual({ count: 482_133, durationMs: 900 });
  });
});

describe('shortId / errorCode', () => {
  it('`shortId` cắt ULID còn tiền tố, và chịu được giá trị rỗng', () => {
    expect(shortId(CONVERSATION_ID)).toBe('01JB9Z…');
    expect(shortId(CONVERSATION_ID).length).toBeLessThan(CONVERSATION_ID.length);
    expect(shortId(null)).toBe('-');
    expect(shortId(undefined)).toBe('-');
  });

  it('`errorCode` lấy MÃ, không lấy câu của backend', () => {
    expect(errorCode({ code: 'permission-denied', message: 'Bạn không có quyền' })).toBe(
      'permission-denied',
    );
    expect(errorCode(Object.assign(new Error('Vui lòng đợi 38s'), { name: 'ApiClientError' }))).toBe(
      'ApiClientError',
    );
    expect(errorCode('một chuỗi trần')).toBe('unknown');
    expect(errorCode(null)).toBe('unknown');
  });

  /**
   * `Error` trần không nói được gì — và `debugFail` của Firebase ném đúng loại đó, nên
   * `firebase.auth.failed {code:"Error"}` là một dòng log vô dụng. Bậc cuối mới chạm `message`.
   */
  it('lỗi CHUNG thì ghép thêm câu đã lọc; lỗi có tên RIÊNG thì không', () => {
    expect(errorCode(new Error('INTERNAL ASSERTION FAILED: Expected a class definition'))).toBe(
      'Error: INTERNAL ASSERTION FAILED: Expected a class definition',
    );
    // Tên riêng đã đủ để lần ra — không đụng tới câu lỗi.
    expect(
      errorCode(Object.assign(new Error('Vui lòng đợi 38s'), { name: 'ApiClientError' })),
    ).toBe('ApiClientError');
  });

  /**
   * NHẬN TRỌN hoặc BỎ TRỌN. Gọt tỉa từng ký tự là cái bẫy: bỏ chữ số khỏi một JWT thì phần còn
   * lại vẫn là JWT, chỉ vỡ ra nhiều mẩu — và mẩu nào cũng trông "sạch".
   */
  it('câu có DẤU HIỆU dữ liệu thì bỏ TRỌN, không gọt tỉa', () => {
    const cases = [
      'Gọi 0912345678 thất bại',
      'token eyJhbGciOiJSUzI1NiIsImtpZCI6IkZJUkVCQVNF.abc.def không hợp lệ',
      'GET https://api-stg.xeprime.vn/conversations/01M256TWX9R6YH9AFY46ZHWBQZ failed',
      'user hanhsoftrent@gmail.com not found',
      'x'.repeat(200),
    ];

    for (const message of cases) {
      // Chỉ còn tên lớp lỗi — không một mẩu nào của câu đi kèm.
      expect(errorCode(new Error(message))).toBe('Error');
    }
  });


  /** Mã từ mạng là chuỗi tự do — cắt ngắn để một "mã" dài cả trang không thành kho chứa dữ liệu. */
  it('cắt ngắn mã lỗi quá dài', () => {
    expect(errorCode({ code: 'x'.repeat(500) })).toHaveLength(64);
  });
});

import { logger } from '@/lib/logger';
import {
  PUSH_TRIGGER,
  chatDebug,
  routeShape,
  setChatDebugEnabledForTest,
  setPushRawDumpForTest,
} from './chat-debug';

/**
 * Log vòng đời thông báo đẩy (COM-07).
 *
 * Cùng một bất biến bảo mật với phần chat: **không bí mật nào lọt vào logcat**. Ở đây thứ nguy
 * hiểm nhất là hai cái: registration token của FCM (ai có nó thì gửi được thông báo tới máy đó)
 * và `data.url`, thứ mang id thật của một hội thoại hay một đơn.
 */
jest.mock('@/lib/logger', () => ({
  logger: { debug: jest.fn(), warn: jest.fn(), error: jest.fn() },
}));

const mockLogger = logger as jest.Mocked<typeof logger>;

const FCM_TOKEN =
  'fZx9Q1qk_TUe:APA91bF7v0m2sample-registration-token-khong-duoc-log-9aQw3eR4tY';
const CONVERSATION_ID = '01JB9ZK2QW3E4R5T6Y7U8I9O0P';

const dump = () =>
  [...mockLogger.debug.mock.calls, ...mockLogger.warn.mock.calls]
    .map((call) => `${String(call[0])} ${JSON.stringify(call[1] ?? {})}`)
    .join('\n');

beforeEach(() => {
  mockLogger.debug.mockClear();
  mockLogger.warn.mockClear();
  setChatDebugEnabledForTest(true);
});

afterEach(() => {
  setChatDebugEnabledForTest(false);
  setPushRawDumpForTest(false);
});

describe('routeShape', () => {
  it('giữ khung route, thay id bằng `:id`', () => {
    expect(routeShape(`/manage/chat/${CONVERSATION_ID}`)).toBe('/manage/chat/:id');
    expect(routeShape(`/trips/${CONVERSATION_ID}`)).toBe('/trips/:id');
  });

  it('route không có id thì giữ nguyên', () => {
    expect(routeShape('/manage/requests')).toBe('/manage/requests');
    expect(routeShape('/chat')).toBe('/chat');
  });

  /**
   * Tên route DÀI vẫn phải đọc được. Ngưỡng che id đặt ở 20 ký tự chứ không phải 10: dài nhất
   * trong allowlist là `booking-requests` (16), còn ULID luôn đúng 26 — không chồng lấn. Đặt
   * ngưỡng quá thấp thì log chỉ còn `/:id/:id` và không truy được gì.
   */
  it('tên route dài KHÔNG bị nhầm thành id', () => {
    expect(routeShape('/notifications')).toBe('/notifications');
    expect(routeShape('/manage/booking-requests')).toBe('/manage/booking-requests');
    expect(routeShape('/manage/subscriptions')).toBe('/manage/subscriptions');
  });

  it('bỏ query và hash — chúng không kiểm được', () => {
    expect(routeShape('/chat?c=01JB9ZK2QW3E4R5T6Y7U8I9O0P#x')).toBe('/chat');
  });

  it('chịu được rỗng', () => {
    expect(routeShape(null)).toBe('-');
    expect(routeShape(undefined)).toBe('-');
  });
});

describe('chatDebug — vòng đời push', () => {
  it('phân biệt được BA trạng thái nhận', () => {
    chatDebug.pushReceived(PUSH_TRIGGER.FOREGROUND, true);
    chatDebug.pushReceived(PUSH_TRIGGER.BACKGROUND, true);
    chatDebug.pushReceived(PUSH_TRIGGER.COLD_START, false);

    const triggers = mockLogger.debug.mock.calls.map(
      (call) => (call[1] as { trigger?: string }).trigger,
    );
    expect(triggers).toEqual(['foreground', 'background', 'coldStart']);
  });

  it('ghi đủ từng bước đăng ký, KHÔNG kèm token', () => {
    chatDebug.pushAvailable(true);
    chatDebug.pushPermission(true);
    chatDebug.pushRegistered(214, false);

    expect(dump()).toContain('push.register.ok');
    // Cờ PUSH_ENABLED của server đi kèm — đó là thứ phân biệt "app hỏng" với "server tắt đẩy".
    expect(dump()).toContain('"flag":false');
    expect(dump()).not.toContain(FCM_TOKEN);
    // Không có khe nào trong chữ ký nhận token — đây là phép kiểm lúc CHẠY cho điều đó.
    expect(dump()).not.toMatch(/APA91/);
  });

  it('đích chỉ lộ KHUNG route, không lộ id', () => {
    const url = `/manage/chat/${CONVERSATION_ID}`;
    chatDebug.pushRouted(PUSH_TRIGGER.BACKGROUND, url);
    chatDebug.pushRoutePending(PUSH_TRIGGER.COLD_START, url);
    chatDebug.pushRouteRejected(PUSH_TRIGGER.FOREGROUND, '/khong-ton-tai/abc');

    const text = dump();
    expect(text).toContain('/manage/chat/:id');
    expect(text).not.toContain(CONVERSATION_ID);
  });

  it('lỗi đăng ký chỉ mang MÃ, không mang câu của backend', () => {
    chatDebug.pushRegisterFailed(
      Object.assign(new Error('Thiết bị của 0901234567 bị từ chối'), { code: 'FORBIDDEN' }),
      42,
    );

    const text = dump();
    expect(text).toContain('FORBIDDEN');
    expect(text).not.toContain('0901234567');
  });

  it('TẮT cờ thì không ghi dòng nào', () => {
    setChatDebugEnabledForTest(false);
    chatDebug.pushAvailable(true);
    chatDebug.pushReceived(PUSH_TRIGGER.FOREGROUND, true);
    chatDebug.pushRouted(PUSH_TRIGGER.BACKGROUND, '/chat/x');

    expect(mockLogger.debug).not.toHaveBeenCalled();
    expect(mockLogger.warn).not.toHaveBeenCalled();
  });
});

/**
 * `push.raw` là ngoại lệ DUY NHẤT được phép mang nội dung thật — và chính vì vậy nó phải câm
 * khi chưa ai bật cờ RIÊNG của nó.
 *
 * Bật log chẩn đoán thường (`EXPO_PUBLIC_CHAT_DEBUG`) KHÔNG được kéo theo việc đổ tiêu đề, nội
 * dung tin và `data.url` đầy đủ vào logcat của máy thật. Hai cờ, hai mục đích.
 */
describe('push.raw — đổ nguyên payload', () => {
  const payload = {
    notification: { title: 'Bạn có tin nhắn mới', body: 'Chào anh, xe còn trống không ạ?' },
    data: { url: '/manage/chat/01M256TWX9R6YH9AFY46ZHWBQZ' },
  };

  it('CÂM khi chỉ bật log chẩn đoán, chưa bật cờ riêng', () => {
    setChatDebugEnabledForTest(true);
    setPushRawDumpForTest(false);

    chatDebug.pushRaw(PUSH_TRIGGER.FOREGROUND, payload);

    expect(logger.debug).not.toHaveBeenCalled();
  });

  it('bật cờ riêng thì đổ NGUYÊN payload, không lọc gì', () => {
    setPushRawDumpForTest(true);

    chatDebug.pushRaw(PUSH_TRIGGER.COLD_START, payload);

    expect(logger.debug).toHaveBeenCalledWith(
      expect.stringContaining('push.raw'),
      { message: payload },
    );
  });

  /** Nhãn phải nói ra TRẠNG THÁI — ba đường native khác hẳn nhau, lẫn lộn là gỡ lỗi mù. */
  it('nhãn mang đúng trạng thái app lúc nhận', () => {
    setPushRawDumpForTest(true);

    chatDebug.pushRaw(PUSH_TRIGGER.BACKGROUND_DELIVERED, payload);

    expect(logger.debug).toHaveBeenCalledWith(
      expect.stringContaining('backgroundDelivered'),
      expect.anything(),
    );
  });
});

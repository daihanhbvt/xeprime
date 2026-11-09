import { ThrottlerException, ThrottlerStorageService } from '@nestjs/throttler';
import { API_ERROR_CODE } from '@xeprime/types';
import { AllExceptionsFilter } from '../src/common/filters/all-exceptions.filter';

/**
 * Trần tần suất theo IP — hai điều người dùng NHÌN THẤY, không cần DB.
 *
 * Chạy: pnpm --filter @xeprime/api test -- test/rate-limit.spec.ts
 */

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

describe('ThrottlerStorageService — bộ đếm của MỘT khoá không bị khoá khác làm đóng băng', () => {
  /*
   * `@nestjs/throttler` ≤ 6.5.0 giữ hẹn giờ trừ lượt theo TÊN hạn mức thay vì theo khoá: một khoá
   * bất kỳ hết bị chặn là xoá hẹn giờ của MỌI khoá khác, và các lượt đang đếm dở ở đó nằm lại vĩnh
   * viễn. API chạy càng lâu thì trần thật của cửa đăng nhập càng tụt — người dùng bị báo "thao tác
   * quá nhanh" ngay lượt đầu tiên trong ngày. Spec này đỏ nếu ai đó hạ phiên bản về bản lỗi.
   */
  it('lượt của khoá A vẫn hết hạn đúng TTL sau khi khoá B nhả chặn', async () => {
    const storage = new ThrottlerStorageService();
    const ttl = 150;
    const limit = 5;
    try {
      for (let i = 0; i < limit + 1; i++) await storage.increment('B', ttl, limit, ttl, 'default');
      await sleep(ttl + 20);
      for (let i = 0; i < 3; i++) await storage.increment('A', ttl, limit, ttl, 'default');
      // B hết thời gian chặn ⇒ lượt này nhả khoá B (đúng chỗ bản lỗi xoá hẹn giờ của A).
      await storage.increment('B', ttl, limit, ttl, 'default');
      await sleep(ttl * 3);

      const next = await storage.increment('A', ttl, limit, ttl, 'default');
      expect(next.totalHits).toBe(1);
      expect(next.isBlocked).toBe(false);
    } finally {
      storage.onApplicationShutdown();
    }
  });
});

describe('AllExceptionsFilter — 429 nói rõ còn phải chờ bao lâu', () => {
  function respond(headers: Record<string, unknown>) {
    const json = jest.fn();
    const status = jest.fn(() => ({ json }));
    const host = {
      switchToHttp: () => ({
        getResponse: () => ({
          setHeader: jest.fn(),
          getHeader: (name: string) => headers[name],
          status,
        }),
      }),
    } as never;
    new AllExceptionsFilter(true).catch(new ThrottlerException(), host);
    return { status, json };
  }

  it('đọc `Retry-After` mà ThrottlerGuard đã đặt ⇒ `details.retryAfterSeconds`', () => {
    const { status, json } = respond({ 'Retry-After': 42 });
    expect(status).toHaveBeenCalledWith(429);
    expect(json).toHaveBeenCalledWith({
      error: {
        code: API_ERROR_CODE.RATE_LIMITED,
        message: expect.any(String),
        details: { retryAfterSeconds: 42 },
      },
    });
  });

  it('thiếu header ⇒ vẫn RATE_LIMITED, không bịa con số', () => {
    const { json } = respond({});
    expect(json).toHaveBeenCalledWith({
      error: { code: API_ERROR_CODE.RATE_LIMITED, message: expect.any(String) },
    });
  });
});

import type { Router } from 'expo-router';

import { leaveApp } from './leave-app';

jest.mock('@/lib/logger', () => ({ logger: { warn: jest.fn(), error: jest.fn() } }));

/**
 * Rời app sau khi phiên kết thúc.
 *
 * Bộ này khoá đúng một điều, và nó là một lỗi đã xảy ra thật: **hỏng ở bước gỡ chồng màn không
 * được chặn bước đưa về chợ xe**. Gộp hai thao tác vào một `try` nghĩa là một `dismissAll()` ném
 * ra sẽ nuốt luôn lượt `replace()`, và người vừa đăng xuất ở khu quản lý nằm lại đúng màn cần
 * phiên — `ScopeGuard` đổi nó thành "Vui lòng đăng nhập" rồi dừng ở đó, không ai đá họ ra.
 *
 * Triệu chứng đó không có gì đỏ lên: đăng xuất "thành công", token đã xoá, chỉ có một dòng `warn`
 * trong log mà không ai đọc.
 */

const EXPLORE = '/explore';

function fakeRouter(overrides: Partial<Router> = {}): Router {
  return {
    canDismiss: jest.fn(() => true),
    dismissAll: jest.fn(),
    replace: jest.fn(),
    ...overrides,
  } as unknown as Router;
}

describe('leaveApp', () => {
  it('gỡ chồng màn RỒI mới đưa về chợ xe', () => {
    const router = fakeRouter();

    leaveApp(router);

    expect(router.dismissAll).toHaveBeenCalledTimes(1);
    expect(router.replace).toHaveBeenCalledWith(EXPLORE);
  });

  it('VẪN đưa về chợ xe khi gỡ chồng màn ném lỗi', () => {
    const router = fakeRouter({
      dismissAll: jest.fn(() => {
        throw new Error('nothing to dismiss');
      }) as unknown as Router['dismissAll'],
    });

    leaveApp(router);

    // Đây là chính cái lỗi đã xảy ra: trước đây `replace` nằm cùng `try` nên không bao giờ chạy.
    expect(router.replace).toHaveBeenCalledWith(EXPLORE);
  });

  it('không gọi `dismissAll` khi không có gì để đóng, nhưng vẫn đi về chợ xe', () => {
    const router = fakeRouter({ canDismiss: jest.fn(() => false) as unknown as Router['canDismiss'] });

    leaveApp(router);

    expect(router.dismissAll).not.toHaveBeenCalled();
    expect(router.replace).toHaveBeenCalledWith(EXPLORE);
  });

  it('nuốt lỗi khi cây điều hướng chưa mount — listener đứng sau vẫn phải chạy', () => {
    const router = fakeRouter({
      replace: jest.fn(() => {
        throw new Error('assertIsReady');
      }) as unknown as Router['replace'],
    });

    expect(() => leaveApp(router)).not.toThrow();
  });
});

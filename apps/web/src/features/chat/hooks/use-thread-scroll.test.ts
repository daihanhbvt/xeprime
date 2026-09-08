import { describe, expect, it } from 'vitest';
import { anchoredScrollTop, isNearBottom, NEAR_BOTTOM_PX } from './use-thread-scroll';

/**
 * Hai phép tính mà toàn bộ hành vi cuộn của khung chat dựa vào. Chúng tách khỏi hook để kiểm
 * được bằng số học thay vì bằng một jsdom giả vờ có bố cục — jsdom trả `scrollHeight = 0` cho
 * mọi phần tử, nên một test "render rồi xem có cuộn không" ở đây chỉ kiểm chính cái mock.
 */
describe('isNearBottom', () => {
  it('đúng khi đang ở sát đáy', () => {
    expect(isNearBottom({ scrollTop: 900, scrollHeight: 1000, clientHeight: 100 })).toBe(true);
  });

  it('vẫn đúng trong ngưỡng dung sai — vài pixel dư là chuyện bình thường', () => {
    expect(
      isNearBottom({ scrollTop: 900 - NEAR_BOTTOM_PX, scrollHeight: 1000, clientHeight: 100 }),
    ).toBe(true);
  });

  it('sai khi người dùng đã cuộn lên đọc tin cũ', () => {
    expect(isNearBottom({ scrollTop: 200, scrollHeight: 5000, clientHeight: 400 })).toBe(false);
  });

  it('khung chưa có nội dung tràn được coi là ở đáy — nếu không tin đầu tiên không tự cuộn', () => {
    expect(isNearBottom({ scrollTop: 0, scrollHeight: 300, clientHeight: 300 })).toBe(true);
  });
});

describe('anchoredScrollTop', () => {
  /**
   * Cả bài toán "tải tin cũ mà không nhảy": nội dung mọc thêm ở TRÊN, nên `scrollTop` phải cộng
   * đúng phần vừa mọc. Không cộng thì viewport tụt lên đầu và người đọc mất chỗ.
   */
  it('bù đúng phần chiều cao vừa thêm vào phía trên', () => {
    const before = 2000;
    const after = { scrollTop: 150, scrollHeight: 3200, clientHeight: 400 };
    expect(anchoredScrollTop(before, after)).toBe(150 + 1200);
  });

  it('không có gì thêm vào thì vị trí giữ nguyên', () => {
    const box = { scrollTop: 640, scrollHeight: 2000, clientHeight: 400 };
    expect(anchoredScrollTop(2000, box)).toBe(640);
  });

  it('đang ở đúng đầu danh sách vẫn neo được (không âm)', () => {
    expect(anchoredScrollTop(1000, { scrollTop: 0, scrollHeight: 2500, clientHeight: 400 })).toBe(
      1500,
    );
  });
});

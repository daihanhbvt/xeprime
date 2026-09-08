import { cleanup, render, type RenderResult } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { act, useEffect, type RefObject } from 'react';
import { useThreadScroll } from './use-thread-scroll';

/**
 * Hành vi cuộn của khung tin nhắn — các tình huống mà bản trước làm sai.
 *
 * jsdom không có bố cục: `scrollHeight`/`clientHeight` luôn là 0 và `scrollTo` không tồn tại. Nên
 * test dựng một hộp cuộn giả và ghi lại mọi lệnh cuộn — đủ để kiểm ĐIỀU KIỆN cuộn, thứ thực sự
 * bị viết sai (bản trước cuộn theo `messages.length`, nên tải tin cũ cũng bị ném về đáy). Phần
 * "cuộn tới đúng pixel nào" đã có `use-thread-scroll.test.ts` kiểm bằng số học.
 */
const VIEWPORT = 400;

interface ThreadProps {
  conversationId: string | null;
  lastMessageId: string | null;
  messageCount: number;
  lastMessageIsMine: boolean;
  ready: boolean;
}

type ScrollState = ReturnType<typeof useThreadScroll>;

const scrollCalls: number[] = [];
const box = { scrollTop: 0, scrollHeight: 0 };
let latest: ScrollState | null = null;

function Harness(props: ThreadProps) {
  const state = useThreadScroll(props);

  useEffect(() => {
    latest = state;
  });

  // Khung cuộn là component CON nhận `containerRef` qua prop — đúng hình dạng thật
  // (`ThreadPanel` → `MessageList`), và cũng là cách duy nhất không đọc ref ngay trong render.
  return <MessagesBox containerRef={state.containerRef} />;
}

function MessagesBox({ containerRef }: { containerRef: RefObject<HTMLDivElement | null> }) {
  return <div ref={containerRef} data-testid="messages" />;
}

/**
 * Hộp cuộn giả, cắm ở tầng PROTOTYPE.
 *
 * Không cắm lên từng phần tử qua một ref callback: ghi vào ref lúc render là thứ React Compiler
 * chặn, và một layout effect của harness luôn chạy SAU layout effect của hook — nên lượt neo đáy
 * đầu tiên sẽ đọc phải `scrollHeight = 0` của jsdom và test đo nhầm.
 */
let restorePrototype: (() => void) | null = null;

function stubScrollBox() {
  const proto = HTMLElement.prototype as unknown as Record<string, unknown>;
  const originals = {
    scrollHeight: Object.getOwnPropertyDescriptor(proto, 'scrollHeight'),
    clientHeight: Object.getOwnPropertyDescriptor(proto, 'clientHeight'),
    scrollTop: Object.getOwnPropertyDescriptor(proto, 'scrollTop'),
  };
  const originalScrollTo = proto.scrollTo;

  Object.defineProperty(proto, 'scrollHeight', { configurable: true, get: () => box.scrollHeight });
  Object.defineProperty(proto, 'clientHeight', { configurable: true, get: () => VIEWPORT });
  Object.defineProperty(proto, 'scrollTop', {
    configurable: true,
    get: () => box.scrollTop,
    set: (next: number) => {
      box.scrollTop = next;
      scrollCalls.push(next);
    },
  });
  proto.scrollTo = (options: ScrollToOptions) => {
    box.scrollTop = options.top ?? 0;
    scrollCalls.push(box.scrollTop);
  };

  restorePrototype = () => {
    for (const [name, descriptor] of Object.entries(originals)) {
      if (descriptor) Object.defineProperty(proto, name, descriptor);
      else delete proto[name];
    }
    proto.scrollTo = originalScrollTo;
  };
}

/** Render với chiều cao nội dung cho trước — đặt TRƯỚC render để layout effect đọc đúng số. */
function renderThread(props: ThreadProps, contentHeight: number): RenderResult {
  box.scrollHeight = contentHeight;
  return render(<Harness {...props} />);
}

function rerenderThread(view: RenderResult, props: ThreadProps, contentHeight: number): void {
  box.scrollHeight = contentHeight;
  view.rerender(<Harness {...props} />);
}

/** Người dùng tự cuộn lên đọc tin cũ. */
function scrollTo(view: RenderResult, top: number): void {
  act(() => {
    box.scrollTop = top;
    view.getByTestId('messages').dispatchEvent(new Event('scroll'));
  });
  scrollCalls.length = 0;
}

const thread = (over: Partial<ThreadProps> = {}): ThreadProps => ({
  conversationId: 'c1',
  lastMessageId: 'm3',
  messageCount: 3,
  lastMessageIsMine: false,
  ready: true,
  ...over,
});

beforeEach(() => {
  scrollCalls.length = 0;
  box.scrollTop = 0;
  box.scrollHeight = 0;
  latest = null;
  stubScrollBox();
  // Hook quan sát kích thước để theo ảnh tải chậm. Setup chung của web đã cắm sẵn một bản giả;
  // chỉ tự cắm khi chưa có, và không ghi đè (thuộc tính đó không redefine được).
  if (typeof globalThis.ResizeObserver === 'undefined') {
    vi.stubGlobal(
      'ResizeObserver',
      class {
        observe() {}
        disconnect() {}
      },
    );
  }
});

afterEach(() => {
  cleanup();
  restorePrototype?.();
  restorePrototype = null;
  vi.unstubAllGlobals();
});

describe('useThreadScroll', () => {
  it('mở thread lần đầu: cuộn xuống đáy sau khi tải xong', () => {
    renderThread(thread(), 2000);
    expect(scrollCalls.at(-1)).toBe(2000);
  });

  it('CHƯA tải xong thì không cuộn — không có gì để neo vào', () => {
    renderThread(thread({ lastMessageId: null, messageCount: 0, ready: false }), 0);
    expect(scrollCalls).toHaveLength(0);
  });

  /**
   * Hội thoại ngắn hơn khung: không phát lệnh cuộn nào.
   *
   * Không phải chuyện tối ưu — đây là ranh giới "màn chat không bao giờ làm TRANG dịch chuyển".
   * Khung không cuộn được thì mọi lệnh cuộn đều vô nghĩa, và im lặng là cách chắc chắn nhất để
   * không có gì rò ra ngoài khung.
   */
  it('nội dung NGẮN hơn khung: không phát lệnh cuộn nào', () => {
    const view = renderThread(thread({ messageCount: 2 }), 200);
    expect(scrollCalls).toHaveLength(0);

    rerenderThread(view, thread({ lastMessageId: 'm4', messageCount: 3 }), 260);
    expect(scrollCalls).toHaveLength(0);
  });

  it('tin mới đến khi đang ở gần đáy: tự cuộn theo', () => {
    const view = renderThread(thread(), 2000);
    scrollCalls.length = 0;

    rerenderThread(view, thread({ lastMessageId: 'm4', messageCount: 4 }), 2200);
    expect(scrollCalls.at(-1)).toBe(2200);
  });

  it('tin mới đến khi đang ĐỌC TIN CŨ: không cuộn, chỉ báo có tin mới', () => {
    const view = renderThread(thread(), 4000);
    scrollTo(view, 200);

    rerenderThread(view, thread({ lastMessageId: 'm4', messageCount: 4 }), 4200);

    expect(scrollCalls).toHaveLength(0);
    expect(latest?.hasNewBelow).toBe(true);
  });

  it('tin của CHÍNH MÌNH luôn được cuộn tới, kể cả khi đang đọc tin cũ', () => {
    const view = renderThread(thread(), 4000);
    scrollTo(view, 100);

    rerenderThread(
      view,
      thread({ lastMessageId: 'm4', messageCount: 4, lastMessageIsMine: true }),
      4300,
    );

    expect(scrollCalls.at(-1)).toBe(4300);
  });

  /** Đây là lỗi cũ: `messages.length` đổi khi tải tin cũ, nên màn hình bị ném xuống đáy. */
  it('tải thêm TIN CŨ (length đổi, tin cuối KHÔNG đổi): không cuộn xuống đáy', () => {
    const view = renderThread(thread({ lastMessageId: 'm30', messageCount: 30 }), 4000);
    scrollTo(view, 40);

    rerenderThread(view, thread({ lastMessageId: 'm30', messageCount: 60 }), 8000);
    expect(scrollCalls).toHaveLength(0);
  });

  it('đổi hội thoại: quên trạng thái cũ và neo đáy của thread MỚI', () => {
    const view = renderThread(thread(), 4000);
    scrollTo(view, 120);

    rerenderThread(
      view,
      thread({ conversationId: 'c2', lastMessageId: 'z9', messageCount: 5 }),
      1500,
    );

    expect(scrollCalls.at(-1)).toBe(1500);
    expect(latest?.hasNewBelow).toBe(false);
  });

  it('đọc tin cũ ở A rồi sang B: B không thừa hưởng cờ "có tin mới" của A', () => {
    const view = renderThread(thread(), 4000);
    scrollTo(view, 100);
    rerenderThread(view, thread({ lastMessageId: 'm4', messageCount: 4 }), 4200);
    expect(latest?.hasNewBelow).toBe(true);

    rerenderThread(
      view,
      thread({ conversationId: 'c2', lastMessageId: 'b1', messageCount: 2 }),
      900,
    );
    expect(latest?.hasNewBelow).toBe(false);
  });
});

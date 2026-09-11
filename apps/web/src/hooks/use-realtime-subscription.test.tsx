import { cleanup, render, waitFor } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { REALTIME_STATE, useRealtimeSubscription, type RealtimeHandlers } from './use-realtime-subscription';

/**
 * Trạng thái listener — nơi lỗi thật đã ẩn náu.
 *
 * Triệu chứng của lỗi đó không phải một màn hình trắng mà là ĐỘ TRỄ: client tin mình đang
 * realtime (vì đăng nhập Firebase thành công), hạ nhịp hỏi lại xuống mức lưới an toàn, rồi người
 * nhận đợi trọn nhịp đó. Không có bài test nào bắt được nếu "đang realtime" vẫn còn là một cờ
 * suy ra từ tầng xác thực.
 */
let handlers: RealtimeHandlers | null = null;
let unsubscribes = 0;
let subscribes = 0;

function Probe({ enabled = true, subKey = 'k1' }: { enabled?: boolean; subKey?: string }) {
  const state = useRealtimeSubscription({
    enabled,
    key: subKey,
    label: 'test',
    subscribe: (h) => {
      subscribes++;
      handlers = h;
      return () => {
        unsubscribes++;
      };
    },
  });
  return <output>{state}</output>;
}

afterEach(() => {
  cleanup();
  vi.useRealTimers();
  handlers = null;
  unsubscribes = 0;
  subscribes = 0;
});

describe('useRealtimeSubscription', () => {
  it('bắt đầu ở connecting — đăng ký được KHÔNG có nghĩa là đang nghe được', async () => {
    const { container } = render(<Probe />);
    await waitFor(() => expect(subscribes).toBe(1));
    expect(container.textContent).toBe(REALTIME_STATE.CONNECTING);
  });

  it('nhận snapshot từ server → live', async () => {
    const { container } = render(<Probe />);
    await waitFor(() => expect(handlers).not.toBeNull());

    handlers!.live();
    await waitFor(() => expect(container.textContent).toBe(REALTIME_STATE.LIVE));
  });

  it('listener lỗi → chuyển error NGAY, không đợi hết một nhịp nào', async () => {
    const { container } = render(<Probe />);
    await waitFor(() => expect(handlers).not.toBeNull());

    handlers!.failed(new Error('permission-denied'));
    await waitFor(() => expect(container.textContent).toBe(REALTIME_STATE.ERROR));
  });

  it('lỗi rồi thử lại thành công → quay lại live', async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true });
    const { container } = render(<Probe />);
    await vi.waitFor(() => expect(handlers).not.toBeNull());

    handlers!.failed(new Error('permission-denied'));
    await vi.waitFor(() => expect(container.textContent).toBe(REALTIME_STATE.ERROR));

    // Backoff lần đầu ~1s (±25% jitter) — tiến đủ để chắc chắn đã tới hạn.
    await vi.advanceTimersByTimeAsync(2_000);
    await vi.waitFor(() => expect(subscribes).toBeGreaterThan(1));

    handlers!.live();
    await vi.waitFor(() => expect(container.textContent).toBe(REALTIME_STATE.LIVE));
  });

  it('đổi khoá: tháo listener cũ, và trạng thái live của khoá cũ KHÔNG rơi sang khoá mới', async () => {
    const view = render(<Probe subKey="k1" />);
    await waitFor(() => expect(handlers).not.toBeNull());
    handlers!.live();
    await waitFor(() => expect(view.container.textContent).toBe(REALTIME_STATE.LIVE));

    view.rerender(<Probe subKey="k2" />);

    expect(unsubscribes).toBe(1);
    expect(view.container.textContent).toBe(REALTIME_STATE.CONNECTING);
  });

  it('enabled=false: không đăng ký gì và trạng thái là disabled', async () => {
    const { container } = render(<Probe enabled={false} />);
    await new Promise((resolve) => setTimeout(resolve, 20));

    expect(subscribes).toBe(0);
    expect(container.textContent).toBe(REALTIME_STATE.DISABLED);
  });

  it('unmount thì huỷ đăng ký', async () => {
    const view = render(<Probe />);
    await waitFor(() => expect(subscribes).toBe(1));
    view.unmount();
    expect(unsubscribes).toBe(1);
  });
});

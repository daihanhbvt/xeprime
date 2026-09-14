import { act, renderHook } from '@testing-library/react-native';
import { AppState, type AppStateStatus } from 'react-native';
import { useAppActive, useRefetchOnForeground } from './use-app-active';

/**
 * Cửa `AppState` dùng chung.
 *
 * Hai thứ đáng khoá lại: MỘT đăng ký cho cả cây (mỗi hook tự gọi `addEventListener` thì màn chat
 * mở ra đã có bốn đăng ký cho cùng một sự kiện), và `useRefetchOnForeground` chỉ bắn ở CHUYỂN
 * TIẾP nền → tiền cảnh — gọi cả lúc dựng là nhân đôi request ngay khi mở màn.
 */
type Listener = (state: AppStateStatus) => void;

let listeners: Listener[] = [];
let removeCalls = 0;

function emit(state: AppStateStatus): void {
  // Sao chép trước khi duyệt: listener có thể tự gỡ mình trong lúc chạy.
  [...listeners].forEach((listener) => listener(state));
}

beforeEach(() => {
  listeners = [];
  removeCalls = 0;
  (AppState as { currentState: AppStateStatus }).currentState = 'active';

  jest.spyOn(AppState, 'addEventListener').mockImplementation(((
    _type: string,
    listener: Listener,
  ) => {
    listeners.push(listener);
    return {
      remove: () => {
        removeCalls += 1;
        listeners = listeners.filter((l) => l !== listener);
      },
    };
  }) as unknown as typeof AppState.addEventListener);
});

describe('useAppActive', () => {
  it('đọc trạng thái hiện tại lúc đăng ký', async () => {
    (AppState as { currentState: AppStateStatus }).currentState = 'background';
    const { result } = await renderHook(() => useAppActive());

    expect(result.current).toBe(false);
  });

  it('bám theo chuyển tiếp nền ↔ tiền cảnh', async () => {
    const { result } = await renderHook(() => useAppActive());
    expect(result.current).toBe(true);

    await act(async () => emit('background'));
    expect(result.current).toBe(false);

    await act(async () => emit('active'));
    expect(result.current).toBe(true);
  });

  it('MỘT đăng ký `AppState` cho nhiều người nghe', async () => {
    const first = await renderHook(() => useAppActive());
    const second = await renderHook(() => useAppActive());

    expect(listeners).toHaveLength(1);

    await act(async () => emit('background'));
    expect(first.result.current).toBe(false);
    expect(second.result.current).toBe(false);
  });

  it('gỡ đăng ký khi người nghe CUỐI CÙNG rời đi', async () => {
    const first = await renderHook(() => useAppActive());
    const second = await renderHook(() => useAppActive());

    await act(async () => first.unmount());
    expect(removeCalls).toBe(0);

    await act(async () => second.unmount());
    expect(removeCalls).toBe(1);
  });
});

describe('useRefetchOnForeground', () => {
  it('KHÔNG gọi ở lần dựng đầu — lượt tải đầu tiên đã có sẵn', async () => {
    const onForeground = jest.fn();
    await renderHook(() => useRefetchOnForeground(onForeground));

    expect(onForeground).not.toHaveBeenCalled();
  });

  it('gọi đúng MỘT lần ở mỗi lần quay lại tiền cảnh', async () => {
    const onForeground = jest.fn();
    await renderHook(() => useRefetchOnForeground(onForeground));

    await act(async () => emit('background'));
    expect(onForeground).not.toHaveBeenCalled();

    await act(async () => emit('active'));
    expect(onForeground).toHaveBeenCalledTimes(1);

    await act(async () => emit('background'));
    await act(async () => emit('active'));
    expect(onForeground).toHaveBeenCalledTimes(2);
  });

  /** `inactive` (kéo Control Center trên iOS) cũng là "không active" — quay lại vẫn phải làm mới. */
  it('coi `inactive` là rời tiền cảnh', async () => {
    const onForeground = jest.fn();
    await renderHook(() => useRefetchOnForeground(onForeground));

    await act(async () => emit('inactive'));
    await act(async () => emit('active'));

    expect(onForeground).toHaveBeenCalledTimes(1);
  });
});

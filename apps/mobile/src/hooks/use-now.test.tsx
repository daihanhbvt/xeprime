import { act, renderHook } from '@testing-library/react-native';
import { useNow } from './use-now';

// `useFocusEffect` chạy callback ngay khi mount và cleanup khi unmount — đủ để mô phỏng
// "màn đang focus" mà không cần dựng navigator.
jest.mock('expo-router', () => ({
  useFocusEffect: (effect: () => void | (() => void)) => {
    const { useEffect } = jest.requireActual<typeof import('react')>('react');
    useEffect(effect, [effect]);
  },
}));

// Không dùng `jest.getTimerCount()`: React Native tự đặt timer nội bộ, con số đó không phải của hook.
// Spy đặt SAU `useFakeTimers` — fake timers thay hàm toàn cục, spy đặt trước sẽ bọc hàm thật.
let setIntervalSpy: jest.SpyInstance;
let clearIntervalSpy: jest.SpyInstance;

describe('useNow', () => {
  beforeEach(() => {
    jest.useFakeTimers();
    jest.setSystemTime(new Date('2026-09-04T10:00:00Z'));
    setIntervalSpy = jest.spyOn(global, 'setInterval');
    clearIntervalSpy = jest.spyOn(global, 'clearInterval');
  });

  afterEach(() => {
    setIntervalSpy.mockRestore();
    clearIntervalSpy.mockRestore();
    jest.useRealTimers();
  });

  it('nhiều người đăng ký dùng chung MỘT timer và cùng nhận một nhịp', async () => {
    const first = await renderHook(() => useNow());
    const second = await renderHook(() => useNow());

    expect(first.result.current).toBe(second.result.current);
    expect(setIntervalSpy).toHaveBeenCalledTimes(1);

    await act(async () => {
      jest.advanceTimersByTime(1000);
    });

    expect(first.result.current).toBe(Date.now());
    expect(second.result.current).toBe(first.result.current);

    await act(async () => {
      first.unmount();
      second.unmount();
    });
  });

  it('người đăng ký cuối rời đi thì timer dừng', async () => {
    const first = await renderHook(() => useNow());
    const second = await renderHook(() => useNow());

    await act(async () => {
      first.unmount();
    });
    expect(clearIntervalSpy).not.toHaveBeenCalled();

    await act(async () => {
      second.unmount();
    });
    expect(clearIntervalSpy).toHaveBeenCalledTimes(1);
  });

  it('`enabled = false` không đăng ký và không tick', async () => {
    const hook = await renderHook(() => useNow(false));
    const frozen = hook.result.current;

    expect(setIntervalSpy).not.toHaveBeenCalled();

    await act(async () => {
      jest.advanceTimersByTime(3000);
    });

    expect(hook.result.current).toBe(frozen);
  });

  it('đăng ký lại sau một quãng im lặng đọc giờ HIỆN TẠI, không phải nhịp cuối', async () => {
    const first = await renderHook(() => useNow());
    await act(async () => {
      first.unmount();
    });

    await act(async () => {
      jest.advanceTimersByTime(60_000);
    });

    const second = await renderHook(() => useNow());
    expect(second.result.current).toBe(Date.now());

    await act(async () => {
      second.unmount();
    });
  });
});

import { act, renderHook } from '@testing-library/react-native';
import { useAppActive } from '@/hooks/use-app-active';
import { useOnBadgeChange } from './use-on-badge-change';

/**
 * Cầu nối giữa bản chiếu huy hiệu (chỉ mang CON SỐ) và những query hiển thị chi tiết đứng sau nó.
 *
 * Ba luật, và cả ba đều để KHÔNG gọi API khi không ai được lợi. Sai một luật là một request thừa
 * ở mọi màn, mỗi lần — thứ không làm test nào đỏ và không ai nhận ra cho tới khi nhìn log mạng.
 */
jest.mock('@/hooks/use-app-active', () => ({
  useAppActive: jest.fn(() => true),
}));

const appActive = useAppActive as jest.MockedFunction<typeof useAppActive>;

beforeEach(() => {
  appActive.mockReturnValue(true);
});

describe('useOnBadgeChange', () => {
  /** Lúc mount, query đứng sau đã tự tải rồi — gọi thêm là tự sinh một request thừa ở mọi màn. */
  it('BỎ QUA lần chạy đầu', async () => {
    const onChange = jest.fn();
    await renderHook(({ value }: { value: number }) => useOnBadgeChange(value, onChange), {
      initialProps: { value: 3 },
    });

    expect(onChange).not.toHaveBeenCalled();
  });

  it('con số ĐỔI thì chạy', async () => {
    const onChange = jest.fn();
    const view = await renderHook(
      ({ value }: { value: number }) => useOnBadgeChange(value, onChange),
      { initialProps: { value: 3 } },
    );

    await act(async () => view.rerender({ value: 4 }));
    expect(onChange).toHaveBeenCalledTimes(1);
  });

  it('render lại với CÙNG con số thì KHÔNG chạy', async () => {
    const onChange = jest.fn();
    const view = await renderHook(
      ({ value }: { value: number }) => useOnBadgeChange(value, onChange),
      { initialProps: { value: 3 } },
    );

    await act(async () => view.rerender({ value: 3 }));
    await act(async () => view.rerender({ value: 3 }));
    expect(onChange).not.toHaveBeenCalled();
  });

  /**
   * Luật 3: chỉ CON SỐ mới kích hoạt, không phải danh tính của `onChange`.
   *
   * Nếu sai thì mọi nơi gọi đều phải bọc `useCallback` — và chỗ nào quên sẽ nạp lại danh sách
   * sau MỌI lần render.
   */
  it('đổi danh tính `onChange` KHÔNG kích hoạt', async () => {
    const first = jest.fn();
    const second = jest.fn();
    const view = await renderHook(
      ({ handler }: { handler: () => void }) => useOnBadgeChange(3, handler),
      { initialProps: { handler: first } },
    );

    await act(async () => view.rerender({ handler: second }));
    expect(first).not.toHaveBeenCalled();
    expect(second).not.toHaveBeenCalled();
  });

  /**
   * Luật 2 — và đây là chỗ bản native KHÁC web.
   *
   * Web hoãn theo `document.visibilityState`; app native theo `AppState`. Listener Firestore vẫn
   * sống khi app xuống nền, nên mỗi sự kiện sẽ kéo một lượt tải cho màn không ai nhìn — pin và
   * dữ liệu di động tiêu cho không.
   */
  it('app Ở NỀN thì HOÃN, và trả nợ đúng một lượt khi quay lại', async () => {
    const onChange = jest.fn();
    appActive.mockReturnValue(false);

    const view = await renderHook(
      ({ value }: { value: number }) => useOnBadgeChange(value, onChange),
      { initialProps: { value: 3 } },
    );

    await act(async () => view.rerender({ value: 4 }));
    expect(onChange).not.toHaveBeenCalled();

    appActive.mockReturnValue(true);
    await act(async () => view.rerender({ value: 4 }));
    expect(onChange).toHaveBeenCalledTimes(1);

    // Đã trả nợ rồi thì lần render kế tiếp không được trả thêm lần nữa.
    await act(async () => view.rerender({ value: 4 }));
    expect(onChange).toHaveBeenCalledTimes(1);
  });

  /** Ở nền mà con số KHÔNG đổi thì không có nợ nào để trả. */
  it('quay lại tiền cảnh mà không có gì đổi thì KHÔNG chạy', async () => {
    const onChange = jest.fn();
    appActive.mockReturnValue(false);

    const view = await renderHook(
      ({ value }: { value: number }) => useOnBadgeChange(value, onChange),
      { initialProps: { value: 3 } },
    );

    appActive.mockReturnValue(true);
    await act(async () => view.rerender({ value: 3 }));
    expect(onChange).not.toHaveBeenCalled();
  });

  it('null → con số ĐẦU TIÊN biết được là mốc, không phải thay đổi', async () => {
    // Lúc mở app con số là "chưa biết"; lượt REST đầu tiên của người còn 3 thông báo chưa đọc
    // không được coi là 0 → 3 và tải lại mọi danh sách vừa tải xong.
    const onChange = jest.fn();
    const view = await renderHook(
      ({ value }: { value: number | null }) => useOnBadgeChange(value, onChange),
      { initialProps: { value: null as number | null } },
    );

    await act(async () => view.rerender({ value: 3 }));
    expect(onChange).not.toHaveBeenCalled();

    await act(async () => view.rerender({ value: 4 }));
    expect(onChange).toHaveBeenCalledTimes(1);
  });

  it('về null (đăng xuất) rồi có con số mới: tài khoản sau lập mốc riêng', async () => {
    const onChange = jest.fn();
    const view = await renderHook(
      ({ value }: { value: number | null }) => useOnBadgeChange(value, onChange),
      { initialProps: { value: 2 as number | null } },
    );

    await act(async () => view.rerender({ value: null }));
    await act(async () => view.rerender({ value: 9 }));
    expect(onChange).not.toHaveBeenCalled();
  });

  it('nợ lúc ở nền KHÔNG được trả cho tài khoản sau khi về null', async () => {
    const onChange = jest.fn();
    appActive.mockReturnValue(false);
    const view = await renderHook(
      ({ value }: { value: number | null }) => useOnBadgeChange(value, onChange),
      { initialProps: { value: 2 as number | null } },
    );
    await act(async () => view.rerender({ value: 3 }));
    await act(async () => view.rerender({ value: null }));

    appActive.mockReturnValue(true);
    await act(async () => view.rerender({ value: null }));
    expect(onChange).not.toHaveBeenCalled();
  });
});

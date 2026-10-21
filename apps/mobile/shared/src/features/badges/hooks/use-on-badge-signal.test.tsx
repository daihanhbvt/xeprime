import { act, renderHook } from '@testing-library/react-native';
import type { UserBadgeCounts } from '@xeprime/types';
import { useBadgeRealtime } from '../BadgeRealtimeProvider';
import { useOnBadgeSignal } from './use-on-badge-signal';

/**
 * `useOnBadgeSignal` là chỗ DUY NHẤT giữ luật "chưa biết con số thì không lập mốc" cho các hook
 * đọc từ provider. Khoá đúng lỗi bootstrap: 0 hiển thị tạm → N từ lượt REST đầu tiên không được
 * tính là một thay đổi.
 */
jest.mock('../BadgeRealtimeProvider', () => ({ useBadgeRealtime: jest.fn() }));
jest.mock('@/hooks/use-app-active', () => ({ useAppActive: jest.fn(() => true) }));

const realtime = useBadgeRealtime as jest.MockedFunction<typeof useBadgeRealtime>;

function state(notificationsUnread: number, known: boolean) {
  const counts: UserBadgeCounts = { chatCustomer: 0, chatShop: 0, notificationsUnread };
  realtime.mockReturnValue({ counts, known, live: false });
}

describe('useOnBadgeSignal', () => {
  it('con số đầu tiên BIẾT ĐƯỢC là mốc; chỉ thay đổi sau đó mới kích hoạt', async () => {
    const onChange = jest.fn();
    state(0, false);
    const view = await renderHook(() =>
      useOnBadgeSignal((counts) => counts.notificationsUnread, onChange),
    );

    state(3, true);
    await act(async () => view.rerender(undefined));
    expect(onChange).not.toHaveBeenCalled();

    state(4, true);
    await act(async () => view.rerender(undefined));
    expect(onChange).toHaveBeenCalledTimes(1);
  });
});

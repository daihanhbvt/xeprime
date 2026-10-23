import { cleanup, render } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { UserBadgeCounts } from '@xeprime/types';

/**
 * `useOnBadgeSignal` là chỗ DUY NHẤT giữ luật "chưa biết con số thì không lập mốc" cho các hook
 * đọc từ provider. Khoá đúng lỗi bootstrap: 0 hiển thị tạm → N từ lượt REST đầu tiên không được
 * tính là một thay đổi.
 */
const badges = vi.hoisted(() => ({
  counts: { chatCustomer: 0, chatShop: 0, notificationsUnread: 0 } as UserBadgeCounts,
  known: false,
  live: false,
}));
vi.mock('../BadgeRealtimeProvider', () => ({ useBadgeRealtime: () => badges }));

import { useOnBadgeSignal } from './use-on-badge-signal';

function Probe({ onChange }: { onChange: () => void }) {
  useOnBadgeSignal((counts) => counts.notificationsUnread, onChange);
  return null;
}

afterEach(cleanup);

describe('useOnBadgeSignal', () => {
  it('con số đầu tiên BIẾT ĐƯỢC là mốc; chỉ thay đổi sau đó mới kích hoạt', () => {
    const onChange = vi.fn();
    badges.known = false;
    badges.counts = { chatCustomer: 0, chatShop: 0, notificationsUnread: 0 };
    const view = render(<Probe onChange={onChange} />);

    badges.known = true;
    badges.counts = { ...badges.counts, notificationsUnread: 3 };
    view.rerender(<Probe onChange={onChange} />);
    expect(onChange).not.toHaveBeenCalled();

    badges.counts = { ...badges.counts, notificationsUnread: 4 };
    view.rerender(<Probe onChange={onChange} />);
    expect(onChange).toHaveBeenCalledTimes(1);
  });
});

import { App } from 'antd';
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { PERMISSION } from '@xeprime/types';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import type { FollowUp } from '../types';
import { FollowUpDrawer } from './FollowUpDrawer';

/**
 * Panel chăm sóc khách mất đơn (ADR 0070). Khoá lại đúng những lỗi người dùng đã gặp:
 *  - "Đã gọi cho khách" là TRẠNG THÁI — mở lại khách đã gọi thì ô vẫn tích, lưu gửi đúng giá trị;
 *  - lưu xong panel KHÔNG nhảy sang khách khác (nơi gọi nhận bản ghi mới qua `onSaved`);
 *  - người chỉ có quyền xem thấy panel chỉ đọc, không có nút Lưu.
 */
const update = vi.hoisted(() => ({ isPending: false, mutate: vi.fn() }));
const reveal = vi.hoisted(() => ({
  data: undefined as unknown,
  isPending: false,
  mutate: vi.fn(),
}));
const perms = vi.hoisted(() => ({ granted: [] as string[] }));

vi.mock('../hooks/use-follow-ups', () => ({
  useUpdateFollowUp: () => update,
  useFollowUpAssignees: () => ({
    isPending: false,
    data: [
      {
        id: 'OTHER000000000000000000000',
        displayName: 'Hỗ trợ B',
        email: null,
        roleKey: 'support',
      },
      {
        id: 'ME00000000000000000000000A',
        displayName: 'Sale A',
        email: null,
        roleKey: 'platform_admin',
      },
    ],
  }),
  useRevealFollowUpContact: () => reveal,
}));
vi.mock('@/hooks/use-permissions', () => ({
  usePermissions: () => ({
    has: (p: string) => perms.granted.includes(p),
    hasAny: (...p: string[]) => p.some((x) => perms.granted.includes(x)),
    isLoading: false,
  }),
}));
vi.mock('@/hooks/use-current-user', () => ({
  useCurrentUser: () => ({ data: { id: 'ME00000000000000000000000A', displayName: 'Sale A' } }),
}));
vi.mock('@/hooks/use-media-query', () => ({
  useIsMobile: () => false,
  useMediaQuery: () => false,
}));

const BASE: FollowUp = {
  id: 'REQ0000000000000000000000A',
  lostReason: 'unpaid',
  requestStatus: 'hold_expired',
  serviceType: 'self_drive',
  customerName: 'Khách Thử',
  customerPhoneMasked: '091****678',
  customerUserId: null,
  tenantId: 'T1',
  tenantName: 'Gian hàng A',
  vehicleName: 'Toyota Vios',
  bookingCode: null,
  pickupAt: '2026-11-01T03:00:00.000Z',
  returnAt: '2026-11-03T03:00:00.000Z',
  requestedAt: '2026-10-20T03:00:00.000Z',
  closedAt: '2026-10-20T05:00:00.000Z',
  cancellation: null,
  rebookedLater: false,
  followUpStatus: 'new',
  note: null,
  assigneeUserId: null,
  assigneeName: null,
  lastContactedAt: null,
  followUpUpdatedAt: null,
  followUpUpdatedByName: null,
} as FollowUp;

function renderDrawer(item: FollowUp | null, onSaved = vi.fn()) {
  render(
    <App>
      <FollowUpDrawer
        item={item}
        previousId={null}
        nextId="REQ0000000000000000000000B"
        onNavigate={vi.fn()}
        onClose={vi.fn()}
        onSaved={onSaved}
      />
    </App>,
  );
  return { onSaved };
}

const contactedBox = () =>
  screen.getByRole('checkbox', { name: /Đã gọi cho khách/ }) as HTMLInputElement;

beforeEach(() => {
  perms.granted = [PERMISSION.PLATFORM_BOOKING_VIEW, PERMISSION.PLATFORM_SALES_FOLLOWUP_MANAGE];
  update.isPending = false;
  update.mutate.mockReset();
  reveal.mutate.mockReset();
});
afterEach(cleanup);

describe('FollowUpDrawer', () => {
  it('khách chưa gọi: ô trống, báo chưa ghi lần liên hệ nào', () => {
    renderDrawer(BASE);
    expect(contactedBox().checked).toBe(false);
    expect(screen.getByText('Chưa ghi lần liên hệ nào')).toBeTruthy();
  });

  it('mở lại khách ĐÃ gọi: ô vẫn tích và hiện mốc liên hệ', () => {
    renderDrawer({
      ...BASE,
      followUpStatus: 'contacted',
      lastContactedAt: '2026-10-22T05:10:00.000Z',
    });
    expect(contactedBox().checked).toBe(true);
    expect(screen.getByText(/^Liên hệ gần nhất:/)).toBeTruthy();
  });

  it('tích rồi lưu: gửi markContacted=true; lưu xong báo về nơi gọi bản ghi mới, không tự sang khách khác', async () => {
    const saved = { ...BASE, lastContactedAt: '2026-10-22T05:10:00.000Z' } as FollowUp;
    update.mutate.mockImplementation((_vars, opts: { onSuccess: (v: FollowUp) => void }) =>
      opts.onSuccess(saved),
    );
    const { onSaved } = renderDrawer(BASE);

    fireEvent.click(contactedBox());
    fireEvent.click(screen.getByRole('button', { name: 'Lưu' }));

    await waitFor(() => expect(update.mutate).toHaveBeenCalledTimes(1));
    expect(update.mutate.mock.calls[0]![0]).toEqual({
      id: BASE.id,
      body: { status: 'new', note: null, assigneeUserId: null, markContacted: true },
    });
    expect(onSaved).toHaveBeenCalledWith(saved);
    // Form nhận lại giá trị server vừa lưu — ô vẫn tích.
    expect(contactedBox().checked).toBe(true);
  });

  it('bỏ tích khách đã gọi rồi lưu: gửi markContacted=false', async () => {
    renderDrawer({ ...BASE, lastContactedAt: '2026-10-22T05:10:00.000Z' });
    fireEvent.click(contactedBox());
    fireEvent.click(screen.getByRole('button', { name: 'Lưu' }));
    await waitFor(() => expect(update.mutate).toHaveBeenCalledTimes(1));
    expect(update.mutate.mock.calls[0]![0].body.markContacted).toBe(false);
  });

  it('chọn phụ trách: "tôi" đứng đầu, giao cho người khác rồi lưu gửi đúng id', async () => {
    renderDrawer(BASE);
    fireEvent.mouseDown(screen.getByRole('combobox', { name: 'Phụ trách' }));
    // Danh sách hiển thị của AntD (role=option chỉ là bản cho trình đọc màn hình, mang value).
    await screen.findByTitle('Sale A (tôi) · Super Admin');
    const shown = document.querySelectorAll('.ant-select-item-option-content');
    expect(shown[0]!.textContent).toBe('Sale A (tôi) · Super Admin');
    fireEvent.click(screen.getByTitle('Hỗ trợ B · Nhân viên hỗ trợ'));
    fireEvent.click(screen.getByRole('button', { name: 'Lưu' }));
    await waitFor(() => expect(update.mutate).toHaveBeenCalledTimes(1));
    expect(update.mutate.mock.calls[0]![0].body.assigneeUserId).toBe('OTHER000000000000000000000');
  });

  it('liên hệ: chưa hiện số thì chỉ có nút hiện số; hiện xong có Gọi (tel:) và Zalo (zalo.me, tab mới)', () => {
    perms.granted.push(PERMISSION.PLATFORM_CUSTOMER_PII_VIEW);
    renderDrawer(BASE);
    expect(screen.queryByRole('link', { name: /Gọi/ })).toBeNull();
    fireEvent.click(screen.getByRole('button', { name: /Hiện số để gọi/ }));
    expect(reveal.mutate).toHaveBeenCalledTimes(1);
    cleanup();

    reveal.data = { id: BASE.id, customerPhone: '84912345678', customerEmail: null };
    renderDrawer(BASE);
    expect(screen.getByRole('link', { name: /Gọi/ }).getAttribute('href')).toBe('tel:0912345678');
    const zalo = screen.getByRole('link', { name: /Zalo/ });
    expect(zalo.getAttribute('href')).toBe('https://zalo.me/0912345678');
    expect(zalo.getAttribute('target')).toBe('_blank');
    reveal.data = undefined;
  });

  it('chỉ có quyền xem: panel chỉ đọc, không có nút Lưu', () => {
    perms.granted = [PERMISSION.PLATFORM_BOOKING_VIEW];
    renderDrawer({ ...BASE, note: 'Đã hẹn gọi lại' });
    expect(screen.queryByRole('button', { name: 'Lưu' })).toBeNull();
    expect(screen.getByText('Bạn chỉ có quyền xem mục này.')).toBeTruthy();
    expect(screen.getByText('Đã hẹn gọi lại')).toBeTruthy();
  });
});

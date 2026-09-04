import { App } from 'antd';
import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { INVITE_STATUS, PERMISSION, type Permission } from '@xeprime/types';

import type { Invite } from '../types';
import { PendingInvitesPanel } from './PendingInvitesPanel';

/**
 * Bảng lời mời đang chờ.
 *
 * Ba điều được khoá lại:
 *  1. **Không có lời mời nào ⇒ không dựng bảng.** Một bảng rỗng cố định dưới màn nhân sự là nhiễu.
 *  2. **Nhưng LỖI TẢI thì phải hiện.** Im lặng lúc đó là nói dối rằng không ai đang chờ.
 *  3. **Thu hồi phải xác nhận**, và chỉ hiện cho người có `members.invite` + gói còn ghi được —
 *     đây là thao tác vô hiệu hoá một liên kết đã gửi ra ngoài.
 */
const query = vi.hoisted(() => ({
  data: undefined as { items: unknown[]; meta: unknown } | undefined,
  isError: false,
  isFetching: false,
  refetch: vi.fn(),
}));

vi.mock('../hooks/use-invites', () => ({
  useInvites: () => query,
}));

const revoke = vi.hoisted(() => ({ mutate: vi.fn(), isPending: false, variables: undefined }));

vi.mock('../hooks/use-member-mutations', () => ({
  useRevokeInvite: () => revoke,
}));

const perms = vi.hoisted(() => ({ granted: new Set<string>() }));

vi.mock('@/hooks/use-permissions', () => ({
  usePermissions: () => ({
    has: (p: string) => perms.granted.has(p),
    hasAny: (...ps: string[]) => ps.some((p) => perms.granted.has(p)),
    isLoading: false,
  }),
}));

const feature = vi.hoisted(() => ({ canWrite: true }));

vi.mock('@/hooks/use-feature', () => ({
  useFeature: () => ({
    state: 'enabled',
    canWrite: feature.canWrite,
    isVisible: true,
    planEndsAt: null,
  }),
  useFeatureStates: () => ({}),
  usePlanEndsAt: () => null,
}));

vi.mock('@/hooks/use-media-query', () => ({
  useIsMobile: () => false,
  useIsTablet: () => false,
  useIsDesktop: () => true,
  useMediaQuery: () => false,
}));

function invite(over: Partial<Invite> = {}): Invite {
  return {
    id: 'inv-1',
    email: 'nhanvien@congty.vn',
    roleKey: 'shop_staff',
    status: INVITE_STATUS.PENDING,
    expiresAt: '2026-09-10T10:00:00.000Z',
    createdAt: '2026-09-03T10:00:00.000Z',
    createdByName: 'Chủ shop',
    ...over,
  } as Invite;
}

const META = { page: 1, limit: 20, total: 1, hasNext: false };

function renderWith(items: Invite[] | null, over: Partial<typeof query> = {}) {
  query.data = items ? { items, meta: META } : undefined;
  query.isError = false;
  query.isFetching = false;
  Object.assign(query, over);
  return render(
    <App>
      <PendingInvitesPanel />
    </App>,
  );
}

function grant(...permissions: Permission[]) {
  perms.granted = new Set<string>(permissions);
}

function bodyRows(): HTMLElement[] {
  return screen
    .getAllByRole('row')
    .filter((row) => within(row).queryAllByRole('columnheader').length === 0);
}

beforeEach(() => {
  revoke.mutate.mockReset();
  query.refetch.mockReset();
  feature.canWrite = true;
  grant();
});

afterEach(cleanup);

describe('Bảng lời mời đang chờ', () => {
  it('không có lời mời nào: KHÔNG dựng bảng', () => {
    const { container } = renderWith([]);
    expect(container.textContent).toBe('');
  });

  it('lỗi tải: vẫn hiện, kèm lối thử lại', () => {
    renderWith(null, { isError: true });

    expect(screen.getByText('Không tải được danh sách lời mời')).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: 'Thử lại' }));
    expect(query.refetch).toHaveBeenCalledTimes(1);
  });

  it('hiện email, vai trò và người mời', () => {
    renderWith([invite()]);

    expect(screen.getByText('nhanvien@congty.vn')).toBeTruthy();
    expect(screen.getByText('Nhân viên gian hàng')).toBeTruthy();
    expect(screen.getByText('Chủ shop')).toBeTruthy();
  });

  it('KHÔNG có quyền mời: không có nút thu hồi', () => {
    renderWith([invite()]);
    expect(within(bodyRows()[0]!).queryAllByRole('button')).toHaveLength(0);
  });

  /** Gói hết hạn = chỉ đọc (ADR 0027 điều 3): xem được lời mời cũ, không thu hồi được. */
  it('gói hết hạn: xem được nhưng KHÔNG thu hồi được', () => {
    grant(PERMISSION.MEMBER_INVITE);
    feature.canWrite = false;
    renderWith([invite()]);

    expect(screen.getByText('nhanvien@congty.vn')).toBeTruthy();
    expect(within(bodyRows()[0]!).queryAllByRole('button')).toHaveLength(0);
  });

  it('có quyền: thu hồi phải xác nhận rồi mới gọi mutation với đúng id', async () => {
    grant(PERMISSION.MEMBER_INVITE);
    renderWith([invite({ id: 'inv-42' })]);

    fireEvent.click(within(bodyRows()[0]!).getAllByRole('button')[0]!);
    expect(revoke.mutate).not.toHaveBeenCalled();

    const confirmTitle = await screen.findByText(
      /Thu hồi lời mời này\? Liên kết trong email sẽ hết giá trị ngay\./,
    );

    /*
     * Nút trên DÒNG và nút OK của popconfirm mang cùng nhãn "Thu hồi" — đó là đúng về mặt sản
     * phẩm (cùng một hành động, gọi tên như nhau), nên test phải thu hẹp phạm vi thay vì bắt
     * giao diện đổi chữ cho vừa selector.
     */
    const popup = confirmTitle.closest('.ant-popover')!;
    fireEvent.click(within(popup as HTMLElement).getByRole('button', { name: 'Thu hồi' }));

    await waitFor(() => expect(revoke.mutate).toHaveBeenCalledTimes(1));
    expect(revoke.mutate.mock.calls[0]![0]).toBe('inv-42');
  });
});

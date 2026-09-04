import { App } from 'antd';
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { INVITE_STATUS } from '@xeprime/types';

import type { InvitePreview } from '../types';
import { InviteAnswerCard } from './InviteAnswerCard';

/**
 * Màn người ĐƯỢC MỜI nhìn thấy.
 *
 * Bốn tình huống, và mỗi tình huống phải có một lối đi tiếp — đây là trang mà người dùng đến từ
 * một email, thường chưa có tài khoản, và không có menu nào để tự xoay xở:
 *
 *  1. chưa đăng nhập → xem được nội dung, nút dẫn sang đăng nhập kèm đường quay lại;
 *  2. đã đăng nhập → hai nút trả lời, và TỪ CHỐI phải hỏi lại;
 *  3. lời mời đã đóng → không nút nào, nói thật là hết hiệu lực;
 *  4. token hỏng → màn lỗi có lối về, không phải trang trắng.
 */
const preview = vi.hoisted(() => ({
  data: undefined as unknown,
  isLoading: false,
  isError: false,
  error: null as unknown,
}));

const accept = vi.hoisted(() => ({ mutate: vi.fn(), isPending: false }));
const decline = vi.hoisted(() => ({ mutate: vi.fn(), isPending: false }));

vi.mock('../hooks/use-invites', () => ({
  useInvitePreview: () => preview,
  useAnswerInvite: () => ({ accept, decline }),
}));

const user = vi.hoisted(() => ({ data: undefined as unknown }));

vi.mock('@/hooks/use-current-user', () => ({
  useCurrentUser: () => ({ data: user.data, isLoading: false }),
}));

const authOpen = vi.hoisted(() => vi.fn());

vi.mock('@/features/auth/components/AuthModalProvider', () => ({
  useAuthModal: () => ({ open: authOpen }),
  useNextFromCurrentPath: () => () => '/invites/tok-1',
}));

vi.mock('@/hooks/use-media-query', () => ({
  useIsMobile: () => false,
  useIsTablet: () => false,
  useIsDesktop: () => true,
  useMediaQuery: () => false,
}));

function makePreview(over: Partial<InvitePreview> = {}): InvitePreview {
  return {
    status: INVITE_STATUS.PENDING,
    tenantName: 'Shop Mời',
    roleKey: 'shop_staff',
    invitedByName: 'Chủ shop',
    invitedEmailMasked: 'nh****@congty.vn',
    expiresAt: '2026-09-10T10:00:00.000Z',
    ...over,
  } as InvitePreview;
}

function renderCard() {
  return render(
    <App>
      <InviteAnswerCard token="tok-1" />
    </App>,
  );
}

beforeEach(() => {
  preview.data = makePreview();
  preview.isLoading = false;
  preview.isError = false;
  preview.error = null;
  accept.mutate.mockReset();
  accept.isPending = false;
  decline.mutate.mockReset();
  decline.isPending = false;
  authOpen.mockReset();
  user.data = { id: 'u1' };
});

afterEach(cleanup);

describe('Lời mời — người được mời xem', () => {
  it('nói ai mời, vai gì, và KHÔNG lộ nguyên email', () => {
    renderCard();

    expect(screen.getByText(/Shop Mời mời bạn tham gia/)).toBeTruthy();
    expect(screen.getByText('Nhân viên gian hàng')).toBeTruthy();
    expect(screen.getByText('nh****@congty.vn')).toBeTruthy();
  });

  it('chưa đăng nhập: không có nút trả lời, chỉ có lối đăng nhập quay lại đúng trang', () => {
    user.data = undefined;
    renderCard();

    expect(screen.queryByRole('button', { name: 'Đồng ý tham gia' })).toBeNull();
    expect(screen.getByText(/Đăng nhập bằng địa chỉ email đã nhận thư mời/)).toBeTruthy();

    fireEvent.click(screen.getByRole('button', { name: 'Đăng nhập' }));
    expect(authOpen).toHaveBeenCalledWith({ next: '/invites/tok-1' });
  });

  it('đã đăng nhập: đồng ý gọi mutation ngay', async () => {
    renderCard();

    fireEvent.click(screen.getByRole('button', { name: 'Đồng ý tham gia' }));
    await waitFor(() => expect(accept.mutate).toHaveBeenCalledTimes(1));
    expect(decline.mutate).not.toHaveBeenCalled();
  });

  it('từ chối phải hỏi lại trước khi gọi mutation', async () => {
    renderCard();

    fireEvent.click(screen.getByRole('button', { name: 'Từ chối' }));
    expect(decline.mutate).not.toHaveBeenCalled();

    // AntD dựng tiêu đề modal ở HAI nút DOM (`ant-modal-title` + `ant-modal-confirm-title`),
    // nên `findAllBy*` chứ không `findBy*`.
    expect(await screen.findAllByText(/Từ chối lời mời này\?/)).not.toHaveLength(0);
  });

  it('nhận xong: báo đã vào gian hàng và mở lối sang cổng quản lý', async () => {
    renderCard();

    fireEvent.click(screen.getByRole('button', { name: 'Đồng ý tham gia' }));
    await waitFor(() => expect(accept.mutate).toHaveBeenCalled());
    accept.mutate.mock.calls[0]![1].onSuccess();

    expect(await screen.findByText('Bạn đã tham gia Shop Mời.')).toBeTruthy();
    expect(screen.getByRole('link', { name: /Vào cổng quản lý/ })).toBeTruthy();
  });

  it.each([INVITE_STATUS.ACCEPTED, INVITE_STATUS.REVOKED, INVITE_STATUS.EXPIRED])(
    'lời mời ở trạng thái %s: KHÔNG có nút trả lời nào',
    (status) => {
      preview.data = makePreview({ status });
      renderCard();

      expect(screen.getByText('Lời mời này không còn hiệu lực')).toBeTruthy();
      expect(screen.queryByRole('button', { name: 'Đồng ý tham gia' })).toBeNull();
      expect(screen.queryByRole('button', { name: 'Từ chối' })).toBeNull();
    },
  );

  it('token hỏng: màn lỗi có lối về, không phải trang trắng', () => {
    preview.data = undefined;
    preview.isError = true;
    renderCard();

    expect(screen.getByText('Không mở được lời mời này')).toBeTruthy();
    expect(screen.getByRole('link', { name: /Về trang chủ/ })).toBeTruthy();
  });
});

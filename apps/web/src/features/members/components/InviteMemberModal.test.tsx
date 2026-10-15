import { App } from 'antd';
import { cleanup, fireEvent, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { renderWithIntl } from '@/i18n/test-utils';
import { InviteMemberModal } from './InviteMemberModal';

/**
 * Hộp thoại TẠO LỜI MỜI (đổi tên từ `AddMemberModal` ngày 03/09/2026 cùng lúc endpoint
 * `POST /members` bị gỡ; đổi sang mời bằng SĐT ở ADR 0060).
 *
 * Bộ này khoá ba điều:
 * - hộp thoại nói rõ người được mời CHƯA vào gian hàng — người bấm tạo mà tưởng đã thêm xong sẽ
 *   đi tìm họ trong bảng thành viên và báo là lỗi;
 * - mời bằng SỐ ĐIỆN THOẠI (định danh đăng nhập của site partner), không phải email;
 * - tạo xong KHÔNG đóng: liên kết mời chỉ có ở phản hồi tạo, đóng là mất — người mời sao chép
 *   rồi mới bấm "Xong".
 */
const mutation = vi.hoisted(() => ({
  mutate: vi.fn(),
  isPending: false,
}));

vi.mock('../hooks/use-member-mutations', () => ({
  useCreateInvite: () => mutation,
}));

// Ô chi nhánh phụ trách (ADR 0052) hỏi danh sách chi nhánh — trả rỗng để modal ẩn ô đó,
// các test sẵn có không phải biết gì về nó.
vi.mock('@/features/branches/hooks/use-branches', () => ({
  useBranches: () => ({ data: { items: [] }, isLoading: false }),
}));

// Người mời mặc định ở phạm vi `all` (chủ shop) — ca bị giới hạn có test riêng ở MemberBranchScopeSelect.
vi.mock('@/hooks/use-current-user', () => ({
  useCurrentUser: () => ({ data: { tenant: { branchScope: 'all' } } }),
}));
vi.mock('@/hooks/use-media-query', () => ({
  useIsMobile: () => false,
  useMediaQuery: () => false,
}));

const INVITE_URL = 'https://partner.xeprime.test/invites/tok_abc';

function renderModal(props: Partial<{ open: boolean; onClose: () => void }> = {}) {
  const onClose = props.onClose ?? vi.fn();
  const utils = renderWithIntl(
    <App>
      <InviteMemberModal open={props.open ?? true} onClose={onClose} />
    </App>,
  );
  return { ...utils, onClose };
}

function fillForm(phone = '0901234567') {
  fireEvent.change(screen.getByLabelText('Số điện thoại'), { target: { value: phone } });
}

/** Điền, bấm tạo, rồi cho server trả lời mời vừa tạo. */
async function createInvite() {
  fillForm();
  fireEvent.click(screen.getByRole('button', { name: 'Tạo lời mời' }));
  await waitFor(() => expect(mutation.mutate).toHaveBeenCalledTimes(1));
  mutation.mutate.mock.calls[0]![1].onSuccess({
    id: 'inv_1',
    phone: '0901234567',
    email: null,
    roleKey: 'shop_staff',
    inviteUrl: INVITE_URL,
  });
}

beforeEach(() => {
  mutation.mutate.mockReset();
  mutation.isPending = false;
});

afterEach(cleanup);

describe('InviteMemberModal', () => {
  it('tiêu đề nói MỜI, không phải THÊM', () => {
    renderModal();
    expect(screen.getByText('Mời thành viên')).toBeTruthy();
    expect(screen.queryByText('Thêm thành viên')).toBeNull();
  });

  it('nói rõ người được mời chưa vào gian hàng cho tới khi họ đồng ý', () => {
    renderModal();
    expect(screen.getByText(/chỉ vào gian hàng sau khi họ tự bấm đồng ý/)).toBeTruthy();
  });

  it('mời bằng số điện thoại, không còn ô email', () => {
    renderModal();
    expect(screen.getByLabelText('Số điện thoại')).toBeTruthy();
    expect(screen.queryByLabelText('Email')).toBeNull();
  });

  it('vai trò mặc định là shop_staff', () => {
    renderModal();
    // Giá trị mặc định hiển thị trên Select.
    expect(screen.getByText('Nhân viên gian hàng')).toBeTruthy();
  });

  it('số điện thoại rỗng thì không gọi mutation', async () => {
    renderModal();
    fireEvent.click(screen.getByRole('button', { name: 'Tạo lời mời' }));
    await waitFor(() => expect(screen.getByText('Nhập số điện thoại')).toBeTruthy());
    expect(mutation.mutate).not.toHaveBeenCalled();
  });

  it('số điện thoại sai định dạng (kể cả một email) thì không gọi mutation', async () => {
    renderModal();
    fillForm('nhanvien@congty.vn');
    fireEvent.click(screen.getByRole('button', { name: 'Tạo lời mời' }));
    await waitFor(() => expect(screen.getByText('Số điện thoại không hợp lệ')).toBeTruthy());
    expect(mutation.mutate).not.toHaveBeenCalled();
  });

  it('gửi số điện thoại đã trim kèm roleKey', async () => {
    renderModal();
    fillForm('  0901234567  ');
    fireEvent.click(screen.getByRole('button', { name: 'Tạo lời mời' }));

    await waitFor(() => expect(mutation.mutate).toHaveBeenCalledTimes(1));
    expect(mutation.mutate.mock.calls[0]![0]).toEqual({
      phone: '0901234567',
      roleKey: 'shop_staff',
      // Không chọn chi nhánh nào = mời vào TOÀN gian hàng (ADR 0052).
      branchScope: 'all',
    });
  });

  it('tạo xong: hiện liên kết mời + nút sao chép, và KHÔNG tự đóng', async () => {
    const { onClose } = renderModal();
    await createInvite();

    expect(await screen.findByText('Đã tạo lời mời')).toBeTruthy();
    expect(screen.getByLabelText<HTMLInputElement>('Liên kết mời').value).toBe(INVITE_URL);
    expect(screen.getByRole('button', { name: 'Sao chép liên kết' })).toBeTruthy();
    expect(screen.getByText(/Gửi liên kết này cho 0901234567/)).toBeTruthy();
    expect(onClose).not.toHaveBeenCalled();

    fireEvent.click(screen.getByRole('button', { name: 'Xong' }));
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  /**
   * Nơi gọi không remount hộp theo `open`. Không dọn khi bấm "Xong" thì lần mở kế tiếp vẫn hiện
   * liên kết của lời mời TRƯỚC — người mời gửi nhầm link cũ cho người mới.
   */
  it('bấm Xong rồi mở lại: về form trống, không còn liên kết cũ', async () => {
    const onClose = vi.fn();
    const { rerender } = renderModal({ onClose });
    await createInvite();
    fireEvent.click(await screen.findByRole('button', { name: 'Xong' }));

    rerender(
      <App>
        <InviteMemberModal open={false} onClose={onClose} />
      </App>,
    );
    rerender(
      <App>
        <InviteMemberModal open onClose={onClose} />
      </App>,
    );

    expect(screen.queryByText('Đã tạo lời mời')).toBeNull();
    expect(screen.getByLabelText<HTMLInputElement>('Số điện thoại').value).toBe('');
  });

  it('lỗi: hiện thông báo lỗi và KHÔNG đóng', async () => {
    const { onClose } = renderModal();
    fillForm();
    fireEvent.click(screen.getByRole('button', { name: 'Tạo lời mời' }));

    await waitFor(() => expect(mutation.mutate).toHaveBeenCalled());
    mutation.mutate.mock.calls[0]![1].onError(new Error('Số này đã là thành viên'));

    // ADR 0012: message tiếng Việt của backend KHÔNG lên màn hình — lỗi dịch từ MÃ, và một
    // Error trần không có mã nên rơi về câu chung.
    expect(await screen.findByText('Đã có lỗi xảy ra. Vui lòng thử lại.')).toBeTruthy();
    expect(screen.queryByText('Đã tạo lời mời')).toBeNull();
    expect(onClose).not.toHaveBeenCalled();
  });

  it('đang tạo thì nút ở trạng thái loading', () => {
    mutation.isPending = true;
    renderModal();
    expect(screen.getByRole('button', { name: /Tạo lời mời/ }).className).toContain(
      'ant-btn-loading',
    );
  });

  it('nút Huỷ gọi onClose', () => {
    const { onClose } = renderModal();
    fireEvent.click(screen.getByRole('button', { name: 'Huỷ' }));
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  /**
   * Hành vi ĐANG CÓ, cố ý khoá lại: caller không truyền `key`, nên `useForm` sống sót qua lần
   * đóng bằng "Huỷ" — mở lại vẫn thấy số đã nhập dở. Chỉ "Xong" (sau khi đã tạo) mới dọn form.
   */
  it('huỷ rồi mở lại vẫn giữ số đã nhập dở', () => {
    const { rerender } = renderModal();
    fillForm('0912345678');

    rerender(
      <App>
        <InviteMemberModal open={false} onClose={vi.fn()} />
      </App>,
    );
    rerender(
      <App>
        <InviteMemberModal open onClose={vi.fn()} />
      </App>,
    );

    expect(screen.getByLabelText<HTMLInputElement>('Số điện thoại').value).toBe('0912345678');
  });
});

import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { App } from 'antd';
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { ApiClientError } from '@xeprime/api-client';
import { ForgotPasswordByPhone } from './ForgotPasswordByPhone';

/*
 * Quên mật khẩu bằng SĐT — MỘT màn (ADR 0060): SĐT · mật khẩu mới · nhập lại → "Xác nhận" → popup
 * nhập mã → đúng mã thì đặt lại. Giống hệt app native.
 */

const api = vi.hoisted(() => ({
  sendOtp: vi.fn(),
  verifyOtp: vi.fn(),
  resetPasswordWithOtp: vi.fn(),
}));

vi.mock('@/zones/ZoneProvider', () => ({ useZone: () => 'market' }));
vi.mock('@/services/auth.service', async (importOriginal) => ({
  ...(await importOriginal<object>()),
  resetPasswordWithOtp: api.resetPasswordWithOtp,
}));
vi.mock('@/features/phone-verification/api', () => ({
  sendOtp: api.sendOtp,
  verifyOtp: api.verifyOtp,
  getOtpConfig: vi.fn(async () => ({ testCodeEnabled: false })),
}));

function renderView() {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={client}>
      <App>
        <ForgotPasswordByPhone />
      </App>
    </QueryClientProvider>,
  );
}

function type(label: RegExp, value: string) {
  fireEvent.change(screen.getByLabelText(label), { target: { value } });
}

function fillForm() {
  type(/^Số điện thoại/, '0901234567');
  type(/^Mật khẩu mới/, 'matkhau123');
  type(/^Nhập lại mật khẩu/, 'matkhau123');
}

beforeEach(() => {
  api.sendOtp.mockReset().mockResolvedValue({ expiresAt: '2030-01-01T00:00:00Z', devCode: null });
  api.resetPasswordWithOtp.mockReset().mockResolvedValue(undefined);
});

afterEach(cleanup);

describe('ForgotPasswordByPhone — một màn + popup OTP', () => {
  it('một màn có đủ SĐT, mật khẩu mới, nhập lại; chưa có ô mã', () => {
    renderView();

    expect(screen.getByLabelText(/^Số điện thoại/)).toBeTruthy();
    expect(screen.getByLabelText(/^Mật khẩu mới/)).toBeTruthy();
    expect(screen.getByLabelText(/^Nhập lại mật khẩu/)).toBeTruthy();
    expect(screen.queryByLabelText(/^Mã xác thực gồm/)).toBeNull();
  });

  it('thiếu/sai dữ liệu: không gửi mã', async () => {
    renderView();

    type(/^Số điện thoại/, '0901234567');
    type(/^Mật khẩu mới/, 'matkhau123');
    type(/^Nhập lại mật khẩu/, 'khac12345');
    fireEvent.click(screen.getByRole('button', { name: /Xác nhận/ }));

    await waitFor(() => expect(screen.getByText(/không khớp/)).toBeTruthy());
    expect(api.sendOtp).not.toHaveBeenCalled();
  });

  it('"Xác nhận" → gửi mã password_reset + popup → đúng mã thì đặt lại, KHÔNG tự đăng nhập', async () => {
    renderView();

    fillForm();
    fireEvent.click(screen.getByRole('button', { name: /Xác nhận/ }));

    await waitFor(() =>
      expect(api.sendOtp).toHaveBeenCalledWith({ phone: '0901234567', purpose: 'password_reset' }),
    );
    expect(api.resetPasswordWithOtp).not.toHaveBeenCalled();
    fireEvent.change(await screen.findByLabelText(/^Mã xác thực gồm/), {
      target: { value: '123456' },
    });

    await waitFor(() =>
      expect(api.resetPasswordWithOtp).toHaveBeenCalledWith({
        phone: '0901234567',
        code: '123456',
        password: 'matkhau123',
      }),
    );
    expect(await screen.findByText('Đã đặt lại mật khẩu')).toBeTruthy();
  });

  it('mã sai: ở lại popup, báo lỗi theo MÃ, chưa sang màn xong', async () => {
    api.resetPasswordWithOtp.mockRejectedValueOnce(
      new ApiClientError({ code: 'OTP_INVALID', message: 'x', status: 400 }),
    );
    renderView();

    fillForm();
    fireEvent.click(screen.getByRole('button', { name: /Xác nhận/ }));
    fireEvent.change(await screen.findByLabelText(/^Mã xác thực gồm/), {
      target: { value: '111111' },
    });

    await waitFor(() => expect(api.resetPasswordWithOtp).toHaveBeenCalledTimes(1));
    expect(screen.queryByText('Đã đặt lại mật khẩu')).toBeNull();
    expect(screen.getByLabelText(/^Mã xác thực gồm/)).toBeTruthy();
  });
});

import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { cleanup, fireEvent, screen, waitFor } from '@testing-library/react';
import type { ReactElement } from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { renderWithIntl } from '@/i18n/test-utils';
import { PhoneLoginForm } from './PhoneLoginForm';

const api = vi.hoisted(() => ({
  sendOtp: vi.fn(),
  verifyOtp: vi.fn(),
  getOtpConfig: vi.fn(),
  phoneLogin: vi.fn(),
}));

vi.mock('../api', () => ({
  sendOtp: (...a: unknown[]) => api.sendOtp(...a),
  verifyOtp: (...a: unknown[]) => api.verifyOtp(...a),
  getOtpConfig: () => api.getOtpConfig(),
}));

vi.mock('@/services/auth.service', async () => {
  const actual = await vi.importActual<Record<string, unknown>>('@/services/auth.service');
  return { ...actual, phoneLogin: (...a: unknown[]) => api.phoneLogin(...a) };
});

function renderForm(onSuccess = vi.fn()) {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  const ui: ReactElement = (
    <QueryClientProvider client={client}>
      <PhoneLoginForm onSuccess={onSuccess} />
    </QueryClientProvider>
  );
  renderWithIntl(ui);
  return { onSuccess };
}

const PHONE = '0901234567';
const CODE_LABEL = 'Mã xác thực gồm 6 số';

beforeEach(() => {
  Object.values(api).forEach((fn) => fn.mockReset());
  api.phoneLogin.mockResolvedValue({ id: 'u1' });
});
afterEach(cleanup);

describe('PhoneLoginForm — mã OTP test (dev/staging)', () => {
  it('production: ô mã chỉ hiện SAU khi gửi mã', async () => {
    api.getOtpConfig.mockResolvedValue({ testCodeEnabled: false });
    renderForm();
    await waitFor(() => expect(api.getOtpConfig).toHaveBeenCalled());

    expect(screen.queryByLabelText(CODE_LABEL)).toBeNull();
    expect(screen.getByRole('button', { name: 'Gửi mã xác thực' })).toBeTruthy();
  });

  it('môi trường có mã test: gõ mã là đăng nhập, KHÔNG gửi SMS nào', async () => {
    api.getOtpConfig.mockResolvedValue({ testCodeEnabled: true });
    const { onSuccess } = renderForm();

    fireEvent.change(screen.getByPlaceholderText('0901234567'), { target: { value: PHONE } });
    const code = await screen.findByLabelText(CODE_LABEL);
    // Đủ 6 số là tự đăng nhập (`onComplete`) — không cần bấm nút.
    fireEvent.change(code, { target: { value: '123456' } });

    await waitFor(() => expect(onSuccess).toHaveBeenCalled());
    expect(api.phoneLogin).toHaveBeenCalledWith(PHONE, '123456');
    expect(api.sendOtp).not.toHaveBeenCalled();
  });

  it('môi trường có mã test: SĐT chưa hợp lệ thì chưa đăng nhập được', async () => {
    api.getOtpConfig.mockResolvedValue({ testCodeEnabled: true });
    renderForm();

    const code = await screen.findByLabelText(CODE_LABEL);
    fireEvent.change(code, { target: { value: '123456' } });
    const submit = screen.getByRole('button', { name: 'Đăng nhập' }) as HTMLButtonElement;
    expect(submit.disabled).toBe(true);
    expect(api.phoneLogin).not.toHaveBeenCalled();
  });

  it('lỗi tải cấu hình ⇒ rơi về luồng chuẩn (gửi mã trước)', async () => {
    api.getOtpConfig.mockRejectedValue(new Error('network'));
    renderForm();
    await waitFor(() => expect(api.getOtpConfig).toHaveBeenCalled());

    expect(screen.queryByLabelText(CODE_LABEL)).toBeNull();
  });
});

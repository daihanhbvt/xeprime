import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { SetPasswordPrompt } from './SetPasswordPrompt';

const api = vi.hoisted(() => ({ setPassword: vi.fn() }));

vi.mock('@/services/auth.service', async () => {
  const actual = await vi.importActual<Record<string, unknown>>('@/services/auth.service');
  return { ...actual, setPassword: (...args: unknown[]) => api.setPassword(...args) };
});

beforeEach(() => {
  api.setPassword.mockReset().mockResolvedValue(undefined);
});

afterEach(cleanup);

function renderPrompt(onDone: () => void) {
  const queryClient = new QueryClient({ defaultOptions: { mutations: { retry: false } } });
  return render(
    <QueryClientProvider client={queryClient}>
      <SetPasswordPrompt onDone={onDone} primaryActionClassName="shared-primary-action" />
    </QueryClientProvider>,
  );
}

describe('SetPasswordPrompt', () => {
  it('dùng nút chính chung và lưu mật khẩu hợp lệ', async () => {
    const onDone = vi.fn();
    renderPrompt(onDone);

    fireEvent.change(screen.getByLabelText('Mật khẩu mới'), {
      target: { value: 'Abcd1234' },
    });
    fireEvent.change(screen.getByLabelText('Nhập lại mật khẩu'), {
      target: { value: 'Abcd1234' },
    });

    const submit = screen.getByRole('button', { name: 'Đặt mật khẩu' });
    expect(submit.className).toContain('shared-primary-action');
    fireEvent.click(submit);

    await waitFor(() => expect(api.setPassword).toHaveBeenCalledWith('Abcd1234'));
    await waitFor(() => expect(onDone).toHaveBeenCalledTimes(1));
  });

  it('cho phép bỏ qua vì mật khẩu là tuỳ chọn', () => {
    const onDone = vi.fn();
    renderPrompt(onDone);

    fireEvent.click(screen.getByRole('button', { name: 'Bỏ qua, tiếp tục' }));
    expect(onDone).toHaveBeenCalledTimes(1);
  });
});

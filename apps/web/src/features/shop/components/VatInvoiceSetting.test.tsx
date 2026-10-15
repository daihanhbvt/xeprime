import { App } from 'antd';
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { ApiClientError } from '@xeprime/api-client';
import { API_ERROR_CODE } from '@xeprime/types';

import { VatInvoiceSetting } from './VatInvoiceSetting';

/**
 * "Hỗ trợ xuất hoá đơn VAT" — MỘT thiết lập cho mọi xe (ADR 0059).
 *
 * Khoá: lưu ngay khi bấm, có trạng thái đang lưu, lỗi theo MÃ và công tắc đứng nguyên chỗ cũ; tải
 * hỏng có nút thử lại; thiếu quyền hoặc phiên hỗ trợ thì chỉ còn chữ.
 */
const query = vi.hoisted(() => ({
  data: { vatInvoiceSupported: false } as { vatInvoiceSupported: boolean } | undefined,
  isError: false,
  refetch: vi.fn(),
}));
const update = vi.hoisted(() => ({ mutate: vi.fn(), isPending: false }));
vi.mock('../hooks/use-shop', () => ({
  useVatInvoiceSetting: () => query,
  useUpdateVatInvoiceSetting: () => update,
}));

const support = vi.hoisted(() => ({ active: false }));
vi.mock('@/features/tenant-support/support-session', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/features/tenant-support/support-session')>()),
  useSupportHides: () => support.active,
}));

const messages = vi.hoisted(() => ({ error: vi.fn(), success: vi.fn() }));
vi.mock('antd', async (importOriginal) =>
  (await import('@/test-utils/antd-mock')).antdWithApp(importOriginal, () => ({ message: messages })),
);

function renderSetting(canEdit = true) {
  return render(
    <App>
      <VatInvoiceSetting canEdit={canEdit} />
    </App>,
  );
}

const theSwitch = (): HTMLButtonElement => screen.getByRole('switch') as HTMLButtonElement;

beforeEach(() => {
  query.data = { vatInvoiceSupported: false };
  query.isError = false;
  query.refetch.mockReset();
  update.mutate.mockReset();
  update.isPending = false;
  support.active = false;
  messages.error.mockReset();
  messages.success.mockReset();
});

afterEach(cleanup);

describe('VatInvoiceSetting', () => {
  it('mặc định tắt; bấm → lưu true ngay, không modal; ghi chú nói rõ ai xuất hoá đơn', () => {
    renderSetting();

    expect(screen.getByText('Đang tắt')).toBeTruthy();
    expect(theSwitch().getAttribute('aria-checked')).toBe('false');
    expect(screen.getByText(/XePrime không xuất hoá đơn thay bạn/)).toBeTruthy();

    fireEvent.click(theSwitch());
    expect(update.mutate).toHaveBeenCalledTimes(1);
    expect(update.mutate.mock.calls[0]?.[0]).toBe(true);
    expect(screen.queryByRole('dialog')).toBeNull();
  });

  it('đang bật: "Đang bật cho mọi xe"; bấm → tắt', () => {
    query.data = { vatInvoiceSupported: true };
    renderSetting();

    expect(screen.getByText('Đang bật cho mọi xe')).toBeTruthy();
    fireEvent.click(theSwitch());
    expect(update.mutate.mock.calls[0]?.[0]).toBe(false);
  });

  it('đang lưu: loading và KHÔNG nhận cú bấm thứ hai', () => {
    update.isPending = true;
    renderSetting();

    expect(theSwitch().className).toContain('ant-switch-loading');
    fireEvent.click(theSwitch());
    expect(update.mutate).not.toHaveBeenCalled();
  });

  it('lưu xong → toast xác nhận', async () => {
    update.mutate.mockImplementation((_v: boolean, opts: { onSuccess?: () => void }) =>
      opts.onSuccess?.(),
    );
    renderSetting();
    fireEvent.click(theSwitch());

    await waitFor(() => expect(messages.success).toHaveBeenCalledTimes(1));
    expect(messages.success.mock.calls[0]?.[0]).toBe('Đã bật hỗ trợ xuất hoá đơn VAT cho mọi xe');
  });

  it('lưu lỗi → hiện theo MÃ, công tắc giữ trạng thái cũ', async () => {
    update.mutate.mockImplementation((_v: boolean, opts: { onError?: (e: unknown) => void }) =>
      opts.onError?.(
        new ApiClientError({
          code: API_ERROR_CODE.FORBIDDEN,
          message: 'MESSAGE TIẾNG VIỆT CỦA BACKEND — KHÔNG ĐƯỢC HIỆN',
          status: 403,
        }),
      ),
    );
    renderSetting();
    fireEvent.click(theSwitch());

    await waitFor(() => expect(messages.error).toHaveBeenCalledTimes(1));
    expect(messages.error.mock.calls[0]?.[0]).not.toContain('KHÔNG ĐƯỢC HIỆN');
    expect(theSwitch().getAttribute('aria-checked')).toBe('false');
  });

  it('tải lỗi → thông báo + nút thử lại gọi refetch', () => {
    query.data = undefined;
    query.isError = true;
    renderSetting();

    expect(screen.getByText('Không tải được thiết lập hoá đơn VAT')).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: 'Thử lại' }));
    expect(query.refetch).toHaveBeenCalledTimes(1);
  });

  it('thiếu quyền sửa: không vẽ công tắc, vẫn nói trạng thái', () => {
    query.data = { vatInvoiceSupported: true };
    renderSetting(false);

    expect(screen.queryByRole('switch')).toBeNull();
    expect(screen.getByText('Đang bật cho mọi xe')).toBeTruthy();
  });

  it('phiên hỗ trợ của nền tảng: chỉ xem, không bật/tắt thay chủ xe', () => {
    support.active = true;
    renderSetting();
    expect(screen.queryByRole('switch')).toBeNull();
  });
});

import { App } from 'antd';
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { ApiClientError } from '@xeprime/api-client';
import { API_ERROR_CODE, VEHICLE_PUBLIC_STATUS } from '@xeprime/types';

import type { VehicleDetail } from '../types';
import { VatInvoiceSupportRow } from './VatInvoiceSupportRow';

/**
 * Hàng "Xuất hoá đơn VAT" trong thẻ Giá & chính sách (ADR 0059).
 *
 * Khoá ba nhóm quyết định:
 *  - lưu ngay khi bấm, có trạng thái đang lưu, lỗi hiện theo MÃ và công tắc đứng nguyên chỗ cũ;
 *  - công tắc KHÔNG gắn với trục nào khác — xe nháp vẫn bật/tắt được như xe đang trên chợ;
 *  - chỉ thiếu quyền hoặc phiên hỗ trợ mới đóng nó, và khi đóng thì chỉ còn chữ.
 */
const toggle = vi.hoisted(() => ({ mutate: vi.fn(), isPending: false }));
vi.mock('../hooks/use-vehicle-mutations', () => ({
  useSetVehicleVatInvoiceSupport: () => toggle,
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

function makeVehicle(over: Partial<VehicleDetail> = {}): VehicleDetail {
  return {
    id: '01HVEH0000000000000000000',
    code: 'V-000001',
    name: 'Toyota Vios',
    vehicleType: 'car',
    publicStatus: VEHICLE_PUBLIC_STATUS.APPROVED_PUBLIC,
    vatInvoiceSupported: false,
    ...over,
  } as unknown as VehicleDetail;
}

function renderRow(over: Partial<VehicleDetail> = {}, canEdit = true) {
  return render(
    <App>
      <dl>
        <VatInvoiceSupportRow vehicle={makeVehicle(over)} canEdit={canEdit} />
      </dl>
    </App>,
  );
}

const theSwitch = (): HTMLButtonElement => screen.getByRole('switch') as HTMLButtonElement;

beforeEach(() => {
  support.active = false;
  toggle.mutate.mockReset();
  toggle.isPending = false;
  messages.error.mockReset();
  messages.success.mockReset();
});

afterEach(cleanup);

describe('VatInvoiceSupportRow', () => {
  it('mặc định "Không", công tắc tắt; bấm → gọi API với true, không modal nào chen vào', () => {
    renderRow();

    expect(screen.getByText('Xuất hoá đơn VAT')).toBeTruthy();
    expect(screen.getByText('Không')).toBeTruthy();
    expect(theSwitch().getAttribute('aria-checked')).toBe('false');

    fireEvent.click(theSwitch());
    expect(toggle.mutate).toHaveBeenCalledTimes(1);
    expect(toggle.mutate.mock.calls[0]?.[0]).toBe(true);
    expect(screen.queryByRole('dialog')).toBeNull();
  });

  it('đang bật: đọc "Có hỗ trợ"; bấm → tắt', () => {
    renderRow({ vatInvoiceSupported: true });

    expect(screen.getByText('Có hỗ trợ')).toBeTruthy();
    fireEvent.click(theSwitch());
    expect(toggle.mutate.mock.calls[0]?.[0]).toBe(false);
  });

  it('xe NHÁP vẫn bật/tắt được — cờ không phải điều kiện duyệt hay lên chợ', () => {
    renderRow({ publicStatus: VEHICLE_PUBLIC_STATUS.DRAFT });
    expect(theSwitch()).toBeTruthy();
  });

  it('đang lưu: loading và KHÔNG nhận cú bấm thứ hai', () => {
    toggle.isPending = true;
    renderRow();

    expect(theSwitch().className).toContain('ant-switch-loading');
    fireEvent.click(theSwitch());
    expect(toggle.mutate).not.toHaveBeenCalled();
  });

  it('lưu xong → toast xác nhận', async () => {
    toggle.mutate.mockImplementation((_v: boolean, opts: { onSuccess?: () => void }) =>
      opts.onSuccess?.(),
    );
    renderRow();
    fireEvent.click(theSwitch());

    await waitFor(() => expect(messages.success).toHaveBeenCalledTimes(1));
    expect(messages.success.mock.calls[0]?.[0]).toBe('Đã bật hỗ trợ xuất hoá đơn VAT cho xe này');
  });

  it('lỗi → hiện theo MÃ, công tắc giữ trạng thái cũ', async () => {
    toggle.mutate.mockImplementation((_v: boolean, opts: { onError?: (e: unknown) => void }) =>
      opts.onError?.(
        new ApiClientError({
          code: API_ERROR_CODE.NOT_FOUND,
          message: 'MESSAGE TIẾNG VIỆT CỦA BACKEND — KHÔNG ĐƯỢC HIỆN',
          status: 404,
        }),
      ),
    );
    renderRow();
    fireEvent.click(theSwitch());

    await waitFor(() => expect(messages.error).toHaveBeenCalledTimes(1));
    expect(messages.error.mock.calls[0]?.[0]).not.toContain('KHÔNG ĐƯỢC HIỆN');
    expect(theSwitch().getAttribute('aria-checked')).toBe('false');
    expect(messages.success).not.toHaveBeenCalled();
  });

  it('thiếu `vehicles.update` (canEdit=false): không vẽ công tắc, vẫn nói trạng thái bằng chữ', () => {
    renderRow({ vatInvoiceSupported: true }, false);

    expect(screen.queryByRole('switch')).toBeNull();
    expect(screen.getByText('Có hỗ trợ')).toBeTruthy();
  });

  it('phiên hỗ trợ của nền tảng: chỉ xem, không bật/tắt thay chủ xe', () => {
    support.active = true;
    renderRow();
    expect(screen.queryByRole('switch')).toBeNull();
  });

  it('khả truy cập: aria-label mang tên xe; lời giải thích nằm sau dấu "i"', () => {
    renderRow();
    expect(theSwitch().getAttribute('aria-label')).toContain('Toyota Vios');
    expect(
      screen.getByRole('button', { name: /Giải thích về hỗ trợ xuất hoá đơn VAT/ }),
    ).toBeTruthy();
  });
});

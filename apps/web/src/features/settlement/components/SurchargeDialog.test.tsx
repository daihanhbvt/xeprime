import { App } from 'antd';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { DEPOSIT_STATUS, SURCHARGE_CATEGORY } from '@xeprime/types';

import { SurchargeDialog } from './SurchargeDialog';
import type { BookingSettlement } from '../types';

/**
 * Hộp `Ghi nhận phát sinh` — phần ĐỀ XUẤT phí vượt km (21/09/2026).
 *
 * Ba điều bị khoá ở đây, và cả ba đều là chuyện tiền của khách:
 *
 *  1. **Không có ghi tự động.** Mở màn quyết toán, hay API trả về một đề xuất, không tạo ra
 *     khoản nào. Chỉ cú bấm "Thêm phí phát sinh" mới tạo.
 *  2. **Số tiền đến từ SERVER.** Hộp này không nhân `excessKm × feePerKm` lần nào — nó chỉ điền
 *     lại `amount` đã nhận; chủ xe vẫn sửa được trước khi ghi.
 *  3. **Một chuyến một khoản vượt km.** Đơn đã có khoản đó thì danh mục biến mất khỏi ô chọn —
 *     đường sửa là gỡ khoản đang có, không phải ghi đè một khoản thứ hai.
 */
const add = vi.hoisted(() => ({ mutate: vi.fn(), isPending: false }));
const remove = vi.hoisted(() => ({ mutate: vi.fn(), isPending: false }));

vi.mock('../hooks', () => ({
  useAddSurcharge: () => add,
  useVoidSurcharge: () => remove,
}));

const EXCEEDED = {
  available: true,
  includedKmPerDay: 300,
  chargedDays: 2,
  allowedKm: 600,
  pickupOdometerKm: 10_000,
  returnOdometerKm: 11_000,
  actualKm: 1000,
  excessKm: 400,
  feePerKm: '3000',
  amount: '1200000.00',
  formula: null,
};

const NO_LIMIT = {
  available: false,
  includedKmPerDay: null,
  chargedDays: 0,
  allowedKm: 0,
  pickupOdometerKm: null,
  returnOdometerKm: null,
  actualKm: 0,
  excessKm: 0,
  feePerKm: null,
  amount: null,
  formula: null,
};

const OVERTIME = {
  available: true,
  lateMinutes: 180,
  chargedHours: 3,
  feePerHour: '100000',
  amount: '300000.00',
  formula: 'Trễ 3 giờ × 100.000đ',
};

const BASE = {
  bookingId: 'BK1',
  depositRequired: '5000000.00',
  depositReceived: '5000000.00',
  surcharges: [],
  surchargeTotal: '0.00',
  proposedRefund: '5000000.00',
  additionalDue: '0.00',
  depositStatus: DEPOSIT_STATUS.AWAITING_REFUND,
  refund: null,
  overtime: { ...OVERTIME, available: false, amount: null, formula: null },
  surchargeRules: [],
  excessMileage: NO_LIMIT,
} as unknown as BookingSettlement;

function renderDialog(settlement: BookingSettlement) {
  return render(
    <App>
      <SurchargeDialog bookingId="BK1" settlement={settlement} open onClose={() => {}} />
    </App>,
  );
}

/**
 * Ba ô của hộp thoại. Chúng nằm trong `<label>` tự dựng (không phải `Form.Item` của AntD), nên
 * tra theo VAI TRÒ thay vì theo nhãn: ô tiền là spinbutton duy nhất, ô lý do là textbox duy nhất.
 */
const openCategorySelect = () => fireEvent.mouseDown(screen.getByRole('combobox'));
function chooseCategory(label: string) {
  openCategorySelect();
  fireEvent.click(screen.getByTitle(label));
}

const amountInput = () => screen.getByRole('spinbutton') as HTMLInputElement;
const reasonInput = () => screen.getByPlaceholderText(/khách trả muộn/i) as HTMLTextAreaElement;

beforeEach(() => {
  add.mutate = vi.fn();
  add.isPending = false;
  remove.mutate = vi.fn();
});

afterEach(cleanup);

describe('SurchargeDialog — đề xuất phí vượt km', () => {
  it('mở hộp thoại KHÔNG tạo khoản nào, kể cả khi đã có đề xuất', () => {
    renderDialog({ ...BASE, excessMileage: EXCEEDED });
    expect(add.mutate).not.toHaveBeenCalled();
  });

  it('chọn danh mục vượt km: điền sẵn số tiền của server và một ghi chú kiểm được', () => {
    renderDialog({ ...BASE, excessMileage: EXCEEDED });
    chooseCategory('Vượt số km cho phép');

    expect(amountInput().value).toContain('1.200.000');
    // Ghi chú dựng từ SỐ của backend — đủ để đối chiếu mà không phải mở lại biên bản.
    expect(reasonInput().value).toMatch(/1\.000 km/);
    expect(reasonInput().value).toMatch(/600 km/);
    expect(reasonInput().value).toMatch(/400 km/);
  });

  it('bảy con số đứng sau đề xuất đều hiện ra để đối chiếu', () => {
    renderDialog({ ...BASE, excessMileage: EXCEEDED });
    chooseCategory('Vượt số km cho phép');

    expect(screen.getByText('Đồng hồ lúc giao')).toBeTruthy();
    expect(screen.getByText('10.000 km')).toBeTruthy();
    expect(screen.getByText('11.000 km')).toBeTruthy();
    expect(screen.getByText('600 km (2 ngày × 300 km)')).toBeTruthy();
    expect(screen.getByText('400 km')).toBeTruthy();
  });

  it('chủ xe sửa số tiền và lý do trước khi xác nhận — số gửi đi là số họ gõ', () => {
    renderDialog({ ...BASE, excessMileage: EXCEEDED });
    chooseCategory('Vượt số km cho phép');

    fireEvent.change(amountInput(), { target: { value: '800000' } });
    fireEvent.change(reasonInput(), { target: { value: 'Đã thoả thuận giảm với khách' } });
    fireEvent.click(screen.getByRole('button', { name: /Thêm phí phát sinh/ }));

    expect(add.mutate).toHaveBeenCalledTimes(1);
    expect(add.mutate.mock.calls[0]![0]).toMatchObject({
      category: SURCHARGE_CATEGORY.EXCESS_MILEAGE,
      amount: '800000',
      reason: 'Đã thoả thuận giảm với khách',
    });
  });

  it('không vượt km: không điền số nào, và không có nút dùng số đề xuất', () => {
    renderDialog({
      ...BASE,
      excessMileage: { ...EXCEEDED, actualKm: 400, excessKm: 0, amount: '0.00' },
    });
    chooseCategory('Vượt số km cho phép');

    expect(amountInput().value).toBe('');
    expect(reasonInput().value).toBe('');
    expect(screen.getByText(/chạy trong hạn mức/)).toBeTruthy();
    expect(screen.queryByRole('button', { name: 'Dùng số này' })).toBeNull();
  });

  it('thiếu chỉ số đồng hồ: nói chưa đủ dữ liệu thay vì điền một số sai', () => {
    renderDialog({
      ...BASE,
      excessMileage: {
        ...EXCEEDED,
        available: false,
        pickupOdometerKm: null,
        returnOdometerKm: null,
        actualKm: 0,
        excessKm: 0,
        amount: null,
      },
    });
    chooseCategory('Vượt số km cho phép');

    expect(amountInput().value).toBe('');
    expect(screen.getByText(/Chưa đủ dữ liệu/)).toBeTruthy();
  });

  it('đơn đã có khoản vượt km: danh mục đó không còn trong ô chọn', () => {
    renderDialog({
      ...BASE,
      excessMileage: EXCEEDED,
      surcharges: [
        {
          id: 'S1',
          category: SURCHARGE_CATEGORY.EXCESS_MILEAGE,
          amount: '1200000.00',
          reason: 'Vượt 400 km',
          createdByName: null,
          createdAt: '2026-09-20T00:00:00.000Z',
          updatedAt: '2026-09-20T00:00:00.000Z',
        },
      ],
    } as unknown as BookingSettlement);

    openCategorySelect();

    expect(screen.queryByTitle('Vượt số km cho phép')).toBeNull();
    // Danh mục nhiều-khoản vẫn còn nguyên — luật chỉ áp cho danh mục một-khoản.
    expect(screen.getByTitle('Vệ sinh')).toBeTruthy();
  });

  it('quá giờ và vượt km là hai đề xuất RỜI NHAU, không đè số của nhau', () => {
    renderDialog({ ...BASE, overtime: OVERTIME, excessMileage: EXCEEDED });

    // Danh mục mặc định là Quá giờ: chỉ thấy đề xuất quá giờ.
    expect(screen.getByText(/Đề xuất từ chính sách quá giờ/)).toBeTruthy();
    expect(screen.queryByText(/Đề xuất từ hạn mức quãng đường/)).toBeNull();

    fireEvent.click(screen.getByRole('button', { name: 'Dùng số này' }));
    expect(amountInput().value).toContain('300.000');

    // Đổi sang vượt km: đề xuất kia hiện ra, và số quá giờ đã nhận KHÔNG bị ghi đè.
    chooseCategory('Vượt số km cho phép');
    expect(screen.getByText(/Đề xuất từ hạn mức quãng đường/)).toBeTruthy();
    expect(screen.queryByText(/Đề xuất từ chính sách quá giờ/)).toBeNull();
    expect(amountInput().value).toContain('300.000');

    // Muốn số của vượt km thì bấm nút của nó — tường minh, không tự đổi sau lưng.
    fireEvent.click(screen.getByRole('button', { name: 'Dùng số này' }));
    expect(amountInput().value).toContain('1.200.000');
  });
});

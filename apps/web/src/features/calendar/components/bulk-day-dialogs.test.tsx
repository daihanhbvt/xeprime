import { App } from 'antd';
import { cleanup, fireEvent, render, screen, within } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { BulkDayBlockDialog } from './BulkDayBlockDialog';
import { BulkDayPriceDialog } from './BulkDayPriceDialog';

/**
 * Hai hộp thao tác hàng loạt, render THẬT (không mock).
 *
 * Vì sao file này tồn tại: test của lưới lịch mock cả hai dialog thành marker — đúng cho việc
 * nó đang kiểm (dialog nào được mở), nhưng nghĩa là KHÔNG có gì render chúng thật. Một vòng
 * lặp render vô hạn đã lọt qua đúng khe đó: bản đầu tách form ra component con rồi đẩy footer
 * ngược lên vỏ bằng `useState`, và mỗi lần render lại tạo một phần tử JSX mới nên `setState`
 * không bao giờ dừng. Bộ test xanh, màn hình thì treo.
 *
 * Mỗi `render()` ở đây vì thế là một khẳng định: component dựng xong và dừng lại.
 */

const hooks = vi.hoisted(() => ({
  vehicles: [] as unknown[],
  block: vi.fn(),
  price: vi.fn(),
  restore: vi.fn(),
}));

vi.mock('../hooks/use-bulk-day', () => ({
  useBulkDayPreview: () => ({
    data: { vehicles: hooks.vehicles, dayCount: 1, activeBlockBatchId: null },
    isLoading: false,
    isError: false,
    error: null,
  }),
  useBulkBlockDay: () => ({ mutate: hooks.block, isPending: false }),
  useBulkPriceDay: () => ({ mutate: hooks.price, isPending: false }),
  useBulkRestoreDayPrices: () => ({ mutateAsync: hooks.restore, isPending: false }),
  useReleaseBulkBlock: () => ({ mutate: vi.fn(), isPending: false }),
}));

/** Đội xe lệch giá gần ba lần — đúng hình dạng đội xe thật trên ảnh chụp màn hình. */
const FLEET = [
  {
    vehicleId: 'i10',
    name: 'Hyundai Grand i10 2019',
    plateNumber: '51H-544.04',
    vehicleType: 'car',
    weekdayPrice: '520000',
    weekendPrice: null,
    busyDates: [],
  },
  {
    vehicleId: 'everest',
    name: 'Ford Everest 2023',
    plateNumber: '29A-236.76',
    vehicleType: 'car',
    weekdayPrice: '1500000',
    weekendPrice: null,
    busyDates: [],
  },
];

/** 31/08/2026 là Thứ Hai — ngày thường, nên giá gốc là giá ngày thường. */
const STATE = {
  date: '2026-08-31',
  suggestedRange: { from: '2026-08-31', to: '2026-09-02' },
};

beforeEach(() => {
  hooks.vehicles = FLEET;
  hooks.block = vi.fn();
  hooks.price = vi.fn();
  hooks.restore = vi.fn();
});
afterEach(cleanup);

describe('BulkDayPriceDialog', () => {
  function open() {
    return render(
      <App>
        <BulkDayPriceDialog state={STATE} onClose={vi.fn()} />
      </App>,
    );
  }

  it('dựng xong và DỪNG LẠI — không vòng lặp render', () => {
    expect(() => open()).not.toThrow();
    expect(screen.getByText('Đặt giá riêng toàn bộ xe')).toBeTruthy();
  });

  it('nút nằm ở FOOTER của modal, không phải cuối thân cuộn', () => {
    const { baseElement } = open();

    const footer = baseElement.querySelector('.ant-modal-footer');
    expect(footer).not.toBeNull();
    expect(within(footer as HTMLElement).getByText(/Đặt giá 2 xe/)).toBeTruthy();
    expect(within(footer as HTMLElement).getByText('Khôi phục giá mặc định')).toBeTruthy();
  });

  it('mặc định là chế độ PHẦN TRĂM và bảng hiện giá mới của từng xe', () => {
    open();

    // Mặc định +30%: 520.000 → 680.000 (làm tròn bội 10k), 1.500.000 → 1.950.000.
    expect(screen.getByText('680.000 ₫')).toBeTruthy();
    expect(screen.getByText('1.950.000 ₫')).toBeTruthy();
  });

  it('gửi lên đúng chế độ percent, và khoảng mặc định là TRỌN CỤM ngày lễ', () => {
    open();
    fireEvent.click(screen.getByText(/Đặt giá 2 xe/));

    expect(hooks.price).toHaveBeenCalledWith(
      expect.objectContaining({
        from: '2026-08-31',
        // Không phải 31/08: cụm Quốc khánh 31/08–02/09 liền kề nên dialog mở sẵn ở chế độ
        // khoảng. Người bấm vào ngày lễ nghĩ "cả dịp", không phải "đúng ngày này".
        to: '2026-09-02',
        mode: 'percent',
        percent: 30,
        vehicleIds: ['i10', 'everest'],
      }),
      expect.anything(),
    );
  });

  it('chuyển sang ĐỒNG GIÁ thì cảnh báo độ lệch giá', () => {
    open();
    fireEvent.click(screen.getByText('Đồng giá'));

    // 1.500.000 / 520.000 ≈ 2,9 lần — vượt ngưỡng nên phải nói ra.
    expect(screen.getByText(/lệch nhau tới 2\.9 lần/)).toBeTruthy();
  });

  it('xe chưa cấu hình giá bị đánh dấu BỎ QUA, không thành 0đ', () => {
    hooks.vehicles = [
      ...FLEET,
      {
        vehicleId: 'no-price',
        name: 'Xe chưa có giá',
        plateNumber: null,
        vehicleType: 'car',
        weekdayPrice: null,
        weekendPrice: null,
        busyDates: [],
      },
    ];
    open();

    expect(screen.getByText('Bỏ qua')).toBeTruthy();
    expect(screen.queryByText('0 ₫')).toBeNull();
  });
});

describe('BulkDayBlockDialog', () => {
  function open() {
    return render(
      <App>
        <BulkDayBlockDialog state={STATE} onClose={vi.fn()} />
      </App>,
    );
  }

  it('dựng xong và DỪNG LẠI — không vòng lặp render', () => {
    expect(() => open()).not.toThrow();
    expect(screen.getByText('Khóa toàn bộ xe')).toBeTruthy();
  });

  it('nút nằm ở FOOTER của modal', () => {
    const { baseElement } = open();

    const footer = baseElement.querySelector('.ant-modal-footer');
    expect(within(footer as HTMLElement).getByText(/Khóa 2 xe/)).toBeTruthy();
  });

  it('cụm ngày lễ nhiều ngày ⇒ mở thẳng ở chế độ chọn khoảng', () => {
    open();

    expect(screen.getByText(/Gợi ý theo dịp lễ: 31\/08\/2026 – 02\/09\/2026/)).toBeTruthy();
  });

  it('xe bận trọn khoảng được đếm riêng và KHÔNG gửi lên', () => {
    hooks.vehicles = [FLEET[0]!, { ...FLEET[1]!, busyDates: ['2026-08-31'] }];
    open();

    expect(screen.getByText(/Khóa được 1\/2 xe/)).toBeTruthy();

    fireEvent.click(screen.getByText(/Khóa 1 xe/));
    expect(hooks.block).toHaveBeenCalledWith(
      expect.objectContaining({ vehicleIds: ['i10'] }),
      expect.anything(),
    );
  });
});

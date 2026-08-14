import { cleanup, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it } from 'vitest';
import { DEPOSIT_STATUS, SURCHARGE_CATEGORY } from '@xeprime/types';

import { TripFinanceCard } from './TripFinanceCard';
import type { CustomerTripFinance } from '../types';

/**
 * Hoá đơn phía khách.
 *
 * Điều được khoá: mọi con số hiển thị đến THẲNG từ server. Nếu component bắt đầu tự cộng trừ,
 * các test dưới đây vẫn xanh nhưng hoá đơn của khách sẽ trôi khỏi sổ của chủ xe — nên chúng
 * kiểm ngược lại: số nào server gửi thì số đó phải xuất hiện, không có số nào tự sinh.
 */
afterEach(cleanup);

const BASE: CustomerTripFinance = {
  currency: 'VND',
  baseAmount: '3150000.00',
  discountAmount: '378000.00',
  deliveryFee: '0.00',
  rentalTotal: '2772000.00',
  surcharges: [],
  surchargeTotal: '0.00',
  finalTotal: '2772000.00',
  rentalPaid: '0.00',
  depositRequired: '0.00',
  depositReceived: '0.00',
  depositDeducted: '0.00',
  additionalDue: '0.00',
  expectedRefund: '0.00',
  depositStatus: DEPOSIT_STATUS.NONE,
  refundAmount: null,
  refundMethod: null,
  refundedAt: null,
  refundReference: null,
  legacyPricing: false,
};

function money(text: string): boolean {
  return screen.queryAllByText((_, node) => node?.textContent?.includes(text) === true).length > 0;
}

describe('Bảng giá trước chuyến', () => {
  it('phí giao nhận 0 hiện `Miễn phí`, không phải `0 đ`', () => {
    render(<TripFinanceCard finance={BASE} closed={false} />);
    expect(screen.getByText('Miễn phí')).toBeTruthy();
  });

  it('không có bất kỳ nút duyệt/từ chối nào — khách đọc, không phê duyệt', () => {
    render(
      <TripFinanceCard
        finance={{
          ...BASE,
          deliveryFee: '120000.00',
          rentalTotal: '2892000.00',
          finalTotal: '2892000.00',
        }}
        closed={false}
      />,
    );
    // Phí giao nhận do chủ xe chốt sau khi thoả thuận ngoài ứng dụng (Wave 9): không có bước
    // khách xác nhận, nên cũng không được có nút nào ở đây.
    expect(screen.queryAllByRole('button')).toHaveLength(0);
    expect(money('2.892.000')).toBe(true);
  });
});

describe('Hoá đơn sau chuyến', () => {
  const WITH_SURCHARGE: CustomerTripFinance = {
    ...BASE,
    surcharges: [
      {
        category: SURCHARGE_CATEGORY.OVERTIME,
        amount: '150000.00',
        reason: 'Trả trễ 1.5 giờ',
        recordedAt: '2026-08-12T15:30:00.000Z',
      },
      {
        category: SURCHARGE_CATEGORY.CLEANING,
        amount: '100000.00',
        reason: 'Vệ sinh xe',
        recordedAt: '2026-08-12T15:31:00.000Z',
      },
    ],
    surchargeTotal: '250000.00',
    finalTotal: '3022000.00',
    depositRequired: '5000000.00',
    depositReceived: '5000000.00',
    depositDeducted: '250000.00',
    expectedRefund: '4750000.00',
    depositStatus: DEPOSIT_STATUS.AWAITING_REFUND,
  };

  it('hiện tổng CUỐI của server, không phải một tổng tự cộng ở client', () => {
    render(<TripFinanceCard finance={WITH_SURCHARGE} closed />);
    expect(money('3.022.000')).toBe(true);
  });

  it('phụ phí hiện kèm lý do để khách đối chiếu được', () => {
    render(<TripFinanceCard finance={WITH_SURCHARGE} closed />);
    expect(screen.getByText('Trả trễ 1.5 giờ')).toBeTruthy();
    expect(screen.getByText('Vệ sinh xe')).toBeTruthy();
  });

  it('nói rõ khấu trừ cọc là CÁCH TRẢ, không phải khoản bị trừ lần hai', () => {
    render(<TripFinanceCard finance={WITH_SURCHARGE} closed />);
    expect(screen.getByText(/không phải một khoản bị trừ thêm/)).toBeTruthy();
  });

  it('chờ hoàn cọc: nói XePrime chỉ ghi nhận, không chuyển tiền', () => {
    render(<TripFinanceCard finance={WITH_SURCHARGE} closed />);
    expect(screen.getByText(/không thực hiện chuyển tiền/)).toBeTruthy();
    expect(screen.queryAllByRole('button')).toHaveLength(0);
  });
});

describe('Các trạng thái cọc', () => {
  it('cấu hình có cọc nhưng CHƯA thu: không mời hoàn tiền', () => {
    render(
      <TripFinanceCard
        finance={{
          ...BASE,
          depositRequired: '5000000.00',
          depositStatus: DEPOSIT_STATUS.NOT_RECEIVED,
        }}
        closed
      />,
    );
    expect(screen.getByText(/chưa ghi nhận đã thu khoản cọc/i)).toBeTruthy();
    expect(screen.queryByText(/Dự kiến hoàn lại/)).toBeNull();
  });

  it('không yêu cầu cọc: ẩn hẳn khối cọc thay vì hiện một khối 0 đ', () => {
    render(<TripFinanceCard finance={BASE} closed />);
    expect(screen.queryByLabelText('Tiền đặt cọc')).toBeNull();
  });

  /**
   * Wave 11.1 — chuyến đang chạy mà đã thu cọc thì tiền đó phải HIỆN. Trước đây trạng thái này
   * rơi vào `NONE` nên khối cọc bị ẩn hẳn: khách đã đưa 5 triệu mà màn hình không nhắc gì.
   */
  it('đang giữ cọc giữa chuyến: hiện khối cọc, KHÔNG đoán trước số hoàn', () => {
    render(
      <TripFinanceCard
        finance={{
          ...BASE,
          depositRequired: '5000000.00',
          depositReceived: '5000000.00',
          depositStatus: DEPOSIT_STATUS.RECEIVED,
        }}
        closed={false}
      />,
    );

    expect(screen.getByLabelText('Tiền đặt cọc')).toBeTruthy();
    expect(screen.getByText('Đã nhận cọc')).toBeTruthy();
    expect(money('5.000.000')).toBe(true);
    // Chưa trả xe thì chưa biết có phát sinh gì — một con số "dự kiến hoàn" lúc này là phỏng đoán.
    expect(screen.queryByText('Dự kiến hoàn lại')).toBeNull();
    expect(screen.getByText(/Số tiền hoàn lại sẽ được chốt sau khi bạn trả xe/)).toBeTruthy();
  });

  it('phụ phí ăn hết cọc: `Đã quyết toán cọc`, không mời hoàn 0 đ', () => {
    render(
      <TripFinanceCard
        finance={{
          ...BASE,
          surchargeTotal: '1000000.00',
          finalTotal: '3772000.00',
          depositRequired: '1000000.00',
          depositReceived: '1000000.00',
          depositDeducted: '1000000.00',
          expectedRefund: '0.00',
          depositStatus: DEPOSIT_STATUS.SETTLED,
        }}
        closed
      />,
    );

    expect(screen.getByText('Đã quyết toán cọc')).toBeTruthy();
    expect(screen.getByText(/không còn tiền hoàn lại/)).toBeTruthy();
    expect(screen.queryByText(/XePrime ghi nhận trạng thái/)).toBeNull();
  });

  it('đã hoàn: hiện số thực hoàn, phương thức và mã tham chiếu', () => {
    render(
      <TripFinanceCard
        finance={{
          ...BASE,
          depositRequired: '5000000.00',
          depositReceived: '5000000.00',
          depositDeducted: '250000.00',
          expectedRefund: '4750000.00',
          depositStatus: DEPOSIT_STATUS.REFUNDED,
          refundAmount: '4750000.00',
          refundMethod: 'bank_transfer',
          refundedAt: '2026-08-13T03:00:00.000Z',
          refundReference: 'REF-92837492',
        }}
        closed
      />,
    );
    expect(screen.getByText('Số tiền thực hoàn')).toBeTruthy();
    expect(money('4.750.000')).toBe(true);
    expect(screen.getByText(/REF-92837492/)).toBeTruthy();
  });

  it('phụ phí vượt cọc: nói rõ phải trả thêm bao nhiêu', () => {
    render(
      <TripFinanceCard
        finance={{
          ...BASE,
          surchargeTotal: '900000.00',
          finalTotal: '3672000.00',
          depositRequired: '500000.00',
          depositReceived: '500000.00',
          depositDeducted: '500000.00',
          additionalDue: '400000.00',
          expectedRefund: '0.00',
          depositStatus: DEPOSIT_STATUS.AWAITING_REFUND,
        }}
        closed
      />,
    );
    expect(screen.getByText(/Cần thanh toán thêm/)).toBeTruthy();
    expect(money('400.000')).toBe(true);
  });

  it('đơn cũ thiếu snapshot giá: nói thẳng là thiếu chi tiết', () => {
    render(<TripFinanceCard finance={{ ...BASE, legacyPricing: true }} closed />);
    expect(screen.getByText(/chỉ còn lưu tổng tiền/)).toBeTruthy();
  });
});

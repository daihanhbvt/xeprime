import { render, screen } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { CustomerUnpaidHold } from '../types';
import { UnpaidHoldsReminder } from './UnpaidHoldsReminder';

/**
 * Thẻ nhắc thanh toán đầu "Chuyến của tôi" (13/10/2026).
 *
 * Điều được khoá: chỉ hiện khi CÓ chuyến chưa trả; mỗi chuyến một lối trả thẳng sang trang thanh
 * toán của đúng chuyến đó; chạm trần thì nói rõ là KHÔNG đặt thêm được — đây là nơi khách bị chặn
 * tìm tới để hiểu vì sao.
 */
const unpaid = vi.hoisted(() => ({ data: undefined as unknown }));
vi.mock('../hooks', () => ({ useUnpaidHolds: () => unpaid }));

function hold(n: number, minutesLeft = 30): CustomerUnpaidHold {
  return {
    tripId: `T${n}`,
    code: `XPH0000000${n}`,
    vehicleName: `Xe số ${n}`,
    vehicleImageUrl: null,
    pickupAt: '2026-10-23T10:00:00.000Z',
    returnAt: '2026-10-24T03:00:00.000Z',
    remainingAmount: '176000',
    expiresAt: new Date(Date.now() + minutesLeft * 60_000).toISOString(),
  };
}

beforeEach(() => {
  unpaid.data = undefined;
});

describe('UnpaidHoldsReminder', () => {
  it('không có chuyến chưa trả (hoặc chưa tải xong) ⇒ không vẽ gì', () => {
    const { container, rerender } = render(<UnpaidHoldsReminder />);
    expect(container.textContent).toBe('');

    unpaid.data = { limit: 3, limitReached: false, items: [] };
    rerender(<UnpaidHoldsReminder />);
    expect(container.textContent).toBe('');
  });

  it('dưới trần ⇒ nhắc nhẹ, mỗi chuyến một nút trả tới đúng trang thanh toán', () => {
    unpaid.data = { limit: 3, limitReached: false, items: [hold(1), hold(2)] };
    render(<UnpaidHoldsReminder />);

    expect(screen.getByRole('heading', { name: 'Bạn có 2 chuyến chờ thanh toán' })).toBeTruthy();
    expect(screen.getByText(/tự huỷ khi hết thời gian giữ chỗ/)).toBeTruthy();
    const links = screen.getAllByRole('link', { name: /Thanh toán chuyến/ });
    expect(links.map((link) => link.getAttribute('href'))).toEqual(['/payment/T1', '/payment/T2']);
    expect(screen.getAllByText(/176\.000/)).toHaveLength(2);
  });

  it('chạm trần ⇒ nói rõ không đặt thêm xe được', () => {
    unpaid.data = { limit: 3, limitReached: true, items: [hold(1), hold(2), hold(3)] };
    render(<UnpaidHoldsReminder />);

    expect(
      screen.getByRole('heading', { name: 'Bạn đã giữ tối đa 3 chuyến chưa thanh toán' }),
    ).toBeTruthy();
    expect(screen.getByText(/chưa thể đặt thêm xe/)).toBeTruthy();
  });
});

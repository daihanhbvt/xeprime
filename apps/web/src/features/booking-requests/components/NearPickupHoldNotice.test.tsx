import { cleanup, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { PublicQuote } from '@/features/rental-policies/types';
import { renderWithIntl } from '@/i18n/test-utils';
import { toAppTz } from '@/lib/datetime';
import { NearPickupHoldNotice } from './NearPickupHoldNotice';

/**
 * Cảnh báo ĐẶT SÁT GIỜ trước khi khách gửi yêu cầu (ADR 0032 điều 5 · ADR 0066) — các vùng của
 * `holdWindowsPreview` trên chính sách 2 giờ huỷ miễn phí / 120 phút thanh toán:
 *  - đủ xa (cả hai cửa sổ chạm trần — ΔT ≥ 10 giờ): không vẽ gì;
 *  - cận ngày: cả hai cửa sổ co theo ΔT (huỷ 20%, thanh toán 30%);
 *  - chính sách tắt huỷ miễn phí: nói rõ không có huỷ miễn phí — cả khi chuyến đặt xa;
 *  - quá gần (< 15 phút): không kịp thanh toán.
 */
const NOW = Date.parse('2026-08-10T00:00:00.000Z');

vi.mock('@/hooks/use-now', () => ({ useNow: () => NOW }));

const FEES = {
  holdAmount: '100000',
  policy: { freeCancelHours: 2, holdPaymentWindowMinutes: 120 },
} as unknown as PublicQuote['breakdown']['fees'];

function renderAt(minutesFromNow: number, fees: PublicQuote['breakdown']['fees'] = FEES) {
  const pickupAt = toAppTz(new Date(NOW + minutesFromNow * 60_000).toISOString());
  return renderWithIntl(<NearPickupHoldNotice pickupAt={pickupAt} fees={fees} />);
}

afterEach(cleanup);

describe('NearPickupHoldNotice', () => {
  it('đặt XA ⇒ không cảnh báo', () => {
    const { container } = renderAt(25 * 60);
    expect(container.textContent).toBe('');
  });

  it('10 giờ: cả hai cửa sổ đã chạm trần ⇒ không cảnh báo', () => {
    const { container } = renderAt(10 * 60);
    expect(container.textContent).toBe('');
  });

  it('chuyến không thu tiền giữ chỗ ⇒ không cảnh báo', () => {
    const noHold = { ...FEES, holdAmount: null } as unknown as PublicQuote['breakdown']['fees'];
    const { container } = renderAt(60, noHold);
    expect(container.textContent).toBe('');
  });

  it('cận ngày (5 giờ) ⇒ hai cửa sổ co: 1 giờ 30 phút thanh toán, 1 giờ huỷ miễn phí', () => {
    renderAt(5 * 60);
    expect(screen.getByText('Bạn đang đặt sát giờ nhận xe')).toBeTruthy();
    expect(
      screen.getByText(/khoảng 1 giờ 30 phút để thanh toán .* huỷ miễn phí trong khoảng 1 giờ/),
    ).toBeTruthy();
  });

  it('gấp (90 phút) ⇒ VẪN có huỷ miễn phí: 27 phút thanh toán, 18 phút huỷ', () => {
    renderAt(90);
    expect(
      screen.getByText(/khoảng 27 phút để thanh toán .* huỷ miễn phí trong khoảng 18 phút/),
    ).toBeTruthy();
  });

  it('chính sách tắt huỷ miễn phí ⇒ nói rõ không có thời gian huỷ miễn phí', () => {
    const off = {
      ...FEES,
      policy: { freeCancelHours: 0, holdPaymentWindowMinutes: 120 },
    } as unknown as PublicQuote['breakdown']['fees'];
    renderAt(90, off);
    expect(
      screen.getByText(/khoảng 27 phút để thanh toán .* không có thời gian huỷ miễn phí/),
    ).toBeTruthy();
  });

  it('chính sách tắt huỷ miễn phí + đặt XA ⇒ vẫn báo, tiêu đề không nói "sát giờ"', () => {
    const off = {
      ...FEES,
      policy: { freeCancelHours: 0, holdPaymentWindowMinutes: 120 },
    } as unknown as PublicQuote['breakdown']['fees'];
    renderAt(25 * 60, off);
    expect(screen.getByText('Chuyến này không có thời gian huỷ miễn phí')).toBeTruthy();
    expect(screen.queryByText('Bạn đang đặt sát giờ nhận xe')).toBeNull();
    expect(
      screen.getByText(/khoảng 2 giờ để thanh toán .* không có thời gian huỷ miễn phí/),
    ).toBeTruthy();
  });

  it('quá gần (10 phút) ⇒ báo không kịp thanh toán', () => {
    renderAt(10);
    expect(screen.getByText(/Giờ nhận xe quá gần để kịp thanh toán/)).toBeTruthy();
  });
});

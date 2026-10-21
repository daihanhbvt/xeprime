import { cleanup, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { PublicQuote } from '@/features/rental-policies/types';
import { renderWithIntl } from '@/i18n/test-utils';
import { toAppTz } from '@/lib/datetime';
import { NearPickupHoldNotice } from './NearPickupHoldNotice';

/**
 * Cảnh báo ĐẶT SÁT GIỜ trước khi khách gửi yêu cầu (ADR 0032 điều 5 · ADR 0064) — bốn vùng của
 * `holdWindowsPreview` trên chính sách 4 giờ huỷ miễn phí / 120 phút thanh toán:
 *  - xa (≥ 24 giờ): không vẽ gì;
 *  - cận ngày: cả hai cửa sổ co theo ΔT;
 *  - gấp (< 2 giờ): không có huỷ miễn phí;
 *  - quá gần (< 15 phút): không kịp thanh toán.
 */
const NOW = Date.parse('2026-08-10T00:00:00.000Z');

vi.mock('@/hooks/use-now', () => ({ useNow: () => NOW }));

const FEES = {
  holdAmount: '100000',
  policy: { freeCancelHours: 4, holdPaymentWindowMinutes: 120 },
} as unknown as PublicQuote['breakdown']['fees'];

function renderAt(minutesFromNow: number, fees: PublicQuote['breakdown']['fees'] = FEES) {
  const pickupAt = toAppTz(new Date(NOW + minutesFromNow * 60_000).toISOString());
  return renderWithIntl(<NearPickupHoldNotice pickupAt={pickupAt} fees={fees} />);
}

afterEach(cleanup);

describe('NearPickupHoldNotice', () => {
  it('đặt XA (≥ 24 giờ) ⇒ không cảnh báo', () => {
    const { container } = renderAt(25 * 60);
    expect(container.textContent).toBe('');
  });

  it('chuyến không thu tiền giữ chỗ ⇒ không cảnh báo', () => {
    const noHold = { ...FEES, holdAmount: null } as unknown as PublicQuote['breakdown']['fees'];
    const { container } = renderAt(60, noHold);
    expect(container.textContent).toBe('');
  });

  it('cận ngày (10 giờ) ⇒ hai cửa sổ co: 2 giờ thanh toán, 3 giờ huỷ miễn phí', () => {
    renderAt(10 * 60);
    expect(screen.getByText('Bạn đang đặt sát giờ nhận xe')).toBeTruthy();
    expect(
      screen.getByText(/khoảng 2 giờ để thanh toán .* trong khoảng 3 giờ sau lúc/),
    ).toBeTruthy();
  });

  it('gấp (90 phút) ⇒ không có huỷ miễn phí, cửa sổ thanh toán 36 phút', () => {
    renderAt(90);
    expect(
      screen.getByText(/khoảng 36 phút để thanh toán .* không có thời gian huỷ miễn phí/),
    ).toBeTruthy();
  });

  it('quá gần (10 phút) ⇒ báo không kịp thanh toán', () => {
    renderAt(10);
    expect(screen.getByText(/Giờ nhận xe quá gần để kịp thanh toán/)).toBeTruthy();
  });
});

import { cleanup, screen } from '@testing-library/react';
import { afterEach, describe, expect, it } from 'vitest';
import { bookingPath } from '@/constants/routes';
import { renderWithIntl } from '@/i18n/test-utils';
import { VehicleStillOutAlert } from './VehicleStillOutAlert';

/**
 * Cảnh báo "xe chưa về" trong hộp duyệt — server tính `vehicleStillOut`, client chỉ vẽ: mã chuyến
 * đang trễ, trễ bao lâu, và lối mở chuyến đó. Không có chuyến trễ ⇒ không vẽ gì.
 */
afterEach(cleanup);

describe('VehicleStillOutAlert', () => {
  it('có chuyến quá giờ trả ⇒ nói mã chuyến, thời gian trễ và link mở chuyến', () => {
    renderWithIntl(
      <VehicleStillOutAlert
        stillOut={{
          bookingId: 'BK1',
          bookingCode: 'DHX1',
          returnAt: new Date(Date.now() - 3 * 3_600_000).toISOString(),
        }}
      />,
    );
    expect(screen.getByText(/Xe chưa về từ chuyến #DHX1 - đã quá giờ trả 3 giờ/)).toBeTruthy();
    expect(screen.getByRole('link', { name: 'Mở chuyến đang trễ' }).getAttribute('href')).toBe(
      bookingPath.detail('BK1'),
    );
  });

  it('không có chuyến trễ ⇒ không vẽ gì', () => {
    const { container } = renderWithIntl(<VehicleStillOutAlert stillOut={null} />);
    expect(container.textContent).toBe('');
  });
});

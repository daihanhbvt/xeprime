import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { RequestBookingButton } from './RequestBookingButton';

/**
 * CTA vào luồng thuê ở trang chi tiết xe (Wave 11.1).
 *
 * Điều được khoá là RANH GIỚI THUẬT NGỮ, thứ rất dễ bị "thống nhất" nhầm bằng một lần
 * find-and-replace: nút mở luồng nói `Chọn thuê` (khách mới đang chọn xe), còn tên nghiệp vụ
 * `Yêu cầu thuê` vẫn sống ở tiêu đề modal và nút gửi cuối cùng — nơi khách thật sự gửi đi.
 */
vi.mock('./RequestBookingModal', () => ({
  RequestBookingModal: ({ open }: { open: boolean }) =>
    open ? (
      <div role="dialog" aria-label="Yêu cầu thuê xe">
        <button type="button">Gửi yêu cầu thuê</button>
      </div>
    ) : null,
}));

afterEach(cleanup);

function renderCta() {
  return render(<RequestBookingButton vehicleId="V1" vehicleName="Toyota Camry 2024" />);
}

describe('RequestBookingButton', () => {
  it('nhãn CTA là `Chọn thuê`, không phải tên nghiệp vụ', () => {
    renderCta();
    expect(screen.getByRole('button', { name: 'Chọn thuê' })).toBeTruthy();
    expect(screen.queryByRole('button', { name: 'Yêu cầu thuê' })).toBeNull();
  });

  it('bấm vào mở đúng modal cũ, không phải một luồng thứ hai', () => {
    renderCta();
    expect(screen.queryByRole('dialog')).toBeNull();

    fireEvent.click(screen.getByRole('button', { name: 'Chọn thuê' }));

    const dialog = screen.getByRole('dialog');
    // Tiêu đề nghiệp vụ giữ nguyên: đây vẫn là luồng gửi YÊU CẦU thuê.
    expect(dialog.getAttribute('aria-label')).toBe('Yêu cầu thuê xe');
  });

  it('nút gửi cuối cùng vẫn nói rõ là GỬI YÊU CẦU', () => {
    renderCta();
    fireEvent.click(screen.getByRole('button', { name: 'Chọn thuê' }));
    expect(screen.getByRole('button', { name: 'Gửi yêu cầu thuê' })).toBeTruthy();
  });
});

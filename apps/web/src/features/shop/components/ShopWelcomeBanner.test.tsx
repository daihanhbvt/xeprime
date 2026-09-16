import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { SHOP_LOGO_TRIGGER_ID } from '@/constants/routes';

import { ShopWelcomeBanner } from './ShopWelcomeBanner';

/**
 * DẢI CHÀO MỪNG sau lần thanh toán gói đầu tiên (ADR 0040).
 *
 * Ba bất biến, và cái thứ ba là cái dễ mất nhất:
 *
 *  1. Thiếu logo ⇒ nói "còn 1 bước", và CTA làm ĐÚNG việc nó hứa.
 *  2. Đủ logo mà chưa có xe ⇒ mời đăng xe đầu tiên.
 *  3. Đủ logo và đã có xe ⇒ KHÔNG DỰNG GÌ. Một dải "mọi thứ đều ổn" đứng thường trực chỉ dạy
 *     người dùng bỏ qua vùng ấy, và đúng lúc có tin xấu thì họ cũng không đọc nữa.
 */
afterEach(cleanup);

/** Ô logo THẬT nằm trong form hồ sơ; ở đây dựng một nút mang đúng `id` để kiểm đích của CTA. */
function withLogoTarget(ui: React.ReactElement) {
  return render(
    <>
      {ui}
      <button id={SHOP_LOGO_TRIGGER_ID} type="button">
        Tải ảnh lên
      </button>
    </>,
  );
}

describe('ShopWelcomeBanner', () => {
  it('thiếu logo: nói "còn 1 bước" và mời tải logo', () => {
    render(<ShopWelcomeBanner missingLogo hasVehicle={false} />);

    expect(screen.getByText('Còn 1 bước để đăng xe')).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Tải logo' })).toBeTruthy();
  });

  /**
   * CTA phải CUỘN TỚI và ĐẶT TIÊU ĐIỂM vào chính nút mở hộp chọn file.
   *
   * Tiêu điểm là nửa thường bị quên: cuộn không thôi thì người dùng bàn phím vẫn đứng ở dải thông
   * báo, và phím Tab tiếp theo đưa họ sang một nút khác hẳn. Sau lời gọi này, `Enter` mở ngay hộp
   * chọn file — tức CTA làm trọn việc nó hứa.
   */
  it('CTA cuộn tới VÀ đặt tiêu điểm vào ô logo', () => {
    const scrollIntoView = vi.fn();
    withLogoTarget(<ShopWelcomeBanner missingLogo hasVehicle={false} />);
    const target = document.getElementById(SHOP_LOGO_TRIGGER_ID)!;
    target.scrollIntoView = scrollIntoView;

    fireEvent.click(screen.getByRole('button', { name: 'Tải logo' }));

    expect(scrollIntoView).toHaveBeenCalledTimes(1);
    expect(document.activeElement).toBe(target);
  });

  it('đủ logo, chưa có xe: mời đăng xe đầu tiên', () => {
    render(<ShopWelcomeBanner missingLogo={false} hasVehicle={false} />);

    expect(screen.getByText('Gian hàng đã sẵn sàng')).toBeTruthy();
    expect(screen.getByRole('link', { name: /Đăng xe đầu tiên/ })).toBeTruthy();
  });

  it('đủ logo và đã có xe: KHÔNG dựng gì', () => {
    const { container } = render(<ShopWelcomeBanner missingLogo={false} hasVehicle />);
    expect(container.textContent).toBe('');
  });

  /*
   * Thiếu logo THẮNG cả khi đã có xe: xe đó không lên chợ được cho tới khi có logo (cổng ở
   * `submitForPublicReview`), nên nói "sẵn sàng rồi" lúc đó là nói sai.
   */
  it('thiếu logo thắng, kể cả khi đã có xe', () => {
    render(<ShopWelcomeBanner missingLogo hasVehicle />);
    expect(screen.getByText('Còn 1 bước để đăng xe')).toBeTruthy();
    expect(screen.queryByText('Gian hàng đã sẵn sàng')).toBeNull();
  });
});

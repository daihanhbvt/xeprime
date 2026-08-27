import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { describe, expect, it } from 'vitest';

import { PreviewImage } from './PreviewImage';

/**
 * Class kích thước của nơi gọi phải dừng lại ở cái vỏ `.ant-image`. Nếu nó đi qua
 * `rootClassName`, AntD dán luôn lên root của trình xem toàn màn hình và trình xem co lại
 * đúng bằng thumbnail ở góc trái trên — lỗi đã gặp ở /trips/:id và /manage/bookings/:id.
 */
describe('PreviewImage', () => {
  it('đặt class của nơi gọi lên vỏ ảnh, không lên <img>', () => {
    const { container } = render(<PreviewImage src="/xe.jpg" alt="Xe" className="thumb-96" />);

    expect(container.querySelector('.ant-image')?.classList.contains('thumb-96')).toBe(true);
    expect(container.querySelector('.ant-image-img')?.classList.contains('thumb-96')).toBe(false);
  });

  it('KHÔNG rò class đó sang trình xem toàn màn hình', async () => {
    render(<PreviewImage src="/xe.jpg" alt="Xe" className="thumb-96" />);

    fireEvent.click(screen.getByRole('button', { name: 'Xe' }));

    await waitFor(() => expect(document.querySelector('.ant-image-preview')).not.toBeNull());
    expect(document.querySelector('.ant-image-preview')?.classList.contains('thumb-96')).toBe(
      false,
    );
  });
});

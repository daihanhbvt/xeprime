import { cleanup, fireEvent, screen } from '@testing-library/react';
import { afterEach, describe, expect, it } from 'vitest';

import { renderWithIntl } from '@/i18n/test-utils';
import { ListingGallery } from './ListingGallery';

afterEach(cleanup);

describe('ListingGallery — dải ảnh nhỏ (mobile)', () => {
  it('bấm ảnh nhỏ thì chọn đúng tấm và cập nhật bộ đếm', () => {
    renderWithIntl(
      <ListingGallery
        name="Fadil"
        mainImageUrl="https://img.test/a.jpg"
        images={['https://img.test/b.jpg', 'https://img.test/c.jpg']}
      />,
    );
    const thumbs = screen.getAllByRole('button', { name: /\d+ \/ 3/ });
    expect(thumbs).toHaveLength(3);
    expect(thumbs[0]!.getAttribute('aria-current')).toBe('true');

    fireEvent.click(thumbs[2]!);
    expect(thumbs[2]!.getAttribute('aria-current')).toBe('true');
    expect(thumbs[0]!.hasAttribute('aria-current')).toBe(false);
    expect(screen.getByText('3 / 3')).toBeTruthy();
  });

  it('chỉ một ảnh thì không có dải ảnh nhỏ', () => {
    renderWithIntl(
      <ListingGallery name="Fadil" mainImageUrl="https://img.test/a.jpg" images={[]} />,
    );
    expect(screen.queryByRole('group')).toBeNull();
  });
});

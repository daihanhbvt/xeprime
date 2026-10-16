import { cleanup, render, screen, within } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { CATALOG_TYPE } from '@xeprime/types';
import type { CatalogItem } from '@/features/catalog/types';
import { VehicleTypes, homeShowcaseBodyTypes } from './VehicleTypes';

/**
 * Khối "Loại xe" trang chủ đọc DANH MỤC kiểu dáng (admin bật "Hiện ở trang chủ", tải ảnh lớn, nhập
 * dòng ví dụ) — không còn danh sách gán cứng. Khoá: lọc đúng mục, tên/thứ tự của danh mục, link
 * lọc đúng kiểu dáng.
 */
vi.mock('next-intl/server', async () => {
  const { serverTranslationsStub } = await import('@/i18n/test-utils');
  return serverTranslationsStub('vi');
});

afterEach(cleanup);

function bodyType(key: string, overrides: Partial<CatalogItem> = {}): CatalogItem {
  return {
    id: `cat-${key}`,
    type: CATALOG_TYPE.BODY_TYPE,
    key,
    label: key.toUpperCase(),
    description: null,
    iconUrl: null,
    showOnHome: true,
    showcaseImageUrl: `https://cdn.example.com/catalog/${key}.webp`,
    showcaseExamples: null,
    sortOrder: 0,
    active: true,
    vehicleTypes: ['car'],
    ...overrides,
  };
}

describe('homeShowcaseBodyTypes', () => {
  it('chỉ giữ mục bật "Hiện ở trang chủ" CÓ ảnh, giữ nguyên thứ tự danh mục', () => {
    const picked = homeShowcaseBodyTypes([
      bodyType('suv'),
      bodyType('sedan', { showOnHome: false }),
      bodyType('mpv', { showcaseImageUrl: null }),
      bodyType('mini'),
    ]);
    expect(picked.map((item) => item.key)).toEqual(['suv', 'mini']);
  });
});

describe('VehicleTypes', () => {
  it('thẻ mang tên + dòng ví dụ của danh mục, link lọc đúng kiểu dáng', async () => {
    render(
      await VehicleTypes({
        items: [
          bodyType('suv', { label: 'SUV', showcaseExamples: 'Mazda CX-5, Ford Territory' }),
          bodyType('pickup', { label: 'Bán tải', vehicleTypes: [] }),
        ],
      }),
    );

    const suv = screen.getByRole('link', { name: /SUV/ });
    expect(suv.getAttribute('href')).toBe('/search?vehicleType=car&bodyType=suv');
    expect(within(suv).getByText('Mazda CX-5, Ford Territory')).toBeTruthy();
    expect(suv.querySelector('img')?.getAttribute('src')).toBe(
      'https://cdn.example.com/catalog/suv.webp',
    );

    // Áp dụng mọi loại xe ⇒ link không ép loại xe; không có dòng ví dụ ⇒ không có dòng trống.
    const pickup = screen.getByRole('link', { name: /Bán tải/ });
    expect(pickup.getAttribute('href')).toBe('/search?bodyType=pickup');
    expect(pickup.textContent).toBe('Bán tải');
  });
});

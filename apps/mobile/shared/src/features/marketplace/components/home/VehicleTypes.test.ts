import type { CatalogItem } from '@/api/catalog';
import { homeShowcaseBodyTypes, typeSearchParams } from './VehicleTypes';

function bodyType(patch: Partial<CatalogItem>): CatalogItem {
  return {
    id: 'id',
    type: 'body_type',
    key: 'suv',
    label: 'SUV',
    description: null,
    iconUrl: null,
    showOnHome: true,
    showcaseImageUrl: 'https://cdn/suv.webp',
    showcaseExamples: null,
    sortOrder: 0,
    active: true,
    vehicleTypes: ['car'],
    ...patch,
  } as CatalogItem;
}

describe('homeShowcaseBodyTypes', () => {
  it('chỉ giữ kiểu dáng BẬT trang chủ VÀ có ảnh, giữ nguyên thứ tự danh mục', () => {
    const items = [
      bodyType({ key: 'a' }),
      bodyType({ key: 'b', showOnHome: false }),
      bodyType({ key: 'c', showcaseImageUrl: null }),
      bodyType({ key: 'd' }),
    ];
    expect(homeShowcaseBodyTypes(items).map((item) => item.key)).toEqual(['a', 'd']);
  });
});

describe('typeSearchParams', () => {
  it('kiểu dáng của đúng MỘT loại xe ⇒ mang luôn loại xe đó', () => {
    expect(typeSearchParams(bodyType({ key: 'suv', vehicleTypes: ['car'] }))).toEqual({
      vehicleType: 'car',
      bodyType: 'suv',
    });
  });

  it('nhiều loại xe ⇒ chỉ lọc kiểu dáng, như web', () => {
    expect(typeSearchParams(bodyType({ key: 'mini', vehicleTypes: ['car', 'motorbike'] }))).toEqual(
      { bodyType: 'mini' },
    );
  });
});

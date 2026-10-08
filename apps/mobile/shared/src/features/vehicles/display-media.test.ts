import { VEHICLE_IMAGE_TYPE } from '@xeprime/types';
import { vehicleDisplayMedia, vehicleGalleryItems } from './display-media';

describe('vehicleDisplayMedia', () => {
  it('bỏ ảnh loại "Ảnh khác" và ảnh đại diện, giữ thứ tự các góc chụp', () => {
    const result = vehicleDisplayMedia({
      mainImageUrl: 'main',
      media: [
        { url: 'main', type: VEHICLE_IMAGE_TYPE.FRONT },
        { url: 'other-1', type: VEHICLE_IMAGE_TYPE.OTHER },
        { url: 'rear', type: VEHICLE_IMAGE_TYPE.REAR },
        { url: 'other-2', type: VEHICLE_IMAGE_TYPE.OTHER },
        { url: 'left', type: VEHICLE_IMAGE_TYPE.LEFT },
      ],
    } as never);
    expect(result.map((i) => i.url)).toEqual(['rear', 'left']);
  });

  it('không có media → mảng rỗng', () => {
    expect(vehicleDisplayMedia({ mainImageUrl: null, media: null } as never)).toEqual([]);
  });
});

describe('vehicleGalleryItems', () => {
  const label = (type: string | null | undefined) => 'slot:' + String(type);

  it('ảnh bìa đứng đầu, ảnh có nhãn theo vị trí, BỎ ảnh loại "Ảnh khác"', () => {
    const result = vehicleGalleryItems(
      {
        mainImageUrl: 'rear',
        images: ['legacy'],
        media: [
          { url: 'front', type: VEHICLE_IMAGE_TYPE.FRONT },
          { url: 'other-1', type: VEHICLE_IMAGE_TYPE.OTHER },
          { url: 'rear', type: VEHICLE_IMAGE_TYPE.REAR },
        ],
      } as never,
      label,
    );
    expect(result).toEqual([
      { url: 'rear', label: 'slot:' + VEHICLE_IMAGE_TYPE.REAR },
      { url: 'front', label: 'slot:' + VEHICLE_IMAGE_TYPE.FRONT },
    ]);
  });

  it('ảnh bìa không nằm trong danh sách vẫn đứng đầu, không nhãn', () => {
    const result = vehicleGalleryItems(
      {
        mainImageUrl: 'cover',
        images: [],
        media: [{ url: 'left', type: VEHICLE_IMAGE_TYPE.LEFT }],
      } as never,
      label,
    );
    expect(result.map((i) => i.url)).toEqual(['cover', 'left']);
    expect(result[0]?.label).toBeNull();
  });

  it('chưa có ảnh gán vị trí → rơi về danh sách URL cũ', () => {
    const result = vehicleGalleryItems(
      { mainImageUrl: null, images: ['a', 'b'], media: [] } as never,
      label,
    );
    expect(result).toEqual([
      { url: 'a', label: null },
      { url: 'b', label: null },
    ]);
  });

  it('chỉ có ảnh "khác" → KHÔNG rơi về URL cũ (ảnh đã lọc không quay lại)', () => {
    const result = vehicleGalleryItems(
      {
        mainImageUrl: null,
        images: ['other-1'],
        media: [{ url: 'other-1', type: VEHICLE_IMAGE_TYPE.OTHER }],
      } as never,
      label,
    );
    expect(result).toEqual([]);
  });
});

import { VEHICLE_IMAGE_TYPE } from '@xeprime/types';
import { moveImageToSlot, type SlotItem } from './VehicleImagesScreen';

/** Bám `handleDragEnd` của `VehicleImageBoard` (web) khi thả một ảnh vào một Ô. */
describe('moveImageToSlot', () => {
  const items: SlotItem[] = [
    { url: 'a', type: VEHICLE_IMAGE_TYPE.FRONT },
    { url: 'b', type: VEHICLE_IMAGE_TYPE.REAR },
    { url: 'c', type: VEHICLE_IMAGE_TYPE.OTHER },
  ];

  it('ô đích ĐƠN đang có ảnh: hai ảnh đổi chỗ, thứ tự mảng giữ nguyên', () => {
    expect(moveImageToSlot(items, 'a', VEHICLE_IMAGE_TYPE.REAR)).toEqual([
      { url: 'a', type: VEHICLE_IMAGE_TYPE.REAR },
      { url: 'b', type: VEHICLE_IMAGE_TYPE.FRONT },
      { url: 'c', type: VEHICLE_IMAGE_TYPE.OTHER },
    ]);
  });

  it('ô đích trống: chỉ ảnh được chuyển đổi vị trí', () => {
    expect(moveImageToSlot(items, 'c', VEHICLE_IMAGE_TYPE.LEFT)).toEqual([
      items[0],
      items[1],
      { url: 'c', type: VEHICLE_IMAGE_TYPE.LEFT },
    ]);
  });

  it('cùng ô hoặc URL lạ: không đổi gì', () => {
    expect(moveImageToSlot(items, 'a', VEHICLE_IMAGE_TYPE.FRONT)).toEqual(items);
    expect(moveImageToSlot(items, 'zzz', VEHICLE_IMAGE_TYPE.LEFT)).toEqual(items);
  });
});

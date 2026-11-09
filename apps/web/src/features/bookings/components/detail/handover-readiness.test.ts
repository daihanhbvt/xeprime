import { HANDOVER_PHOTO_SLOT, VEHICLE_TYPE } from '@xeprime/types';
import { describe, expect, it } from 'vitest';

import { missingPhotoSlots } from './handover-readiness';

/**
 * Góc ảnh còn thiếu khi bấm giao/nhận xe — bộ góc theo LOẠI XE (`handoverPhotoSlotsFor`, chốt
 * 03/11/2026): ô tô 5 góc, xe máy 3 góc. Báo thiếu "trái/phải" cho xe máy là chặn một lượt bàn
 * giao bằng một góc chụp không tồn tại.
 */
describe('missingPhotoSlots', () => {
  it('ô tô chưa có ảnh nào → thiếu cả năm góc', () => {
    expect(missingPhotoSlots(undefined, VEHICLE_TYPE.CAR)).toEqual([
      HANDOVER_PHOTO_SLOT.FRONT,
      HANDOVER_PHOTO_SLOT.REAR,
      HANDOVER_PHOTO_SLOT.LEFT,
      HANDOVER_PHOTO_SLOT.RIGHT,
      HANDOVER_PHOTO_SLOT.ODOMETER,
    ]);
  });

  it('xe máy chỉ cần trước · sau · Odo - không bao giờ thiếu trái/phải', () => {
    expect(missingPhotoSlots([], VEHICLE_TYPE.MOTORBIKE)).toEqual([
      HANDOVER_PHOTO_SLOT.FRONT,
      HANDOVER_PHOTO_SLOT.REAR,
      HANDOVER_PHOTO_SLOT.ODOMETER,
    ]);
    const full = [
      { slot: HANDOVER_PHOTO_SLOT.FRONT },
      { slot: HANDOVER_PHOTO_SLOT.REAR },
      { slot: HANDOVER_PHOTO_SLOT.ODOMETER },
    ];
    expect(missingPhotoSlots(full, VEHICLE_TYPE.MOTORBIKE)).toEqual([]);
  });

  it('loại xe chưa biết → bộ đầy đủ của ô tô (thừa một ô trống còn hơn giấu một góc)', () => {
    expect(missingPhotoSlots([], null)).toHaveLength(5);
  });
});

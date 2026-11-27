import { HANDOVER_PHOTO_SLOT, VEHICLE_TYPE } from '@xeprime/types';
import { describe, expect, it } from 'vitest';

import { collateralPrepPlan, missingPhotoSlots, prepCollateralOf } from './handover-readiness';

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

/** Việc cọc lúc giao xe theo chính sách ĐÓNG BĂNG của đơn (ADR 0112 điều 2). */
describe('collateralPrepPlan', () => {
  const plan = (depositRequired: string, policy: Record<string, unknown> | null) =>
    collateralPrepPlan({ depositRequired }, prepCollateralOf({ priceSnapshot: { policy } }));

  it('miễn thế chấp → không việc nào', () => {
    expect(plan('0', { collateralMode: 'none' })).toBe('none');
  });

  it('chỉ cọc tiền / snapshot cũ `cash` → thu tiền', () => {
    expect(
      plan('500000', {
        collateralMode: 'required',
        collateralCashEnabled: true,
        collateralAssetEnabled: false,
      }),
    ).toBe('cash');
    expect(plan('500000', { collateralMode: 'cash', depositAmount: '500000' })).toBe('cash');
  });

  it('chỉ tài sản / snapshot cũ `asset` → nhận tài sản', () => {
    expect(plan('0', { collateralMode: 'asset', collateralAssetTypes: ['passport'] })).toBe(
      'asset',
    );
  });

  it('cả hai: một trong hai → một dòng, bắt buộc cả 2 → hai dòng', () => {
    const base = {
      collateralMode: 'required',
      collateralCashEnabled: true,
      collateralAssetEnabled: true,
      collateralAssetTypes: ['passport', 'motorbike'],
    };
    expect(plan('500000', { ...base, collateralCombination: 'any_one' })).toBe('either');
    expect(plan('500000', { ...base, collateralCombination: 'all' })).toBe('both');
  });

  it('không có snapshot → theo số cọc tiền của đơn như trước', () => {
    expect(plan('500000', null)).toBe('cash');
    expect(plan('0', null)).toBe('none');
  });
});

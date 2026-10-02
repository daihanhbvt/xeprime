import { VEHICLE_IMAGE_TYPE, VEHICLE_TYPE } from '@xeprime/types';
import { QUICK_VEHICLE_DEFAULTS } from './quick-schema';
import { quickVehicleToCreateInput } from './quick-mappers';

describe('quickVehicleToCreateInput', () => {
  it('gửi media đã trim kèm loại ảnh, biển số chữ hoa', () => {
    const input = quickVehicleToCreateInput({
      ...QUICK_VEHICLE_DEFAULTS,
      plateNumber: ' 51h-123.45 ',
      media: [{ url: ' https://cdn.test/a.jpg ', type: VEHICLE_IMAGE_TYPE.FRONT }],
    });
    expect(input.plateNumber).toBe('51H-123.45');
    expect((input as { media?: unknown }).media).toEqual([
      { url: 'https://cdn.test/a.jpg', type: VEHICLE_IMAGE_TYPE.FRONT },
    ]);
  });

  it('bodyType chỉ gửi cho ô tô', () => {
    const car = quickVehicleToCreateInput({
      ...QUICK_VEHICLE_DEFAULTS,
      vehicleType: VEHICLE_TYPE.CAR,
      bodyType: 'suv' as never,
    });
    const bike = quickVehicleToCreateInput({
      ...QUICK_VEHICLE_DEFAULTS,
      vehicleType: VEHICLE_TYPE.MOTORBIKE,
      bodyType: 'suv' as never,
    });
    expect((car as { bodyType?: unknown }).bodyType).toBe('suv');
    expect((bike as { bodyType?: unknown }).bodyType).toBeNull();
  });

  it('biển số null không ném', () => {
    expect(
      quickVehicleToCreateInput({ ...QUICK_VEHICLE_DEFAULTS, plateNumber: null as never })
        .plateNumber,
    ).toBe('');
  });
});

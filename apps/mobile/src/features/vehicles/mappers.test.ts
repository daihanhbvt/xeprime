import { VEHICLE_TYPE } from '@xeprime/types';
import type { VehicleFormValues } from '@xeprime/validators';
import { manageInformationValuesToInput } from './mappers';

/**
 * Tiện ích không dùng được cho loại xe KHÔNG được lên dây.
 *
 * Đây là lỗi thật đã gặp: một chiếc xe máy còn giữ `spare_tire` trong dữ liệu — form ẩn khoá đó
 * nên người dùng không có cách nào bỏ chọn — và server trả 400. Web tình cờ thoát được vì
 * `Checkbox.Group` của AntD tự rụng khoá ẩn khi người dùng chạm vào ô bất kỳ; app native giữ
 * nguyên mảng nên lưu là lỗi. Lọc ở mapper để hai client cư xử giống nhau.
 */
describe('manageInformationValuesToInput — tiện ích theo loại xe', () => {
  const base = {
    vehicleType: VEHICLE_TYPE.MOTORBIKE,
    plateNumber: '',
    brand: '',
    model: '',
    color: '',
    description: '',
  } as unknown as VehicleFormValues;

  it('bỏ tiện ích chỉ dành cho ô tô khi xe là xe máy', () => {
    const input = manageInformationValuesToInput({
      ...base,
      features: ['spare_tire', 'helmet_included', 'bluetooth'],
    } as VehicleFormValues);

    expect(input.features).toEqual(['helmet_included', 'bluetooth']);
  });

  it('giữ nguyên tiện ích hợp lệ của ô tô', () => {
    const input = manageInformationValuesToInput({
      ...base,
      vehicleType: VEHICLE_TYPE.CAR,
      features: ['spare_tire', 'bluetooth'],
    } as VehicleFormValues);

    expect(input.features).toEqual(['spare_tire', 'bluetooth']);
  });
});

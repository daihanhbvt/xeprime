import { SERVICE_TYPE, VEHICLE_OPERATION_STATUS, VEHICLE_TYPE } from '@xeprime/types';
import type { VehicleFormValues } from '@xeprime/validators';
import { informationValuesToInput } from './mappers';

/**
 * Payload của mục "Thông tin xe & tiện ích" (cổng quản lý) — web 30/09/2026.
 *
 * KHÔNG gửi `serviceTypes`/`operationStatus`: cả hai lưu NGAY (công tắc dịch vụ · thẻ đầu xe), form
 * giữ bản chụp lúc mở màn — gửi lại là ghi đè một lần bật/tắt vừa làm.
 * CÓ `description`/`features`: hai ô đó dời sang mục này, thiếu là "lưu thành công" mà không đổi gì.
 */
describe('informationValuesToInput', () => {
  const values = {
    name: ' Mazda3 ',
    branchId: '',
    vehicleType: VEHICLE_TYPE.MOTORBIKE,
    serviceTypes: [SERVICE_TYPE.SELF_DRIVE],
    operationStatus: VEHICLE_OPERATION_STATUS.MAINTENANCE,
    plateNumber: '',
    brand: '',
    model: '',
    color: '',
    description: '',
    features: ['spare_tire', 'helmet_included'],
  } as unknown as VehicleFormValues;

  it('không mang serviceTypes và operationStatus', () => {
    const input = informationValuesToInput(values);
    expect(input).not.toHaveProperty('serviceTypes');
    expect(input).not.toHaveProperty('operationStatus');
  });

  it('mang mô tả (rỗng = xoá, null) và tiện ích đã lọc theo loại xe', () => {
    const input = informationValuesToInput(values);
    expect(input.description).toBeNull();
    expect(input.features).toEqual(['helmet_included']);
    expect(informationValuesToInput({ ...values, description: ' Xe đẹp ' }).description).toBe(
      'Xe đẹp',
    );
  });
});

import {
  VEHICLE_TYPE,
  type FeePolicyValues,
  type PerVehicleTypeAmount,
} from '@xeprime/types';

const ZERO_BY_VEHICLE_TYPE: PerVehicleTypeAmount = {
  [VEHICLE_TYPE.CAR]: '0',
  [VEHICLE_TYPE.MOTORBIKE]: '0',
};

/**
 * Bốn trường luồng tiền v2 của `FeePolicyValues`, ở trạng thái TẮT: không phí sàn cố định, không
 * nấc hoa hồng, không biểu phí bảo hiểm.
 *
 * Cho fixture dựng tay một snapshot đời trước v2 (phí dịch vụ là MỘT dòng `service_fee`): spec
 * khoá VÒNG ĐỜI của hold, không khoá phép tính phí — phép tính đó khoá ở `fee-policy.test.ts`.
 */
export const FEE_POLICY_V2_OFF: Pick<
  FeePolicyValues,
  | 'customerPlatformFee'
  | 'ownerCommissionTiers'
  | 'vehicleProtectionDailyAmount'
  | 'tripInsuranceDailyAmount'
> = {
  customerPlatformFee: ZERO_BY_VEHICLE_TYPE,
  ownerCommissionTiers: [],
  vehicleProtectionDailyAmount: ZERO_BY_VEHICLE_TYPE,
  tripInsuranceDailyAmount: ZERO_BY_VEHICLE_TYPE,
};

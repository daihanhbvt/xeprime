import {
  FEE_SCHEDULE_DEFAULTS,
  TAX_RATES_DEFAULTS,
  VEHICLE_TYPE,
  type FeePolicySnapshot,
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

/**
 * Chính sách phí ĐÓNG BĂNG theo NĐ 117/2025 · NĐ 68/2026 (ADR 0068) với các mặc định của luồng tiền
 * v2 — phí sàn, nấc hoa hồng 10/7/3/0, giữ chỗ 15%, thuế theo loại dịch vụ, không bảo hiểm.
 *
 * Cho spec cần một bảng phí THẬT (`computeCustomerFees`) đúng như các ví dụ đối soát của đặc tả 05 §6.
 */
export const FEE_POLICY_ND117: FeePolicySnapshot = {
  ...FEE_SCHEDULE_DEFAULTS,
  policyId: 'POLICY',
  version: 9,
  serviceFeePercent: 0,
  holdMinAmount: '20000',
  holdPaymentWindowMinutes: 120,
  freeCancelHours: 2,
  depositMaxPercent: 50,
  taxEnabled: true,
  taxRates: TAX_RATES_DEFAULTS,
  taxLegalBasis: 'NĐ 117/2025/NĐ-CP · NĐ 68/2026/NĐ-CP',
  taxPercent: null,
  taxLabel: null,
  tripInsuranceEnabled: false,
  tripInsurancePercent: null,
  vehicleProtectionEnabled: false,
  vehicleProtectionPercent: null,
  insurancePartnerName: null,
};

import { FEE_POLICY_STATUS } from '@xeprime/types';
import type { FeePolicy } from './types';

/** Một phiên bản chính sách phí đủ trường cho test màn hình — ghi đè từng trường khi cần. */
export function feePolicyFixture(over: Partial<FeePolicy> = {}): FeePolicy {
  return {
    id: '01POLICY',
    version: 1,
    status: FEE_POLICY_STATUS.ACTIVE,
    name: 'Pilot - phí dịch vụ 10%',
    note: null,
    serviceFeePercent: 0,
    depositPercent: 30,
    depositMinAmount: '0',
    holdMinAmount: '20000',
    holdPaymentWindowMinutes: 120,
    freeCancelHours: 2,
    maxAdvanceBookingDays: 15,
    selfDriveMaxDays: 30,
    taxEnabled: false,
    taxRates: null,
    taxLegalBasis: null,
    taxPercent: null,
    taxLabel: null,
    tripInsuranceEnabled: false,
    tripInsurancePercent: null,
    vehicleProtectionEnabled: false,
    vehicleProtectionPercent: null,
    insurancePartnerName: null,
    withDriverLimits: {
      priceDaily: { min: '500000', max: '5000000' },
      wageDaily: { min: '300000', max: '2000000' },
      wageDailySuggested: '500000',
    },
    customerPlatformFee: { car: '50000', motorbike: '30000' },
    ownerCommissionTiers: [
      { fromDay: 1, percent: 10 },
      { fromDay: 3, percent: 7 },
      { fromDay: 8, percent: 5 },
      { fromDay: 31, percent: 3 },
    ],
    vehicleProtectionDailyAmount: { car: '50000', motorbike: '15000' },
    tripInsuranceDailyAmount: { car: '20000', motorbike: '5000' },
    effectiveFrom: '2026-09-01T00:00:00.000Z',
    effectiveTo: null,
    activatedByName: 'Admin',
    activatedAt: '2026-09-01T00:00:00.000Z',
    createdByName: 'Admin',
    createdAt: '2026-08-30T00:00:00.000Z',
    updatedAt: '2026-09-01T00:00:00.000Z',
    activationBlockers: [],
    ...over,
  } as FeePolicy;
}

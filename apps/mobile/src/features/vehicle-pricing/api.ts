// Side-effect import, KHÔNG xoá: nạp module này là lúc client mặc định được cấu hình.
import '@/lib/api-client';

export { vehiclesApi } from '@xeprime/api-client';

export type {
  RentalPolicyValues,
  SaveRentalPolicyInput,
  SaveVehiclePricingInput,
  ShopRentalPolicy,
  VehiclePricing,
} from '@xeprime/api-client';

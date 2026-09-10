// Side-effect import, KHÔNG xoá: nạp module này là lúc client mặc định được cấu hình.
import '@/lib/api-client';

export { vehiclesApi } from '@/api/vehicles/api';

export type {
  RentalPolicyValues,
  SaveRentalPolicyInput,
  SaveVehiclePricingInput,
  ShopRentalPolicy,
  VehiclePricing,
} from '@/api/vehicles/api';

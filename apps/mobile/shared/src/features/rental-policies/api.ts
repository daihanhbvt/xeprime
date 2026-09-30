// Side-effect import, KHÔNG xoá: nạp module này là lúc client mặc định được cấu hình.
import '@/lib/api-client';

export { shopPoliciesApi } from '@/api/rental-policies/api';

export type { DeliveryTier, DiscountTier, LegacyDiscountTier } from '@/api/rental-policies/api';
export type {
  RentalPolicyValues,
  SaveRentalPolicyInput,
  ShopRentalPolicy,
} from '@/api/vehicles/api';

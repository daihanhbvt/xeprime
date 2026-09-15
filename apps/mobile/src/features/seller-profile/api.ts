// Side-effect import, KHÔNG xoá: nạp module này là lúc client mặc định được cấu hình.
import '@/lib/api-client';

export { sellerProfileApi, profileToSaveInput } from '@/api/seller-profile/api';
export type { SaveSellerProfileInput, SellerProfile } from '@/api/seller-profile/api';

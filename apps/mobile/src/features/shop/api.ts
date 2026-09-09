// Side-effect import, KHÔNG xoá: nạp module này là lúc client mặc định được cấu hình.
import '@/lib/api-client';

export { tenantsApi } from '@/api/tenants/api';
export { uploadsApi } from '@/api/uploads/api';

export type {
  MyShop,
  RegisterShopInput,
  ShopDefaultBranch,
  ShopLatestApproval,
  ShopProfile,
  UpdateShopProfileInput,
} from '@/api/tenants/api';
export type { UploadMeta, UploadPresign } from '@/api/vehicles/api';

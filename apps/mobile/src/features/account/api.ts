// Side-effect import, KHÔNG xoá: nạp module này là lúc client mặc định được cấu hình.
import '@/lib/api-client';

export { accountApi } from '@/api/account/api';
export type { UpdateProfileInput, UserProfile } from '@/api/account/api';

// Side-effect import, KHÔNG xoá: nạp module này là lúc client mặc định được cấu hình.
import '@/lib/api-client';

export { accountApi } from '@xeprime/api-client';
export type { UpdateProfileInput, UserProfile } from '@xeprime/api-client';

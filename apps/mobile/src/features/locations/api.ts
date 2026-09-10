// Side-effect import, KHÔNG xoá: nạp module này là lúc client mặc định được cấu hình.
import '@/lib/api-client';

export { locationsApi } from '@/api/locations/api';

export type { Province } from '@/api/locations/api';

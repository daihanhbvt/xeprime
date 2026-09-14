// Side-effect import, KHÔNG xoá: nạp module này là lúc client mặc định được cấu hình.
import '@/lib/api-client';

export { locationsApi, placesApi } from '@/api/locations/api';

export type {
  AddressView,
  PlaceDetail,
  PlaceSuggestion,
  Province,
  Ward,
} from '@/api/locations/api';

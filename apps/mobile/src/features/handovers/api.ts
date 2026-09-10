// Side-effect import, KHÔNG xoá: nạp module này là lúc client mặc định được cấu hình.
import '@/lib/api-client';

export { handoversApi } from '@/api/handovers/api';

export type {
  ConfirmHandoverInput,
  Handover,
  HandoverBelowPickupDetails,
  HandoverContext,
  HandoverPhoto,
  HandoverPresign,
  HandoverSuspicionDetails,
  HandoverUploadMeta,
  MissingOdometerItem,
  ResolveOdometerInput,
  SaveHandoverInput,
} from '@/api/handovers/api';

// Side-effect import, KHÔNG xoá: nạp module này là lúc client mặc định được cấu hình.
import '@/lib/api-client';

export { handoversApi } from '@xeprime/api-client';

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
} from '@xeprime/api-client';

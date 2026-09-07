// Side-effect import, KHÔNG xoá: nạp module này là lúc client mặc định được cấu hình.
import '@/lib/api-client';

export { vehicleDocumentsApi } from '@xeprime/api-client';

export type {
  ApplyOcrFieldsInput,
  DocumentDownload,
  SaveVehicleDocumentInput,
  VehicleDocumentDetail,
  VehicleDocumentOcrFieldResult,
  VehicleDocumentOcrJob,
  VehicleDocumentSummary,
  VehicleDocumentVersion,
} from '@xeprime/api-client';

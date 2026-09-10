// Side-effect import, KHÔNG xoá: nạp module này là lúc client mặc định được cấu hình.
import '@/lib/api-client';

export { vehicleDocumentsApi } from '@/api/vehicle-documents/api';

export type {
  ApplyOcrFieldsInput,
  DocumentDownload,
  SaveVehicleDocumentInput,
  VehicleDocumentDetail,
  VehicleDocumentOcrFieldResult,
  VehicleDocumentOcrJob,
  VehicleDocumentSummary,
  VehicleDocumentVersion,
} from '@/api/vehicle-documents/api';

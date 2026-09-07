// Side-effect import, KHÔNG xoá: nạp module này là lúc client mặc định được cấu hình.
import '@/lib/api-client';

export {
  maintenanceApi,
  maintenanceBoardToParams,
  MAINTENANCE_DEFAULT_LIMIT,
} from '@xeprime/api-client';

export type {
  CompleteMaintenanceInput,
  CorrectOdometerInput,
  MaintenanceAttachment,
  MaintenanceBoardFilters,
  MaintenanceBoardItem,
  MaintenanceBoardSummary,
  MaintenanceProfile,
  MaintenanceRecord,
  OdometerReading,
  SaveMaintenanceProfileInput,
  SaveMaintenanceRecordInput,
} from '@xeprime/api-client';

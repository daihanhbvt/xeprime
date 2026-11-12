import * as yup from 'yup';
import { maintenanceRecordFields } from '@xeprime/validators';

/**
 * Form phiếu bảo dưỡng (Wave 6).
 *
 * Lịch bảo dưỡng chỉ còn MỘT ngày dự kiến để nhắc, không giữ chỗ lịch xe (ADR 0079). Ngày giữ ở
 * dạng `YYYY-MM-DD` (`DateTimeField dateOnly`) — ngày-không-giờ là dữ liệu lịch, không phải mốc
 * thời gian; nơi gọi API đổi nó thành 00:00 giờ Việt Nam (`startOfAppDay`).
 *
 * Ở đây chứ không ở `@xeprime/validators` vì app mobile còn dựng schema riêng của nó từ
 * `maintenanceRecordFields` với cặp mốc giờ cũ.
 */
export const maintenanceRecordFormSchema = yup.object({
  ...maintenanceRecordFields,
  plannedDate: yup.string().nullable().defined().default(null),
});

export type MaintenanceRecordFormValues = yup.InferType<typeof maintenanceRecordFormSchema>;

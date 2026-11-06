import * as yup from 'yup';
import { maintenanceRecordFields } from '@xeprime/validators';

/**
 * Form phiếu bảo dưỡng.
 *
 * Ở đây chứ không ở `@xeprime/validators` vì ngày dự kiến là KHOÁ NGÀY của bộ chọn (`YYYY-MM-DD`);
 * nơi gọi API đổi sang 00:00 giờ Việt Nam — đúng `MaintenanceRecordDialog` bên web.
 *
 * MỘT ngày dự kiến, chỉ để nhắc và sắp xếp — không giữ chỗ trên lịch xe, không còn mốc kết thúc
 * (ADR 0079). Muốn chặn ngày thì chủ xe khoá lịch xe.
 */
export const maintenanceRecordFormSchema = yup.object({
  ...maintenanceRecordFields,
  plannedDate: yup.string().nullable().defined().default(null),
});

export type MaintenanceRecordFormValues = yup.InferType<typeof maintenanceRecordFormSchema>;

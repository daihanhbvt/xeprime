import * as yup from 'yup';
import { maintenanceRecordFields } from '@xeprime/validators';
import type { Dayjs } from '@/lib/datetime';

/**
 * Form phiếu bảo dưỡng (Wave 6).
 *
 * Ở đây chứ không ở `@xeprime/validators` vì hai mốc thời gian giữ kiểu `Dayjs`: `DateTimeField`
 * cố ý KHÔNG tự chuyển sang chuỗi/UTC (đổi cách chuyển đổi trong component là làm lệch giờ ở
 * mọi form đặt xe cùng lúc), nên serialize là việc của nơi gọi API. Package validators không
 * phụ thuộc `dayjs` — cùng lý do khiến schema banner cũng sống cạnh component của nó.
 *
 * Khoảng thời gian phải đủ CẶP mới giữ được chỗ trên lịch xe: một đầu mốc là dữ liệu vô nghĩa
 * với `vehicle_occupancies` (ADR 0006). Đây chỉ là lớp báo sớm; backend vẫn validate lại.
 */
export const maintenanceRecordFormSchema = yup.object({
  ...maintenanceRecordFields,
  plannedStartAt: yup.mixed<Dayjs>().nullable().defined().default(null),
  plannedEndAt: yup
    .mixed<Dayjs>()
    .nullable()
    .defined()
    .default(null)
    .test('pair-required', 'Nhập thời điểm kết thúc để giữ lịch xe', (value, ctx) =>
      ctx.parent.plannedStartAt ? Boolean(value) : true,
    )
    .test('after-start', 'Thời điểm kết thúc phải sau thời điểm bắt đầu', (value, ctx) => {
      const start = ctx.parent.plannedStartAt as Dayjs | null;
      return !value || !start || value.isAfter(start);
    }),
});

export type MaintenanceRecordFormValues = yup.InferType<typeof maintenanceRecordFormSchema>;

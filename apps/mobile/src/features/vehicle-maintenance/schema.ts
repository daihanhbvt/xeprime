import * as yup from 'yup';
import { maintenanceRecordFields } from '@xeprime/validators';
import type { Dayjs } from '@xeprime/domain';

/**
 * Form phiếu bảo dưỡng.
 *
 * Ở đây chứ không ở `@xeprime/validators` vì hai mốc thời gian giữ kiểu `Dayjs`: bộ chọn thời
 * điểm cố ý KHÔNG tự chuyển sang chuỗi/UTC (đổi cách chuyển đổi trong component là làm lệch giờ
 * ở mọi form cùng lúc), nên serialize là việc của nơi gọi API. Package validators không phụ
 * thuộc `dayjs` — cùng lý do bên web cũng giữ schema này cạnh component của nó.
 *
 * Khoảng thời gian phải đủ CẶP mới giữ được chỗ trên lịch xe: một đầu mốc là dữ liệu vô nghĩa
 * với `vehicle_occupancies` (ADR 0006). Đây chỉ là lớp báo sớm; backend vẫn validate lại.
 *
 * Message của hai `.test()` dưới đây cũng là MÃ — tra `Vehicles.maintenance.validation.*` qua
 * `useValidationResolver`, cùng namespace với `maintenanceRecordFields`. Web dùng đúng câu này ở
 * `Maintenance.record.endRequired`/`endAfterStart` (nhận qua `t` truyền vào
 * `makeMaintenanceRecordFormSchema` thay vì mã, vì web không cần schema tĩnh ở module scope).
 */
export const maintenanceRecordFormSchema = yup.object({
  ...maintenanceRecordFields,
  plannedStartAt: yup.mixed<Dayjs>().nullable().defined().default(null),
  plannedEndAt: yup
    .mixed<Dayjs>()
    .nullable()
    .defined()
    .default(null)
    .test('pair-required', 'endRequired', (value, ctx) =>
      ctx.parent.plannedStartAt ? Boolean(value) : true,
    )
    .test('after-start', 'endAfterStart', (value, ctx) => {
      const start = ctx.parent.plannedStartAt as Dayjs | null;
      return !value || !start || value.isAfter(start);
    }),
});

export type MaintenanceRecordFormValues = yup.InferType<typeof maintenanceRecordFormSchema>;

import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import {
  VEHICLE_ALERT_KIND_VALUES,
  VEHICLE_ALERT_SEVERITY,
} from '@xeprime/types';

/**
 * Một việc cần làm của xe (Wave 8).
 *
 * Toàn bộ nội dung ở đây đi tới MỌI vai trò xem được xe, nên nó chỉ mang LOẠI việc và SỐ LƯỢNG.
 * Không số giấy tờ, không tên file, không số tiền, không định danh tài nguyên riêng tư —
 * dữ liệu đó nằm sau các quyền riêng (`documents.view_details`, `documents.view_files`,
 * `maintenance.view_cost`, `handovers.view_files`).
 */
export class VehicleAlertDto {
  @ApiProperty({ enum: VEHICLE_ALERT_KIND_VALUES, description: '@xeprime/types → VehicleAlertKind' })
  kind!: string;

  @ApiProperty({
    enum: Object.values(VEHICLE_ALERT_SEVERITY),
    description: '@xeprime/types → VehicleAlertSeverity',
  })
  severity!: string;

  @ApiProperty({ description: 'Câu mô tả việc cần làm — đã lọc dữ liệu nhạy cảm' })
  title!: string;

  @ApiPropertyOptional({ type: String, nullable: true })
  detail!: string | null;

  @ApiPropertyOptional({ type: Number, nullable: true, description: 'Chỉ ĐẾM, không kèm định danh' })
  count!: number | null;

  @ApiPropertyOptional({ type: String, nullable: true, description: 'Đường dẫn nội bộ trong app' })
  href!: string | null;
}

/** Cảnh báo + số KM hiện tại của MỘT xe — một request đủ cho cả thẻ xe lẫn Hồ sơ 360. */
export class VehicleAlertsDto {
  @ApiProperty() vehicleId!: string;

  @ApiPropertyOptional({
    type: Number,
    nullable: true,
    description: 'null = chưa từng ghi nhận KM, KHÔNG phải 0 km',
  })
  currentOdometerKm!: number | null;

  @ApiPropertyOptional({
    type: String,
    nullable: true,
    description: '@xeprime/types → OdometerSource (nguồn của số KM hiện tại)',
  })
  currentOdometerSource!: string | null;

  @ApiPropertyOptional({ type: String, nullable: true, description: 'ISO' })
  currentOdometerAt!: string | null;

  @ApiProperty({ type: [VehicleAlertDto], description: 'Đã sắp theo thứ tự ưu tiên tất định' })
  alerts!: VehicleAlertDto[];
}

export class VehicleAlertsListDto {
  @ApiProperty({ type: [VehicleAlertsDto] }) data!: VehicleAlertsDto[];
}

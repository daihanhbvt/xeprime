import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { VEHICLE_BLOCK_REASON_VALUES } from '@xeprime/types';
import { Type } from 'class-transformer';
import { IsDate, IsIn, IsInt, IsOptional, IsString, Length, MaxLength, Min } from 'class-validator';

/**
 * Khoá xe thủ công (nguồn `blocked_range` — ADR 0006).
 *
 * KHÔNG nhận `tenantId` từ client (scope lấy từ membership); `vehicleId` chỉ có ở CREATE —
 * một block không "chuyển xe" được, muốn đổi xe thì xoá và tạo lại cho vết audit rõ ràng.
 */
export class CreateVehicleBlockDto {
  @ApiProperty({ description: 'ID xe (ULID) thuộc gian hàng hiện tại' })
  @IsString()
  @Length(26, 26)
  vehicleId!: string;

  @ApiProperty({ description: 'Bắt đầu khoá, ISO-8601 UTC' })
  @Type(() => Date)
  @IsDate()
  startAt!: Date;

  @ApiProperty({ description: 'Kết thúc khoá, ISO-8601 UTC — phải sau startAt' })
  @Type(() => Date)
  @IsDate()
  endAt!: Date;

  @ApiProperty({ enum: VEHICLE_BLOCK_REASON_VALUES })
  @IsIn(VEHICLE_BLOCK_REASON_VALUES)
  reason!: string;

  @ApiPropertyOptional({ description: 'Ghi chú nội bộ' })
  @IsOptional()
  @IsString()
  @MaxLength(2000)
  note?: string;
}

export class UpdateVehicleBlockDto {
  @ApiProperty({ description: 'Bắt đầu khoá, ISO-8601 UTC' })
  @Type(() => Date)
  @IsDate()
  startAt!: Date;

  @ApiProperty({ description: 'Kết thúc khoá, ISO-8601 UTC — phải sau startAt' })
  @Type(() => Date)
  @IsDate()
  endAt!: Date;

  @ApiProperty({ enum: VEHICLE_BLOCK_REASON_VALUES })
  @IsIn(VEHICLE_BLOCK_REASON_VALUES)
  reason!: string;

  @ApiPropertyOptional({ description: 'Ghi chú nội bộ' })
  @IsOptional()
  @IsString()
  @MaxLength(2000)
  note?: string;

  /** Optimistic concurrency — bản người dùng đang nhìn; lệch là 409, không ghi đè âm thầm. */
  @ApiProperty({ description: 'row_version đang hiển thị' })
  @Type(() => Number)
  @IsInt()
  @Min(1)
  expectedRowVersion!: number;
}

export class VehicleBlockDto {
  @ApiProperty() id!: string;
  @ApiProperty() vehicleId!: string;
  @ApiProperty() vehicleName!: string;
  @ApiPropertyOptional({ type: String, nullable: true }) vehiclePlate!: string | null;
  @ApiProperty({ description: 'ISO-8601 UTC' }) startAt!: string;
  @ApiProperty({ description: 'ISO-8601 UTC' }) endAt!: string;
  @ApiProperty({ enum: VEHICLE_BLOCK_REASON_VALUES }) reason!: string;
  @ApiPropertyOptional({ type: String, nullable: true }) note!: string | null;
  @ApiProperty() rowVersion!: number;
  @ApiPropertyOptional({
    type: String,
    nullable: true,
    description: 'Tên người tạo (đã xoá tài khoản → null)',
  })
  createdByName!: string | null;
  @ApiProperty({ description: 'ISO-8601 UTC' }) createdAt!: string;
  @ApiProperty({ description: 'ISO-8601 UTC' }) updatedAt!: string;
}

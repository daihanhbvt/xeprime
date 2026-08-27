import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { BULK_PRICE_MODE, PRICE_PERCENT_MAX, PRICE_PERCENT_MIN } from '@xeprime/domain';
import { VEHICLE_BLOCK_REASON_VALUES } from '@xeprime/types';
import { Transform, Type } from 'class-transformer';
import {
  ArrayMaxSize,
  ArrayNotEmpty,
  IsArray,
  IsIn,
  IsInt,
  IsNumber,
  IsOptional,
  IsString,
  Length,
  Matches,
  MaxLength,
  Min,
} from 'class-validator';
import { DATE_ONLY_PATTERN } from '../../../common/date-only';

const BULK_PRICE_MODES = Object.values(BULK_PRICE_MODE);

/** Trần số xe cho MỘT lệnh hàng loạt — đội xe lớn nhất trong thiết kế là 1.000 xe. */
export const BULK_DAY_MAX_VEHICLES = 1_000;

/**
 * Khoảng ngày + bộ lọc xe cho bảng xem trước.
 *
 * Bộ lọc trùng đúng bộ lọc của lưới lịch (`vehicleType`/`branchId`/`q`) là CÓ CHỦ ĐÍCH: người
 * dùng vừa lọc còn 12 xe máy rồi bấm "khoá toàn bộ xe" thì "toàn bộ" phải nghĩa là 12 chiếc họ
 * đang nhìn, không phải 40 chiếc của cả gian hàng.
 */
export class BulkDayQueryDto {
  @ApiProperty({ example: '2026-08-31', description: 'Ngày đầu khoảng (YYYY-MM-DD, giờ VN)' })
  @IsString()
  @Matches(DATE_ONLY_PATTERN, { message: 'from phải theo dạng YYYY-MM-DD' })
  from!: string;

  @ApiProperty({ example: '2026-09-02', description: 'Ngày cuối khoảng, INCLUSIVE' })
  @IsString()
  @Matches(DATE_ONLY_PATTERN, { message: 'to phải theo dạng YYYY-MM-DD' })
  to!: string;

  @ApiPropertyOptional({ description: 'Lọc theo loại xe, khớp bộ lọc trên lưới lịch' })
  @IsOptional()
  @IsString()
  @MaxLength(30)
  vehicleType?: string;

  @ApiPropertyOptional({ description: 'Chi nhánh đang chọn ở thanh trên' })
  @IsOptional()
  @IsString()
  @Length(26, 26)
  branchId?: string;

  @ApiPropertyOptional({ description: 'Từ khoá tên/biển số/mã xe' })
  @IsOptional()
  @Transform(({ value }: { value: unknown }) => (typeof value === 'string' ? value.trim() : value))
  @IsString()
  @MaxLength(100)
  q?: string;
}

/**
 * Một xe trong bảng xem trước.
 *
 * Trả GIÁ NIÊM YẾT (thường + cuối tuần) chứ không trả sẵn giá đã tính: phép tính "+30%" nằm ở
 * `planBulkDayPrices` của `@xeprime/domain`, và cả backend lẫn frontend gọi CHÍNH hàm đó. Nhờ
 * vậy con số trên bảng xem trước và con số ghi xuống DB không thể lệch nhau — chúng là một.
 */
export class BulkDayVehicleDto {
  @ApiProperty() vehicleId!: string;
  @ApiProperty() name!: string;
  @ApiPropertyOptional({ type: String, nullable: true }) plateNumber!: string | null;
  @ApiProperty() vehicleType!: string;

  @ApiPropertyOptional({
    type: String,
    nullable: true,
    description: 'Giá ngày thường (chuỗi, ADR 0007)',
  })
  weekdayPrice!: string | null;

  @ApiPropertyOptional({
    type: String,
    nullable: true,
    description: 'Giá cuối tuần; null = dùng giá thường',
  })
  weekendPrice!: string | null;

  @ApiProperty({
    type: [String],
    description: 'Những ngày (YYYY-MM-DD) xe đang BẬN trong khoảng — không khoá được',
  })
  busyDates!: string[];
}

export class BulkDayPreviewDto {
  @ApiProperty() from!: string;
  @ApiProperty() to!: string;
  @ApiProperty({ description: 'Số ngày trong khoảng' }) dayCount!: number;
  @ApiProperty({ type: [BulkDayVehicleDto] }) vehicles!: BulkDayVehicleDto[];

  @ApiPropertyOptional({
    type: String,
    nullable: true,
    description:
      'Mã lô khoá hàng loạt đang phủ ĐÚNG khoảng này — công tắc trên lịch đang BẬT nếu khác null',
  })
  activeBlockBatchId!: string | null;
}

/** Danh sách xe cho lệnh ghi — luôn là tập người dùng ĐÃ thấy trong bảng xem trước. */
class BulkDayTargetDto {
  @ApiProperty({ example: '2026-08-31' })
  @IsString()
  @Matches(DATE_ONLY_PATTERN)
  from!: string;

  @ApiProperty({ example: '2026-09-02' })
  @IsString()
  @Matches(DATE_ONLY_PATTERN)
  to!: string;

  @ApiProperty({
    type: [String],
    description: 'ID xe; backend vẫn kiểm từng chiếc thuộc gian hàng',
  })
  @IsArray()
  @ArrayNotEmpty()
  @ArrayMaxSize(BULK_DAY_MAX_VEHICLES)
  @IsString({ each: true })
  @Length(26, 26, { each: true })
  vehicleIds!: string[];
}

export class BulkDayBlockDto extends BulkDayTargetDto {
  @ApiProperty({ enum: VEHICLE_BLOCK_REASON_VALUES })
  @IsIn(VEHICLE_BLOCK_REASON_VALUES)
  reason!: string;

  @ApiPropertyOptional({ description: 'Ghi chú áp cho mọi dòng của lô' })
  @IsOptional()
  @IsString()
  @MaxLength(2000)
  note?: string;
}

export class BulkDayBlockResultDto {
  @ApiProperty({ description: 'Mã lô — dùng để GỠ lại đúng những dòng vừa tạo' })
  batchId!: string;
  @ApiProperty({ description: 'Số dòng khoá đã tạo (một dòng cho mỗi cặp xe × ngày)' })
  blockedDays!: number;
  @ApiProperty({ description: 'Số xe được khoá đủ MỌI ngày trong khoảng' })
  fullyBlockedVehicles!: number;
  @ApiProperty({ description: 'Số xe chỉ khoá được một phần số ngày' })
  partiallyBlockedVehicles!: number;
  @ApiProperty({ description: 'Số xe không khoá được ngày nào (bận trọn khoảng)' })
  skippedVehicles!: number;
}

export class BulkDayReleaseResultDto {
  @ApiProperty({ description: 'Số dòng khoá đã gỡ' }) released!: number;
}

export class BulkDayPriceDto extends BulkDayTargetDto {
  @ApiProperty({
    enum: BULK_PRICE_MODES,
    description:
      '`percent` = tăng/giảm theo giá niêm yết của TỪNG xe (mặc định của giao diện). ' +
      '`fixed` = một con số cho mọi xe — chỉ hợp lý khi nhóm chọn hẹp.',
  })
  @IsIn(BULK_PRICE_MODES)
  mode!: string;

  @ApiPropertyOptional({
    description: 'Dùng với mode=percent. Âm = giảm giá.',
    minimum: PRICE_PERCENT_MIN,
    maximum: PRICE_PERCENT_MAX,
  })
  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  percent?: number;

  @ApiPropertyOptional({ description: 'Dùng với mode=fixed. Chuỗi số nguyên VND (ADR 0007).' })
  @IsOptional()
  @IsString()
  @Matches(/^\d{1,12}$/, { message: 'fixedPrice phải là số nguyên dạng chuỗi' })
  fixedPrice?: string;

  @ApiPropertyOptional({ description: 'Bước làm tròn, mặc định 10000', minimum: 1 })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  roundStep?: number;
}

export class BulkDayPriceResultDto {
  @ApiProperty({ description: 'Số bản ghi đè giá đã ghi (xe × ngày)' }) updatedDays!: number;
  @ApiProperty({ description: 'Số xe thực sự được đặt giá' }) updatedVehicles!: number;
  @ApiProperty({ description: 'Số xe bị bỏ qua vì chưa cấu hình giá gốc' })
  skippedVehicles!: number;
}

import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import {
  ArrayMaxSize,
  ArrayMinSize,
  IsArray,
  IsOptional,
  IsString,
  Matches,
  MaxLength,
} from 'class-validator';

const MONEY_PATTERN = /^\d{1,12}(\.\d{1,2})?$/;
/** Ngày LOCAL Asia/Ho_Chi_Minh — không giờ, không múi. */
const ISO_DATE_PATTERN = /^\d{4}-\d{2}-\d{2}$/;

/** Trần số ngày một lần lưu — khớp khoảng xem lớn nhất của lịch (62 ngày). */
export const DAILY_PRICE_MAX_DATES = 62;

/**
 * Lưu giá riêng theo ngày cho một xe. Mô hình TẤT ĐỊNH: mỗi phần tử `dates` upsert đúng một
 * dòng `(vehicle_id, date)` — không có "khoảng" chồng nhau phải phân xử.
 *
 * Ít nhất một trong `dailyPrice`/`hourlyPrice` phải có (service kiểm, CHECK ở DB là chốt chặn).
 */
export class SaveDailyPricesDto {
  @ApiProperty({
    description: 'Các ngày local Asia/Ho_Chi_Minh, dạng YYYY-MM-DD',
    example: ['2026-09-02', '2026-09-03'],
    type: [String],
  })
  @IsArray()
  @ArrayMinSize(1)
  @ArrayMaxSize(DAILY_PRICE_MAX_DATES)
  @IsString({ each: true })
  @Matches(ISO_DATE_PATTERN, { each: true, message: 'Ngày phải ở dạng YYYY-MM-DD' })
  dates!: string[];

  @ApiPropertyOptional({
    description: 'Giá thuê NGÀY cho các ngày này (chuỗi VND)',
    example: '1200000',
  })
  @IsOptional()
  @IsString()
  @Matches(MONEY_PATTERN, { message: 'Giá theo ngày không hợp lệ (số VND không âm)' })
  dailyPrice?: string;

  @ApiPropertyOptional({
    description: 'Giá thuê GIỜ cho các ngày này (chuỗi VND)',
    example: '150000',
  })
  @IsOptional()
  @IsString()
  @Matches(MONEY_PATTERN, { message: 'Giá theo giờ không hợp lệ (số VND không âm)' })
  hourlyPrice?: string;

  @ApiPropertyOptional({ description: 'Ghi chú (vd "Giá lễ 2/9")' })
  @IsOptional()
  @IsString()
  @MaxLength(255)
  note?: string;
}

export class DailyPriceQueryDto {
  @ApiProperty({ description: 'Từ ngày (local, YYYY-MM-DD)', example: '2026-09-01' })
  @IsString()
  @Matches(ISO_DATE_PATTERN, { message: 'from phải ở dạng YYYY-MM-DD' })
  from!: string;

  @ApiProperty({ description: 'Đến ngày (local, YYYY-MM-DD, bao gồm)', example: '2026-09-30' })
  @IsString()
  @Matches(ISO_DATE_PATTERN, { message: 'to phải ở dạng YYYY-MM-DD' })
  to!: string;
}

export class DeleteDailyPricesDto extends DailyPriceQueryDto {}

export class VehicleDailyPriceDto {
  @ApiProperty() vehicleId!: string;
  @ApiProperty({ description: 'Ngày local YYYY-MM-DD' }) date!: string;
  @ApiPropertyOptional({ type: String, nullable: true, description: 'Giá ngày ghi đè (chuỗi VND)' })
  dailyPrice!: string | null;
  @ApiPropertyOptional({ type: String, nullable: true, description: 'Giá giờ ghi đè (chuỗi VND)' })
  hourlyPrice!: string | null;
  @ApiPropertyOptional({ type: String, nullable: true }) note!: string | null;
  @ApiProperty({ description: 'ISO-8601 UTC' }) updatedAt!: string;
}

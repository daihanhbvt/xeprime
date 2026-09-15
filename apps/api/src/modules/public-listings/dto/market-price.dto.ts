import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { MARKET_PRICE_BASIS } from '@xeprime/domain';
import {
  BODY_TYPE_VALUES,
  MOTORBIKE_CATEGORY_VALUES,
  PROVINCE_CODES,
  VEHICLE_TYPE_VALUES,
} from '@xeprime/types';
import { Type } from 'class-transformer';
import { IsIn, IsInt, IsOptional, Max, Min } from 'class-validator';

const BASIS_VALUES = Object.values(MARKET_PRICE_BASIS);

/**
 * Xe đang được đặt giá — TẤT CẢ đều là chiều so sánh công khai (loại xe, kiểu dáng, số chỗ,
 * phân khúc, tỉnh), không có gì thuộc về một gian hàng cụ thể.
 *
 * Đó là lý do endpoint này `@Public()` được: nó không đọc và không tiết lộ dữ liệu của ai. Đừng
 * thêm `tenantId`/`vehicleId` vào đây — kèm một trong hai là biến một phép tra mặt bằng giá
 * thành một phép đọc có scope, và scope thì không bao giờ đến từ query (CLAUDE.md §6).
 */
export class MarketPriceQueryDto {
  @ApiProperty({ enum: VEHICLE_TYPE_VALUES })
  @IsIn(VEHICLE_TYPE_VALUES)
  vehicleType!: string;

  @ApiPropertyOptional({ enum: BODY_TYPE_VALUES, description: 'Kiểu dáng — chỉ ô tô' })
  @IsOptional()
  @IsIn(BODY_TYPE_VALUES)
  bodyType?: string;

  @ApiPropertyOptional({ enum: MOTORBIKE_CATEGORY_VALUES, description: 'Phân khúc — chỉ xe máy' })
  @IsOptional()
  @IsIn(MOTORBIKE_CATEGORY_VALUES)
  motorbikeCategory?: string;

  @ApiPropertyOptional({
    type: Number,
    minimum: 1,
    maximum: 64,
    description: 'Số chỗ — dùng khi ô tô chưa khai kiểu dáng',
  })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(64)
  seatCount?: number;

  @ApiPropertyOptional({ type: String, description: 'Mã tỉnh 2 ký tự nơi giữ xe' })
  @IsOptional()
  @IsIn(PROVINCE_CODES)
  provinceCode?: string;
}

/**
 * Khoảng giá tham khảo. `basis` và `sampleSize` KHÔNG phải siêu dữ liệu trang trí — chúng là
 * phần nói cho người đọc biết con số này đáng tin tới đâu, và giao diện buộc phải hiển thị:
 * "mức khởi điểm gợi ý" và "trung vị của 42 xe cùng phân khúc tại Đà Nẵng" là hai lời khuyên rất
 * khác nhau, dù hiện ra cùng một con số.
 */
export class MarketPriceSuggestionDto {
  @ApiProperty({ type: String, description: 'Mức thấp (phân vị 25) — tiền dạng string, ADR 0007' })
  low!: string;

  @ApiProperty({ type: String, description: 'Mức giữa (trung vị) — giá đề xuất' })
  median!: string;

  @ApiProperty({ type: String, description: 'Mức cao (phân vị 75)' })
  high!: string;

  @ApiProperty({ enum: BASIS_VALUES, description: 'Tập dữ liệu đứng sau gợi ý' })
  basis!: string;

  @ApiProperty({ type: Number, description: 'Số xe tương tự đã dùng để tính; 0 = mức khởi điểm' })
  sampleSize!: number;
}

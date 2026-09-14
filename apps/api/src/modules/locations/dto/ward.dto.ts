import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { WARD_ADMINISTRATIVE_TYPE_VALUES } from '@xeprime/types';
import { Transform } from 'class-transformer';
import { IsInt, IsOptional, IsString, Length, Max, MaxLength, Min } from 'class-validator';

const trimmed = ({ value }: { value: unknown }) =>
  typeof value === 'string' ? value.trim() : value;

/** Xã/phường/đặc khu cho bộ chọn cấp 2. Dữ liệu công khai (đăng trên công báo). */
export class WardDto {
  @ApiProperty({ example: '00004', description: 'Mã hành chính chính thức, 5 chữ số' })
  code!: string;
  @ApiProperty({ example: '01', description: 'Mã tỉnh chứa đơn vị này' }) provinceCode!: string;
  @ApiProperty({ example: 'Phường Ba Đình', description: 'Tên đầy đủ kèm tiền tố loại' })
  name!: string;
  @ApiProperty({ example: 'Ba Đình', description: 'Tên trần, không tiền tố' }) shortName!: string;
  @ApiProperty({ enum: WARD_ADMINISTRATIVE_TYPE_VALUES }) administrativeType!: string;
}

export class WardListDto {
  @ApiProperty({ type: [WardDto] }) items!: WardDto[];
  @ApiProperty({ description: 'Tổng số đơn vị của tỉnh (trước khi lọc theo `q`)' }) total!: number;
}

/**
 * Một tỉnh có tới 168 đơn vị cấp xã, nên bộ chọn LUÔN có ô tìm và endpoint luôn nhận `q`.
 * Không phân trang: 168 dòng là một câu query rẻ và một `<Select>` cuộn được, còn phân trang một
 * danh mục người ta đang gõ để tìm là bắt họ bấm "trang sau" để thấy kết quả của chính mình.
 */
export class WardListQueryDto {
  @ApiPropertyOptional({ description: 'Tìm theo tên (bỏ dấu, bỏ tiền tố loại đơn vị)' })
  @IsOptional()
  @Transform(trimmed)
  @IsString()
  @MaxLength(100)
  q?: string;

  @ApiPropertyOptional({ description: 'Số dòng tối đa trả về', default: 500 })
  @IsOptional()
  @Transform(({ value }: { value: unknown }) => (value === undefined ? undefined : Number(value)))
  @IsInt()
  @Min(1)
  @Max(500)
  limit?: number;
}

/** Tra CHÍNH XÁC nhiều mã xã một lượt — màn hiển thị cần tên của mã đã lưu. */
export class WardLookupQueryDto {
  @ApiProperty({ description: 'Danh sách mã xã, phân tách bằng dấu phẩy (tối đa 50)' })
  @Transform(trimmed)
  @IsString()
  @Length(5, 305)
  codes!: string;
}

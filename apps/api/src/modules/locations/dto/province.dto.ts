import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { PROVINCE_ADMINISTRATIVE_TYPE } from '@xeprime/types';
import { Transform } from 'class-transformer';
import { IsBoolean, IsInt, IsOptional, IsString, Length, Max, MaxLength, Min } from 'class-validator';

const trimmed = ({ value }: { value: unknown }) =>
  typeof value === 'string' ? value.trim() : value;

const ADMINISTRATIVE_TYPES = Object.values(PROVINCE_ADMINISTRATIVE_TYPE);

/** Tỉnh/thành cho các bộ chọn — dữ liệu công khai, không có gì nhạy cảm. */
export class ProvinceDto {
  @ApiProperty({ example: '79', description: 'Mã hành chính chính thức, 2 ký tự' }) code!: string;
  @ApiProperty({ example: 'Hồ Chí Minh' }) name!: string;
  @ApiProperty({ enum: ADMINISTRATIVE_TYPES }) administrativeType!: string;
  @ApiProperty({ example: 'ho-chi-minh' }) slug!: string;
}

/** Bản dành cho admin nền tảng: thêm cờ điều khiển + số liệu để biết tắt đi thì ảnh hưởng ai. */
export class PlatformProvinceDto extends ProvinceDto {
  @ApiProperty() isEnabled!: boolean;
  @ApiProperty() isPublicVisible!: boolean;
  @ApiProperty() sortOrder!: number;
  @ApiProperty({ description: 'Số chi nhánh đang trỏ tới tỉnh này (chưa xoá)' })
  branchCount!: number;
  @ApiProperty({ description: 'Tổng số xe (mọi trạng thái) thuộc các chi nhánh đó' })
  vehicleCount!: number;
  @ApiProperty({ description: 'Số xe đang hiển thị công khai trên marketplace' })
  publicVehicleCount!: number;
  @ApiProperty({ type: [String], description: 'Bí danh (tên cũ / cách viết khác)' })
  aliases!: string[];
}

export class PlatformProvinceListDto {
  @ApiProperty({ type: [PlatformProvinceDto] }) items!: PlatformProvinceDto[];
}

export class ProvinceListDto {
  @ApiProperty({ type: [ProvinceDto] }) items!: ProvinceDto[];
}

export class PlatformProvinceQueryDto {
  @ApiPropertyOptional({ description: 'Tìm theo mã, tên hoặc bí danh' })
  @IsOptional()
  @Transform(trimmed)
  @IsString()
  @MaxLength(100)
  q?: string;
}

/** Chỉ metadata hiển thị + hai cờ điều khiển. Mã và các con số KHÔNG sửa được qua đây. */
export class UpdateProvinceDto {
  @ApiPropertyOptional({ description: 'Cho phép chọn khi đăng ký shop / tạo chi nhánh' })
  @IsOptional()
  @IsBoolean()
  isEnabled?: boolean;

  @ApiPropertyOptional({ description: 'Cho phép xuất hiện trên marketplace công khai' })
  @IsOptional()
  @IsBoolean()
  isPublicVisible?: boolean;

  @ApiPropertyOptional()
  @IsOptional()
  @IsInt()
  @Min(0)
  @Max(9999)
  sortOrder?: number;

  @ApiPropertyOptional({ description: 'Tên hiển thị chuẩn' })
  @IsOptional()
  @Transform(trimmed)
  @IsString()
  @Length(1, 100)
  name?: string;
}

/** Thêm một đơn vị hành chính MỚI (khi nhà nước lập thêm/đổi tên). Mã là bất biến sau đó. */
export class CreateProvinceDto {
  @ApiProperty({ example: '97' })
  @Transform(trimmed)
  @IsString()
  @Length(2, 2)
  code!: string;

  @ApiProperty()
  @Transform(trimmed)
  @IsString()
  @Length(1, 100)
  name!: string;

  @ApiProperty({ enum: ADMINISTRATIVE_TYPES })
  @IsString()
  administrativeType!: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsInt()
  @Min(0)
  @Max(9999)
  sortOrder?: number;
}

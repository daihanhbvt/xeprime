import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { CATALOG_KEY_PATTERN, CATALOG_TYPE_VALUES } from '@xeprime/types';
import { Transform, Type } from 'class-transformer';
import {
  IsArray,
  IsBoolean,
  IsIn,
  IsInt,
  IsOptional,
  IsString,
  Matches,
  MaxLength,
  Min,
} from 'class-validator';

/** Một mục danh mục như FE nhìn thấy. `key` là thứ lưu xuống xe, `label` chỉ để hiển thị. */
export class CatalogItemDto {
  @ApiProperty()
  id!: string;

  @ApiProperty({ enum: CATALOG_TYPE_VALUES })
  type!: string;

  @ApiProperty({ example: 'suv' })
  key!: string;

  @ApiProperty({ example: 'SUV' })
  label!: string;

  @ApiProperty({ type: String, nullable: true, example: '7 chỗ · gầm cao' })
  description!: string | null;

  @ApiProperty({ type: String, nullable: true, example: '/body-types/suv.png' })
  iconUrl!: string | null;

  @ApiProperty()
  sortOrder!: number;

  @ApiProperty()
  active!: boolean;
}

/** Mục danh mục kèm số xe đang dùng — chỉ màn quản trị cần, bộ lọc công khai không. */
export class CatalogItemAdminDto extends CatalogItemDto {
  @ApiProperty({ description: 'Số xe đang trỏ vào key này (mọi gian hàng)' })
  usageCount!: number;
}

export class CatalogQueryDto {
  @ApiPropertyOptional({
    enum: CATALOG_TYPE_VALUES,
    description: 'Bỏ trống = trả cả bốn chiều trong một lượt',
  })
  @IsOptional()
  @IsIn(CATALOG_TYPE_VALUES)
  type?: string;
}

export class CatalogAdminQueryDto extends CatalogQueryDto {
  @ApiPropertyOptional({ description: 'true = kèm cả mục đã tắt', default: true })
  @IsOptional()
  @Transform(({ value }) => value !== 'false' && value !== false)
  @IsBoolean()
  includeInactive?: boolean;
}

export class CreateCatalogItemDto {
  @ApiProperty({ enum: CATALOG_TYPE_VALUES })
  @IsIn(CATALOG_TYPE_VALUES)
  type!: string;

  @ApiProperty({
    example: 'coupe',
    description: 'Slug lưu xuống xe và đi vào URL bộ lọc — không đổi được sau khi tạo',
  })
  @IsString()
  @Matches(CATALOG_KEY_PATTERN, {
    message: 'key chỉ gồm chữ thường/số/gạch, bắt đầu bằng chữ hoặc số, tối đa 80 ký tự',
  })
  key!: string;

  @ApiProperty({ example: 'Coupe' })
  @IsString()
  @Matches(/\S/, { message: 'label không được để trống' })
  @MaxLength(120)
  label!: string;

  @ApiPropertyOptional({ example: '2 chỗ · thể thao' })
  @IsOptional()
  @IsString()
  @MaxLength(255)
  description?: string | null;

  @ApiPropertyOptional({ example: '/body-types/coupe.png' })
  @IsOptional()
  @IsString()
  @MaxLength(2000)
  iconUrl?: string | null;

  @ApiPropertyOptional({ default: 0 })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(0)
  sortOrder?: number;

  @ApiPropertyOptional({ default: true })
  @IsOptional()
  @IsBoolean()
  active?: boolean;
}

/** Sửa mục — KHÔNG đổi `type`/`key`: hai trường đó là định danh, xe đã lưu đang trỏ vào. */
export class UpdateCatalogItemDto {
  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @Matches(/\S/, { message: 'label không được để trống' })
  @MaxLength(120)
  label?: string;

  @ApiPropertyOptional({ type: String, nullable: true })
  @IsOptional()
  @IsString()
  @MaxLength(255)
  description?: string | null;

  @ApiPropertyOptional({ type: String, nullable: true })
  @IsOptional()
  @IsString()
  @MaxLength(2000)
  iconUrl?: string | null;

  @ApiPropertyOptional()
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(0)
  sortOrder?: number;

  @ApiPropertyOptional()
  @IsOptional()
  @IsBoolean()
  active?: boolean;
}

/** Kéo-thả sắp xếp: gửi trọn thứ tự mới của MỘT chiều, tránh 8 lượt PATCH lệch nhau. */
export class ReorderCatalogDto {
  @ApiProperty({ enum: CATALOG_TYPE_VALUES })
  @IsIn(CATALOG_TYPE_VALUES)
  type!: string;

  @ApiProperty({ type: [String], description: 'Danh sách id theo đúng thứ tự hiển thị mong muốn' })
  @IsArray()
  @IsString({ each: true })
  ids!: string[];
}

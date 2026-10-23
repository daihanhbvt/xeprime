import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import {
  FAVORITE_DEFAULT_VEHICLE_TYPE,
  FAVORITE_LIST_DEFAULT_LIMIT,
  FAVORITE_LIST_MAX_LIMIT,
  FAVORITE_STATUS_MAX_IDS,
  VEHICLE_TYPE_VALUES,
} from '@xeprime/types';
import { Transform, Type } from 'class-transformer';
import {
  ArrayMaxSize,
  ArrayMinSize,
  IsArray,
  IsIn,
  IsInt,
  IsOptional,
  IsString,
  Max,
  MaxLength,
  Min,
} from 'class-validator';
import { PaginationMetaDto } from '../../../common/dto/api-response.dto';
import { PublicListingDto } from '../../public-listings/dto/public-listing.dto';

/** CSV (`a,b,c`) → mảng để validate `each` — cùng quy ước với bộ lọc chợ. */
const splitCsv = ({ value }: { value: unknown }): unknown =>
  typeof value === 'string'
    ? value
        .split(',')
        .map((s) => s.trim())
        .filter(Boolean)
    : value;

/**
 * Trang "Xe yêu thích" — một tab là một loại xe (BRD §3). Phân trang và lọc ở DB; `vehicleType`
 * là loại xe HIỆN HÀNH trên snapshot chợ, không phải loại lúc khách bấm thích.
 */
export class FavoriteListQueryDto {
  @ApiPropertyOptional({
    enum: VEHICLE_TYPE_VALUES,
    default: FAVORITE_DEFAULT_VEHICLE_TYPE,
    description: 'Tab Ô tô / Xe máy. Bỏ trống = Ô tô.',
  })
  @IsOptional()
  @IsIn(VEHICLE_TYPE_VALUES)
  vehicleType?: string;

  @ApiPropertyOptional({ default: 1, minimum: 1 })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  page?: number;

  @ApiPropertyOptional({
    default: FAVORITE_LIST_DEFAULT_LIMIT,
    minimum: 1,
    maximum: FAVORITE_LIST_MAX_LIMIT,
  })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(FAVORITE_LIST_MAX_LIMIT)
  limit?: number;
}

/**
 * Một thẻ trong danh sách yêu thích — ĐÚNG thẻ của chợ (`PublicListingDto`, cùng select/mapper ở
 * `listing-card.ts`) cộng mốc khách đã lưu. Giá/ảnh/dịch vụ là dữ liệu HIỆN HÀNH lúc tải, không
 * đóng băng lúc bấm thích (BRD §6.5).
 */
export class FavoriteVehicleDto extends PublicListingDto {
  @ApiProperty({ description: 'Lúc khách lưu xe này — ISO-8601 UTC.' })
  favoritedAt!: string;
}

export class FavoriteVehiclePageDto {
  @ApiProperty({ type: [FavoriteVehicleDto] }) data!: FavoriteVehicleDto[];
  @ApiProperty({ type: PaginationMetaDto }) meta!: PaginationMetaDto;
}

/** "Trong các xe này, xe nào tôi đã thích" — trái tim ở kết quả tìm kiếm / trang chi tiết. */
export class FavoriteStatusQueryDto {
  @ApiProperty({
    type: String,
    description: `Id xe — CSV, tối đa ${FAVORITE_STATUS_MAX_IDS} id một lượt.`,
  })
  @Transform(splitCsv)
  @IsArray()
  @ArrayMinSize(1)
  @ArrayMaxSize(FAVORITE_STATUS_MAX_IDS)
  @IsString({ each: true })
  @MaxLength(26, { each: true })
  vehicleIds!: string[];
}

export class FavoriteStatusDto {
  @ApiProperty({
    type: [String],
    description: 'Tập con của `vehicleIds` đã hỏi mà tài khoản này đang lưu.',
  })
  vehicleIds!: string[];
}

/** Kết quả thêm/bỏ một xe — trạng thái SAU thao tác, để client chốt cache theo đúng xe đó. */
export class FavoriteToggleResultDto {
  @ApiProperty() vehicleId!: string;
  @ApiProperty({ description: '`true` sau khi thích, `false` sau khi bỏ thích.' })
  favorited!: boolean;
}

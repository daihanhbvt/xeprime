import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Transform } from 'class-transformer';
import { IsLatitude, IsLongitude, IsOptional, IsString, Length, MaxLength } from 'class-validator';

const trimmed = ({ value }: { value: unknown }) =>
  typeof value === 'string' ? value.trim() : value;

const toNumber = ({ value }: { value: unknown }) =>
  value === undefined || value === '' ? undefined : Number(value);

/**
 * Độ dài tối thiểu trước khi hỏi nhà cung cấp.
 *
 * Cùng lý do với ngưỡng ở ô địa chỉ giao xe: `"12 Ng"` vừa chắc chắn tra sai vừa tốn một request
 * có tính tiền. Đặt ở DTO nên client nào cũng chịu chung một ngưỡng, không phụ thuộc việc web và
 * app native có nhớ kiểm hay không.
 */
export const PLACE_SEARCH_MIN_LENGTH = 3;

export class PlaceSearchQueryDto {
  @ApiProperty({ example: '12 Nguyễn Thái Học', minLength: PLACE_SEARCH_MIN_LENGTH })
  @Transform(trimmed)
  @IsString()
  @Length(PLACE_SEARCH_MIN_LENGTH, 200)
  q!: string;

  @ApiPropertyOptional({
    description: 'Vĩ độ để ưu tiên kết quả gần — thường là ghim hiện tại hoặc trung tâm tỉnh',
  })
  @IsOptional()
  @Transform(toNumber)
  @IsLatitude()
  lat?: number;

  @ApiPropertyOptional({ description: 'Kinh độ đi kèm `lat`' })
  @IsOptional()
  @Transform(toNumber)
  @IsLongitude()
  lng?: number;
}

export class PlaceDetailQueryDto {
  @ApiProperty({ description: 'Mã địa điểm lấy từ `GET /places/search`' })
  @Transform(trimmed)
  @IsString()
  @MaxLength(255)
  placeId!: string;
}

export class ReverseGeocodeQueryDto {
  @ApiProperty()
  @Transform(toNumber)
  @IsLatitude()
  lat!: number;

  @ApiProperty()
  @Transform(toNumber)
  @IsLongitude()
  lng!: number;
}

export class PlaceSuggestionDto {
  @ApiProperty() placeId!: string;
  @ApiProperty({ description: 'Dòng đậm: tên địa điểm hoặc số nhà + đường' }) primaryText!: string;
  @ApiPropertyOptional({ type: String, nullable: true, description: 'Dòng nhạt: phần còn lại' })
  secondaryText!: string | null;
}

export class PlaceSearchResultDto {
  @ApiProperty({ type: [PlaceSuggestionDto] }) items!: PlaceSuggestionDto[];
  @ApiProperty({
    description:
      'Bản đồ có đang dùng được không. `false` = chưa cấu hình khoá hoặc nhà cung cấp lỗi — ' +
      'giao diện rơi về nhập tay, KHÔNG hiện lỗi đỏ.',
  })
  available!: boolean;
}

/**
 * Một địa điểm đã chọn hoặc một cái ghim đã tra ngược.
 *
 * `suggestedProvinceCode` là GỢI Ý, không phải kết quả: dữ liệu địa chỉ của nhà cung cấp còn
 * dùng tên đơn vị hành chính TRƯỚC sắp xếp 01/07/2025, nên nó chỉ đủ để bộ chọn nhảy tới đúng
 * tỉnh. Mã xã thì KHÔNG suy ra được và endpoint này không bao giờ đoán — người dùng chọn.
 */
export class PlaceDetailDto {
  @ApiPropertyOptional({ type: String, nullable: true }) placeId!: string | null;
  @ApiProperty({ description: 'Chuỗi thập phân' }) latitude!: string;
  @ApiProperty({ description: 'Chuỗi thập phân' }) longitude!: string;
  @ApiPropertyOptional({
    type: String,
    nullable: true,
    description: 'Địa chỉ nhà cung cấp hiểu ra — có thể còn dùng tên đơn vị hành chính CŨ',
  })
  formattedAddress!: string | null;
  @ApiPropertyOptional({
    type: String,
    nullable: true,
    description: 'Mã tỉnh GỢI Ý, quy từ tên nhà cung cấp trả về qua bảng bí danh. Có thể null.',
  })
  suggestedProvinceCode!: string | null;
  @ApiPropertyOptional({
    type: String,
    nullable: true,
    description: 'Phần "số nhà, đường" tách ra từ địa chỉ nhà cung cấp — gợi ý điền sẵn ô nhập',
  })
  suggestedAddressLine!: string | null;
}

export class PlaceDetailResultDto {
  @ApiPropertyOptional({ type: PlaceDetailDto, nullable: true }) place!: PlaceDetailDto | null;
  @ApiProperty({ description: 'Bản đồ có đang dùng được không' }) available!: boolean;
}

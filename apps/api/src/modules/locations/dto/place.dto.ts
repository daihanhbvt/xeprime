import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Transform } from 'class-transformer';
import {
  IsLatitude,
  IsLongitude,
  IsOptional,
  IsString,
  Length,
  Matches,
  MaxLength,
} from 'class-validator';
import { PLACE_REF_MAX_LENGTH } from '../../geo/geo-provider';

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

  @ApiPropertyOptional({
    description:
      'Tỉnh người dùng ĐÃ CHỌN (ADR 0077): server nối tên tỉnh vào truy vấn, ưu tiên quanh tâm tỉnh ' +
      'và LOẠI gợi ý nhận ra được là thuộc tỉnh khác.',
  })
  @IsOptional()
  @Transform(trimmed)
  @Matches(/^\d{2}$/)
  provinceCode?: string;

  @ApiPropertyOptional({
    description: 'Xã người dùng đã chọn — nối tên xã vào truy vấn. Cần đi kèm `provinceCode`.',
  })
  @IsOptional()
  @Transform(trimmed)
  @Matches(/^\d{5}$/)
  wardCode?: string;
}

export class PlaceDetailQueryDto {
  @ApiProperty({ description: 'Mã địa điểm lấy từ `GET /places/search`' })
  @Transform(trimmed)
  @IsString()
  // `ref_id` của Vietmap là chuỗi mã hoá dài theo địa chỉ — rộng hơn hẳn cột lưu (255). Vẫn có trần
  // để một query string khổng lồ không đi thẳng tới nhà cung cấp tính tiền.
  @MaxLength(PLACE_REF_MAX_LENGTH)
  placeId!: string;

  @ApiPropertyOptional({
    description: 'Tỉnh đã chọn — có thì server gợi ý mã xã khớp trong tỉnh đó',
  })
  @IsOptional()
  @Transform(trimmed)
  @Matches(/^\d{2}$/)
  provinceCode?: string;
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
    description: 'Số gợi ý đã bị LOẠI vì nhận ra là thuộc tỉnh khác tỉnh đã chọn (ADR 0077)',
  })
  outOfProvinceCount!: number;
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
  @ApiPropertyOptional({
    type: String,
    nullable: true,
    description:
      'Mã xã GỢI Ý trong tỉnh client gửi lên (ADR 0077) — chỉ để hỏi người dùng xác nhận, không tự lưu',
  })
  suggestedWardCode!: string | null;
}

export class PlaceDetailResultDto {
  @ApiPropertyOptional({ type: PlaceDetailDto, nullable: true }) place!: PlaceDetailDto | null;
  @ApiProperty({ description: 'Bản đồ có đang dùng được không' }) available!: boolean;
}

import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import {
  ADDRESS_LINE_MAX_LENGTH,
  BRANCH_STATUS_VALUES,
  LOCATION_SOURCE_VALUES,
  WARD_ADMINISTRATIVE_TYPE_VALUES,
} from '@xeprime/types';
import { Transform } from 'class-transformer';
import {
  IsIn,
  IsLatitude,
  IsLongitude,
  IsOptional,
  IsString,
  Length,
  Matches,
  MaxLength,
} from 'class-validator';

const trimmed = ({ value }: { value: unknown }) =>
  typeof value === 'string' ? value.trim() : value;

/** Chi nhánh trả về cho portal quản lý. Không có `tenantId` — client không cần và không được tin. */
export class BranchDto {
  @ApiProperty() id!: string;
  @ApiProperty({ example: 'CN01' }) code!: string;
  @ApiProperty({ example: 'Chi nhánh Đà Nẵng' }) name!: string;
  @ApiPropertyOptional({ type: String, nullable: true }) provinceCode!: string | null;
  @ApiPropertyOptional({ type: String, nullable: true }) provinceName!: string | null;
  @ApiPropertyOptional({ type: String, nullable: true, example: '00004' })
  wardCode!: string | null;
  @ApiPropertyOptional({ type: String, nullable: true, example: 'Phường Ba Đình' })
  wardName!: string | null;
  @ApiPropertyOptional({ enum: WARD_ADMINISTRATIVE_TYPE_VALUES, nullable: true })
  wardAdministrativeType!: string | null;
  @ApiPropertyOptional({
    type: String,
    nullable: true,
    description: 'Địa chỉ HIỂN THỊ đã ghép sẵn (số nhà, xã/phường, tỉnh) — dùng thẳng, đừng ghép lại',
  })
  address!: string | null;
  @ApiPropertyOptional({ type: String, nullable: true, description: 'Số nhà, đường, toà nhà' })
  addressLine!: string | null;
  @ApiPropertyOptional({ type: String, nullable: true }) phone!: string | null;
  @ApiPropertyOptional({ type: String, nullable: true, description: 'Chuỗi thập phân' })
  latitude!: string | null;
  @ApiPropertyOptional({ type: String, nullable: true }) longitude!: string | null;
  @ApiPropertyOptional({ type: String, nullable: true }) placeId!: string | null;
  @ApiPropertyOptional({
    enum: LOCATION_SOURCE_VALUES,
    nullable: true,
    description: 'Ghim đến từ đâu — `geocoded` là máy đoán, giao diện nhắc chủ shop kiểm lại',
  })
  locationSource!: string | null;
  @ApiProperty() isDefault!: boolean;
  @ApiProperty({ enum: BRANCH_STATUS_VALUES }) status!: string;
  @ApiProperty({ description: 'Số xe (chưa xoá) đang thuộc chi nhánh' }) vehicleCount!: number;
  @ApiProperty({
    description:
      'Địa chỉ chưa khớp danh mục hành chính hiện hành (thiếu tỉnh hoặc thiếu xã/phường) — chủ ' +
      'shop cần mở form ra chọn lại và xác nhận ghim',
  })
  needsLocationReview!: boolean;
  @ApiPropertyOptional({
    type: String,
    nullable: true,
    description: 'Giá trị tỉnh tự do cũ, chỉ để đối chiếu khi bổ sung vị trí',
  })
  legacyProvinceValue!: string | null;
  @ApiProperty({ description: 'ISO-8601 UTC' }) createdAt!: string;
  @ApiProperty({ description: 'ISO-8601 UTC' }) updatedAt!: string;
}

export class BranchListDto {
  @ApiProperty({ type: [BranchDto] }) items!: BranchDto[];
  @ApiProperty({ description: 'Tổng số chi nhánh (mọi trạng thái)' }) total!: number;
  @ApiProperty({ description: 'Số chi nhánh đang hoạt động' }) activeCount!: number;
  @ApiProperty({ description: 'Số chi nhánh có địa chỉ chưa khớp danh mục hiện hành' })
  needsReviewCount!: number;
}

export class BranchListQueryDto {
  @ApiPropertyOptional({ description: 'Tìm theo tên, mã hoặc địa chỉ' })
  @IsOptional()
  @Transform(trimmed)
  @IsString()
  @MaxLength(100)
  q?: string;

  @ApiPropertyOptional({ enum: BRANCH_STATUS_VALUES })
  @IsOptional()
  @IsIn(BRANCH_STATUS_VALUES)
  status?: string;

  @ApiPropertyOptional({ description: 'Lọc theo mã tỉnh' })
  @IsOptional()
  @Transform(trimmed)
  @IsString()
  @Length(2, 2)
  provinceCode?: string;

  @ApiPropertyOptional({ description: 'Lọc theo mã xã/phường/đặc khu' })
  @IsOptional()
  @Transform(trimmed)
  @IsString()
  @Length(5, 5)
  wardCode?: string;
}

/**
 * Tạo chi nhánh.
 *
 * Địa chỉ là các trường PHẲNG, không phải một object lồng — xem `AddressViewDto` ở
 * `modules/locations/dto/address.dto.ts` để biết vì sao.
 *
 * `wardCode` tuỳ chọn, và từ ADR 0042 giao diện KHÔNG còn hỏi nó ở đây: một chi nhánh có ghim
 * đã xác nhận thì toạ độ định vị chính xác hơn hẳn một mã năm chữ số. Trường vẫn nhận giá trị
 * (client cũ, dữ liệu nhập tay) và vẫn bị đối chiếu với tỉnh khi có — chỉ là không màn hình nào
 * còn sinh ra nó.
 */
export class CreateBranchDto {
  @ApiProperty({ example: 'Chi nhánh Đà Nẵng' })
  @Transform(trimmed)
  @IsString()
  @Length(2, 255)
  name!: string;

  @ApiProperty({ example: '48', description: 'Mã tỉnh — BẮT BUỘC, phải đang mở đăng ký' })
  @Transform(trimmed)
  @IsString()
  @Length(2, 2)
  provinceCode!: string;

  @ApiPropertyOptional({
    example: '00004',
    description: 'Mã xã/phường/đặc khu 5 chữ số — lấy từ `GET /provinces/:code/wards`',
  })
  @IsOptional()
  @Transform(trimmed)
  @IsString()
  @Length(5, 5)
  wardCode?: string;

  @ApiPropertyOptional({
    example: '12 Nguyễn Thái Học',
    description: 'Số nhà, đường, toà nhà. Server ghép chuỗi hiển thị từ đây + xã/phường + tỉnh.',
  })
  @IsOptional()
  @Transform(trimmed)
  @IsString()
  @MaxLength(ADDRESS_LINE_MAX_LENGTH)
  addressLine?: string;

  @ApiPropertyOptional({ description: 'Mã địa điểm Google khi chủ shop chọn từ gợi ý' })
  @IsOptional()
  @Transform(trimmed)
  @IsString()
  @MaxLength(255)
  placeId?: string;

  /**
   * @deprecated Dùng `addressLine`. Giữ lại vì `ValidationPipe` chạy `forbidNonWhitelisted`:
   * bỏ hẳn trường này khiến mọi bản client đang chạy nhận 400 ngay lần lưu tiếp theo. Server
   * coi nó là `addressLine` khi `addressLine` vắng mặt, rồi tự ghép lại chuỗi hiển thị.
   */
  @ApiPropertyOptional({ deprecated: true, description: 'Cũ — dùng `addressLine`' })
  @IsOptional()
  @Transform(trimmed)
  @IsString()
  @MaxLength(500)
  address?: string;

  @ApiPropertyOptional({ example: '0901234567' })
  @IsOptional()
  @Transform(trimmed)
  @Matches(/^(0|\+84)\d{9}$/, { message: 'Số điện thoại không hợp lệ' })
  phone?: string;

  @ApiPropertyOptional({
    description: 'Vĩ độ của ghim chủ shop đã xác nhận — THẮNG toạ độ server tự tra',
  })
  @IsOptional()
  @IsLatitude()
  latitude?: number;

  @ApiPropertyOptional()
  @IsOptional()
  @IsLongitude()
  longitude?: number;

  @ApiPropertyOptional({
    enum: LOCATION_SOURCE_VALUES,
    description: 'Ghim đến từ đâu. Server ghi đè khi tự tra — client không tự phong "đã xác nhận".',
  })
  @IsOptional()
  @IsIn(LOCATION_SOURCE_VALUES)
  locationSource?: string;
}

/** Sửa chi nhánh: gửi trường nào đổi trường đó. Trạng thái/mặc định có endpoint riêng. */
export class UpdateBranchDto {
  @ApiPropertyOptional()
  @IsOptional()
  @Transform(trimmed)
  @IsString()
  @Length(2, 255)
  name?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @Transform(trimmed)
  @IsString()
  @Length(2, 2)
  provinceCode?: string;

  @ApiPropertyOptional({ description: 'Mã xã/phường/đặc khu 5 chữ số' })
  @IsOptional()
  @Transform(trimmed)
  @IsString()
  @Length(5, 5)
  wardCode?: string;

  @ApiPropertyOptional({ description: 'Số nhà, đường, toà nhà' })
  @IsOptional()
  @Transform(trimmed)
  @IsString()
  @MaxLength(ADDRESS_LINE_MAX_LENGTH)
  addressLine?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @Transform(trimmed)
  @IsString()
  @MaxLength(255)
  placeId?: string;

  /** @deprecated Dùng `addressLine` — xem ghi chú ở `CreateBranchDto.address`. */
  @ApiPropertyOptional({ deprecated: true, description: 'Cũ — dùng `addressLine`' })
  @IsOptional()
  @Transform(trimmed)
  @IsString()
  @MaxLength(500)
  address?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @Transform(trimmed)
  @Matches(/^(0|\+84)\d{9}$/, { message: 'Số điện thoại không hợp lệ' })
  phone?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsLatitude()
  latitude?: number;

  @ApiPropertyOptional()
  @IsOptional()
  @IsLongitude()
  longitude?: number;

  @ApiPropertyOptional({ enum: LOCATION_SOURCE_VALUES })
  @IsOptional()
  @IsIn(LOCATION_SOURCE_VALUES)
  locationSource?: string;
}

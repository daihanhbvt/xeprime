import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { BRANCH_STATUS_VALUES } from '@xeprime/types';
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
  @ApiPropertyOptional({ type: String, nullable: true }) address!: string | null;
  @ApiPropertyOptional({ type: String, nullable: true }) phone!: string | null;
  @ApiPropertyOptional({ type: String, nullable: true, description: 'Chuỗi thập phân' })
  latitude!: string | null;
  @ApiPropertyOptional({ type: String, nullable: true }) longitude!: string | null;
  @ApiProperty() isDefault!: boolean;
  @ApiProperty({ enum: BRANCH_STATUS_VALUES }) status!: string;
  @ApiProperty({ description: 'Số xe (chưa xoá) đang thuộc chi nhánh' }) vehicleCount!: number;
  @ApiProperty({
    description: 'Chi nhánh sinh từ migration mà chưa quy được tỉnh — chủ shop cần bổ sung',
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
  @ApiProperty({ description: 'Số chi nhánh còn thiếu tỉnh' }) needsReviewCount!: number;
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
}

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

  @ApiPropertyOptional()
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

  @ApiPropertyOptional({ description: 'Toạ độ tuỳ chọn — hiện chỉ lưu, chưa dùng để tính bán kính' })
  @IsOptional()
  @IsLatitude()
  latitude?: number;

  @ApiPropertyOptional()
  @IsOptional()
  @IsLongitude()
  longitude?: number;
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

  @ApiPropertyOptional()
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
}

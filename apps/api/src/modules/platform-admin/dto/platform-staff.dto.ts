import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { MEMBERSHIP_STATUS_VALUES, PLATFORM_ROLE_VALUES } from '@xeprime/types';
import { Type } from 'class-transformer';
import {
  IsEmail,
  IsIn,
  IsInt,
  IsOptional,
  IsString,
  Max,
  MaxLength,
  Min,
  MinLength,
} from 'class-validator';
import { PaginationMetaDto } from '../../../common/dto/api-response.dto';

const DEFAULT_LIMIT = 20;
const MAX_LIMIT = 100;

export { DEFAULT_LIMIT as STAFF_DEFAULT_LIMIT, MAX_LIMIT as STAFF_MAX_LIMIT };

export class StaffListQueryDto {
  @ApiPropertyOptional({ description: 'Tìm theo tên hoặc email' })
  @IsOptional()
  @IsString()
  @MaxLength(120)
  q?: string;

  @ApiPropertyOptional({ enum: PLATFORM_ROLE_VALUES })
  @IsOptional()
  @IsIn(PLATFORM_ROLE_VALUES)
  roleKey?: string;

  @ApiPropertyOptional({ default: 1, minimum: 1 })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  page?: number;

  @ApiPropertyOptional({ default: DEFAULT_LIMIT, minimum: 1, maximum: MAX_LIMIT })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(MAX_LIMIT)
  limit?: number;
}

/**
 * Thêm nhân sự nền tảng — TẠO một tài khoản realm `platform` mới theo email (ADR 0053 điều 3).
 *
 * Không bao giờ nâng quyền cho một tài khoản khách/partner có sẵn cùng email: đó là hai tài khoản
 * khác realm. Người được thêm nhận email đặt mật khẩu tới site admin; đã từng là nhân sự (bị gỡ) thì
 * kích hoạt lại đúng tài khoản `platform` cũ.
 */
export class AddStaffDto {
  @ApiProperty({ example: 'nhanvien@xeprime.vn' })
  @IsEmail({}, { message: 'Email không hợp lệ' })
  @MaxLength(255)
  email!: string;

  @ApiProperty({
    example: 'Nguyễn Văn A',
    description: 'Tên hiển thị cho tài khoản quản trị MỚI. Bỏ qua khi kích hoạt lại tài khoản cũ.',
  })
  @IsString()
  @MinLength(2)
  @MaxLength(120)
  displayName!: string;

  @ApiProperty({ enum: PLATFORM_ROLE_VALUES })
  @IsIn(PLATFORM_ROLE_VALUES)
  roleKey!: string;
}

export class UpdateStaffRoleDto {
  @ApiProperty({ enum: PLATFORM_ROLE_VALUES })
  @IsIn(PLATFORM_ROLE_VALUES)
  roleKey!: string;
}

export class StaffDto {
  @ApiProperty({ description: 'ID user — dùng cho PATCH/DELETE /platform/staff/:userId' })
  userId!: string;
  @ApiProperty() displayName!: string;
  @ApiPropertyOptional({ type: String, nullable: true }) email!: string | null;
  @ApiPropertyOptional({ type: String, nullable: true }) avatarUrl!: string | null;
  @ApiProperty({ enum: PLATFORM_ROLE_VALUES }) roleKey!: string;
  @ApiProperty({ enum: MEMBERSHIP_STATUS_VALUES }) status!: string;
  @ApiProperty({ description: 'ISO-8601 UTC' }) createdAt!: string;
}

export class StaffPageDto {
  @ApiProperty({ type: [StaffDto] }) data!: StaffDto[];
  @ApiProperty({ type: PaginationMetaDto }) meta!: PaginationMetaDto;
}

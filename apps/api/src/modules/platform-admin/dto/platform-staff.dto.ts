import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { MEMBERSHIP_STATUS_VALUES, PLATFORM_ROLE_VALUES } from '@xeprime/types';
import { Type } from 'class-transformer';
import { IsEmail, IsIn, IsInt, IsOptional, IsString, Max, MaxLength, Min } from 'class-validator';
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

/** Thêm nhân sự theo email của user ĐÃ có tài khoản (giống members — chưa có mời qua email). */
export class AddStaffDto {
  @ApiProperty({ example: 'nhanvien@xeprime.vn' })
  @IsEmail({}, { message: 'Email không hợp lệ' })
  @MaxLength(255)
  email!: string;

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

import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { MEMBERSHIP_STATUS_VALUES, TENANT_ROLE_VALUES } from '@xeprime/types';
import { Type } from 'class-transformer';
import { IsIn, IsInt, IsOptional, IsString, Max, MaxLength, Min } from 'class-validator';
import { PaginationMetaDto } from '../../../common/dto/api-response.dto';

const DEFAULT_LIMIT = 20;
const MAX_LIMIT = 100;

export { DEFAULT_LIMIT as MEMBER_DEFAULT_LIMIT, MAX_LIMIT as MEMBER_MAX_LIMIT };

export class MemberListQueryDto {
  @ApiPropertyOptional({ description: 'Tìm theo tên hoặc email' })
  @IsOptional()
  @IsString()
  @MaxLength(120)
  q?: string;

  @ApiPropertyOptional({ enum: TENANT_ROLE_VALUES })
  @IsOptional()
  @IsIn(TENANT_ROLE_VALUES)
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

export class UpdateMemberRoleDto {
  @ApiProperty({ enum: TENANT_ROLE_VALUES })
  @IsIn(TENANT_ROLE_VALUES)
  roleKey!: string;
}

export class MemberDto {
  @ApiProperty({ description: 'ID user — dùng cho PATCH/DELETE /members/:userId' }) userId!: string;
  @ApiProperty() displayName!: string;
  @ApiPropertyOptional({ type: String, nullable: true }) email!: string | null;
  @ApiPropertyOptional({ type: String, nullable: true }) avatarUrl!: string | null;
  @ApiProperty({ enum: TENANT_ROLE_VALUES }) roleKey!: string;
  @ApiProperty({ enum: MEMBERSHIP_STATUS_VALUES }) status!: string;
  @ApiPropertyOptional({ type: String, nullable: true, description: 'ISO-8601 UTC' })
  joinedAt!: string | null;
  @ApiProperty({ description: 'ISO-8601 UTC' }) createdAt!: string;
}

export class MemberPageDto {
  @ApiProperty({ type: [MemberDto] }) data!: MemberDto[];
  @ApiProperty({ type: PaginationMetaDto }) meta!: PaginationMetaDto;
}

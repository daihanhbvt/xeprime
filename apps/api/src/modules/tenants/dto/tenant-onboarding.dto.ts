import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { APPROVAL_STATUS_VALUES, TENANT_STATUS_VALUES, TENANT_TYPE, TENANT_TYPE_VALUES } from '@xeprime/types';
import { Transform } from 'class-transformer';
import { IsEmail, IsIn, IsOptional, IsString, Length, Matches, MaxLength } from 'class-validator';

const trimmed = ({ value }: { value: unknown }) => (typeof value === 'string' ? value.trim() : value);
const lowered = ({ value }: { value: unknown }) =>
  typeof value === 'string' ? value.trim().toLowerCase() : value;

/** Đăng ký gian hàng: tối thiểu tên. `status`/`tenant_id` KHÔNG nhận từ client (CLAUDE.md mục 5). */
export class RegisterShopDto {
  @ApiProperty({ example: 'Cho thuê xe Bình Minh' })
  @Transform(trimmed)
  @IsString()
  @Length(2, 255)
  name!: string;

  @ApiPropertyOptional({ enum: TENANT_TYPE_VALUES, default: TENANT_TYPE.INDIVIDUAL })
  @IsOptional()
  @IsIn(TENANT_TYPE_VALUES)
  tenantType?: string;

  @ApiPropertyOptional({ example: '0901234567' })
  @IsOptional()
  @Transform(trimmed)
  @Matches(/^(0|\+84)\d{9}$/, { message: 'Số điện thoại không hợp lệ' })
  phone?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @Transform(lowered)
  @IsEmail({}, { message: 'Email không hợp lệ' })
  email?: string;
}

/** Cập nhật hồ sơ gian hàng — mọi trường tuỳ chọn, gửi cái nào cập nhật cái đó. */
export class UpdateTenantProfileDto {
  @ApiPropertyOptional()
  @IsOptional()
  @Transform(trimmed)
  @IsString()
  @MaxLength(255)
  displayName?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(2000)
  bio?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(2000)
  logoUrl?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(2000)
  coverUrl?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(500)
  address?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(50)
  provinceCode?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(100)
  provinceName?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(50)
  taxCode?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(100)
  businessLicenseNo?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(100)
  bankName?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(100)
  bankAccountNo?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(255)
  bankAccountName?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(2000)
  qrUrl?: string;
}

export class TenantProfileDto {
  @ApiPropertyOptional({ type: String, nullable: true }) displayName!: string | null;
  @ApiPropertyOptional({ type: String, nullable: true }) bio!: string | null;
  @ApiPropertyOptional({ type: String, nullable: true }) logoUrl!: string | null;
  @ApiPropertyOptional({ type: String, nullable: true }) coverUrl!: string | null;
  @ApiPropertyOptional({ type: String, nullable: true }) address!: string | null;
  @ApiPropertyOptional({ type: String, nullable: true }) provinceCode!: string | null;
  @ApiPropertyOptional({ type: String, nullable: true }) provinceName!: string | null;
  @ApiPropertyOptional({ type: String, nullable: true }) taxCode!: string | null;
  @ApiPropertyOptional({ type: String, nullable: true }) businessLicenseNo!: string | null;
  @ApiPropertyOptional({ type: String, nullable: true }) bankName!: string | null;
  @ApiPropertyOptional({ type: String, nullable: true }) bankAccountNo!: string | null;
  @ApiPropertyOptional({ type: String, nullable: true }) bankAccountName!: string | null;
  @ApiPropertyOptional({ type: String, nullable: true }) qrUrl!: string | null;
}

/** Tóm tắt lần gửi duyệt gần nhất — để shop thấy lý do bị từ chối/bổ sung. */
export class LatestApprovalDto {
  @ApiProperty({ enum: APPROVAL_STATUS_VALUES }) status!: string;
  @ApiPropertyOptional({ type: String, nullable: true }) reason!: string | null;
  @ApiProperty({ description: 'ISO-8601 UTC' }) submittedAt!: string;
  @ApiPropertyOptional({ type: String, nullable: true }) reviewedAt!: string | null;
}

/** Gian hàng của tôi: thông tin tenant + hồ sơ + trạng thái duyệt gần nhất. */
export class MyShopDto {
  @ApiProperty() id!: string;
  @ApiProperty() code!: string;
  @ApiProperty() slug!: string;
  @ApiProperty() name!: string;
  @ApiProperty({ enum: TENANT_TYPE_VALUES }) tenantType!: string;
  @ApiProperty({ enum: TENANT_STATUS_VALUES }) status!: string;
  @ApiPropertyOptional({ type: String, nullable: true }) phone!: string | null;
  @ApiPropertyOptional({ type: String, nullable: true }) email!: string | null;
  @ApiProperty({ type: TenantProfileDto }) profile!: TenantProfileDto;
  @ApiPropertyOptional({ type: LatestApprovalDto, nullable: true })
  latestApproval!: LatestApprovalDto | null;
}

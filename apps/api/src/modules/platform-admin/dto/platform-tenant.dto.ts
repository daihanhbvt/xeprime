import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import {
  DEFAULT_PLATFORM_TENANT_SORT,
  PLATFORM_PARTNER_KIND_VALUES,
  PLATFORM_TENANT_SORT_VALUES,
  TENANT_STATUS_VALUES,
  type PlatformPartnerKind,
  type PlatformTenantSort,
} from '@xeprime/types';
import { Type } from 'class-transformer';
import { IsIn, IsInt, IsOptional, IsString, Max, MaxLength, Min } from 'class-validator';
import { PaginationMetaDto } from '../../../common/dto/api-response.dto';
import { CurrentPlanDto } from '../../billing/dto/billing.dto';

const DEFAULT_LIMIT = 20;
const MAX_LIMIT = 100;

export { DEFAULT_LIMIT as PLATFORM_TENANT_DEFAULT_LIMIT, MAX_LIMIT as PLATFORM_TENANT_MAX_LIMIT };

/** Lọc danh sách gian hàng ở admin nền tảng. */
export class PlatformTenantListQueryDto {
  @ApiPropertyOptional({
    enum: PLATFORM_PARTNER_KIND_VALUES,
    description:
      'Loại đối tác — lọc ở DB TRƯỚC phân trang/đếm. `package_shop` = tuyến gói (gồm cả đang ' +
      'onboarding chờ kích hoạt gói), `individual_owner` = tuyến hoa hồng / Owner Lite. Bỏ trống ' +
      '= mọi gian hàng.',
  })
  @IsOptional()
  @IsIn(PLATFORM_PARTNER_KIND_VALUES)
  partnerKind?: PlatformPartnerKind;

  @ApiPropertyOptional({ enum: PLATFORM_TENANT_SORT_VALUES, default: DEFAULT_PLATFORM_TENANT_SORT })
  @IsOptional()
  @IsIn(PLATFORM_TENANT_SORT_VALUES)
  sort?: PlatformTenantSort;

  @ApiPropertyOptional({ enum: TENANT_STATUS_VALUES })
  @IsOptional()
  @IsIn(TENANT_STATUS_VALUES)
  status?: string;

  @ApiPropertyOptional({ description: 'Tìm theo tên / mã / slug / SĐT' })
  @IsOptional()
  @IsString()
  @MaxLength(120)
  q?: string;

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

/** Lý do khoá (tuỳ chọn) — lưu vào audit để tra cứu. */
export class LockTenantDto {
  @ApiPropertyOptional({ description: 'Lý do khoá gian hàng' })
  @IsOptional()
  @IsString()
  @MaxLength(1000)
  reason?: string;
}

/** Một gian hàng trong danh sách quản trị nền tảng. */
export class PlatformTenantDto {
  @ApiProperty() id!: string;
  @ApiProperty() code!: string;
  @ApiProperty() name!: string;
  @ApiProperty() slug!: string;
  @ApiProperty({ description: 'individual | business' }) tenantType!: string;
  @ApiProperty({ enum: TENANT_STATUS_VALUES }) status!: string;
  @ApiProperty({
    enum: PLATFORM_PARTNER_KIND_VALUES,
    description: 'Danh sách đối tác chứa gian hàng này — server suy từ tuyến, không nhận từ client',
  })
  partnerKind!: PlatformPartnerKind;
  @ApiPropertyOptional({ type: String, nullable: true }) phone!: string | null;
  @ApiPropertyOptional({ type: String, nullable: true }) email!: string | null;
  @ApiPropertyOptional({ type: String, nullable: true }) ownerName!: string | null;
  @ApiPropertyOptional({ type: String, nullable: true }) provinceName!: string | null;
  @ApiProperty() vehicleCount!: number;
  @ApiProperty({ description: 'ISO-8601 UTC' }) createdAt!: string;
}

export class PlatformTenantPageDto {
  @ApiProperty({ type: [PlatformTenantDto] }) data!: PlatformTenantDto[];
  @ApiProperty({ type: PaginationMetaDto }) meta!: PaginationMetaDto;
}

/** Chi tiết gian hàng (drawer quản trị). */
export class PlatformTenantDetailDto extends PlatformTenantDto {
  @ApiPropertyOptional({ type: String, nullable: true }) ownerEmail!: string | null;
  @ApiPropertyOptional({ type: String, nullable: true }) ownerPhone!: string | null;
  @ApiPropertyOptional({ type: String, nullable: true }) address!: string | null;
  @ApiPropertyOptional({ type: String, nullable: true }) taxCode!: string | null;
  @ApiPropertyOptional({ type: String, nullable: true }) businessLicenseNo!: string | null;
  @ApiProperty() bookingCount!: number;
  @ApiPropertyOptional({
    type: CurrentPlanDto,
    nullable: true,
    description: 'Gói hiện hành (ADR 0010) — null = chưa có gói (không giới hạn)',
  })
  currentPlan!: CurrentPlanDto | null;
}

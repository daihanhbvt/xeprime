import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsIn, IsString, Length, Matches } from 'class-validator';
import {
  BILLING_MODE_VALUES,
  BILLING_PHASE,
  PERMISSION_VALUES,
  SHOP_ONBOARDING_STATE_VALUES,
  SUPPORT_CAPABILITY_VALUES,
  SUPPORT_MODE_VALUES,
  SUPPORT_REASON_LIMITS,
  SUPPORT_WORKSPACE_VALUES,
  TENANT_STATUS_VALUES,
} from '@xeprime/types';
import { TenantFeatureStateDto } from '../../auth/dto/auth.dto';

/**
 * Mở phiên hỗ trợ cho một gian hàng (ADR 0050).
 *
 * `tenantId` ở đây KHÔNG phải một cách chọn scope: đây là endpoint NỀN TẢNG, người gọi đã qua
 * `PlatformScopeGuard` + quyền `platform.tenant_support.view`, và việc chọn gian hàng nào để hỗ
 * trợ chính là quyết định họ đang ghi lại (kèm lý do) vào audit. Mọi request tenant-scoped SAU đó
 * chỉ mang id phiên.
 */
export class OpenSupportContextDto {
  @ApiProperty({ description: 'Gian hàng cần hỗ trợ' })
  @IsString()
  @Matches(/^[0-9A-HJKMNP-TV-Z]{26}$/, { message: 'tenantId không hợp lệ' })
  tenantId!: string;

  @ApiProperty({ enum: SUPPORT_MODE_VALUES, description: '`view` chỉ xem · `assist` sửa hộ' })
  @IsIn(SUPPORT_MODE_VALUES)
  mode!: string;

  @ApiProperty({
    minLength: SUPPORT_REASON_LIMITS.min,
    maxLength: SUPPORT_REASON_LIMITS.max,
    description: 'Lý do hỗ trợ — ghi vào phiên và mọi dòng audit của phiên',
    example: 'Chủ xe nhờ cập nhật ảnh xe theo ticket #1234',
  })
  @IsString()
  @Length(SUPPORT_REASON_LIMITS.min, SUPPORT_REASON_LIMITS.max)
  reason!: string;
}

export class SupportContextActorDto {
  @ApiProperty() id!: string;
  @ApiProperty() displayName!: string;
}

/**
 * Gian hàng của phiên — cùng hình dạng với `CurrentTenantSummaryDto` của `/auth/me`, để các màn dùng
 * lại đọc "gian hàng hiện hành" (`useTenantScope`) mà không phải biết mình đang ở trong phiên.
 */
export class SupportContextTenantDto {
  @ApiProperty() id!: string;
  @ApiProperty() name!: string;
  @ApiProperty() slug!: string;
  @ApiProperty({
    description: 'Vai của PHIÊN trong gian hàng — luôn `shop_viewer` (không cổng chỉ-chủ nào mở).',
  })
  roleKey!: string;
  @ApiProperty({ nullable: true, type: String }) logoUrl!: string | null;
  @ApiProperty({
    nullable: true,
    type: Number,
    description: '% phí dịch vụ đang hiệu lực — chỉ ở tuyến hoa hồng, như `CurrentTenantSummaryDto`.',
  })
  serviceFeePercent!: number | null;
  @ApiProperty() publicVehicleCount!: number;
  @ApiProperty({ enum: TENANT_STATUS_VALUES }) status!: string;
  @ApiProperty({ enum: SHOP_ONBOARDING_STATE_VALUES }) onboardingState!: string;
  @ApiProperty({ enum: BILLING_MODE_VALUES, nullable: true, type: String })
  billingMode!: string | null;
  @ApiProperty({ enum: Object.values(BILLING_PHASE) }) billingPhase!: string;
  @ApiProperty({ nullable: true, type: String }) planCode!: string | null;
  @ApiProperty({ nullable: true, type: String }) planName!: string | null;
  @ApiProperty({ nullable: true, type: String, format: 'date-time' }) planEndsAt!: string | null;
  @ApiProperty({ nullable: true, type: String, format: 'date-time' }) graceEndsAt!: string | null;
  @ApiProperty({ type: [TenantFeatureStateDto] }) features!: TenantFeatureStateDto[];
}

/**
 * Một phiên hỗ trợ ĐANG DÙNG ĐƯỢC — thứ giao diện hỗ trợ cần để dựng khu làm việc.
 *
 * `capabilities` và `permissions` là quyết định của SERVER tại thời điểm đọc (giao của bộ đã
 * cấp với hiện trạng). Giao diện chỉ dùng chúng để hiện/khoá nút; cổng thật vẫn là guard.
 */
export class SupportContextDto {
  @ApiProperty() id!: string;
  @ApiProperty({ enum: SUPPORT_MODE_VALUES }) mode!: string;
  @ApiProperty({ enum: SUPPORT_WORKSPACE_VALUES }) workspace!: string;
  @ApiProperty() reason!: string;
  @ApiProperty({ enum: SUPPORT_CAPABILITY_VALUES, isArray: true }) capabilities!: string[];
  @ApiProperty({ enum: PERMISSION_VALUES, isArray: true }) permissions!: string[];
  @ApiProperty({ format: 'date-time' }) createdAt!: string;
  @ApiProperty({ format: 'date-time' }) expiresAt!: string;
  @ApiProperty({ type: SupportContextActorDto }) actor!: SupportContextActorDto;
  @ApiProperty({ type: SupportContextTenantDto }) tenant!: SupportContextTenantDto;
  @ApiPropertyOptional({
    description: 'Lý do quyền ghi bị rơi so với lúc mở (gian hàng bị khoá, mất quyền assist…)',
    nullable: true,
    type: String,
    enum: ['tenant_locked', 'assist_permission_revoked'],
  })
  writeRestriction!: string | null;
}

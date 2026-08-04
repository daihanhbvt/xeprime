import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { USER_STATUS_VALUES } from '@xeprime/types';
import { Transform, Type } from 'class-transformer';
import { IsBoolean, IsIn, IsInt, IsOptional, IsString, Max, MaxLength, Min } from 'class-validator';
import { PaginationMetaDto } from '../../../common/dto/api-response.dto';

const DEFAULT_LIMIT = 20;
const MAX_LIMIT = 100;

export {
  DEFAULT_LIMIT as PLATFORM_CUSTOMER_DEFAULT_LIMIT,
  MAX_LIMIT as PLATFORM_CUSTOMER_MAX_LIMIT,
};

/** Lọc khách thuê toàn hệ thống (admin nền tảng). Mọi filter là AND. */
export class PlatformCustomerListQueryDto {
  @ApiPropertyOptional({ description: 'Tìm theo tên hiển thị' })
  @IsOptional()
  @IsString()
  @MaxLength(120)
  q?: string;

  @ApiPropertyOptional({ description: 'Tra CHÍNH XÁC theo SĐT' })
  @IsOptional()
  @IsString()
  @MaxLength(30)
  phone?: string;

  @ApiPropertyOptional({ description: 'Tra CHÍNH XÁC theo email' })
  @IsOptional()
  @IsString()
  @MaxLength(255)
  email?: string;

  @ApiPropertyOptional({ enum: USER_STATUS_VALUES })
  @IsOptional()
  @IsIn(USER_STATUS_VALUES)
  status?: string;

  @ApiPropertyOptional({ description: 'Chỉ khách đã từng gửi yêu cầu thuê' })
  @IsOptional()
  @Transform(({ value }) => value === true || value === 'true')
  @IsBoolean()
  hasRequests?: boolean;

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
 * Một khách thuê trong danh sách tra cứu.
 *
 * SĐT/email LUÔN ở dạng đã che (build plan §11.1 — "Tra cứu có masking PII"). Bản đầy đủ lấy
 * riêng qua `POST /platform/customers/:id/contact`.
 */
export class PlatformCustomerDto {
  @ApiProperty() id!: string;
  @ApiProperty() displayName!: string;
  @ApiPropertyOptional({ type: String, nullable: true, description: 'ĐÃ che, vd 091****678' })
  phoneMasked!: string | null;
  @ApiPropertyOptional({ type: String, nullable: true, description: 'ĐÃ che, vd ng****@gmail.com' })
  emailMasked!: string | null;
  @ApiProperty({ enum: USER_STATUS_VALUES }) status!: string;
  @ApiProperty({ description: 'SĐT đã xác thực OTP' }) phoneVerified!: boolean;
  @ApiProperty({ description: 'Số yêu cầu thuê đã gửi' }) requestCount!: number;
  @ApiProperty({ description: 'Số yêu cầu đã thành đơn thuê' }) bookedCount!: number;
  @ApiProperty({ description: 'Số đánh giá đã viết' }) reviewCount!: number;
  @ApiPropertyOptional({ type: String, nullable: true, description: 'ISO-8601 UTC' })
  lastLoginAt!: string | null;
  @ApiProperty({ description: 'ISO-8601 UTC' }) createdAt!: string;
}

export class PlatformCustomerPageDto {
  @ApiProperty({ type: [PlatformCustomerDto] }) data!: PlatformCustomerDto[];
  @ApiProperty({ type: PaginationMetaDto }) meta!: PaginationMetaDto;
}

/** Một yêu cầu thuê gần đây của khách — đủ để hỗ trợ lần ra đơn đang vướng. */
export class PlatformCustomerRequestDto {
  @ApiProperty() id!: string;
  @ApiProperty() status!: string;
  @ApiProperty() tenantName!: string;
  @ApiProperty() vehicleName!: string;
  @ApiProperty({ description: 'ISO-8601 UTC' }) pickupAt!: string;
  @ApiProperty({ description: 'ISO-8601 UTC' }) returnAt!: string;
  @ApiPropertyOptional({ type: String, nullable: true, description: 'Đơn thuê đã tạo, nếu có' })
  bookingId!: string | null;
  @ApiPropertyOptional({ type: String, nullable: true, description: 'Mã đơn để tra ở màn đơn thuê' })
  bookingCode!: string | null;
  @ApiProperty({ description: 'ISO-8601 UTC' }) createdAt!: string;
}

/** Chi tiết một khách (drawer tra cứu) — kèm 10 yêu cầu thuê gần nhất. */
export class PlatformCustomerDetailDto extends PlatformCustomerDto {
  @ApiPropertyOptional({ type: String, nullable: true, description: 'ISO-8601 UTC' })
  emailVerifiedAt!: string | null;
  @ApiProperty({ description: 'Số cuộc trò chuyện với shop' }) conversationCount!: number;
  @ApiProperty({ type: [PlatformCustomerRequestDto] })
  recentRequests!: PlatformCustomerRequestDto[];
  @ApiProperty({ description: 'ISO-8601 UTC' }) updatedAt!: string;
}

/** SĐT/email khách ở dạng đầy đủ — trả về kèm việc ghi `audit_logs`. */
export class CustomerContactDto {
  @ApiProperty() customerId!: string;
  @ApiPropertyOptional({ type: String, nullable: true }) phone!: string | null;
  @ApiPropertyOptional({ type: String, nullable: true }) email!: string | null;
}

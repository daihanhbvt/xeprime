import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { ACCOUNT_REALM_VALUES, USER_STATUS_VALUES, type AccountRealm } from '@xeprime/types';
import { IsOptional, IsString, MaxLength } from 'class-validator';

/**
 * Tra cứu XUYÊN REALM theo một định danh — ADR 0053 điều 9. Đúng MỘT trong hai trường; khớp CHÍNH
 * XÁC (không tìm gần đúng — ô tra cứu không được thành công cụ quét danh bạ).
 */
export class AccountLookupQueryDto {
  @ApiPropertyOptional({ description: 'SĐT tra CHÍNH XÁC (nhận `09…`, `84…`, `+84…`)' })
  @IsOptional()
  @IsString()
  @MaxLength(30)
  phone?: string;

  @ApiPropertyOptional({ description: 'Email tra CHÍNH XÁC' })
  @IsOptional()
  @IsString()
  @MaxLength(255)
  email?: string;
}

/** Một tài khoản khớp định danh — mỗi realm tối đa một dòng (định danh unique TRONG realm). */
export class AccountLookupItemDto {
  @ApiProperty() id!: string;

  @ApiProperty({ enum: ACCOUNT_REALM_VALUES, description: 'Không gian tài khoản (ADR 0053)' })
  realm!: AccountRealm;

  @ApiProperty() displayName!: string;

  @ApiPropertyOptional({ type: String, nullable: true, description: 'ĐÃ che, vd 091****678' })
  phoneMasked!: string | null;

  @ApiPropertyOptional({ type: String, nullable: true, description: 'ĐÃ che, vd ng****@gmail.com' })
  emailMasked!: string | null;

  @ApiProperty({ enum: USER_STATUS_VALUES }) status!: string;

  @ApiPropertyOptional({
    type: String,
    nullable: true,
    description: 'Realm partner: gian hàng đang thuộc (membership `active`), nếu có',
  })
  tenantName!: string | null;

  @ApiPropertyOptional({
    type: String,
    nullable: true,
    description: 'Realm partner: vai trong gian hàng đó',
  })
  tenantRoleKey!: string | null;

  @ApiPropertyOptional({
    type: String,
    nullable: true,
    description: 'Realm platform: vai nền tảng đang có hiệu lực',
  })
  platformRoleKey!: string | null;

  @ApiProperty({ description: 'ISO-8601 UTC' }) createdAt!: string;
}

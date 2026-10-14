import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Transform } from 'class-transformer';
import {
  IsBoolean,
  IsEmail,
  IsIn,
  IsOptional,
  IsString,
  Matches,
  MaxLength,
  MinLength,
} from 'class-validator';
import { APP_CONFIG_CONTACT_PHONE_PATTERN, SUPPORTED_LOCALES } from '@xeprime/types';

const trim = ({ value }: { value: unknown }) => (typeof value === 'string' ? value.trim() : value);
/** Chuỗi rỗng ⇒ `null` (xoá dòng hotline/Zalo khỏi email). */
const trimToNull = ({ value }: { value: unknown }) => {
  if (typeof value !== 'string') return value;
  const t = value.trim();
  return t.length > 0 ? t : null;
};

/** SĐT liên hệ: chữ số, khoảng trắng, `+`, `.`, `-` — 6–20 ký tự. */
const CONTACT_PHONE = APP_CONFIG_CONTACT_PHONE_PATTERN;

/** Cấu hình công khai của app Partner — `GET /app-config/partner`. */
export class PartnerAppConfigDto {
  @ApiProperty({ example: false, description: 'Hiện đường mua/gia hạn gói trong app Partner.' })
  isPlanPromotionEnabled!: boolean;

  @ApiProperty({ example: 3, description: 'Tăng 1 mỗi lần cấu hình đổi.' })
  version!: number;
}

/** Bản đầy đủ cho admin. */
export class PartnerAppConfigAdminDto extends PartnerAppConfigDto {
  @ApiProperty({ type: String, nullable: true, example: '1900 1234' })
  supportHotline!: string | null;

  @ApiProperty({ type: String, nullable: true, example: '0901234567' })
  supportZalo!: string | null;

  @ApiProperty({ example: '2026-10-12T03:00:00.000Z' })
  updatedAt!: string;

  @ApiProperty({ type: String, nullable: true, example: 'Nguyễn Văn A' })
  updatedByName!: string | null;
}

export class UpdatePartnerAppConfigDto {
  @ApiPropertyOptional({ example: true })
  @IsOptional()
  @IsBoolean()
  isPlanPromotionEnabled?: boolean;

  @ApiPropertyOptional({ type: String, nullable: true, example: '1900 1234' })
  @IsOptional()
  @Transform(trimToNull)
  @Matches(CONTACT_PHONE)
  supportHotline?: string | null;

  @ApiPropertyOptional({ type: String, nullable: true, example: '0901234567' })
  @IsOptional()
  @Transform(trimToNull)
  @Matches(CONTACT_PHONE)
  supportZalo?: string | null;
}

/** Yêu cầu tư vấn gói từ app Partner. */
export class PlanConsultationDto {
  @ApiProperty({ example: 'Nguyễn Văn A' })
  @Transform(trim)
  @IsString()
  @MinLength(2)
  @MaxLength(120)
  fullName!: string;

  @ApiProperty({ example: '0901234567' })
  @Transform(trim)
  @IsString()
  @Matches(CONTACT_PHONE)
  phone!: string;

  @ApiProperty({
    example: 'chuxe@example.vn',
    description: 'Email LIÊN HỆ ghi trên case. Thư hướng dẫn luôn gửi tới email của tài khoản.',
  })
  @Transform(trim)
  @IsEmail()
  @MaxLength(255)
  email!: string;

  @ApiPropertyOptional({ example: 'Tôi có 5 xe, muốn hỏi gói Nâng cao.' })
  @IsOptional()
  @Transform(trim)
  @IsString()
  @MaxLength(2000)
  message?: string;

  @ApiPropertyOptional({ enum: SUPPORTED_LOCALES, description: 'Ngôn ngữ email hướng dẫn. Mặc định `vi`.' })
  @IsOptional()
  @IsIn(SUPPORTED_LOCALES)
  locale?: string;
}

export class PlanConsultationResultDto {
  @ApiProperty({ example: '01J8XK2M5N7P9Q1R3S5T7V9W1X' })
  caseId!: string;

  @ApiProperty({ example: 'SC7V9W1X', description: 'Mã yêu cầu để đọc qua điện thoại.' })
  code!: string;

  @ApiProperty({ example: true, description: 'Đã xếp hàng email hướng dẫn gói.' })
  emailQueued!: boolean;

  @ApiProperty({
    type: String,
    nullable: true,
    example: 'chuxe@example.vn',
    description:
      'Địa chỉ THẬT SỰ nhận email hướng dẫn — email của tài khoản, không phải email liên hệ đã nhập. ' +
      '`null` khi không xếp thư (tài khoản chưa có email, `isPlanPromotionEnabled` tắt, hoặc hôm nay đã gửi).',
  })
  emailedTo!: string | null;
}

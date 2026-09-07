import { ApiProperty } from '@nestjs/swagger';
import { IsEmail, IsString, Matches, MaxLength, MinLength } from 'class-validator';
import { Transform } from 'class-transformer';
import { FEATURE_STATE_VALUES, PLAN_FEATURE_VALUES, VN_PHONE_PATTERN } from '@xeprime/types';
import { IsLoginIdentifier } from '../../../common/login-identifier';

const PASSWORD_MIN = 8;

/** Mật khẩu: ≥8 ký tự, có cả chữ và số — khớp yup `passwordSchema` ở @xeprime/validators. */
class PasswordField {
  @ApiProperty({ minLength: PASSWORD_MIN, example: 'matkhau123' })
  @IsString()
  @MinLength(PASSWORD_MIN, { message: `Mật khẩu tối thiểu ${PASSWORD_MIN} ký tự` })
  @Matches(/[A-Za-z]/, { message: 'Mật khẩu cần có chữ' })
  @Matches(/\d/, { message: 'Mật khẩu cần có số' })
  password!: string;
}

export class RegisterDto extends PasswordField {
  @ApiProperty({ example: 'Nguyễn Văn A' })
  @IsString()
  @Transform(({ value }) => (typeof value === 'string' ? value.trim() : value))
  @MinLength(1, { message: 'Vui lòng nhập họ tên' })
  @MaxLength(255)
  displayName!: string;

  @ApiProperty({ example: '0901234567' })
  @Transform(({ value }) => (typeof value === 'string' ? value.trim() : value))
  @Matches(VN_PHONE_PATTERN, { message: 'Số điện thoại không hợp lệ' })
  phone!: string;
}

export class LoginDto {
  @ApiProperty({
    description: 'Email, hoặc SĐT Việt Nam dạng 0xxxxxxxxx / +84xxxxxxxxx',
    example: 'ban@congty.vn',
  })
  @Transform(({ value }) => (typeof value === 'string' ? value.trim() : value))
  @IsString()
  @MinLength(1, { message: 'Vui lòng nhập email hoặc số điện thoại' })
  @IsLoginIdentifier()
  identifier!: string;

  @ApiProperty()
  @IsString()
  @MinLength(1, { message: 'Vui lòng nhập mật khẩu' })
  password!: string;
}

/** Đặt mật khẩu cho tài khoản CHƯA có mật khẩu (vd tạo bằng SĐT/OTP). Cần đăng nhập. */
export class SetPasswordDto extends PasswordField {}

export class ForgotPasswordDto {
  @ApiProperty({ example: 'ban@congty.vn' })
  @Transform(({ value }) => (typeof value === 'string' ? value.trim().toLowerCase() : value))
  @IsEmail({}, { message: 'Email không hợp lệ' })
  email!: string;
}

export class ResetPasswordDto extends PasswordField {
  @ApiProperty({ description: 'Token từ link trong email' })
  @IsString()
  @MinLength(1)
  token!: string;
}

/**
 * Trạng thái MỘT tính năng nâng cao với gian hàng đang đăng nhập (ADR 0027 điều 3).
 *
 * Mảng cặp `{feature, state}` chứ không phải object khoá cố định: cờ là snake_case, và thêm cờ
 * thứ 9 không nên buộc phải sửa class DTO.
 */
export class TenantFeatureStateDto {
  @ApiProperty({ enum: PLAN_FEATURE_VALUES }) feature!: string;
  @ApiProperty({ enum: FEATURE_STATE_VALUES }) state!: string;
}

export class CurrentTenantSummaryDto {
  @ApiProperty() id!: string;
  @ApiProperty() name!: string;
  @ApiProperty() slug!: string;
  @ApiProperty({ description: 'Xem TenantStatus trong @xeprime/types' }) status!: string;
  @ApiProperty({ description: 'Xem TenantRole trong @xeprime/types' }) roleKey!: string;

  /**
   * LUÔN đủ 8 cờ, kể cả `hidden` — vắng mặt ≠ hidden: client phải phân biệt được "cờ này ẩn"
   * với "backend cũ chưa biết cờ này" (ADR 0027 điều 3).
   */
  @ApiProperty({ type: [TenantFeatureStateDto] })
  features!: TenantFeatureStateDto[];

  @ApiProperty({ type: String, nullable: true, description: 'Mã gói hiện hành; null = không có' })
  planCode!: string | null;

  @ApiProperty({ type: String, nullable: true, description: 'ISO-8601 UTC — băng hết hạn đọc ngày này' })
  planEndsAt!: string | null;
}

export class MeDto {
  @ApiProperty() id!: string;
  @ApiProperty() displayName!: string;
  // Các field dưới LUÔN có mặt trong response, chỉ có thể mang giá trị null → `@ApiProperty`
  // + `nullable`, KHÔNG phải `@ApiPropertyOptional` (optional nghĩa là "có thể vắng mặt", và
  // nó khiến frontend phải xử lý thêm nhánh `undefined` không bao giờ xảy ra).
  // `type: String` cũng bắt buộc: thiếu nó openapi-typescript sinh ra `Record<string, never>`.
  @ApiProperty({ type: String, nullable: true }) email!: string | null;
  @ApiProperty({ type: String, nullable: true }) avatarUrl!: string | null;

  @ApiProperty({
    type: String,
    nullable: true,
    description: 'SĐT của chính tài khoản, dạng nội địa `0xxxxxxxxx` — để điền sẵn ô liên hệ',
  })
  phone!: string | null;

  @ApiProperty({ description: 'Đã xác thực SĐT chưa — gate cho việc đặt xe/mở shop' })
  phoneVerified!: boolean;

  @ApiProperty({
    description: 'Đã có mật khẩu chưa — false với tài khoản tạo bằng SĐT/OTP (gợi ý đặt mật khẩu)',
  })
  hasPassword!: boolean;

  @ApiProperty({ type: CurrentTenantSummaryDto, nullable: true })
  tenant!: CurrentTenantSummaryDto | null;

  @ApiProperty({
    type: String,
    nullable: true,
    description: 'Xem PlatformRole trong @xeprime/types',
  })
  platformRole!: string | null;

  @ApiProperty({ isArray: true, type: String })
  permissions!: string[];
}

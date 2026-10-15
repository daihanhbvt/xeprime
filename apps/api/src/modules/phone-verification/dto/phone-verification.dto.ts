import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import {
  MOBILE_CLIENT_APP_VALUES,
  PHONE_VERIFICATION_PURPOSE_VALUES,
  type MobileClientApp,
} from '@xeprime/types';
import { IsIn, IsOptional, IsString, Length, Matches } from 'class-validator';

/** SĐT Việt Nam: `0` + 9 số hoặc `+84` + 9 số. Server chuẩn hoá về `84xxxxxxxxx`. */
const VN_PHONE = /^(0|\+84)\d{9}$/;

export class SendOtpDto {
  @ApiProperty({ example: '0901234567' })
  @IsString()
  @Matches(VN_PHONE, { message: 'Số điện thoại không hợp lệ' })
  phone!: string;

  @ApiProperty({ enum: PHONE_VERIFICATION_PURPOSE_VALUES, example: 'register' })
  @IsIn(PHONE_VERIFICATION_PURPOSE_VALUES)
  purpose!: string;

  /**
   * App native đang gửi mã — xác định realm của mã khi request KHÔNG đi qua site web (ADR 0053).
   * Web bỏ trống: realm đến từ site đang gọi. App cũ không gửi ⇒ coi là app khách.
   */
  @ApiPropertyOptional({
    enum: MOBILE_CLIENT_APP_VALUES,
    description:
      'Chỉ app native gửi: realm của mã OTP theo app (customer ↔ XePrime, partner ↔ XePrime Partner). Web bỏ trống.',
  })
  @IsOptional()
  @IsIn(MOBILE_CLIENT_APP_VALUES)
  clientApp?: MobileClientApp;
}

export class VerifyOtpDto {
  @ApiProperty({ example: '0901234567' })
  @IsString()
  @Matches(VN_PHONE, { message: 'Số điện thoại không hợp lệ' })
  phone!: string;

  @ApiProperty({ enum: PHONE_VERIFICATION_PURPOSE_VALUES, example: 'booking' })
  @IsIn(PHONE_VERIFICATION_PURPOSE_VALUES)
  purpose!: string;

  @ApiProperty({ example: '123456', minLength: 6, maxLength: 6 })
  @IsString()
  @Length(6, 6)
  code!: string;

  /** Cùng nghĩa với `SendOtpDto.clientApp` — app gửi mã bằng giá trị nào thì xác minh bằng giá trị đó. */
  @ApiPropertyOptional({
    enum: MOBILE_CLIENT_APP_VALUES,
    description: 'Chỉ app native gửi, và phải trùng giá trị đã dùng ở send-otp. Web bỏ trống.',
  })
  @IsOptional()
  @IsIn(MOBILE_CLIENT_APP_VALUES)
  clientApp?: MobileClientApp;
}

export class SendOtpResultDto {
  @ApiProperty({ description: 'ISO-8601 UTC — thời điểm mã hết hạn' })
  expiresAt!: string;

  @ApiPropertyOptional({
    type: String,
    nullable: true,
    description: 'CHỈ ở dev (OTP_MODE=mock): mã để tự điền/test. Production luôn null.',
  })
  devCode!: string | null;
}

export class VerifyOtpResultDto {
  @ApiProperty() verified!: boolean;
}

/** `GET /auth/phone/otp-config` — cấu hình OTP mà giao diện cần biết TRƯỚC khi gửi mã. */
export class OtpConfigDto {
  @ApiProperty({
    description:
      'Môi trường nhận mã OTP test (dev/staging): giao diện hiện ô nhập mã ngay, không bắt gửi ' +
      'SMS trước. Chỉ là CỜ — bản thân mã không bao giờ đi trên dây. Production luôn false.',
  })
  testCodeEnabled!: boolean;
}

import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import {
  MOBILE_CLIENT_APP_VALUES,
  PHONE_VERIFICATION_PURPOSE_VALUES,
  type MobileClientApp,
} from '@xeprime/types';
import { IsIn, IsOptional, IsString, Length, Matches, MaxLength } from 'class-validator';
import { Type } from 'class-transformer';
import { MobileDeviceDto } from '../../auth/dto/mobile-auth.dto';

/** SĐT Việt Nam: `0` + 9 số hoặc `+84` + 9 số. Server chuẩn hoá về `84xxxxxxxxx`. */
const VN_PHONE = /^(0|\+84)\d{9}$/;

export class SendOtpDto {
  @ApiProperty({ example: '0901234567' })
  @IsString()
  @Matches(VN_PHONE, { message: 'Số điện thoại không hợp lệ' })
  phone!: string;

  @ApiProperty({ enum: PHONE_VERIFICATION_PURPOSE_VALUES, example: 'booking' })
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

/** Đăng nhập passwordless bằng SĐT + OTP (purpose=login). Server tự chuẩn hoá SĐT. */
export class PhoneLoginDto {
  @ApiProperty({ example: '0901234567' })
  @IsString()
  @Matches(VN_PHONE, { message: 'Số điện thoại không hợp lệ' })
  phone!: string;

  @ApiProperty({ example: '123456', minLength: 6, maxLength: 6 })
  @IsString()
  @Length(6, 6)
  code!: string;

  @ApiPropertyOptional({
    maxLength: 120,
    description:
      'Tên hiển thị — CHỈ dùng khi số này chưa có tài khoản và lượt đăng nhập tạo mới. Luồng đặt ' +
      'xe tự lái gửi tên khách vừa nhập, để tài khoản không mang tên mặc định "Khách 1234".',
  })
  @IsOptional()
  @IsString()
  @MaxLength(120)
  displayName?: string;
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

/**
 * `POST /auth/mobile/phone/login` — bản NATIVE của đăng nhập OTP.
 *
 * Cùng đầu vào với `PhoneLoginDto` của web, thêm `device` để phiên hiện đúng tên máy trong màn
 * "thiết bị đang đăng nhập" (ADR 0017). Khác biệt thật nằm ở ĐẦU RA: web nhận cookie httpOnly,
 * native nhận cặp access/refresh token trong body — cookie không đặt được cho app native.
 */
export class MobilePhoneLoginDto extends PhoneLoginDto {
  @ApiPropertyOptional({ type: MobileDeviceDto })
  @IsOptional()
  @Type(() => MobileDeviceDto)
  device?: MobileDeviceDto;

  @ApiPropertyOptional({
    enum: MOBILE_CLIENT_APP_VALUES,
    description:
      'App đang gọi: `customer` (XePrime) hay `partner` (XePrime Partner). Thiếu = `customer` (app hợp nhất cũ).',
  })
  @IsOptional()
  @IsIn(MOBILE_CLIENT_APP_VALUES)
  clientApp?: MobileClientApp;
}

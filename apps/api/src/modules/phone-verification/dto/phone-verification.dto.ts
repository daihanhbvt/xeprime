import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { PHONE_VERIFICATION_PURPOSE_VALUES } from '@xeprime/types';
import { IsIn, IsOptional, IsString, Length, Matches } from 'class-validator';
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
}

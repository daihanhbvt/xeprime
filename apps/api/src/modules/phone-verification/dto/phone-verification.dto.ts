import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { PHONE_VERIFICATION_PURPOSE_VALUES } from '@xeprime/types';
import { IsIn, IsString, Length, Matches } from 'class-validator';

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

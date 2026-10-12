import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsIn, IsOptional, IsString, MaxLength, MinLength, ValidateNested } from 'class-validator';
import { Transform, Type } from 'class-transformer';
import {
  APPLE_SIGN_IN_LIMITS,
  MOBILE_CLIENT_APP_VALUES,
  type MobileClientApp,
} from '@xeprime/types';
import { IsLoginIdentifier } from '../../../common/login-identifier';
import { MeDto, RegisterDto } from './auth.dto';

/**
 * Mô tả dùng chung cho trường `clientApp` của mọi endpoint PHÁT HÀNH phiên native.
 *
 * Optional có chủ đích: app hợp nhất CŨ ngoài thị trường không gửi trường này — thiếu là
 * `customer`. Giá trị quyết REALM của tài khoản (ADR 0053): `customer` ⇒ tài khoản khách,
 * `partner` ⇒ tài khoản đối tác (chủ xe cá nhân lẫn gian hàng) — đăng nhập/đăng ký chỉ tra và tạo
 * trong realm đó. Ghi vào `native_auth_sessions.client_app` để refresh token không tái tạo được
 * phiên cho app kia.
 */
const CLIENT_APP_DESCRIPTION =
  'App đang gọi: `customer` (XePrime) hay `partner` (XePrime Partner). Thiếu = `customer` (app hợp nhất cũ).';

/**
 * DTO của bốn endpoint `/auth/mobile/*` — ADR 0017.
 *
 * File RIÊNG, không nhét vào `auth.dto.ts`: hai họ endpoint có hợp đồng khác nhau (web trả `MeDto`
 * + cookie, native trả cặp token), và tách file làm rõ endpoint nào thuộc họ nào ngay ở tầng
 * import. Không có schema inline nào — mọi response đều là class có tên để OpenAPI sinh ra kiểu
 * gọi được từ `@xeprime/api-client` (ADR 0007).
 */

/**
 * Thông tin thiết bị — CHỈ để người dùng nhận ra máy nào trong màn "thiết bị đang đăng nhập".
 *
 * Client tự khai, nên nó KHÔNG được dùng cho bất kỳ quyết định bảo mật nào: không gắn phiên vào
 * `devicePlatform`, không từ chối theo `appVersion`. Một trường client tự khai mà lại chặn được
 * thứ gì thì client chỉ cần khai khác.
 */
export class MobileDeviceDto {
  @ApiPropertyOptional({ example: 'iPhone 15 Pro', maxLength: 120 })
  @IsOptional()
  @IsString()
  @Transform(({ value }) => (typeof value === 'string' ? value.trim() : value))
  @MaxLength(120)
  deviceName?: string;

  @ApiPropertyOptional({ example: 'ios', maxLength: 30 })
  @IsOptional()
  @IsString()
  @Transform(({ value }) => (typeof value === 'string' ? value.trim() : value))
  @MaxLength(30)
  devicePlatform?: string;

  @ApiPropertyOptional({ example: '1.0.0', maxLength: 30 })
  @IsOptional()
  @IsString()
  @Transform(({ value }) => (typeof value === 'string' ? value.trim() : value))
  @MaxLength(30)
  appVersion?: string;
}

/** `POST /auth/mobile/login` — email/SĐT + mật khẩu. */
export class MobileLoginDto {
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

  @ApiPropertyOptional({ type: MobileDeviceDto })
  @IsOptional()
  @Type(() => MobileDeviceDto)
  device?: MobileDeviceDto;

  @ApiPropertyOptional({ enum: MOBILE_CLIENT_APP_VALUES, description: CLIENT_APP_DESCRIPTION })
  @IsOptional()
  @IsIn(MOBILE_CLIENT_APP_VALUES)
  clientApp?: MobileClientApp;
}

/**
 * Refresh token đi trong BODY, không phải query string.
 *
 * Query string nằm trong access log của mọi proxy trên đường đi (ADR 0017 §6). Cùng lý do cho
 * `MobileLogoutDto`.
 */
export class MobileRefreshDto {
  @ApiProperty({ description: 'Refresh token opaque nhận được từ lần đăng nhập/refresh trước' })
  @IsString()
  @MinLength(1)
  refreshToken!: string;
}

export class MobileLogoutDto {
  @ApiProperty({
    description: 'Refresh token của thiết bị này — dùng để xác định phiên cần thu hồi',
  })
  @IsString()
  @MinLength(1)
  refreshToken!: string;
}

/** Cặp token của một phiên native. Client lưu `refreshToken` vào Keychain/Keystore, không đâu khác. */
export class MobileTokenPairDto {
  @ApiProperty({ description: 'JWT ngắn hạn. Gửi ở header `Authorization: Bearer <accessToken>`' })
  accessToken!: string;

  @ApiProperty({
    description:
      'Số GIÂY còn lại của access token. Để client chủ động refresh trước khi hết hạn — ' +
      'không phải để tin: hạn thật nằm trong `exp` của token và do server kiểm.',
    example: 900,
  })
  accessTokenExpiresIn!: number;

  @ApiProperty({
    description:
      'Chuỗi random đối xứng (KHÔNG phải JWT). Chỉ lưu ở Keychain (iOS) / Keystore (Android). ' +
      'Mỗi lần refresh trả về token mới và token cũ chết ngay.',
  })
  refreshToken!: string;

  @ApiProperty({ description: 'Hạn của refresh token, ISO 8601 UTC' })
  refreshTokenExpiresAt!: string;
}

/**
 * Kết quả đăng nhập native: cặp token + hồ sơ người dùng.
 *
 * `user` là `MeDto` — CÙNG shape với `GET /auth/me` của web, nên app native không có một bản
 * thứ hai của "người dùng hiện tại" để trôi khỏi bản của web. Quyền và tenant scope nằm ở đây
 * vì `MeDto` đọc chúng từ DB; chúng KHÔNG nằm trong access token (ADR 0017 §1).
 */
export class MobileSessionDto {
  @ApiProperty({ type: MobileTokenPairDto })
  tokens!: MobileTokenPairDto;

  @ApiProperty({ type: MeDto })
  user!: MeDto;
}

/**
 * `POST /auth/mobile/social/exchange` — đổi one-time code (nhận ở deep link) lấy cặp token.
 *
 * Đây là chặng cuối của luồng đăng nhập mạng xã hội cho app native (ADR 0019). App KHÔNG nhận
 * token ở deep link: deep link nằm lại trong log của hệ điều hành, còn `codeVerifier` thì chỉ
 * tồn tại trong bộ nhớ tiến trình app — nên chỉ app thật đổi được mã.
 */
export class MobileSocialExchangeDto {
  @ApiProperty({ description: 'One-time code nhận được ở deep link. Sống 60 giây, dùng một lần.' })
  @IsString()
  @MinLength(1)
  code!: string;

  @ApiProperty({
    description:
      'PKCE code_verifier mà app đã sinh trước khi mở trình duyệt. Phải khớp `code_challenge` đã gửi ở bước bắt đầu.',
  })
  @IsString()
  @MinLength(43)
  @MaxLength(128)
  codeVerifier!: string;

  @ApiPropertyOptional({ type: MobileDeviceDto })
  @IsOptional()
  @Type(() => MobileDeviceDto)
  device?: MobileDeviceDto;

  @ApiPropertyOptional({ enum: MOBILE_CLIENT_APP_VALUES, description: CLIENT_APP_DESCRIPTION })
  @IsOptional()
  @IsIn(MOBILE_CLIENT_APP_VALUES)
  clientApp?: MobileClientApp;
}

/**
 * `POST /auth/mobile/register` — bản NATIVE của đăng ký SĐT + mật khẩu.
 *
 * Kế thừa `RegisterDto` của web nên luật mật khẩu và chuẩn hoá SĐT chỉ có MỘT bản: nới lỏng ở
 * một phía mà quên phía kia là cách hai client chấp nhận hai bộ mật khẩu khác nhau.
 *
 * Khác biệt duy nhất nằm ở ĐẦU RA — web nhận cookie httpOnly, native nhận cặp token.
 */
export class MobileRegisterDto extends RegisterDto {
  @ApiPropertyOptional({ type: MobileDeviceDto })
  @IsOptional()
  @Type(() => MobileDeviceDto)
  device?: MobileDeviceDto;

  @ApiPropertyOptional({ enum: MOBILE_CLIENT_APP_VALUES, description: CLIENT_APP_DESCRIPTION })
  @IsOptional()
  @IsIn(MOBILE_CLIENT_APP_VALUES)
  clientApp?: MobileClientApp;
}

/** Họ tên Apple trả về ở LẦN ĐĂNG NHẬP ĐẦU TIÊN (chỉ qua app, không có trong token). */
export class AppleFullNameDto {
  @ApiPropertyOptional({
    type: String,
    nullable: true,
    maxLength: APPLE_SIGN_IN_LIMITS.NAME_PART_MAX,
  })
  @IsOptional()
  @IsString()
  @MaxLength(APPLE_SIGN_IN_LIMITS.NAME_PART_MAX)
  givenName?: string | null;

  @ApiPropertyOptional({
    type: String,
    nullable: true,
    maxLength: APPLE_SIGN_IN_LIMITS.NAME_PART_MAX,
  })
  @IsOptional()
  @IsString()
  @MaxLength(APPLE_SIGN_IN_LIMITS.NAME_PART_MAX)
  familyName?: string | null;
}

/**
 * `POST /auth/mobile/apple` — "Sign in with Apple" trên iOS.
 *
 * App gọi API native của iOS với `nonce` = SHA-256 của một chuỗi ngẫu nhiên, rồi gửi lên token
 * Apple trả về KÈM chuỗi thô đó. Server băm lại và so — token bị nhặt lại không dùng được.
 */
export class MobileAppleLoginDto {
  @ApiProperty({ description: '`identityToken` (JWT) mà iOS trả về sau khi người dùng đồng ý.' })
  @IsString()
  @MinLength(1)
  @MaxLength(APPLE_SIGN_IN_LIMITS.IDENTITY_TOKEN_MAX)
  identityToken!: string;

  @ApiProperty({
    description: 'Nonce THÔ app đã sinh. Apple nhận SHA-256 của nó; server băm lại để đối chiếu.',
  })
  @IsString()
  @MinLength(APPLE_SIGN_IN_LIMITS.NONCE_MIN)
  @MaxLength(APPLE_SIGN_IN_LIMITS.NONCE_MAX)
  nonce!: string;

  @ApiPropertyOptional({ type: AppleFullNameDto, nullable: true })
  @IsOptional()
  @ValidateNested()
  @Type(() => AppleFullNameDto)
  fullName?: AppleFullNameDto | null;

  @ApiPropertyOptional({ type: MobileDeviceDto })
  @IsOptional()
  @Type(() => MobileDeviceDto)
  device?: MobileDeviceDto;

  @ApiPropertyOptional({ enum: MOBILE_CLIENT_APP_VALUES, description: CLIENT_APP_DESCRIPTION })
  @IsOptional()
  @IsIn(MOBILE_CLIENT_APP_VALUES)
  clientApp?: MobileClientApp;
}

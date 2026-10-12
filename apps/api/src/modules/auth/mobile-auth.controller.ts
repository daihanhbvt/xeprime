import {
  Body,
  Controller,
  HttpCode,
  HttpStatus,
  Logger,
  Post,
  UnauthorizedException,
} from '@nestjs/common';
import {
  ApiCreatedResponse,
  ApiNoContentResponse,
  ApiOkResponse,
  ApiOperation,
  ApiTags,
} from '@nestjs/swagger';
import { Throttle } from '@nestjs/throttler';
import {
  ACCOUNT_REALM,
  MOBILE_CLIENT_APP,
  realmForClientApp,
  type MobileClientApp,
} from '@xeprime/types';
import { Public, Realms, VerifiesCredentials } from '../../common/decorators';
import { AuthService } from './auth.service';
import { NativeAuthCodeService } from './social/native-auth-code.service';
import { AppleIdentityVerifier } from './social/apple-identity.verifier';
import { SocialAuthFailure } from './social/social-auth.error';
import {
  NativeSessionService,
  type NativeDeviceInfo,
  type NativeTokenPair,
} from './native-session.service';
import {
  MobileDeviceDto,
  MobileLoginDto,
  MobileAppleLoginDto,
  MobileLogoutDto,
  MobileRefreshDto,
  MobileRegisterDto,
  MobileSessionDto,
  MobileSocialExchangeDto,
  MobileTokenPairDto,
} from './dto/mobile-auth.dto';

/**
 * Mức chặn tần suất theo LOẠI cửa — đặt tên một chỗ thay vì rải số ở từng route:
 *  - `CREDENTIAL`: cửa dò mật khẩu (đăng nhập, đăng ký) — chặt nhất;
 *  - `SOCIAL`: đổi bằng chứng của provider lấy phiên (one-time code, token Apple) — dùng một lần;
 *  - `SESSION`: xoay / thu hồi refresh token — app gọi thường xuyên.
 */
const THROTTLE_PER_MINUTE = {
  CREDENTIAL: { default: { limit: 5, ttl: 60_000 } },
  SOCIAL: { default: { limit: 10, ttl: 60_000 } },
  SESSION: { default: { limit: 20, ttl: 60_000 } },
} as const;

/** Thông điệp kỹ thuật khi token Apple không qua kiểm — app hiển thị theo MÃ (ADR 0012). */
const APPLE_TOKEN_REJECTED_MESSAGE = 'Không xác thực được tài khoản Apple';

/**
 * Xác thực cho app native — ADR 0017.
 *
 * Controller RIÊNG dưới `/auth/mobile`, không thêm nhánh vào `AuthController`. Lý do là ràng buộc
 * quan trọng nhất của cả thay đổi này: **response của web không được đổi một byte nào.** Hai
 * controller nghĩa là không có một dòng `if (isMobile)` nào trong đường đăng nhập của web.
 *
 * `@Throttle` siết riêng từng endpoint, chặt hơn hẳn mức chung 120 req/phút của app
 * (`app.module.ts`): mức chung dành cho một người dùng đang lướt app, còn ba endpoint dưới đây là
 * ba cửa dò mật khẩu và dò refresh token.
 */
@ApiTags('auth')
@Controller('auth/mobile')
// Hai app mobile ↔ hai realm (ADR 0053): app XePrime ↔ customer, app Partner ↔ partner. Không app
// nào phục vụ realm platform.
@Realms(ACCOUNT_REALM.CUSTOMER, ACCOUNT_REALM.PARTNER)
export class MobileAuthController {
  private readonly logger = new Logger(MobileAuthController.name);

  constructor(
    private readonly auth: AuthService,
    private readonly nativeSessions: NativeSessionService,
    private readonly nativeCodes: NativeAuthCodeService,
    private readonly apple: AppleIdentityVerifier,
  ) {}

  /**
   * Đăng nhập bằng email/SĐT + mật khẩu.
   *
   * 5 lần/phút: đây là cửa dò mật khẩu duy nhất của app native. `AuthService.loginWithPassword`
   * đã trả cùng một lỗi cho "không có tài khoản" và "sai mật khẩu", nên rate limit là lớp còn lại.
   */
  @Public()
  @VerifiesCredentials()
  @Post('login')
  @HttpCode(HttpStatus.OK)
  @Throttle(THROTTLE_PER_MINUTE.CREDENTIAL)
  @ApiOperation({ summary: 'Native: đăng nhập bằng email/SĐT + mật khẩu' })
  @ApiOkResponse({ type: MobileSessionDto })
  async login(@Body() dto: MobileLoginDto): Promise<MobileSessionDto> {
    const { userId } = await this.auth.loginWithPassword(
      dto.identifier,
      dto.password,
      realmForClientApp(dto.clientApp),
    );
    return this.buildSession(userId, dto.device, dto.clientApp);
  }

  /**
   * Đăng ký bằng SĐT + mật khẩu — ADR 0017.
   *
   * Tương ứng `POST /auth/register` của web, khác đúng một chỗ: trả token trong body thay vì đặt
   * cookie. Cùng `AuthService.register`, nên luật mật khẩu, chuẩn hoá SĐT và nhánh `PHONE_TAKEN`
   * chỉ có một bản.
   *
   * 5 lần/phút, bằng với `login`: đây cũng là một cửa dò — gửi liên tiếp nhiều SĐT để biết số nào
   * đã có tài khoản (`PHONE_TAKEN`) là việc làm được nếu không siết.
   *
   * ⚠️ SĐT ở đây CHƯA được xác thực — giống hệt web. Đường có xác thực SĐT là
   * `POST /auth/mobile/phone/login` (OTP, tự tạo tài khoản nếu chưa có); nếu sản phẩm cần chắc
   * chắn số là thật thì dùng đường đó, không phải đường này.
   */
  @Public()
  @VerifiesCredentials()
  @Post('register')
  @HttpCode(HttpStatus.CREATED)
  @Throttle(THROTTLE_PER_MINUTE.CREDENTIAL)
  @ApiOperation({ summary: 'Native: đăng ký bằng số điện thoại + mật khẩu' })
  @ApiCreatedResponse({ type: MobileSessionDto })
  async register(@Body() dto: MobileRegisterDto): Promise<MobileSessionDto> {
    // App nào đăng ký thì tài khoản thuộc realm của app đó (ADR 0053): XePrime Partner tạo tài
    // khoản ĐỐI TÁC — chủ xe cá nhân lẫn gian hàng — rồi chọn tuyến ở bước onboarding như web.
    const { userId } = await this.auth.register(dto, realmForClientApp(dto.clientApp));
    return this.buildSession(userId, dto.device, dto.clientApp);
  }

  /**
   * Đổi one-time code của luồng đăng nhập mạng xã hội lấy cặp token — ADR 0019.
   *
   * Tương ứng chặng `Set-Cookie` của web, khác ở chỗ web nhận cookie ngay trong lần điều hướng
   * còn app phải đổi thêm một bước. Bước thừa đó là có lý do: deep link đi qua hệ điều hành và
   * nằm lại trong log của nó, nên thứ đi qua đó phải là một mã sống 60 giây chứ không phải một
   * refresh token 60 ngày.
   *
   * `@Public()` vì đây CHÍNH LÀ lúc app chưa có phiên — `code` + `codeVerifier` là bằng chứng.
   * 10 lần/phút: mã sống 60 giây và dùng một lần, nên đây không phải cửa dò, nhưng vẫn siết để
   * một app hỏng không bơm được vào bảng `native_auth_codes`.
   */
  @Public()
  @VerifiesCredentials()
  @Post('social/exchange')
  @HttpCode(HttpStatus.OK)
  @Throttle(THROTTLE_PER_MINUTE.SOCIAL)
  @ApiOperation({
    summary: 'Native: đổi one-time code của social login lấy access + refresh token',
  })
  @ApiOkResponse({ type: MobileSessionDto })
  async exchangeSocialCode(@Body() dto: MobileSocialExchangeDto): Promise<MobileSessionDto> {
    // `consume` đối chiếu `clientApp` với app đã khởi tạo luồng (suy từ `redirect_uri` lúc
    // begin) — một code xin cho app này không đổi được phiên cho app kia.
    const { userId } = await this.nativeCodes.consume(dto.code, dto.codeVerifier, dto.clientApp);
    return this.buildSession(userId, dto.device, dto.clientApp);
  }

  /**
   * "Sign in with Apple" trên iOS — chỉ có ở app native, không có trên web.
   *
   * Không đi luồng redirect như Google/Facebook: iOS trả thẳng `identityToken` cho app, app gửi
   * lên đây. Server kiểm chữ ký Apple, `aud` = bundle ID của ĐÚNG app, và `nonce` (xem
   * `AppleIdentityVerifier`), rồi tạo/nối tài khoản TRONG realm của app — cùng đường
   * `upsertUserFromIdentity` với hai provider kia, nên luật nối email (chỉ khi provider đã xác
   * minh email) và chặn tài khoản khoá giữ nguyên.
   *
   * `@Public()` vì đây là lúc app chưa có phiên — token Apple là bằng chứng.
   */
  @Public()
  @VerifiesCredentials()
  @Post('apple')
  @HttpCode(HttpStatus.OK)
  @Throttle(THROTTLE_PER_MINUTE.SOCIAL)
  @ApiOperation({
    summary: 'Native iOS: đăng nhập bằng Apple — đổi identityToken lấy access + refresh token',
  })
  @ApiOkResponse({ type: MobileSessionDto })
  async appleLogin(@Body() dto: MobileAppleLoginDto): Promise<MobileSessionDto> {
    const clientApp = dto.clientApp ?? MOBILE_CLIENT_APP.CUSTOMER;
    let identity;
    try {
      identity = await this.apple.verify({
        identityToken: dto.identityToken,
        rawNonce: dto.nonce,
        clientApp,
        fullName: dto.fullName ?? null,
      });
    } catch (error) {
      // Lỗi của provider là Error thường — đổi sang 401 kèm MÃ để app dịch được (ADR 0012).
      if (error instanceof SocialAuthFailure) {
        this.logger.warn(`Đăng nhập Apple thất bại: ${error.message}`);
        throw new UnauthorizedException({
          code: error.code,
          message: APPLE_TOKEN_REJECTED_MESSAGE,
        });
      }
      throw error;
    }
    const { userId } = await this.auth.upsertUserFromIdentity(
      identity,
      realmForClientApp(clientApp),
    );
    return this.buildSession(userId, dto.device, clientApp);
  }

  /**
   * Xoay refresh token.
   *
   * `@Public()` vì access token lúc này đã hết hạn — chính refresh token trong body là bằng chứng.
   * Trả về CẶP MỚI; token vừa gửi lên chết ngay. Gửi lại nó lần nữa ⇒ thu hồi cả phiên
   * (ADR 0017 §4).
   */
  @Public()
  @VerifiesCredentials()
  @Post('refresh')
  @HttpCode(HttpStatus.OK)
  @Throttle(THROTTLE_PER_MINUTE.SESSION)
  @ApiOperation({ summary: 'Native: xoay refresh token, nhận cặp token mới' })
  @ApiOkResponse({ type: MobileTokenPairDto })
  async refresh(@Body() dto: MobileRefreshDto): Promise<MobileTokenPairDto> {
    return toTokenPairDto(await this.nativeSessions.rotate(dto.refreshToken));
  }

  /**
   * Thu hồi phiên của thiết bị này.
   *
   * `@Public()` và **luôn 204**, kể cả với token lạ: đăng xuất là thao tác dọn dẹp, và một 404 ở
   * đây cho phép dò xem một chuỗi có phải refresh token hợp lệ. App gọi được cả khi access token
   * đã hết hạn — đúng lúc người dùng bấm "Đăng xuất" sau nhiều ngày không mở app.
   */
  @Public()
  @Post('logout')
  @HttpCode(HttpStatus.NO_CONTENT)
  @Throttle(THROTTLE_PER_MINUTE.SESSION)
  @ApiOperation({ summary: 'Native: thu hồi phiên của thiết bị hiện tại' })
  @ApiNoContentResponse()
  async logout(@Body() dto: MobileLogoutDto): Promise<void> {
    await this.nativeSessions.revokeByRefreshToken(dto.refreshToken);
  }

  private async buildSession(
    userId: string,
    device: MobileDeviceDto | undefined,
    clientApp: MobileClientApp | undefined,
  ): Promise<MobileSessionDto> {
    // `me()` đọc quyền + tenant scope từ DB. Chúng đi trong BODY, không trong token (ADR 0017 §1).
    //
    // Không còn cổng "tài khoản này thuộc app nào": tài khoản đã được tra TRONG realm của app
    // (`realmForClientApp`) ở mọi đường gọi tới đây, nên app Partner chỉ thấy tài khoản đối tác —
    // chủ xe tuyến hoa hồng lẫn gian hàng tuyến gói — và app XePrime chỉ thấy tài khoản khách.
    const user = await this.auth.me(userId);

    const pair = await this.nativeSessions.issueSession(
      userId,
      toDeviceInfo(device),
      clientApp ?? MOBILE_CLIENT_APP.CUSTOMER,
    );
    return { tokens: toTokenPairDto(pair), user };
  }
}

/**
 * `exactOptionalPropertyTypes` bật: `{ deviceName: undefined }` KHÔNG gán được vào
 * `{ deviceName?: string }`. Chuyển tường minh thay vì spread để trường vắng mặt là vắng mặt thật.
 */
function toDeviceInfo(device: MobileDeviceDto | undefined): NativeDeviceInfo {
  if (!device) return {};
  return {
    ...(device.deviceName === undefined ? {} : { deviceName: device.deviceName }),
    ...(device.devicePlatform === undefined ? {} : { devicePlatform: device.devicePlatform }),
    ...(device.appVersion === undefined ? {} : { appVersion: device.appVersion }),
  };
}

/** `sessionId` CỐ Ý không ra ngoài: client không cần nó, và nó là mã nội bộ để thu hồi. */
function toTokenPairDto(pair: NativeTokenPair): MobileTokenPairDto {
  return {
    accessToken: pair.accessToken,
    accessTokenExpiresIn: pair.accessTokenExpiresIn,
    refreshToken: pair.refreshToken,
    refreshTokenExpiresAt: pair.refreshTokenExpiresAt.toISOString(),
  };
}

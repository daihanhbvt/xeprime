import { Global, Module } from '@nestjs/common';
import { AuthController } from './auth.controller';
import { MobileAuthController } from './mobile-auth.controller';
import { AuthService } from './auth.service';
import { LoginThrottleService } from './login-throttle.service';
import { NativeSessionService } from './native-session.service';
import { SessionService } from './session.service';
import { RequestRealmService } from './request-realm.service';
import { NativeAuthCodeService } from './social/native-auth-code.service';
import { OauthStateService } from './social/oauth-state.service';
import { SocialAuthController } from './social/social-auth.controller';
import { SocialAuthService } from './social/social-auth.service';
import { AppleIdentityVerifier } from './social/apple-identity.verifier';
import { FeePoliciesModule } from '../fee-policies/fee-policies.module';
import { PhoneVerificationModule } from '../phone-verification/phone-verification.module';

/**
 * Ba controller, ba họ endpoint, MỘT `AuthService`.
 *
 *  - `AuthController` — mật khẩu + phiên cookie của web (ADR 0002);
 *  - `MobileAuthController` — cặp access/refresh token của app native (ADR 0017);
 *  - `SocialAuthController` — Google/Facebook do backend chủ trì (ADR 0019).
 *
 * Luật xác thực người dùng (mật khẩu, khoá tài khoản, tìm/tạo user từ danh tính) chỉ có một bản
 * ở `AuthService`; ba controller khác nhau đúng ở chỗ phát ra loại phiên nào.
 *
 * Từ ADR 0019 module này KHÔNG còn provider nào phụ thuộc Firebase. `firebase-admin` vẫn ở lại
 * repo nhưng chỉ phục vụ chat realtime (`FirebaseAppService`, ADR 0009).
 */
@Global()
@Module({
  /*
   * `FeePoliciesModule` cho `/auth/me`: nhãn tài khoản của chủ xe tuyến hoa hồng in % phí dịch
   * vụ ĐANG THU, và con số đó chỉ có một nguồn hợp lệ — `FeePoliciesService.findEffective()`.
   * Không nối `PricingModule` hay tự query `fee_policies` ở đây.
   *
   * `PhoneVerificationModule` cho đăng ký và quên mật khẩu (ADR 0060): hai luồng đó đối chiếu
   * mã OTP NGAY trong `AuthService`, ngay trước khi tạo tài khoản / đổi mật khẩu — không client
   * nào bỏ được bước mã. Không vòng ở mức provider: `PhoneVerificationService` không phụ thuộc gì
   * của module này (controller của nó dùng `AuthService` qua `@Global`).
   */
  imports: [FeePoliciesModule, PhoneVerificationModule],
  controllers: [AuthController, MobileAuthController, SocialAuthController],
  providers: [
    AuthService,
    SessionService,
    LoginThrottleService,
    RequestRealmService,
    NativeSessionService,
    OauthStateService,
    NativeAuthCodeService,
    SocialAuthService,
    AppleIdentityVerifier,
  ],
  exports: [
    SessionService,
    RequestRealmService,
    NativeSessionService,
    AuthService,
    OauthStateService,
    NativeAuthCodeService,
  ],
})
export class AuthModule {}

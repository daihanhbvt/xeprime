import { Global, Module } from '@nestjs/common';
import { AuthController } from './auth.controller';
import { MobileAuthController } from './mobile-auth.controller';
import { AuthService } from './auth.service';
import { NativeSessionService } from './native-session.service';
import { SessionService } from './session.service';
import { NativeAuthCodeService } from './social/native-auth-code.service';
import { OauthStateService } from './social/oauth-state.service';
import { SocialAuthController } from './social/social-auth.controller';
import { SocialAuthService } from './social/social-auth.service';

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
  controllers: [AuthController, MobileAuthController, SocialAuthController],
  providers: [
    AuthService,
    SessionService,
    NativeSessionService,
    OauthStateService,
    NativeAuthCodeService,
    SocialAuthService,
  ],
  exports: [SessionService, NativeSessionService, AuthService, OauthStateService, NativeAuthCodeService],
})
export class AuthModule {}

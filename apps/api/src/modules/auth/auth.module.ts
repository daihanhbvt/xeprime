import { Global, Module } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { AuthController } from './auth.controller';
import { MobileAuthController } from './mobile-auth.controller';
import { AuthService } from './auth.service';
import { EmailService } from './email.service';
import { NativeSessionService } from './native-session.service';
import { SessionService } from './session.service';
import { FirebaseIdTokenVerifier, IdTokenVerifier, MockIdTokenVerifier } from './token-verifier';

/**
 * ADR 0002: chọn verifier theo `AUTH_MODE`. Guard, session và phần còn lại của app không
 * biết Firebase tồn tại — đổi nhà cung cấp chỉ thêm một implementation ở đây.
 *
 * Hai controller, hai họ endpoint (ADR 0017): `AuthController` phát session cookie cho web,
 * `MobileAuthController` phát cặp access/refresh token cho app native. Cùng `AuthService`, nên
 * luật xác thực người dùng (mật khẩu, khoá tài khoản, upsert từ ID token) chỉ có một bản.
 */
@Global()
@Module({
  controllers: [AuthController, MobileAuthController],
  providers: [
    AuthService,
    SessionService,
    NativeSessionService,
    EmailService,
    {
      provide: IdTokenVerifier,
      inject: [ConfigService],
      useFactory: (config: ConfigService): IdTokenVerifier =>
        config.getOrThrow<string>('AUTH_MODE') === 'firebase'
          ? new FirebaseIdTokenVerifier(config)
          : new MockIdTokenVerifier(),
    },
  ],
  exports: [SessionService, NativeSessionService, AuthService],
})
export class AuthModule {}

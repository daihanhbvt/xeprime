import { Global, Module } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { AuthController } from './auth.controller';
import { AuthService } from './auth.service';
import { EmailService } from './email.service';
import { SessionService } from './session.service';
import { FirebaseIdTokenVerifier, IdTokenVerifier, MockIdTokenVerifier } from './token-verifier';

/**
 * ADR 0002: chọn verifier theo `AUTH_MODE`. Guard, session và phần còn lại của app không
 * biết Firebase tồn tại — đổi nhà cung cấp chỉ thêm một implementation ở đây.
 */
@Global()
@Module({
  controllers: [AuthController],
  providers: [
    AuthService,
    SessionService,
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
  exports: [SessionService, AuthService],
})
export class AuthModule {}

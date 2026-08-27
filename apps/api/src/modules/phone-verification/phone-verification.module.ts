import { Module } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { OTP_PROVIDER, otpProviderFactory } from './otp-provider';
import { MobilePhoneAuthController } from './mobile-phone-auth.controller';
import { PhoneVerificationController } from './phone-verification.controller';
import { PhoneVerificationService } from './phone-verification.service';

/**
 * Xác thực SĐT bằng OTP (Phase 4). Provider chọn theo OTP_MODE (mock/eSMS) — cùng khuôn mẫu
 * Export service để BookingRequests gate `submitPublic`.
 */
@Module({
  controllers: [PhoneVerificationController, MobilePhoneAuthController],
  providers: [
    PhoneVerificationService,
    {
      provide: OTP_PROVIDER,
      inject: [ConfigService],
      useFactory: otpProviderFactory,
    },
  ],
  exports: [PhoneVerificationService],
})
export class PhoneVerificationModule {}

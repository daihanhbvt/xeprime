import { Module } from '@nestjs/common';
import { EmailVerificationModule } from '../email-verification/email-verification.module';
import { PhoneVerificationModule } from '../phone-verification/phone-verification.module';
import { UsersController } from './users.controller';

/**
 * Hồ sơ của CHÍNH người đang đăng nhập.
 *
 * Import hai module xác thực vì đổi email/SĐT ở đây không phải là ghi một chuỗi: nó chỉ có
 * hiệu lực sau khi người dùng chứng minh nhận được mã ở địa chỉ/số MỚI (xem `UsersController`).
 */
@Module({
  imports: [PhoneVerificationModule, EmailVerificationModule],
  controllers: [UsersController],
})
export class UsersModule {}

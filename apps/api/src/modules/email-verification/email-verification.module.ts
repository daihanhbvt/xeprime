import { Module } from '@nestjs/common';
import { EmailVerificationService } from './email-verification.service';

/**
 * Xác thực địa chỉ email bằng mã 6 số.
 *
 * KHÔNG có controller riêng: endpoint duy nhất cần tới nó là "đổi email của chính tôi", và nó
 * sống ở `/users/me/email/*` — cùng chỗ với hồ sơ mà nó sửa. Một `/auth/email/verify` công khai
 * sẽ là một endpoint không ai gọi, nhưng vẫn phải bảo vệ.
 *
 * `EmailService` đến từ `EmailModule` (`@Global`), nên không cần import gì ở đây.
 */
@Module({
  providers: [EmailVerificationService],
  exports: [EmailVerificationService],
})
export class EmailVerificationModule {}

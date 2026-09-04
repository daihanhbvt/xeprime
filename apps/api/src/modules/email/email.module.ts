import { Global, Module } from '@nestjs/common';
import { EmailService } from './email.service';

/**
 * Gửi email giao dịch — MỘT transport dùng chung cho cả tiến trình.
 *
 * Trước 03/09/2026 `EmailService` nằm trong `AuthModule` vì chỉ luồng quên-mật-khẩu cần tới nó.
 * Từ khi có thư mời thành viên thì đã có hai người dùng, và cách sai là khai lại provider ở
 * module thứ hai: `nodemailer.createTransport` mở một pool kết nối SMTP riêng, nên hai bản sao
 * là hai pool cùng đăng nhập một tài khoản — vừa lãng phí vừa dễ chạm giới hạn kết nối của nhà
 * cung cấp.
 *
 * `@Global` cùng lý do với `PrismaModule`/`AuditModule`: một dịch vụ hạ tầng không có state
 * riêng theo module, và bắt mỗi module nghiệp vụ import nó chỉ thêm nhiễu.
 */
@Global()
@Module({
  providers: [EmailService],
  exports: [EmailService],
})
export class EmailModule {}

import { Module } from '@nestjs/common';
import { CustomerSupportController } from './customer-support.controller';
import { PlatformSupportController } from './platform-support.controller';
import { SupportController } from './support.controller';
import { SupportService } from './support.service';

/**
 * Hỗ trợ / tranh chấp (R3). BA controller — khách, gian hàng, nền tảng — nhưng MỘT service:
 * phạm vi đọc là một mảnh `where` theo vai, không phải ba bản cài đặt song song. Ba service là
 * ba chỗ để quên một điều kiện quyền, và ở đây quên một điều kiện nghĩa là một người mở được
 * tranh chấp trên chuyến của người khác — thứ giữ tiền của bên thứ ba.
 */
@Module({
  controllers: [SupportController, CustomerSupportController, PlatformSupportController],
  providers: [SupportService],
  exports: [SupportService],
})
export class SupportModule {}

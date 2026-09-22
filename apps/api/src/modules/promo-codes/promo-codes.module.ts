import { Module } from '@nestjs/common';
import { AuditModule } from '../audit/audit.module';
import { AuthModule } from '../auth/auth.module';
import { PricingModule } from '../pricing/pricing.module';
import { PlatformPromoCodesController } from './platform-promo-codes.controller';
import { PromoCodeEvaluatorService } from './promo-code-evaluator.service';
import { PromoCodesService } from './promo-codes.service';
import { PromoQuoteService } from './promo-quote.service';
import { PublicPromoCodesController } from './public-promo-codes.controller';

/**
 * MÃ KHUYẾN MÃI NỀN TẢNG — ADR 0046.
 *
 * ## Chiều phụ thuộc
 *
 * Module này phụ thuộc `PricingModule`, **không phải ngược lại**. `PricingService.customerFeesFor`
 * nhận một `PromoCodeSnapshot` đã đánh giá và chỉ áp con số trong đó — nó không biết bảng
 * `promo_codes` tồn tại. Nhờ vậy không có vòng, và không có `forwardRef` nào che mất câu hỏi
 * "ai là nguồn của con số".
 *
 * `AuthModule`: endpoint xem trước là CÔNG KHAI nhưng vẫn đọc phiên NẾU có, để kiểm điều kiện
 * theo khách (khách hàng mới, trần lượt mỗi người) mà không nhận danh tính từ payload.
 *
 * ## Ai dùng `PromoCodeEvaluatorService`
 *
 * `BookingRequestsModule` (giữ lượt lúc gửi · tính lại + chốt/nhả lúc duyệt) và `HoldsModule`
 * (chốt khi tiền về · nhả khi hold hết hạn hoặc khách huỷ). Chỉ export nó — `PromoCodesService`
 * là của màn quản trị và không có việc gì trên đường tiền.
 */
@Module({
  imports: [AuditModule, PricingModule, AuthModule],
  controllers: [PlatformPromoCodesController, PublicPromoCodesController],
  providers: [PromoCodesService, PromoCodeEvaluatorService, PromoQuoteService],
  exports: [PromoCodeEvaluatorService],
})
export class PromoCodesModule {}

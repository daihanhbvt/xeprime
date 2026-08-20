import { Module } from '@nestjs/common';
import { ListingsService } from './listings.service';

/**
 * Writer DUY NHẤT của `public_listings` (ADR 0008), đứng riêng thành module LÁ — nó chỉ phụ
 * thuộc `PrismaService`.
 *
 * Vì sao tách khỏi `PublicListingsModule`: module đó còn chứa `PublicListingsService`, vốn phải
 * import `PricingModule` để đọc chính sách hiệu lực. Từ 20/08 chiều ngược cũng cần thiết —
 * `PricingService.saveShopPolicy` phải đồng bộ lại nhãn "Miễn thế chấp" cho các xe đang kế thừa
 * — và hai module import lẫn nhau là vòng lặp. Tách phần writer (không phụ thuộc gì) ra đây gỡ
 * đúng vòng đó mà KHÔNG cần `forwardRef`, và ADR 0008 giữ nguyên vì lớp writer không đổi.
 */
@Module({
  providers: [ListingsService],
  exports: [ListingsService],
})
export class ListingsSyncModule {}

import { Module } from '@nestjs/common';
import { FavoritesController } from './favorites.controller';
import { FavoritesService } from './favorites.service';

/**
 * Xe yêu thích của tài khoản khách. Sở hữu DUY NHẤT bảng `customer_favorites`; thẻ xe đọc snapshot
 * `public_listings` qua `listing-card.ts` (hàm thuần, không cần import `PublicListingsModule` —
 * module này không ghi snapshot và không cần service nào của chợ).
 */
@Module({
  controllers: [FavoritesController],
  providers: [FavoritesService],
})
export class FavoritesModule {}

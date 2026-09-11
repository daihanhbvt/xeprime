import { Module } from '@nestjs/common';
import { WalletModule } from '../wallet/wallet.module';
import { HoldSettlementService } from './hold-settlement.service';

/**
 * Chốt kết cục + hoàn khoản giữ chỗ (R3). Module RIÊNG, không phụ thuộc gì ngoài các module
 * toàn cục — để `BookingsModule` import được (hook lúc chuyển trạng thái đơn) mà không tạo vòng
 * với `HoldsModule` (vốn import `BookingsModule` để tạo đơn lúc tiền về).
 */
@Module({
  // `WalletModule` không có controller và không import ai — thêm nó KHÔNG tạo vòng.
  imports: [WalletModule],
  providers: [HoldSettlementService],
  exports: [HoldSettlementService],
})
export class HoldSettlementModule {}

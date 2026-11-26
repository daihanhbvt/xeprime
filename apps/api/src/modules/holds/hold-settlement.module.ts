import { Module } from '@nestjs/common';
import { FinanceModule } from '../finance/finance.module';
import { WalletModule } from '../wallet/wallet.module';
import { HoldSettlementService } from './hold-settlement.service';

/**
 * Chốt kết cục + hoàn khoản giữ chỗ (R3). Module RIÊNG, không phụ thuộc gì ngoài các module
 * toàn cục — để `BookingsModule` import được (hook lúc chuyển trạng thái đơn) mà không tạo vòng
 * với `HoldsModule` (vốn import `BookingsModule` để tạo đơn lúc tiền về).
 */
@Module({
  // `WalletModule` không có controller và không import ai — thêm nó KHÔNG tạo vòng. `FinanceModule`
  // (sổ Thu-Chi - phiếu phần chủ xe lúc quyết toán) cũng không import module nghiệp vụ nào.
  imports: [WalletModule, FinanceModule],
  providers: [HoldSettlementService],
  exports: [HoldSettlementService],
})
export class HoldSettlementModule {}

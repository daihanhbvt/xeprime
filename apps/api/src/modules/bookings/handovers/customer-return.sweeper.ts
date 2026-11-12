import {
  Injectable,
  Logger,
  type OnApplicationBootstrap,
  type OnApplicationShutdown,
} from '@nestjs/common';
import { CustomerHandoverService } from './customer-handover.service';

/** Nhịp quét — hạn chủ xe xác nhận tính bằng GIỜ, một phút trễ không ai nhận ra. */
const CUSTOMER_RETURN_SWEEP_INTERVAL_MS = 60_000;

/**
 * Bộ QUÉT tự hoàn thành chuyến sau lời báo "Đã trả xe" của khách — ADR 0081.
 *
 * Vì sao ở API chứ không ở `apps/worker`: việc cần làm là HOÀN THÀNH ĐƠN — lập biên bản trả xe, chuyển
 * trạng thái, quyết toán khoản giữ chỗ vào ví, đóng bảo hiểm — và chuỗi đó chỉ sống trong
 * `HandoversService` / `BookingsService` / `HoldSettlementService`. Viết lại nó trong worker là một
 * writer thứ hai của tiền (cùng lý do với `PaymentGatewaySweeper`). Nhiều tiến trình API cùng chạy vẫn
 * an toàn: mỗi đơn khoá dòng rồi kiểm lại, và claim biên bản chỉ một bên khớp.
 */
@Injectable()
export class CustomerReturnSweeper implements OnApplicationBootstrap, OnApplicationShutdown {
  private readonly logger = new Logger(CustomerReturnSweeper.name);
  private timer: NodeJS.Timeout | null = null;
  private running = false;

  constructor(private readonly customerHandover: CustomerHandoverService) {}

  onApplicationBootstrap(): void {
    this.timer = setInterval(() => void this.sweep(), CUSTOMER_RETURN_SWEEP_INTERVAL_MS);
    // Không giữ tiến trình sống chỉ vì vòng quét — tắt API là tắt luôn.
    this.timer.unref();
  }

  onApplicationShutdown(): void {
    if (this.timer) clearInterval(this.timer);
    this.timer = null;
  }

  /** Một vòng quét. Public để test gọi thẳng, không phải đợi đồng hồ. */
  async sweep(now: Date = new Date()): Promise<number> {
    // Vòng trước chưa xong ⇒ bỏ vòng này, không chồng hai vòng lên nhau.
    if (this.running) return 0;
    this.running = true;
    try {
      const completed = await this.customerHandover.completeDueReturns(now);
      if (completed) this.logger.log(`Tự hoàn thành ${completed} chuyến sau lời báo trả xe`);
      return completed;
    } catch (error) {
      this.logger.error('Quét tự hoàn thành chuyến lỗi', error as Error);
      return 0;
    } finally {
      this.running = false;
    }
  }
}

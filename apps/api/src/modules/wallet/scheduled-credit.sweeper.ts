import {
  Injectable,
  Logger,
  type OnApplicationBootstrap,
  type OnApplicationShutdown,
} from '@nestjs/common';
import { ScheduledCreditService } from './scheduled-credit.service';

/** Nhịp quét — số giờ chờ tính bằng GIỜ, trễ một phút không ai nhận ra. */
const SCHEDULED_CREDIT_SWEEP_INTERVAL_MS = 60_000;

/**
 * Bộ QUÉT cộng ví các khoản hẹn giờ đã tới hạn (biên bản họp 19/11/2026 — tiền hoàn khi khách huỷ).
 *
 * Ở API chứ không ở `apps/worker`: cộng ví là việc của `WalletService` (writer duy nhất của sổ ví,
 * ADR 0023), viết lại trong worker là một writer thứ hai của tiền. Nhiều tiến trình API cùng chạy vẫn
 * an toàn: mỗi khoản được chiếm bằng `updateMany` có điều kiện trạng thái và unique của sổ ví.
 */
@Injectable()
export class ScheduledCreditSweeper implements OnApplicationBootstrap, OnApplicationShutdown {
  private readonly logger = new Logger(ScheduledCreditSweeper.name);
  private timer: NodeJS.Timeout | null = null;
  private running = false;

  constructor(private readonly credits: ScheduledCreditService) {}

  onApplicationBootstrap(): void {
    this.timer = setInterval(() => void this.sweep(), SCHEDULED_CREDIT_SWEEP_INTERVAL_MS);
    this.timer.unref();
  }

  onApplicationShutdown(): void {
    if (this.timer) clearInterval(this.timer);
    this.timer = null;
  }

  /** Một vòng quét. Public để test gọi thẳng, không phải đợi đồng hồ. */
  async sweep(now: Date = new Date()): Promise<number> {
    if (this.running) return 0;
    this.running = true;
    try {
      const released = await this.credits.releaseDue(now);
      if (released) this.logger.log(`Đã cộng ví ${released} khoản hẹn giờ tới hạn`);
      return released;
    } catch (error) {
      this.logger.error('Quét khoản cộng ví hẹn giờ lỗi', error as Error);
      return 0;
    } finally {
      this.running = false;
    }
  }
}

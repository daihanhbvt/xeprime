import {
  Injectable,
  Logger,
  type OnApplicationBootstrap,
  type OnApplicationShutdown,
} from '@nestjs/common';
import { InsuranceCertificateService } from './insurance-certificate.service';
import { InsuranceFollowUpService } from './insurance-follow-up.service';
import { InsuranceRefundService } from './insurance-refund.service';

/** Nhịp quét — báo khẩn tính bằng giờ, lưu GCN trước không cần tức thời. */
const INSURANCE_FOLLOW_UP_INTERVAL_MS = 5 * 60_000;

/** Số GCN lưu trước mỗi vòng — mỗi bản là một lượt tải từ MIC. */
const PREFETCH_BATCH = 20;

/**
 * Vòng THEO DÕI hợp đồng bảo hiểm — ADR 0091 điều 6, 7.
 *
 *  1. Báo khẩn: hợp đồng quá 2 giờ sau giao xe mà chưa cấp ⇒ đánh dấu một lần, hiện ở khối "Cần xử
 *     lý gấp" của màn Bảo hiểm (\`InsuranceFollowUpService.attention\`).
 *  2. Lưu trước GCN của hợp đồng vừa cấp vào R2 riêng tư — để lúc khách cần giấy chứng nhận thì không
 *     phụ thuộc MIC còn chạy hay không.
 *  3. Tự hoàn: chuyến đã quyết toán mà hợp đồng vẫn chưa cấp ⇒ tra cứu lần cuối, không có thì hoàn
 *     `IV` + phí thu hộ vào Ví điểm khách (`InsuranceRefundService`).
 *
 * Ở API chứ không ở worker vì tải GCN cần client MIC + R2 mà API đã có (cùng lý do với
 * \`CustomerReturnSweeper\`). Nhiều tiến trình API cùng chạy vẫn an toàn: phép đánh dấu là một câu
 * \`UPDATE\` có điều kiện, phép lưu ghi đè cùng một khoá.
 */
@Injectable()
export class InsuranceFollowUpSweeper implements OnApplicationBootstrap, OnApplicationShutdown {
  private readonly logger = new Logger(InsuranceFollowUpSweeper.name);
  private timer: NodeJS.Timeout | null = null;
  private running = false;

  constructor(
    private readonly followUp: InsuranceFollowUpService,
    private readonly certificates: InsuranceCertificateService,
    private readonly refunds: InsuranceRefundService,
  ) {}

  onApplicationBootstrap(): void {
    this.timer = setInterval(() => void this.sweep(), INSURANCE_FOLLOW_UP_INTERVAL_MS);
    this.timer.unref();
  }

  onApplicationShutdown(): void {
    if (this.timer) clearInterval(this.timer);
    this.timer = null;
  }

  /** Một vòng quét. Public để test gọi thẳng. */
  async sweep(
    now: Date = new Date(),
  ): Promise<{ escalated: number; stored: number; refunded: number }> {
    if (this.running) return { escalated: 0, stored: 0, refunded: 0 };
    this.running = true;
    try {
      const escalated = await this.followUp.markEscalations(now);
      if (escalated) {
        this.logger.warn(
          `Bảo hiểm: ${escalated} hợp đồng quá 2 giờ sau giao xe chưa cấp - báo khẩn`,
        );
      }
      const stored = await this.certificates.prefetch(PREFETCH_BATCH);
      if (stored) this.logger.log(`Bảo hiểm: đã lưu trước ${stored} giấy chứng nhận`);
      const refund = await this.refunds.refundOverdue(now);
      if (refund.recovered || refund.refunded || refund.deferred) {
        this.logger.warn(
          `Bảo hiểm quá giờ trả: ghi nhận ${refund.recovered}, hoàn ${refund.refunded}, chờ đối tác ${refund.deferred}`,
        );
      }
      return { escalated, stored, refunded: refund.refunded };
    } catch (error) {
      this.logger.error('Quét theo dõi bảo hiểm lỗi', error as Error);
      return { escalated: 0, stored: 0, refunded: 0 };
    } finally {
      this.running = false;
    }
  }
}

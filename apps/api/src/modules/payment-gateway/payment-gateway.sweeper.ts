import {
  Injectable,
  Logger,
  type OnApplicationBootstrap,
  type OnApplicationShutdown,
} from '@nestjs/common';
import {
  PAYMENT_GATEWAY_SWEEP_BATCH,
  PAYMENT_GATEWAY_SWEEP_INTERVAL_MS,
  PAYMENT_GATEWAY_SWEEP_MAX_AGE_DAYS,
  PAYMENT_GATEWAY_SWEEP_MIN_AGE_MINUTES,
  PAYMENT_ORDER_REVIEW_REASON,
  PAYMENT_ORDER_REVIEW_STATUS,
  PAYMENT_ORDER_STATUS,
} from '@xeprime/types';
import { PrismaService } from '../../prisma/prisma.service';
import { PaymentGatewayConfig } from './payment-gateway.config';
import { PaymentGatewayService } from './payment-gateway.service';

const MINUTE_MS = 60_000;

export interface SweepReport {
  queried: number;
  reapplied: number;
}

/**
 * Bộ QUÉT định kỳ của cổng thanh toán — lưới an toàn cho đúng ca mà IPN và trang quay về cùng hụt
 * (ADR 0058): IPN hỏng một lần (deploy, mạng) và người trả không quay lại trình duyệt — chuyện thường
 * ngày trên điện thoại, khi khách trả trong app MoMo rồi đóng luôn. Không có bộ quét, khoản đó nằm
 * "đang chờ" mãi trong khi màn hình đã hứa "XePrime vẫn tự ghi nhận".
 *
 * Mỗi vòng:
 *  1. lượt còn CHỜ (đủ cũ để IPN lẽ ra đã tới, chưa quá cũ) ⇒ hỏi cổng qua `settle` — cùng đường,
 *     cùng nhịp giới hạn, cùng luật như trang quay về;
 *  2. lượt cổng ĐÃ THU mà chưa ghi nhận (áp hỏng tạm thời) ⇒ áp lại.
 *
 * Vì sao ở API chứ không ở `apps/worker`: việc cần làm là ÁP TIỀN — tạo đơn thuê, bật gói — và đường đó
 * chỉ sống trong `BillingService`/`BookingHoldsService`. Viết lại nó trong worker là một writer thứ hai
 * của tiền. Chạy nhiều tiến trình API cùng lúc vẫn an toàn: mỗi lượt hỏi được claim bằng
 * `last_queried_at`, mỗi lượt áp khoá dòng.
 *
 * Chỉ chạy khi có ít nhất một cổng đủ khoá — môi trường không bật cổng không có vòng lặp nào.
 */
@Injectable()
export class PaymentGatewaySweeper implements OnApplicationBootstrap, OnApplicationShutdown {
  private readonly logger = new Logger(PaymentGatewaySweeper.name);
  private timer: NodeJS.Timeout | null = null;
  private running = false;

  constructor(
    private readonly prisma: PrismaService,
    private readonly config: PaymentGatewayConfig,
    private readonly gateway: PaymentGatewayService,
  ) {}

  onApplicationBootstrap(): void {
    if (!this.config.anyConfigured) return;
    this.timer = setInterval(() => void this.sweep(), PAYMENT_GATEWAY_SWEEP_INTERVAL_MS);
    // Không giữ tiến trình sống chỉ vì vòng quét — tắt API là tắt luôn.
    this.timer.unref();
  }

  onApplicationShutdown(): void {
    if (this.timer) clearInterval(this.timer);
    this.timer = null;
  }

  /** Một vòng quét. Public để test gọi thẳng, không phải đợi đồng hồ. */
  async sweep(now: Date = new Date()): Promise<SweepReport> {
    // Vòng trước chưa xong (cổng chậm) ⇒ bỏ vòng này, không chồng hai vòng lên nhau.
    if (this.running) return { queried: 0, reapplied: 0 };
    this.running = true;
    try {
      const pending = await this.prisma.paymentGatewayOrder.findMany({
        where: {
          status: PAYMENT_ORDER_STATUS.PENDING,
          reviewStatus: { not: PAYMENT_ORDER_REVIEW_STATUS.RESOLVED },
          createdAt: {
            lt: new Date(now.getTime() - PAYMENT_GATEWAY_SWEEP_MIN_AGE_MINUTES * MINUTE_MS),
            gt: new Date(now.getTime() - PAYMENT_GATEWAY_SWEEP_MAX_AGE_DAYS * 24 * 60 * MINUTE_MS),
          },
          OR: [
            { lastQueriedAt: null },
            { lastQueriedAt: { lt: new Date(now.getTime() - PAYMENT_GATEWAY_SWEEP_INTERVAL_MS) } },
          ],
        },
        orderBy: { createdAt: 'asc' },
        take: PAYMENT_GATEWAY_SWEEP_BATCH,
        select: { id: true },
      });
      let queried = 0;
      for (const order of pending) {
        // Tuần tự: một cổng chậm không được nhân lên thành 50 request đồng thời.
        const result = await this.gateway.settle(order.id);
        if (result !== 'skipped') queried += 1;
      }

      const unapplied = await this.prisma.paymentGatewayOrder.findMany({
        where: {
          status: PAYMENT_ORDER_STATUS.SUCCEEDED,
          appliedAt: null,
          reviewStatus: { not: PAYMENT_ORDER_REVIEW_STATUS.RESOLVED },
          // Lượt người trực đang giữ (kết quả tới sau khi đã đóng, trùng mã…) KHÔNG tự áp.
          OR: [{ reviewReason: null }, { reviewReason: PAYMENT_ORDER_REVIEW_REASON.APPLY_FAILED }],
        },
        orderBy: { createdAt: 'asc' },
        take: PAYMENT_GATEWAY_SWEEP_BATCH,
        select: { id: true },
      });
      let reapplied = 0;
      for (const order of unapplied) {
        if (await this.gateway.applyPending(order.id)) reapplied += 1;
      }

      if (queried || reapplied) {
        this.logger.log(`Quét cổng thanh toán: hỏi ${queried} lượt, áp lại ${reapplied} lượt`);
      }
      return { queried, reapplied };
    } catch (error) {
      this.logger.error(
        'Quét cổng thanh toán lỗi — vòng sau thử lại',
        error instanceof Error ? error.stack : String(error),
      );
      return { queried: 0, reapplied: 0 };
    } finally {
      this.running = false;
    }
  }
}

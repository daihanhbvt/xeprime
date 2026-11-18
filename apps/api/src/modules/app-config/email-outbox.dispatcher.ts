import {
  Injectable,
  Logger,
  type OnApplicationBootstrap,
  type OnApplicationShutdown,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import {
  EMAIL_OUTBOX_KIND,
  EMAIL_OUTBOX_MAX_ATTEMPTS,
  EMAIL_OUTBOX_STATUS,
  isAppLocale,
  DEFAULT_LOCALE,
  type PartnerWelcomeEmailPayload,
  type PlanGuideEmailPayload,
} from '@xeprime/types';
import { PrismaService } from '../../prisma/prisma.service';
import { EmailService } from '../email/email.service';
import { PlanGuideTemplatesService } from './plan-guide-templates.service';

/** Nhịp quét hàng đợi email. */
export const EMAIL_OUTBOX_INTERVAL_MS = 30_000;
const BATCH = 20;
/** Thư đứng `sending` quá lâu (tiến trình chết giữa chừng) ⇒ trả về `pending`. */
export const STALE_SENDING_MS = 10 * 60_000;
/** Chưa có mẫu bật ⇒ hẹn lại thay vì đốt lượt thử. */
const NO_TEMPLATE_RETRY_MS = 15 * 60_000;

export interface DispatchReport {
  sent: number;
  failed: number;
  deferred: number;
}

/**
 * Gửi thư trong `email_outbox` — request và worker chỉ XẾP HÀNG, gửi là việc của vòng này.
 *
 * Ở API (không ở `apps/worker`) vì đây là nơi có SMTP + `EmailService` + bộ dựng mẫu; worker chỉ
 * chèn dòng (mốc vòng đời gói). Mỗi dòng được CLAIM bằng `UPDATE … WHERE status = 'pending'` nên
 * nhiều tiến trình API chạy song song vẫn không gửi đôi.
 *
 * ⚠️ Giao hàng AT-LEAST-ONCE, không phải exactly-once. SMTP nhận thư xong mà tiến trình chết TRƯỚC
 * khi ghi `sent` ⇒ dòng đứng `sending`, quá {@link STALE_SENDING_MS} bị trả về `pending` và thư được
 * gửi LẦN NỮA. Chấp nhận được cho thư hướng dẫn (trùng một thư không hại ai); KHÔNG dùng hàng này
 * cho thư mà gửi đôi là sai nghiệp vụ (OTP, biên nhận tiền) khi chưa có khoá idempotent phía nhà
 * cung cấp. Lỗi gửi lùi theo hàm mũ 1, 2, 4, 8… phút; tới `EMAIL_OUTBOX_MAX_ATTEMPTS` lần thì nằm
 * `failed` chờ người xem.
 */
@Injectable()
export class EmailOutboxDispatcher implements OnApplicationBootstrap, OnApplicationShutdown {
  private readonly logger = new Logger(EmailOutboxDispatcher.name);
  private timer: NodeJS.Timeout | null = null;
  private running = false;

  constructor(
    private readonly prisma: PrismaService,
    private readonly email: EmailService,
    private readonly templates: PlanGuideTemplatesService,
    private readonly config: ConfigService,
  ) {}

  onApplicationBootstrap(): void {
    // Test dựng app nhiều lần — không để vòng quét nền chen vào dữ liệu của spec.
    if (this.config.get<string>('NODE_ENV') === 'test') return;
    this.timer = setInterval(() => void this.dispatch(), EMAIL_OUTBOX_INTERVAL_MS);
    this.timer.unref();
  }

  onApplicationShutdown(): void {
    if (this.timer) clearInterval(this.timer);
    this.timer = null;
  }

  /** Một vòng. Public để test gọi thẳng. */
  async dispatch(now: Date = new Date()): Promise<DispatchReport> {
    const report: DispatchReport = { sent: 0, failed: 0, deferred: 0 };
    if (this.running) return report;
    this.running = true;
    try {
      await this.prisma.emailOutbox.updateMany({
        where: {
          status: EMAIL_OUTBOX_STATUS.SENDING,
          updatedAt: { lt: new Date(now.getTime() - STALE_SENDING_MS) },
        },
        data: { status: EMAIL_OUTBOX_STATUS.PENDING },
      });

      const due = await this.prisma.emailOutbox.findMany({
        where: { status: EMAIL_OUTBOX_STATUS.PENDING, nextAttemptAt: { lte: now } },
        orderBy: { nextAttemptAt: 'asc' },
        take: BATCH,
        select: { id: true, kind: true, toEmail: true, locale: true, payloadJson: true, attempts: true },
      });

      for (const row of due) {
        const claimed = await this.prisma.emailOutbox.updateMany({
          where: { id: row.id, status: EMAIL_OUTBOX_STATUS.PENDING },
          data: { status: EMAIL_OUTBOX_STATUS.SENDING },
        });
        if (claimed.count === 0) continue;

        try {
          const locale = isAppLocale(row.locale) ? row.locale : DEFAULT_LOCALE;
          const rendered =
            row.kind === EMAIL_OUTBOX_KIND.PARTNER_WELCOME
              ? await this.templates.renderPartnerWelcome(
                  locale,
                  row.payloadJson as unknown as PartnerWelcomeEmailPayload,
                )
              : await this.templates.renderOutbox(
                  row.kind,
                  locale,
                  row.payloadJson as unknown as PlanGuideEmailPayload,
                );
          if (!rendered) {
            await this.prisma.emailOutbox.update({
              where: { id: row.id },
              data: {
                status: EMAIL_OUTBOX_STATUS.PENDING,
                nextAttemptAt: new Date(now.getTime() + NO_TEMPLATE_RETRY_MS),
                lastError: 'Chưa có mẫu email hướng dẫn gói nào đang bật',
              },
            });
            report.deferred += 1;
            continue;
          }
          await this.email.sendRendered(row.toEmail, rendered);
          await this.prisma.emailOutbox.update({
            where: { id: row.id },
            data: { status: EMAIL_OUTBOX_STATUS.SENT, sentAt: new Date(), lastError: null },
          });
          report.sent += 1;
        } catch (err) {
          const attempts = row.attempts + 1;
          const failed = attempts >= EMAIL_OUTBOX_MAX_ATTEMPTS;
          await this.prisma.emailOutbox.update({
            where: { id: row.id },
            data: {
              attempts,
              status: failed ? EMAIL_OUTBOX_STATUS.FAILED : EMAIL_OUTBOX_STATUS.PENDING,
              // Lùi theo hàm mũ: 1, 2, 4, 8 phút…
              nextAttemptAt: new Date(now.getTime() + 2 ** (attempts - 1) * 60_000),
              lastError: String(err instanceof Error ? err.message : err).slice(0, 2000),
            },
          });
          if (failed) {
            report.failed += 1;
            this.logger.error(`Email outbox ${row.id} hỏng sau ${attempts} lần: ${String(err)}`);
          }
        }
      }
      return report;
    } finally {
      this.running = false;
    }
  }
}

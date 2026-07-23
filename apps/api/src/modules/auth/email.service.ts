import { Injectable, Logger, type OnModuleDestroy } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import nodemailer, { type Transporter } from 'nodemailer';

/**
 * Gửi email giao dịch.
 *
 * Chưa cấu hình SMTP (dev): in link/nội dung ra log để test được luồng mà không cần mail
 * thật. Có SMTP_* (prod): gửi qua nodemailer. Nhờ vậy luồng quên-mật-khẩu chạy được ngay từ
 * dev, và lên prod chỉ điền env, không sửa code.
 */
@Injectable()
export class EmailService implements OnModuleDestroy {
  private readonly logger = new Logger(EmailService.name);
  private readonly transporter: Transporter | null;
  private readonly from: string;

  constructor(private readonly config: ConfigService) {
    this.from = this.config.getOrThrow<string>('SMTP_FROM');
    const host = this.config.get<string>('SMTP_HOST');

    if (host) {
      this.transporter = nodemailer.createTransport({
        host,
        port: this.config.get<number>('SMTP_PORT') ?? 587,
        auth: {
          user: this.config.getOrThrow<string>('SMTP_USER'),
          pass: this.config.getOrThrow<string>('SMTP_PASS'),
        },
      });
      this.logger.log(`Email qua SMTP ${host}`);
    } else {
      this.transporter = null;
      this.logger.warn('Chưa cấu hình SMTP — email sẽ in ra log thay vì gửi thật (dev).');
    }
  }

  private async send(to: string, subject: string, html: string, textForLog: string): Promise<void> {
    if (!this.transporter) {
      // Dev: in nội dung để test được luồng. KHÔNG log ở prod vì đã có transporter.
      this.logger.warn(`[EMAIL→${to}] ${subject}\n${textForLog}`);
      return;
    }
    await this.transporter.sendMail({ from: this.from, to, subject, html });
  }

  /** Email đặt lại mật khẩu. `resetUrl` đã kèm token (dùng một lần, hết hạn ngắn). */
  async sendPasswordReset(to: string, displayName: string, resetUrl: string): Promise<void> {
    const subject = 'Đặt lại mật khẩu XePrime';
    const html = `
      <div style="font-family:sans-serif;max-width:480px;margin:0 auto;color:#2a2318">
        <h2 style="color:#a9761a">Đặt lại mật khẩu</h2>
        <p>Chào ${escapeHtml(displayName)},</p>
        <p>Bạn (hoặc ai đó) vừa yêu cầu đặt lại mật khẩu cho tài khoản XePrime. Bấm nút dưới để đặt mật khẩu mới. Liên kết hết hạn sau 1 giờ.</p>
        <p style="text-align:center;margin:28px 0">
          <a href="${resetUrl}" style="background:#d6a02c;color:#fff;padding:12px 28px;border-radius:8px;text-decoration:none;font-weight:600">Đặt lại mật khẩu</a>
        </p>
        <p style="color:#6f6450;font-size:13px">Nếu bạn không yêu cầu, hãy bỏ qua email này — mật khẩu của bạn không thay đổi.</p>
      </div>`;
    await this.send(to, subject, html, `Link đặt lại mật khẩu: ${resetUrl}`);
  }

  onModuleDestroy(): void {
    this.transporter?.close();
  }
}

function escapeHtml(s: string): string {
  return s.replace(
    /[&<>"']/g,
    (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c] ?? c,
  );
}

import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';

/** Kênh gửi mã OTP. `phone` đã chuẩn hoá `84xxxxxxxxx`. */
export interface OtpProvider {
  send(phone: string, code: string): Promise<void>;
}

export const OTP_PROVIDER = Symbol('OTP_PROVIDER');

/**
 * Dev: KHÔNG gửi SMS — in mã ra log. Kèm `devCode` trả về ở response (service) để FE/test tự
 * điền. Nhờ vậy luồng verify chạy được ngay từ local mà không tốn tiền/SMS, giống EmailService.
 */
@Injectable()
export class MockOtpProvider implements OtpProvider {
  private readonly logger = new Logger('OtpMock');

  send(phone: string, code: string): Promise<void> {
    this.logger.warn(`[OTP→${phone}] mã xác thực: ${code} (dev mock — không gửi SMS)`);
    return Promise.resolve();
  }
}

/**
 * Gửi thật qua eSMS.vn (đúng provider mà Firebase-code cũ dùng). Cần ESMS_API_KEY /
 * ESMS_SECRET_KEY / ESMS_BRANDNAME — env đã bắt buộc khi OTP_MODE=esms, nên tới đây luôn có.
 */
@Injectable()
export class EsmsOtpProvider implements OtpProvider {
  private readonly logger = new Logger('OtpEsms');
  private readonly endpoint =
    'https://rest.esms.vn/MainService.svc/json/SendMultipleMessage_V4_post_json/';

  constructor(private readonly config: ConfigService) {}

  async send(phone: string, code: string): Promise<void> {
    const body = {
      ApiKey: this.config.getOrThrow<string>('ESMS_API_KEY'),
      SecretKey: this.config.getOrThrow<string>('ESMS_SECRET_KEY'),
      Brandname: this.config.getOrThrow<string>('ESMS_BRANDNAME'),
      Phone: phone,
      // SmsType 2 = brandname (CSKH). Nội dung khớp mẫu đã duyệt của brandname.
      SmsType: '2',
      Content: `${code} la ma xac thuc XePrime cua ban. Ma het han sau 5 phut.`,
    };

    const res = await fetch(this.endpoint, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    });
    const data = (await res.json().catch(() => null)) as { CodeResult?: string } | null;

    // eSMS trả CodeResult "100" khi thành công.
    if (!res.ok || data?.CodeResult !== '100') {
      this.logger.error(`eSMS gửi thất bại: HTTP ${res.status} CodeResult=${data?.CodeResult}`);
      throw new Error('Không gửi được SMS OTP');
    }
  }
}

/** Chọn provider theo OTP_MODE. */
export function otpProviderFactory(config: ConfigService): OtpProvider {
  return config.get<string>('OTP_MODE') === 'esms'
    ? new EsmsOtpProvider(config)
    : new MockOtpProvider();
}

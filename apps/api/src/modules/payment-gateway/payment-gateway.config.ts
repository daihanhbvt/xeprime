import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import {
  PAYMENT_GATEWAY_PROVIDER,
  PAYMENT_GATEWAY_PROVIDER_VALUES,
  PAYMENT_ORDER_TARGET,
  type PaymentGatewayProvider,
  type PaymentOrderTarget,
} from '@xeprime/types';

export interface MomoCredentials {
  readonly partnerCode: string;
  readonly accessKey: string;
  readonly secretKey: string;
  /** Gốc API, không có `/` cuối — env schema đã chuẩn hoá. */
  readonly apiBaseUrl: string;
}

export interface VnpayCredentials {
  readonly tmnCode: string;
  readonly hashSecret: string;
  readonly paymentUrl: string;
  readonly apiUrl: string;
}

/**
 * Cấu hình cổng thanh toán đã ĐỌC XONG — một chỗ trả lời "phương thức nào mở cho luồng nào"
 * (ADR 0058).
 *
 * Hai trục, kiểm nối tiếp: cổng có đủ bộ khoá chưa, và luồng (hoá đơn gói / tiền giữ chỗ) có được
 * phép dùng cổng chưa. Thiếu một trong hai ⇒ phương thức không tồn tại với luồng đó — không có
 * trạng thái "hiện nút nhưng bấm thì lỗi".
 *
 * Env schema đã canh nhóm bốn-biến-hoặc-không, nên ở đây chỉ cần dò đủ bộ.
 */
@Injectable()
export class PaymentGatewayConfig {
  readonly sandbox: boolean;
  readonly momo: MomoCredentials | null;
  readonly vnpay: VnpayCredentials | null;
  /** Gốc công khai của API — đích IPN của MoMo dựng từ đây (cùng nguồn với redirect_uri OAuth). */
  readonly apiPublicUrl: string;
  private readonly targets: Readonly<Record<PaymentOrderTarget, boolean>>;

  constructor(config: ConfigService) {
    this.sandbox = config.get<string>('PAYMENT_GATEWAY_MODE') !== 'live';
    this.apiPublicUrl = config.getOrThrow<string>('API_PUBLIC_URL').replace(/\/+$/, '');
    this.targets = {
      [PAYMENT_ORDER_TARGET.SUBSCRIPTION_INVOICE]:
        config.get<string>('PAYMENT_GATEWAY_SUBSCRIPTION') === 'on',
      [PAYMENT_ORDER_TARGET.BOOKING_HOLD]: config.get<string>('PAYMENT_GATEWAY_BOOKING_HOLD') === 'on',
    };

    const partnerCode = config.get<string>('MOMO_PARTNER_CODE');
    const accessKey = config.get<string>('MOMO_ACCESS_KEY');
    const secretKey = config.get<string>('MOMO_SECRET_KEY');
    const momoBase = config.get<string>('MOMO_API_BASE_URL');
    this.momo =
      partnerCode && accessKey && secretKey && momoBase
        ? { partnerCode, accessKey, secretKey, apiBaseUrl: momoBase.replace(/\/+$/, '') }
        : null;

    const tmnCode = config.get<string>('VNPAY_TMN_CODE');
    const hashSecret = config.get<string>('VNPAY_HASH_SECRET');
    const paymentUrl = config.get<string>('VNPAY_PAYMENT_URL');
    const apiUrl = config.get<string>('VNPAY_API_URL');
    this.vnpay =
      tmnCode && hashSecret && paymentUrl && apiUrl
        ? { tmnCode, hashSecret, paymentUrl, apiUrl }
        : null;
  }

  /** Cổng có đủ bộ khoá chưa — điều kiện để IPN của nó được xử lý. */
  isConfigured(provider: PaymentGatewayProvider): boolean {
    return provider === PAYMENT_GATEWAY_PROVIDER.MOMO ? this.momo !== null : this.vnpay !== null;
  }

  /** Có ít nhất một cổng đủ khoá — điều kiện để bộ quét định kỳ chạy. */
  get anyConfigured(): boolean {
    return this.momo !== null || this.vnpay !== null;
  }

  /** Luồng này có được phép dùng cổng không (công tắc env). */
  isTargetEnabled(target: PaymentOrderTarget): boolean {
    return this.targets[target];
  }

  /** Phương thức mở cho một luồng = luồng bật VÀ cổng có cấu hình. Thứ tự cố định để UI ổn định. */
  providersFor(target: PaymentOrderTarget): PaymentGatewayProvider[] {
    if (!this.isTargetEnabled(target)) return [];
    return PAYMENT_GATEWAY_PROVIDER_VALUES.filter((provider) => this.isConfigured(provider));
  }

  isAvailable(provider: PaymentGatewayProvider, target: PaymentOrderTarget): boolean {
    return this.providersFor(target).includes(provider);
  }
}

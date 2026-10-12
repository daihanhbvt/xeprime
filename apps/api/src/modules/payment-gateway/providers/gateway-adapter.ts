import { timingSafeEqual } from 'node:crypto';
import type { Prisma } from '@xeprime/prisma';
import type { PaymentGatewayProvider } from '@xeprime/types';

/**
 * Hợp đồng giữa phần ĐIỀU PHỐI nghiệp vụ (`PaymentGatewayService`) và từng cổng.
 *
 * Adapter chỉ biết giao thức của cổng — ký, gọi, đọc, xác minh. Nó KHÔNG biết hoá đơn hay khoản giữ
 * chỗ là gì, không chạm database, và không bao giờ quyết định "đã thanh toán": nó chỉ kể lại điều
 * cổng nói, sau khi đã xác minh rằng chính cổng nói điều đó.
 */

/** Kết cục của MỘT giao dịch theo lời cổng, đã chuẩn hoá về một bộ chung. */
export type ProviderOutcome =
  /** Cổng xác nhận đã thu đủ. */
  | 'succeeded'
  /** Cổng chưa có kết luận (đang chờ khách, đang xử lý) — không đổi gì. */
  | 'pending'
  | 'failed'
  | 'cancelled'
  | 'expired'
  /** Cổng báo đã trừ tiền nhưng giao dịch bị nghi ngờ — không áp, chờ người xử lý. */
  | 'flagged'
  /**
   * Truy vấn ĐÃ XÁC MINH nói cổng không có giao dịch nào cho đơn này (VNPAY `91`). Chỉ thành "hết hạn"
   * khi phiên đã quá hạn đủ lâu — trước đó khách có thể vẫn đang trên trang của cổng.
   */
  | 'not_found';

/** Một kết quả của cổng đã XÁC MINH (chữ ký IPN, hoặc phản hồi truy vấn qua HTTPS của chính mình). */
export interface ProviderPaymentResult {
  /** Mã đơn mình đã gửi sang (MoMo `orderId` · VNPAY `vnp_TxnRef`). */
  readonly orderRef: string;
  /** Số tiền cổng báo, VND nguyên. `null` khi cổng không báo (truy vấn chưa có giao dịch). */
  readonly amount: Prisma.Decimal | null;
  readonly outcome: ProviderOutcome;
  /** Mã giao dịch phía cổng — chỉ dùng khi `succeeded`. */
  readonly providerTxId: string | null;
  readonly resultCode: string;
  readonly message: string | null;
  readonly payMethod: string | null;
  readonly paidAt: Date | null;
  /** Payload đã bỏ chữ ký — lưu làm bằng chứng, không ghi log. */
  readonly raw: Record<string, unknown>;
}

export interface CreatePaymentInput {
  /** Mã đơn gửi sang cổng — unique theo cổng. */
  readonly orderRef: string;
  /** VND nguyên, > 0 — đã kiểm ở tầng điều phối. */
  readonly amount: number;
  /** Mô tả không dấu, không ký tự đặc biệt (yêu cầu của VNPAY; MoMo nhận được cùng chuỗi). */
  readonly orderInfo: string;
  readonly returnUrl: string;
  readonly createdAt: Date;
  readonly expiresAt: Date;
  /** IP của người mua — VNPAY bắt buộc. */
  readonly clientIp: string;
  readonly locale: 'vi' | 'en';
}

export interface CreatePaymentResult {
  readonly checkoutUrl: string;
  /** Phản hồi của cổng, đã bỏ chữ ký. `null` khi cổng không có bước gọi API (VNPAY). */
  readonly raw: Record<string, unknown> | null;
}

export interface QueryPaymentInput {
  readonly orderRef: string;
  /** Mốc đã dùng làm `vnp_CreateDate` lúc tạo — VNPAY tra giao dịch theo nó. */
  readonly createdAt: Date;
  readonly orderInfo: string;
}

export type VerifyCallbackResult =
  | { readonly ok: true; readonly result: ProviderPaymentResult }
  | { readonly ok: false; readonly reason: 'malformed' | 'signature' | 'merchant' };

export interface PaymentGatewayAdapter {
  readonly provider: PaymentGatewayProvider;
  /**
   * Mở phiên thanh toán. Ném `PaymentProviderError` khi cổng không trả được liên kết — chưa có đồng
   * nào bị trừ trong trường hợp đó.
   */
  createPayment(input: CreatePaymentInput): Promise<CreatePaymentResult>;
  /** Xác minh một IPN: chữ ký, merchant, định dạng. Không ném — dữ liệu ngoài là dữ liệu ngoài. */
  verifyCallback(payload: unknown): VerifyCallbackResult;
  /**
   * Hỏi cổng trạng thái của một đơn. `null` khi cổng không trả lời được hoặc phản hồi không xác minh
   * được — người gọi coi như CHƯA BIẾT, không bao giờ coi như thất bại.
   */
  queryPayment(input: QueryPaymentInput): Promise<ProviderPaymentResult | null>;
}

/** Cổng không mở được phiên — mạng, timeout, hoặc cổng từ chối. Không mang bí mật nào. */
export class PaymentProviderError extends Error {
  constructor(
    readonly provider: PaymentGatewayProvider,
    readonly reason: string,
  ) {
    super(`${provider}: ${reason}`);
    this.name = 'PaymentProviderError';
  }
}

/** Bỏ mọi trường chữ ký trước khi lưu — chữ ký không phải bằng chứng, và không có lý do để cất nó. */
export function stripSignatures(raw: Record<string, unknown>): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(raw)) {
    if (key === 'signature' || key === 'vnp_SecureHash' || key === 'vnp_SecureHashType') continue;
    out[key] = value;
  }
  return out;
}

/**
 * IP gửi sang cổng. VNPAY đòi 7–45 ký tự: IPv4 trong IPv6 (`::ffff:1.2.3.4`) được gỡ tiền tố,
 * loopback IPv6 về `127.0.0.1`, thiếu thì `127.0.0.1` — một IP rỗng làm hỏng cả phiên.
 */
export function normalizeClientIp(ip: string | null | undefined): string {
  const value = (ip ?? '').trim().replace(/^::ffff:/i, '');
  if (!value || value === '::1') return '127.0.0.1';
  return value.length > 45 ? value.slice(0, 45) : value;
}

/** Hai chữ ký hex so bằng thời gian hằng — sai độ dài là sai, không ném. */
export function hexDigestEquals(expected: string, presented: string): boolean {
  const a = Buffer.from(expected.toLowerCase(), 'utf8');
  const b = Buffer.from(presented.trim().toLowerCase(), 'utf8');
  if (a.length !== b.length) return false;
  return timingSafeEqual(a, b);
}

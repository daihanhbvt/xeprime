import { Injectable } from '@nestjs/common';
import { newId, Prisma } from '@xeprime/prisma';
import { PAYMENT_GATEWAY_PROVIDER } from '@xeprime/types';
import { PaymentGatewayConfig, type VnpayCredentials } from '../payment-gateway.config';
import {
  hexDigestEquals,
  PaymentProviderError,
  stripSignatures,
  type CreatePaymentInput,
  type CreatePaymentResult,
  type PaymentGatewayAdapter,
  type ProviderPaymentResult,
  type QueryPaymentInput,
  type VerifyCallbackResult,
} from './gateway-adapter';
import { fieldText, isRecord, postProviderJson } from './http';
import {
  formatVnpayDate,
  parseVnpayDate,
  VNPAY_CODE_SUCCESS,
  VNPAY_COMMAND,
  VNPAY_CURRENCY,
  VNPAY_ORDER_TYPE,
  VNPAY_QUERY_NOT_FOUND,
  VNPAY_QUERY_SERVER_IP,
  VNPAY_TRANSACTION_TYPE_PAYMENT,
  VNPAY_VERSION,
  vnpayAmountToVnd,
  vnpayHmac,
  vnpayPaymentOutcome,
  vnpayQueryOutcome,
  vnpayQueryRequestHashData,
  vnpayQueryResponseHashData,
  vnpaySignData,
} from './vnpay.protocol';

/** Đường IPN công khai của VNPAY — khai ở portal merchant (VNPAY gọi GET). */
export const VNPAY_IPN_PATH = '/payment-gateway/vnpay/ipn';

/**
 * Cổng VNPAY 2.1.0 — trang thanh toán của VNPAY (khách tự chọn QR, thẻ nội địa, thẻ quốc tế…).
 *
 * Khác MoMo ở hai điểm định hình code này:
 *  - Tạo phiên KHÔNG gọi API: liên kết là URL đã ký, dựng tại chỗ.
 *  - IPN URL khai MỘT LẦN ở portal merchant, không gửi theo request.
 *
 * `vnp_ExpireDate` = hạn của phiên do tầng điều phối tính — với tiền giữ chỗ nó kết thúc TRƯỚC hạn
 * giữ chỗ, nên VNPAY tự từ chối một lượt trả sau khi chỗ đã nhả.
 */
@Injectable()
export class VnpayAdapter implements PaymentGatewayAdapter {
  readonly provider = PAYMENT_GATEWAY_PROVIDER.VNPAY;

  constructor(private readonly config: PaymentGatewayConfig) {}

  private credentials(): VnpayCredentials {
    if (!this.config.vnpay) throw new PaymentProviderError(this.provider, 'not_configured');
    return this.config.vnpay;
  }

  async createPayment(input: CreatePaymentInput): Promise<CreatePaymentResult> {
    const c = this.credentials();
    const params: Record<string, string> = {
      vnp_Version: VNPAY_VERSION,
      vnp_Command: VNPAY_COMMAND.PAY,
      vnp_TmnCode: c.tmnCode,
      // VND × 100, chữ số — tài liệu: "1000000" cho 10.000đ.
      vnp_Amount: String(input.amount * 100),
      vnp_CreateDate: formatVnpayDate(input.createdAt),
      vnp_CurrCode: VNPAY_CURRENCY,
      vnp_IpAddr: input.clientIp,
      vnp_Locale: input.locale === 'en' ? 'en' : 'vn',
      vnp_OrderInfo: input.orderInfo,
      vnp_OrderType: VNPAY_ORDER_TYPE,
      vnp_ReturnUrl: input.returnUrl,
      vnp_ExpireDate: formatVnpayDate(input.expiresAt),
      vnp_TxnRef: input.orderRef,
    };
    const signData = vnpaySignData(params);
    const secureHash = vnpayHmac(signData, c.hashSecret);
    return { checkoutUrl: `${c.paymentUrl}?${signData}&vnp_SecureHash=${secureHash}`, raw: null };
  }

  verifyCallback(payload: unknown): VerifyCallbackResult {
    if (!isRecord(payload)) return { ok: false, reason: 'malformed' };
    const c = this.config.vnpay;
    if (!c) return { ok: false, reason: 'merchant' };

    // Chỉ tham số `vnp_*` dạng chuỗi tham gia chữ ký. Tham số lặp (mảng) là request dị dạng.
    const params: Record<string, string> = {};
    for (const [key, value] of Object.entries(payload)) {
      if (!key.startsWith('vnp_')) continue;
      if (typeof value !== 'string') return { ok: false, reason: 'malformed' };
      if (key === 'vnp_SecureHash' || key === 'vnp_SecureHashType') continue;
      params[key] = value;
    }
    const presented = typeof payload['vnp_SecureHash'] === 'string' ? payload['vnp_SecureHash'] : '';
    const txnRef = params['vnp_TxnRef'];
    const amountMinor = params['vnp_Amount'];
    if (!presented || !txnRef || !amountMinor) {
      return { ok: false, reason: 'malformed' };
    }

    // Hai biến thể chữ ký của hai mẫu chính thức — xem `vnpaySignData`.
    const valid =
      hexDigestEquals(vnpayHmac(vnpaySignData(params, true), c.hashSecret), presented) ||
      hexDigestEquals(vnpayHmac(vnpaySignData(params, false), c.hashSecret), presented);
    if (!valid) return { ok: false, reason: 'signature' };
    if (params['vnp_TmnCode'] !== c.tmnCode) return { ok: false, reason: 'merchant' };

    const amount = vnpayAmountToVnd(amountMinor);
    if (amount === null) return { ok: false, reason: 'malformed' };

    const responseCode = params['vnp_ResponseCode'] ?? '';
    const transactionStatus = params['vnp_TransactionStatus'] ?? '';
    const outcome = vnpayPaymentOutcome(responseCode, transactionStatus);
    const transactionNo = params['vnp_TransactionNo'] ?? '';
    return {
      ok: true,
      result: {
        orderRef: txnRef,
        amount: new Prisma.Decimal(amount),
        outcome,
        providerTxId: transactionNo && transactionNo !== '0' ? transactionNo : null,
        resultCode: `${responseCode}/${transactionStatus}`,
        message: null,
        payMethod: (params['vnp_CardType'] || params['vnp_BankCode'] || '').slice(0, 50) || null,
        paidAt: outcome === 'succeeded' ? parseVnpayDate(params['vnp_PayDate'] ?? '') : null,
        raw: stripSignatures(payload),
      },
    };
  }

  async queryPayment(input: QueryPaymentInput): Promise<ProviderPaymentResult | null> {
    const c = this.credentials();
    const requestId = newId();
    const createDate = formatVnpayDate(new Date());
    const transactionDate = formatVnpayDate(input.createdAt);
    const secureHash = vnpayHmac(
      vnpayQueryRequestHashData({
        requestId,
        version: VNPAY_VERSION,
        command: VNPAY_COMMAND.QUERY,
        tmnCode: c.tmnCode,
        txnRef: input.orderRef,
        transactionDate,
        createDate,
        ipAddr: VNPAY_QUERY_SERVER_IP,
        orderInfo: input.orderInfo,
      }),
      c.hashSecret,
    );

    let response: Record<string, unknown>;
    try {
      response = await postProviderJson(this.provider, c.apiUrl, {
        vnp_RequestId: requestId,
        vnp_Version: VNPAY_VERSION,
        vnp_Command: VNPAY_COMMAND.QUERY,
        vnp_TmnCode: c.tmnCode,
        vnp_TxnRef: input.orderRef,
        vnp_OrderInfo: input.orderInfo,
        vnp_TransactionDate: transactionDate,
        vnp_CreateDate: createDate,
        vnp_IpAddr: VNPAY_QUERY_SERVER_IP,
        vnp_SecureHash: secureHash,
      });
    } catch {
      return null;
    }

    const text: Record<string, string> = {};
    for (const key of Object.keys(response)) text[key] = fieldText(response, key);
    const presented = text['vnp_SecureHash'] ?? '';
    // Phản hồi `querydr` CÓ chữ ký — không khớp thì coi như chưa biết, không dùng một chữ nào của nó.
    if (!presented || !hexDigestEquals(vnpayHmac(vnpayQueryResponseHashData(text), c.hashSecret), presented)) {
      return null;
    }
    if (text['vnp_TmnCode'] !== c.tmnCode || text['vnp_TxnRef'] !== input.orderRef) return null;
    if (text['vnp_ResponseCode'] === VNPAY_QUERY_NOT_FOUND) {
      // Cổng ký xác nhận KHÔNG có giao dịch nào — tầng điều phối quyết khi nào điều đó nghĩa là hết hạn.
      return {
        orderRef: input.orderRef,
        amount: null,
        outcome: 'not_found',
        providerTxId: null,
        resultCode: VNPAY_QUERY_NOT_FOUND,
        message: (text['vnp_Message'] ?? '').slice(0, 255) || null,
        payMethod: null,
        paidAt: null,
        raw: stripSignatures(response),
      };
    }
    if (
      text['vnp_ResponseCode'] !== VNPAY_CODE_SUCCESS ||
      text['vnp_TransactionType'] !== VNPAY_TRANSACTION_TYPE_PAYMENT
    ) {
      // `94` (truy vấn trùng), lỗi khác, hoặc một giao dịch hoàn — chưa biết, không kết luận gì.
      return null;
    }

    const amount = vnpayAmountToVnd(text['vnp_Amount'] ?? '');
    const outcome = vnpayQueryOutcome(text['vnp_TransactionStatus'] ?? '');
    const transactionNo = text['vnp_TransactionNo'] ?? '';
    return {
      orderRef: input.orderRef,
      amount: amount === null ? null : new Prisma.Decimal(amount),
      outcome,
      providerTxId: transactionNo && transactionNo !== '0' ? transactionNo : null,
      resultCode: `${text['vnp_ResponseCode']}/${text['vnp_TransactionStatus'] ?? ''}`,
      message: (text['vnp_Message'] ?? '').slice(0, 255) || null,
      payMethod: (text['vnp_BankCode'] ?? '').slice(0, 50) || null,
      paidAt: outcome === 'succeeded' ? parseVnpayDate(text['vnp_PayDate'] ?? '') : null,
      raw: stripSignatures(response),
    };
  }
}

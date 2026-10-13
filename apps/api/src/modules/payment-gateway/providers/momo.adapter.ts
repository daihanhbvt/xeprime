import { Injectable } from '@nestjs/common';
import { newId, Prisma } from '@xeprime/prisma';
import { PAYMENT_GATEWAY_PROVIDER, PAYMENT_GATEWAY_QUERY_MIN_INTERVAL_SECONDS } from '@xeprime/types';
import { PaymentGatewayConfig, type MomoCredentials } from '../payment-gateway.config';
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
  MOMO_PATH,
  MOMO_REQUEST_TYPE,
  MOMO_RESULT_SUCCESS,
  momoCreateRawSignature,
  momoIpnRawSignature,
  momoOutcome,
  momoQueryRawSignature,
  momoSign,
} from './momo.protocol';

/** Đường IPN công khai của MoMo — khớp `PaymentGatewayCallbackController`. */
export const MOMO_IPN_PATH = '/payment-gateway/momo/ipn';

/**
 * Cổng MoMo — ví MoMo một lần (`captureWallet`).
 *
 * IPN URL đi kèm TỪNG request (`ipnUrl`), dựng từ `API_PUBLIC_URL` — không khai ở portal.
 * `extraData` để trống: mọi thứ cần để tra lại đơn đã nằm ở DB, và một trường tự do đi vòng qua
 * cổng là một chỗ để ai đó nhét dữ liệu mình lỡ tin.
 */
@Injectable()
export class MomoAdapter implements PaymentGatewayAdapter {
  readonly provider = PAYMENT_GATEWAY_PROVIDER.MOMO;
  readonly queryMinIntervalMs = PAYMENT_GATEWAY_QUERY_MIN_INTERVAL_SECONDS * 1000;

  constructor(private readonly config: PaymentGatewayConfig) {}

  private credentials(): MomoCredentials {
    if (!this.config.momo) throw new PaymentProviderError(this.provider, 'not_configured');
    return this.config.momo;
  }

  private get ipnUrl(): string {
    return `${this.config.apiPublicUrl}${MOMO_IPN_PATH}`;
  }

  async createPayment(input: CreatePaymentInput): Promise<CreatePaymentResult> {
    const c = this.credentials();
    const requestId = newId();
    const amount = String(input.amount);
    const signature = momoSign(
      momoCreateRawSignature({
        accessKey: c.accessKey,
        amount,
        extraData: '',
        ipnUrl: this.ipnUrl,
        orderId: input.orderRef,
        orderInfo: input.orderInfo,
        partnerCode: c.partnerCode,
        redirectUrl: input.returnUrl,
        requestId,
        requestType: MOMO_REQUEST_TYPE,
      }),
      c.secretKey,
    );

    const response = await postProviderJson(this.provider, `${c.apiBaseUrl}${MOMO_PATH.CREATE}`, {
      partnerCode: c.partnerCode,
      requestType: MOMO_REQUEST_TYPE,
      ipnUrl: this.ipnUrl,
      redirectUrl: input.returnUrl,
      orderId: input.orderRef,
      amount: input.amount,
      orderInfo: input.orderInfo,
      requestId,
      extraData: '',
      lang: input.locale,
      signature,
    });

    const resultCode = Number(response['resultCode']);
    const payUrl = response['payUrl'];
    if (resultCode !== MOMO_RESULT_SUCCESS) {
      throw new PaymentProviderError(this.provider, `result_${fieldText(response, 'resultCode')}`);
    }
    // Liên kết sẽ được trình duyệt mở thẳng — chỉ nhận https, và phải đúng đơn mình vừa gửi.
    if (typeof payUrl !== 'string' || !payUrl.startsWith('https://')) {
      throw new PaymentProviderError(this.provider, 'missing_pay_url');
    }
    if (fieldText(response, 'orderId') !== input.orderRef) {
      throw new PaymentProviderError(this.provider, 'order_mismatch');
    }
    return { checkoutUrl: payUrl, raw: stripSignatures(response) };
  }

  verifyCallback(payload: unknown): VerifyCallbackResult {
    if (!isRecord(payload)) return { ok: false, reason: 'malformed' };
    const c = this.config.momo;
    if (!c) return { ok: false, reason: 'merchant' };

    const signature = fieldText(payload, 'signature');
    const orderId = fieldText(payload, 'orderId');
    const amountText = fieldText(payload, 'amount');
    const resultCodeText = fieldText(payload, 'resultCode');
    if (!signature || !orderId || !/^\d{1,15}$/.test(amountText) || !/^-?\d+$/.test(resultCodeText)) {
      return { ok: false, reason: 'malformed' };
    }

    const expected = momoSign(
      momoIpnRawSignature({
        accessKey: c.accessKey,
        amount: amountText,
        extraData: fieldText(payload, 'extraData'),
        message: fieldText(payload, 'message'),
        orderId,
        orderInfo: fieldText(payload, 'orderInfo'),
        orderType: fieldText(payload, 'orderType'),
        partnerCode: fieldText(payload, 'partnerCode'),
        payType: fieldText(payload, 'payType'),
        requestId: fieldText(payload, 'requestId'),
        responseTime: fieldText(payload, 'responseTime'),
        resultCode: resultCodeText,
        transId: fieldText(payload, 'transId'),
      }),
      c.secretKey,
    );
    if (!hexDigestEquals(expected, signature)) return { ok: false, reason: 'signature' };
    // Chữ ký đúng mà sai merchant chỉ xảy ra khi hai merchant dùng chung khoá — vẫn từ chối.
    if (fieldText(payload, 'partnerCode') !== c.partnerCode) return { ok: false, reason: 'merchant' };

    return { ok: true, result: this.toResult(payload, 'ipn') };
  }

  async queryPayment(input: QueryPaymentInput): Promise<ProviderPaymentResult | null> {
    const c = this.credentials();
    const requestId = newId();
    const signature = momoSign(
      momoQueryRawSignature({
        accessKey: c.accessKey,
        orderId: input.orderRef,
        partnerCode: c.partnerCode,
        requestId,
      }),
      c.secretKey,
    );
    let response: Record<string, unknown>;
    try {
      response = await postProviderJson(this.provider, `${c.apiBaseUrl}${MOMO_PATH.QUERY}`, {
        partnerCode: c.partnerCode,
        requestId,
        orderId: input.orderRef,
        lang: 'vi',
        signature,
      });
    } catch {
      return null;
    }
    /*
     * Phản hồi truy vấn KHÔNG mang chữ ký (tài liệu Check Transaction Status). Độ tin cậy đến từ
     * việc chính mình gọi tới `MOMO_API_BASE_URL` qua HTTPS; ngoài ra soát lại đúng merchant, đúng
     * đơn — một phản hồi kể về đơn khác là phản hồi mình không dùng.
     */
    if (
      fieldText(response, 'partnerCode') !== c.partnerCode ||
      fieldText(response, 'orderId') !== input.orderRef ||
      !/^-?\d+$/.test(fieldText(response, 'resultCode'))
    ) {
      return null;
    }
    return this.toResult(response, 'query');
  }

  private toResult(raw: Record<string, unknown>, source: 'ipn' | 'query'): ProviderPaymentResult {
    const resultCode = Number(fieldText(raw, 'resultCode'));
    const amountText = fieldText(raw, 'amount');
    const responseTime = Number(fieldText(raw, 'responseTime'));
    const transId = fieldText(raw, 'transId');
    const outcome = momoOutcome(resultCode, source);
    return {
      orderRef: fieldText(raw, 'orderId'),
      amount: /^\d{1,15}$/.test(amountText) ? new Prisma.Decimal(amountText) : null,
      outcome,
      providerTxId: transId && transId !== '0' ? transId : null,
      resultCode: String(resultCode),
      message: fieldText(raw, 'message').slice(0, 255) || null,
      payMethod: fieldText(raw, 'payType').slice(0, 50) || null,
      // `responseTime` là mili-giây epoch theo tài liệu; chỉ coi là mốc trả tiền khi đã thành công.
      paidAt:
        outcome === 'succeeded' && Number.isFinite(responseTime) && responseTime > 0
          ? new Date(responseTime)
          : null,
      raw: stripSignatures(raw),
    };
  }
}

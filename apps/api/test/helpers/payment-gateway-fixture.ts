import { randomInt } from 'node:crypto';
import type { ConfigService } from '@nestjs/config';
import { newId, Prisma } from '@xeprime/prisma';
import { AuditService } from '../../src/modules/audit/audit.service';
import { RequestRealmService } from '../../src/modules/auth/request-realm.service';
import { PaymentGatewayConfig } from '../../src/modules/payment-gateway/payment-gateway.config';
import { PaymentGatewayService } from '../../src/modules/payment-gateway/payment-gateway.service';
import type {
  CreatePaymentInput,
  CreatePaymentResult,
  ProviderPaymentResult,
  QueryPaymentInput,
} from '../../src/modules/payment-gateway/providers/gateway-adapter';
import { MomoAdapter } from '../../src/modules/payment-gateway/providers/momo.adapter';
import {
  momoIpnRawSignature,
  momoSign,
} from '../../src/modules/payment-gateway/providers/momo.protocol';
import { VnpayAdapter } from '../../src/modules/payment-gateway/providers/vnpay.adapter';
import { vnpayHmac, vnpaySignData } from '../../src/modules/payment-gateway/providers/vnpay.protocol';
import type { PrismaService } from '../../src/prisma/prisma.service';
import { makeBillingService, makeBookingHoldsService } from './service-factory';

/**
 * Bộ dựng dùng chung cho các spec cổng MoMo · VNPAY (ADR 0058) — khoá THỬ, domain giả, adapter chỉ
 * thay đúng hai chỗ chạm mạng. Xác minh IPN luôn là của adapter thật.
 */
export const SPEC_MOMO = {
  partnerCode: 'MOMOSPEC',
  accessKey: 'ACCESSKEYSPEC',
  secretKey: 'momo-secret-key-for-spec-only',
};
export const SPEC_VNPAY = { tmnCode: 'SPECTMN1', hashSecret: 'vnpay-secret-key-for-spec-only' };

export const SPEC_WEB = {
  customer: 'https://xeprime.spec.test',
  partner: 'https://partner.spec.test',
};

export const gatewayEnv: Record<string, string | boolean> = {
  API_PUBLIC_URL: 'https://api.spec.test',
  APP_WEB_URL: SPEC_WEB.customer,
  WEB_PARTNER_URL: SPEC_WEB.partner,
  WEB_ADMIN_URL: 'https://admin.spec.test',
  REALM_HEADER_FROM_CLIENT: false,
  PAYMENT_GATEWAY_MODE: 'sandbox',
  PAYMENT_GATEWAY_SUBSCRIPTION: 'on',
  PAYMENT_GATEWAY_BOOKING_HOLD: 'on',
  MOMO_PARTNER_CODE: SPEC_MOMO.partnerCode,
  MOMO_ACCESS_KEY: SPEC_MOMO.accessKey,
  MOMO_SECRET_KEY: SPEC_MOMO.secretKey,
  MOMO_API_BASE_URL: 'https://momo.spec.test',
  VNPAY_TMN_CODE: SPEC_VNPAY.tmnCode,
  VNPAY_HASH_SECRET: SPEC_VNPAY.hashSecret,
  VNPAY_PAYMENT_URL: 'https://vnpay.spec.test/paymentv2/vpcpay.html',
  VNPAY_API_URL: 'https://vnpay.spec.test/merchant_webapi/api/transaction',
};

export function specConfigService(values: Record<string, string | boolean>): ConfigService {
  return {
    get: (key: string) => values[key],
    getOrThrow: (key: string) => {
      const value = values[key];
      if (value === undefined) throw new Error(`missing ${key}`);
      return value;
    },
  } as unknown as ConfigService;
}

/** MoMo không gọi mạng: mở phiên trả URL giả, truy vấn trả đúng thứ test đặt. */
export class FakeMomo extends MomoAdapter {
  created: CreatePaymentInput[] = [];
  queryResult: ProviderPaymentResult | null = null;

  override async createPayment(input: CreatePaymentInput): Promise<CreatePaymentResult> {
    this.created.push(input);
    return {
      checkoutUrl: `https://momo.spec.test/pay/${input.orderRef}`,
      raw: { resultCode: 0, orderId: input.orderRef },
    };
  }

  override async queryPayment(_input: QueryPaymentInput): Promise<ProviderPaymentResult | null> {
    return this.queryResult;
  }
}

/** VNPAY mở phiên không gọi mạng (URL ký sẵn) — chỉ truy vấn phải thay. */
export class FakeVnpay extends VnpayAdapter {
  override async queryPayment(_input: QueryPaymentInput): Promise<ProviderPaymentResult | null> {
    return null;
  }
}

export function buildGateway(prisma: PrismaService, values: Record<string, string | boolean>) {
  const cfg = specConfigService(values);
  const config = new PaymentGatewayConfig(cfg);
  const momo = new FakeMomo(config);
  const billing = makeBillingService(prisma);
  const holds = makeBookingHoldsService(prisma);
  const service = new PaymentGatewayService(
    prisma,
    config,
    billing,
    holds,
    new RequestRealmService(cfg),
    new AuditService(prisma),
    momo,
    new FakeVnpay(config),
  );
  return { service, momo, config, billing, holds };
}

/**
 * Mã giao dịch của cổng — duy nhất xuyên các worker Jest (unique `(provider, provider_tx_id)` toàn
 * bảng): mỗi module lấy một gốc ngẫu nhiên, rồi tăng dần. Hai spec chạy song song cùng mili-giây
 * không còn sinh trùng mã và nhận nhầm `duplicate_provider_tx`.
 */
let transIdSeq = randomInt(1, 2 ** 40);
export function nextTransId(): number {
  transIdSeq += 1;
  return 1_000_000_000_000 + transIdSeq;
}

/** IPN MoMo ký bằng khoá thử — y như MoMo gửi. */
export function momoIpn(
  orderId: string,
  amount: number,
  over: Record<string, unknown> = {},
): Record<string, unknown> {
  const body: Record<string, unknown> = {
    partnerCode: SPEC_MOMO.partnerCode,
    orderId,
    requestId: newId(),
    amount,
    orderInfo: 'Thanh toan XePrime',
    orderType: 'momo_wallet',
    transId: nextTransId(),
    resultCode: 0,
    message: 'Successful.',
    payType: 'qr',
    responseTime: Date.now(),
    extraData: '',
    ...over,
  };
  const text = (key: string) => String(body[key] ?? '');
  body.signature = momoSign(
    momoIpnRawSignature({
      accessKey: SPEC_MOMO.accessKey,
      amount: text('amount'),
      extraData: text('extraData'),
      message: text('message'),
      orderId: text('orderId'),
      orderInfo: text('orderInfo'),
      orderType: text('orderType'),
      partnerCode: text('partnerCode'),
      payType: text('payType'),
      requestId: text('requestId'),
      responseTime: text('responseTime'),
      resultCode: text('resultCode'),
      transId: text('transId'),
    }),
    SPEC_MOMO.secretKey,
  );
  return body;
}

/** IPN VNPAY (query string đã parse) ký bằng khoá thử. `amount` là VND — VNPAY gửi ×100. */
export function vnpayIpn(
  orderId: string,
  amount: number,
  over: Record<string, string> = {},
): Record<string, string> {
  const params: Record<string, string> = {
    vnp_Amount: String(amount * 100),
    vnp_BankCode: 'NCB',
    vnp_CardType: 'ATM',
    vnp_OrderInfo: 'Thanh toan XePrime',
    vnp_PayDate: '20261009100500',
    vnp_ResponseCode: '00',
    vnp_TmnCode: SPEC_VNPAY.tmnCode,
    vnp_TransactionNo: String(nextTransId()),
    vnp_TransactionStatus: '00',
    vnp_TxnRef: orderId,
    ...over,
  };
  return { ...params, vnp_SecureHash: vnpayHmac(vnpaySignData(params), SPEC_VNPAY.hashSecret) };
}

/** Kết quả truy vấn "đã thu đủ" như adapter trả sau khi xác minh. */
/** Cổng KÝ XÁC NHẬN không có giao dịch nào cho đơn (VNPAY `91`) — khách huỷ ở cổng / chưa trả. */
export function notFoundQueryResult(orderRef: string): ProviderPaymentResult {
  return {
    orderRef,
    amount: null,
    outcome: 'not_found',
    providerTxId: null,
    resultCode: '91',
    message: 'Transaction not found',
    payMethod: null,
    paidAt: null,
    raw: { vnp_ResponseCode: '91' },
  };
}

export function paidQueryResult(orderRef: string, amount: number): ProviderPaymentResult {
  return {
    orderRef,
    amount: new Prisma.Decimal(amount),
    outcome: 'succeeded',
    providerTxId: String(nextTransId()),
    resultCode: '0',
    message: 'Successful.',
    payMethod: 'qr',
    paidAt: new Date(),
    raw: { resultCode: 0 },
  };
}

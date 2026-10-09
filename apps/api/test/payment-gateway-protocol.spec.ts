import { ConfigService } from '@nestjs/config';
import { createHmac } from 'node:crypto';
import { PaymentGatewayConfig } from '../src/modules/payment-gateway/payment-gateway.config';
import { normalizeClientIp } from '../src/modules/payment-gateway/providers/gateway-adapter';
import { MomoAdapter } from '../src/modules/payment-gateway/providers/momo.adapter';
import {
  momoCreateRawSignature,
  momoIpnRawSignature,
  momoOutcome,
  momoQueryRawSignature,
  momoSign,
} from '../src/modules/payment-gateway/providers/momo.protocol';
import { VnpayAdapter } from '../src/modules/payment-gateway/providers/vnpay.adapter';
import {
  formatVnpayDate,
  parseVnpayDate,
  vnpayAmountToVnd,
  vnpayHmac,
  vnpayPaymentOutcome,
  vnpayQueryOutcome,
  vnpayQueryRequestHashData,
  vnpayQueryResponseHashData,
  vnpaySignData,
} from '../src/modules/payment-gateway/providers/vnpay.protocol';

/**
 * Giao thức của hai cổng — phần THUẦN, không cần database, không gọi mạng (ADR 0058).
 *
 * Điều được khoá ở đây là điều mà sai thì cổng từ chối MỌI giao dịch, hoặc tệ hơn, server nhận một
 * kết quả không do cổng ký:
 *  1. chuỗi ký đúng THỨ TỰ tài liệu, không URL-encode (MoMo) / encode đúng kiểu mẫu chính thức (VNPAY);
 *  2. IPN bị sửa một ký tự là bị từ chối; IPN đúng khoá nhưng sai merchant cũng bị từ chối;
 *  3. ngày giờ VNPAY luôn là GMT+7, số tiền VNPAY luôn × 100;
 *  4. bảng mã kết quả: chỉ mã thành công TƯỜNG MINH mới là "đã thu".
 */

const MOMO = {
  partnerCode: 'MOMOTEST',
  accessKey: 'ACCESSKEYTEST',
  secretKey: 'momo-secret-key-for-tests-only',
};
const VNPAY = { tmnCode: 'TESTTMN1', hashSecret: 'vnpay-secret-key-for-tests-only' };

function configWith(values: Record<string, string>): PaymentGatewayConfig {
  const config = {
    get: (key: string) => values[key],
    getOrThrow: (key: string) => {
      const value = values[key];
      if (value === undefined) throw new Error(`missing ${key}`);
      return value;
    },
  } as unknown as ConfigService;
  return new PaymentGatewayConfig(config);
}

const config = configWith({
  API_PUBLIC_URL: 'https://api.example.test',
  PAYMENT_GATEWAY_MODE: 'sandbox',
  PAYMENT_GATEWAY_SUBSCRIPTION: 'on',
  PAYMENT_GATEWAY_BOOKING_HOLD: 'off',
  MOMO_PARTNER_CODE: MOMO.partnerCode,
  MOMO_ACCESS_KEY: MOMO.accessKey,
  MOMO_SECRET_KEY: MOMO.secretKey,
  MOMO_API_BASE_URL: 'https://momo.example.test',
  VNPAY_TMN_CODE: VNPAY.tmnCode,
  VNPAY_HASH_SECRET: VNPAY.hashSecret,
  VNPAY_PAYMENT_URL: 'https://vnpay.example.test/paymentv2/vpcpay.html',
  VNPAY_API_URL: 'https://vnpay.example.test/merchant_webapi/api/transaction',
});

describe('Cấu hình — hai trục độc lập', () => {
  it('phương thức của một luồng = luồng bật VÀ cổng đủ khoá', () => {
    expect(config.providersFor('subscription_invoice')).toEqual(['momo', 'vnpay']);
    expect(config.providersFor('booking_hold')).toEqual([]);
    expect(config.sandbox).toBe(true);
  });

  it('thiếu một khoá của cổng ⇒ cổng coi như chưa cấu hình (fail closed)', () => {
    const partial = configWith({
      API_PUBLIC_URL: 'https://api.example.test',
      PAYMENT_GATEWAY_SUBSCRIPTION: 'on',
      MOMO_PARTNER_CODE: MOMO.partnerCode,
      MOMO_ACCESS_KEY: MOMO.accessKey,
      MOMO_API_BASE_URL: 'https://momo.example.test',
    });
    expect(partial.isConfigured('momo')).toBe(false);
    expect(partial.providersFor('subscription_invoice')).toEqual([]);
  });
});

describe('MoMo — chữ ký', () => {
  it('chuỗi ký request tạo phiên đúng thứ tự tài liệu, không URL-encode', () => {
    const raw = momoCreateRawSignature({
      accessKey: 'A',
      amount: '50000',
      extraData: '',
      ipnUrl: 'https://api.x/ipn',
      orderId: 'ORD1',
      orderInfo: 'Thanh toan XPG2',
      partnerCode: 'P',
      redirectUrl: 'https://web.x/r?order=ORD1&app=1',
      requestId: 'REQ1',
      requestType: 'captureWallet',
    });
    expect(raw).toBe(
      'accessKey=A&amount=50000&extraData=&ipnUrl=https://api.x/ipn&orderId=ORD1' +
        '&orderInfo=Thanh toan XPG2&partnerCode=P&redirectUrl=https://web.x/r?order=ORD1&app=1' +
        '&requestId=REQ1&requestType=captureWallet',
    );
    expect(momoSign(raw, 'secret')).toBe(
      createHmac('sha256', 'secret').update(raw, 'utf8').digest('hex'),
    );
  });

  it('chuỗi ký truy vấn đúng thứ tự tài liệu', () => {
    expect(
      momoQueryRawSignature({ accessKey: 'A', orderId: 'O', partnerCode: 'P', requestId: 'R' }),
    ).toBe('accessKey=A&orderId=O&partnerCode=P&requestId=R');
  });

  it('bảng mã: chỉ 0 là đã thu; mã lạ từ truy vấn là CHƯA BIẾT, không phải thất bại', () => {
    expect(momoOutcome(0, 'ipn')).toBe('succeeded');
    expect(momoOutcome(9000, 'ipn')).toBe('pending');
    expect(momoOutcome(1000, 'query')).toBe('pending');
    expect(momoOutcome(1005, 'ipn')).toBe('expired');
    expect(momoOutcome(1006, 'ipn')).toBe('cancelled');
    expect(momoOutcome(1001, 'ipn')).toBe('failed');
    expect(momoOutcome(1001, 'query')).toBe('pending');
  });
});

describe('MoMo — xác minh IPN', () => {
  const adapter = new MomoAdapter(config);

  function signedIpn(over: Record<string, unknown> = {}, signWith = MOMO.secretKey) {
    const body: Record<string, unknown> = {
      partnerCode: MOMO.partnerCode,
      orderId: '01JTESTORDER0000000000000A',
      requestId: '01JTESTREQUEST000000000000',
      amount: 150000,
      orderInfo: 'Thanh toan goi XePrime XPG2K9ADFG',
      orderType: 'momo_wallet',
      transId: 4088878653,
      resultCode: 0,
      message: 'Successful.',
      payType: 'qr',
      responseTime: 1760000000000,
      extraData: '',
      ...over,
    };
    const text = (key: string) => (body[key] === undefined ? '' : String(body[key]));
    body.signature = momoSign(
      momoIpnRawSignature({
        accessKey: MOMO.accessKey,
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
      signWith,
    );
    return body;
  }

  it('IPN đúng chữ ký: kể lại đúng điều cổng nói, đã bỏ chữ ký khỏi bằng chứng', () => {
    const verified = adapter.verifyCallback(signedIpn());
    expect(verified.ok).toBe(true);
    if (!verified.ok) return;
    expect(verified.result).toMatchObject({
      orderRef: '01JTESTORDER0000000000000A',
      outcome: 'succeeded',
      providerTxId: '4088878653',
      resultCode: '0',
      payMethod: 'qr',
    });
    expect(verified.result.amount?.toString()).toBe('150000');
    expect(verified.result.paidAt?.getTime()).toBe(1760000000000);
    expect(verified.result.raw).not.toHaveProperty('signature');
  });

  it('sửa SỐ TIỀN sau khi ký ⇒ từ chối', () => {
    const body = signedIpn();
    body.amount = 1000;
    expect(adapter.verifyCallback(body)).toEqual({ ok: false, reason: 'signature' });
  });

  it('ký bằng khoá khác ⇒ từ chối', () => {
    expect(adapter.verifyCallback(signedIpn({}, 'khoa-khac'))).toEqual({
      ok: false,
      reason: 'signature',
    });
  });

  it('đúng khoá nhưng merchant khác ⇒ từ chối', () => {
    expect(adapter.verifyCallback(signedIpn({ partnerCode: 'OTHER' }))).toEqual({
      ok: false,
      reason: 'merchant',
    });
  });

  it('payload hỏng (không phải object, thiếu chữ ký, số tiền không phải số) ⇒ từ chối', () => {
    expect(adapter.verifyCallback('x')).toEqual({ ok: false, reason: 'malformed' });
    const noSignature = signedIpn();
    delete noSignature.signature;
    expect(adapter.verifyCallback(noSignature)).toEqual({ ok: false, reason: 'malformed' });
    expect(adapter.verifyCallback(signedIpn({ amount: '12.5' }))).toEqual({
      ok: false,
      reason: 'malformed',
    });
  });

  it('khách từ chối trên app MoMo (1006): huỷ, không có mã giao dịch được dùng', () => {
    const verified = adapter.verifyCallback(signedIpn({ resultCode: 1006, transId: 0 }));
    expect(verified.ok && verified.result.outcome).toBe('cancelled');
    expect(verified.ok && verified.result.providerTxId).toBeNull();
  });
});

describe('VNPAY — chữ ký và định dạng', () => {
  it('ký: sắp theo tên, encode như mẫu Node.js (dấu cách thành +)', () => {
    expect(
      vnpaySignData({
        vnp_ReturnUrl: 'https://a.b/c?x=1&y=2',
        vnp_OrderInfo: 'Thanh toan XPG2',
        vnp_Amount: '1000000',
      }),
    ).toBe(
      'vnp_Amount=1000000&vnp_OrderInfo=Thanh+toan+XPG2' +
        '&vnp_ReturnUrl=https%3A%2F%2Fa.b%2Fc%3Fx%3D1%26y%3D2',
    );
  });

  it('bỏ giá trị rỗng chỉ khi được yêu cầu (biến thể mẫu Java)', () => {
    const params = { vnp_A: '1', vnp_B: '', vnp_C: '3' };
    expect(vnpaySignData(params, true)).toBe('vnp_A=1&vnp_B=&vnp_C=3');
    expect(vnpaySignData(params, false)).toBe('vnp_A=1&vnp_C=3');
  });

  it('ngày giờ luôn là GMT+7, và parse ngược lại đúng mốc', () => {
    const instant = new Date('2026-10-09T17:04:05.000Z');
    expect(formatVnpayDate(instant)).toBe('20261010000405');
    expect(parseVnpayDate('20261010000405')?.toISOString()).toBe(instant.toISOString());
    expect(parseVnpayDate('2026-10-10')).toBeNull();
  });

  it('số tiền × 100; không chia hết cho 100 là dữ liệu sai', () => {
    expect(vnpayAmountToVnd('15000000')).toBe(150000);
    expect(vnpayAmountToVnd('15000050')).toBeNull();
    expect(vnpayAmountToVnd('-100')).toBeNull();
  });

  it('bảng mã: thành công chỉ khi CẢ HAI cột là 00', () => {
    expect(vnpayPaymentOutcome('00', '00')).toBe('succeeded');
    expect(vnpayPaymentOutcome('00', '01')).toBe('pending');
    expect(vnpayPaymentOutcome('24', '02')).toBe('cancelled');
    expect(vnpayPaymentOutcome('11', '02')).toBe('expired');
    expect(vnpayPaymentOutcome('07', '07')).toBe('flagged');
    expect(vnpayPaymentOutcome('51', '02')).toBe('failed');
    expect(vnpayQueryOutcome('00')).toBe('succeeded');
    expect(vnpayQueryOutcome('02')).toBe('failed');
    expect(vnpayQueryOutcome('05')).toBe('pending');
  });

  it('querydr: chuỗi ký request và phản hồi đúng thứ tự tài liệu, trường vắng là rỗng', () => {
    expect(
      vnpayQueryRequestHashData({
        requestId: 'R',
        version: '2.1.0',
        command: 'querydr',
        tmnCode: 'T',
        txnRef: 'X',
        transactionDate: '20261009100000',
        createDate: '20261009101000',
        ipAddr: '1.2.3.4',
        orderInfo: 'Truy van',
      }),
    ).toBe('R|2.1.0|querydr|T|X|20261009100000|20261009101000|1.2.3.4|Truy van');
    expect(
      vnpayQueryResponseHashData({
        vnp_ResponseId: 'RID',
        vnp_Command: 'querydr',
        vnp_ResponseCode: '00',
        vnp_Message: 'OK',
        vnp_TmnCode: 'T',
        vnp_TxnRef: 'X',
        vnp_Amount: '100',
        vnp_BankCode: 'NCB',
        vnp_PayDate: '20261009100500',
        vnp_TransactionNo: '14000000',
        vnp_TransactionType: '01',
        vnp_TransactionStatus: '00',
        vnp_OrderInfo: 'Truy van',
      }),
    ).toBe('RID|querydr|00|OK|T|X|100|NCB|20261009100500|14000000|01|00|Truy van||');
  });
});

describe('VNPAY — URL thanh toán và IPN', () => {
  const adapter = new VnpayAdapter(config);

  it('URL thanh toán mang số tiền × 100, hạn GMT+7, và chữ ký khớp phần còn lại', async () => {
    const created = await adapter.createPayment({
      orderRef: '01JTESTORDER0000000000000B',
      amount: 150000,
      orderInfo: 'Tien giu cho XePrime XPH23456789',
      returnUrl: 'https://xeprime.test/trips/REQ1?paymentOrder=01JTESTORDER0000000000000B',
      createdAt: new Date('2026-10-09T03:00:00.000Z'),
      expiresAt: new Date('2026-10-09T03:15:00.000Z'),
      clientIp: '1.2.3.4',
      locale: 'vi',
    });
    const url = new URL(created.checkoutUrl);
    expect(url.origin + url.pathname).toBe('https://vnpay.example.test/paymentv2/vpcpay.html');
    expect(url.searchParams.get('vnp_Amount')).toBe('15000000');
    expect(url.searchParams.get('vnp_CreateDate')).toBe('20261009100000');
    expect(url.searchParams.get('vnp_ExpireDate')).toBe('20261009101500');
    expect(url.searchParams.get('vnp_Locale')).toBe('vn');
    expect(url.searchParams.get('vnp_TmnCode')).toBe(VNPAY.tmnCode);

    const params: Record<string, string> = {};
    url.searchParams.forEach((value, key) => {
      if (key !== 'vnp_SecureHash') params[key] = value;
    });
    expect(url.searchParams.get('vnp_SecureHash')).toBe(
      vnpayHmac(vnpaySignData(params), VNPAY.hashSecret),
    );
  });

  function signedIpn(over: Record<string, string> = {}, includeEmpty = true) {
    const params: Record<string, string> = {
      vnp_Amount: '15000000',
      vnp_BankCode: 'NCB',
      vnp_BankTranNo: 'VNP14422574',
      vnp_CardType: 'ATM',
      vnp_OrderInfo: 'Tien giu cho XePrime XPH23456789',
      vnp_PayDate: '20261009100500',
      vnp_ResponseCode: '00',
      vnp_TmnCode: VNPAY.tmnCode,
      vnp_TransactionNo: '14422574',
      vnp_TransactionStatus: '00',
      vnp_TxnRef: '01JTESTORDER0000000000000B',
      ...over,
    };
    return {
      ...params,
      vnp_SecureHashType: 'HmacSHA512',
      vnp_SecureHash: vnpayHmac(vnpaySignData(params, includeEmpty), VNPAY.hashSecret),
    };
  }

  it('IPN đúng chữ ký: đã thu, số tiền chia 100, mốc trả theo GMT+7', () => {
    const verified = adapter.verifyCallback(signedIpn());
    expect(verified.ok).toBe(true);
    if (!verified.ok) return;
    expect(verified.result.outcome).toBe('succeeded');
    expect(verified.result.amount?.toString()).toBe('150000');
    expect(verified.result.providerTxId).toBe('14422574');
    expect(verified.result.paidAt?.toISOString()).toBe('2026-10-09T03:05:00.000Z');
    expect(verified.result.raw).not.toHaveProperty('vnp_SecureHash');
  });

  it('cả hai biến thể chữ ký của mẫu chính thức đều được nhận (giá trị rỗng)', () => {
    expect(adapter.verifyCallback(signedIpn({ vnp_BankTranNo: '' }, true)).ok).toBe(true);
    expect(adapter.verifyCallback(signedIpn({ vnp_BankTranNo: '' }, false)).ok).toBe(true);
  });

  it('sửa số tiền ⇒ sai chữ ký; đúng khoá sai mã website ⇒ sai merchant', () => {
    const tampered = { ...signedIpn(), vnp_Amount: '100' };
    expect(adapter.verifyCallback(tampered)).toEqual({ ok: false, reason: 'signature' });
    expect(adapter.verifyCallback(signedIpn({ vnp_TmnCode: 'OTHERTMN' }))).toEqual({
      ok: false,
      reason: 'merchant',
    });
  });

  it('tham số lặp (mảng) là request dị dạng', () => {
    const body = { ...signedIpn(), vnp_TxnRef: ['A', 'B'] };
    expect(adapter.verifyCallback(body)).toEqual({ ok: false, reason: 'malformed' });
  });
});

describe('IP gửi sang cổng', () => {
  it('gỡ tiền tố IPv4-trong-IPv6, loopback và rỗng về 127.0.0.1', () => {
    expect(normalizeClientIp('::ffff:10.0.0.7')).toBe('10.0.0.7');
    expect(normalizeClientIp('::1')).toBe('127.0.0.1');
    expect(normalizeClientIp(undefined)).toBe('127.0.0.1');
    expect(normalizeClientIp('203.113.1.9')).toBe('203.113.1.9');
  });
});

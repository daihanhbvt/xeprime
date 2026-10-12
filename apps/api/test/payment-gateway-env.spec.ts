import { validateEnv } from '../src/config/env.schema';
import { baseEnv, productionEnv, validationError } from './helpers/env-fixture';

/**
 * Cấu hình cổng MoMo · VNPAY — unit thuần, không đụng DB (ADR 0058).
 *
 * Mọi luật ở đây là một cách "fail closed" lúc BOOT thay vì lúc khách đang trả tiền: nhóm khoá khai
 * thiếu, luồng bật mà không có cổng, và — quan trọng nhất — release gate của tiền giữ chỗ nằm trong mã,
 * không nằm trong trí nhớ của người deploy.
 */
const MOMO = {
  MOMO_PARTNER_CODE: 'MOMOTEST',
  MOMO_ACCESS_KEY: 'access',
  MOMO_SECRET_KEY: 'secret',
  MOMO_API_BASE_URL: 'https://test-payment.momo.vn/',
};

const VNPAY = {
  VNPAY_TMN_CODE: 'TESTTMN1',
  VNPAY_HASH_SECRET: 'hash-secret',
  VNPAY_PAYMENT_URL: 'https://sandbox.vnpayment.vn/paymentv2/vpcpay.html',
  VNPAY_API_URL: 'https://sandbox.vnpayment.vn/merchant_webapi/api/transaction',
};

/** Bản sao của một nhóm khoá, thiếu đúng một biến. */
function without(group: Record<string, string>, key: string): Record<string, string> {
  return Object.fromEntries(Object.entries(group).filter(([k]) => k !== key));
}

describe('env cổng thanh toán: mặc định tắt', () => {
  it('không khai gì: mọi luồng tắt, chế độ sandbox, không cổng nào', () => {
    const env = validateEnv(baseEnv());
    expect(env.PAYMENT_GATEWAY_SUBSCRIPTION).toBe('off');
    expect(env.PAYMENT_GATEWAY_BOOKING_HOLD).toBe('off');
    expect(env.PAYMENT_GATEWAY_MODE).toBe('sandbox');
    expect(env.MOMO_SECRET_KEY).toBeUndefined();
    expect(env.VNPAY_HASH_SECRET).toBeUndefined();
  });

  it('chuỗi rỗng = chưa khai (như `.env.example`), không đánh trượt cả bộ env', () => {
    const env = validateEnv(
      baseEnv({ MOMO_PARTNER_CODE: '', MOMO_API_BASE_URL: '', VNPAY_PAYMENT_URL: '' }),
    );
    expect(env.MOMO_PARTNER_CODE).toBeUndefined();
    expect(env.MOMO_API_BASE_URL).toBeUndefined();
  });

  it('đủ một nhóm: nhận, và bỏ `/` cuối của URL', () => {
    const env = validateEnv(baseEnv({ ...MOMO, PAYMENT_GATEWAY_SUBSCRIPTION: 'on' }));
    expect(env.MOMO_API_BASE_URL).toBe('https://test-payment.momo.vn');
  });
});

describe('env cổng thanh toán: cấu hình gõ thiếu fail lúc boot', () => {
  it('khai NỬA nhóm MoMo: chỉ đúng biến còn thiếu', () => {
    expect(validationError(baseEnv(without(MOMO, 'MOMO_SECRET_KEY')))).toMatch(/MOMO_SECRET_KEY/);
  });

  it('khai NỬA nhóm VNPAY: chỉ đúng biến còn thiếu', () => {
    expect(validationError(baseEnv(without(VNPAY, 'VNPAY_API_URL')))).toMatch(/VNPAY_API_URL/);
  });

  it('bật một luồng mà không cổng nào đủ khoá ⇒ từ chối', () => {
    expect(validationError(baseEnv({ PAYMENT_GATEWAY_SUBSCRIPTION: 'on' }))).toMatch(
      /PAYMENT_GATEWAY_SUBSCRIPTION/,
    );
  });

  it('URL không phải URL ⇒ từ chối', () => {
    expect(validationError(baseEnv({ ...MOMO, MOMO_API_BASE_URL: 'test-payment' }))).toMatch(
      /MOMO_API_BASE_URL/,
    );
  });
});

describe('env cổng thanh toán: môi trường đã triển khai', () => {
  it('URL của cổng phải là https (cả staging)', () => {
    const staging = productionEnv({
      APP_ENV: 'staging',
      ...VNPAY,
      VNPAY_API_URL: 'http://sandbox.vnpayment.vn/merchant_webapi/api/transaction',
    });
    expect(validationError(staging)).toMatch(/VNPAY_API_URL/);
  });

  it('staging được bật cổng cho tiền giữ chỗ ở sandbox — để chuẩn bị và UAT', () => {
    expect(
      validationError(
        productionEnv({ APP_ENV: 'staging', ...MOMO, PAYMENT_GATEWAY_BOOKING_HOLD: 'on' }),
      ),
    ).toBe('');
  });

  it('PRODUCTION từ chối boot khi bật cổng cho tiền giữ chỗ — release gate L1/L5', () => {
    expect(
      validationError(
        productionEnv({ ...MOMO, PAYMENT_GATEWAY_BOOKING_HOLD: 'on', PAYMENT_GATEWAY_MODE: 'live' }),
      ),
    ).toMatch(/PAYMENT_GATEWAY_BOOKING_HOLD/);
  });

  it('PRODUCTION cũng từ chối luồng gói khi ADR 0058 còn Proposed — kể cả ở chế độ live', () => {
    const base = productionEnv({ ...MOMO, PAYMENT_GATEWAY_SUBSCRIPTION: 'on' });
    expect(validationError(base)).toMatch(/PAYMENT_GATEWAY_SUBSCRIPTION/);
    expect(validationError(base)).toMatch(/PAYMENT_GATEWAY_MODE/);
    expect(validationError({ ...base, PAYMENT_GATEWAY_MODE: 'live' })).toMatch(
      /PAYMENT_GATEWAY_SUBSCRIPTION/,
    );
  });

  it('PRODUCTION có khoá cổng nhưng mọi luồng tắt: vẫn boot (chuẩn bị trước, bật sau)', () => {
    expect(validationError(productionEnv({ ...MOMO, ...VNPAY, PAYMENT_GATEWAY_MODE: 'live' }))).toBe(
      '',
    );
  });
});

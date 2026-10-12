import type { ConfigService } from '@nestjs/config';
import { EsmsOtpProvider } from '../src/modules/phone-verification/otp-provider';

/**
 * eSMS chỉ giao tin KHỚP mẫu đã duyệt của brandname — và Sandbox KHÔNG kiểm điều đó (câu lệch mẫu
 * vẫn trả 100, đo 12/10/2026). Nên câu gửi đi phải đúng `ESMS_OTP_TEMPLATE` từng ký tự. Unit thuần,
 * `fetch` giả — không gọi eSMS thật.
 */
const ENV: Record<string, string> = {
  ESMS_API_KEY: 'k',
  ESMS_SECRET_KEY: 's',
  ESMS_BRANDNAME: 'Baotrixemay',
  ESMS_OTP_TEMPLATE: '{code} la ma xac minh dang ky Baotrixemay cua ban',
};
const config = {
  getOrThrow: (k: string) => {
    const v = ENV[k];
    if (v === undefined) throw new Error(`missing ${k}`);
    return v;
  },
} as unknown as ConfigService;

const realFetch = global.fetch;
afterEach(() => {
  global.fetch = realFetch;
});

function mockFetch(body: unknown, status = 200) {
  const fn = jest.fn().mockResolvedValue({
    ok: status >= 200 && status < 300,
    status,
    json: () => Promise.resolve(body),
  });
  global.fetch = fn as unknown as typeof fetch;
  return fn;
}

describe('EsmsOtpProvider', () => {
  it('gửi đúng câu mẫu của môi trường, brandname CSKH (SmsType 2)', async () => {
    const fetchFn = mockFetch({ CodeResult: '100' });
    await new EsmsOtpProvider(config).send('84901234567', '482913');

    const sent = JSON.parse((fetchFn.mock.calls[0] as [string, { body: string }])[1].body);
    expect(sent).toMatchObject({
      Phone: '84901234567',
      Brandname: 'Baotrixemay',
      SmsType: '2',
      Content: '482913 la ma xac minh dang ky Baotrixemay cua ban',
    });
  });

  it('CodeResult khác 100 (vd 146 lệch mẫu) ⇒ ném lỗi, không nuốt', async () => {
    mockFetch({ CodeResult: '146', ErrorMessage: 'Template not registered' });
    await expect(new EsmsOtpProvider(config).send('84901234567', '482913')).rejects.toThrow();
  });
});

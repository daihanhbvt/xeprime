import { ConfigService } from '@nestjs/config';
import nodemailer from 'nodemailer';
import { EmailService } from '../src/modules/email/email.service';

/**
 * Cách EmailService dựng transporter — nơi một cấu hình sai chỉ lộ ra ở ĐÚNG một môi trường.
 *
 * Ba nhánh dưới đây là ba môi trường thật của repo, và không nhánh nào kiểm được bằng mắt:
 *
 *  1. Không có `SMTP_HOST` (staging) → không transporter, nội dung in ra log. Đây là lối suy
 *     giảm có kiểm soát, không phải lỗi.
 *  2. Có host + user + pass (production) → đính `auth`. Thiếu nó là mọi thư bị nhà cung cấp
 *     từ chối ngay ở lệnh đầu tiên.
 *  3. Có host nhưng user/pass TRỐNG (Mailpit trên máy dev) → **không** đính `auth`. Hộp thư dev
 *     không quảng cáo AUTH; đưa một cặp rỗng thì nodemailer vẫn cố đăng nhập và chuyến thư hỏng
 *     ở chỗ không ai nghĩ tới. Đây chính là nhánh dễ bị hồi quy nhất khi ai đó "dọn" mấy dòng
 *     điều kiện trông thừa thãi.
 */
jest.mock('nodemailer', () => ({
  __esModule: true,
  default: { createTransport: jest.fn(() => ({ sendMail: jest.fn(), close: jest.fn() })) },
}));

const createTransport = nodemailer.createTransport as unknown as jest.Mock;

function makeService(env: Record<string, string | number | undefined>): EmailService {
  const config = {
    get: (key: string) => env[key],
    getOrThrow: (key: string) => {
      const value = env[key];
      if (value === undefined) throw new Error(`Thiếu ${key}`);
      return value;
    },
  } as unknown as ConfigService;

  return new EmailService(config);
}

const FROM = 'XePrime <no-reply@xeprime.local>';

beforeEach(() => createTransport.mockClear());

describe('EmailService — dựng transporter', () => {
  it('không có SMTP_HOST: không tạo transporter nào (thư in ra log)', () => {
    makeService({ SMTP_FROM: FROM });
    expect(createTransport).not.toHaveBeenCalled();
  });

  it('có host + user + pass: đính auth', () => {
    makeService({
      SMTP_FROM: FROM,
      SMTP_HOST: 'smtp.resend.com',
      SMTP_PORT: 587,
      SMTP_USER: 'resend',
      SMTP_PASS: 're_secret',
    });

    expect(createTransport).toHaveBeenCalledWith({
      host: 'smtp.resend.com',
      port: 587,
      auth: { user: 'resend', pass: 're_secret' },
    });
  });

  it('có host nhưng user/pass rỗng (Mailpit): KHÔNG đính auth', () => {
    makeService({
      SMTP_FROM: FROM,
      SMTP_HOST: 'localhost',
      SMTP_PORT: 1025,
      SMTP_USER: '',
      SMTP_PASS: '',
    });

    const options = createTransport.mock.calls[0]![0] as Record<string, unknown>;
    expect(options).toEqual({ host: 'localhost', port: 1025 });
    expect(options).not.toHaveProperty('auth');
  });

  it('thiếu SMTP_PORT: rơi về 587 (STARTTLS) chứ không phải undefined', () => {
    makeService({ SMTP_FROM: FROM, SMTP_HOST: 'smtp.example.com' });
    expect(createTransport.mock.calls[0]![0]).toMatchObject({ port: 587 });
  });
});

/**
 * Chặn gửi tới TLD dành riêng — thứ đứng giữa một buổi UAT trên staging và việc nhà cung cấp
 * khoá tài khoản gửi thư của production.
 *
 * Seed demo dùng `@xeprime.test`. Từ khi staging gửi thư THẬT (quyết định 04/09/2026), mỗi lần
 * ai đó bấm "quên mật khẩu" cho một tài khoản demo là một hard bounce. Bounce tính vào uy tín
 * của TÀI KHOẢN gửi, nên thiệt hại không nằm lại ở staging.
 */
describe('EmailService — không gửi ra TLD dành riêng', () => {
  const sendMail = jest.fn();

  function serviceWithSmtp(): EmailService {
    createTransport.mockReturnValueOnce({ sendMail, close: jest.fn() });
    return makeService({
      SMTP_FROM: FROM,
      SMTP_HOST: 'smtp.resend.com',
      SMTP_PORT: 587,
      SMTP_USER: 'resend',
      SMTP_PASS: 're_secret',
    });
  }

  beforeEach(() => sendMail.mockReset());

  it.each([
    ['khach.binh@xeprime.test', 'seed demo'],
    ['ai.do@cty.invalid', 'RFC 2606'],
    ['someone@example.com', 'tên miền ví dụ'],
    ['dev@my-box.local', 'mạng nội bộ'],
  ])('KHÔNG gửi tới %s (%s)', async (address) => {
    await serviceWithSmtp().sendTenantInvite(
      address,
      'Gian hàng A',
      'https://x/invites/t',
      new Date(),
    );
    expect(sendMail).not.toHaveBeenCalled();
  });

  it('vẫn gửi bình thường tới địa chỉ thật', async () => {
    await serviceWithSmtp().sendPasswordReset(
      'nguoi.that@gmail.com',
      'Người Thật',
      'https://x/r?token=t',
    );
    expect(sendMail).toHaveBeenCalledTimes(1);
    expect(sendMail.mock.calls[0]![0]).toMatchObject({ to: 'nguoi.that@gmail.com', from: FROM });
  });

  it('không nhầm tên miền chỉ TRÙNG CHỮ với TLD dành riêng', async () => {
    // `latest.vn` kết thúc bằng "test" nhưng không phải TLD `.test` — chặn nó là chặn một
    // khách hàng thật.
    await serviceWithSmtp().sendPasswordReset('a@latest.vn', 'A', 'https://x/r?token=t');
    expect(sendMail).toHaveBeenCalledTimes(1);
  });
});

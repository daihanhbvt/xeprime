import type { ConfigService } from '@nestjs/config';
import { createPrismaClient } from '@xeprime/prisma';
import { ACCOUNT_REALM, API_ERROR_CODE, PHONE_VERIFICATION_PURPOSE } from '@xeprime/types';
import { MockOtpProvider } from '../src/modules/phone-verification/otp-provider';
import { normalizePhone } from '../src/common/phone';
import { PhoneVerificationService } from '../src/modules/phone-verification/phone-verification.service';
import type { PrismaService } from '../src/prisma/prisma.service';

/**
 * Gate verify SĐT (Phase 4 §8), chạy trên PostgreSQL THẬT với provider mock. Kiểm chứng: gửi→
 * verify happy · sai mã · hết hạn · cooldown · gate booking chặn khi chưa verify / cho qua sau
 * khi verify. Không có DB thì tự skip.
 *
 * ADR 0053: mã OTP thuộc một realm. Mã gửi cho site partner không xác minh được SĐT ở site khách,
 * nhưng cooldown/hạn mức gửi tính theo SỐ trên mọi realm (chống spam SMS không phụ thuộc site).
 */
const prisma = createPrismaClient();
const asService = prisma as unknown as PrismaService;

const ENV: Record<string, unknown> = {
  OTP_MODE: 'mock',
  NODE_ENV: 'test',
  OTP_PEPPER: 'test-pepper-abcdef123456',
};
const config = {
  get: (k: string) => ENV[k],
  getOrThrow: (k: string) => {
    const v = ENV[k];
    if (v === undefined) throw new Error(`missing ${k}`);
    return v;
  },
} as unknown as ConfigService;

const service = new PhoneVerificationService(asService, config, new MockOtpProvider());

let dbAvailable = false;
const usedPhones = new Set<string>();

// SĐT duy nhất mỗi test để không đụng cooldown/rate-limit của nhau. `09` + 8 số.
let counter = 0;
function mkPhone(): string {
  const n = (Date.now() % 100_000_000) + counter++;
  const phone = `09${String(n % 100_000_000).padStart(8, '0')}`;
  usedPhones.add(normalizePhone(phone));
  return phone;
}

beforeAll(async () => {
  try {
    await prisma.$connect();
    await prisma.$queryRaw`SELECT 1`;
    dbAvailable = true;
  } catch {
    console.warn('\n[skip] Không kết nối được PostgreSQL. Chạy `pnpm db:up` trước.\n');
  }
});

afterAll(async () => {
  if (dbAvailable && usedPhones.size > 0) {
    await prisma.phoneVerification.deleteMany({ where: { phone: { in: [...usedPhones] } } });
  }
  await prisma.$disconnect();
});

const maybe = (name: string, fn: () => Promise<void>) =>
  it(name, async () => {
    if (!dbAvailable) return;
    await fn();
  });

const BOOKING = PHONE_VERIFICATION_PURPOSE.BOOKING;
const C = ACCOUNT_REALM.CUSTOMER;
const P = ACCOUNT_REALM.PARTNER;

describe('Phone verification OTP (Phase 4)', () => {
  maybe('normalizePhone: 0.. / +84.. / 84.. → 84xxxxxxxxx', async () => {
    expect(normalizePhone('0901234567')).toBe('84901234567');
    expect(normalizePhone('+84901234567')).toBe('84901234567');
    expect(normalizePhone('84901234567')).toBe('84901234567');
  });

  maybe('gửi → verify happy path (devCode ở mock)', async () => {
    const phone = mkPhone();
    const { devCode } = await service.sendOtp(phone, BOOKING, C);
    expect(devCode).toMatch(/^\d{6}$/);
    await expect(service.verifyOtp(phone, BOOKING, devCode!, C)).resolves.toBeUndefined();
    // Đã verify → gate booking cho qua.
    await expect(service.assertPhoneVerifiedForBooking(phone)).resolves.toBeUndefined();
  });

  maybe('sai mã → OTP_INVALID', async () => {
    const phone = mkPhone();
    const { devCode } = await service.sendOtp(phone, BOOKING, C);
    const wrong = devCode === '000000' ? '111111' : '000000';
    await expect(service.verifyOtp(phone, BOOKING, wrong, C)).rejects.toMatchObject({
      response: { code: API_ERROR_CODE.OTP_INVALID },
    });
  });

  maybe('nhập sai quá số lần → OTP_LOCKED, khoá mã (mã đúng sau đó cũng vô hiệu)', async () => {
    const phone = mkPhone();
    const { devCode } = await service.sendOtp(phone, BOOKING, C);
    const wrong = devCode === '000000' ? '111111' : '000000';
    // OTP_POLICY.MAX_ATTEMPTS=5: 4 lần đầu OTP_INVALID, lần thứ 5 khoá → OTP_LOCKED.
    for (let i = 0; i < 4; i++) {
      await expect(service.verifyOtp(phone, BOOKING, wrong, C)).rejects.toMatchObject({
        response: { code: API_ERROR_CODE.OTP_INVALID },
      });
    }
    await expect(service.verifyOtp(phone, BOOKING, wrong, C)).rejects.toMatchObject({
      response: { code: API_ERROR_CODE.OTP_LOCKED },
    });
    // Đã khoá (status=failed) → không còn pending, mã ĐÚNG cũng không verify được.
    await expect(service.verifyOtp(phone, BOOKING, devCode!, C)).rejects.toMatchObject({
      response: { code: API_ERROR_CODE.OTP_INVALID },
    });
  });

  maybe('mã hết hạn → OTP_EXPIRED', async () => {
    const phone = mkPhone();
    const { devCode } = await service.sendOtp(phone, BOOKING, C);
    // Đẩy hạn về quá khứ để mô phỏng hết hạn (không đợi TTL).
    await prisma.phoneVerification.updateMany({
      where: { phone: normalizePhone(phone), status: 'pending' },
      data: { expiresAt: new Date(Date.now() - 1000) },
    });
    await expect(service.verifyOtp(phone, BOOKING, devCode!, C)).rejects.toMatchObject({
      response: { code: API_ERROR_CODE.OTP_EXPIRED },
    });
  });

  maybe('gửi lại trong cooldown → OTP_COOLDOWN', async () => {
    const phone = mkPhone();
    await service.sendOtp(phone, BOOKING, C);
    await expect(service.sendOtp(phone, BOOKING, C)).rejects.toMatchObject({
      response: { code: API_ERROR_CODE.OTP_COOLDOWN },
    });
  });

  maybe('gate booking chặn khi chưa verify → PHONE_NOT_VERIFIED', async () => {
    const phone = mkPhone();
    await service.sendOtp(phone, BOOKING, C); // mới gửi, CHƯA verify
    await expect(service.assertPhoneVerifiedForBooking(phone)).rejects.toMatchObject({
      response: { code: API_ERROR_CODE.PHONE_NOT_VERIFIED },
    });
  });

  maybe('verify mục đích khác không mở gate booking', async () => {
    const phone = mkPhone();
    const { devCode } = await service.sendOtp(phone, PHONE_VERIFICATION_PURPOSE.SHOP_REGISTER, C);
    await service.verifyOtp(phone, PHONE_VERIFICATION_PURPOSE.SHOP_REGISTER, devCode!, C);
    // Verified cho shop_register, nhưng gate booking đọc purpose=booking → vẫn chặn.
    await expect(service.assertPhoneVerifiedForBooking(phone)).rejects.toMatchObject({
      response: { code: API_ERROR_CODE.PHONE_NOT_VERIFIED },
    });
  });

  maybe('mã gửi cho realm partner KHÔNG xác minh được ở realm khách', async () => {
    const phone = mkPhone();
    const { devCode } = await service.sendOtp(phone, BOOKING, P);
    await expect(service.verifyOtp(phone, BOOKING, devCode!, C)).rejects.toMatchObject({
      response: { code: API_ERROR_CODE.OTP_INVALID },
    });
    // Và cổng đặt xe (chỉ đọc realm khách) vẫn đóng.
    await expect(service.assertPhoneVerifiedForBooking(phone)).rejects.toMatchObject({
      response: { code: API_ERROR_CODE.PHONE_NOT_VERIFIED },
    });
  });

  maybe('cooldown tính theo SỐ trên mọi realm — đổi site không lách được hạn mức SMS', async () => {
    const phone = mkPhone();
    await service.sendOtp(phone, BOOKING, C);
    await expect(service.sendOtp(phone, BOOKING, P)).rejects.toMatchObject({
      response: { code: API_ERROR_CODE.OTP_COOLDOWN },
    });
  });

  maybe('cầu tương thích app Partner: verify chấp nhận danh sách realm', async () => {
    const phone = mkPhone();
    // App Partner cũ gọi send-otp không có clientApp ⇒ mã nằm ở realm khách; endpoint đăng nhập
    // của app Partner nhận [partner, customer] để không gãy app đang phát hành.
    const { devCode } = await service.sendOtp(phone, PHONE_VERIFICATION_PURPOSE.LOGIN, C);
    await expect(
      service.verifyOtp(phone, PHONE_VERIFICATION_PURPOSE.LOGIN, devCode!, [P, C]),
    ).resolves.toBeUndefined();
  });
});

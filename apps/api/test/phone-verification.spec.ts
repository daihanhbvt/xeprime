import type { ConfigService } from '@nestjs/config';
import { createPrismaClient } from '@xeprime/prisma';
import { API_ERROR_CODE, PHONE_VERIFICATION_PURPOSE } from '@xeprime/types';
import { MockOtpProvider } from '../src/modules/phone-verification/otp-provider';
import { normalizePhone } from '../src/common/phone';
import { PhoneVerificationService } from '../src/modules/phone-verification/phone-verification.service';
import type { PrismaService } from '../src/prisma/prisma.service';

/**
 * Gate verify SĐT (Phase 4 §8), chạy trên PostgreSQL THẬT với provider mock. Kiểm chứng: gửi→
 * verify happy · sai mã · hết hạn · cooldown · gate booking chặn khi chưa verify / cho qua sau
 * khi verify. Không có DB thì tự skip.
 */
const prisma = createPrismaClient();
const asService = prisma as unknown as PrismaService;

const ENV: Record<string, unknown> = {
  OTP_MODE: 'mock',
  NODE_ENV: 'test',
  OTP_PEPPER: 'test-pepper-abcdef123456',
  OTP_TTL_MINUTES: 5,
  OTP_RESEND_COOLDOWN_SECONDS: 60,
  OTP_MAX_SENDS_PER_HOUR: 5,
  OTP_MAX_ATTEMPTS: 5,
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

describe('Phone verification OTP (Phase 4)', () => {
  maybe('normalizePhone: 0.. / +84.. / 84.. → 84xxxxxxxxx', async () => {
    expect(normalizePhone('0901234567')).toBe('84901234567');
    expect(normalizePhone('+84901234567')).toBe('84901234567');
    expect(normalizePhone('84901234567')).toBe('84901234567');
  });

  maybe('gửi → verify happy path (devCode ở mock)', async () => {
    const phone = mkPhone();
    const { devCode } = await service.sendOtp(phone, BOOKING);
    expect(devCode).toMatch(/^\d{6}$/);
    await expect(service.verifyOtp(phone, BOOKING, devCode!)).resolves.toBeUndefined();
    // Đã verify → gate booking cho qua.
    await expect(service.assertPhoneVerifiedForBooking(phone)).resolves.toBeUndefined();
  });

  maybe('sai mã → OTP_INVALID', async () => {
    const phone = mkPhone();
    const { devCode } = await service.sendOtp(phone, BOOKING);
    const wrong = devCode === '000000' ? '111111' : '000000';
    await expect(service.verifyOtp(phone, BOOKING, wrong)).rejects.toMatchObject({
      response: { code: API_ERROR_CODE.OTP_INVALID },
    });
  });

  maybe('nhập sai quá số lần → OTP_LOCKED, khoá mã (mã đúng sau đó cũng vô hiệu)', async () => {
    const phone = mkPhone();
    const { devCode } = await service.sendOtp(phone, BOOKING);
    const wrong = devCode === '000000' ? '111111' : '000000';
    // OTP_MAX_ATTEMPTS=5: 4 lần đầu OTP_INVALID, lần thứ 5 khoá → OTP_LOCKED.
    for (let i = 0; i < 4; i++) {
      await expect(service.verifyOtp(phone, BOOKING, wrong)).rejects.toMatchObject({
        response: { code: API_ERROR_CODE.OTP_INVALID },
      });
    }
    await expect(service.verifyOtp(phone, BOOKING, wrong)).rejects.toMatchObject({
      response: { code: API_ERROR_CODE.OTP_LOCKED },
    });
    // Đã khoá (status=failed) → không còn pending, mã ĐÚNG cũng không verify được.
    await expect(service.verifyOtp(phone, BOOKING, devCode!)).rejects.toMatchObject({
      response: { code: API_ERROR_CODE.OTP_INVALID },
    });
  });

  maybe('mã hết hạn → OTP_EXPIRED', async () => {
    const phone = mkPhone();
    const { devCode } = await service.sendOtp(phone, BOOKING);
    // Đẩy hạn về quá khứ để mô phỏng hết hạn (không đợi TTL).
    await prisma.phoneVerification.updateMany({
      where: { phone: normalizePhone(phone), status: 'pending' },
      data: { expiresAt: new Date(Date.now() - 1000) },
    });
    await expect(service.verifyOtp(phone, BOOKING, devCode!)).rejects.toMatchObject({
      response: { code: API_ERROR_CODE.OTP_EXPIRED },
    });
  });

  maybe('gửi lại trong cooldown → OTP_COOLDOWN', async () => {
    const phone = mkPhone();
    await service.sendOtp(phone, BOOKING);
    await expect(service.sendOtp(phone, BOOKING)).rejects.toMatchObject({
      response: { code: API_ERROR_CODE.OTP_COOLDOWN },
    });
  });

  maybe('gate booking chặn khi chưa verify → PHONE_NOT_VERIFIED', async () => {
    const phone = mkPhone();
    await service.sendOtp(phone, BOOKING); // mới gửi, CHƯA verify
    await expect(service.assertPhoneVerifiedForBooking(phone)).rejects.toMatchObject({
      response: { code: API_ERROR_CODE.PHONE_NOT_VERIFIED },
    });
  });

  maybe('verify mục đích khác không mở gate booking', async () => {
    const phone = mkPhone();
    const { devCode } = await service.sendOtp(phone, PHONE_VERIFICATION_PURPOSE.SHOP_REGISTER);
    await service.verifyOtp(phone, PHONE_VERIFICATION_PURPOSE.SHOP_REGISTER, devCode!);
    // Verified cho shop_register, nhưng gate booking đọc purpose=booking → vẫn chặn.
    await expect(service.assertPhoneVerifiedForBooking(phone)).rejects.toMatchObject({
      response: { code: API_ERROR_CODE.PHONE_NOT_VERIFIED },
    });
  });
});

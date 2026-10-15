import type { ConfigService } from '@nestjs/config';
import { createPrismaClient } from '@xeprime/prisma';
import {
  ACCOUNT_REALM,
  API_ERROR_CODE,
  PHONE_VERIFICATION_PURPOSE,
  PHONE_VERIFICATION_STATUS,
} from '@xeprime/types';
import { MockOtpProvider } from '../src/modules/phone-verification/otp-provider';
import { normalizePhone } from '../src/common/phone';
import { PhoneVerificationService } from '../src/modules/phone-verification/phone-verification.service';
import type { PrismaService } from '../src/prisma/prisma.service';

/**
 * Mã OTP (Phase 4 §8), chạy trên PostgreSQL THẬT với provider mock. Kiểm chứng: gửi→verify happy ·
 * sai mã · hết hạn · cooldown · mã không dùng chéo mục đích · gửi "câm" (`deliver: false`, quên
 * mật khẩu cho số không có tài khoản — ADR 0060). Không có DB thì tự skip.
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

/** Provider mock đếm số lần THẬT SỰ nhắn tin — để kiểm nhánh `deliver: false`. */
class CountingOtpProvider extends MockOtpProvider {
  readonly sentTo: string[] = [];
  override async send(phone: string, code: string): Promise<void> {
    this.sentTo.push(phone);
    await super.send(phone, code);
  }
}
const provider = new CountingOtpProvider();
const service = new PhoneVerificationService(asService, config, provider);

/** Hàng mã MỚI NHẤT của một số — để khẳng định trạng thái sau verify. */
async function latestRow(phone: string) {
  return prisma.phoneVerification.findFirst({
    where: { phone: normalizePhone(phone) },
    orderBy: { createdAt: 'desc' },
    select: { status: true, purpose: true, realm: true, provider: true },
  });
}

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
    expect((await latestRow(phone))?.status).toBe(PHONE_VERIFICATION_STATUS.VERIFIED);
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

  maybe('mã của mục đích này KHÔNG đối chiếu được ở mục đích khác', async () => {
    const phone = mkPhone();
    // Mã đăng ký không được dùng để đặt lại mật khẩu (và ngược lại) — ADR 0060.
    const { devCode } = await service.sendOtp(phone, PHONE_VERIFICATION_PURPOSE.REGISTER, C);
    await expect(
      service.verifyOtp(phone, PHONE_VERIFICATION_PURPOSE.PASSWORD_RESET, devCode!, C),
    ).rejects.toMatchObject({ response: { code: API_ERROR_CODE.OTP_INVALID } });
    // Mã vẫn còn nguyên cho đúng mục đích của nó.
    await expect(
      service.verifyOtp(phone, PHONE_VERIFICATION_PURPOSE.REGISTER, devCode!, C),
    ).resolves.toBeUndefined();
  });

  maybe(
    'deliver: false — ghi hàng mã + tính cooldown như thường, nhưng KHÔNG nhắn tin',
    async () => {
      const phone = mkPhone();
      const before = provider.sentTo.length;
      const result = await service.sendOtp(phone, PHONE_VERIFICATION_PURPOSE.PASSWORD_RESET, C, {
        deliver: false,
      });
      expect(result.expiresAt).toBeInstanceOf(Date);
      expect(provider.sentTo.length).toBe(before);
      expect((await latestRow(phone))?.status).toBe(PHONE_VERIFICATION_STATUS.PENDING);
      // Cooldown áp y hệt nhánh có nhắn tin — khác nhau ở đây là một máy dò tài khoản.
      await expect(
        service.sendOtp(phone, PHONE_VERIFICATION_PURPOSE.PASSWORD_RESET, C),
      ).rejects.toMatchObject({ response: { code: API_ERROR_CODE.OTP_COOLDOWN } });
    },
  );

  maybe('mã gửi cho realm partner KHÔNG xác minh được ở realm khách', async () => {
    const phone = mkPhone();
    const { devCode } = await service.sendOtp(phone, BOOKING, P);
    await expect(service.verifyOtp(phone, BOOKING, devCode!, C)).rejects.toMatchObject({
      response: { code: API_ERROR_CODE.OTP_INVALID },
    });
  });

  maybe('cooldown tính theo SỐ trên mọi realm — đổi site không lách được hạn mức SMS', async () => {
    const phone = mkPhone();
    await service.sendOtp(phone, BOOKING, C);
    await expect(service.sendOtp(phone, BOOKING, P)).rejects.toMatchObject({
      response: { code: API_ERROR_CODE.OTP_COOLDOWN },
    });
  });
});

describe('Mã OTP test (OTP_BYPASS_CODE — dev/staging)', () => {
  // Mã test chỉ được nhận khi admin TẮT gửi SMS — nhóm này chạy trong trạng thái đó.
  beforeEach(() => {
    jest.spyOn(service, 'isSmsDisabled').mockResolvedValue(true);
  });
  afterEach(() => {
    jest.restoreAllMocks();
  });

  const BYPASS = '123456';

  /** Chạy `fn` với một bộ env tạm, rồi trả `ENV` về nguyên trạng. */
  async function withEnv(overrides: Record<string, unknown>, fn: () => Promise<void>) {
    const saved = { ...ENV };
    Object.assign(ENV, overrides);
    try {
      await fn();
    } finally {
      for (const k of Object.keys(ENV)) delete ENV[k];
      Object.assign(ENV, saved);
    }
  }

  maybe('chưa gửi mã nào: gõ mã test là xác thực xong, ghi một hàng verified', async () => {
    const phone = mkPhone();
    await withEnv({ OTP_BYPASS_CODE: BYPASS }, async () => {
      await expect(service.verifyOtp(phone, BOOKING, BYPASS, C)).resolves.toBeUndefined();
    });
    expect((await latestRow(phone))?.status).toBe(PHONE_VERIFICATION_STATUS.VERIFIED);

    // Hàng mã test không tốn SMS nào ⇒ không tính cooldown: gửi mã thật ngay sau vẫn được.
    await expect(service.sendOtp(phone, BOOKING, C)).resolves.toBeDefined();
  });

  maybe('đã gửi mã thật: mã test chốt CHÍNH hàng đang chờ, không sinh hàng thứ hai', async () => {
    const phone = mkPhone();
    // Lượt gửi chạy lúc SMS còn BẬT (mã thật); sau đó admin tắt SMS ⇒ mã test được nhận.
    jest.mocked(service.isSmsDisabled).mockResolvedValueOnce(false);
    await service.sendOtp(phone, BOOKING, C);
    await withEnv({ OTP_BYPASS_CODE: BYPASS }, async () => {
      await service.verifyOtp(phone, BOOKING, BYPASS, C);
    });
    const rows = await prisma.phoneVerification.findMany({
      where: { phone: normalizePhone(phone) },
      select: { status: true, provider: true },
    });
    expect(rows).toEqual([{ status: PHONE_VERIFICATION_STATUS.VERIFIED, provider: 'mock' }]);
  });

  maybe('mã thật vẫn qua khi đang bật mã test', async () => {
    const phone = mkPhone();
    await withEnv({ OTP_BYPASS_CODE: BYPASS }, async () => {
      // Mã thật gửi lúc SMS BẬT vẫn qua như thường.
      jest.mocked(service.isSmsDisabled).mockResolvedValueOnce(false);
      const { devCode } = await service.sendOtp(phone, BOOKING, C);
      await expect(service.verifyOtp(phone, BOOKING, devCode!, C)).resolves.toBeUndefined();
    });
  });

  maybe('triển khai production BỎ QUA mã test dù env có khai', async () => {
    const phone = mkPhone();
    await withEnv(
      { NODE_ENV: 'production', APP_ENV: 'production', OTP_BYPASS_CODE: BYPASS },
      async () => {
        await expect(service.verifyOtp(phone, BOOKING, BYPASS, C)).rejects.toMatchObject({
          response: { code: API_ERROR_CODE.OTP_INVALID },
        });
      },
    );
  });

  maybe('máy dev không khai thì mặc định 123456; NODE_ENV=test thì không có mã test', async () => {
    const phone = mkPhone();
    await expect(service.verifyOtp(phone, BOOKING, BYPASS, C)).rejects.toMatchObject({
      response: { code: API_ERROR_CODE.OTP_INVALID },
    });
    await withEnv({ NODE_ENV: 'development' }, async () => {
      await expect(service.verifyOtp(phone, BOOKING, BYPASS, C)).resolves.toBeUndefined();
    });
  });
});

describe('Công tắc gửi SMS OTP (admin — chỉ dev/staging)', () => {
  maybe('TẮT: không gọi nhà mạng, không trả devCode, mã 123456 xác thực được', async () => {
    const off = new PhoneVerificationService(asService, config, provider);
    jest.spyOn(off, 'isSmsDisabled').mockResolvedValue(true);
    const phone = mkPhone();
    const before = provider.sentTo.length;

    const { devCode } = await off.sendOtp(phone, BOOKING, C);

    expect(devCode).toBeNull();
    expect(provider.sentTo.length).toBe(before);
    // Hàng mã không tính vào cooldown/trần gửi (provider `bypass`).
    expect((await latestRow(phone))?.provider).toBe('bypass');
    await expect(off.verifyOtp(phone, BOOKING, '000000', C)).rejects.toMatchObject({
      response: { code: API_ERROR_CODE.OTP_INVALID },
    });
    await expect(off.verifyOtp(phone, BOOKING, '123456', C)).resolves.toBeUndefined();
  });

  maybe('BẬT: gửi qua nhà mạng như thường', async () => {
    const on = new PhoneVerificationService(asService, config, provider);
    jest.spyOn(on, 'isSmsDisabled').mockResolvedValue(false);
    const phone = mkPhone();
    const before = provider.sentTo.length;

    const { devCode } = await on.sendOtp(phone, BOOKING, C);

    expect(provider.sentTo.length).toBe(before + 1);
    expect(devCode).toMatch(/^\d{6}$/);
  });

  it('production LUÔN gửi thật — công tắc không có hiệu lực, không đọc DB', async () => {
    const prodEnv: Record<string, unknown> = {
      ...ENV,
      NODE_ENV: 'production',
      APP_ENV: 'production',
    };
    const prodConfig = {
      get: (k: string) => prodEnv[k],
      getOrThrow: (k: string) => prodEnv[k],
    } as unknown as ConfigService;
    const prod = new PhoneVerificationService(
      {
        platformAppConfig: { findUnique: () => Promise.reject(new Error('không được đọc')) },
      } as never,
      prodConfig,
      provider,
    );
    await expect(prod.isSmsDisabled()).resolves.toBe(false);
  });
});

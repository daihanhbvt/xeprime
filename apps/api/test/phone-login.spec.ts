import type { ConfigService } from '@nestjs/config';
import { createPrismaClient, newId } from '@xeprime/prisma';
import {
  ACCOUNT_REALM,
  API_ERROR_CODE,
  LOGIN_LOCKOUT_POLICY,
  OTP_POLICY,
  PHONE_VERIFICATION_PURPOSE,
  USER_STATUS,
  type AccountRealm,
  type PhoneVerificationPurpose,
} from '@xeprime/types';
import bcrypt from 'bcrypt';
import { AuthService } from '../src/modules/auth/auth.service';
import { LoginThrottleService } from '../src/modules/auth/login-throttle.service';
import { NativeSessionService } from '../src/modules/auth/native-session.service';
import { SessionService } from '../src/modules/auth/session.service';
import { MockOtpProvider } from '../src/modules/phone-verification/otp-provider';
import { PhoneVerificationService } from '../src/modules/phone-verification/phone-verification.service';
import { normalizePhone } from '../src/common/phone';
import type { PrismaService } from '../src/prisma/prisma.service';

/**
 * Tài khoản theo SĐT — ADR 0060. Chạy trên PostgreSQL THẬT, OTP qua provider mock. Kiểm chứng:
 *  - Đăng ký bằng SĐT + mật khẩu CHỈ khi có mã OTP `register` đúng; tài khoản ra đời với SĐT đã
 *    xác minh. Sai mã / mã của realm khác / mã của mục đích khác ⇒ không hàng nào được ghi.
 *  - Đăng nhập ở realm khách/partner CHỈ bằng SĐT: email bị từ chối (`PHONE_LOGIN_REQUIRED`) kể cả
 *    khi có tài khoản mang email đó. Realm quản trị vẫn đăng nhập bằng email.
 *  - Quên mật khẩu bằng OTP: đổi mật khẩu, KHÔNG phát phiên, không lộ số nào có tài khoản.
 *  - Đăng nhập bằng OTP đã gỡ (`OTP_LOGIN_RETIRED`).
 *  - (ADR 0053) Cùng SĐT ở hai realm là HAI tài khoản, mật khẩu độc lập.
 * Không có DB thì tự skip.
 */
/*
 * Spec này kiểm RANH GIỚI tài khoản (realm, trùng SĐT, khoá) — không kiểm độ mạnh của hash. Cost
 * 12 cố ý tốn ~250ms CPU mỗi phép, và test hai realm làm sáu phép liền nhau: trên runner CI có 4
 * worker giành CPU, riêng phần băm đã chạm mốc 5s. Băm ở cost tối thiểu thì phép so khớp vẫn là
 * bcrypt thật (cost nằm trong chính hash), chỉ bỏ phần CPU không thuộc về điều đang kiểm.
 */
jest.mock('bcrypt', () => {
  const actual = jest.requireActual<typeof import('bcrypt')>('bcrypt');
  return { ...actual, hash: (data: string) => actual.hash(data, 4) };
});

const prisma = createPrismaClient();
const asService = prisma as unknown as PrismaService;

const ENV: Record<string, unknown> = {
  OTP_MODE: 'mock',
  NODE_ENV: 'test',
  OTP_PEPPER: 'test-pepper-phone-login-1234',
  SESSION_JWT_SECRET: 'test-session-secret-phone-login-0123456789',
  SESSION_COOKIE_SECURE: false,
  MOBILE_ACCESS_TTL_MINUTES: 15,
  MOBILE_REFRESH_TTL_DAYS: 60,
  MOBILE_JWT_AUDIENCE: 'xeprime-mobile-test',
};
const config = {
  get: (k: string) => ENV[k],
  getOrThrow: (k: string) => {
    const v = ENV[k];
    if (v === undefined) throw new Error(`missing ${k}`);
    return v;
  },
} as unknown as ConfigService;

const phoneVerification = new PhoneVerificationService(asService, config, new MockOtpProvider());

// Đăng ký / đăng nhập / quên mật khẩu chỉ dùng prisma + OTP — rbac/email/chính sách phí/URL site
// không bị chạm tới.
// Phiên + bộ đếm sai là bảng THẬT (ADR 0076): đổi/đặt lại mật khẩu thu hồi phiên, đăng nhập sai bị khoá.
const webSessions = new SessionService(config, asService);
const nativeSessions = new NativeSessionService(config, asService);
const loginThrottle = new LoginThrottleService(asService);
const auth = new AuthService(
  asService,
  null as never,
  null as never,
  config,
  null as never,
  null as never,
  phoneVerification,
  webSessions,
  nativeSessions,
  loginThrottle,
);
const C = ACCOUNT_REALM.CUSTOMER;
const P = ACCOUNT_REALM.PARTNER;
const REGISTER = PHONE_VERIFICATION_PURPOSE.REGISTER;
const RESET = PHONE_VERIFICATION_PURPOSE.PASSWORD_RESET;

let dbAvailable = false;
const usedPhones = new Set<string>();
const usedEmails = new Set<string>();

let counter = 0;
function mkPhone(): string {
  const n = (Date.now() % 100_000_000) + counter++;
  const phone = `097${String(n % 10_000_000).padStart(7, '0')}`;
  usedPhones.add(normalizePhone(phone));
  return phone;
}

/**
 * Xin một mã OTP qua ĐÚNG đường thật (`otpDeliveryFor` rồi `sendOtp`) và trả mã dev của provider
 * mock. Lùi `created_at` của các hàng mã ra ngoài cooldown 60 giây — spec gửi nhiều mã cho cùng
 * một số trong vài mili-giây, còn cooldown có spec riêng.
 */
async function otpFor(
  phone: string,
  purpose: PhoneVerificationPurpose,
  realm: AccountRealm,
): Promise<string> {
  const { deliver } = await auth.otpDeliveryFor(purpose, phone, realm);
  const { devCode } = await phoneVerification.sendOtp(phone, purpose, realm, { deliver });
  await prisma.phoneVerification.updateMany({
    where: { phone: normalizePhone(phone) },
    data: { createdAt: new Date(Date.now() - 120_000) },
  });
  if (!devCode) throw new Error('provider mock phải trả devCode');
  return devCode;
}

/** Đăng ký đủ thủ tục: xin mã `register` rồi tạo tài khoản. */
async function register(
  phone: string,
  realm: AccountRealm,
  password = 'matkhau123',
  displayName = 'Khách Đăng Ký',
): Promise<string> {
  const code = await otpFor(phone, REGISTER, realm);
  const { userId } = await auth.register({ displayName, phone, password, code }, realm);
  return userId;
}

function wrongCode(code: string): string {
  return code === '000000' ? '111111' : '000000';
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
  if (dbAvailable) {
    const phones = [...usedPhones];
    await prisma.loginThrottle.deleteMany({
      where: {
        identifierHash: {
          in: [...phones, ...usedEmails].map((v) => LoginThrottleService.hashIdentifier(v)),
        },
      },
    });
    // Xoá user theo SĐT/email test → cascade user_identities + password_reset_tokens.
    await prisma.user.deleteMany({
      where: { OR: [{ phone: { in: phones } }, { email: { in: [...usedEmails] } }] },
    });
    await prisma.phoneVerification.deleteMany({ where: { phone: { in: phones } } });
  }
  await prisma.$disconnect();
});

const maybe = (name: string, fn: () => Promise<void>) =>
  it(name, async () => {
    if (!dbAvailable) return;
    await fn();
  });

describe('Đăng ký bằng SĐT + mật khẩu + OTP (ADR 0060)', () => {
  maybe(
    'mã đúng → tài khoản có SĐT ĐÃ XÁC MINH + identity password, đăng nhập được ngay',
    async () => {
      const phone = mkPhone();
      const norm = normalizePhone(phone);
      const userId = await register(phone, C);

      const user = await prisma.user.findUniqueOrThrow({ where: { id: userId } });
      expect(user.phone).toBe(norm);
      expect(user.email).toBeNull();
      expect(user.phoneVerifiedAt).not.toBeNull();
      expect(user.passwordHash).not.toBeNull();
      expect(user.realm).toBe(C);

      const identity = await prisma.userIdentity.findUnique({
        where: {
          realm_provider_providerUserId: { realm: C, provider: 'password', providerUserId: norm },
        },
      });
      expect(identity?.providerPhone).toBe(norm);
      expect((await auth.loginWithPassword(phone, 'matkhau123', C)).userId).toBe(userId);
    },
  );

  maybe('sai mã → OTP_INVALID và KHÔNG có tài khoản nào được tạo', async () => {
    const phone = mkPhone();
    const code = await otpFor(phone, REGISTER, C);
    await expect(
      auth.register(
        { displayName: 'Khách', phone, password: 'matkhau123', code: wrongCode(code) },
        C,
      ),
    ).rejects.toMatchObject({ response: { code: API_ERROR_CODE.OTP_INVALID } });
    expect(await prisma.user.count({ where: { phone: normalizePhone(phone) } })).toBe(0);
  });

  maybe('chưa xin mã nào → OTP_INVALID', async () => {
    const phone = mkPhone();
    await expect(
      auth.register({ displayName: 'Khách', phone, password: 'matkhau123', code: '123456' }, C),
    ).rejects.toMatchObject({ response: { code: API_ERROR_CODE.OTP_INVALID } });
  });

  maybe(
    'xác thực TRƯỚC (tích xanh của form) rồi đăng ký bằng đúng mã đó → tạo được tài khoản',
    async () => {
      for (const realm of [C, P]) {
        const phone = mkPhone();
        const code = await otpFor(phone, REGISTER, realm);
        await phoneVerification.verifyOtp(phone, REGISTER, code, realm, null);
        const { userId } = await auth.register(
          { displayName: 'Chủ xe', phone, password: 'matkhau123', code },
          realm,
        );
        const user = await prisma.user.findUniqueOrThrow({ where: { id: userId } });
        expect(user.realm).toBe(realm);
        expect(user.phoneVerifiedAt).not.toBeNull();
      }
    },
  );

  maybe('đã xác thực trước nhưng gửi mã KHÁC lúc đăng ký → OTP_INVALID', async () => {
    const phone = mkPhone();
    const code = await otpFor(phone, REGISTER, P);
    await phoneVerification.verifyOtp(phone, REGISTER, code, P, null);
    await expect(
      auth.register(
        { displayName: 'Chủ xe', phone, password: 'matkhau123', code: wrongCode(code) },
        P,
      ),
    ).rejects.toMatchObject({ response: { code: API_ERROR_CODE.OTP_INVALID } });
    expect(await prisma.user.count({ where: { phone: normalizePhone(phone) } })).toBe(0);
  });

  maybe('mã đã xác thực trước KHÔNG dùng lại được cho lượt đăng ký thứ hai', async () => {
    const phone = mkPhone();
    const code = await otpFor(phone, REGISTER, P);
    await phoneVerification.verifyOtp(phone, REGISTER, code, P, null);
    await auth.register({ displayName: 'A', phone, password: 'matkhau123', code }, P);
    await expect(
      auth.register({ displayName: 'B', phone, password: 'matkhau123', code }, P),
    ).rejects.toMatchObject({ response: { code: API_ERROR_CODE.PHONE_TAKEN } });
  });

  maybe('mã đã xác thực ở site partner KHÔNG tạo được tài khoản ở site khách', async () => {
    const phone = mkPhone();
    const code = await otpFor(phone, REGISTER, P);
    await phoneVerification.verifyOtp(phone, REGISTER, code, P, null);
    await expect(
      auth.register({ displayName: 'Khách', phone, password: 'matkhau123', code }, C),
    ).rejects.toMatchObject({ response: { code: API_ERROR_CODE.OTP_INVALID } });
  });

  maybe('mã xin ở site partner KHÔNG tạo được tài khoản ở site khách', async () => {
    const phone = mkPhone();
    const code = await otpFor(phone, REGISTER, P);
    await expect(
      auth.register({ displayName: 'Khách', phone, password: 'matkhau123', code }, C),
    ).rejects.toMatchObject({ response: { code: API_ERROR_CODE.OTP_INVALID } });
  });

  maybe('mã của mục đích khác (đặt lại mật khẩu) không dùng để đăng ký được', async () => {
    const phone = mkPhone();
    const code = await otpFor(phone, RESET, C);
    await expect(
      auth.register({ displayName: 'Khách', phone, password: 'matkhau123', code }, C),
    ).rejects.toMatchObject({ response: { code: API_ERROR_CODE.OTP_INVALID } });
  });

  maybe(
    'xin mã đăng ký cho số ĐÃ có tài khoản trong realm → PHONE_TAKEN, trước khi nhắn tin',
    async () => {
      const phone = mkPhone();
      await register(phone, C);
      await expect(auth.otpDeliveryFor(REGISTER, phone, C)).rejects.toMatchObject({
        response: { code: API_ERROR_CODE.PHONE_TAKEN },
      });
      // Realm khác là tài khoản khác — vẫn xin mã được.
      await expect(auth.otpDeliveryFor(REGISTER, phone, P)).resolves.toEqual({ deliver: true });
    },
  );

  maybe(
    'hai lượt đăng ký song song cùng số: lượt sau nhận PHONE_TAKEN sau khi qua mã',
    async () => {
      const phone = mkPhone();
      const code = await otpFor(phone, REGISTER, C);
      await auth.register({ displayName: 'A', phone, password: 'matkhau123', code }, C);
      // Mô phỏng lượt thứ hai đã qua được `send-otp` trước khi lượt đầu ghi xong.
      const code2 = await (async () => {
        const { devCode } = await phoneVerification.sendOtp(phone, REGISTER, C);
        return devCode!;
      })();
      await expect(
        auth.register({ displayName: 'B', phone, password: 'matkhau123', code: code2 }, C),
      ).rejects.toMatchObject({ response: { code: API_ERROR_CODE.PHONE_TAKEN } });
    },
  );

  it('realm quản trị không tự đăng ký — chặn trước khi chạm mã hay DB', async () => {
    await expect(
      auth.register(
        { displayName: 'Giả admin', phone: '0970000000', password: 'matkhau123', code: '123456' },
        ACCOUNT_REALM.PLATFORM,
      ),
    ).rejects.toMatchObject({ response: { code: API_ERROR_CODE.REALM_LOGIN_METHOD_NOT_ALLOWED } });
  });
});

describe('Kiểm thông tin đăng ký TRƯỚC bước nhập mã (`register/check`)', () => {
  maybe('số chưa có tài khoản ⇒ qua, không tạo gì', async () => {
    const phone = mkPhone();
    await expect(auth.checkRegistration(phone, C)).resolves.toBeUndefined();
    expect(await prisma.user.count({ where: { phone: normalizePhone(phone) } })).toBe(0);
  });

  maybe('số đã có tài khoản trong realm ⇒ PHONE_TAKEN; realm khác vẫn qua', async () => {
    const phone = mkPhone();
    await register(phone, C);
    await expect(auth.checkRegistration(phone, C)).rejects.toMatchObject({
      response: { code: API_ERROR_CODE.PHONE_TAKEN },
    });
    await expect(auth.checkRegistration(phone, P)).resolves.toBeUndefined();
  });

  it('realm quản trị không tự đăng ký', async () => {
    await expect(
      auth.checkRegistration('0970000000', ACCOUNT_REALM.PLATFORM),
    ).rejects.toMatchObject({ response: { code: API_ERROR_CODE.REALM_LOGIN_METHOD_NOT_ALLOWED } });
  });
});

describe('Đăng nhập chỉ bằng SĐT ở site khách / partner (ADR 0060)', () => {
  maybe('email bị từ chối PHONE_LOGIN_REQUIRED kể cả khi có tài khoản mang email đó', async () => {
    const phone = mkPhone();
    const userId = await register(phone, C);
    const email = `legacy-${userId.toLowerCase()}@xeprime.test`;
    usedEmails.add(email);
    await prisma.user.update({ where: { id: userId }, data: { email } });

    await expect(auth.loginWithPassword(email, 'matkhau123', C)).rejects.toMatchObject({
      response: { code: API_ERROR_CODE.PHONE_LOGIN_REQUIRED },
    });
    await expect(auth.loginWithPassword(email, 'matkhau123', P)).rejects.toMatchObject({
      response: { code: API_ERROR_CODE.PHONE_LOGIN_REQUIRED },
    });
    // Cùng tài khoản, đi bằng SĐT thì vào được.
    expect((await auth.loginWithPassword(phone, 'matkhau123', C)).userId).toBe(userId);
  });

  maybe('site quản trị vẫn đăng nhập bằng email + mật khẩu', async () => {
    const email = `admin-${newId().toLowerCase()}@xeprime.test`;
    usedEmails.add(email);
    const id = newId();
    await prisma.user.create({
      data: {
        id,
        realm: ACCOUNT_REALM.PLATFORM,
        email,
        displayName: 'Nhân sự nền tảng',
        passwordHash: await bcrypt.hash('matkhau123', 4),
        status: USER_STATUS.ACTIVE,
      },
    });
    expect((await auth.loginWithPassword(email, 'matkhau123', ACCOUNT_REALM.PLATFORM)).userId).toBe(
      id,
    );
  });

  maybe('SĐT gõ có dấu cách/chấm/ngoặc vẫn là cùng một số', async () => {
    const phone = mkPhone();
    const userId = await register(phone, C);
    const spaced = `(${phone.slice(0, 4)}) ${phone.slice(4, 7)}.${phone.slice(7)}`;
    expect((await auth.loginWithPassword(spaced, 'matkhau123', C)).userId).toBe(userId);
  });

  maybe('sai mật khẩu và số không có tài khoản trả CÙNG một lỗi', async () => {
    const phone = mkPhone();
    await register(phone, C);
    await expect(auth.loginWithPassword(phone, 'saibet123', C)).rejects.toMatchObject({
      response: { code: API_ERROR_CODE.INVALID_CREDENTIALS },
    });
    await expect(auth.loginWithPassword(mkPhone(), 'matkhau123', C)).rejects.toMatchObject({
      response: { code: API_ERROR_CODE.INVALID_CREDENTIALS },
    });
  });

  maybe(
    'tài khoản không có mật khẩu (Google/Facebook, OTP thời trước) không đăng nhập bằng mật khẩu',
    async () => {
      const phone = mkPhone();
      await prisma.user.create({
        data: {
          id: newId(),
          realm: C,
          phone: normalizePhone(phone),
          phoneVerifiedAt: new Date(),
          displayName: 'Khách OTP cũ',
          status: USER_STATUS.ACTIVE,
        },
      });
      await expect(auth.loginWithPassword(phone, 'matkhau123', C)).rejects.toMatchObject({
        response: { code: API_ERROR_CODE.INVALID_CREDENTIALS },
      });
    },
  );
});

describe('Đăng nhập bằng OTP đã gỡ', () => {
  it('xin mã purpose=login → 410 OTP_LOGIN_RETIRED, không nhắn tin', async () => {
    await expect(
      auth.otpDeliveryFor(PHONE_VERIFICATION_PURPOSE.LOGIN, '0970000001', C),
    ).rejects.toMatchObject({
      status: 410,
      response: { code: API_ERROR_CODE.OTP_LOGIN_RETIRED },
    });
  });
});

describe('Quên mật khẩu bằng SĐT (ADR 0060)', () => {
  maybe(
    'mã đúng → mật khẩu mới dùng được, mật khẩu cũ hết; link email cũ mất hiệu lực',
    async () => {
      const phone = mkPhone();
      const userId = await register(phone, C, 'matkhau-cu-1');
      await prisma.passwordResetToken.create({
        data: {
          id: newId(),
          userId,
          tokenHash: `test-${newId()}`,
          expiresAt: new Date(Date.now() + 3_600_000),
        },
      });

      const code = await otpFor(phone, RESET, C);
      await auth.resetPasswordWithOtp(phone, code, 'matkhau-moi-2', C);

      expect((await auth.loginWithPassword(phone, 'matkhau-moi-2', C)).userId).toBe(userId);
      await expect(auth.loginWithPassword(phone, 'matkhau-cu-1', C)).rejects.toMatchObject({
        response: { code: API_ERROR_CODE.INVALID_CREDENTIALS },
      });
      expect(await prisma.passwordResetToken.count({ where: { userId, usedAt: null } })).toBe(0);
    },
  );

  maybe('mã đã dùng để đặt lại một lần thì không đặt lại được lần nữa', async () => {
    const phone = mkPhone();
    await register(phone, C, 'matkhau-cu-1');
    const code = await otpFor(phone, RESET, C);
    await auth.resetPasswordWithOtp(phone, code, 'matkhau-moi-2', C);

    await expect(auth.resetPasswordWithOtp(phone, code, 'matkhau-moi-3', C)).rejects.toMatchObject({
      response: { code: API_ERROR_CODE.OTP_INVALID },
    });
    expect(await auth.loginWithPassword(phone, 'matkhau-moi-2', C)).toBeDefined();
  });

  maybe(
    'web hai bước: xác minh mã ở màn "Nhập mã OTP" rồi đặt mật khẩu bằng CÙNG mã — một lần duy nhất',
    async () => {
      const phone = mkPhone();
      const userId = await register(phone, C, 'matkhau-cu-1');
      const code = await otpFor(phone, RESET, C);

      await phoneVerification.verifyOtp(phone, RESET, code, C, null);
      await auth.resetPasswordWithOtp(phone, code, 'matkhau-moi-2', C);
      expect((await auth.loginWithPassword(phone, 'matkhau-moi-2', C)).userId).toBe(userId);

      await expect(
        auth.resetPasswordWithOtp(phone, code, 'matkhau-moi-3', C),
      ).rejects.toMatchObject({ response: { code: API_ERROR_CODE.OTP_INVALID } });
    },
  );

  maybe(
    'mã đã xác minh quá cửa sổ 10 phút: OTP_EXPIRED (gửi lại mã), mật khẩu không đổi',
    async () => {
      const phone = mkPhone();
      await register(phone, C, 'matkhau-cu-1');
      const code = await otpFor(phone, RESET, C);
      await phoneVerification.verifyOtp(phone, RESET, code, C, null);
      await prisma.phoneVerification.updateMany({
        where: { phone: normalizePhone(phone), purpose: RESET },
        data: { verifiedAt: new Date(Date.now() - 11 * 60_000) },
      });

      await expect(
        auth.resetPasswordWithOtp(phone, code, 'matkhau-moi-2', C),
      ).rejects.toMatchObject({
        response: { code: API_ERROR_CODE.OTP_EXPIRED },
      });
      expect(await auth.loginWithPassword(phone, 'matkhau-cu-1', C)).toBeDefined();
    },
  );

  maybe(
    'mã ĐÃ xác minh vẫn bị đếm lần đoán sai: chạm trần thì khoá, mã đúng cũng hết dùng được',
    async () => {
      const phone = mkPhone();
      await register(phone, C, 'matkhau-cu-1');
      const code = await otpFor(phone, RESET, C);
      await phoneVerification.verifyOtp(phone, RESET, code, C, null);

      const wrong = wrongCode(code);
      for (let i = 1; i < OTP_POLICY.MAX_ATTEMPTS; i++) {
        await expect(
          auth.resetPasswordWithOtp(phone, wrong, 'matkhau-moi-2', C),
        ).rejects.toMatchObject({ response: { code: API_ERROR_CODE.OTP_INVALID } });
      }
      await expect(
        auth.resetPasswordWithOtp(phone, wrong, 'matkhau-moi-2', C),
      ).rejects.toMatchObject({ response: { code: API_ERROR_CODE.OTP_LOCKED } });

      await expect(
        auth.resetPasswordWithOtp(phone, code, 'matkhau-moi-2', C),
      ).rejects.toMatchObject({
        response: { code: API_ERROR_CODE.OTP_INVALID },
      });
      expect(await auth.loginWithPassword(phone, 'matkhau-cu-1', C)).toBeDefined();
    },
  );

  maybe('đã xác minh một mã rồi xin mã MỚI: mã mới (đang chờ) vẫn đặt lại được', async () => {
    const phone = mkPhone();
    const userId = await register(phone, C, 'matkhau-cu-1');
    const first = await otpFor(phone, RESET, C);
    await phoneVerification.verifyOtp(phone, RESET, first, C, null);
    let second = await otpFor(phone, RESET, C);
    // Hai mã ngẫu nhiên trùng nhau thì xin lại — test cần hai mã KHÁC nhau.
    while (second === first) second = await otpFor(phone, RESET, C);

    await auth.resetPasswordWithOtp(phone, second, 'matkhau-moi-2', C);
    expect((await auth.loginWithPassword(phone, 'matkhau-moi-2', C)).userId).toBe(userId);
  });

  maybe('hai lượt đặt lại song song với cùng một mã đã xác minh: đúng MỘT lượt thắng', async () => {
    const phone = mkPhone();
    await register(phone, C, 'matkhau-cu-1');
    const code = await otpFor(phone, RESET, C);
    await phoneVerification.verifyOtp(phone, RESET, code, C, null);

    const results = await Promise.allSettled([
      auth.resetPasswordWithOtp(phone, code, 'matkhau-moi-a1', C),
      auth.resetPasswordWithOtp(phone, code, 'matkhau-moi-b2', C),
    ]);
    expect(results.filter((r) => r.status === 'fulfilled')).toHaveLength(1);
    const rejected = results.find((r) => r.status === 'rejected') as PromiseRejectedResult;
    expect(rejected.reason).toMatchObject({ response: { code: API_ERROR_CODE.OTP_INVALID } });
  });

  maybe(
    'tài khoản cũ chưa có mật khẩu / chưa xác minh SĐT: đặt mật khẩu + đóng dấu xác minh',
    async () => {
      const phone = mkPhone();
      const id = newId();
      await prisma.user.create({
        data: {
          id,
          realm: C,
          phone: normalizePhone(phone),
          displayName: 'Khách cũ',
          status: USER_STATUS.ACTIVE,
        },
      });

      const code = await otpFor(phone, RESET, C);
      await auth.resetPasswordWithOtp(phone, code, 'matkhau123', C);

      const user = await prisma.user.findUniqueOrThrow({ where: { id } });
      expect(user.passwordHash).not.toBeNull();
      expect(user.phoneVerifiedAt).not.toBeNull();
      expect((await auth.loginWithPassword(phone, 'matkhau123', C)).userId).toBe(id);
    },
  );

  maybe(
    'số KHÔNG có tài khoản: xin mã trả như thường nhưng không nhắn; đặt lại → OTP_INVALID',
    async () => {
      const phone = mkPhone();
      expect(await auth.otpDeliveryFor(RESET, phone, C)).toEqual({ deliver: false });
      // Provider mock vẫn trả devCode (dev/staging) — kể cả khi đúng mã đó, không có tài khoản nào
      // để đổi, và lỗi là CÙNG lỗi của một mã sai.
      const code = await otpFor(phone, RESET, C);
      await expect(auth.resetPasswordWithOtp(phone, code, 'matkhau123', C)).rejects.toMatchObject({
        response: { code: API_ERROR_CODE.OTP_INVALID },
      });
      expect(await prisma.user.count({ where: { phone: normalizePhone(phone) } })).toBe(0);
    },
  );

  maybe('tài khoản bị khoá: không nhắn mã, không đặt lại được', async () => {
    const phone = mkPhone();
    await prisma.user.create({
      data: {
        id: newId(),
        realm: C,
        phone: normalizePhone(phone),
        displayName: 'Khoá',
        status: USER_STATUS.LOCKED,
      },
    });
    expect(await auth.otpDeliveryFor(RESET, phone, C)).toEqual({ deliver: false });
  });

  maybe('mã xin ở site partner không đổi được mật khẩu tài khoản khách cùng số', async () => {
    const phone = mkPhone();
    await register(phone, C, 'matkhau-khach-1');
    await register(phone, P, 'matkhau-chuxe-2');

    const partnerCode = await otpFor(phone, RESET, P);
    await expect(
      auth.resetPasswordWithOtp(phone, partnerCode, 'matkhau-moi-3', C),
    ).rejects.toMatchObject({ response: { code: API_ERROR_CODE.OTP_INVALID } });
    expect((await auth.loginWithPassword(phone, 'matkhau-khach-1', C)).userId).toBeDefined();
  });

  it('realm quản trị không đặt lại bằng OTP (đi đường email)', async () => {
    await expect(
      auth.resetPasswordWithOtp('0970000002', '123456', 'matkhau123', ACCOUNT_REALM.PLATFORM),
    ).rejects.toMatchObject({ response: { code: API_ERROR_CODE.REALM_LOGIN_METHOD_NOT_ALLOWED } });
  });
});

describe('Ba không gian tài khoản (ADR 0053)', () => {
  maybe('cùng SĐT đăng ký ở site khách VÀ site partner: hai tài khoản, hai mật khẩu', async () => {
    const phone = mkPhone();
    const customer = await register(phone, C, 'matkhau-khach-1', 'Người A (khách)');
    const partner = await register(phone, P, 'matkhau-chuxe-2', 'Người A (chủ xe)');
    expect(partner).not.toBe(customer);

    // Mỗi site chỉ nhận mật khẩu của tài khoản thuộc nó.
    expect((await auth.loginWithPassword(phone, 'matkhau-khach-1', C)).userId).toBe(customer);
    expect((await auth.loginWithPassword(phone, 'matkhau-chuxe-2', P)).userId).toBe(partner);
    await expect(auth.loginWithPassword(phone, 'matkhau-chuxe-2', C)).rejects.toMatchObject({
      response: { code: API_ERROR_CODE.INVALID_CREDENTIALS },
    });
    await expect(auth.loginWithPassword(phone, 'matkhau-khach-1', P)).rejects.toMatchObject({
      response: { code: API_ERROR_CODE.INVALID_CREDENTIALS },
    });
  });

  maybe('SĐT chỉ có ở site partner thì KHÔNG đăng nhập được ở site khách', async () => {
    const phone = mkPhone();
    await register(phone, P);
    await expect(auth.loginWithPassword(phone, 'matkhau123', C)).rejects.toMatchObject({
      response: { code: API_ERROR_CODE.INVALID_CREDENTIALS },
    });
  });

  maybe('realm của tài khoản BẤT BIẾN — trigger chặn đổi realm', async () => {
    const phone = mkPhone();
    const userId = await register(phone, C);
    await expect(
      prisma.user.update({ where: { id: userId }, data: { realm: P } }),
    ).rejects.toThrow();
  });
});

describe('Đặt mật khẩu lần đầu (tài khoản Google/Facebook)', () => {
  maybe('setPassword: đặt được khi chưa có mật khẩu; đặt lần 2 → CONFLICT', async () => {
    const phone = mkPhone();
    const id = newId();
    await prisma.user.create({
      data: {
        id,
        realm: C,
        phone: normalizePhone(phone),
        phoneVerifiedAt: new Date(),
        displayName: 'Khách Google',
        status: USER_STATUS.ACTIVE,
      },
    });

    await auth.setPassword(id, 'matkhau123');
    expect((await prisma.user.findUniqueOrThrow({ where: { id } })).passwordHash).not.toBeNull();
    await expect(auth.setPassword(id, 'khacnhau123')).rejects.toMatchObject({
      response: { code: API_ERROR_CODE.CONFLICT },
    });
  });
});

describe('Khoá đăng nhập theo định danh (ADR 0076)', () => {
  const max = LOGIN_LOCKOUT_POLICY.MAX_FAILURES[C];

  maybe('sai đủ trần ⇒ LOGIN_TEMPORARILY_LOCKED, kể cả khi lần sau đúng mật khẩu', async () => {
    const phone = mkPhone();
    await register(phone, C);
    for (let i = 1; i < max; i++) {
      await expect(auth.loginWithPassword(phone, 'saibet123', C)).rejects.toMatchObject({
        response: { code: API_ERROR_CODE.INVALID_CREDENTIALS },
      });
    }
    // Lần sai CHẠM trần trả ngay mã khoá — người dùng biết vì sao lần sau bị từ chối.
    await expect(auth.loginWithPassword(phone, 'saibet123', C)).rejects.toMatchObject({
      status: 429,
      response: { code: API_ERROR_CODE.LOGIN_TEMPORARILY_LOCKED },
    });
    await expect(auth.loginWithPassword(phone, 'matkhau123', C)).rejects.toMatchObject({
      response: { code: API_ERROR_CODE.LOGIN_TEMPORARILY_LOCKED },
    });
    // Realm khác là định danh khác — không bị khoá lây.
    await expect(auth.loginWithPassword(phone, 'matkhau123', P)).rejects.toMatchObject({
      response: { code: API_ERROR_CODE.INVALID_CREDENTIALS },
    });
  });

  maybe('số KHÔNG có tài khoản bị khoá y hệt — không lộ ai có tài khoản', async () => {
    const phone = mkPhone();
    for (let i = 1; i < max; i++) {
      await expect(auth.loginWithPassword(phone, 'saibet123', C)).rejects.toMatchObject({
        response: { code: API_ERROR_CODE.INVALID_CREDENTIALS },
      });
    }
    await expect(auth.loginWithPassword(phone, 'saibet123', C)).rejects.toMatchObject({
      response: { code: API_ERROR_CODE.LOGIN_TEMPORARILY_LOCKED },
    });
  });

  maybe('hai lượt sai song song đều được đếm (upsert nguyên tử)', async () => {
    const phone = mkPhone();
    await Promise.allSettled([
      auth.loginWithPassword(phone, 'saibet123', C),
      auth.loginWithPassword(phone, 'saibet123', C),
      auth.loginWithPassword(phone, 'saibet123', C),
    ]);
    const row = await prisma.loginThrottle.findUniqueOrThrow({
      where: {
        realm_identifierHash: {
          realm: C,
          identifierHash: LoginThrottleService.hashIdentifier(normalizePhone(phone)),
        },
      },
    });
    expect(row.failedCount).toBe(3);
  });

  maybe('đăng nhập đúng xoá bộ đếm', async () => {
    const phone = mkPhone();
    await register(phone, C);
    await expect(auth.loginWithPassword(phone, 'saibet123', C)).rejects.toBeDefined();
    await auth.loginWithPassword(phone, 'matkhau123', C);
    expect(
      await prisma.loginThrottle.count({
        where: { identifierHash: LoginThrottleService.hashIdentifier(normalizePhone(phone)) },
      }),
    ).toBe(0);
  });

  maybe('đặt lại mật khẩu bằng OTP mở khoá và giết MỌI phiên web + app', async () => {
    const phone = mkPhone();
    const userId = await register(phone, C, 'matkhau-cu-1');
    const web = await webSessions.issue(userId);
    const app = await nativeSessions.issueSession(userId);
    for (let i = 0; i < max; i++) {
      await auth.loginWithPassword(phone, 'saibet123', C).catch(() => undefined);
    }

    const code = await otpFor(phone, RESET, C);
    await auth.resetPasswordWithOtp(phone, code, 'matkhau-moi-2', C);

    expect((await auth.loginWithPassword(phone, 'matkhau-moi-2', C)).userId).toBe(userId);
    await expect(webSessions.isSessionUsable(web.sessionId, userId)).resolves.toBe(false);
    await expect(nativeSessions.isSessionUsable(app.sessionId, userId)).resolves.toBe(false);
  });
});

describe('Đổi mật khẩu thu hồi các phiên KHÁC (ADR 0076)', () => {
  maybe('giữ phiên đang thao tác, giết phiên web/app còn lại', async () => {
    const phone = mkPhone();
    const userId = await register(phone, C, 'matkhau-cu-1');
    const current = await webSessions.issue(userId);
    const otherWeb = await webSessions.issue(userId);
    const otherApp = await nativeSessions.issueSession(userId);

    await auth.changePassword(userId, 'matkhau-cu-1', 'matkhau-moi-2', {
      sessionId: current.sessionId,
      transport: 'cookie',
    });

    await expect(webSessions.isSessionUsable(current.sessionId, userId)).resolves.toBe(true);
    await expect(webSessions.isSessionUsable(otherWeb.sessionId, userId)).resolves.toBe(false);
    await expect(nativeSessions.isSessionUsable(otherApp.sessionId, userId)).resolves.toBe(false);
  });

  maybe('đổi từ app: giữ phiên app hiện tại, giết mọi phiên web', async () => {
    const phone = mkPhone();
    const userId = await register(phone, C, 'matkhau-cu-1');
    const web = await webSessions.issue(userId);
    const app = await nativeSessions.issueSession(userId);

    await auth.changePassword(userId, 'matkhau-cu-1', 'matkhau-moi-2', {
      sessionId: app.sessionId,
      transport: 'bearer',
    });

    await expect(nativeSessions.isSessionUsable(app.sessionId, userId)).resolves.toBe(true);
    await expect(webSessions.isSessionUsable(web.sessionId, userId)).resolves.toBe(false);
  });
});

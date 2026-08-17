import type { ConfigService } from '@nestjs/config';
import { createPrismaClient, newId } from '@xeprime/prisma';
import { API_ERROR_CODE, USER_STATUS } from '@xeprime/types';
import { AuthService } from '../src/modules/auth/auth.service';
import { normalizePhone } from '../src/common/phone';
import type { PrismaService } from '../src/prisma/prisma.service';

/**
 * Tài khoản theo SĐT: đăng ký mật khẩu và `resolveOrCreateUserByPhone` — nền của đăng nhập OTP
 * + luồng đặt xe của khách vãng lai. Chạy trên PostgreSQL THẬT. Kiểm chứng bất biến:
 *  - SĐT mới → tạo user (passwordHash null, phone_verified_at set, identity provider phone_otp).
 *  - SĐT đã có → KHÔNG tạo trùng, trả cùng userId (users.phone @unique).
 *  - Tài khoản bị khoá → ACCOUNT_LOCKED.
 * Không có DB thì tự skip.
 */
const prisma = createPrismaClient();
const asService = prisma as unknown as PrismaService;

const config = {
  get: () => undefined,
  getOrThrow: (k: string) => {
    throw new Error(`missing ${k}`);
  },
} as unknown as ConfigService;

// resolveOrCreateUserByPhone chỉ dùng this.prisma — verifier/rbac/email không được chạm tới.
const auth = new AuthService(asService, null as never, null as never, null as never, config);

let dbAvailable = false;
const usedPhones = new Set<string>();

let counter = 0;
function mkPhone(): string {
  const n = (Date.now() % 100_000_000) + counter++;
  const phone = `097${String(n % 10_000_000).padStart(7, '0')}`;
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
    // Xoá user theo SĐT test → cascade user_identities. phone_verifications SetNull (không tạo ở đây).
    await prisma.user.deleteMany({ where: { phone: { in: [...usedPhones] } } });
  }
  await prisma.$disconnect();
});

const maybe = (name: string, fn: () => Promise<void>) =>
  it(name, async () => {
    if (!dbAvailable) return;
    await fn();
  });

describe('Phone + password registration', () => {
  maybe('đăng ký lưu SĐT chuẩn hoá + identity password và đăng nhập được ngay', async () => {
    const phone = mkPhone();
    const norm = normalizePhone(phone);
    const { userId } = await auth.register({
      displayName: 'Khách Đăng Ký',
      phone,
      password: 'matkhau123',
    });

    const user = await prisma.user.findUniqueOrThrow({ where: { id: userId } });
    expect(user.phone).toBe(norm);
    expect(user.email).toBeNull();
    expect(user.phoneVerifiedAt).toBeNull();
    expect(user.passwordHash).not.toBeNull();

    const identity = await prisma.userIdentity.findUnique({
      where: { provider_providerUserId: { provider: 'password', providerUserId: norm } },
    });
    expect(identity?.providerPhone).toBe(norm);
    expect((await auth.loginWithPassword(phone, 'matkhau123')).userId).toBe(userId);
  });

  maybe('không cho đăng ký trùng cùng SĐT', async () => {
    const phone = mkPhone();
    await auth.register({ displayName: 'Khách A', phone, password: 'matkhau123' });

    await expect(
      auth.register({ displayName: 'Khách B', phone, password: 'matkhau123' }),
    ).rejects.toMatchObject({ response: { code: API_ERROR_CODE.PHONE_TAKEN } });
  });
});

describe('Passwordless phone account (resolveOrCreateUserByPhone)', () => {
  maybe('SĐT mới → tạo user passwordless + identity phone_otp', async () => {
    const phone = mkPhone();
    const norm = normalizePhone(phone);
    const { userId, created } = await auth.resolveOrCreateUserByPhone(phone, 'Khách Test');
    expect(created).toBe(true);

    const user = await prisma.user.findUniqueOrThrow({ where: { id: userId } });
    expect(user.phone).toBe(norm);
    expect(user.phoneVerifiedAt).not.toBeNull();
    expect(user.passwordHash).toBeNull();
    expect(user.displayName).toBe('Khách Test');
    expect(user.status).toBe(USER_STATUS.ACTIVE);

    const identity = await prisma.userIdentity.findUnique({
      where: { provider_providerUserId: { provider: 'phone_otp', providerUserId: norm } },
    });
    expect(identity?.userId).toBe(userId);
  });

  maybe('SĐT đã có → KHÔNG tạo trùng, trả cùng userId', async () => {
    const phone = mkPhone();
    const first = await auth.resolveOrCreateUserByPhone(phone);
    expect(first.created).toBe(true);

    const second = await auth.resolveOrCreateUserByPhone(phone, 'Tên khác');
    expect(second.created).toBe(false);
    expect(second.userId).toBe(first.userId);

    const count = await prisma.user.count({ where: { phone: normalizePhone(phone) } });
    expect(count).toBe(1);
  });

  maybe('SĐT chưa nhập tên → displayName mặc định "Khách <4 số cuối>"', async () => {
    const phone = mkPhone();
    const { userId } = await auth.resolveOrCreateUserByPhone(phone);
    const user = await prisma.user.findUniqueOrThrow({ where: { id: userId } });
    expect(user.displayName).toBe(`Khách ${normalizePhone(phone).slice(-4)}`);
  });

  maybe('setPassword: đặt được khi chưa có mật khẩu; đặt lần 2 → CONFLICT', async () => {
    const phone = mkPhone();
    const { userId } = await auth.resolveOrCreateUserByPhone(phone);
    expect(
      (await prisma.user.findUniqueOrThrow({ where: { id: userId } })).passwordHash,
    ).toBeNull();

    await auth.setPassword(userId, 'matkhau123');
    expect(
      (await prisma.user.findUniqueOrThrow({ where: { id: userId } })).passwordHash,
    ).not.toBeNull();

    await expect(auth.setPassword(userId, 'khacnhau123')).rejects.toMatchObject({
      response: { code: API_ERROR_CODE.CONFLICT },
    });
  });

  maybe(
    'đăng nhập bằng SĐT + mật khẩu (sau khi đã đặt); sai mật khẩu → INVALID_CREDENTIALS',
    async () => {
      const phone = mkPhone();
      const { userId } = await auth.resolveOrCreateUserByPhone(phone);
      await auth.setPassword(userId, 'matkhau123');

      // Định danh là SĐT (không có '@') → tra theo users.phone.
      const ok = await auth.loginWithPassword(phone, 'matkhau123');
      expect(ok.userId).toBe(userId);

      await expect(auth.loginWithPassword(phone, 'saibet123')).rejects.toMatchObject({
        response: { code: API_ERROR_CODE.INVALID_CREDENTIALS },
      });
    },
  );

  maybe('tài khoản bị khoá → ACCOUNT_LOCKED', async () => {
    const phone = mkPhone();
    const norm = normalizePhone(phone);
    await prisma.user.create({
      data: {
        id: newId(),
        phone: norm,
        displayName: 'Khoá',
        status: USER_STATUS.LOCKED,
      },
    });
    await expect(auth.resolveOrCreateUserByPhone(phone)).rejects.toMatchObject({
      response: { code: API_ERROR_CODE.ACCOUNT_LOCKED },
    });
  });
});

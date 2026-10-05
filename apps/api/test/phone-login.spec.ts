import type { ConfigService } from '@nestjs/config';
import { createPrismaClient, newId } from '@xeprime/prisma';
import { ACCOUNT_REALM, API_ERROR_CODE, USER_STATUS } from '@xeprime/types';
import { AuthService } from '../src/modules/auth/auth.service';
import { normalizePhone } from '../src/common/phone';
import type { PrismaService } from '../src/prisma/prisma.service';

/**
 * Tài khoản theo SĐT: đăng ký mật khẩu và `resolveOrCreateUserByPhone` — nền của đăng nhập OTP
 * + luồng đặt xe của khách vãng lai. Chạy trên PostgreSQL THẬT. Kiểm chứng bất biến:
 *  - SĐT mới → tạo user (passwordHash null, phone_verified_at set, identity provider phone_otp).
 *  - SĐT đã có → KHÔNG tạo trùng, trả cùng userId (unique (realm, phone)).
 *  - Tài khoản bị khoá → ACCOUNT_LOCKED.
 *  - (ADR 0053) Cùng SĐT ở hai realm là HAI tài khoản, mật khẩu độc lập; realm quản trị không tự
 *    đăng ký và không vào bằng OTP.
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

// resolveOrCreateUserByPhone chỉ dùng this.prisma — rbac/email/chính sách phí/URL site không bị
// chạm tới.
const auth = new AuthService(
  asService,
  null as never,
  null as never,
  config,
  null as never,
  null as never,
);
const C = ACCOUNT_REALM.CUSTOMER;
const P = ACCOUNT_REALM.PARTNER;

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
    const { userId } = await auth.register(
      { displayName: 'Khách Đăng Ký', phone, password: 'matkhau123' },
      C,
    );

    const user = await prisma.user.findUniqueOrThrow({ where: { id: userId } });
    expect(user.phone).toBe(norm);
    expect(user.email).toBeNull();
    expect(user.phoneVerifiedAt).toBeNull();
    expect(user.passwordHash).not.toBeNull();

    const identity = await prisma.userIdentity.findUnique({
      where: {
        realm_provider_providerUserId: { realm: C, provider: 'password', providerUserId: norm },
      },
    });
    expect(identity?.providerPhone).toBe(norm);
    expect(user.realm).toBe(C);
    expect((await auth.loginWithPassword(phone, 'matkhau123', C)).userId).toBe(userId);
  });

  maybe('không cho đăng ký trùng cùng SĐT', async () => {
    const phone = mkPhone();
    await auth.register({ displayName: 'Khách A', phone, password: 'matkhau123' }, C);

    await expect(
      auth.register({ displayName: 'Khách B', phone, password: 'matkhau123' }, C),
    ).rejects.toMatchObject({ response: { code: API_ERROR_CODE.PHONE_TAKEN } });
  });
});

describe('Ba không gian tài khoản (ADR 0053)', () => {
  maybe('cùng SĐT đăng ký ở site khách VÀ site partner: hai tài khoản, hai mật khẩu', async () => {
    const phone = mkPhone();
    const customer = await auth.register(
      { displayName: 'Người A (khách)', phone, password: 'matkhau-khach-1' },
      C,
    );
    const partner = await auth.register(
      { displayName: 'Người A (chủ xe)', phone, password: 'matkhau-chuxe-2' },
      P,
    );
    expect(partner.userId).not.toBe(customer.userId);

    // Mỗi site chỉ nhận mật khẩu của tài khoản thuộc nó.
    expect((await auth.loginWithPassword(phone, 'matkhau-khach-1', C)).userId).toBe(
      customer.userId,
    );
    expect((await auth.loginWithPassword(phone, 'matkhau-chuxe-2', P)).userId).toBe(partner.userId);
    await expect(auth.loginWithPassword(phone, 'matkhau-chuxe-2', C)).rejects.toMatchObject({
      response: { code: API_ERROR_CODE.INVALID_CREDENTIALS },
    });
    await expect(auth.loginWithPassword(phone, 'matkhau-khach-1', P)).rejects.toMatchObject({
      response: { code: API_ERROR_CODE.INVALID_CREDENTIALS },
    });

    // Đặt lại/đổi mật khẩu ở một realm không chạm realm kia.
    const rows = await prisma.user.findMany({
      where: { phone: normalizePhone(phone) },
      select: { realm: true, passwordHash: true },
    });
    expect(rows.map((r) => r.realm).sort()).toEqual([C, P].sort());
    expect(rows[0]?.passwordHash).not.toBe(rows[1]?.passwordHash);
  });

  maybe('SĐT chỉ có ở site partner thì KHÔNG đăng nhập được ở site khách', async () => {
    const phone = mkPhone();
    await auth.register({ displayName: 'Chỉ partner', phone, password: 'matkhau123' }, P);
    await expect(auth.loginWithPassword(phone, 'matkhau123', C)).rejects.toMatchObject({
      response: { code: API_ERROR_CODE.INVALID_CREDENTIALS },
    });
  });

  maybe(
    'OTP ở site khách tạo tài khoản khách KHÁC, không nhận tài khoản partner cùng số',
    async () => {
      const phone = mkPhone();
      const partner = await auth.register(
        { displayName: 'Chủ xe', phone, password: 'matkhau123' },
        P,
      );
      const viaOtp = await auth.resolveOrCreateUserByPhone(phone, C);
      expect(viaOtp.created).toBe(true);
      expect(viaOtp.userId).not.toBe(partner.userId);
    },
  );

  it('realm quản trị không tự đăng ký và không vào bằng OTP — chặn trước khi ghi', async () => {
    await expect(
      auth.register(
        { displayName: 'Giả admin', phone: '0970000000', password: 'matkhau123' },
        ACCOUNT_REALM.PLATFORM,
      ),
    ).rejects.toMatchObject({ response: { code: API_ERROR_CODE.REALM_LOGIN_METHOD_NOT_ALLOWED } });
    await expect(
      auth.resolveOrCreateUserByPhone('0970000000', ACCOUNT_REALM.PLATFORM),
    ).rejects.toMatchObject({ response: { code: API_ERROR_CODE.REALM_LOGIN_METHOD_NOT_ALLOWED } });
  });

  maybe('realm của tài khoản BẤT BIẾN — trigger chặn đổi realm', async () => {
    const phone = mkPhone();
    const { userId } = await auth.register(
      { displayName: 'Khách cố định', phone, password: 'matkhau123' },
      C,
    );
    await expect(
      prisma.user.update({ where: { id: userId }, data: { realm: P } }),
    ).rejects.toThrow();
  });
});

describe('Passwordless phone account (resolveOrCreateUserByPhone)', () => {
  maybe('SĐT mới → tạo user passwordless + identity phone_otp', async () => {
    const phone = mkPhone();
    const norm = normalizePhone(phone);
    const { userId, created } = await auth.resolveOrCreateUserByPhone(phone, C, 'Khách Test');
    expect(created).toBe(true);

    const user = await prisma.user.findUniqueOrThrow({ where: { id: userId } });
    expect(user.phone).toBe(norm);
    expect(user.phoneVerifiedAt).not.toBeNull();
    expect(user.passwordHash).toBeNull();
    expect(user.displayName).toBe('Khách Test');
    expect(user.status).toBe(USER_STATUS.ACTIVE);

    const identity = await prisma.userIdentity.findUnique({
      where: {
        realm_provider_providerUserId: { realm: C, provider: 'phone_otp', providerUserId: norm },
      },
    });
    expect(identity?.userId).toBe(userId);
  });

  maybe('SĐT đã có → KHÔNG tạo trùng, trả cùng userId', async () => {
    const phone = mkPhone();
    const first = await auth.resolveOrCreateUserByPhone(phone, C);
    expect(first.created).toBe(true);

    const second = await auth.resolveOrCreateUserByPhone(phone, C, 'Tên khác');
    expect(second.created).toBe(false);
    expect(second.userId).toBe(first.userId);

    const count = await prisma.user.count({ where: { phone: normalizePhone(phone) } });
    expect(count).toBe(1);
  });

  maybe('SĐT chưa nhập tên → displayName mặc định "Khách <4 số cuối>"', async () => {
    const phone = mkPhone();
    const { userId } = await auth.resolveOrCreateUserByPhone(phone, C);
    const user = await prisma.user.findUniqueOrThrow({ where: { id: userId } });
    expect(user.displayName).toBe(`Khách ${normalizePhone(phone).slice(-4)}`);
  });

  maybe('setPassword: đặt được khi chưa có mật khẩu; đặt lần 2 → CONFLICT', async () => {
    const phone = mkPhone();
    const { userId } = await auth.resolveOrCreateUserByPhone(phone, C);
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
      const { userId } = await auth.resolveOrCreateUserByPhone(phone, C);
      await auth.setPassword(userId, 'matkhau123');

      // Định danh là SĐT (không có '@') → tra theo users.phone.
      const ok = await auth.loginWithPassword(phone, 'matkhau123', C);
      expect(ok.userId).toBe(userId);

      await expect(auth.loginWithPassword(phone, 'saibet123', C)).rejects.toMatchObject({
        response: { code: API_ERROR_CODE.INVALID_CREDENTIALS },
      });
    },
  );

  maybe('tài khoản bị khoá → ACCOUNT_LOCKED', async () => {
    const phone = mkPhone();
    const norm = normalizePhone(phone);
    await prisma.user.create({
      data: {
        realm: ACCOUNT_REALM.CUSTOMER,
        id: newId(),
        phone: norm,
        displayName: 'Khoá',
        status: USER_STATUS.LOCKED,
      },
    });
    await expect(auth.resolveOrCreateUserByPhone(phone, C)).rejects.toMatchObject({
      response: { code: API_ERROR_CODE.ACCOUNT_LOCKED },
    });
  });
});

import { ConfigService } from '@nestjs/config';
import { ACCOUNT_REALM, API_ERROR_CODE, AUTH_PROVIDER, USER_STATUS } from '@xeprime/types';
import { PrismaService } from '../src/prisma/prisma.service';
import { RbacService } from '../src/modules/rbac/rbac.service';
import { AuthService } from '../src/modules/auth/auth.service';
import { EmailService } from '../src/modules/email/email.service';
import type { RequestRealmService } from '../src/modules/auth/request-realm.service';
import type { PhoneVerificationService } from '../src/modules/phone-verification/phone-verification.service';
import type { VerifiedIdentity } from '../src/modules/auth/social/identity';
import type { FeePoliciesService } from '../src/modules/fee-policies/fee-policies.service';
import type { SessionService } from '../src/modules/auth/session.service';
import type { NativeSessionService } from '../src/modules/auth/native-session.service';
import type { LoginThrottleService } from '../src/modules/auth/login-throttle.service';

/**
 * Luật NỐI TÀI KHOẢN — phần nhạy cảm nhất của đăng nhập mạng xã hội.
 *
 * ADR 0019 đổi NGUỒN của danh tính (Firebase → OAuth do backend chủ trì) nhưng **cố ý không đổi
 * luật này một chữ nào**. Vì vậy 5 kịch bản dưới đây giữ nguyên từ bản chạy trên Firebase: chúng
 * còn xanh nghĩa là việc thay nguồn không kéo theo một thay đổi hành vi nào bị bỏ sót.
 *
 * Khác biệt duy nhất so với bản cũ: gọi thẳng `upsertUserFromIdentity` thay vì đi qua một
 * verifier giả. Danh tính đã được xác minh TRƯỚC khi vào hàm này — đó chính là ranh giới mà
 * `VerifiedIdentity` đặt ra.
 *
 * ADR 0053 thêm MỘT chiều: mọi tra cứu nằm TRONG realm. Cùng một tài khoản Google là hai tài khoản
 * XePrime ở site khách và site partner; site quản trị không nhận đăng nhập mạng xã hội.
 */
const C = ACCOUNT_REALM.CUSTOMER;
const GOOGLE_IDENTITY: VerifiedIdentity = {
  providerUserId: 'google-sub-1',
  provider: AUTH_PROVIDER.GOOGLE,
  email: 'Customer@Example.com',
  emailVerified: true,
  phone: null,
  displayName: 'Khách Google',
  avatarUrl: null,
};

/** Facebook KHÔNG cam kết email đã xác minh — xem `facebook.provider.ts`. */
const FACEBOOK_IDENTITY: VerifiedIdentity = {
  ...GOOGLE_IDENTITY,
  providerUserId: 'fb-app-scoped-1',
  provider: AUTH_PROVIDER.FACEBOOK,
  emailVerified: false,
};

describe('AuthService — nối tài khoản từ danh tính mạng xã hội', () => {
  const prisma = {
    userIdentity: {
      findUnique: jest.fn(),
      create: jest.fn(),
    },
    user: {
      findFirst: jest.fn(),
      create: jest.fn(),
      update: jest.fn(),
    },
    $transaction: jest.fn(),
  };
  let service: AuthService;

  beforeEach(() => {
    jest.clearAllMocks();
    prisma.$transaction.mockImplementation((work: (tx: typeof prisma) => Promise<unknown>) =>
      work(prisma),
    );
    service = new AuthService(
      prisma as unknown as PrismaService,
      {} as RbacService,
      {} as EmailService,
      {} as ConfigService,
      // Spec này không gọi `me()`, nên chính sách phí không bao giờ được đọc tới.
      {} as FeePoliciesService,
      {} as RequestRealmService,
      // Đăng nhập mạng xã hội không đi qua OTP (ADR 0060: OTP chỉ cho đăng ký / quên mật khẩu).
      {} as PhoneVerificationService,
      // Không đổi mật khẩu, không đăng nhập bằng mật khẩu ⇒ không chạm phiên hay bộ đếm sai.
      {} as SessionService,
      {} as NativeSessionService,
      {} as LoginThrottleService,
    );
  });

  it('đăng nhập lại bằng cùng identity không tạo user mới', async () => {
    prisma.userIdentity.findUnique.mockResolvedValue({
      userId: 'USER_1',
      user: { status: USER_STATUS.ACTIVE },
    });

    await expect(service.upsertUserFromIdentity(GOOGLE_IDENTITY, C)).resolves.toEqual({
      userId: 'USER_1',
    });

    expect(prisma.user.update).toHaveBeenCalledWith({
      where: { id: 'USER_1' },
      data: { lastLoginAt: expect.any(Date) },
    });
    expect(prisma.$transaction).not.toHaveBeenCalled();
  });

  it('tra cứu theo (realm, provider, providerUserId) chứ không theo email', async () => {
    prisma.userIdentity.findUnique.mockResolvedValue({
      userId: 'USER_1',
      user: { status: USER_STATUS.ACTIVE },
    });

    await service.upsertUserFromIdentity(GOOGLE_IDENTITY, C);

    // Email đổi được; `sub` thì không. Tra theo email là cách hai người khác nhau bị gộp làm một.
    expect(prisma.userIdentity.findUnique).toHaveBeenCalledWith({
      where: {
        realm_provider_providerUserId: {
          realm: C,
          provider: AUTH_PROVIDER.GOOGLE,
          providerUserId: 'google-sub-1',
        },
      },
      select: { userId: true, user: { select: { status: true } } },
    });
  });

  it('không cho social login mở lại tài khoản đã bị khoá', async () => {
    prisma.userIdentity.findUnique.mockResolvedValue({
      userId: 'USER_LOCKED',
      user: { status: USER_STATUS.LOCKED },
    });

    await expect(service.upsertUserFromIdentity(GOOGLE_IDENTITY, C)).rejects.toMatchObject({
      response: { code: API_ERROR_CODE.ACCOUNT_LOCKED },
    });
    expect(prisma.user.update).not.toHaveBeenCalled();
  });

  it('chỉ tự nối tài khoản cùng email khi provider đã xác minh email', async () => {
    prisma.userIdentity.findUnique.mockResolvedValue(null);
    prisma.user.findFirst.mockResolvedValue({
      id: 'USER_EMAIL',
      status: USER_STATUS.ACTIVE,
      emailVerifiedAt: new Date(),
    });

    await expect(service.upsertUserFromIdentity(GOOGLE_IDENTITY, C)).resolves.toEqual({
      userId: 'USER_EMAIL',
    });
    expect(prisma.user.findFirst).toHaveBeenCalledWith({
      where: { realm: C, email: 'customer@example.com', deletedAt: null },
      select: { id: true, status: true, emailVerifiedAt: true },
    });
    expect(prisma.user.create).not.toHaveBeenCalled();
    expect(prisma.userIdentity.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        userId: 'USER_EMAIL',
        realm: C,
        provider: AUTH_PROVIDER.GOOGLE,
        providerEmail: 'customer@example.com',
      }),
    });
  });

  it('chặn provider chưa xác minh tự nhận email của tài khoản có sẵn', async () => {
    prisma.userIdentity.findUnique.mockResolvedValue(null);
    prisma.user.findFirst.mockResolvedValue({
      id: 'USER_EMAIL',
      status: USER_STATUS.ACTIVE,
      emailVerifiedAt: new Date(),
    });

    await expect(service.upsertUserFromIdentity(FACEBOOK_IDENTITY, C)).rejects.toMatchObject({
      response: { code: API_ERROR_CODE.CONFLICT },
    });
    expect(prisma.$transaction).not.toHaveBeenCalled();
  });

  it('KHÔNG nối Google vào tài khoản có email CHƯA xác minh (chống gieo sẵn tài khoản — ADR 0076)', async () => {
    // Kẻ xấu tạo tài khoản bằng Facebook mang email nạn nhân (email chưa xác minh). Nạn nhân đăng
    // nhập Google cùng email: nối vào là nạn nhân dùng chung tài khoản kẻ xấu còn giữ.
    prisma.userIdentity.findUnique.mockResolvedValue(null);
    prisma.user.findFirst.mockResolvedValue({
      id: 'USER_SEEDED',
      status: USER_STATUS.ACTIVE,
      emailVerifiedAt: null,
    });

    await expect(service.upsertUserFromIdentity(GOOGLE_IDENTITY, C)).rejects.toMatchObject({
      response: { code: API_ERROR_CODE.CONFLICT },
    });
    expect(prisma.$transaction).not.toHaveBeenCalled();
    expect(prisma.userIdentity.create).not.toHaveBeenCalled();
  });

  it('tạo tài khoản mới cho Facebook khi email chưa tồn tại', async () => {
    prisma.userIdentity.findUnique.mockResolvedValue(null);
    prisma.user.findFirst.mockResolvedValue(null);

    const result = await service.upsertUserFromIdentity(FACEBOOK_IDENTITY, C);

    expect(result.userId).toHaveLength(26);
    expect(prisma.user.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        id: result.userId,
        realm: C,
        email: 'customer@example.com',
        // Chưa xác minh ⇒ KHÔNG đóng dấu `emailVerifiedAt`, kể cả khi tạo mới.
        emailVerifiedAt: null,
        status: USER_STATUS.ACTIVE,
      }),
    });
    expect(prisma.userIdentity.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        userId: result.userId,
        provider: AUTH_PROVIDER.FACEBOOK,
      }),
    });
  });

  it('cùng danh tính Google ở site partner tra bằng khoá partner và tạo tài khoản KHÁC', async () => {
    prisma.userIdentity.findUnique.mockResolvedValue(null);
    prisma.user.findFirst.mockResolvedValue(null);

    const result = await service.upsertUserFromIdentity(GOOGLE_IDENTITY, ACCOUNT_REALM.PARTNER);

    expect(prisma.userIdentity.findUnique).toHaveBeenCalledWith(
      expect.objectContaining({
        where: {
          realm_provider_providerUserId: expect.objectContaining({ realm: ACCOUNT_REALM.PARTNER }),
        },
      }),
    );
    // Không nối vào tài khoản khách cùng email — tra email cũng giới hạn trong realm partner.
    expect(prisma.user.findFirst).toHaveBeenCalledWith(
      expect.objectContaining({ where: expect.objectContaining({ realm: ACCOUNT_REALM.PARTNER }) }),
    );
    expect(prisma.user.create).toHaveBeenCalledWith({
      data: expect.objectContaining({ id: result.userId, realm: ACCOUNT_REALM.PARTNER }),
    });
  });

  it('site quản trị không nhận đăng nhập mạng xã hội — chặn trước mọi truy vấn', async () => {
    await expect(
      service.upsertUserFromIdentity(GOOGLE_IDENTITY, ACCOUNT_REALM.PLATFORM),
    ).rejects.toMatchObject({ response: { code: API_ERROR_CODE.REALM_LOGIN_METHOD_NOT_ALLOWED } });
    expect(prisma.userIdentity.findUnique).not.toHaveBeenCalled();
  });
});

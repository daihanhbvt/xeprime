import { ConfigService } from '@nestjs/config';
import { API_ERROR_CODE, USER_STATUS } from '@xeprime/types';
import { PrismaService } from '../src/prisma/prisma.service';
import { RbacService } from '../src/modules/rbac/rbac.service';
import { AuthService } from '../src/modules/auth/auth.service';
import { EmailService } from '../src/modules/auth/email.service';
import { IdTokenVerifier, type VerifiedIdentity } from '../src/modules/auth/token-verifier';

const GOOGLE_IDENTITY: VerifiedIdentity = {
  providerUserId: 'firebase-uid-1',
  provider: 'google.com',
  email: 'Customer@Example.com',
  emailVerified: true,
  phone: null,
  displayName: 'Khách Google',
  avatarUrl: null,
};

describe('AuthService — Firebase social identity', () => {
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
  const verifier = { verify: jest.fn() };
  let service: AuthService;

  beforeEach(() => {
    jest.clearAllMocks();
    verifier.verify.mockResolvedValue(GOOGLE_IDENTITY);
    prisma.$transaction.mockImplementation(
      (work: (tx: typeof prisma) => Promise<unknown>) => work(prisma),
    );
    service = new AuthService(
      prisma as unknown as PrismaService,
      verifier as unknown as IdTokenVerifier,
      {} as RbacService,
      {} as EmailService,
      {} as ConfigService,
    );
  });

  it('đăng nhập lại bằng cùng identity không tạo user mới', async () => {
    prisma.userIdentity.findUnique.mockResolvedValue({
      userId: 'USER_1',
      user: { status: USER_STATUS.ACTIVE },
    });

    await expect(service.upsertUserFromIdToken('id-token')).resolves.toEqual({ userId: 'USER_1' });

    expect(prisma.user.update).toHaveBeenCalledWith({
      where: { id: 'USER_1' },
      data: { lastLoginAt: expect.any(Date) },
    });
    expect(prisma.$transaction).not.toHaveBeenCalled();
  });

  it('không cho social login mở lại tài khoản đã bị khoá', async () => {
    prisma.userIdentity.findUnique.mockResolvedValue({
      userId: 'USER_LOCKED',
      user: { status: USER_STATUS.LOCKED },
    });

    await expect(service.upsertUserFromIdToken('id-token')).rejects.toMatchObject({
      response: { code: API_ERROR_CODE.ACCOUNT_LOCKED },
    });
    expect(prisma.user.update).not.toHaveBeenCalled();
  });

  it('chỉ tự nối tài khoản cùng email khi provider đã xác minh email', async () => {
    prisma.userIdentity.findUnique.mockResolvedValue(null);
    prisma.user.findFirst.mockResolvedValue({ id: 'USER_EMAIL', status: USER_STATUS.ACTIVE });

    await expect(service.upsertUserFromIdToken('id-token')).resolves.toEqual({
      userId: 'USER_EMAIL',
    });
    expect(prisma.user.findFirst).toHaveBeenCalledWith({
      where: { email: 'customer@example.com', deletedAt: null },
      select: { id: true, status: true },
    });
    expect(prisma.user.create).not.toHaveBeenCalled();
    expect(prisma.userIdentity.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        userId: 'USER_EMAIL',
        provider: 'google.com',
        providerEmail: 'customer@example.com',
      }),
    });
  });

  it('chặn provider chưa xác minh tự nhận email của tài khoản có sẵn', async () => {
    verifier.verify.mockResolvedValue({
      ...GOOGLE_IDENTITY,
      provider: 'facebook.com',
      emailVerified: false,
    });
    prisma.userIdentity.findUnique.mockResolvedValue(null);
    prisma.user.findFirst.mockResolvedValue({ id: 'USER_EMAIL', status: USER_STATUS.ACTIVE });

    await expect(service.upsertUserFromIdToken('id-token')).rejects.toMatchObject({
      response: { code: API_ERROR_CODE.CONFLICT },
    });
    expect(prisma.$transaction).not.toHaveBeenCalled();
  });

  it('tạo tài khoản mới cho Facebook khi email chưa tồn tại', async () => {
    verifier.verify.mockResolvedValue({
      ...GOOGLE_IDENTITY,
      provider: 'facebook.com',
      emailVerified: false,
    });
    prisma.userIdentity.findUnique.mockResolvedValue(null);
    prisma.user.findFirst.mockResolvedValue(null);

    const result = await service.upsertUserFromIdToken('id-token');

    expect(result.userId).toHaveLength(26);
    expect(prisma.user.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        id: result.userId,
        email: 'customer@example.com',
        emailVerifiedAt: null,
        status: USER_STATUS.ACTIVE,
      }),
    });
    expect(prisma.userIdentity.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        userId: result.userId,
        provider: 'facebook.com',
      }),
    });
  });
});

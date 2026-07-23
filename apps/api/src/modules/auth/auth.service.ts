import {
  BadRequestException,
  ConflictException,
  Injectable,
  UnauthorizedException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { newId } from '@xeprime/prisma';
import { API_ERROR_CODE, MEMBERSHIP_STATUS, USER_STATUS, type Permission } from '@xeprime/types';
import bcrypt from 'bcryptjs';
import { createHash, randomBytes } from 'node:crypto';
import { PrismaService } from '../../prisma/prisma.service';
import { RbacService } from '../rbac/rbac.service';
import { EmailService } from './email.service';
import { IdTokenVerifier } from './token-verifier';
import type { MeDto } from './dto/auth.dto';

const BCRYPT_ROUNDS = 12;
const RESET_TOKEN_TTL_MS = 60 * 60 * 1000; // 1 giờ

@Injectable()
export class AuthService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly verifier: IdTokenVerifier,
    private readonly rbac: RbacService,
    private readonly email: EmailService,
    private readonly config: ConfigService,
  ) {}

  // ---- Đăng ký / đăng nhập email-mật khẩu -----------------------------------

  /**
   * Đăng ký bằng email + mật khẩu. Email lưu chữ thường để tra cứu nhất quán.
   * Tạo user + identity(provider='password') trong một transaction.
   */
  async register(input: {
    email: string;
    password: string;
    displayName: string;
  }): Promise<{ userId: string }> {
    const email = input.email.trim().toLowerCase();

    const existing = await this.prisma.user.findFirst({
      where: { email, deletedAt: null },
      select: { id: true },
    });
    if (existing) {
      throw new ConflictException({
        code: API_ERROR_CODE.EMAIL_TAKEN,
        message: 'Email này đã được đăng ký',
      });
    }

    const passwordHash = await bcrypt.hash(input.password, BCRYPT_ROUNDS);
    const userId = newId();

    await this.prisma.$transaction(async (tx) => {
      await tx.user.create({
        data: {
          id: userId,
          email,
          displayName: input.displayName.trim(),
          passwordHash,
          status: USER_STATUS.ACTIVE,
          lastLoginAt: new Date(),
        },
      });
      await tx.userIdentity.create({
        data: {
          id: newId(),
          userId,
          provider: 'password',
          providerUserId: email,
          providerEmail: email,
        },
      });
    });

    return { userId };
  }

  /**
   * Đăng nhập email + mật khẩu.
   *
   * Lỗi luôn chung chung (INVALID_CREDENTIALS) dù sai email hay sai mật khẩu — không tiết lộ
   * email nào tồn tại. So khớp bcrypt kể cả khi không có user (giảm timing attack).
   */
  async loginWithPassword(rawEmail: string, password: string): Promise<{ userId: string }> {
    const email = rawEmail.trim().toLowerCase();
    const user = await this.prisma.user.findFirst({
      where: { email, deletedAt: null },
      select: { id: true, passwordHash: true, status: true },
    });

    const hash = user?.passwordHash ?? '$2a$12$0000000000000000000000000000000000000000000000000000';
    const ok = await bcrypt.compare(password, hash);

    if (!user || !user.passwordHash || !ok) {
      throw new UnauthorizedException({
        code: API_ERROR_CODE.INVALID_CREDENTIALS,
        message: 'Email hoặc mật khẩu không đúng',
      });
    }
    if (user.status !== USER_STATUS.ACTIVE) {
      throw new UnauthorizedException({
        code: API_ERROR_CODE.ACCOUNT_LOCKED,
        message: 'Tài khoản đã bị khoá',
      });
    }

    await this.prisma.user.update({ where: { id: user.id }, data: { lastLoginAt: new Date() } });
    return { userId: user.id };
  }

  // ---- Quên / đặt lại mật khẩu ----------------------------------------------

  private hashToken(token: string): string {
    // Token là ngẫu nhiên entropy cao nên sha256 đủ; bcrypt dành cho mật khẩu entropy thấp.
    return createHash('sha256').update(token).digest('hex');
  }

  /**
   * Yêu cầu đặt lại mật khẩu. LUÔN trả về như nhau dù email có tồn tại hay không — không để
   * kẻ tấn công dò email nào đã đăng ký.
   */
  async requestPasswordReset(rawEmail: string): Promise<void> {
    const email = rawEmail.trim().toLowerCase();
    const user = await this.prisma.user.findFirst({
      where: { email, deletedAt: null, status: USER_STATUS.ACTIVE },
      select: { id: true, displayName: true, email: true },
    });
    if (!user || !user.email) return;

    const token = randomBytes(32).toString('hex');
    const tokenHash = this.hashToken(token);

    await this.prisma.$transaction(async (tx) => {
      // Huỷ mọi token chưa dùng trước đó của user — một link mới vô hiệu link cũ.
      await tx.passwordResetToken.updateMany({
        where: { userId: user.id, usedAt: null },
        data: { usedAt: new Date() },
      });
      await tx.passwordResetToken.create({
        data: {
          id: newId(),
          userId: user.id,
          tokenHash,
          expiresAt: new Date(Date.now() + RESET_TOKEN_TTL_MS),
        },
      });
    });

    const webUrl = this.config.getOrThrow<string>('APP_WEB_URL').replace(/\/+$/, '');
    const resetUrl = `${webUrl}/reset-password?token=${token}`;
    await this.email.sendPasswordReset(user.email, user.displayName, resetUrl);
  }

  /** Đặt mật khẩu mới từ token. Token dùng một lần và phải còn hạn. */
  async resetPassword(token: string, newPassword: string): Promise<void> {
    const tokenHash = this.hashToken(token);
    const record = await this.prisma.passwordResetToken.findFirst({
      where: { tokenHash, usedAt: null, expiresAt: { gt: new Date() } },
      select: { id: true, userId: true },
    });
    if (!record) {
      throw new BadRequestException({
        code: API_ERROR_CODE.INVALID_RESET_TOKEN,
        message: 'Liên kết đặt lại không hợp lệ hoặc đã hết hạn',
      });
    }

    const passwordHash = await bcrypt.hash(newPassword, BCRYPT_ROUNDS);
    await this.prisma.$transaction(async (tx) => {
      await tx.user.update({ where: { id: record.userId }, data: { passwordHash } });
      // Đánh dấu dùng + huỷ mọi token khác của user.
      await tx.passwordResetToken.updateMany({
        where: { userId: record.userId, usedAt: null },
        data: { usedAt: new Date() },
      });
    });
  }

  /**
   * Đổi ID token của provider lấy user trong DB — ADR 0002 bước 2.
   *
   * Idempotent: đăng nhập lại bằng cùng provider không tạo user mới. Khoá tra cứu là
   * `(provider, providerUserId)` chứ không phải email — email đổi được, và tin email
   * để nhận diện là cách hai tài khoản khác nhau bị gộp làm một.
   */
  async upsertUserFromIdToken(idToken: string): Promise<{ userId: string }> {
    const identity = await this.verifier.verify(idToken);

    const existing = await this.prisma.userIdentity.findUnique({
      where: {
        provider_providerUserId: {
          provider: identity.provider,
          providerUserId: identity.providerUserId,
        },
      },
      select: { userId: true },
    });

    if (existing) {
      await this.prisma.user.update({
        where: { id: existing.userId },
        data: { lastLoginAt: new Date() },
      });
      return { userId: existing.userId };
    }

    // Chưa có identity: nối vào user cùng email nếu có, để một người đăng nhập bằng
    // Google rồi Facebook không thành hai tài khoản.
    const linkedUser = identity.email
      ? await this.prisma.user.findFirst({
          where: { email: identity.email, deletedAt: null },
          select: { id: true },
        })
      : null;

    const userId = linkedUser?.id ?? newId();

    await this.prisma.$transaction(async (tx) => {
      if (!linkedUser) {
        await tx.user.create({
          data: {
            id: userId,
            email: identity.email,
            emailVerifiedAt: identity.emailVerified ? new Date() : null,
            phone: identity.phone,
            displayName: identity.displayName ?? identity.email ?? 'Người dùng mới',
            avatarUrl: identity.avatarUrl,
            status: USER_STATUS.ACTIVE,
            lastLoginAt: new Date(),
          },
        });
      } else {
        await tx.user.update({ where: { id: userId }, data: { lastLoginAt: new Date() } });
      }

      await tx.userIdentity.create({
        data: {
          id: newId(),
          userId,
          provider: identity.provider,
          providerUserId: identity.providerUserId,
          providerEmail: identity.email,
          providerPhone: identity.phone,
        },
      });
    });

    return { userId };
  }

  async me(userId: string): Promise<MeDto> {
    const user = await this.prisma.user.findFirstOrThrow({
      where: { id: userId, deletedAt: null },
      select: {
        id: true,
        displayName: true,
        email: true,
        avatarUrl: true,
        phoneVerifiedAt: true,
      },
    });

    const [membership, platformMembership] = await Promise.all([
      this.prisma.tenantMembership.findFirst({
        where: { userId, status: MEMBERSHIP_STATUS.ACTIVE },
        select: {
          roleKey: true,
          roleId: true,
          tenant: { select: { id: true, name: true, slug: true, status: true } },
        },
        orderBy: { createdAt: 'asc' },
      }),
      this.prisma.platformMembership.findFirst({
        where: { userId, status: MEMBERSHIP_STATUS.ACTIVE },
        select: { roleKey: true, roleId: true },
      }),
    ]);

    const tenantPermissions: readonly Permission[] = membership
      ? await this.rbac.permissionsForTenantMember(
          membership.roleKey as never,
          membership.roleId,
          membership.tenant.id,
        )
      : [];

    const platformPermissions: readonly Permission[] = platformMembership
      ? await this.rbac.permissionsForPlatformMember(
          platformMembership.roleKey as never,
          platformMembership.roleId,
        )
      : [];

    return {
      id: user.id,
      displayName: user.displayName,
      email: user.email,
      avatarUrl: user.avatarUrl,
      phoneVerified: user.phoneVerifiedAt !== null,
      tenant: membership
        ? {
            id: membership.tenant.id,
            name: membership.tenant.name,
            slug: membership.tenant.slug,
            status: membership.tenant.status,
            roleKey: membership.roleKey,
          }
        : null,
      platformRole: platformMembership?.roleKey ?? null,
      permissions: [...new Set([...tenantPermissions, ...platformPermissions])],
    };
  }
}

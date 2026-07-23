import { Injectable } from '@nestjs/common';
import { newId } from '@xeprime/prisma';
import { MEMBERSHIP_STATUS, USER_STATUS, type Permission } from '@xeprime/types';
import { PrismaService } from '../../prisma/prisma.service';
import { RbacService } from '../rbac/rbac.service';
import { IdTokenVerifier } from './token-verifier';
import type { MeDto } from './dto/auth.dto';

@Injectable()
export class AuthService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly verifier: IdTokenVerifier,
    private readonly rbac: RbacService,
  ) {}

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

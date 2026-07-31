import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { newId, Prisma } from '@xeprime/prisma';
import {
  API_ERROR_CODE,
  MEMBERSHIP_STATUS,
  PLATFORM_ROLE,
  type PaginationMeta,
} from '@xeprime/types';
import { PrismaService } from '../../prisma/prisma.service';
import { AuditService } from '../audit/audit.service';
import {
  AddStaffDto,
  STAFF_DEFAULT_LIMIT,
  STAFF_MAX_LIMIT,
  StaffDto,
  StaffListQueryDto,
  UpdateStaffRoleDto,
} from './dto/platform-staff.dto';

const SELECT = {
  userId: true,
  roleKey: true,
  status: true,
  createdAt: true,
  user: { select: { displayName: true, email: true, avatarUrl: true } },
} satisfies Prisma.PlatformMembershipSelect;

/**
 * Nhân sự nền tảng (Phase 7) — CRUD `platform_memberships`, mirror `MembersService` (tenant).
 *
 * Schema unique là `[userId, roleKey]` nhưng `PlatformScopeGuard` chỉ đọc MỘT row ACTIVE
 * (findFirst createdAt asc) → service enforce MỖI USER TỐI ĐA 1 membership chưa-removed;
 * đổi vai trò đi qua PATCH, không phải thêm row thứ hai.
 *
 * Bảo vệ chống tự khoá cửa: không tự thao tác chính mình; không gỡ/hạ vai trò Super Admin
 * (`platform_admin`) ACTIVE cuối cùng — kiểm ngay trong transaction của mutation.
 */
@Injectable()
export class PlatformStaffService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
  ) {}

  async list(query: StaffListQueryDto): Promise<{ data: StaffDto[]; meta: PaginationMeta }> {
    const page = Math.max(1, query.page ?? 1);
    const limit = Math.min(STAFF_MAX_LIMIT, Math.max(1, query.limit ?? STAFF_DEFAULT_LIMIT));

    const where: Prisma.PlatformMembershipWhereInput = {
      status: { not: MEMBERSHIP_STATUS.REMOVED },
      ...(query.roleKey ? { roleKey: query.roleKey } : {}),
      ...(query.q
        ? {
            user: {
              OR: [
                { displayName: { contains: query.q, mode: 'insensitive' } },
                { email: { contains: query.q, mode: 'insensitive' } },
              ],
            },
          }
        : {}),
    };

    const [total, rows] = await this.prisma.$transaction([
      this.prisma.platformMembership.count({ where }),
      this.prisma.platformMembership.findMany({
        where,
        orderBy: { createdAt: 'asc' },
        skip: (page - 1) * limit,
        take: limit,
        select: SELECT,
      }),
    ]);

    return {
      data: rows.map(toDto),
      meta: { page, limit, total, hasNext: page * limit < total },
    };
  }

  /** Thêm nhân sự theo email. User phải đã có tài khoản; từng bị gỡ thì kích hoạt lại row cũ. */
  async add(actorUserId: string, dto: AddStaffDto): Promise<StaffDto> {
    const email = dto.email.trim().toLowerCase();
    const user = await this.prisma.user.findFirst({ where: { email }, select: { id: true } });
    if (!user) {
      throw new NotFoundException({
        code: API_ERROR_CODE.NOT_FOUND,
        message: 'Chưa có tài khoản với email này. Người dùng cần đăng ký trước.',
      });
    }

    const active = await this.prisma.platformMembership.findFirst({
      where: { userId: user.id, status: { not: MEMBERSHIP_STATUS.REMOVED } },
      select: { userId: true },
    });
    if (active) {
      throw new ConflictException({
        code: API_ERROR_CODE.CONFLICT,
        message: 'Người dùng đã là nhân sự nền tảng',
      });
    }

    const row = await this.prisma.$transaction(async (tx) => {
      // Unique [userId, roleKey]: nếu từng có row (removed) đúng vai trò này thì kích hoạt lại,
      // chưa có thì tạo mới. Row removed vai trò khác cứ để đó — guard chỉ đọc ACTIVE.
      const existing = await tx.platformMembership.findUnique({
        where: { userId_roleKey: { userId: user.id, roleKey: dto.roleKey } },
        select: { id: true },
      });
      const membership = existing
        ? await tx.platformMembership.update({
            where: { id: existing.id },
            data: { status: MEMBERSHIP_STATUS.ACTIVE, createdBy: actorUserId },
            select: SELECT,
          })
        : await tx.platformMembership.create({
            data: {
              id: newId(),
              userId: user.id,
              roleKey: dto.roleKey,
              status: MEMBERSHIP_STATUS.ACTIVE,
              createdBy: actorUserId,
            },
            select: SELECT,
          });

      await this.audit.record(
        {
          actorUserId,
          actorScope: 'platform',
          action: 'platform_staff.add',
          targetType: 'platform_membership',
          targetId: user.id,
          after: { roleKey: dto.roleKey },
        },
        tx,
      );

      return membership;
    });

    return toDto(row);
  }

  async updateRole(
    actorUserId: string,
    targetUserId: string,
    dto: UpdateStaffRoleDto,
  ): Promise<StaffDto> {
    if (targetUserId === actorUserId) {
      throw new BadRequestException({
        code: API_ERROR_CODE.VALIDATION_FAILED,
        message: 'Không thể tự đổi vai trò của mình',
      });
    }

    const current = await this.loadCurrent(targetUserId);
    if (current.roleKey === dto.roleKey) return toDto(current);

    const row = await this.prisma.$transaction(async (tx) => {
      if (current.roleKey === PLATFORM_ROLE.PLATFORM_ADMIN) {
        await this.assertNotLastAdmin(tx, targetUserId);
      }
      // Đổi roleKey có thể đụng unique [userId, roleKey] với row removed cũ cùng vai trò đích —
      // dọn row rác đó trước (lịch sử thao tác đã nằm ở audit_logs, không mất gì).
      await tx.platformMembership.deleteMany({
        where: {
          userId: targetUserId,
          roleKey: dto.roleKey,
          status: MEMBERSHIP_STATUS.REMOVED,
        },
      });
      const updated = await tx.platformMembership.update({
        where: { id: current.id },
        data: { roleKey: dto.roleKey },
        select: SELECT,
      });
      await this.audit.record(
        {
          actorUserId,
          actorScope: 'platform',
          action: 'platform_staff.update_role',
          targetType: 'platform_membership',
          targetId: targetUserId,
          before: { roleKey: current.roleKey },
          after: { roleKey: dto.roleKey },
        },
        tx,
      );
      return updated;
    });

    return toDto(row);
  }

  async remove(actorUserId: string, targetUserId: string): Promise<{ userId: string }> {
    if (targetUserId === actorUserId) {
      throw new BadRequestException({
        code: API_ERROR_CODE.VALIDATION_FAILED,
        message: 'Không thể tự gỡ mình khỏi nền tảng',
      });
    }

    const current = await this.loadCurrent(targetUserId);

    await this.prisma.$transaction(async (tx) => {
      if (current.roleKey === PLATFORM_ROLE.PLATFORM_ADMIN) {
        await this.assertNotLastAdmin(tx, targetUserId);
      }
      await tx.platformMembership.update({
        where: { id: current.id },
        data: { status: MEMBERSHIP_STATUS.REMOVED },
      });
      await this.audit.record(
        {
          actorUserId,
          actorScope: 'platform',
          action: 'platform_staff.remove',
          targetType: 'platform_membership',
          targetId: targetUserId,
          before: { roleKey: current.roleKey },
        },
        tx,
      );
    });

    return { userId: targetUserId };
  }

  /** Membership chưa-removed của một user (service enforce tối đa 1 — xem doc class). */
  private async loadCurrent(userId: string) {
    const row = await this.prisma.platformMembership.findFirst({
      where: { userId, status: { not: MEMBERSHIP_STATUS.REMOVED } },
      orderBy: { createdAt: 'asc' },
      select: { ...SELECT, id: true },
    });
    if (!row) {
      throw new NotFoundException({
        code: API_ERROR_CODE.NOT_FOUND,
        message: 'Không tìm thấy nhân sự',
      });
    }
    return row;
  }

  /** Chặn gỡ/hạ vai trò Super Admin ACTIVE cuối cùng — đếm trong transaction để tránh đua. */
  private async assertNotLastAdmin(tx: Prisma.TransactionClient, excludeUserId: string) {
    const others = await tx.platformMembership.count({
      where: {
        roleKey: PLATFORM_ROLE.PLATFORM_ADMIN,
        status: MEMBERSHIP_STATUS.ACTIVE,
        userId: { not: excludeUserId },
      },
    });
    if (others === 0) {
      throw new BadRequestException({
        code: API_ERROR_CODE.VALIDATION_FAILED,
        message: 'Không thể gỡ hoặc đổi vai trò của Super Admin cuối cùng',
      });
    }
  }
}

type StaffRow = Prisma.PlatformMembershipGetPayload<{ select: typeof SELECT }>;

function toDto(m: StaffRow): StaffDto {
  return {
    userId: m.userId,
    displayName: m.user.displayName,
    email: m.user.email,
    avatarUrl: m.user.avatarUrl,
    roleKey: m.roleKey,
    status: m.status,
    createdAt: m.createdAt as unknown as string,
  };
}

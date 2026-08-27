import { BadRequestException, ConflictException, Injectable, NotFoundException } from '@nestjs/common';
import { newId, Prisma } from '@xeprime/prisma';
import {
  API_ERROR_CODE,
  MEMBERSHIP_STATUS,
  TENANT_ROLE,
  type PaginationMeta,
} from '@xeprime/types';
import { PrismaService } from '../../prisma/prisma.service';
import { AuditService } from '../audit/audit.service';
import {
  AddMemberDto,
  MEMBER_DEFAULT_LIMIT,
  MEMBER_MAX_LIMIT,
  MemberDto,
  MemberListQueryDto,
  UpdateMemberRoleDto,
} from './dto/member.dto';
import { paginationMeta, resolvePaging } from '../../common/pagination';

const SELECT = {
  userId: true,
  roleKey: true,
  status: true,
  joinedAt: true,
  createdAt: true,
  user: { select: { displayName: true, email: true, avatarUrl: true } },
} satisfies Prisma.TenantMembershipSelect;

@Injectable()
export class MembersService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
  ) {}

  async list(
    tenantId: string,
    query: MemberListQueryDto,
  ): Promise<{ data: MemberDto[]; meta: PaginationMeta }> {
    const paging = resolvePaging(query, MEMBER_DEFAULT_LIMIT, MEMBER_MAX_LIMIT);

    const where: Prisma.TenantMembershipWhereInput = {
      tenantId,
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
      this.prisma.tenantMembership.count({ where }),
      this.prisma.tenantMembership.findMany({
        where,
        // Chủ shop lên đầu, rồi mới tới các vai trò khác, cuối cùng theo thời điểm tham gia.
        orderBy: [{ roleKey: 'asc' }, { createdAt: 'asc' }],
        skip: paging.skip,
        take: paging.take,
        select: SELECT,
      }),
    ]);

    return {
      data: rows.map(toDto),
      meta: paginationMeta(paging, total),
    };
  }

  /** Thêm thành viên theo email. User phải đã có tài khoản (chưa hỗ trợ mời qua email). */
  async add(tenantId: string, actorUserId: string, dto: AddMemberDto): Promise<MemberDto> {
    if (dto.roleKey === TENANT_ROLE.SHOP_OWNER) {
      throw new BadRequestException({
        code: API_ERROR_CODE.VALIDATION_FAILED,
        message: 'Không thể gán vai trò chủ gian hàng cho thành viên',
      });
    }

    const email = dto.email.trim().toLowerCase();
    const user = await this.prisma.user.findFirst({
      where: { email },
      select: { id: true },
    });
    if (!user) {
      throw new NotFoundException({
        code: API_ERROR_CODE.NOT_FOUND,
        message: 'Chưa có tài khoản với email này. Người dùng cần đăng ký trước.',
      });
    }

    const existing = await this.prisma.tenantMembership.findUnique({
      where: { tenantId_userId: { tenantId, userId: user.id } },
      select: { userId: true, status: true },
    });
    if (existing && existing.status !== MEMBERSHIP_STATUS.REMOVED) {
      throw new ConflictException({
        code: API_ERROR_CODE.CONFLICT,
        message: 'Người dùng đã là thành viên của gian hàng',
      });
    }

    const row = await this.prisma.$transaction(async (tx) => {
      // Thành viên từng bị gỡ thì kích hoạt lại bản ghi cũ (unique [tenant,user]).
      const membership = existing
        ? await tx.tenantMembership.update({
            where: { tenantId_userId: { tenantId, userId: user.id } },
            data: {
              roleKey: dto.roleKey,
              status: MEMBERSHIP_STATUS.ACTIVE,
              invitedBy: actorUserId,
              joinedAt: new Date(),
            },
            select: SELECT,
          })
        : await tx.tenantMembership.create({
            data: {
              id: newId(),
              tenantId,
              userId: user.id,
              roleKey: dto.roleKey,
              status: MEMBERSHIP_STATUS.ACTIVE,
              invitedBy: actorUserId,
              joinedAt: new Date(),
            },
            select: SELECT,
          });

      await this.audit.record(
        {
          tenantId,
          actorUserId,
          actorScope: 'tenant',
          action: 'member.add',
          targetType: 'tenant_membership',
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
    tenantId: string,
    actorUserId: string,
    targetUserId: string,
    dto: UpdateMemberRoleDto,
  ): Promise<MemberDto> {
    if (targetUserId === actorUserId) {
      throw new BadRequestException({
        code: API_ERROR_CODE.VALIDATION_FAILED,
        message: 'Không thể tự đổi vai trò của mình',
      });
    }
    if (dto.roleKey === TENANT_ROLE.SHOP_OWNER) {
      throw new BadRequestException({
        code: API_ERROR_CODE.VALIDATION_FAILED,
        message: 'Không thể gán vai trò chủ gian hàng',
      });
    }

    const current = await this.loadActive(tenantId, targetUserId);
    if (current.roleKey === TENANT_ROLE.SHOP_OWNER) {
      throw new BadRequestException({
        code: API_ERROR_CODE.VALIDATION_FAILED,
        message: 'Không thể đổi vai trò của chủ gian hàng',
      });
    }

    const row = await this.prisma.$transaction(async (tx) => {
      const updated = await tx.tenantMembership.update({
        where: { tenantId_userId: { tenantId, userId: targetUserId } },
        data: { roleKey: dto.roleKey },
        select: SELECT,
      });
      await this.audit.record(
        {
          tenantId,
          actorUserId,
          actorScope: 'tenant',
          action: 'member.update_role',
          targetType: 'tenant_membership',
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

  async remove(tenantId: string, actorUserId: string, targetUserId: string): Promise<{ userId: string }> {
    if (targetUserId === actorUserId) {
      throw new BadRequestException({
        code: API_ERROR_CODE.VALIDATION_FAILED,
        message: 'Không thể tự gỡ mình khỏi gian hàng',
      });
    }

    const current = await this.loadActive(tenantId, targetUserId);
    if (current.roleKey === TENANT_ROLE.SHOP_OWNER) {
      throw new BadRequestException({
        code: API_ERROR_CODE.VALIDATION_FAILED,
        message: 'Không thể gỡ chủ gian hàng',
      });
    }

    await this.prisma.$transaction(async (tx) => {
      await tx.tenantMembership.update({
        where: { tenantId_userId: { tenantId, userId: targetUserId } },
        data: { status: MEMBERSHIP_STATUS.REMOVED },
      });
      await this.audit.record(
        {
          tenantId,
          actorUserId,
          actorScope: 'tenant',
          action: 'member.remove',
          targetType: 'tenant_membership',
          targetId: targetUserId,
          before: { roleKey: current.roleKey },
        },
        tx,
      );
    });

    return { userId: targetUserId };
  }

  private async loadActive(tenantId: string, userId: string) {
    const row = await this.prisma.tenantMembership.findUnique({
      where: { tenantId_userId: { tenantId, userId } },
      select: { userId: true, roleKey: true, status: true },
    });
    if (!row || row.status === MEMBERSHIP_STATUS.REMOVED) {
      throw new NotFoundException({
        code: API_ERROR_CODE.NOT_FOUND,
        message: 'Không tìm thấy thành viên',
      });
    }
    return row;
  }
}

type MembershipRow = Prisma.TenantMembershipGetPayload<{ select: typeof SELECT }>;

function toDto(m: MembershipRow): MemberDto {
  return {
    userId: m.userId,
    displayName: m.user.displayName,
    email: m.user.email,
    avatarUrl: m.user.avatarUrl,
    roleKey: m.roleKey,
    status: m.status,
    joinedAt: (m.joinedAt as unknown as string | null) ?? null,
    createdAt: m.createdAt as unknown as string,
  };
}

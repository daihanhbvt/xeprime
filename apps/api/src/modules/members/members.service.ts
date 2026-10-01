import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { markBadgesDirty, Prisma } from '@xeprime/prisma';
import {
  API_ERROR_CODE,
  MEMBERSHIP_STATUS,
  TENANT_ROLE,
  type PaginationMeta,
} from '@xeprime/types';
import { PrismaService } from '../../prisma/prisma.service';
import {
  assertWithinActorScope,
  resolveMemberBranchScope,
  writeMembershipBranches,
  type ResolvedBranchScope,
} from './member-branch-scope';

/** Phạm vi HIỆN CÓ của một membership, ở cùng dạng phạm vi được cấp. */
function scopeOf(m: { branchScope: string; branches: readonly { branchId: string }[] }): ResolvedBranchScope {
  return { branchScope: m.branchScope, branchIds: m.branches.map((b) => b.branchId) };
}
import { AuditService } from '../audit/audit.service';
import {
  MEMBER_DEFAULT_LIMIT,
  MEMBER_MAX_LIMIT,
  MemberDto,
  MemberListQueryDto,
  UpdateMemberRoleDto,
} from './dto/member.dto';
import { paginationMeta, resolvePaging } from '../../common/pagination';
import { piiSearch } from '../../common/support/support-search';

const SELECT = {
  id: true,
  userId: true,
  roleKey: true,
  status: true,
  branchScope: true,
  branches: { select: { branchId: true } },
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
              OR: memberSearchOr(query.q),
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

  async updateRole(
    tenantId: string,
    actorUserId: string,
    targetUserId: string,
    dto: UpdateMemberRoleDto,
    /** Phạm vi chi nhánh của người thao tác — trần của việc giao quyền (ADR 0052). */
    actorAllowed: readonly string[] | null,
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
    // Người đang phụ trách chi nhánh ngoài phần của mình thì không đụng tới — kể cả chỉ đổi vai.
    assertWithinActorScope(actorAllowed, scopeOf(current));

    const row = await this.prisma.$transaction(async (tx) => {
      /*
       * Phạm vi đi CÙNG vai trò trong một transaction (ADR 0052). `branchScope` vắng mặt nghĩa
       * là GIỮ NGUYÊN: cú PATCH chỉ đổi vai trò không được âm thầm xoá danh sách chi nhánh đã
       * giao — hai ô trên màn Nhân sự là hai cử chỉ độc lập của người quản lý.
       */
      const keepScope = dto.branchScope === undefined;
      /*
       * `roleKey` vắng mặt cũng GIỮ NGUYÊN, hệt như `branchScope` — hai ô trên màn Nhân sự là hai
       * cử chỉ độc lập, nên cú PATCH nào cũng chỉ được ghi đúng cột nó có ý đổi. Vai trò hiện tại
       * vẫn cần cho `resolveMemberBranchScope` (chủ gian hàng luôn `all`).
       */
      const keepRole = dto.roleKey === undefined;
      const effectiveRole = dto.roleKey ?? current.roleKey;
      const scope = keepScope
        ? { branchScope: current.branchScope, branchIds: current.branches.map((b) => b.branchId) }
        : await resolveMemberBranchScope(tx, tenantId, effectiveRole, dto, actorAllowed);
      const updated = await tx.tenantMembership.update({
        where: { tenantId_userId: { tenantId, userId: targetUserId } },
        /*
         * KHÔNG chạm cột nào không được yêu cầu đổi — ghi lại giá trị vừa đọc là mở cửa cho
         * lost-update: hai cú PATCH song song thì cú sau ghi đè cú trước về bản cũ, và lệch luôn
         * theo chiều MỞ QUYỀN (vai cao hơn, hoặc phạm vi rộng hơn).
         */
        data: {
          ...(keepRole ? {} : { roleKey: dto.roleKey }),
          ...(keepScope ? {} : { branchScope: scope.branchScope }),
        },
        select: SELECT,
      });
      if (!keepScope) await writeMembershipBranches(tx, tenantId, updated.id, scope.branchIds);
      await this.audit.record(
        {
          tenantId,
          actorUserId,
          actorScope: 'tenant',
          action: 'member.update_role',
          targetType: 'tenant_membership',
          targetId: targetUserId,
          before: {
            roleKey: current.roleKey,
            branchScope: current.branchScope,
            branchIds: current.branches.map((b) => b.branchId),
          },
          after: { roleKey: effectiveRole, ...scope },
        },
        tx,
      );
      return { ...updated, branches: scope.branchIds.map((branchId) => ({ branchId })) };
    });

    return toDto(row);
  }

  async remove(
    tenantId: string,
    actorUserId: string,
    targetUserId: string,
    /** Phạm vi chi nhánh của người thao tác — xem `assertWithinActorScope`. */
    actorAllowed: readonly string[] | null,
  ): Promise<{ userId: string }> {
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
    assertWithinActorScope(actorAllowed, scopeOf(current));

    await this.prisma.$transaction(async (tx) => {
      await tx.tenantMembership.update({
        where: { tenantId_userId: { tenantId, userId: targetUserId } },
        data: { status: MEMBERSHIP_STATUS.REMOVED },
      });

      /*
       * Chiều nguy hiểm hơn chiều vào: không đánh dấu thì người vừa bị gỡ vẫn thấy con số chưa
       * đọc của một gian hàng họ không còn quyền mở. Badge nói có 5 tin, bấm vào thì hộp thư
       * rỗng — và bản chiếu cũ trên Firestore sẽ giữ nguyên con số đó vô thời hạn.
       */
      await markBadgesDirty(tx, [targetUserId]);
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
      select: {
        userId: true,
        roleKey: true,
        status: true,
        branchScope: true,
        branches: { select: { branchId: true } },
      },
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
    branchScope: m.branchScope,
    branchIds: m.branches.map((b) => b.branchId),
    joinedAt: (m.joinedAt as unknown as string | null) ?? null,
    createdAt: m.createdAt as unknown as string,
  };
}

/** Tên gần đúng · email — trong phiên hỗ trợ (ADR 0050 §11) email chỉ khớp nguyên văn. */
function memberSearchOr(q: string): Prisma.UserWhereInput[] {
  const pii = piiSearch(q);
  const name: Prisma.UserWhereInput = { displayName: { contains: q, mode: 'insensitive' } };
  if (pii.substring) return [name, { email: { contains: q, mode: 'insensitive' } }];
  return [name, ...(pii.email ? [{ email: { equals: pii.email, mode: 'insensitive' as const } }] : [])];
}

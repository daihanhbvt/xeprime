import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import bcrypt from 'bcrypt';
import { isUniqueViolation, markBadgesDirty, newId, Prisma } from '@xeprime/prisma';
import {
  ACCOUNT_REALM,
  API_ERROR_CODE,
  INVITE_STATUS,
  MEMBER_ROSTER_KIND,
  MEMBER_ROSTER_STATUS,
  MEMBERSHIP_STATUS,
  TENANT_ROLE,
  TENANT_ROLE_RANK,
  TENANT_ROLE_VALUES,
  USER_STATUS,
  invitableTenantRoles,
  normalizeStaffUsername,
  type PaginationMeta,
  type TenantRole,
} from '@xeprime/types';
import { NATIVE_REVOKE_REASON, NativeSessionService } from '../auth/native-session.service';
import { SessionService, WEB_REVOKE_REASON } from '../auth/session.service';
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
import { RbacService } from '../rbac/rbac.service';
import {
  CreateMemberAccountDto,
  MEMBER_DEFAULT_LIMIT,
  MEMBER_MAX_LIMIT,
  MemberActivityDto,
  MemberDto,
  MemberListQueryDto,
  MemberRoleSummaryDto,
  MemberRosterItemDto,
  MemberRosterQueryDto,
  UpdateMemberRoleDto,
} from './dto/member.dto';
import { paginationMeta, resolvePaging } from '../../common/pagination';
import { normalizePhone, toLocalPhone } from '../../common/phone';

/** Cùng cost với `AuthService` — mật khẩu nhân viên không yếu hơn mật khẩu tự đặt. */
const BCRYPT_ROUNDS = 12;

function notManaged(): ConflictException {
  return new ConflictException({
    code: API_ERROR_CODE.MEMBER_ACCOUNT_NOT_MANAGED,
    message: 'Chỉ áp dụng cho tài khoản do gian hàng cấp',
  });
}
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
    private readonly rbac: RbacService,
    /** Khoá / gỡ / đặt lại mật khẩu là đăng xuất người đó khỏi MỌI thiết bị (ADR 0076 · 0087). */
    private readonly webSessions: SessionService,
    private readonly nativeSessions: NativeSessionService,
  ) {}

  /**
   * CẤP tài khoản nhân viên (ADR 0087): tạo tài khoản đối tác mới (tên đăng nhập + mật khẩu, không
   * SĐT) và membership `active` của gian hàng — MỘT transaction, không có nửa chừng nào (tài khoản
   * mồ côi không thuộc gian hàng nào thì không ai gỡ được).
   *
   * Tên đăng nhập trùng ⇒ `USERNAME_TAKEN` — chốt thật là unique `(realm, username)` của DB, bắt
   * P2002 cho hai lượt cấp song song.
   */
  async createAccount(
    tenantId: string,
    actorUserId: string,
    actorRole: string,
    actorAllowed: readonly string[] | null,
    dto: CreateMemberAccountDto,
  ): Promise<MemberDto> {
    if (!invitableTenantRoles(actorRole).includes(dto.roleKey as TenantRole)) {
      throw new ForbiddenException({
        code: API_ERROR_CODE.MEMBER_ROLE_NOT_INVITABLE,
        message: 'Bạn không được cấp tài khoản với vai trò này',
        details: { roleKey: dto.roleKey },
      });
    }
    const username = normalizeStaffUsername(dto.username);
    const contactPhone = dto.contactPhone ? normalizePhone(dto.contactPhone) : null;
    const passwordHash = await bcrypt.hash(dto.password, BCRYPT_ROUNDS);
    const userId = newId();

    try {
      const row = await this.prisma.$transaction(async (tx) => {
        const scope = await resolveMemberBranchScope(tx, tenantId, dto.roleKey, dto, actorAllowed);
        await tx.user.create({
          data: {
            id: userId,
            realm: ACCOUNT_REALM.PARTNER,
            displayName: dto.displayName,
            username,
            passwordHash,
            managedByTenantId: tenantId,
            status: USER_STATUS.ACTIVE,
          },
        });
        const membership = await tx.tenantMembership.create({
          data: {
            id: newId(),
            tenantId,
            userId,
            roleKey: dto.roleKey,
            status: MEMBERSHIP_STATUS.ACTIVE,
            branchScope: scope.branchScope,
            contactPhone,
            invitedBy: actorUserId,
            joinedAt: new Date(),
          },
          select: SELECT,
        });
        await writeMembershipBranches(tx, tenantId, membership.id, scope.branchIds);
        await markBadgesDirty(tx, [userId]);
        await this.audit.record(
          {
            tenantId,
            actorUserId,
            actorScope: 'tenant',
            action: 'member.create_account',
            targetType: 'tenant_membership',
            targetId: userId,
            // Mật khẩu KHÔNG BAO GIỜ vào audit — kể cả bản băm.
            after: { username, roleKey: dto.roleKey, contactPhone, ...scope },
          },
          tx,
        );
        return { ...membership, branches: scope.branchIds.map((branchId) => ({ branchId })) };
      });
      return toDto(row);
    } catch (error) {
      if (isUniqueViolation(error, 'users_realm_username_key')) {
        throw new ConflictException({
          code: API_ERROR_CODE.USERNAME_TAKEN,
          message: 'Tên đăng nhập này đã có người dùng',
        });
      }
      throw error;
    }
  }

  /**
   * Chủ ĐẶT LẠI mật khẩu cho tài khoản do gian hàng cấp (ADR 0087) — nhân viên không có SĐT để tự
   * đặt lại bằng OTP. Đăng xuất họ khỏi MỌI thiết bị trong cùng transaction (ADR 0076: đặt lại mật
   * khẩu giết tất cả). Tài khoản tự đăng ký thì không: đó là mật khẩu của người khác.
   */
  async resetPassword(
    tenantId: string,
    actorUserId: string,
    targetUserId: string,
    actorAllowed: readonly string[] | null,
    password: string,
  ): Promise<void> {
    const current = await this.loadManageable(tenantId, actorUserId, targetUserId, actorAllowed);
    if (current.user.managedByTenantId !== tenantId) throw notManaged();
    const passwordHash = await bcrypt.hash(password, BCRYPT_ROUNDS);

    await this.prisma.$transaction(async (tx) => {
      await tx.user.update({ where: { id: targetUserId }, data: { passwordHash } });
      await this.revokeAllSessions(tx, targetUserId, 'reset');
      await this.audit.record(
        {
          tenantId,
          actorUserId,
          actorScope: 'tenant',
          action: 'member.reset_password',
          targetType: 'tenant_membership',
          targetId: targetUserId,
        },
        tx,
      );
    });
  }

  /**
   * Việc gần đây của một thành viên TRONG gian hàng này — các dòng `audit_logs` họ là người làm.
   * Đọc theo chỉ mục `(actor_user_id, created_at)`; chặn ở 20 dòng, đây là ô tóm tắt chứ không phải
   * nhật ký đầy đủ.
   */
  async activity(
    tenantId: string,
    targetUserId: string,
    limit = 10,
  ): Promise<MemberActivityDto[]> {
    await this.loadActive(tenantId, targetUserId);
    const rows = await this.prisma.auditLog.findMany({
      where: { tenantId, actorUserId: targetUserId },
      orderBy: { createdAt: 'desc' },
      take: Math.min(Math.max(limit, 1), 20),
      select: { id: true, action: true, targetType: true, targetId: true, createdAt: true },
    });
    return rows.map((r) => ({
      id: r.id,
      action: r.action,
      targetType: r.targetType,
      targetId: r.targetId,
      createdAt: r.createdAt.toISOString(),
    }));
  }

  private async revokeAllSessions(
    tx: Prisma.TransactionClient,
    userId: string,
    why: 'reset' | 'disabled',
  ): Promise<void> {
    await this.webSessions.revokeAllForUser(
      userId,
      why === 'reset' ? WEB_REVOKE_REASON.PASSWORD_RESET : WEB_REVOKE_REASON.USER_DISABLED,
      { tx },
    );
    await this.nativeSessions.revokeAllForUser(
      userId,
      why === 'reset' ? NATIVE_REVOKE_REASON.PASSWORD_RESET : NATIVE_REVOKE_REASON.USER_DISABLED,
      { tx },
    );
  }

  /**
   * Danh sách nhân sự GỘP: thành viên (đang hoạt động / bị khoá) + lời mời còn hạn (ADR 0086 điều 5).
   *
   * Hai bảng, một phân trang — nên ghép bằng `UNION ALL` trong DB rồi mới `LIMIT`: ghép ở Node là
   * kéo cả hai bảng về để cắt một trang. Mốc hoạt động và chi nhánh chỉ tính cho các dòng CỦA TRANG
   * (truy vấn ngoài), không cho cả tập.
   */
  async roster(
    tenantId: string,
    query: MemberRosterQueryDto,
  ): Promise<{ data: MemberRosterItemDto[]; meta: PaginationMeta }> {
    const paging = resolvePaging(query, MEMBER_DEFAULT_LIMIT, MEMBER_MAX_LIMIT);
    const union = rosterUnion(tenantId, query);

    const [countRows, rows] = await this.prisma.$transaction([
      this.prisma.$queryRaw<{ total: bigint }[]>`SELECT COUNT(*)::bigint AS total FROM (${union}) AS r`,
      this.prisma.$queryRaw<RosterRow[]>`
        SELECT r.*,
          CASE WHEN r.kind = ${MEMBER_ROSTER_KIND.MEMBER} THEN GREATEST(
            (SELECT u.last_login_at FROM users u WHERE u.id = r.user_id),
            (SELECT MAX(ws.last_seen_at) FROM web_sessions ws WHERE ws.user_id = r.user_id),
            (SELECT MAX(ns.last_used_at) FROM native_auth_sessions ns WHERE ns.user_id = r.user_id)
          ) END AS last_active_at,
          CASE WHEN r.kind = ${MEMBER_ROSTER_KIND.MEMBER}
            THEN COALESCE(
              (SELECT array_agg(mb.branch_id::text ORDER BY mb.branch_id) FROM membership_branches mb
                WHERE mb.membership_id = r.membership_id),
              '{}'::text[])
            ELSE r.invite_branch_ids END AS branch_ids
        FROM (${union}) AS r
        ORDER BY r.role_rank, r.sort_at, r.id
        LIMIT ${paging.take} OFFSET ${paging.skip}`,
    ]);

    return {
      data: rows.map(toRosterDto),
      meta: paginationMeta(paging, Number(countRows[0]?.total ?? 0)),
    };
  }

  /**
   * Bốn vai của gian hàng cho ma trận "Vai trò & quyền" (ADR 0086 điều 1): khoá quyền đọc ĐÚNG
   * đường guard đọc (`RbacService`), kèm số người đang giữ vai.
   */
  async roles(tenantId: string): Promise<MemberRoleSummaryDto[]> {
    const counts = await this.prisma.tenantMembership.groupBy({
      by: ['roleKey'],
      where: {
        tenantId,
        status: { in: [MEMBERSHIP_STATUS.ACTIVE, MEMBERSHIP_STATUS.LOCKED] },
      },
      _count: { _all: true },
    });
    const countOf = new Map(counts.map((c) => [c.roleKey, c._count._all]));

    return Promise.all(
      TENANT_ROLE_VALUES.map(async (roleKey) => ({
        roleKey,
        memberCount: countOf.get(roleKey) ?? 0,
        permissions: [...(await this.rbac.permissionsForTenantMember(roleKey, null, tenantId))],
      })),
    );
  }

  /**
   * Tạm khoá một thành viên (ADR 0086 điều 7). Membership `locked` không qua được
   * `TenantScopeGuard` (chỉ nhận `active`), nên người bị khoá mất quyền ở request kế tiếp — không
   * phải chờ phiên hết hạn. `locked_reason` để NULL: đó là dấu "chủ khoá tay", thứ mà lượt mở lại
   * khi gói kích hoạt (ADR 0085 điều 6) không được đụng.
   */
  async lock(
    tenantId: string,
    actorUserId: string,
    targetUserId: string,
    actorAllowed: readonly string[] | null,
  ): Promise<MemberDto> {
    const current = await this.loadManageable(tenantId, actorUserId, targetUserId, actorAllowed);
    if (current.status !== MEMBERSHIP_STATUS.ACTIVE) {
      throw new ConflictException({
        code: API_ERROR_CODE.INVALID_STATUS_TRANSITION,
        message: 'Thành viên này không ở trạng thái đang hoạt động',
      });
    }
    return this.setLock(tenantId, actorUserId, targetUserId, MEMBERSHIP_STATUS.LOCKED);
  }

  async unlock(
    tenantId: string,
    actorUserId: string,
    targetUserId: string,
    actorAllowed: readonly string[] | null,
  ): Promise<MemberDto> {
    const current = await this.loadManageable(tenantId, actorUserId, targetUserId, actorAllowed);
    if (current.status !== MEMBERSHIP_STATUS.LOCKED) {
      throw new ConflictException({
        code: API_ERROR_CODE.INVALID_STATUS_TRANSITION,
        message: 'Thành viên này không bị khoá',
      });
    }
    if (current.lockedReason) {
      throw new ConflictException({
        code: API_ERROR_CODE.MEMBER_LOCKED_BY_SYSTEM,
        message: 'Thành viên bị khoá vì gian hàng hết gói - mở lại tự động khi gói kích hoạt',
        details: { lockedReason: current.lockedReason },
      });
    }
    return this.setLock(tenantId, actorUserId, targetUserId, MEMBERSHIP_STATUS.ACTIVE);
  }

  /**
   * Lật trạng thái khoá bằng một UPDATE CÓ ĐIỀU KIỆN: lượt khoá chỉ ăn khi dòng còn `active`, lượt
   * mở chỉ ăn khi dòng còn bị khoá TAY — hai cú bấm song song (hay job vòng đời gói chạy cùng lúc)
   * không ghi đè nhau.
   */
  private async setLock(
    tenantId: string,
    actorUserId: string,
    targetUserId: string,
    next: typeof MEMBERSHIP_STATUS.ACTIVE | typeof MEMBERSHIP_STATUS.LOCKED,
  ): Promise<MemberDto> {
    const locking = next === MEMBERSHIP_STATUS.LOCKED;
    const from = locking ? MEMBERSHIP_STATUS.ACTIVE : MEMBERSHIP_STATUS.LOCKED;
    const row = await this.prisma.$transaction(async (tx) => {
      const flipped = await tx.tenantMembership.updateMany({
        where: {
          tenantId,
          userId: targetUserId,
          status: from,
          ...(locking ? {} : { lockedReason: null }),
        },
        data: { status: next, lockedReason: null },
      });
      if (flipped.count === 0) {
        throw new ConflictException({
          code: API_ERROR_CODE.INVALID_STATUS_TRANSITION,
          message: 'Trạng thái thành viên vừa thay đổi - hãy tải lại danh sách',
        });
      }
      // Khoá / mở là đổi phạm vi hộp thư công việc của người đó — như lượt gỡ (xem `remove`).
      await markBadgesDirty(tx, [targetUserId]);
      // Khoá thì đăng xuất ngay mọi thiết bị: guard đã chặn mọi route của gian hàng, còn phiên sống
      // thì người bị khoá vẫn ngồi nhìn một khu làm việc trống (ADR 0087).
      if (locking) await this.revokeAllSessions(tx, targetUserId, 'disabled');
      await this.audit.record(
        {
          tenantId,
          actorUserId,
          actorScope: 'tenant',
          action: locking ? 'member.lock' : 'member.unlock',
          targetType: 'tenant_membership',
          targetId: targetUserId,
          before: { status: from },
          after: { status: next },
        },
        tx,
      );
      return tx.tenantMembership.findUniqueOrThrow({
        where: { tenantId_userId: { tenantId, userId: targetUserId } },
        select: SELECT,
      });
    });
    return toDto(row);
  }

  /** Luật chung của mọi thao tác lên NGƯỜI KHÁC: không phải mình, không phải chủ, trong phạm vi. */
  private async loadManageable(
    tenantId: string,
    actorUserId: string,
    targetUserId: string,
    actorAllowed: readonly string[] | null,
  ) {
    if (targetUserId === actorUserId) {
      throw new BadRequestException({
        code: API_ERROR_CODE.VALIDATION_FAILED,
        message: 'Không thể thao tác trên chính tài khoản của mình',
      });
    }
    const current = await this.loadActive(tenantId, targetUserId);
    if (current.roleKey === TENANT_ROLE.SHOP_OWNER) {
      throw new BadRequestException({
        code: API_ERROR_CODE.VALIDATION_FAILED,
        message: 'Không thể thao tác trên chủ gian hàng',
      });
    }
    assertWithinActorScope(actorAllowed, scopeOf(current));
    return current;
  }

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
    // Họ tên của một tài khoản TỰ ĐĂNG KÝ là của chính chủ tài khoản đó, không phải của gian hàng.
    const renaming = dto.displayName !== undefined && dto.displayName !== current.user.displayName;
    if (renaming && current.user.managedByTenantId !== tenantId) throw notManaged();
    const keepContact = dto.contactPhone === undefined;
    const contactPhone = dto.contactPhone ? normalizePhone(dto.contactPhone) : null;

    const row = await this.prisma.$transaction(async (tx) => {
      if (renaming) {
        await tx.user.update({ where: { id: targetUserId }, data: { displayName: dto.displayName } });
      }
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
      // Tên gợi nhớ: vắng mặt = giữ nguyên; rỗng / null = gỡ (ADR 0086).
      const keepNickname = dto.nickname === undefined;
      const nickname = dto.nickname?.trim() || null;
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
          ...(keepNickname ? {} : { displayNameInTenant: nickname }),
          ...(keepContact ? {} : { contactPhone }),
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
            ...(keepNickname ? {} : { nickname: current.displayNameInTenant }),
            ...(keepContact ? {} : { contactPhone: current.contactPhone }),
            ...(renaming ? { displayName: current.user.displayName } : {}),
          },
          after: {
            roleKey: effectiveRole,
            ...scope,
            ...(keepNickname ? {} : { nickname }),
            ...(keepContact ? {} : { contactPhone }),
            ...(renaming ? { displayName: dto.displayName } : {}),
          },
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

    const managed = current.user.managedByTenantId === tenantId;
    await this.prisma.$transaction(async (tx) => {
      await tx.tenantMembership.update({
        where: { tenantId_userId: { tenantId, userId: targetUserId } },
        data: { status: MEMBERSHIP_STATUS.REMOVED },
      });
      /*
       * Tài khoản do gian hàng cấp chỉ tồn tại để làm cho gian hàng này (ADR 0087): gỡ là VÔ HIỆU
       * HOÁ — khoá tài khoản và trả tên đăng nhập lại cho gian hàng dùng tiếp. Không xoá cứng: nhật
       * ký và chứng từ còn trỏ tới người này.
       */
      if (managed) {
        await tx.user.update({
          where: { id: targetUserId },
          data: { status: USER_STATUS.LOCKED, username: null },
        });
      }
      await this.revokeAllSessions(tx, targetUserId, 'disabled');

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
          before: { roleKey: current.roleKey, username: current.user.username },
          after: managed ? { accountDisabled: true } : undefined,
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
        lockedReason: true,
        displayNameInTenant: true,
        contactPhone: true,
        branchScope: true,
        branches: { select: { branchId: true } },
        user: { select: { displayName: true, username: true, managedByTenantId: true } },
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

// ── Danh sách gộp ────────────────────────────────────────────────────────────

interface RosterRow {
  kind: string;
  id: string;
  user_id: string | null;
  display_name: string | null;
  nickname: string | null;
  email: string | null;
  phone: string | null;
  username: string | null;
  managed_account: boolean;
  contact_phone: string | null;
  avatar_url: string | null;
  role_key: string;
  status: string;
  locked_reason: string | null;
  branch_scope: string;
  branch_ids: string[] | null;
  joined_at: Date | null;
  invited_at: Date | null;
  expires_at: Date | null;
  invited_by_name: string | null;
  last_active_at: Date | null;
}

/** Hằng của code (không phải đầu vào) — an toàn để nhúng thô vào SQL. */
function roleRankSql(column: string): Prisma.Sql {
  const whens = Object.entries(TENANT_ROLE_RANK)
    .map(([role, rank]) => `WHEN '${role}' THEN ${rank}`)
    .join(' ');
  return Prisma.raw(`CASE ${column} ${whens} ELSE 99 END`);
}

function escapeLike(q: string): string {
  return q.replace(/[\\%_]/g, (c) => `\\${c}`);
}

/**
 * Điều kiện tìm cho một nhánh của UNION. Tên + tên gợi nhớ khớp gần đúng; SĐT / email theo luật PII
 * của phiên hỗ trợ (ADR 0050 §11) — ngoài phiên vẫn gần đúng như ô tìm cũ.
 */
function rosterSearchSql(
  q: string,
  cols: {
    name: Prisma.Sql | null;
    nickname: Prisma.Sql;
    username: Prisma.Sql | null;
    email: Prisma.Sql;
    phones: readonly Prisma.Sql[];
  },
): Prisma.Sql {
  const like = `%${escapeLike(q)}%`;
  const pii = piiSearch(q);
  const parts: Prisma.Sql[] = [Prisma.sql`${cols.nickname} ILIKE ${like}`];
  if (cols.name) parts.push(Prisma.sql`${cols.name} ILIKE ${like}`);
  // Tên đăng nhập không phải PII (nó chỉ mở được gì khi có mật khẩu) — gần đúng ở mọi chỗ.
  if (cols.username) parts.push(Prisma.sql`${cols.username} ILIKE ${like}`);
  const digits = q.replace(/\D/g, '');
  for (const phone of cols.phones) {
    if (pii.substring) {
      if (digits.length >= 3) parts.push(Prisma.sql`${phone} LIKE ${`%${digits}%`}`);
    } else if (pii.phones.length > 0) {
      parts.push(Prisma.sql`${phone} IN (${Prisma.join(pii.phones)})`);
    }
  }
  if (pii.substring) parts.push(Prisma.sql`${cols.email} ILIKE ${like}`);
  else if (pii.email) parts.push(Prisma.sql`LOWER(${cols.email}) = ${pii.email}`);
  return Prisma.sql`(${Prisma.join(parts, ' OR ')})`;
}

function rosterUnion(tenantId: string, query: MemberRosterQueryDto): Prisma.Sql {
  const q = query.q?.trim();
  const status = query.status;
  const branches: Prisma.Sql[] = [];

  if (status !== MEMBER_ROSTER_STATUS.PENDING) {
    const statuses =
      status === MEMBER_ROSTER_STATUS.ACTIVE || status === MEMBER_ROSTER_STATUS.LOCKED
        ? [status]
        : [MEMBERSHIP_STATUS.ACTIVE, MEMBERSHIP_STATUS.LOCKED];
    const where: Prisma.Sql[] = [
      Prisma.sql`m.tenant_id = ${tenantId}`,
      Prisma.sql`m.status IN (${Prisma.join(statuses)})`,
    ];
    if (query.roleKey) where.push(Prisma.sql`m.role_key = ${query.roleKey}`);
    if (q) {
      where.push(
        rosterSearchSql(q, {
          name: Prisma.sql`u.display_name`,
          nickname: Prisma.sql`m.display_name_in_tenant`,
          username: Prisma.sql`u.username`,
          email: Prisma.sql`u.email`,
          phones: [Prisma.sql`u.phone`, Prisma.sql`m.contact_phone`],
        }),
      );
    }
    branches.push(Prisma.sql`
      SELECT ${MEMBER_ROSTER_KIND.MEMBER}::text AS kind, m.user_id::text AS id,
        m.user_id::text AS user_id, m.id::text AS membership_id,
        u.display_name::text AS display_name, m.display_name_in_tenant::text AS nickname,
        u.email::text AS email, COALESCE(u.phone, m.contact_phone)::text AS phone,
        u.username::text AS username,
        (u.managed_by_tenant_id IS NOT NULL AND u.managed_by_tenant_id = m.tenant_id) AS managed_account,
        m.contact_phone::text AS contact_phone, u.avatar_url::text AS avatar_url,
        m.role_key::text AS role_key, m.status::text AS status, m.locked_reason::text AS locked_reason,
        m.branch_scope::text AS branch_scope, NULL::text[] AS invite_branch_ids,
        m.joined_at AS joined_at, NULL::timestamptz AS invited_at, NULL::timestamptz AS expires_at,
        inviter.display_name::text AS invited_by_name,
        ${roleRankSql('m.role_key')} AS role_rank, m.created_at AS sort_at
      FROM tenant_memberships m
      JOIN users u ON u.id = m.user_id
      LEFT JOIN users inviter ON inviter.id = m.invited_by
      WHERE ${Prisma.join(where, ' AND ')}`);
  }

  if (!status || status === MEMBER_ROSTER_STATUS.PENDING) {
    // Lời mời quá hạn vẫn mang `pending` ở cột (không có job quét) — lọc theo MỐC, không theo cột.
    const where: Prisma.Sql[] = [
      Prisma.sql`i.tenant_id = ${tenantId}`,
      Prisma.sql`i.status = ${INVITE_STATUS.PENDING}`,
      Prisma.sql`i.expires_at > NOW()`,
    ];
    if (query.roleKey) where.push(Prisma.sql`i.role_key = ${query.roleKey}`);
    if (q) {
      where.push(
        rosterSearchSql(q, {
          name: null,
          nickname: Prisma.sql`i.display_name`,
          username: null,
          email: Prisma.sql`i.email`,
          phones: [Prisma.sql`i.phone`],
        }),
      );
    }
    branches.push(Prisma.sql`
      SELECT ${MEMBER_ROSTER_KIND.INVITE}::text AS kind, i.id::text AS id,
        NULL::text AS user_id, NULL::text AS membership_id,
        NULL::text AS display_name, i.display_name::text AS nickname,
        i.email::text AS email, i.phone::text AS phone, NULL::text AS username,
        FALSE AS managed_account, NULL::text AS contact_phone, NULL::text AS avatar_url,
        i.role_key::text AS role_key, ${MEMBER_ROSTER_STATUS.PENDING}::text AS status,
        NULL::text AS locked_reason, i.branch_scope::text AS branch_scope,
        i.branch_ids::text[] AS invite_branch_ids,
        NULL::timestamptz AS joined_at, i.created_at AS invited_at, i.expires_at AS expires_at,
        creator.display_name::text AS invited_by_name,
        ${roleRankSql('i.role_key')} AS role_rank, i.created_at AS sort_at
      FROM tenant_invites i
      JOIN users creator ON creator.id = i.created_by
      WHERE ${Prisma.join(where, ' AND ')}`);
  }

  return Prisma.join(branches, ' UNION ALL ');
}

const iso = (d: Date | null): string | null => (d ? d.toISOString() : null);

function toRosterDto(r: RosterRow): MemberRosterItemDto {
  return {
    kind: r.kind,
    id: r.id,
    userId: r.user_id,
    displayName: r.display_name,
    nickname: r.nickname,
    email: r.email,
    phone: r.phone ? toLocalPhone(r.phone) : null,
    username: r.username,
    managedAccount: r.managed_account,
    contactPhone: r.contact_phone ? toLocalPhone(r.contact_phone) : null,
    avatarUrl: r.avatar_url,
    roleKey: r.role_key,
    status: r.status,
    lockedReason: r.locked_reason,
    branchScope: r.branch_scope,
    branchIds: (r.branch_ids ?? []).map((id) => id.trim()),
    lastActiveAt: iso(r.last_active_at),
    joinedAt: iso(r.joined_at),
    invitedAt: iso(r.invited_at),
    expiresAt: iso(r.expires_at),
    invitedByName: r.invited_by_name,
  };
}

/** Tên gần đúng · email — trong phiên hỗ trợ (ADR 0050 §11) email chỉ khớp nguyên văn. */
function memberSearchOr(q: string): Prisma.UserWhereInput[] {
  const pii = piiSearch(q);
  const name: Prisma.UserWhereInput = { displayName: { contains: q, mode: 'insensitive' } };
  if (pii.substring) return [name, { email: { contains: q, mode: 'insensitive' } }];
  return [name, ...(pii.email ? [{ email: { equals: pii.email, mode: 'insensitive' as const } }] : [])];
}

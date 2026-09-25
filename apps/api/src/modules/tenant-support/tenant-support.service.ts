import { randomBytes } from 'node:crypto';
import { ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import {
  API_ERROR_CODE,
  AUDIT_ACTOR_SCOPE,
  BILLING_MODE,
  MEMBERSHIP_STATUS,
  PERMISSION,
  PLAN_FEATURE,
  SUPPORT_CAPABILITY,
  SUPPORT_CONTEXT_ID_LENGTH,
  SUPPORT_CONTEXT_TTL_MINUTES,
  SUPPORT_MODE,
  SUPPORT_WORKSPACE,
  TENANT_ROLE,
  TENANT_STATUS,
  VEHICLE_PUBLIC_STATUS,
  canWriteFeature,
  isFeatureVisible,
  isPackageOnboardingPending,
  isSupportCapability,
  isSupportContextId,
  supportPermissionsFor,
  tenantUsesManagePortal,
  type Permission,
  type PlanFeature,
  type PlatformRole,
  type SupportCapability,
  type SupportMode,
  type SupportWorkspace,
} from '@xeprime/types';
import { resolveTenantFeatures } from '../../common/plan/feature-state';
import {
  buildTenantContext,
  tenantContextSelect,
  type TenantContextRow,
} from '../../common/plan/tenant-context';
import { SupportRequestStore } from '../../common/support/support-request.store';
import type {
  AuthenticatedUser,
  SupportScope,
  TenantContext,
} from '../../common/types/request-context';
import { PrismaService } from '../../prisma/prisma.service';
import { AuditService } from '../audit/audit.service';
import { FeePoliciesService } from '../fee-policies/fee-policies.service';
import { RbacService } from '../rbac/rbac.service';
import type { OpenSupportContextDto, SupportContextDto } from './dto/tenant-support.dto';

/** Lý do quyền ghi bị rơi so với lúc mở — hiện thành một dòng giải thích trên banner. */
export const SUPPORT_WRITE_RESTRICTION = {
  TENANT_LOCKED: 'tenant_locked',
  ASSIST_PERMISSION_REVOKED: 'assist_permission_revoked',
} as const;
type SupportWriteRestriction =
  (typeof SUPPORT_WRITE_RESTRICTION)[keyof typeof SUPPORT_WRITE_RESTRICTION];

interface DerivedCapabilities {
  capabilities: SupportCapability[];
  writeRestriction: SupportWriteRestriction | null;
}

export interface ResolvedSupport {
  tenant: TenantContext;
  support: SupportScope;
  writeRestriction: SupportWriteRestriction | null;
  /** Cho bản đọc phiên (`get`) — lấy sẵn trong CÙNG lượt truy vấn xác minh, không đọc lại. */
  createdAt: Date;
  tenantName: string;
  planName: string | null;
}

/**
 * Capability ĐỌC theo bộ giao diện — ADR 0050 §10.
 *
 * Owner Lite chỉ có phần CÔNG VIỆC CHO THUÊ: xe, lịch, yêu cầu/chuyến phía chủ xe, bàn giao, mặt
 * tiền, case hỗ trợ. Không sổ khách, không tài xế/thành viên, không chính sách/gói — đó là bộ quản lý
 * của gian hàng, và tài khoản cá nhân của chủ xe (chuyến đi thuê, ví, thuế) không bao giờ ở đây.
 */
const SUPPORT_READS_BY_WORKSPACE: Readonly<Record<SupportWorkspace, readonly SupportCapability[]>> = {
  [SUPPORT_WORKSPACE.MANAGE]: [
    SUPPORT_CAPABILITY.VEHICLE_VIEW,
    SUPPORT_CAPABILITY.BRANCH_VIEW,
    SUPPORT_CAPABILITY.CALENDAR_VIEW,
    SUPPORT_CAPABILITY.BOOKING_REQUEST_VIEW,
    SUPPORT_CAPABILITY.BOOKING_VIEW,
    SUPPORT_CAPABILITY.HANDOVER_VIEW,
    SUPPORT_CAPABILITY.CUSTOMER_VIEW_MASKED,
    SUPPORT_CAPABILITY.DRIVER_VIEW,
    SUPPORT_CAPABILITY.MEMBER_VIEW,
    SUPPORT_CAPABILITY.TENANT_PROFILE_VIEW,
    SUPPORT_CAPABILITY.RENTAL_POLICY_VIEW,
    SUPPORT_CAPABILITY.SUBSCRIPTION_STATUS_VIEW,
    SUPPORT_CAPABILITY.SUPPORT_CASE_VIEW,
    SUPPORT_CAPABILITY.MAINTENANCE_VIEW,
  ],
  [SUPPORT_WORKSPACE.OWNER_LITE]: [
    SUPPORT_CAPABILITY.VEHICLE_VIEW,
    SUPPORT_CAPABILITY.BRANCH_VIEW,
    SUPPORT_CAPABILITY.CALENDAR_VIEW,
    SUPPORT_CAPABILITY.BOOKING_REQUEST_VIEW,
    SUPPORT_CAPABILITY.BOOKING_VIEW,
    SUPPORT_CAPABILITY.HANDOVER_VIEW,
    SUPPORT_CAPABILITY.TENANT_PROFILE_VIEW,
    SUPPORT_CAPABILITY.SUPPORT_CASE_VIEW,
  ],
  [SUPPORT_WORKSPACE.ONBOARDING]: [],
};

/** Capability đọc gắn với cờ gói — cùng cờ mà controller của nó đòi (`@RequiresFeature`). */
const SUPPORT_READ_FEATURE: Readonly<Partial<Record<SupportCapability, PlanFeature>>> = {
  [SUPPORT_CAPABILITY.MAINTENANCE_VIEW]: PLAN_FEATURE.MAINTENANCE,
  [SUPPORT_CAPABILITY.DRIVER_VIEW]: PLAN_FEATURE.DRIVERS,
  [SUPPORT_CAPABILITY.MEMBER_VIEW]: PLAN_FEATURE.MEMBERS,
};

/**
 * Trạng thái gian hàng mà phiên `assist` được GHI. Gian hàng đang đăng ký (nháp / chờ duyệt / cần
 * sửa) là đúng những người hay cần hỗ trợ nhập xe nhất.
 */
const SUPPORT_WRITABLE_TENANT_STATUSES: ReadonlySet<string> = new Set([
  TENANT_STATUS.ACTIVE,
  TENANT_STATUS.DRAFT,
  TENANT_STATUS.PENDING_REVIEW,
  TENANT_STATUS.NEEDS_REVISION,
]);

/** Crockford base32 — cùng bảng chữ với ULID, nên id phiên có dáng một id bình thường. */
const CROCKFORD = '0123456789ABCDEFGHJKMNPQRSTVWXYZ';

/**
 * Id phiên NGẪU NHIÊN hoàn toàn (~130 bit), KHÔNG phải ULID: id nằm trên URL và header, không
 * được để lộ thời điểm mở hay cho đoán id kế tiếp. Ràng buộc người + phiên đăng nhập mới là cổng
 * thật; id khó đoán là lớp thứ hai.
 */
export function newSupportContextId(): string {
  const bytes = randomBytes(SUPPORT_CONTEXT_ID_LENGTH);
  let out = '';
  for (const byte of bytes) out += CROCKFORD[byte & 31];
  return out;
}

/**
 * Bộ giao diện của gian hàng — suy từ TUYẾN, không nhận từ client (ADR 0050 điều 2).
 *
 * `package_pending` đứng TRƯỚC: gian hàng chưa trả tiền gói đầu tiên có `billingMode = null`, và
 * không được mở bộ Full Manage nào — kể cả bằng mắt của nhân sự nền tảng.
 */
export function supportWorkspaceOf(tenant: TenantContext): SupportWorkspace {
  if (isPackageOnboardingPending(tenant)) return SUPPORT_WORKSPACE.ONBOARDING;
  if (tenantUsesManagePortal(tenant)) return SUPPORT_WORKSPACE.MANAGE;
  return SUPPORT_WORKSPACE.OWNER_LITE;
}

/**
 * Capability tối đa một phiên được giữ ở HIỆN TRẠNG — hàm thuần, để test đọc thẳng bảng luật.
 *
 *  - `onboarding`: không gì cả. Phiên chỉ đọc được bản tóm tắt trạng thái qua endpoint nền tảng.
 *  - Đọc (Đợt 2A): bộ của TUYẾN — `SUPPORT_READS_BY_WORKSPACE`; capability gắn với một cờ gói
 *    (`SUPPORT_READ_FEATURE`) chỉ có khi cờ đó còn HIỆN (`enabled` hoặc `read_only`) — phiên không mở
 *    màn mà chính gian hàng không thấy.
 *  - Ghi: phiên `assist` + người mở còn quyền assist + gian hàng không bị khoá. Bảo dưỡng ghi được
 *    khi cờ gói cho ghi — phiên hỗ trợ không vượt cổng gói (ADR 0050 điều 5).
 */
export function deriveSupportCapabilities(input: {
  workspace: SupportWorkspace;
  mode: SupportMode;
  tenant: TenantContext;
  platformPermissions: readonly Permission[];
}): DerivedCapabilities {
  const { workspace, mode, tenant, platformPermissions } = input;
  if (workspace === SUPPORT_WORKSPACE.ONBOARDING) {
    return { capabilities: [], writeRestriction: null };
  }

  const isManage = workspace === SUPPORT_WORKSPACE.MANAGE;
  const maintenance = tenant.features[PLAN_FEATURE.MAINTENANCE];
  const out: SupportCapability[] = SUPPORT_READS_BY_WORKSPACE[workspace].filter((capability) => {
    const feature = SUPPORT_READ_FEATURE[capability];
    return feature === undefined || isFeatureVisible(tenant.features[feature]);
  });

  if (mode !== SUPPORT_MODE.ASSIST) return { capabilities: out, writeRestriction: null };

  // Chỉ ghi ở gian hàng đang sống hoặc đang đăng ký — DANH SÁCH CHO PHÉP, không phải danh sách
  // cấm: khoá / bị từ chối / hết hạn, và mọi trạng thái thêm sau này, mặc định là chỉ đọc.
  if (!SUPPORT_WRITABLE_TENANT_STATUSES.has(tenant.tenantStatus)) {
    return { capabilities: out, writeRestriction: SUPPORT_WRITE_RESTRICTION.TENANT_LOCKED };
  }
  if (!platformPermissions.includes(PERMISSION.PLATFORM_TENANT_SUPPORT_ASSIST)) {
    return {
      capabilities: out,
      writeRestriction: SUPPORT_WRITE_RESTRICTION.ASSIST_PERMISSION_REVOKED,
    };
  }

  out.push(SUPPORT_CAPABILITY.VEHICLE_INFO_EDIT, SUPPORT_CAPABILITY.VEHICLE_MEDIA_MANAGE);
  if (isManage && canWriteFeature(maintenance)) out.push(SUPPORT_CAPABILITY.MAINTENANCE_MANAGE);
  return { capabilities: out, writeRestriction: null };
}

function supportInvalid(): ForbiddenException {
  return new ForbiddenException({
    code: API_ERROR_CODE.SUPPORT_CONTEXT_INVALID,
    message: 'Phiên hỗ trợ không hợp lệ với tài khoản hoặc phiên đăng nhập hiện tại',
  });
}

function supportExpired(): ForbiddenException {
  return new ForbiddenException({
    code: API_ERROR_CODE.SUPPORT_CONTEXT_EXPIRED,
    message: 'Phiên hỗ trợ đã hết hạn hoặc đã kết thúc',
  });
}

/**
 * Phiên hỗ trợ gian hàng — ADR 0050. Writer DUY NHẤT của `tenant_support_contexts`, và là nơi
 * duy nhất quyết định một request có được chạy trong khu làm việc của gian hàng hay không.
 */
@Injectable()
export class TenantSupportService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly rbac: RbacService,
    private readonly audit: AuditService,
    private readonly store: SupportRequestStore,
    private readonly feePolicies: FeePoliciesService,
  ) {}

  /** Mở phiên. Người gọi đã qua `PlatformScopeGuard` + quyền `platform.tenant_support.view`. */
  async open(
    user: AuthenticatedUser,
    platformPermissions: readonly Permission[],
    dto: OpenSupportContextDto,
  ): Promise<SupportContextDto> {
    const mode = dto.mode as SupportMode;
    if (
      mode === SUPPORT_MODE.ASSIST &&
      !platformPermissions.includes(PERMISSION.PLATFORM_TENANT_SUPPORT_ASSIST)
    ) {
      throw new ForbiddenException({
        code: API_ERROR_CODE.MISSING_PERMISSION,
        message: 'Không đủ quyền mở phiên hỗ trợ thao tác',
        details: { missing: [PERMISSION.PLATFORM_TENANT_SUPPORT_ASSIST] },
      });
    }

    const now = new Date();
    const row = await this.prisma.tenant.findFirst({
      where: { id: dto.tenantId, deletedAt: null },
      select: tenantContextSelect(now),
    });
    if (!row) {
      throw new NotFoundException({
        code: API_ERROR_CODE.NOT_FOUND,
        message: 'Không tìm thấy gian hàng',
      });
    }

    const tenant = buildTenantContext(row, now, TENANT_ROLE.SHOP_VIEWER, []);
    const workspace = supportWorkspaceOf(tenant);
    const { capabilities } = deriveSupportCapabilities({
      workspace,
      mode,
      tenant,
      platformPermissions,
    });
    const state = this.store.state();
    const id = newSupportContextId();
    const expiresAt = new Date(now.getTime() + SUPPORT_CONTEXT_TTL_MINUTES * 60_000);
    const reason = dto.reason.trim();

    await this.prisma.$transaction(async (tx) => {
      await tx.tenantSupportContext.create({
        data: {
          id,
          actorUserId: user.id,
          sessionId: user.sessionId,
          tenantId: row.id,
          mode,
          workspace,
          reason,
          capabilities,
          createdAt: now,
          expiresAt,
          ipAddress: state?.ipAddress ?? null,
          userAgent: state?.userAgent ?? null,
        },
      });
      await this.audit.record(
        {
          tenantId: row.id,
          actorUserId: user.id,
          actorScope: AUDIT_ACTOR_SCOPE.PLATFORM,
          action: 'tenant_support.open',
          targetType: 'tenant',
          targetId: row.id,
          supportContextId: id,
          after: { mode, workspace, capabilities, reason, expiresAt: expiresAt.toISOString() },
        },
        tx,
      );
    });

    return this.get(id, user);
  }

  /** Đọc một phiên của CHÍNH người gọi, từ CHÍNH phiên đăng nhập đã mở nó. */
  async get(contextId: string, user: AuthenticatedUser): Promise<SupportContextDto> {
    const now = new Date();
    const resolved = await this.resolve(contextId, user, now);
    return this.toDto(resolved);
  }

  /**
   * Thoát phiên. Idempotent: phiên đã thoát/hết hạn trả về bình thường — người bấm "Thoát" hai
   * lần, hay bấm sau khi hết hạn, không cần thấy lỗi.
   *
   * Chỉ người MỞ phiên thoát được nó (từ bất kỳ phiên đăng nhập nào của họ — thoát chỉ bớt quyền).
   */
  async revoke(contextId: string, user: AuthenticatedUser): Promise<void> {
    if (!isSupportContextId(contextId)) throw supportInvalid();
    const now = new Date();
    await this.prisma.$transaction(async (tx) => {
      // Khoá dòng: hai lần bấm song song không được ghi hai dòng audit "thoát".
      const rows = await tx.$queryRaw<
        { actor_user_id: string; tenant_id: string; revoked_at: Date | null; expires_at: Date }[]
      >`SELECT actor_user_id, tenant_id, revoked_at, expires_at
          FROM tenant_support_contexts WHERE id = ${contextId} FOR UPDATE`;
      const row = rows[0];
      if (!row || row.actor_user_id !== user.id) throw supportInvalid();
      if (row.revoked_at !== null) return;

      await tx.tenantSupportContext.update({
        where: { id: contextId },
        data: { revokedAt: now, revokedBy: user.id },
      });
      await this.audit.record(
        {
          tenantId: row.tenant_id,
          actorUserId: user.id,
          actorScope: AUDIT_ACTOR_SCOPE.PLATFORM,
          action: 'tenant_support.revoke',
          targetType: 'tenant',
          targetId: row.tenant_id,
          supportContextId: contextId,
          // Thoát SAU khi đã hết hạn vẫn ghi lại — nhưng nói rõ phiên đã chết từ trước.
          after: { expiredBeforeRevoke: row.expires_at <= now },
        },
        tx,
      );
    });
  }

  /**
   * Xác minh một phiên cho request hiện tại — `TenantScopeGuard` và `get` cùng đi qua đây.
   *
   * Từ chối (403) khi: id sai dạng · không tồn tại · không phải của người gọi · mở từ phiên đăng
   * nhập khác (cùng một mã `SUPPORT_CONTEXT_INVALID`, không phân biệt) · đã thoát/hết hạn ·
   * gian hàng đã xoá · người gọi không còn là nhân sự nền tảng đang hoạt động hoặc mất quyền xem.
   */
  async resolve(
    contextId: string | null,
    user: AuthenticatedUser,
    now: Date,
  ): Promise<ResolvedSupport> {
    if (!isSupportContextId(contextId)) throw supportInvalid();

    const [row, membership] = await Promise.all([
      this.prisma.tenantSupportContext.findUnique({
        where: { id: contextId },
        select: {
          id: true,
          actorUserId: true,
          sessionId: true,
          mode: true,
          reason: true,
          capabilities: true,
          createdAt: true,
          expiresAt: true,
          revokedAt: true,
          tenant: { select: tenantContextSelect(now) },
        },
      }),
      this.prisma.platformMembership.findFirst({
        where: { userId: user.id, status: MEMBERSHIP_STATUS.ACTIVE },
        select: { roleKey: true, roleId: true },
        orderBy: { createdAt: 'asc' },
      }),
    ]);

    if (!row || row.actorUserId !== user.id || row.sessionId !== user.sessionId) {
      throw supportInvalid();
    }
    if (row.revokedAt !== null || row.expiresAt <= now) throw supportExpired();
    if (row.tenant.deletedAt !== null) throw supportExpired();

    const platformPermissions = membership
      ? await this.rbac.permissionsForPlatformMember(
          membership.roleKey as PlatformRole,
          membership.roleId,
        )
      : [];
    if (!platformPermissions.includes(PERMISSION.PLATFORM_TENANT_SUPPORT_VIEW)) {
      throw new ForbiddenException({
        code: API_ERROR_CODE.MISSING_PERMISSION,
        message: 'Tài khoản không còn quyền hỗ trợ gian hàng',
        details: { missing: [PERMISSION.PLATFORM_TENANT_SUPPORT_VIEW] },
      });
    }

    return this.buildResolved(row, row.tenant, now, platformPermissions);
  }

  /** Gắn phiên đã xác minh vào request đang chạy — audit đọc lại từ đây. */
  bindRequest(support: SupportScope, capability: string | null): void {
    this.store.bind(support, capability);
  }

  private buildResolved(
    row: {
      id: string;
      actorUserId: string;
      mode: string;
      reason: string;
      capabilities: string[];
      createdAt: Date;
      expiresAt: Date;
    },
    tenantRow: TenantContextRow,
    now: Date,
    platformPermissions: readonly Permission[],
  ): ResolvedSupport {
    const mode = row.mode === SUPPORT_MODE.ASSIST ? SUPPORT_MODE.ASSIST : SUPPORT_MODE.VIEW;
    // Dựng tenant hai lần là cố ý: lần đầu để SUY (tuyến, cờ gói, trạng thái khoá đọc MỚI mỗi
    // request), lần hai mang quyền đã giao. Không có bước nào đọc quyền nền tảng vào tenant.
    const probe = buildTenantContext(tenantRow, now, TENANT_ROLE.SHOP_VIEWER, []);
    // Bộ giao diện suy lại ở mỗi request chứ không đọc bản lưu: gian hàng hết gói giữa phiên thì
    // phiên phải thôi là Full Manage ngay — đúng như chính chủ xe thấy.
    const workspace = supportWorkspaceOf(probe);
    const derived = deriveSupportCapabilities({ workspace, mode, tenant: probe, platformPermissions });
    const granted = new Set(row.capabilities.filter(isSupportCapability));
    const capabilities = derived.capabilities.filter((c) => granted.has(c));

    const support: SupportScope = {
      contextId: row.id,
      actorUserId: row.actorUserId,
      tenantId: tenantRow.id,
      mode,
      workspace,
      reason: row.reason,
      capabilities,
      expiresAt: row.expiresAt,
    };
    const tenant = buildTenantContext(
      tenantRow,
      now,
      // Không bao giờ là chủ gian hàng: `@ShopOwnerOnly` và mọi luật đọc vai sẽ coi phiên hỗ
      // trợ như người XEM của gian hàng. Chưa có endpoint chỉ-chủ nào khai `@SupportAction`.
      TENANT_ROLE.SHOP_VIEWER,
      supportPermissionsFor(capabilities),
      support,
    );
    return {
      tenant,
      support,
      writeRestriction: derived.writeRestriction,
      createdAt: row.createdAt,
      tenantName: tenantRow.name,
      planName: resolveTenantFeatures(tenantRow.subscriptions[0] ?? null, tenantRow.usedFeatures, now)
        .planName,
    };
  }

  private async toDto(resolved: ResolvedSupport): Promise<SupportContextDto> {
    const { support, tenant } = resolved;
    // Cùng các phép tính của `toTenantSummary` ở `/auth/me` — màn dùng lại đọc một hình dạng.
    const [actor, shop, publicVehicleCount, feePolicy] = await Promise.all([
      this.prisma.user.findUniqueOrThrow({
        where: { id: support.actorUserId },
        select: { id: true, displayName: true },
      }),
      this.prisma.tenant.findUniqueOrThrow({
        where: { id: tenant.tenantId },
        select: { slug: true, profile: { select: { logoUrl: true } } },
      }),
      this.prisma.vehicle.count({
        where: {
          tenantId: tenant.tenantId,
          publicStatus: VEHICLE_PUBLIC_STATUS.APPROVED_PUBLIC,
          deletedAt: null,
        },
      }),
      tenant.billingMode === BILLING_MODE.COMMISSION ? this.feePolicies.findEffective() : null,
    ]);

    return {
      id: support.contextId,
      mode: support.mode,
      workspace: support.workspace,
      reason: support.reason,
      capabilities: [...support.capabilities],
      permissions: [...tenant.permissions],
      createdAt: resolved.createdAt.toISOString(),
      expiresAt: support.expiresAt.toISOString(),
      actor: { id: actor.id, displayName: actor.displayName },
      tenant: {
        id: tenant.tenantId,
        name: resolved.tenantName,
        slug: shop.slug,
        roleKey: tenant.roleKey,
        logoUrl: shop.profile?.logoUrl ?? null,
        serviceFeePercent: feePolicy?.serviceFeePercent ?? null,
        publicVehicleCount,
        status: tenant.tenantStatus,
        onboardingState: tenant.onboardingState,
        billingMode: tenant.billingMode,
        billingPhase: tenant.billingPhase,
        planCode: tenant.planCode,
        planName: resolved.planName,
        planEndsAt: tenant.planEndsAt,
        graceEndsAt: tenant.graceEndsAt,
        features: Object.entries(tenant.features).map(([feature, state]) => ({ feature, state })),
      },
      writeRestriction: resolved.writeRestriction,
    };
  }
}

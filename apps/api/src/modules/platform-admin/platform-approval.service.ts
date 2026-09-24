import { BadRequestException, ConflictException, Injectable } from '@nestjs/common';
import { newId, Prisma } from '@xeprime/prisma';
import { NOTIFICATION_AUDIENCE } from '@xeprime/domain';
import {
  APPROVAL_ACTION,
  APPROVAL_DECISION,
  APPROVAL_STATUS,
  APPROVAL_TARGET_TYPE,
  API_ERROR_CODE,
  NOTIFICATION_TARGET_TYPE,
  NOTIFICATION_TYPE,
  SHOP_VERIFICATION,
  TENANT_STATUS,
  VEHICLE_PUBLIC_STATUS,
  type ApprovalAction,
  type ApprovalDecision,
  type ApprovalStatus,
  type ApprovalTargetType,
  type NotificationType,
  type PaginationMeta,
  type ShopVerification,
  type TenantStatus,
  type VehiclePublicStatus,
  type VehicleReviewCheck,
} from '@xeprime/types';
import { AuditService } from '../audit/audit.service';
import { ListingsService } from '../public-listings/listings.service';

import { NotificationService } from '../notification/notification.service';
import { PrismaService } from '../../prisma/prisma.service';
import {
  APPROVAL_DEFAULT_LIMIT,
  APPROVAL_MAX_LIMIT,
  ApprovalListQueryDto,
  ApprovalTaskDetailDto,
  ApprovalTaskListItemDto,
} from './dto/approval.dto';
import { paginationMeta, resolvePaging } from '../../common/pagination';
import { currentSubscriptionWhere } from '../../common/plan/feature-state';
import {
  approvalNotFound,
  assertApprovalPending,
  assertVehicleChecksComplete,
  lockApprovalTask,
  reasonRequired,
  type LockedApprovalTask,
} from './approval-task-lock';
import {
  buildVehicleReviewSnapshot,
  readVehicleReviewSnapshot,
  vehicleApprovalBlockers,
} from '../vehicles/vehicle-review-snapshot';
import { lockVehicleRow } from '../vehicles/vehicle-row-lock';

/** Ba quyết định trên một phiếu duyệt — `APPROVAL_DECISION` ở @xeprime/types (ADR 0005). */
export type ApprovalDecisionKind = ApprovalDecision;

/** Phần chung, độc lập với loại đối tượng: status phiếu, action ghi log, có bắt buộc lý do. */
const DECISION: Record<
  ApprovalDecisionKind,
  { approval: ApprovalStatus; logAction: ApprovalAction; needsReason: boolean }
> = {
  [APPROVAL_DECISION.APPROVE]: {
    approval: APPROVAL_STATUS.APPROVED,
    logAction: APPROVAL_ACTION.APPROVE,
    needsReason: false,
  },
  [APPROVAL_DECISION.REJECT]: {
    approval: APPROVAL_STATUS.REJECTED,
    logAction: APPROVAL_ACTION.REJECT,
    needsReason: true,
  },
  [APPROVAL_DECISION.REQUEST_REVISION]: {
    approval: APPROVAL_STATUS.NEEDS_REVISION,
    logAction: APPROVAL_ACTION.REQUEST_REVISION,
    needsReason: true,
  },
};

/**
 * Trạng thái XÁC MINH của gian hàng theo quyết định (ADR 0036).
 *
 * ⚠️ Đây KHÔNG còn là `tenants.status`. Bản cũ ghi `active`/`rejected`/`needs_revision` thẳng
 * vào cột đó, và vì `TENANT_STATUS_PUBLISHABLE` chỉ nhận `active`, một quyết định "cần bổ sung"
 * trên hồ sơ pháp nhân sẽ GỠ TOÀN BỘ XE của gian hàng khỏi marketplace — kể cả những chiếc đã
 * được duyệt riêng và đang có đơn. Hai việc không liên quan đến nhau bị buộc chung một cột.
 *
 * Giờ trục xác minh sống trên chính phiếu duyệt (`resolveShopVerification`), và `tenants.status`
 * chỉ đổi bằng khoá/mở khoá của `PlatformTenantsService` — cộng đúng một đường chữa dữ liệu cũ
 * ở `applyTenantDecision`.
 */
const SHOP_VERIFICATION_BY_KIND: Record<ApprovalDecisionKind, ShopVerification> = {
  [APPROVAL_DECISION.APPROVE]: SHOP_VERIFICATION.VERIFIED,
  [APPROVAL_DECISION.REJECT]: SHOP_VERIFICATION.REJECTED,
  [APPROVAL_DECISION.REQUEST_REVISION]: SHOP_VERIFICATION.NEEDS_REVISION,
};
const TENANT_NOTIFY_BY_KIND: Record<ApprovalDecisionKind, NotificationType> = {
  [APPROVAL_DECISION.APPROVE]: NOTIFICATION_TYPE.SHOP_APPROVED,
  [APPROVAL_DECISION.REJECT]: NOTIFICATION_TYPE.SHOP_REJECTED,
  [APPROVAL_DECISION.REQUEST_REVISION]: NOTIFICATION_TYPE.SHOP_NEEDS_REVISION,
};

/** Status public của xe + loại thông báo theo quyết định (phiếu duyệt xe). */
const VEHICLE_STATUS_BY_KIND: Record<ApprovalDecisionKind, VehiclePublicStatus> = {
  [APPROVAL_DECISION.APPROVE]: VEHICLE_PUBLIC_STATUS.APPROVED_PUBLIC,
  [APPROVAL_DECISION.REJECT]: VEHICLE_PUBLIC_STATUS.REJECTED,
  [APPROVAL_DECISION.REQUEST_REVISION]: VEHICLE_PUBLIC_STATUS.NEEDS_REVISION,
};
/**
 * `request_revision` có loại thông báo RIÊNG từ 14/09/2026 — trước đó nó không gửi gì.
 *
 * Đó là tin quan trọng nhất của cả vòng đăng xe: chiếc xe rời hàng đợi và quay về tay chủ xe.
 * Không báo thì nó nằm im ở `needs_revision` vô thời hạn, và chủ xe chỉ biết nếu tự mở lại đúng
 * màn xe đó. Mượn `VEHICLE_REJECTED` cũng không được — hai việc phải làm khác hẳn nhau.
 */
const VEHICLE_NOTIFY_BY_KIND: Record<ApprovalDecisionKind, NotificationType> = {
  [APPROVAL_DECISION.APPROVE]: NOTIFICATION_TYPE.VEHICLE_APPROVED,
  [APPROVAL_DECISION.REJECT]: NOTIFICATION_TYPE.VEHICLE_REJECTED,
  [APPROVAL_DECISION.REQUEST_REVISION]: NOTIFICATION_TYPE.VEHICLE_NEEDS_REVISION,
};

const SHOP_NOTIFY_TITLE: Record<ApprovalDecisionKind, string> = {
  [APPROVAL_DECISION.APPROVE]: 'Gian hàng đã được xác minh',
  [APPROVAL_DECISION.REJECT]: 'Hồ sơ gian hàng bị từ chối',
  [APPROVAL_DECISION.REQUEST_REVISION]: 'Hồ sơ gian hàng cần bổ sung',
};

const VEHICLE_NOTIFY_TITLE: Record<ApprovalDecisionKind, string> = {
  [APPROVAL_DECISION.APPROVE]: 'Xe đã được duyệt công khai',
  [APPROVAL_DECISION.REJECT]: 'Xe bị từ chối',
  [APPROVAL_DECISION.REQUEST_REVISION]: 'Xe cần bổ sung để lên chợ',
};

/**
 * Trạng thái của gian hàng CŨ chưa từng được mở — dữ liệu sinh trước ADR 0036.
 *
 * Từ ADR 0036 tenant mới mở ra đã là `active`, nên ba giá trị này chỉ còn xuất hiện ở dữ liệu cũ.
 * `rejected` và `suspended` cố ý KHÔNG nằm trong danh sách: chúng là quyết định moderation.
 */
const LEGACY_UNOPENED_TENANT_STATUS: readonly TenantStatus[] = [
  TENANT_STATUS.DRAFT,
  TENANT_STATUS.PENDING_REVIEW,
  TENANT_STATUS.NEEDS_REVISION,
];

@Injectable()
export class PlatformApprovalService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
    private readonly notifications: NotificationService,
    private readonly listings: ListingsService,
  ) {}

  async list(
    query: ApprovalListQueryDto,
  ): Promise<{ data: ApprovalTaskListItemDto[]; meta: PaginationMeta }> {
    const paging = resolvePaging(query, APPROVAL_DEFAULT_LIMIT, APPROVAL_MAX_LIMIT);

    const where: Prisma.ApprovalTaskWhereInput = {
      ...(query.status ? { status: query.status } : {}),
      ...(query.targetType ? { targetType: query.targetType } : {}),
    };

    const [total, rows] = await this.prisma.$transaction([
      this.prisma.approvalTask.count({ where }),
      this.prisma.approvalTask.findMany({
        where,
        orderBy: { submittedAt: 'asc' }, // hàng đợi: cũ nhất trước
        skip: paging.skip,
        take: paging.take,
        select: {
          id: true,
          tenantId: true,
          targetType: true,
          targetId: true,
          status: true,
          submittedBy: true,
          submittedAt: true,
          reviewedAt: true,
          reason: true,
          tenant: { select: { name: true } },
          submitter: { select: { displayName: true } },
        },
      }),
    ]);

    return {
      data: rows.map((r) => ({
        id: r.id,
        tenantId: r.tenantId,
        tenantName: r.tenant?.name ?? null,
        targetType: r.targetType,
        targetId: r.targetId,
        status: r.status,
        submittedBy: r.submittedBy,
        submittedByName: r.submitter?.displayName ?? null,
        submittedAt: r.submittedAt.toISOString(),
        reviewedAt: r.reviewedAt?.toISOString() ?? null,
        reason: r.reason,
      })),
      meta: paginationMeta(paging, total),
    };
  }

  async getTask(id: string): Promise<ApprovalTaskDetailDto> {
    const task = await this.prisma.approvalTask.findUnique({
      where: { id },
      select: {
        id: true,
        tenantId: true,
        targetType: true,
        targetId: true,
        status: true,
        submittedBy: true,
        submittedAt: true,
        reviewedAt: true,
        reason: true,
        snapshot: true,
        tenant: {
          select: {
            id: true,
            code: true,
            name: true,
            tenantType: true,
            status: true,
            phone: true,
            email: true,
            // Tuyến của gian hàng (ADR 0028 điều 1) — reviewer soi hai tuyến ở hai mức khác nhau.
            subscriptions: {
              where: currentSubscriptionWhere(new Date()),
              orderBy: { endsAt: 'desc' },
              take: 1,
              select: { billingMode: true },
            },
            _count: {
              select: {
                vehicles: {
                  where: {
                    publicStatus: VEHICLE_PUBLIC_STATUS.APPROVED_PUBLIC,
                    deletedAt: null,
                  },
                },
              },
            },
          },
        },
        submitter: { select: { displayName: true } },
        logs: {
          orderBy: { createdAt: 'asc' },
          select: {
            action: true,
            fromStatus: true,
            toStatus: true,
            note: true,
            createdAt: true,
            actor: { select: { displayName: true } },
          },
        },
      },
    });
    if (!task) throw approvalNotFound();

    return {
      id: task.id,
      tenantId: task.tenantId,
      tenantName: task.tenant?.name ?? null,
      targetType: task.targetType,
      targetId: task.targetId,
      status: task.status,
      submittedBy: task.submittedBy,
      submittedByName: task.submitter?.displayName ?? null,
      submittedAt: task.submittedAt.toISOString(),
      reviewedAt: task.reviewedAt?.toISOString() ?? null,
      reason: task.reason,
      snapshot: (task.snapshot as Record<string, unknown> | null) ?? null,
      tenant: task.tenant
        ? {
            id: task.tenant.id,
            code: task.tenant.code,
            name: task.tenant.name,
            tenantType: task.tenant.tenantType,
            status: task.tenant.status,
            phone: task.tenant.phone,
            email: task.tenant.email,
            billingMode: task.tenant.subscriptions[0]?.billingMode ?? null,
            publicVehicleCount: task.tenant._count.vehicles,
          }
        : null,
      logs: task.logs.map((l) => ({
        action: l.action,
        fromStatus: l.fromStatus,
        toStatus: l.toStatus,
        note: l.note,
        actorName: l.actor?.displayName ?? null,
        createdAt: l.createdAt.toISOString(),
      })),
    };
  }

  async approve(id: string, reviewerId: string, reason?: string): Promise<ApprovalTaskDetailDto> {
    await this.decide(APPROVAL_DECISION.APPROVE, id, reviewerId, reason);
    return this.getTask(id);
  }

  async reject(id: string, reviewerId: string, reason?: string): Promise<ApprovalTaskDetailDto> {
    await this.decide(APPROVAL_DECISION.REJECT, id, reviewerId, reason);
    return this.getTask(id);
  }

  async requestRevision(
    id: string,
    reviewerId: string,
    reason?: string,
  ): Promise<ApprovalTaskDetailDto> {
    await this.decide(APPROVAL_DECISION.REQUEST_REVISION, id, reviewerId, reason);
    return this.getTask(id);
  }

  /**
   * Duyệt/từ chối/yêu cầu bổ sung một phiếu — MỘT transaction từ đầu tới cuối.
   *
   * Thứ tự bên trong là điều quan trọng nhất của hàm này:
   *
   *  1. **Khoá dòng phiếu** (`lockApprovalTask`), rồi mới đọc `status`. Bản cũ đọc NGOÀI
   *     transaction, nên hai người duyệt bấm cùng lúc đều thấy `pending` và cùng ghi.
   *  2. **Phiếu xe + Phê duyệt ⇒ danh mục kiểm tra thủ công phải đủ** — đọc DƯỚI khoá, nên không
   *     có lượt bỏ đánh dấu nào chen được vào giữa. Từ chối và yêu cầu bổ sung KHÔNG qua cổng này:
   *     người duyệt được trả xe về ngay khi thấy vấn đề đầu tiên, không phải đi hết danh mục.
   *  3. Đổi trạng thái đối tượng + chốt phiếu + log + audit + thông báo (+ listing với xe) — cùng
   *     sống cùng chết (CLAUDE.md mục 6, lằn ranh 3).
   *
   * `targetType` (tuỳ chọn): nơi gọi khẳng định loại phiếu nó đang xử lý. Màn "Duyệt xe" truyền
   * `vehicle`, nên một id phiếu gian hàng gửi nhầm vào route xe là 404 — không phải một quyết
   * định xác minh gian hàng đi ra từ màn duyệt xe.
   */
  async decide(
    kind: ApprovalDecisionKind,
    id: string,
    reviewerId: string,
    reason?: string,
    opts: { targetType?: ApprovalTargetType } = {},
  ): Promise<void> {
    const decision = DECISION[kind];
    const trimmedReason = reason?.trim() || undefined;
    if (decision.needsReason && !trimmedReason) throw reasonRequired();

    await this.prisma.$transaction(async (tx) => {
      const task = await lockApprovalTask(tx, id);
      if (!task || (opts.targetType && task.targetType !== opts.targetType)) {
        throw approvalNotFound();
      }
      assertApprovalPending(task);

      if (task.targetType === APPROVAL_TARGET_TYPE.TENANT) {
        await this.applyTenantDecision(tx, kind, task, reviewerId, trimmedReason);
      } else if (task.targetType === APPROVAL_TARGET_TYPE.VEHICLE) {
        const passedChecks =
          kind === APPROVAL_DECISION.APPROVE ? await this.assertVehicleApprovable(tx, task) : null;
        await this.applyVehicleDecision(tx, kind, task, reviewerId, trimmedReason, passedChecks);
      } else {
        // Phiếu giấy tờ (tenant_document/vehicle_document) mở ở phase sau.
        throw new BadRequestException({
          code: API_ERROR_CODE.VALIDATION_FAILED,
          message: 'Loại phiếu này chưa được hỗ trợ duyệt.',
        });
      }
    });
  }

  /**
   * Cổng THẬT của nút Phê duyệt xe — chạy DƯỚI khoá dòng phiếu, rồi khoá dòng XE (`lockVehicleRow`)
   * trước khi đọc xe sống: một lượt sửa của chủ xe đang dở phải commit xong (và bị so) hoặc chờ
   * sau lượt duyệt (và gặp `VEHICLE_FIELD_LOCKED`), không lọt vào giữa "đọc" và "chốt":
   *
   *  1. đủ năm mục kiểm tra thủ công (`APPROVAL_CHECKLIST_INCOMPLETE`);
   *  2. xe SỐNG khớp hồ sơ đã duyệt (`APPROVAL_SUBJECT_CHANGED`, `details` = `VehicleApprovalBlockers`):
   *     - vẫn qua cổng lên chợ — Phê duyệt đưa xe SỐNG lên chợ, không phải ảnh chụp;
   *     - căn cước khớp ảnh chụp lúc gửi — duyệt là khoá căn cước, không được khoá giá trị chưa ai
   *       duyệt.
   *     Một mã cho cả hai vì lối đi tiếp là MỘT: yêu cầu bổ sung để chủ xe gửi lại. (Không dùng
   *     `VEHICLE_PUBLISH_INCOMPLETE` — mã đó nói với CHỦ XE rằng họ chưa gửi duyệt được.)
   *
   * Trả các mục thủ công đã đạt để ghi vào audit của quyết định.
   */
  private async assertVehicleApprovable(
    tx: Prisma.TransactionClient,
    task: LockedApprovalTask,
  ): Promise<VehicleReviewCheck[]> {
    const passed = await assertVehicleChecksComplete(tx, task.id);
    if (!(await lockVehicleRow(tx, task.targetId))) throw approvalNotFound();

    const [live, stored] = await Promise.all([
      // Chính sách thuê không tham gia hai phép kiểm dưới — không cần nạp.
      buildVehicleReviewSnapshot(tx, { vehicleId: task.targetId, policy: null, now: new Date() }),
      tx.approvalTask.findUniqueOrThrow({ where: { id: task.id }, select: { snapshot: true } }),
    ]);
    if (!live) throw approvalNotFound();

    const blockers = vehicleApprovalBlockers(live, readVehicleReviewSnapshot(stored.snapshot));
    if (blockers.missingRequirements.length > 0 || blockers.changedLockedFields.length > 0) {
      throw new ConflictException({
        code: API_ERROR_CODE.APPROVAL_SUBJECT_CHANGED,
        message: 'Xe đã khác hồ sơ gửi duyệt nên chưa phê duyệt được.',
        details: blockers,
      });
    }
    return passed;
  }

  /** Cập nhật phiếu + ghi approval_log (phần chung mọi loại đối tượng). */
  private async finalizeTask(
    tx: Prisma.TransactionClient,
    task: LockedApprovalTask,
    kind: ApprovalDecisionKind,
    reviewerId: string,
    reason?: string,
  ): Promise<void> {
    const decision = DECISION[kind];
    await tx.approvalTask.update({
      where: { id: task.id },
      data: {
        status: decision.approval,
        reviewedBy: reviewerId,
        reviewedAt: new Date(),
        reason: reason ?? null,
      },
    });
    await tx.approvalLog.create({
      data: {
        id: newId(),
        approvalTaskId: task.id,
        action: decision.logAction,
        fromStatus: task.status,
        toStatus: decision.approval,
        note: reason ?? null,
        actorUserId: reviewerId,
      },
    });
  }

  /**
   * Nhánh XÁC MINH GIAN HÀNG: chốt phiếu + audit + báo chủ shop.
   *
   * Quyết định ở đây **không** đụng `tenants.status` nữa (xem `SHOP_VERIFICATION_BY_KIND`), với
   * đúng MỘT ngoại lệ: gian hàng cũ còn nằm ở `draft`/`pending_review`/`needs_revision` — dữ liệu
   * sinh ra trước ADR 0036 — được DUYỆT thì mở luôn sang `active`. Đó là đường chữa cho những hồ
   * sơ đang kẹt, không phải một quy tắc mới; migration backfill cũng làm đúng việc đó cho phần
   * còn lại.
   *
   * Cố ý KHÔNG tự `active` hoá một gian hàng đang `suspended`/`rejected`: cả hai là quyết định
   * moderation của con người, và gỡ chúng phải đi qua chính đường mở khoá.
   */
  private async applyTenantDecision(
    tx: Prisma.TransactionClient,
    kind: ApprovalDecisionKind,
    task: LockedApprovalTask,
    reviewerId: string,
    reason?: string,
  ): Promise<void> {
    if (!task.tenantId) throw approvalNotFound();
    const tenantId = task.tenantId;
    const decision = DECISION[kind];
    const verification = SHOP_VERIFICATION_BY_KIND[kind];
    const notifyType = TENANT_NOTIFY_BY_KIND[kind];

    const tenant = await tx.tenant.findUniqueOrThrow({
      where: { id: tenantId },
      select: { status: true, name: true, ownerUserId: true },
    });

    await this.finalizeTask(tx, task, kind, reviewerId, reason);

    const healStatus =
      kind === APPROVAL_DECISION.APPROVE &&
      LEGACY_UNOPENED_TENANT_STATUS.includes(tenant.status as TenantStatus);
    if (healStatus) {
      await tx.tenant.update({
        where: { id: tenantId },
        data: { status: TENANT_STATUS.ACTIVE },
      });
    }

    await this.audit.record(
      {
        tenantId,
        actorUserId: reviewerId,
        actorScope: 'platform',
        action: `approval.${decision.logAction}`,
        targetType: APPROVAL_TARGET_TYPE.TENANT,
        targetId: tenantId,
        before: { tenantStatus: tenant.status, approvalStatus: task.status },
        after: {
          tenantStatus: healStatus ? TENANT_STATUS.ACTIVE : tenant.status,
          approvalStatus: decision.approval,
          verification,
        },
      },
      tx,
    );

    await this.notifications.emitToUser(
      tenant.ownerUserId,
      {
        type: notifyType,
        title: SHOP_NOTIFY_TITLE[kind],
        body: reason ? `${tenant.name} · ${reason}` : tenant.name,
        tenantId,
        targetType: NOTIFICATION_TARGET_TYPE.TENANT,
        targetId: tenantId,
        // Người nhận là CHỦ gian hàng, nên đích là khu quản lý — không phải mặc định
        // "khu khách" của `emitToUser`.
        audience: NOTIFICATION_AUDIENCE.MANAGE,
      },
      tx,
    );
  }

  /**
   * Nhánh duyệt xe: đổi vehicle.publicStatus + đồng bộ listing + audit + báo chủ xe (ADR 0008).
   *
   * `passedChecks` chỉ có ở lượt PHÊ DUYỆT — các mục kiểm tra thủ công đã đạt, ghi vào audit để
   * quyết định mang theo bằng chứng nó dựa trên.
   */
  private async applyVehicleDecision(
    tx: Prisma.TransactionClient,
    kind: ApprovalDecisionKind,
    task: LockedApprovalTask,
    reviewerId: string,
    reason: string | undefined,
    passedChecks: readonly string[] | null,
  ): Promise<void> {
    const decision = DECISION[kind];
    const publicStatus = VEHICLE_STATUS_BY_KIND[kind];
    const notifyType = VEHICLE_NOTIFY_BY_KIND[kind];

    // Xe đã xoá mềm không còn gì để quyết: duyệt nó là báo chủ xe "xe đã lên chợ" cho một chiếc
    // xe họ đã bỏ. `VehiclesService.remove` huỷ phiếu chờ; đây là chốt cho dữ liệu cũ.
    const vehicle = await tx.vehicle.findFirst({
      where: { id: task.targetId, deletedAt: null },
      select: {
        id: true,
        tenantId: true,
        name: true,
        publicStatus: true,
        tenant: { select: { ownerUserId: true } },
      },
    });
    if (!vehicle) throw approvalNotFound();

    await this.finalizeTask(tx, task, kind, reviewerId, reason);
    await tx.vehicle.update({ where: { id: vehicle.id }, data: { publicStatus } });
    // Đồng bộ snapshot: duyệt → listing active; từ chối/bổ sung → ẩn (ADR 0008).
    await this.listings.syncFromVehicle(vehicle.id, tx);

    await this.audit.record(
      {
        tenantId: vehicle.tenantId,
        actorUserId: reviewerId,
        actorScope: 'platform',
        action: `approval.${decision.logAction}`,
        targetType: APPROVAL_TARGET_TYPE.VEHICLE,
        targetId: vehicle.id,
        before: { publicStatus: vehicle.publicStatus, approvalStatus: task.status },
        after: {
          publicStatus,
          approvalStatus: decision.approval,
          approvalTaskId: task.id,
          ...(passedChecks ? { manualChecks: [...passedChecks] } : {}),
        },
      },
      tx,
    );

    await this.notifications.emitToUser(
      vehicle.tenant.ownerUserId,
      {
        type: notifyType,
        title: VEHICLE_NOTIFY_TITLE[kind],
        body: reason ? `${vehicle.name} · ${reason}` : vehicle.name,
        tenantId: vehicle.tenantId,
        targetType: NOTIFICATION_TARGET_TYPE.VEHICLE,
        targetId: vehicle.id,
        audience: NOTIFICATION_AUDIENCE.MANAGE,
      },
      tx,
    );
  }
}

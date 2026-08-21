import { BadRequestException, ConflictException, Injectable, NotFoundException } from '@nestjs/common';
import { newId, Prisma } from '@xeprime/prisma';
import {
  APPROVAL_ACTION,
  APPROVAL_STATUS,
  APPROVAL_TARGET_TYPE,
  API_ERROR_CODE,
  NOTIFICATION_TARGET_TYPE,
  NOTIFICATION_TYPE,
  TENANT_STATUS,
  VEHICLE_PUBLIC_STATUS,
  type ApprovalAction,
  type ApprovalStatus,
  type NotificationType,
  type PaginationMeta,
  type TenantStatus,
  type VehiclePublicStatus,
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

type ReviewKind = 'approve' | 'reject' | 'request_revision';

/** Phần chung, độc lập với loại đối tượng: status phiếu, action ghi log, có bắt buộc lý do. */
const DECISION: Record<
  ReviewKind,
  { approval: ApprovalStatus; logAction: ApprovalAction; needsReason: boolean }
> = {
  approve: { approval: APPROVAL_STATUS.APPROVED, logAction: APPROVAL_ACTION.APPROVE, needsReason: false },
  reject: { approval: APPROVAL_STATUS.REJECTED, logAction: APPROVAL_ACTION.REJECT, needsReason: true },
  request_revision: {
    approval: APPROVAL_STATUS.NEEDS_REVISION,
    logAction: APPROVAL_ACTION.REQUEST_REVISION,
    needsReason: true,
  },
};

/** Status tenant + loại thông báo theo quyết định (phiếu duyệt gian hàng). */
const TENANT_STATUS_BY_KIND: Record<ReviewKind, TenantStatus> = {
  approve: TENANT_STATUS.ACTIVE,
  reject: TENANT_STATUS.REJECTED,
  request_revision: TENANT_STATUS.NEEDS_REVISION,
};
// request_revision chưa có loại thông báo riêng cho "cần bổ sung" — mở sau.
const TENANT_NOTIFY_BY_KIND: Record<ReviewKind, NotificationType | null> = {
  approve: NOTIFICATION_TYPE.SHOP_APPROVED,
  reject: NOTIFICATION_TYPE.SHOP_REJECTED,
  request_revision: null,
};

/** Status public của xe + loại thông báo theo quyết định (phiếu duyệt xe). */
const VEHICLE_STATUS_BY_KIND: Record<ReviewKind, VehiclePublicStatus> = {
  approve: VEHICLE_PUBLIC_STATUS.APPROVED_PUBLIC,
  reject: VEHICLE_PUBLIC_STATUS.REJECTED,
  request_revision: VEHICLE_PUBLIC_STATUS.NEEDS_REVISION,
};
const VEHICLE_NOTIFY_BY_KIND: Record<ReviewKind, NotificationType | null> = {
  approve: NOTIFICATION_TYPE.VEHICLE_APPROVED,
  reject: NOTIFICATION_TYPE.VEHICLE_REJECTED,
  request_revision: null,
};

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
    if (!task) throw notFound();

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

  approve(id: string, reviewerId: string, reason?: string): Promise<ApprovalTaskDetailDto> {
    return this.review('approve', id, reviewerId, reason);
  }

  reject(id: string, reviewerId: string, reason?: string): Promise<ApprovalTaskDetailDto> {
    return this.review('reject', id, reviewerId, reason);
  }

  requestRevision(id: string, reviewerId: string, reason?: string): Promise<ApprovalTaskDetailDto> {
    return this.review('request_revision', id, reviewerId, reason);
  }

  /**
   * Duyệt/từ chối/yêu cầu bổ sung một phiếu. Điều phối theo loại đối tượng (gian hàng | xe);
   * mỗi nhánh đổi status đối tượng + ghi approval_log + audit + thông báo trong MỘT transaction —
   * quyết định duyệt và dấu vết của nó cùng sống cùng chết (CLAUDE.md mục 6, lằn ranh 3).
   */
  private async review(
    kind: ReviewKind,
    id: string,
    reviewerId: string,
    reason?: string,
  ): Promise<ApprovalTaskDetailDto> {
    const decision = DECISION[kind];
    const trimmedReason = reason?.trim() || undefined;
    if (decision.needsReason && !trimmedReason) {
      throw new BadRequestException({
        code: API_ERROR_CODE.VALIDATION_FAILED,
        message: 'Vui lòng nhập lý do gửi cho chủ shop',
      });
    }

    const task = await this.prisma.approvalTask.findUnique({
      where: { id },
      select: { id: true, status: true, tenantId: true, targetType: true, targetId: true },
    });
    if (!task) throw notFound();

    if (task.status !== APPROVAL_STATUS.PENDING) {
      throw new ConflictException({
        code: API_ERROR_CODE.INVALID_STATUS_TRANSITION,
        message: 'Phiếu này đã được xử lý.',
      });
    }

    if (task.targetType === APPROVAL_TARGET_TYPE.TENANT) {
      await this.applyTenantDecision(kind, task, reviewerId, trimmedReason);
    } else if (task.targetType === APPROVAL_TARGET_TYPE.VEHICLE) {
      await this.applyVehicleDecision(kind, task, reviewerId, trimmedReason);
    } else {
      // Phiếu giấy tờ (tenant_document/vehicle_document) mở ở phase sau.
      throw new BadRequestException({
        code: API_ERROR_CODE.VALIDATION_FAILED,
        message: 'Loại phiếu này chưa được hỗ trợ duyệt.',
      });
    }

    return this.getTask(id);
  }

  /** Cập nhật phiếu + ghi approval_log (phần chung mọi loại đối tượng). */
  private async finalizeTask(
    tx: Prisma.TransactionClient,
    task: ReviewTask,
    kind: ReviewKind,
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

  /** Nhánh duyệt gian hàng: đổi tenant.status + audit + báo chủ shop. */
  private async applyTenantDecision(
    kind: ReviewKind,
    task: ReviewTask,
    reviewerId: string,
    reason?: string,
  ): Promise<void> {
    if (!task.tenantId) throw notFound();
    const tenantId = task.tenantId;
    const decision = DECISION[kind];
    const tenantStatus = TENANT_STATUS_BY_KIND[kind];
    const notifyType = TENANT_NOTIFY_BY_KIND[kind];

    await this.prisma.$transaction(async (tx) => {
      const tenant = await tx.tenant.findUniqueOrThrow({
        where: { id: tenantId },
        select: { status: true, name: true, ownerUserId: true },
      });

      await this.finalizeTask(tx, task, kind, reviewerId, reason);
      await tx.tenant.update({ where: { id: tenantId }, data: { status: tenantStatus } });

      await this.audit.record(
        {
          tenantId,
          actorUserId: reviewerId,
          actorScope: 'platform',
          action: `approval.${decision.logAction}`,
          targetType: APPROVAL_TARGET_TYPE.TENANT,
          targetId: tenantId,
          before: { tenantStatus: tenant.status, approvalStatus: task.status },
          after: { tenantStatus, approvalStatus: decision.approval },
        },
        tx,
      );

      if (notifyType) {
        await this.notifications.emitToUser(
          tenant.ownerUserId,
          {
            type: notifyType,
            title:
              notifyType === NOTIFICATION_TYPE.SHOP_APPROVED
                ? 'Gian hàng đã được duyệt'
                : 'Gian hàng bị từ chối',
            body: reason ? `${tenant.name} · ${reason}` : tenant.name,
            tenantId,
            targetType: NOTIFICATION_TARGET_TYPE.TENANT,
            targetId: tenantId,
          },
          tx,
        );
      }
    });
  }

  /** Nhánh duyệt xe: đổi vehicle.publicStatus + audit + báo chủ shop (ADR 0008). */
  private async applyVehicleDecision(
    kind: ReviewKind,
    task: ReviewTask,
    reviewerId: string,
    reason?: string,
  ): Promise<void> {
    const decision = DECISION[kind];
    const publicStatus = VEHICLE_STATUS_BY_KIND[kind];
    const notifyType = VEHICLE_NOTIFY_BY_KIND[kind];

    await this.prisma.$transaction(async (tx) => {
      const vehicle = await tx.vehicle.findUnique({
        where: { id: task.targetId },
        select: { id: true, tenantId: true, name: true, publicStatus: true },
      });
      if (!vehicle) throw notFound();

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
          after: { publicStatus, approvalStatus: decision.approval },
        },
        tx,
      );

      if (notifyType) {
        const owner = await tx.tenant.findUnique({
          where: { id: vehicle.tenantId },
          select: { ownerUserId: true },
        });
        if (owner) {
          await this.notifications.emitToUser(
            owner.ownerUserId,
            {
              type: notifyType,
              title:
                notifyType === NOTIFICATION_TYPE.VEHICLE_APPROVED
                  ? 'Xe đã được duyệt công khai'
                  : 'Xe bị từ chối',
              body: reason ? `${vehicle.name} · ${reason}` : vehicle.name,
              tenantId: vehicle.tenantId,
              targetType: NOTIFICATION_TARGET_TYPE.VEHICLE,
              targetId: vehicle.id,
            },
            tx,
          );
        }
      }
    });
  }
}

/** Phiếu duyệt đã nạp đủ cột lõi để điều phối + ghi log. */
interface ReviewTask {
  id: string;
  status: string;
  tenantId: string | null;
  targetType: string;
  targetId: string;
}

function notFound(): NotFoundException {
  return new NotFoundException({
    code: API_ERROR_CODE.NOT_FOUND,
    message: 'Không tìm thấy phiếu duyệt',
  });
}

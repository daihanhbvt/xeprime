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
  type ApprovalAction,
  type ApprovalStatus,
  type NotificationType,
  type PaginationMeta,
  type TenantStatus,
} from '@xeprime/types';
import { AuditService } from '../audit/audit.service';
import { NotificationService } from '../notification/notification.service';
import { PrismaService } from '../../prisma/prisma.service';
import {
  APPROVAL_DEFAULT_LIMIT,
  APPROVAL_MAX_LIMIT,
  ApprovalListQueryDto,
  ApprovalTaskDetailDto,
  ApprovalTaskListItemDto,
} from './dto/approval.dto';

/** Kết cục mỗi hành động duyệt: status phiếu, status tenant, action ghi log, loại thông báo. */
const OUTCOMES: Record<
  'approve' | 'reject' | 'request_revision',
  {
    approval: ApprovalStatus;
    tenant: TenantStatus;
    logAction: ApprovalAction;
    needsReason: boolean;
    notifyType: NotificationType | null;
  }
> = {
  approve: {
    approval: APPROVAL_STATUS.APPROVED,
    tenant: TENANT_STATUS.ACTIVE,
    logAction: APPROVAL_ACTION.APPROVE,
    needsReason: false,
    notifyType: NOTIFICATION_TYPE.SHOP_APPROVED,
  },
  reject: {
    approval: APPROVAL_STATUS.REJECTED,
    tenant: TENANT_STATUS.REJECTED,
    logAction: APPROVAL_ACTION.REJECT,
    needsReason: true,
    notifyType: NOTIFICATION_TYPE.SHOP_REJECTED,
  },
  request_revision: {
    approval: APPROVAL_STATUS.NEEDS_REVISION,
    tenant: TENANT_STATUS.NEEDS_REVISION,
    logAction: APPROVAL_ACTION.REQUEST_REVISION,
    needsReason: true,
    // Chưa có loại thông báo riêng cho "cần bổ sung" — mở sau.
    notifyType: null,
  },
};

@Injectable()
export class PlatformApprovalService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
    private readonly notifications: NotificationService,
  ) {}

  async list(
    query: ApprovalListQueryDto,
  ): Promise<{ data: ApprovalTaskListItemDto[]; meta: PaginationMeta }> {
    const page = Math.max(1, query.page ?? 1);
    const limit = Math.min(APPROVAL_MAX_LIMIT, Math.max(1, query.limit ?? APPROVAL_DEFAULT_LIMIT));

    const where: Prisma.ApprovalTaskWhereInput = {
      ...(query.status ? { status: query.status } : {}),
      ...(query.targetType ? { targetType: query.targetType } : {}),
    };

    const [total, rows] = await this.prisma.$transaction([
      this.prisma.approvalTask.count({ where }),
      this.prisma.approvalTask.findMany({
        where,
        orderBy: { submittedAt: 'asc' }, // hàng đợi: cũ nhất trước
        skip: (page - 1) * limit,
        take: limit,
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
      meta: { page, limit, total, hasNext: page * limit < total },
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
   * Duyệt/từ chối/yêu cầu bổ sung một phiếu. Đổi status phiếu + status tenant + ghi
   * approval_log + audit trong MỘT transaction — quyết định duyệt và dấu vết của nó cùng
   * sống cùng chết (CLAUDE.md mục 6, lằn ranh 3).
   */
  private async review(
    kind: 'approve' | 'reject' | 'request_revision',
    id: string,
    reviewerId: string,
    reason?: string,
  ): Promise<ApprovalTaskDetailDto> {
    const outcome = OUTCOMES[kind];
    const trimmedReason = reason?.trim() || undefined;
    if (outcome.needsReason && !trimmedReason) {
      throw new BadRequestException({
        code: API_ERROR_CODE.VALIDATION_FAILED,
        message: 'Vui lòng nhập lý do gửi cho chủ shop',
      });
    }

    const task = await this.prisma.approvalTask.findUnique({
      where: { id },
      select: { id: true, status: true, tenantId: true, targetType: true },
    });
    if (!task) throw notFound();

    if (task.status !== APPROVAL_STATUS.PENDING) {
      throw new ConflictException({
        code: API_ERROR_CODE.INVALID_STATUS_TRANSITION,
        message: 'Phiếu này đã được xử lý.',
      });
    }
    // Hiện chỉ có phiếu duyệt gian hàng; phiếu xe/giấy tờ mở ở phase sau.
    if (task.targetType !== APPROVAL_TARGET_TYPE.TENANT || !task.tenantId) {
      throw new BadRequestException({
        code: API_ERROR_CODE.VALIDATION_FAILED,
        message: 'Loại phiếu này chưa được hỗ trợ duyệt.',
      });
    }

    const tenantId = task.tenantId;

    await this.prisma.$transaction(async (tx) => {
      const tenant = await tx.tenant.findUniqueOrThrow({
        where: { id: tenantId },
        select: { status: true, name: true, ownerUserId: true },
      });

      await tx.approvalTask.update({
        where: { id },
        data: {
          status: outcome.approval,
          reviewedBy: reviewerId,
          reviewedAt: new Date(),
          reason: trimmedReason ?? null,
        },
      });

      await tx.tenant.update({ where: { id: tenantId }, data: { status: outcome.tenant } });

      await tx.approvalLog.create({
        data: {
          id: newId(),
          approvalTaskId: id,
          action: outcome.logAction,
          fromStatus: task.status,
          toStatus: outcome.approval,
          note: trimmedReason ?? null,
          actorUserId: reviewerId,
        },
      });

      await this.audit.record(
        {
          tenantId,
          actorUserId: reviewerId,
          actorScope: 'platform',
          action: `approval.${outcome.logAction}`,
          targetType: APPROVAL_TARGET_TYPE.TENANT,
          targetId: tenantId,
          before: { tenantStatus: tenant.status, approvalStatus: task.status },
          after: { tenantStatus: outcome.tenant, approvalStatus: outcome.approval },
        },
        tx,
      );

      // Báo chủ gian hàng kết quả duyệt (duyệt/từ chối). request_revision chưa có loại riêng.
      if (outcome.notifyType) {
        await this.notifications.emitToUser(
          tenant.ownerUserId,
          {
            type: outcome.notifyType,
            title:
              outcome.notifyType === NOTIFICATION_TYPE.SHOP_APPROVED
                ? 'Gian hàng đã được duyệt'
                : 'Gian hàng bị từ chối',
            body: trimmedReason ? `${tenant.name} · ${trimmedReason}` : tenant.name,
            tenantId,
            targetType: NOTIFICATION_TARGET_TYPE.TENANT,
            targetId: tenantId,
          },
          tx,
        );
      }
    });

    return this.getTask(id);
  }
}

function notFound(): NotFoundException {
  return new NotFoundException({
    code: API_ERROR_CODE.NOT_FOUND,
    message: 'Không tìm thấy phiếu duyệt',
  });
}

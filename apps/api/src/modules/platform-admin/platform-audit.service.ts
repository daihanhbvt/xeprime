import { Injectable, NotFoundException } from '@nestjs/common';
import { Prisma } from '@xeprime/prisma';
import { API_ERROR_CODE, type PaginationMeta } from '@xeprime/types';
import { PrismaService } from '../../prisma/prisma.service';
import {
  AUDIT_LOG_DEFAULT_LIMIT,
  AUDIT_LOG_MAX_LIMIT,
  AuditLogDetailDto,
  AuditLogDto,
  AuditLogListQueryDto,
} from './dto/audit-log.dto';

/** Select cho DANH SÁCH — tuyệt đối không kéo beforeJson/afterJson (JSONB nặng, drawer lấy riêng). */
const LIST_SELECT = {
  id: true,
  actorScope: true,
  action: true,
  targetType: true,
  targetId: true,
  tenantId: true,
  actorUserId: true,
  ipAddress: true,
  createdAt: true,
  tenant: { select: { name: true } },
  actor: { select: { displayName: true, email: true } },
} satisfies Prisma.AuditLogSelect;

/**
 * Đọc `audit_logs` cho admin nền tảng (Phase 7). Module `audit` (@Global) chỉ GHI — đường đọc
 * nằm ở đây để guard/permission platform không lây sang module ghi.
 */
@Injectable()
export class PlatformAuditService {
  constructor(private readonly prisma: PrismaService) {}

  async list(
    query: AuditLogListQueryDto,
  ): Promise<{ data: AuditLogDto[]; meta: PaginationMeta }> {
    const page = Math.max(1, query.page ?? 1);
    const limit = Math.min(AUDIT_LOG_MAX_LIMIT, Math.max(1, query.limit ?? AUDIT_LOG_DEFAULT_LIMIT));

    const createdAt =
      query.dateFrom || query.dateTo
        ? {
            ...(query.dateFrom ? { gte: new Date(query.dateFrom) } : {}),
            ...(query.dateTo ? { lte: new Date(query.dateTo) } : {}),
          }
        : undefined;

    const where: Prisma.AuditLogWhereInput = {
      ...(query.actorScope ? { actorScope: query.actorScope } : {}),
      ...(query.action ? { action: query.action } : {}),
      ...(query.targetType ? { targetType: query.targetType } : {}),
      ...(query.targetId ? { targetId: query.targetId } : {}),
      ...(query.tenantId ? { tenantId: query.tenantId } : {}),
      ...(query.actorUserId ? { actorUserId: query.actorUserId } : {}),
      ...(createdAt ? { createdAt } : {}),
    };

    const [total, rows] = await this.prisma.$transaction([
      this.prisma.auditLog.count({ where }),
      this.prisma.auditLog.findMany({
        where,
        // ULID id làm tiebreak — thứ tự ổn định khi nhiều log cùng mili-giây.
        orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
        skip: (page - 1) * limit,
        take: limit,
        select: LIST_SELECT,
      }),
    ]);

    return {
      data: rows.map(toListItem),
      meta: { page, limit, total, hasNext: page * limit < total },
    };
  }

  async getOne(id: string): Promise<AuditLogDetailDto> {
    const row = await this.prisma.auditLog.findUnique({
      where: { id },
      select: { ...LIST_SELECT, beforeJson: true, afterJson: true, userAgent: true },
    });
    if (!row) {
      throw new NotFoundException({
        code: API_ERROR_CODE.NOT_FOUND,
        message: 'Không tìm thấy dòng nhật ký',
      });
    }
    return {
      ...toListItem(row),
      beforeJson: row.beforeJson ?? null,
      afterJson: row.afterJson ?? null,
      userAgent: row.userAgent,
    };
  }
}

type AuditRow = Prisma.AuditLogGetPayload<{ select: typeof LIST_SELECT }>;

function toListItem(r: AuditRow): AuditLogDto {
  return {
    id: r.id,
    actorScope: r.actorScope,
    action: r.action,
    targetType: r.targetType,
    targetId: r.targetId,
    tenantId: r.tenantId,
    tenantName: r.tenant?.name ?? null,
    actorUserId: r.actorUserId,
    actorName: r.actor?.displayName ?? null,
    actorEmail: r.actor?.email ?? null,
    ipAddress: r.ipAddress,
    createdAt: (r.createdAt as Date).toISOString(),
  };
}

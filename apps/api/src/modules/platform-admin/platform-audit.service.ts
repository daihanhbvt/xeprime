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
import { paginationMeta, resolvePaging } from '../../common/pagination';
import { auditCategoryWhere } from './audit-category-where';
import { auditTargetKey, auditTargetLabels } from './audit-target-labels';

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
  supportContextId: true,
  createdAt: true,
  tenant: { select: { name: true } },
  actor: { select: { displayName: true, email: true } },
} satisfies Prisma.AuditLogSelect;

const ULID_PATTERN = /^[0-9A-HJKMNP-TV-Z]{26}$/i;

/**
 * Đọc `audit_logs` cho admin nền tảng (Phase 7). Module `audit` (@Global) chỉ GHI — đường đọc
 * nằm ở đây để guard/permission platform không lây sang module ghi.
 */
@Injectable()
export class PlatformAuditService {
  constructor(private readonly prisma: PrismaService) {}

  async list(query: AuditLogListQueryDto): Promise<{ data: AuditLogDto[]; meta: PaginationMeta }> {
    const paging = resolvePaging(query, AUDIT_LOG_DEFAULT_LIMIT, AUDIT_LOG_MAX_LIMIT);

    const createdAt =
      query.dateFrom || query.dateTo
        ? {
            ...(query.dateFrom ? { gte: new Date(query.dateFrom) } : {}),
            ...(query.dateTo ? { lte: new Date(query.dateTo) } : {}),
          }
        : undefined;

    const and: Prisma.AuditLogWhereInput[] = [];
    if (query.category) and.push(auditCategoryWhere(query.category));
    const q = query.q?.trim();
    if (q) and.push(this.searchWhere(q));

    const where: Prisma.AuditLogWhereInput = {
      ...(query.actorScope ? { actorScope: query.actorScope } : {}),
      ...(query.action ? { action: query.action } : {}),
      ...(query.targetType ? { targetType: query.targetType } : {}),
      ...(query.targetId ? { targetId: query.targetId } : {}),
      ...(query.tenantId ? { tenantId: query.tenantId } : {}),
      ...(query.actorUserId ? { actorUserId: query.actorUserId } : {}),
      ...(createdAt ? { createdAt } : {}),
      ...(and.length > 0 ? { AND: and } : {}),
    };

    const [total, rows] = await this.prisma.$transaction([
      this.prisma.auditLog.count({ where }),
      this.prisma.auditLog.findMany({
        where,
        // ULID id làm tiebreak — thứ tự ổn định khi nhiều log cùng mili-giây.
        orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
        skip: paging.skip,
        take: paging.take,
        select: LIST_SELECT,
      }),
    ]);

    const labels = await auditTargetLabels(this.prisma, rows);
    return {
      data: rows.map((row) => toListItem(row, labels)),
      meta: paginationMeta(paging, total),
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
    const labels = await auditTargetLabels(this.prisma, [row]);
    return {
      ...toListItem(row, labels),
      beforeJson: row.beforeJson ?? null,
      afterJson: row.afterJson ?? null,
      userAgent: row.userAgent,
    };
  }

  /**
   * Ô tìm kiếm của trang nhật ký.
   *
   * - Dán một ULID (mã dòng nhật ký, mã đối tượng, mã gian hàng, mã tài khoản) ⇒ khớp CHÍNH XÁC
   *   ở bốn cột đó. Cả bốn có chỉ mục mở đầu bằng chính cột ấy (`target_id` từ migration
   *   `20261008130000`), nên phép OR đi bằng bitmap-OR thay vì quét bảng.
   * - Gõ chữ ⇒ khớp tên/email người thực hiện hoặc tên/mã gian hàng, viết thành lọc QUAN HỆ:
   *   Prisma dịch thành `actor_user_id IN (SELECT …)` / `tenant_id IN (SELECT …)` — đủ mọi tài
   *   khoản khớp, không cắt ngầm ở một con số nào, và hai cột đó có chỉ mục `(…, created_at)`.
   */
  private searchWhere(q: string): Prisma.AuditLogWhereInput {
    if (ULID_PATTERN.test(q)) {
      const id = q.toUpperCase();
      return { OR: [{ id }, { targetId: id }, { tenantId: id }, { actorUserId: id }] };
    }
    const contains = { contains: q, mode: 'insensitive' as const };
    return {
      OR: [
        { actor: { is: { OR: [{ displayName: contains }, { email: contains }] } } },
        { tenant: { is: { OR: [{ name: contains }, { code: contains }] } } },
      ],
    };
  }
}

type AuditRow = Prisma.AuditLogGetPayload<{ select: typeof LIST_SELECT }>;

function toListItem(r: AuditRow, labels: Map<string, string>): AuditLogDto {
  return {
    id: r.id,
    actorScope: r.actorScope,
    action: r.action,
    targetType: r.targetType,
    targetId: r.targetId,
    targetLabel: r.targetId ? (labels.get(auditTargetKey(r.targetType, r.targetId)) ?? null) : null,
    tenantId: r.tenantId,
    tenantName: r.tenant?.name ?? null,
    actorUserId: r.actorUserId,
    actorName: r.actor?.displayName ?? null,
    actorEmail: r.actor?.email ?? null,
    ipAddress: r.ipAddress,
    viaSupport: r.supportContextId !== null,
    createdAt: (r.createdAt as Date).toISOString(),
  };
}

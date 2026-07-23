import { Injectable } from '@nestjs/common';
import { newId, type Prisma } from '@xeprime/prisma';
import { PrismaService } from '../../prisma/prisma.service';

export interface AuditEntry {
  tenantId?: string | null;
  actorUserId?: string | null;
  actorScope: 'tenant' | 'platform' | 'system';
  action: string;
  targetType: string;
  targetId?: string | null;
  before?: unknown;
  after?: unknown;
  ipAddress?: string | null;
  userAgent?: string | null;
}

/**
 * CLAUDE.md mục 6, lằn ranh 3: mọi action admin/platform quan trọng phải ghi audit.
 *
 * Nhận `tx` tuỳ chọn: khi audit đi kèm một thay đổi dữ liệu, truyền transaction vào để
 * hai thứ cùng sống cùng chết. Audit ghi ngoài transaction sẽ để lại log của việc chưa
 * từng xảy ra khi transaction rollback.
 */
@Injectable()
export class AuditService {
  constructor(private readonly prisma: PrismaService) {}

  async record(entry: AuditEntry, tx?: Prisma.TransactionClient): Promise<void> {
    const client = tx ?? this.prisma;
    await client.auditLog.create({
      data: {
        id: newId(),
        tenantId: entry.tenantId ?? null,
        actorUserId: entry.actorUserId ?? null,
        actorScope: entry.actorScope,
        action: entry.action,
        targetType: entry.targetType,
        targetId: entry.targetId ?? null,
        beforeJson: (entry.before ?? null) as Prisma.InputJsonValue,
        afterJson: (entry.after ?? null) as Prisma.InputJsonValue,
        ipAddress: entry.ipAddress ?? null,
        userAgent: entry.userAgent ?? null,
      },
    });
  }
}

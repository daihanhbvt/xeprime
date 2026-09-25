import { Injectable } from '@nestjs/common';
import { newId, type Prisma } from '@xeprime/prisma';
import { AUDIT_ACTOR_SCOPE, type AuditActorScope } from '@xeprime/types';
import { SupportRequestStore } from '../../common/support/support-request.store';
import { PrismaService } from '../../prisma/prisma.service';

export interface AuditEntry {
  tenantId?: string | null;
  actorUserId?: string | null;
  actorScope: AuditActorScope;
  action: string;
  targetType: string;
  targetId?: string | null;
  before?: unknown;
  after?: unknown;
  ipAddress?: string | null;
  userAgent?: string | null;
  /**
   * Phiên hỗ trợ gian hàng (ADR 0050) — chỉ truyền tay khi ghi audit của CHÍNH vòng đời phiên
   * (mở/thoát), lúc request chưa gắn phiên. Mọi thao tác chạy TRONG phiên được gắn tự động.
   */
  supportContextId?: string | null;
}

/**
 * CLAUDE.md mục 6, lằn ranh 3: mọi action admin/platform quan trọng phải ghi audit.
 *
 * Nhận `tx` tuỳ chọn: khi audit đi kèm một thay đổi dữ liệu, truyền transaction vào để
 * hai thứ cùng sống cùng chết. Audit ghi ngoài transaction sẽ để lại log của việc chưa
 * từng xảy ra khi transaction rollback.
 *
 * PHIÊN HỖ TRỢ (ADR 0050): khi request đang chạy trong phiên hỗ trợ của nhân sự nền tảng, cửa
 * này GHI ĐÈ `actorScope` thành `platform` và gắn id phiên + capability + IP/UA — bất kể nơi gọi
 * đã khai gì. Service hiện có (bảo dưỡng, đổi chi nhánh…) viết `actorScope: 'tenant'` vì trước
 * đây chỉ người của gian hàng tới được đó; sửa từng chỗ gọi là để sót chỗ thứ n+1. Luật đặt ở
 * đây thì không còn đường nào ghi một nhân sự nền tảng thành người của gian hàng.
 */
@Injectable()
export class AuditService {
  constructor(
    private readonly prisma: PrismaService,
    // Mặc định tự dựng: store không có trạng thái riêng (nó đọc AsyncLocalStorage dùng chung), và
    // hàng chục spec dựng `new AuditService(prisma)` bằng tay.
    private readonly supportStore: SupportRequestStore = new SupportRequestStore(),
  ) {}

  async record(entry: AuditEntry, tx?: Prisma.TransactionClient): Promise<void> {
    const client = tx ?? this.prisma;
    const state = this.supportStore.state();
    const support = state?.support ?? null;
    const supportContextId = support?.contextId ?? entry.supportContextId ?? null;
    // Chốt chặn: một request trong phiên KHÔNG BAO GIỜ được ghi audit cho gian hàng khác. Xảy ra
    // được nghĩa là có đường đi vượt phạm vi phiên — dừng cả transaction thay vì ghi sổ sai.
    if (support && entry.tenantId && entry.tenantId !== support.tenantId) {
      throw new Error('AuditService: ghi audit cho gian hàng khác trong phiên hỗ trợ');
    }

    await client.auditLog.create({
      data: {
        id: newId(),
        tenantId: entry.tenantId ?? null,
        // Trong phiên, người thao tác LUÔN là nhân sự nền tảng đã mở phiên — không có cách nào
        // để một dòng audit trong phiên mang tên người khác.
        actorUserId: support ? support.actorUserId : (entry.actorUserId ?? null),
        actorScope: supportContextId ? AUDIT_ACTOR_SCOPE.PLATFORM : entry.actorScope,
        action: entry.action,
        targetType: entry.targetType,
        targetId: entry.targetId ?? null,
        beforeJson: (entry.before ?? null) as Prisma.InputJsonValue,
        afterJson: (entry.after ?? null) as Prisma.InputJsonValue,
        ipAddress: entry.ipAddress ?? state?.ipAddress ?? null,
        userAgent: entry.userAgent ?? state?.userAgent ?? null,
        supportContextId,
        supportCapability: support ? (state?.capability ?? null) : null,
      },
    });
  }
}

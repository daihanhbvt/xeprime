import { newId, type Prisma, type PrismaClient } from '@xeprime/prisma';
import {
  AUDIT_ACTOR_SCOPE,
  MEMBERSHIP_STATUS,
  NOTIFICATION_CHANNEL,
  type AuditActorScope,
  type NotificationTargetType,
  type NotificationType,
} from '@xeprime/types';

/**
 * Ghi thông báo và audit từ WORKER.
 *
 * Vì sao không dùng lại `NotificationService`/`AuditService` của `apps/api`: chúng là provider
 * Nest, và kéo cả runtime Nest vào worker chỉ để có hai câu `INSERT` là đổi một bản sao 30 dòng
 * lấy một tiến trình nặng hơn nhiều lần — đúng lý do `main.ts` của worker cố ý chạy vòng lặp
 * trần thay vì `NestFactory`.
 *
 * Cái phải giữ đồng bộ là **hình dạng hàng ghi**, và nó đã được khoá bằng chính `@xeprime/types`
 * (loại thông báo, kênh, phạm vi actor) + kiểu của Prisma — không có chuỗi trần nào ở đây. Nếu
 * cột của `notifications`/`audit_logs` đổi, cả hai phía cùng đỏ ở bước typecheck.
 */
export interface WorkerNotification {
  type: NotificationType;
  title: string;
  body?: string | null;
  tenantId?: string | null;
  targetType?: NotificationTargetType | null;
  targetId?: string | null;
}

type Client = PrismaClient | Prisma.TransactionClient;

function row(userId: string, payload: WorkerNotification): Prisma.NotificationCreateManyInput {
  return {
    id: newId(),
    userId,
    tenantId: payload.tenantId ?? null,
    type: payload.type,
    channel: NOTIFICATION_CHANNEL.IN_APP,
    title: payload.title,
    body: payload.body ?? null,
    targetType: payload.targetType ?? null,
    targetId: payload.targetId ?? null,
  };
}

/** Một dòng cho MỘT người — trạng thái đã đọc là của từng người, không phải của sự kiện. */
export async function notifyUser(
  db: Client,
  userId: string,
  payload: WorkerNotification,
): Promise<void> {
  await db.notification.create({ data: row(userId, payload) });
}

/** Fan-out cho mọi thành viên ĐANG hoạt động của một gian hàng. */
export async function notifyTenantMembers(
  db: Client,
  tenantId: string,
  payload: WorkerNotification,
): Promise<void> {
  const members = await db.tenantMembership.findMany({
    where: { tenantId, status: MEMBERSHIP_STATUS.ACTIVE },
    select: { userId: true },
  });
  if (members.length === 0) return;
  await db.notification.createMany({
    data: members.map((m) => row(m.userId, { ...payload, tenantId })),
  });
}

/**
 * Audit của một hành động do HỆ THỐNG thực hiện — `actorScope: system`, `actor_user_id` NULL.
 *
 * Không có người nào bấm nút ở đây, và gán bừa một `userId` (chủ gian hàng chẳng hạn) sẽ biến
 * cuốn sổ này thành thứ vu oan cho người thật.
 */
export async function recordSystemAudit(
  db: Client,
  entry: {
    tenantId?: string | null;
    action: string;
    targetType: string;
    targetId: string;
    before?: unknown;
    after?: unknown;
    actorScope?: AuditActorScope;
  },
): Promise<void> {
  await db.auditLog.create({
    data: {
      id: newId(),
      tenantId: entry.tenantId ?? null,
      actorUserId: null,
      actorScope: entry.actorScope ?? AUDIT_ACTOR_SCOPE.SYSTEM,
      action: entry.action,
      targetType: entry.targetType,
      targetId: entry.targetId,
      beforeJson: (entry.before ?? null) as Prisma.InputJsonValue,
      afterJson: (entry.after ?? null) as Prisma.InputJsonValue,
    },
  });
}

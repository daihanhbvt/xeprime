import {
  enqueuePushDeliveries,
  markBadgesDirty,
  newId,
  type Prisma,
  type PrismaClient,
} from '@xeprime/prisma';
import {
  NOTIFICATION_AUDIENCE,
  notificationDeepLink,
  type NotificationAudience,
} from '@xeprime/domain';
import {
  AUDIT_ACTOR_SCOPE,
  MEMBERSHIP_STATUS,
  NOTIFICATION_CHANNEL,
  type AuditActorScope,
  type NotificationTargetType,
  type NotificationType,
} from '@xeprime/types';
import { PUSH_ENABLED } from './env';

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
  /**
   * Hạn CHÓT đẩy. Quá mốc này worker bỏ dòng giao vận thay vì rung máy muộn — đúng thứ mà các
   * job của worker cần: một lời nhắc "yêu cầu sắp hết hạn" nảy lên sau khi yêu cầu đã đóng là
   * một thông báo SAI, không phải một thông báo trễ.
   */
  pushExpiresAt?: Date | null;
}

type Client = PrismaClient | Prisma.TransactionClient;

function row(
  userId: string,
  payload: WorkerNotification,
  audience: NotificationAudience,
): Prisma.NotificationCreateManyInput {
  // Đích đóng băng vào `data_json` lúc PHÁT — worker gửi (push-dispatch) chỉ đọc lại nó, vì bề
  // mặt của người nhận không suy được từ hàng trong DB. Cùng luật với NotificationService.
  const url = notificationDeepLink(
    { targetType: payload.targetType, targetId: payload.targetId },
    audience,
  );

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
    ...(url ? { dataJson: { url } as Prisma.InputJsonValue } : {}),
  };
}

/**
 * Xếp hàng đẩy cho các dòng vừa ghi, trong CÙNG client (và cùng transaction) với chúng.
 *
 * `PUSH_ENABLED=false` ⇒ không tạo dòng nào — bật cờ lên sau không được biến thành một trận
 * thông báo tồn đọng của mấy tuần trước.
 */
async function enqueue(
  db: Client,
  rows: readonly Prisma.NotificationCreateManyInput[],
  payload: WorkerNotification,
): Promise<void> {
  if (!PUSH_ENABLED) return;
  await enqueuePushDeliveries(
    db,
    rows.flatMap((r) => (r.userId ? [{ notificationId: r.id as string, userId: r.userId }] : [])),
    { expiresAt: payload.pushExpiresAt ?? null },
  );
}

/** Một dòng cho MỘT người — trạng thái đã đọc là của từng người, không phải của sự kiện. */
export async function notifyUser(
  db: Client,
  userId: string,
  payload: WorkerNotification,
): Promise<void> {
  // Người nhận đơn lẻ của worker là KHÁCH (hết hạn yêu cầu, hết hạn giữ chỗ) — cùng mặc định
  // với `NotificationService.emitToUser`.
  const rows = [row(userId, payload, NOTIFICATION_AUDIENCE.CUSTOMER)];
  await db.notification.createMany({ data: rows });
  await markBadgesDirty(db, [userId]);
  await enqueue(db, rows, payload);
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

  const rows = members.map((m) =>
    row(m.userId, { ...payload, tenantId }, NOTIFICATION_AUDIENCE.MANAGE),
  );
  await db.notification.createMany({ data: rows });
  await markBadgesDirty(
    db,
    members.map((m) => m.userId),
  );
  await enqueue(db, rows, payload);
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

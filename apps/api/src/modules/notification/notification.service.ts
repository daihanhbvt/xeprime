import { Injectable, NotFoundException } from '@nestjs/common';
import {
  activeMemberIdsOf,
  enqueuePushDeliveries,
  markBadgesDirty,
  newId,
  Prisma,
} from '@xeprime/prisma';
import {
  NOTIFICATION_AUDIENCE,
  notificationDeepLink,
  type NotificationAudience,
} from '@xeprime/domain';
import {
  API_ERROR_CODE,
  BELL_HIDDEN_NOTIFICATION_TYPES,
  NOTIFICATION_CHANNEL,
  type NotificationTargetType,
  type NotificationType,
  type PaginationMeta,
} from '@xeprime/types';
import { PrismaService } from '../../prisma/prisma.service';
import { FirebaseAppService } from '../firebase/firebase-app.service';
import {
  NOTIFICATION_DEFAULT_LIMIT,
  NOTIFICATION_MAX_LIMIT,
  NotificationDto,
  NotificationListQueryDto,
} from './dto/notification.dto';
import { paginationMeta, resolvePaging } from '../../common/pagination';

/** Payload nghiệp vụ để phát một thông báo. `title`/`body` đã địa phương hoá tại nơi gọi. */
export interface NotifyPayload {
  type: NotificationType;
  title: string;
  body?: string | null;
  /** Scope tenant của sự kiện (nếu có). */
  tenantId?: string | null;
  targetType?: NotificationTargetType | null;
  targetId?: string | null;
  /** Dữ liệu phụ (vd mã đơn) — lưu ở data_json, chưa expose ra API. */
  data?: Record<string, unknown> | null;
  /**
   * Người nhận đang đứng ở BỀ MẶT nào — quyết định đường dẫn của thông báo đẩy.
   *
   * Mặc định suy từ chính phương thức: `emitToTenantMembers` là khu quản lý, `emitToUser` là
   * khu khách. Chỉ khai tường minh khi mặc định đó SAI — ví dụ nền tảng duyệt xe/gian hàng rồi
   * báo cho chủ sở hữu qua `emitToUser`: người nhận là chủ shop, và đích là màn quản lý.
   */
  audience?: NotificationAudience;
  /**
   * Hạn CHÓT đẩy. Quá mốc này worker bỏ dòng giao vận thay vì rung máy muộn — dùng cho tin có
   * đồng hồ đếm ngược ("yêu cầu sắp hết hạn"). Không ảnh hưởng bản ghi in-app.
   */
  pushExpiresAt?: Date | null;
}

const SELECT = {
  id: true,
  type: true,
  title: true,
  body: true,
  targetType: true,
  targetId: true,
  readAt: true,
  createdAt: true,
} satisfies Prisma.NotificationSelect;

/**
 * Thông báo in-app (Phase 5) + hàng đợi ĐẨY (10/09/2026). Nhận `tx` tuỳ chọn giống AuditService:
 * khi thông báo đi kèm một thay đổi dữ liệu, truyền transaction để hai thứ cùng sống cùng chết
 * (thông báo về việc chưa từng xảy ra là sai). Fan-out PER-USER nên trạng thái đã đọc đúng theo
 * từng người.
 *
 * Push KHÔNG đẻ ra bản ghi thông báo thứ hai: mỗi sự kiện vẫn đúng một dòng `notifications` cho
 * mỗi người, còn `push_deliveries` chỉ ghi "dòng đó đã tới máy nào". Việc GỬI nằm ở worker, sau
 * khi transaction nghiệp vụ đã commit — một lời gọi mạng tới Google bên trong transaction đặt
 * xe là cách biến sự cố của Firebase thành sự cố đặt xe.
 */
@Injectable()
export class NotificationService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly firebase: FirebaseAppService,
  ) {}

  /** Gửi thông báo cho một user cụ thể. Mặc định bề mặt KHÁCH. */
  async emitToUser(
    userId: string,
    payload: NotifyPayload,
    tx?: Prisma.TransactionClient,
  ): Promise<void> {
    await this.emitToUsers([userId], payload, tx);
  }

  /**
   * Gửi cho một DANH SÁCH người nhận đã xác định — mỗi người một dòng, một trạng thái đã đọc.
   *
   * Tồn tại vì có nơi gọi tự giải người nhận theo luật riêng của mình (chat: thành viên gian
   * hàng TRỪ chính người gửi VÀ trừ người đang là khách của thread đó). Ép chúng đi qua
   * `emitToTenantMembers` sẽ phải nhét luật của từng feature vào tham số của hàm này.
   */
  async emitToUsers(
    userIds: readonly string[],
    payload: NotifyPayload,
    tx?: Prisma.TransactionClient,
  ): Promise<void> {
    const recipients = [...new Set(userIds)];
    if (recipients.length === 0) return;

    const client = tx ?? this.prisma;
    const audience = payload.audience ?? NOTIFICATION_AUDIENCE.CUSTOMER;
    const rows = recipients.map((userId) => buildData(userId, payload, audience));

    await client.notification.createMany({ data: rows });
    await this.enqueuePush(client, rows, payload);
    // Câu CUỐI của transaction — xem lý do ở `emitToTenantMembers`.
    await markBadgesDirty(client, recipients);
  }

  /**
   * Gửi cho mọi thành viên active của một gian hàng (một dòng / người). Dùng cho sự kiện thuộc
   * shop (đơn thuê mới, yêu cầu đặt xe mới…). `excludeUserId` để không tự thông báo cho chính
   * người vừa gây ra hành động.
   */
  async emitToTenantMembers(
    tenantId: string,
    payload: NotifyPayload,
    tx?: Prisma.TransactionClient,
    opts?: {
      excludeUserId?: string | null;
      /** Loại trừ NHIỀU người — vd chủ shop đang đóng vai KHÁCH trong chính thread chat đó. */
      excludeUserIds?: readonly (string | null | undefined)[];
      roleKeys?: string[];
    },
  ): Promise<void> {
    const client = tx ?? this.prisma;
    const excluded = [
      ...new Set(
        [opts?.excludeUserId, ...(opts?.excludeUserIds ?? [])].filter(
          (id): id is string => typeof id === 'string' && id.length > 0,
        ),
      ),
    ];

    // Giải người nhận qua helper dùng chung (`@xeprime/prisma`): bản sao thứ hai của câu
    // "thành viên active của gian hàng" là chỗ một bên quên lọc `status` và người đã rời gian
    // hàng vẫn nhận thông báo công việc của nó.
    const memberIds = await activeMemberIdsOf(client, tenantId, {
      exclude: excluded,
      roleKeys: opts?.roleKeys,
    });
    if (memberIds.length === 0) return;

    // Thành viên của gian hàng đứng ở KHU QUẢN LÝ — trừ khi nơi gọi nói khác.
    const audience = payload.audience ?? NOTIFICATION_AUDIENCE.MANAGE;
    const rows = memberIds.map((userId) => buildData(userId, { ...payload, tenantId }, audience));

    await client.notification.createMany({ data: rows });
    await this.enqueuePush(client, rows, payload);
    /*
     * Đánh dấu huy hiệu là câu CUỐI của transaction: nó khoá một dòng cho MỖI người nhận, và giữ
     * những dòng đó trong lúc còn chèn `push_deliveries` là kéo dài cửa sổ va chạm với các
     * transaction khác chạm cùng nhóm người mà không được gì.
     */
    await markBadgesDirty(client, memberIds);
  }

  async list(
    userId: string,
    query: NotificationListQueryDto,
  ): Promise<{ data: NotificationDto[]; meta: PaginationMeta }> {
    const paging = resolvePaging(query, NOTIFICATION_DEFAULT_LIMIT, NOTIFICATION_MAX_LIMIT);

    const where: Prisma.NotificationWhereInput = {
      userId,
      // Loại chat khỏi chuông — biểu tượng tin nhắn đã nói rõ hơn. Bản ghi vẫn tồn tại vì thông
      // báo đẩy tham chiếu tới nó; xem `BELL_HIDDEN_NOTIFICATION_TYPES`.
      type: { notIn: [...BELL_HIDDEN_NOTIFICATION_TYPES] },
      ...(query.unreadOnly ? { readAt: null } : {}),
    };

    const [total, rows] = await this.prisma.$transaction([
      this.prisma.notification.count({ where }),
      this.prisma.notification.findMany({
        where,
        orderBy: { createdAt: 'desc' },
        skip: paging.skip,
        take: paging.take,
        select: SELECT,
      }),
    ]);

    return {
      data: rows.map(toDto),
      meta: paginationMeta(paging, total),
    };
  }

  /**
   * Số chưa đọc của CHUÔNG — phải khớp đúng danh sách mà `list` trả về, nếu không chuông báo 3
   * mà mở ra chỉ có 1.
   */
  async unreadCount(userId: string): Promise<{ count: number }> {
    const count = await this.prisma.notification.count({
      where: { userId, readAt: null, type: { notIn: [...BELL_HIDDEN_NOTIFICATION_TYPES] } },
    });
    return { count };
  }

  async markRead(userId: string, id: string): Promise<{ id: string; readAt: string }> {
    const existing = await this.prisma.notification.findFirst({
      where: { id, userId },
      select: { id: true, readAt: true },
    });
    if (!existing) {
      throw new NotFoundException({
        code: API_ERROR_CODE.NOT_FOUND,
        message: 'Không tìm thấy thông báo',
      });
    }

    const readAt = existing.readAt ?? new Date();
    if (!existing.readAt) {
      await this.prisma.$transaction(async (tx) => {
        await tx.notification.update({ where: { id }, data: { readAt } });
        await markBadgesDirty(tx, [userId]);
      });
    }
    return { id, readAt: readAt.toISOString() };
  }

  async markAllRead(userId: string): Promise<{ updated: number }> {
    const res = await this.prisma.$transaction(async (tx) => {
      const updated = await tx.notification.updateMany({
        where: { userId, readAt: null },
        data: { readAt: new Date() },
      });
      if (updated.count > 0) await markBadgesDirty(tx, [userId]);
      return updated;
    });
    return { updated: res.count };
  }

  /**
   * Xếp hàng đẩy cho các dòng vừa ghi — trong CÙNG client (và cùng transaction) với chúng.
   *
   * `PUSH_ENABLED=false` ⇒ không tạo dòng nào. Cố ý: nếu vẫn ghi, ngày bật cờ lên sẽ là ngày
   * người dùng nhận một trận thông báo tồn đọng của mấy tuần trước.
   */
  private async enqueuePush(
    client: Prisma.TransactionClient | PrismaService,
    rows: readonly Prisma.NotificationCreateManyInput[],
    payload: NotifyPayload,
  ): Promise<void> {
    if (!this.firebase.pushEnabled) return;

    await enqueuePushDeliveries(
      client,
      rows.flatMap((row) =>
        row.userId ? [{ notificationId: row.id as string, userId: row.userId }] : [],
      ),
      { expiresAt: payload.pushExpiresAt ?? null },
    );
  }
}

function buildData(
  userId: string,
  payload: NotifyPayload,
  audience: NotificationAudience,
): Prisma.NotificationCreateManyInput {
  /*
   * Đích được giải NGAY LÚC PHÁT và đóng băng vào `data_json`, không giải lại lúc gửi.
   *
   * Bề mặt (khách hay quản lý) chỉ nơi phát mới biết: `targetType: booking` dẫn tới `/trips/:id`
   * khi người nhận là khách và `/manage/bookings/:id` khi là nhân viên gian hàng. Worker chỉ
   * thấy hàng trong DB, nên nó không thể suy lại được điều đó.
   */
  const url = notificationDeepLink(
    { targetType: payload.targetType, targetId: payload.targetId },
    audience,
  );

  /*
   * `url` là trường TÍNH RA, không phải trường nơi gọi khai. Bỏ nó khỏi `payload.data` trước khi
   * trộn: nếu không, một emitter truyền `data: { url: … }` cho loại target không có đích sẽ ghi
   * thẳng giá trị đó vào payload FCM và đi vòng qua resolver. Allowlist bên app chặn được, nhưng
   * đó là lớp phòng thủ thứ hai — lớp thứ nhất là không cho giả mạo ngay từ đây.
   */
  const { url: _ignored, ...extra } = payload.data ?? {};
  const data = { ...extra, ...(url ? { url } : {}) };

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
    ...(Object.keys(data).length ? { dataJson: data as Prisma.InputJsonValue } : {}),
  };
}

type NotificationRow = Prisma.NotificationGetPayload<{ select: typeof SELECT }>;

function toDto(n: NotificationRow): NotificationDto {
  return {
    id: n.id,
    type: n.type,
    title: n.title,
    body: n.body,
    targetType: n.targetType,
    targetId: n.targetId,
    readAt: (n.readAt as unknown as string | null) ?? null,
    createdAt: n.createdAt as unknown as string,
  };
}

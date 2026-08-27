import { Injectable, NotFoundException } from '@nestjs/common';
import { newId, Prisma } from '@xeprime/prisma';
import {
  API_ERROR_CODE,
  MEMBERSHIP_STATUS,
  NOTIFICATION_CHANNEL,
  type NotificationTargetType,
  type NotificationType,
  type PaginationMeta,
} from '@xeprime/types';
import { PrismaService } from '../../prisma/prisma.service';
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
 * Thông báo in-app (Phase 5). Nhận `tx` tuỳ chọn giống AuditService: khi thông báo đi kèm một
 * thay đổi dữ liệu, truyền transaction để hai thứ cùng sống cùng chết (thông báo về việc chưa
 * từng xảy ra là sai). Fan-out PER-USER nên trạng thái đã đọc đúng theo từng người.
 */
@Injectable()
export class NotificationService {
  constructor(private readonly prisma: PrismaService) {}

  /** Gửi thông báo cho một user cụ thể. */
  async emitToUser(
    userId: string,
    payload: NotifyPayload,
    tx?: Prisma.TransactionClient,
  ): Promise<void> {
    const client = tx ?? this.prisma;
    await client.notification.create({ data: buildData(userId, payload) });
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
    opts?: { excludeUserId?: string | null; roleKeys?: string[] },
  ): Promise<void> {
    const client = tx ?? this.prisma;
    const members = await client.tenantMembership.findMany({
      where: {
        tenantId,
        status: MEMBERSHIP_STATUS.ACTIVE,
        ...(opts?.roleKeys ? { roleKey: { in: opts.roleKeys } } : {}),
        ...(opts?.excludeUserId ? { userId: { not: opts.excludeUserId } } : {}),
      },
      select: { userId: true },
    });
    if (members.length === 0) return;

    await client.notification.createMany({
      data: members.map((m) => buildData(m.userId, { ...payload, tenantId })),
    });
  }

  async list(
    userId: string,
    query: NotificationListQueryDto,
  ): Promise<{ data: NotificationDto[]; meta: PaginationMeta }> {
    const paging = resolvePaging(query, NOTIFICATION_DEFAULT_LIMIT, NOTIFICATION_MAX_LIMIT);

    const where: Prisma.NotificationWhereInput = {
      userId,
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

  async unreadCount(userId: string): Promise<{ count: number }> {
    const count = await this.prisma.notification.count({ where: { userId, readAt: null } });
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
      await this.prisma.notification.update({ where: { id }, data: { readAt } });
    }
    return { id, readAt: readAt.toISOString() };
  }

  async markAllRead(userId: string): Promise<{ updated: number }> {
    const res = await this.prisma.notification.updateMany({
      where: { userId, readAt: null },
      data: { readAt: new Date() },
    });
    return { updated: res.count };
  }
}

function buildData(userId: string, payload: NotifyPayload): Prisma.NotificationCreateManyInput {
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
    ...(payload.data ? { dataJson: payload.data as Prisma.InputJsonValue } : {}),
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

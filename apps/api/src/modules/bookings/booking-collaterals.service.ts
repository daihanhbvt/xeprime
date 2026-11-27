import { ConflictException, Injectable, NotFoundException } from '@nestjs/common';
import { newId, Prisma } from '@xeprime/prisma';
import {
  API_ERROR_CODE,
  AUDIT_ACTOR_SCOPE,
  AUDIT_TARGET_TYPE,
  BOOKING_COLLATERAL_AUDIT_ACTION,
  BOOKING_COLLATERAL_MAX_ITEMS,
  isBookingCollateralEditable,
} from '@xeprime/types';
import { PrismaService } from '../../prisma/prisma.service';
import { AuditService } from '../audit/audit.service';
import type {
  BookingCollateralDto,
  BookingCollateralInputDto,
  BookingCollateralListDto,
} from './dto/booking.dto';

/** Một chỗ chọn cột cho mọi bề mặt đọc sổ tài sản (chi tiết đơn, hợp đồng). */
export const BOOKING_COLLATERAL_SELECT = {
  id: true,
  collateralType: true,
  description: true,
  returnedAt: true,
  createdAt: true,
  returner: { select: { displayName: true } },
} satisfies Prisma.BookingCollateralSelect;

type CollateralRow = Prisma.BookingCollateralGetPayload<{
  select: typeof BOOKING_COLLATERAL_SELECT;
}>;

export const BOOKING_COLLATERAL_ORDER = [
  { createdAt: 'asc' },
  { id: 'asc' },
] satisfies Prisma.BookingCollateralOrderByWithRelationInput[];

export function toBookingCollateralDto(r: CollateralRow): BookingCollateralDto {
  return {
    id: r.id,
    collateralType: r.collateralType,
    description: r.description,
    returnedAt: r.returnedAt?.toISOString() ?? null,
    returnedByName: r.returner?.displayName ?? null,
    createdAt: r.createdAt.toISOString(),
  };
}

/**
 * Sổ tài sản thế chấp theo đơn (ADR 0109) — writer duy nhất của `booking_collaterals`.
 *
 * Thêm/gỡ chỉ khi đơn còn `reserved`/`confirmed`/`active`; đánh dấu đã trả / hoàn tác mọi trạng thái.
 * Mỗi lượt đổi khoá dòng đơn (`FOR UPDATE`) trước khi đếm — hai lượt thêm song song không vượt trần
 * `BOOKING_COLLATERAL_MAX_ITEMS`. Mọi lượt ghi một dòng audit trong cùng transaction.
 */
@Injectable()
export class BookingCollateralsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
  ) {}

  /** Ghi các món lúc TẠO đơn — chạy trong transaction tạo đơn (đơn vừa sinh, chưa ai chạm tới). */
  async addManyWithinTx(
    tx: Prisma.TransactionClient,
    input: {
      tenantId: string;
      bookingId: string;
      actorUserId: string | null;
      items: BookingCollateralInputDto[];
    },
  ): Promise<void> {
    if (input.items.length === 0) return;
    if (input.items.length > BOOKING_COLLATERAL_MAX_ITEMS) throw tooMany();
    // `now()` của Postgres cố định trong một transaction và ULID cùng mili-giây không đơn điệu ⇒
    // mốc tạo cách nhau 1ms để danh sách giữ đúng thứ tự gian hàng đã nhập.
    const base = Date.now();
    await tx.bookingCollateral.createMany({
      data: input.items.map((item, i) => ({
        id: newId(),
        tenantId: input.tenantId,
        bookingId: input.bookingId,
        collateralType: item.collateralType,
        description: item.description ?? null,
        createdBy: input.actorUserId,
        createdAt: new Date(base + i),
      })),
    });
    await this.audit.record(
      {
        tenantId: input.tenantId,
        actorUserId: input.actorUserId,
        actorScope: input.actorUserId ? AUDIT_ACTOR_SCOPE.TENANT : AUDIT_ACTOR_SCOPE.SYSTEM,
        action: BOOKING_COLLATERAL_AUDIT_ACTION.ADD,
        targetType: AUDIT_TARGET_TYPE.BOOKING,
        targetId: input.bookingId,
        after: { items: input.items.map((i) => i.collateralType) },
      },
      tx,
    );
  }

  async list(tenantId: string, bookingId: string): Promise<BookingCollateralListDto> {
    await this.findBooking(this.prisma, tenantId, bookingId);
    return { data: await this.rows(this.prisma, bookingId) };
  }

  async add(
    tenantId: string,
    bookingId: string,
    userId: string,
    item: BookingCollateralInputDto,
  ): Promise<BookingCollateralListDto> {
    return this.prisma.$transaction(async (tx) => {
      const booking = await this.lockBooking(tx, tenantId, bookingId);
      if (!isBookingCollateralEditable(booking.status)) throw closed();
      const count = await tx.bookingCollateral.count({ where: { bookingId } });
      if (count >= BOOKING_COLLATERAL_MAX_ITEMS) throw tooMany();
      const id = newId();
      await tx.bookingCollateral.create({
        data: {
          id,
          tenantId,
          bookingId,
          collateralType: item.collateralType,
          description: item.description ?? null,
          createdBy: userId,
        },
      });
      await this.record(tx, tenantId, userId, bookingId, BOOKING_COLLATERAL_AUDIT_ACTION.ADD, {
        collateralId: id,
        collateralType: item.collateralType,
      });
      return { data: await this.rows(tx, bookingId) };
    });
  }

  async remove(
    tenantId: string,
    bookingId: string,
    collateralId: string,
    userId: string,
  ): Promise<BookingCollateralListDto> {
    return this.prisma.$transaction(async (tx) => {
      const booking = await this.lockBooking(tx, tenantId, bookingId);
      if (!isBookingCollateralEditable(booking.status)) throw closed();
      const item = await this.findItem(tx, bookingId, collateralId);
      // Món đã trả là một sự kiện đã xảy ra — gỡ nó là xoá dấu vết. Hoàn tác "đã trả" trước nếu nhầm.
      if (item.returnedAt) {
        throw new ConflictException({
          code: API_ERROR_CODE.BOOKING_COLLATERAL_LOCKED,
          message: 'Tài sản đã trả cho khách - hoàn tác "đã trả" trước khi gỡ',
        });
      }
      await tx.bookingCollateral.delete({ where: { id: collateralId } });
      await this.record(tx, tenantId, userId, bookingId, BOOKING_COLLATERAL_AUDIT_ACTION.REMOVE, {
        collateralId,
        collateralType: item.collateralType,
      });
      return { data: await this.rows(tx, bookingId) };
    });
  }

  /**
   * Sửa loại / mô tả của một món (26/11/2026 - cọc linh động theo từng đơn). Cùng luật với gỡ: đơn
   * chưa khép, món chưa trả (đã trả là sự kiện đã xảy ra - hoàn tác trước nếu ghi nhầm). Không đổi gì
   * thì không ghi audit.
   */
  async update(
    tenantId: string,
    bookingId: string,
    collateralId: string,
    userId: string,
    input: BookingCollateralInputDto,
  ): Promise<BookingCollateralListDto> {
    return this.prisma.$transaction(async (tx) => {
      const booking = await this.lockBooking(tx, tenantId, bookingId);
      if (!isBookingCollateralEditable(booking.status)) throw closed();
      const item = await this.findItem(tx, bookingId, collateralId);
      if (item.returnedAt) {
        throw new ConflictException({
          code: API_ERROR_CODE.BOOKING_COLLATERAL_LOCKED,
          message: 'Tài sản đã trả cho khách - hoàn tác "đã trả" trước khi sửa',
        });
      }
      const description = input.description ?? null;
      if (item.collateralType !== input.collateralType || item.description !== description) {
        await tx.bookingCollateral.update({
          where: { id: collateralId },
          data: { collateralType: input.collateralType, description },
        });
        await this.record(tx, tenantId, userId, bookingId, BOOKING_COLLATERAL_AUDIT_ACTION.UPDATE, {
          collateralId,
          collateralType: input.collateralType,
          before: { collateralType: item.collateralType, description: item.description },
          description,
        });
      }
      return { data: await this.rows(tx, bookingId) };
    });
  }

  /** Đánh dấu đã trả (`returned = true`) hoặc hoàn tác — idempotent, mọi trạng thái đơn. */
  async setReturned(
    tenantId: string,
    bookingId: string,
    collateralId: string,
    userId: string,
    returned: boolean,
  ): Promise<BookingCollateralListDto> {
    return this.prisma.$transaction(async (tx) => {
      await this.lockBooking(tx, tenantId, bookingId);
      const item = await this.findItem(tx, bookingId, collateralId);
      if (Boolean(item.returnedAt) !== returned) {
        await tx.bookingCollateral.update({
          where: { id: collateralId },
          data: returned
            ? { returnedAt: new Date(), returnedBy: userId }
            : { returnedAt: null, returnedBy: null },
        });
        await this.record(
          tx,
          tenantId,
          userId,
          bookingId,
          returned
            ? BOOKING_COLLATERAL_AUDIT_ACTION.RETURN
            : BOOKING_COLLATERAL_AUDIT_ACTION.UNRETURN,
          { collateralId, collateralType: item.collateralType },
        );
      }
      return { data: await this.rows(tx, bookingId) };
    });
  }

  private async rows(
    db: PrismaService | Prisma.TransactionClient,
    bookingId: string,
  ): Promise<BookingCollateralDto[]> {
    const rows = await db.bookingCollateral.findMany({
      where: { bookingId },
      orderBy: BOOKING_COLLATERAL_ORDER,
      select: BOOKING_COLLATERAL_SELECT,
    });
    return rows.map(toBookingCollateralDto);
  }

  private async lockBooking(
    tx: Prisma.TransactionClient,
    tenantId: string,
    bookingId: string,
  ): Promise<{ id: string; status: string }> {
    await tx.$queryRaw`SELECT 1 FROM "public"."bookings" WHERE "id" = ${bookingId} AND "tenant_id" = ${tenantId} FOR UPDATE`;
    return this.findBooking(tx, tenantId, bookingId);
  }

  private async findBooking(
    db: PrismaService | Prisma.TransactionClient,
    tenantId: string,
    bookingId: string,
  ): Promise<{ id: string; status: string }> {
    const booking = await db.booking.findFirst({
      where: { id: bookingId, tenantId, deletedAt: null },
      select: { id: true, status: true },
    });
    if (!booking) {
      throw new NotFoundException({
        code: API_ERROR_CODE.NOT_FOUND,
        message: 'Không tìm thấy đơn',
      });
    }
    return booking;
  }

  private async findItem(tx: Prisma.TransactionClient, bookingId: string, collateralId: string) {
    const item = await tx.bookingCollateral.findFirst({
      where: { id: collateralId, bookingId },
      select: { id: true, collateralType: true, description: true, returnedAt: true },
    });
    if (!item) {
      throw new NotFoundException({
        code: API_ERROR_CODE.BOOKING_COLLATERAL_NOT_FOUND,
        message: 'Không tìm thấy tài sản thế chấp của đơn',
      });
    }
    return item;
  }

  private record(
    tx: Prisma.TransactionClient,
    tenantId: string,
    userId: string,
    bookingId: string,
    action: string,
    after: Record<string, unknown>,
  ) {
    return this.audit.record(
      {
        tenantId,
        actorUserId: userId,
        actorScope: AUDIT_ACTOR_SCOPE.TENANT,
        action,
        targetType: AUDIT_TARGET_TYPE.BOOKING,
        targetId: bookingId,
        after,
      },
      tx,
    );
  }
}

function closed(): ConflictException {
  return new ConflictException({
    code: API_ERROR_CODE.BOOKING_COLLATERAL_LOCKED,
    message: 'Đơn đã khép - không thêm/gỡ tài sản thế chấp được nữa',
  });
}

function tooMany(): ConflictException {
  return new ConflictException({
    code: API_ERROR_CODE.BOOKING_COLLATERAL_LOCKED,
    message: `Mỗi đơn ghi tối đa ${BOOKING_COLLATERAL_MAX_ITEMS} món tài sản`,
  });
}

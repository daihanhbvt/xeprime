import { ConflictException, Injectable, NotFoundException } from '@nestjs/common';
import { newId, Prisma } from '@xeprime/prisma';
import {
  API_ERROR_CODE,
  RECEIPT_STATUS,
  RECEIPT_TYPE,
  type PaginationMeta,
  type PaymentMethod,
  type ReceiptType,
} from '@xeprime/types';
import { PrismaService } from '../../prisma/prisma.service';
import { AuditService } from '../audit/audit.service';
import {
  CreateReceiptDto,
  ReceiptDetailDto,
  ReceiptListItemDto,
  ReceiptListQueryDto,
  RECEIPT_DEFAULT_LIMIT,
  RECEIPT_MAX_LIMIT,
} from './dto/finance.dto';

const LIST_SELECT = {
  id: true,
  receiptNo: true,
  type: true,
  status: true,
  amount: true,
  paymentMethod: true,
  categoryId: true,
  bookingId: true,
  description: true,
  createdAt: true,
  category: { select: { name: true } },
} satisfies Prisma.ReceiptSelect;

const DETAIL_SELECT = {
  ...LIST_SELECT,
  vehicleId: true,
  referenceCode: true,
  approvedAt: true,
  cancelledAt: true,
  updatedAt: true,
  attachments: { select: { fileUrl: true }, orderBy: { createdAt: 'asc' } },
} satisfies Prisma.ReceiptSelect;

/** Dữ liệu tạo phiếu đã-duyệt từ trong một transaction khác (Payments S2 auto-tạo phiếu thu). */
export interface ApprovedReceiptInput {
  type: ReceiptType;
  amount: string;
  paymentMethod: PaymentMethod;
  categoryId?: string | null;
  bookingId?: string | null;
  vehicleId?: string | null;
  description?: string | null;
  referenceCode?: string | null;
}

/**
 * Phiếu thu/chi (Phase 6). Workflow: pending_approval → approved | cancelled. Mọi ghi qua service
 * này; `tenant_id` từ scope. Tạo/duyệt/huỷ đều audit trong cùng transaction (tiền = phải truy vết).
 */
@Injectable()
export class ReceiptsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
  ) {}

  async list(
    tenantId: string,
    query: ReceiptListQueryDto,
  ): Promise<{ data: ReceiptListItemDto[]; meta: PaginationMeta }> {
    const page = Math.max(1, query.page ?? 1);
    const limit = Math.min(RECEIPT_MAX_LIMIT, Math.max(1, query.limit ?? RECEIPT_DEFAULT_LIMIT));

    const where: Prisma.ReceiptWhereInput = {
      tenantId,
      deletedAt: null,
      ...(query.type ? { type: query.type } : {}),
      ...(query.status ? { status: query.status } : {}),
      ...(query.categoryId ? { categoryId: query.categoryId } : {}),
      ...(query.bookingId ? { bookingId: query.bookingId } : {}),
      ...(query.from || query.to
        ? {
            createdAt: {
              ...(query.from ? { gte: new Date(query.from) } : {}),
              ...(query.to ? { lte: new Date(query.to) } : {}),
            },
          }
        : {}),
    };

    const [total, rows] = await this.prisma.$transaction([
      this.prisma.receipt.count({ where }),
      this.prisma.receipt.findMany({
        where,
        orderBy: { createdAt: 'desc' },
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

  async getOne(tenantId: string, id: string): Promise<ReceiptDetailDto> {
    const row = await this.prisma.receipt.findFirst({
      where: { id, tenantId, deletedAt: null },
      select: DETAIL_SELECT,
    });
    if (!row) throw notFound();
    return toDetail(row);
  }

  /** Tạo phiếu ở trạng thái chờ duyệt (workflow). Ảnh minh chứng tạo kèm trong cùng transaction. */
  async create(tenantId: string, userId: string, dto: CreateReceiptDto): Promise<ReceiptDetailDto> {
    const id = newId();
    const receiptNo = genReceiptNo(dto.type as ReceiptType);
    const attachments = (dto.attachments ?? []).map((u) => u.trim()).filter(Boolean);

    await this.prisma.$transaction(async (tx) => {
      await tx.receipt.create({
        data: {
          id,
          tenantId,
          receiptNo,
          type: dto.type as ReceiptType,
          categoryId: dto.categoryId ?? null,
          bookingId: dto.bookingId ?? null,
          vehicleId: dto.vehicleId ?? null,
          amount: dto.amount,
          paymentMethod: dto.paymentMethod as PaymentMethod,
          referenceCode: dto.referenceCode ?? null,
          description: dto.description ?? null,
          status: RECEIPT_STATUS.PENDING_APPROVAL,
          requestedBy: userId,
        },
      });
      if (attachments.length > 0) {
        await tx.receiptAttachment.createMany({
          data: attachments.map((fileUrl) => ({ id: newId(), receiptId: id, fileUrl })),
        });
      }
      await this.audit.record(
        {
          tenantId,
          actorUserId: userId,
          actorScope: 'tenant',
          action: 'receipt.create',
          targetType: 'receipt',
          targetId: id,
          after: { type: dto.type, amount: dto.amount },
        },
        tx,
      );
    });

    return this.getOne(tenantId, id);
  }

  async approve(tenantId: string, userId: string, id: string): Promise<ReceiptDetailDto> {
    const receipt = await this.loadFor(tenantId, id, [
      RECEIPT_STATUS.DRAFT,
      RECEIPT_STATUS.PENDING_APPROVAL,
    ]);
    await this.prisma.$transaction(async (tx) => {
      await tx.receipt.update({
        where: { id: receipt.id },
        data: { status: RECEIPT_STATUS.APPROVED, approvedBy: userId, approvedAt: new Date() },
      });
      await this.audit.record(
        {
          tenantId,
          actorUserId: userId,
          actorScope: 'tenant',
          action: 'receipt.approve',
          targetType: 'receipt',
          targetId: id,
        },
        tx,
      );
    });
    return this.getOne(tenantId, id);
  }

  async cancel(
    tenantId: string,
    userId: string,
    id: string,
    reason?: string,
  ): Promise<ReceiptDetailDto> {
    const receipt = await this.loadFor(tenantId, id, [
      RECEIPT_STATUS.DRAFT,
      RECEIPT_STATUS.PENDING_APPROVAL,
      RECEIPT_STATUS.APPROVED,
    ]);
    await this.prisma.$transaction(async (tx) => {
      await tx.receipt.update({
        where: { id: receipt.id },
        data: { status: RECEIPT_STATUS.CANCELLED, cancelledBy: userId, cancelledAt: new Date() },
      });
      await this.audit.record(
        {
          tenantId,
          actorUserId: userId,
          actorScope: 'tenant',
          action: 'receipt.cancel',
          targetType: 'receipt',
          targetId: id,
          after: reason ? { reason } : undefined,
        },
        tx,
      );
    });
    return this.getOne(tenantId, id);
  }

  /**
   * Tạo phiếu thu ĐÃ duyệt bên trong transaction của module khác (Payments S2). Không tự audit —
   * caller audit hành động gốc (record payment). Trả id phiếu để caller liên kết.
   */
  async createApprovedWithinTx(
    tx: Prisma.TransactionClient,
    tenantId: string,
    userId: string,
    input: ApprovedReceiptInput,
  ): Promise<string> {
    const id = newId();
    await tx.receipt.create({
      data: {
        id,
        tenantId,
        receiptNo: genReceiptNo(input.type),
        type: input.type,
        categoryId: input.categoryId ?? null,
        bookingId: input.bookingId ?? null,
        vehicleId: input.vehicleId ?? null,
        amount: input.amount,
        paymentMethod: input.paymentMethod,
        referenceCode: input.referenceCode ?? null,
        description: input.description ?? null,
        status: RECEIPT_STATUS.APPROVED,
        requestedBy: userId,
        approvedBy: userId,
        approvedAt: new Date(),
      },
    });
    return id;
  }

  /** Huỷ phiếu (dùng khi void payment) trong tx của caller. */
  async cancelWithinTx(
    tx: Prisma.TransactionClient,
    receiptId: string,
    userId: string,
  ): Promise<void> {
    await tx.receipt.updateMany({
      where: { id: receiptId, status: { not: RECEIPT_STATUS.CANCELLED } },
      data: { status: RECEIPT_STATUS.CANCELLED, cancelledBy: userId, cancelledAt: new Date() },
    });
  }

  private async loadFor(tenantId: string, id: string, allowed: string[]) {
    const row = await this.prisma.receipt.findFirst({
      where: { id, tenantId, deletedAt: null },
      select: { id: true, status: true },
    });
    if (!row) throw notFound();
    if (!allowed.includes(row.status)) {
      throw new ConflictException({
        code: API_ERROR_CODE.INVALID_STATUS_TRANSITION,
        message: 'Phiếu đang ở trạng thái không cho phép thao tác này',
      });
    }
    return row;
  }
}

/** `PT-YYYYMMDD-XXXX` (thu) / `PC-...` (chi). Hậu tố lấy từ ULID → gần như không trùng. */
function genReceiptNo(type: ReceiptType): string {
  const prefix = type === RECEIPT_TYPE.INCOME ? 'PT' : 'PC';
  const d = new Date();
  const ymd = `${d.getUTCFullYear()}${String(d.getUTCMonth() + 1).padStart(2, '0')}${String(d.getUTCDate()).padStart(2, '0')}`;
  const suffix = newId().slice(-4).toUpperCase();
  return `${prefix}-${ymd}-${suffix}`;
}

type ListRow = Prisma.ReceiptGetPayload<{ select: typeof LIST_SELECT }>;
type DetailRow = Prisma.ReceiptGetPayload<{ select: typeof DETAIL_SELECT }>;

function toListItem(r: ListRow): ReceiptListItemDto {
  return {
    id: r.id,
    receiptNo: r.receiptNo,
    type: r.type,
    status: r.status,
    amount: r.amount.toString(),
    paymentMethod: r.paymentMethod,
    categoryId: r.categoryId,
    categoryName: r.category?.name ?? null,
    bookingId: r.bookingId,
    description: r.description,
    createdAt: r.createdAt.toISOString(),
  };
}

function toDetail(r: DetailRow): ReceiptDetailDto {
  return {
    ...toListItem(r),
    vehicleId: r.vehicleId,
    referenceCode: r.referenceCode,
    approvedAt: r.approvedAt?.toISOString() ?? null,
    cancelledAt: r.cancelledAt?.toISOString() ?? null,
    attachments: r.attachments.map((a) => a.fileUrl),
    updatedAt: r.updatedAt.toISOString(),
  };
}

function notFound(): NotFoundException {
  return new NotFoundException({ code: API_ERROR_CODE.NOT_FOUND, message: 'Không tìm thấy phiếu' });
}

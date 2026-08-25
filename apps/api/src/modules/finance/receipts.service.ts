import { ConflictException, Injectable, NotFoundException } from '@nestjs/common';
import { newId, Prisma } from '@xeprime/prisma';
import {
  API_ERROR_CODE,
  BOOKING_STATUS,
  HELD_FUNDS_RECEIPT_SOURCES,
  PAYMENT_METHOD,
  RECEIPT_SOURCE,
  RECEIPT_SOURCE_GROUP,
  RECEIPT_STATUS,
  RECEIPT_TYPE,
  isAutoReceipt,
  type PaginationMeta,
  type PaymentMethod,
  type ReceiptSource,
  type ReceiptType,
  type SystemFinanceCategoryKey,
} from '@xeprime/types';
import { dayRangeFilter } from '../../common/day-range';
import { bookingDebt } from '../../common/money';
import { PrismaService } from '../../prisma/prisma.service';
import { AuditService } from '../audit/audit.service';
import {
  CreateReceiptDto,
  ReceiptDetailDto,
  ReceiptListItemDto,
  ReceiptBookingOptionDto,
  ReceiptListQueryDto,
  RECEIPT_DEFAULT_LIMIT,
  RECEIPT_MAX_LIMIT,
  ReceiptSummaryDto,
} from './dto/finance.dto';
import { paginationMeta, resolvePaging } from '../../common/pagination';

const LIST_SELECT = {
  id: true,
  receiptNo: true,
  type: true,
  status: true,
  amount: true,
  paymentMethod: true,
  categoryId: true,
  bookingId: true,
  vehicleId: true,
  tenantCustomerId: true,
  source: true,
  sourceRefId: true,
  description: true,
  occurredAt: true,
  createdAt: true,
  category: { select: { name: true } },
  // Ba LEFT JOIN theo FK đã đánh index, ≤100 dòng/trang — rẻ hơn hẳn việc bảng hiện toàn id.
  // Không có ba cột này thì "đối tượng" của một dòng sổ là ba chuỗi 26 ký tự vô nghĩa.
  booking: { select: { code: true } },
  vehicle: { select: { name: true, plateNumber: true } },
  tenantCustomer: { select: { fullName: true } },
} satisfies Prisma.ReceiptSelect;

const DETAIL_SELECT = {
  ...LIST_SELECT,
  referenceCode: true,
  requestedBy: true,
  approvedBy: true,
  approvedAt: true,
  cancelledBy: true,
  cancelledAt: true,
  updatedAt: true,
  attachments: { select: { fileUrl: true }, orderBy: { createdAt: 'asc' } },
} satisfies Prisma.ReceiptSelect;

/**
 * Dữ liệu tạo phiếu ĐÃ DUYỆT từ trong transaction của module khác (thu tiền, thu cọc, hoàn cọc,
 * bảo dưỡng).
 *
 * `source` + `sourceRefId` là bắt buộc — DB có CHECK. Danh mục truyền bằng **khoá hệ thống**
 * (`categoryKey`) chứ không phải id: module gọi không việc gì phải biết id danh mục của một
 * bảng nó không sở hữu.
 */
export interface ApprovedReceiptInput {
  type: ReceiptType;
  amount: string;
  paymentMethod: PaymentMethod;
  source: Exclude<ReceiptSource, typeof RECEIPT_SOURCE.MANUAL>;
  sourceRefId: string;
  categoryKey?: SystemFinanceCategoryKey | null;
  bookingId?: string | null;
  vehicleId?: string | null;
  tenantCustomerId?: string | null;
  /** Thời điểm tiền thực sự di chuyển; mặc định bây giờ. */
  occurredAt?: Date | null;
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
    const paging = resolvePaging(query, RECEIPT_DEFAULT_LIMIT, RECEIPT_MAX_LIMIT);

    const where = this.whereOf(tenantId, query);

    const [total, rows] = await this.prisma.$transaction([
      this.prisma.receipt.count({ where }),
      this.prisma.receipt.findMany({
        where,
        // `createdAt` là mốc phụ để hai phiếu cùng ngày phát sinh vẫn có thứ tự ổn định.
        orderBy: [{ occurredAt: 'desc' }, { createdAt: 'desc' }],
        skip: paging.skip,
        take: paging.take,
        select: LIST_SELECT,
      }),
    ]);

    return {
      data: rows.map(toListItem),
      meta: paginationMeta(paging, total),
    };
  }

  /**
   * Vị từ lọc dùng CHUNG cho danh sách và thẻ tổng. Tách ra vì đó là điều kiện để hai bề mặt
   * không lệch nhau — một thẻ "Tổng thu" cộng khác tập với bảng bên dưới là lỗi không ai phát
   * hiện ra cho tới lúc đối chiếu sổ.
   */
  private whereOf(tenantId: string, query: ReceiptListQueryDto): Prisma.ReceiptWhereInput {
    const q = query.q?.trim();
    // Lọc theo NGÀY PHÁT SINH, không phải lúc nhập — và qua `dayRangeFilter` để `YYYY-MM-DD` từ
    // FilterBar nghĩa là trọn một ngày Việt Nam, không phải từ 07:00 (xem common/day-range.ts).
    const occurredAt = dayRangeFilter(query.from, query.to);
    const source = sourceFilterOf(query);

    return {
      tenantId,
      deletedAt: null,
      ...(query.type ? { type: query.type } : {}),
      ...(query.status ? { status: query.status } : {}),
      ...(source ? { source } : {}),
      ...(query.paymentMethod ? { paymentMethod: query.paymentMethod } : {}),
      ...(query.categoryId ? { categoryId: query.categoryId } : {}),
      ...(query.bookingId ? { bookingId: query.bookingId } : {}),
      ...(query.vehicleId ? { vehicleId: query.vehicleId } : {}),
      ...(query.tenantCustomerId ? { tenantCustomerId: query.tenantCustomerId } : {}),
      ...(occurredAt ? { occurredAt } : {}),
      ...(q
        ? {
            OR: [
              { receiptNo: { contains: q, mode: 'insensitive' } },
              { referenceCode: { contains: q, mode: 'insensitive' } },
              { description: { contains: q, mode: 'insensitive' } },
              { booking: { code: { contains: q, mode: 'insensitive' } } },
            ],
          }
        : {}),
    };
  }

  async getOne(tenantId: string, id: string): Promise<ReceiptDetailDto> {
    const row = await this.prisma.receipt.findFirst({
      where: { id, tenantId, deletedAt: null },
      select: DETAIL_SELECT,
    });
    if (!row) throw notFound();
    // Tên người thao tác chỉ tra ở CHI TIẾT: `requested_by`/`approved_by`/`cancelled_by` là cột
    // Char(26) trần không có quan hệ Prisma, nên đây là một truy vấn phụ. Nhét vào danh sách là
    // trả giá đó trên mọi trang để lấy thứ chỉ đọc khi mở một phiếu ra xem.
    const names = await this.actorNames([row.requestedBy, row.approvedBy, row.cancelledBy]);
    return toDetail(row, names);
  }

  /**
   * Tổng thu/chi của ĐÚNG bộ lọc đang xem — dùng lại `whereOf` với danh sách nên hai con số không
   * thể lệch nhau. Chỉ cộng phiếu ĐÃ DUYỆT: phiếu chờ duyệt chưa phải tiền thật.
   */
  async summary(tenantId: string, query: ReceiptListQueryDto): Promise<ReceiptSummaryDto> {
    const where: Prisma.ReceiptWhereInput = {
      ...this.whereOf(tenantId, query),
      status: RECEIPT_STATUS.APPROVED,
    };

    const rows = await this.prisma.receipt.groupBy({
      by: ['type', 'paymentMethod'],
      where,
      _sum: { amount: true },
      _count: { _all: true },
    });

    let income = new Prisma.Decimal(0);
    let expense = new Prisma.Decimal(0);
    let incomeCash = new Prisma.Decimal(0);
    let incomeTransfer = new Prisma.Decimal(0);
    let approvedCount = 0;

    for (const row of rows) {
      const sum = row._sum.amount ?? new Prisma.Decimal(0);
      approvedCount += row._count._all;
      if (row.type === RECEIPT_TYPE.EXPENSE) {
        expense = expense.plus(sum);
        continue;
      }
      income = income.plus(sum);
      // "Tiền mặt" đối lập với "không phải tiền mặt". Gộp QR/thẻ vào chuyển khoản vì với chủ xe
      // chúng là cùng một việc: tiền vào tài khoản, phải đi đối chiếu sao kê.
      if (row.paymentMethod === PAYMENT_METHOD.CASH) incomeCash = incomeCash.plus(sum);
      else incomeTransfer = incomeTransfer.plus(sum);
    }

    return {
      totalIncome: income.toString(),
      totalExpense: expense.toString(),
      balance: income.minus(expense).toString(),
      incomeCash: incomeCash.toString(),
      incomeTransfer: incomeTransfer.toString(),
      approvedCount,
    };
  }

  /**
   * Đơn thuê gợi ý cho ô "Liên kết đơn thuê" của form tạo phiếu.
   *
   * Sắp theo NỢ giảm dần rồi tới đơn mới: lý do phổ biến nhất để mở form tạo phiếu thu là thu nốt
   * tiền một đơn còn nợ, nên đơn đó phải nằm ngay đầu danh sách chứ không bắt gõ tìm.
   */
  async bookingOptions(tenantId: string, q?: string): Promise<ReceiptBookingOptionDto[]> {
    const term = q?.trim();
    const rows = await this.prisma.booking.findMany({
      where: {
        tenantId,
        deletedAt: null,
        status: { not: BOOKING_STATUS.CANCELLED },
        ...(term
          ? {
              OR: [
                { code: { contains: term, mode: 'insensitive' } },
                { customerName: { contains: term, mode: 'insensitive' } },
                { customerPhone: { contains: term } },
                { vehicle: { plateNumber: { contains: term, mode: 'insensitive' } } },
              ],
            }
          : {}),
      },
      orderBy: [{ createdAt: 'desc' }],
      take: BOOKING_OPTION_LIMIT,
      select: {
        id: true,
        code: true,
        customerName: true,
        customerPhone: true,
        tenantCustomerId: true,
        vehicleId: true,
        totalAmount: true,
        paidAmount: true,
        vehicle: { select: { name: true, plateNumber: true } },
      },
    });

    return rows
      .map((r) => ({
        id: r.id,
        code: r.code,
        customerName: r.customerName,
        customerPhone: r.customerPhone,
        tenantCustomerId: r.tenantCustomerId,
        vehicleId: r.vehicleId,
        vehicleName: r.vehicle?.name ?? '',
        plateNumber: r.vehicle?.plateNumber ?? null,
        totalAmount: r.totalAmount.toString(),
        paidAmount: r.paidAmount.toString(),
        debtAmount: bookingDebt(r.totalAmount, r.paidAmount).toString(),
      }))
      .sort((a, b) => Number(b.debtAmount) - Number(a.debtAmount));
  }

  private async actorNames(ids: (string | null)[]): Promise<Map<string, string>> {
    const unique = [...new Set(ids.filter(Boolean) as string[])];
    if (unique.length === 0) return new Map();
    const users = await this.prisma.user.findMany({
      where: { id: { in: unique } },
      select: { id: true, displayName: true },
    });
    return new Map(users.map((user) => [user.id, user.displayName]));
  }

  /** Tạo phiếu ở trạng thái chờ duyệt (workflow). Ảnh minh chứng tạo kèm trong cùng transaction. */
  async create(tenantId: string, userId: string, dto: CreateReceiptDto): Promise<ReceiptDetailDto> {
    const id = newId();
    const attachments = (dto.attachments ?? []).map((u) => u.trim()).filter(Boolean);
    /*
     * Đơn và xe gắn kèm phải THUỘC GIAN HÀNG NÀY — kiểm ở đây vì DB không kiểm hộ: FK của
     * `booking_id`/`vehicle_id` là khoá đơn (`references: [id]`), không phải composite kèm
     * `tenant_id` như `tenant_customer_id`. Không chặn thì một id của gian hàng khác vẫn ghi
     * được, và `LIST_SELECT` sẽ vui vẻ join ra tên xe + biển số của họ (CLAUDE.md §6).
     *
     * Khách của phiếu thì SUY từ đơn, không nhận từ body: client không được tự gắn phiếu vào
     * một khách bất kỳ (CLAUDE.md §5).
     */
    let tenantCustomerId: string | null = null;
    if (dto.bookingId) {
      const booking = await this.prisma.booking.findFirst({
        where: { id: dto.bookingId, tenantId, deletedAt: null },
        select: { tenantCustomerId: true },
      });
      if (!booking) throw notFoundBooking();
      tenantCustomerId = booking.tenantCustomerId;
    }
    if (dto.vehicleId) {
      const vehicle = await this.prisma.vehicle.findFirst({
        where: { id: dto.vehicleId, tenantId, deletedAt: null },
        select: { id: true },
      });
      if (!vehicle) throw notFoundVehicle();
    }

    await this.prisma.$transaction(async (tx) => {
      await tx.receipt.create({
        data: {
          id,
          tenantId,
          receiptNo: genReceiptNo(dto.type as ReceiptType),
          type: dto.type as ReceiptType,
          categoryId: dto.categoryId ?? null,
          bookingId: dto.bookingId ?? null,
          vehicleId: dto.vehicleId ?? null,
          tenantCustomerId,
          amount: dto.amount,
          paymentMethod: dto.paymentMethod as PaymentMethod,
          referenceCode: dto.referenceCode ?? null,
          description: dto.description ?? null,
          source: RECEIPT_SOURCE.MANUAL,
          sourceRefId: null,
          occurredAt: dto.occurredAt ? new Date(dto.occurredAt) : new Date(),
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
    // Phiếu tự động là BẢN SAO kế toán của một nghiệp vụ, không phải bản gốc. Huỷ thẳng ở đây làm
    // sổ báo ít hơn thực tế trong khi đơn vẫn ghi đã thu — hai con số cho cùng một đồng, không gì
    // phát hiện ra. `details` mang đủ để FE dựng đường quay về đúng nơi phải đảo.
    if (isAutoReceipt(receipt.source)) {
      throw new ConflictException({
        code: API_ERROR_CODE.RECEIPT_SOURCE_LOCKED,
        message: 'Phiếu tự động — huỷ ở chính nghiệp vụ đã sinh ra nó, không huỷ trực tiếp',
        details: {
          source: receipt.source,
          sourceRefId: receipt.sourceRefId,
          bookingId: receipt.bookingId,
        },
      });
    }
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
  ): Promise<{ id: string; receiptNo: string }> {
    const id = newId();
    const receiptNo = genReceiptNo(input.type);
    const categoryId = input.categoryKey
      ? await this.resolveSystemCategoryId(tx, input.categoryKey)
      : null;
    await tx.receipt.create({
      data: {
        id,
        tenantId,
        receiptNo,
        type: input.type,
        categoryId,
        bookingId: input.bookingId ?? null,
        vehicleId: input.vehicleId ?? null,
        tenantCustomerId: input.tenantCustomerId ?? null,
        amount: input.amount,
        paymentMethod: input.paymentMethod,
        referenceCode: input.referenceCode ?? null,
        description: input.description ?? null,
        source: input.source,
        sourceRefId: input.sourceRefId,
        occurredAt: input.occurredAt ?? new Date(),
        status: RECEIPT_STATUS.APPROVED,
        requestedBy: userId,
        approvedBy: userId,
        approvedAt: new Date(),
      },
    });
    // Trả cả SỐ phiếu: bảo dưỡng cần nó để điền `receipt_code`. Không trả thì module đó phải tự
    // `SELECT` vào `receipts` — một bảng nó không sở hữu.
    return { id, receiptNo };
  }

  /**
   * Sửa số tiền của một phiếu tự động — đường DUY NHẤT để chữa một phiếu ghi sai, vì `cancel`
   * công khai đã chặn phiếu tự động.
   *
   * Sửa TẠI CHỖ chứ không huỷ-rồi-tạo-lại: unique index `(tenant_id, source, source_ref_id)` phủ
   * cả dòng đã huỷ, nên tạo lại sẽ đụng constraint. Trả số dòng đổi để caller biết có phiếu hay
   * chưa (bản ghi cũ trước epic này không có phiếu nào).
   *
   * **HỒI SINH phiếu đã huỷ, không bỏ qua nó.** Vòng đời thật có bốn chuyển tiếp, không phải ba:
   * chưa-có → có tiền, có tiền → số khác, có tiền → 0đ (huỷ), và **0đ → có tiền lại**. Nếu ở đây
   * lọc `status != cancelled` thì chuyển tiếp thứ tư rơi xuống nhánh tạo mới và đụng đúng unique
   * index nói trên — người dùng sửa hoàn cọc về 0 rồi sửa lại thành 3 triệu sẽ ăn 409 **vĩnh
   * viễn** cho bản ghi đó. Đây là upsert-theo-nguồn, và trạng thái là thứ nó khôi phục.
   */
  async updateAmountWithinTx(
    tx: Prisma.TransactionClient,
    tenantId: string,
    source: Exclude<ReceiptSource, typeof RECEIPT_SOURCE.MANUAL>,
    sourceRefId: string,
    userId: string,
    data: { amount: string; occurredAt?: Date | null; referenceCode?: string | null },
  ): Promise<number> {
    const res = await tx.receipt.updateMany({
      where: { tenantId, source, sourceRefId, deletedAt: null },
      data: {
        amount: data.amount,
        ...(data.occurredAt ? { occurredAt: data.occurredAt } : {}),
        ...(data.referenceCode !== undefined ? { referenceCode: data.referenceCode } : {}),
        // Phiếu tự động luôn ở trạng thái đã duyệt khi còn hiệu lực; xoá dấu vết huỷ cũ để
        // không còn một phiếu "đã duyệt" mà vẫn mang `cancelled_by`/`cancelled_at`.
        status: RECEIPT_STATUS.APPROVED,
        approvedBy: userId,
        approvedAt: new Date(),
        cancelledBy: null,
        cancelledAt: null,
      },
    });
    return res.count;
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

  /** Huỷ phiếu theo nguồn (khi caller chỉ cầm id bản ghi gốc, không cầm id phiếu). */
  async cancelBySourceWithinTx(
    tx: Prisma.TransactionClient,
    tenantId: string,
    source: Exclude<ReceiptSource, typeof RECEIPT_SOURCE.MANUAL>,
    sourceRefId: string,
    userId: string,
  ): Promise<void> {
    await tx.receipt.updateMany({
      where: { tenantId, source, sourceRefId, status: { not: RECEIPT_STATUS.CANCELLED } },
      data: { status: RECEIPT_STATUS.CANCELLED, cancelledBy: userId, cancelledAt: new Date() },
    });
  }

  /**
   * Id danh mục hệ thống theo khoá ổn định. Trả `null` khi không thấy — **cố ý không throw**:
   * thiếu một dòng seed không được phép cuộn ngược cả một transaction tiền. Phiếu vẫn lên sổ,
   * chỉ là chưa có nhãn danh mục.
   */
  async resolveSystemCategoryId(
    tx: Prisma.TransactionClient,
    key: SystemFinanceCategoryKey,
  ): Promise<string | null> {
    const row = await tx.financeCategory.findFirst({
      where: { systemKey: key, tenantId: null, isSystem: true },
      select: { id: true },
    });
    return row?.id ?? null;
  }

  private async loadFor(tenantId: string, id: string, allowed: string[]) {
    const row = await this.prisma.receipt.findFirst({
      where: { id, tenantId, deletedAt: null },
      select: { id: true, status: true, source: true, sourceRefId: true, bookingId: true },
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

/** Ô gợi ý đơn: đủ để chọn mà không biến thành một danh sách phải cuộn. */
const BOOKING_OPTION_LIMIT = 20;

/** UTC+7 — cùng hằng số với `common/day-range.ts`; `Asia/Ho_Chi_Minh` không có DST. */
const VN_OFFSET_MS = 7 * 60 * 60 * 1000;

/**
 * `PT-YYYYMMDD-XXXXXXXX` (thu) / `PC-...` (chi).
 *
 * **Ngày theo giờ VIỆT NAM, không phải UTC.** Trước 07:00 giờ VN, `getUTCDate()` còn ở hôm qua —
 * số phiếu sẽ mang ngày hôm trước trong khi cột `occurred_at` cạnh nó hiển thị hôm nay, và số đó
 * còn được chép sang `vehicle_maintenance_records.receipt_code`.
 *
 * **Hậu tố 8 ký tự ULID, KHÔNG có vòng thử lại.** Mọi lời gọi đều nằm trong một transaction, mà
 * Postgres huỷ cả transaction ngay ở vi phạm ràng buộc đầu tiên (`25P02` cho mọi câu sau) — thử
 * lại trong đó là mã chết. Cách đúng là làm cho va chạm không xảy ra: 32^8 ≈ 1,1×10¹² khả năng
 * mỗi ngày mỗi gian hàng. Đụng thì `AllExceptionsFilter` trả 409, giống hệt cách
 * `OccupancyService` để exclusion constraint nổi lên.
 */
function genReceiptNo(type: ReceiptType): string {
  const prefix = type === RECEIPT_TYPE.INCOME ? 'PT' : 'PC';
  const vn = new Date(Date.now() + VN_OFFSET_MS);
  const ymd = `${vn.getUTCFullYear()}${String(vn.getUTCMonth() + 1).padStart(2, '0')}${String(vn.getUTCDate()).padStart(2, '0')}`;
  const suffix = newId().slice(-8).toUpperCase();
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
    source: r.source,
    sourceRefId: r.sourceRefId,
    amount: r.amount.toString(),
    paymentMethod: r.paymentMethod,
    categoryId: r.categoryId,
    categoryName: r.category?.name ?? null,
    bookingId: r.bookingId,
    bookingCode: r.booking?.code ?? null,
    vehicleId: r.vehicleId,
    vehicleName: r.vehicle?.name ?? null,
    plateNumber: r.vehicle?.plateNumber ?? null,
    tenantCustomerId: r.tenantCustomerId,
    customerName: r.tenantCustomer?.fullName ?? null,
    description: r.description,
    occurredAt: r.occurredAt.toISOString(),
    createdAt: r.createdAt.toISOString(),
  };
}

function toDetail(r: DetailRow, names: Map<string, string>): ReceiptDetailDto {
  return {
    ...toListItem(r),
    referenceCode: r.referenceCode,
    requestedByName: r.requestedBy ? (names.get(r.requestedBy) ?? null) : null,
    approvedByName: r.approvedBy ? (names.get(r.approvedBy) ?? null) : null,
    approvedAt: r.approvedAt?.toISOString() ?? null,
    cancelledByName: r.cancelledBy ? (names.get(r.cancelledBy) ?? null) : null,
    cancelledAt: r.cancelledAt?.toISOString() ?? null,
    attachments: r.attachments.map((a) => a.fileUrl),
    updatedAt: r.updatedAt.toISOString(),
  };
}

function notFound(): NotFoundException {
  return new NotFoundException({ code: API_ERROR_CODE.NOT_FOUND, message: 'Không tìm thấy phiếu' });
}

/** Đơn không tồn tại HOẶC thuộc gian hàng khác — trả cùng một câu, không lộ cái nào đúng. */
function notFoundBooking(): NotFoundException {
  return new NotFoundException({
    code: API_ERROR_CODE.NOT_FOUND,
    message: 'Không tìm thấy đơn thuê để gắn phiếu',
  });
}

function notFoundVehicle(): NotFoundException {
  return new NotFoundException({
    code: API_ERROR_CODE.NOT_FOUND,
    message: 'Không tìm thấy xe để gắn phiếu',
  });
}

/**
 * Vị từ `source` của một truy vấn sổ — gộp `source` (một nguồn cụ thể) và `sourceGroup`
 * (tiền thật của gian hàng ↔ tiền giữ hộ).
 *
 * `sourceGroup` tồn tại để một thẻ tổng ở `/manage/finance` bấm sang được đúng tập phiếu đã
 * sinh ra nó. Không có nó, "Doanh thu 82,5tr" mở ra một sổ cộng 96,5tr vì sổ vẫn kể cả tiền cọc.
 *
 * Hai tham số cùng có thì áp CẢ HAI (`equals` + `in`/`notIn`) — một yêu cầu tự mâu thuẫn
 * (`source=deposit` trong nhóm `business`) trả về rỗng, đúng nghĩa đen của câu hỏi, thay vì
 * âm thầm bỏ qua một vế.
 */
function sourceFilterOf(query: ReceiptListQueryDto): Prisma.StringFilter | string | undefined {
  const held = [...HELD_FUNDS_RECEIPT_SOURCES];
  const group =
    query.sourceGroup === RECEIPT_SOURCE_GROUP.BUSINESS
      ? { notIn: held }
      : query.sourceGroup === RECEIPT_SOURCE_GROUP.HELD_FUNDS
        ? { in: held }
        : undefined;

  if (query.source && group) return { equals: query.source, ...group };
  if (query.source) return query.source;
  return group;
}

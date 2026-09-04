import { ConflictException, Injectable, NotFoundException } from '@nestjs/common';
import { Prisma } from '@xeprime/prisma';
import {
  API_ERROR_CODE,
  AUDIT_ACTOR_SCOPE,
  BANK_MATCH_STATUS,
  BANK_MATCH_TARGET_TYPE,
  SUBSCRIPTION_INVOICE_STATUS,
  type PaginationMeta,
} from '@xeprime/types';
import { PrismaService } from '../../prisma/prisma.service';
import { AuditService } from '../audit/audit.service';
import { BillingService } from '../billing/billing.service';
import { paginationMeta, resolvePaging } from '../../common/pagination';
import {
  BANK_TX_DEFAULT_LIMIT,
  BANK_TX_MAX_LIMIT,
  BankTransactionDetailDto,
  BankTransactionDto,
  BankTransactionListQueryDto,
  BankTransactionSuggestionDto,
  IgnoreBankTransactionDto,
  MatchBankTransactionDto,
} from './dto/bank-transaction.dto';

/** Bao nhiêu hoá đơn đang chờ được gợi ý ở màn chi tiết — đủ để mắt quét, không thành một danh sách thứ hai. */
const SUGGESTION_LIMIT = 12;

const SELECT = {
  id: true,
  provider: true,
  providerTxId: true,
  amountIn: true,
  content: true,
  referenceCode: true,
  bankTime: true,
  matchStatus: true,
  matchedType: true,
  matchedRefId: true,
  matchNote: true,
  matchedAt: true,
  matchedBy: true,
  createdAt: true,
} satisfies Prisma.BankTransactionSelect;

/**
 * Hàng đợi đối soát của admin nền tảng — mặt ĐỌC và KHỚP TAY của `bank_transactions`.
 *
 * Tách khỏi `SepayService` (mặt ghi từ webhook) vì hai bề mặt khác nhau hoàn toàn: một bên là
 * endpoint công khai không session, một bên là màn quản trị có quyền và audit. Nhưng **đường
 * tiền thì chỉ có một**: khớp tay cũng gọi đúng `BillingService.applyBankPaymentWithinTx` mà
 * webhook gọi — nếu không, hai đường sẽ trôi khỏi nhau và một trong hai sẽ cộng tiền sai cách.
 *
 * ADR 0022 điều 4: hệ thống KHÔNG BAO GIỜ tự khớp theo số tiền. `suggestions` chỉ sắp xếp cho
 * mắt người; mọi dòng `manual` đều là một con người chịu trách nhiệm, nên `note` bắt buộc và
 * `matched_by` luôn được điền.
 */
@Injectable()
export class BankTransactionsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
    private readonly billing: BillingService,
  ) {}

  async list(
    query: BankTransactionListQueryDto,
  ): Promise<{ data: BankTransactionDto[]; meta: PaginationMeta }> {
    const paging = resolvePaging(query, BANK_TX_DEFAULT_LIMIT, BANK_TX_MAX_LIMIT);
    const where: Prisma.BankTransactionWhereInput = {
      // Không lọc gì = VIỆC CẦN LÀM (chưa khớp), không phải toàn bộ lịch sử. Lịch sử vẫn lấy
      // được bằng `?matchStatus=`, nhưng nó không đáng chiếm màn hình mặc định.
      matchStatus: query.matchStatus ?? BANK_MATCH_STATUS.UNMATCHED,
      ...(query.q
        ? {
            OR: [
              { content: { contains: query.q, mode: 'insensitive' } },
              { referenceCode: { contains: query.q, mode: 'insensitive' } },
            ],
          }
        : {}),
    };

    const [total, rows] = await this.prisma.$transaction([
      this.prisma.bankTransaction.count({ where }),
      this.prisma.bankTransaction.findMany({
        where,
        orderBy: { createdAt: 'desc' },
        skip: paging.skip,
        take: paging.take,
        select: SELECT,
      }),
    ]);

    return {
      data: await this.decorate(rows),
      meta: paginationMeta(paging, total),
    };
  }

  async getOne(id: string): Promise<BankTransactionDetailDto> {
    const row = await this.prisma.bankTransaction.findUnique({
      where: { id },
      select: { ...SELECT, rawJson: true },
    });
    if (!row) {
      throw new NotFoundException({
        code: API_ERROR_CODE.NOT_FOUND,
        message: 'Không tìm thấy giao dịch',
      });
    }
    const [base] = await this.decorate([row]);
    return {
      ...base!,
      rawJson: row.rawJson,
      suggestions: await this.suggest(row.amountIn),
    };
  }

  /**
   * Khớp TAY một giao dịch vào một hoá đơn gói.
   *
   * Hai chốt chặn, cả hai đều là `updateMany` có điều kiện thay vì đọc-rồi-ghi:
   *  1. giao dịch phải còn `unmatched` — hai admin cùng bấm thì đúng một người thắng;
   *  2. hiệu ứng tiền đi qua `applyBankPaymentWithinTx`, TRONG cùng transaction với cột
   *     `matched_*` (ADR 0022 điều 2 — hai sổ không được lệch nhau nửa chừng).
   */
  async match(
    id: string,
    actorUserId: string,
    dto: MatchBankTransactionDto,
  ): Promise<BankTransactionDetailDto> {
    const tx = await this.loadPending(id);

    const invoice = await this.prisma.subscriptionInvoice.findUnique({
      where: { id: dto.invoiceId },
      select: { id: true, code: true, status: true },
    });
    if (!invoice) {
      throw new NotFoundException({
        code: API_ERROR_CODE.NOT_FOUND,
        message: 'Không tìm thấy hoá đơn',
      });
    }
    // `void`/`draft` không nhận tiền được. KHÔNG mở lại hoá đơn đã chết: kỳ và giá của nó có
    // thể đã cũ, và mở lại là sửa lịch sử một cách âm thầm.
    const payable: string[] = [
      SUBSCRIPTION_INVOICE_STATUS.ISSUED,
      SUBSCRIPTION_INVOICE_STATUS.PARTIALLY_PAID,
      SUBSCRIPTION_INVOICE_STATUS.PAID,
    ];
    if (!payable.includes(invoice.status)) {
      throw new ConflictException({
        code: API_ERROR_CODE.BANK_TX_TARGET_NOT_PAYABLE,
        message: 'Hoá đơn này không còn nhận tiền được',
        details: { invoiceStatus: invoice.status },
      });
    }

    await this.prisma.$transaction(async (db) => {
      const claimed = await db.bankTransaction.updateMany({
        where: { id, matchStatus: BANK_MATCH_STATUS.UNMATCHED },
        data: {
          matchStatus: BANK_MATCH_STATUS.MANUAL,
          matchedType: BANK_MATCH_TARGET_TYPE.SUBSCRIPTION_INVOICE,
          matchedRefId: invoice.id,
          matchNote: dto.note,
          matchedBy: actorUserId,
          matchedAt: new Date(),
        },
      });
      if (claimed.count === 0) {
        throw new ConflictException({
          code: API_ERROR_CODE.BANK_TX_ALREADY_HANDLED,
          message: 'Giao dịch này vừa được xử lý bởi người khác',
        });
      }

      const applied = await this.billing.applyBankPaymentWithinTx(db, {
        code: invoice.code,
        amount: tx.amountIn,
        providerTxId: tx.providerTxId,
      });

      await this.audit.record(
        {
          actorUserId,
          actorScope: AUDIT_ACTOR_SCOPE.PLATFORM,
          action: 'bank_transaction.match_manual',
          targetType: 'bank_transaction',
          targetId: id,
          before: { matchStatus: BANK_MATCH_STATUS.UNMATCHED },
          after: {
            matchStatus: BANK_MATCH_STATUS.MANUAL,
            invoiceId: invoice.id,
            invoiceCode: invoice.code,
            amount: tx.amountIn.toString(),
            outcome: applied.outcome,
            note: dto.note,
          },
        },
        db,
      );
    });

    return this.getOne(id);
  }

  /**
   * Bỏ qua một giao dịch — tiền vào không thuộc luồng nào của nền tảng (chuyển nhầm, hoàn tiền
   * về, tiền của việc khác).
   *
   * KHÔNG xoá dòng: sổ ngân hàng là bằng chứng, và một khoản "đã xem xét rồi bỏ qua" khác hẳn
   * một khoản chưa ai nhìn. `note` bắt buộc để lần đối chiếu quỹ sau còn giải thích được.
   */
  async ignore(
    id: string,
    actorUserId: string,
    dto: IgnoreBankTransactionDto,
  ): Promise<BankTransactionDetailDto> {
    await this.loadPending(id);

    await this.prisma.$transaction(async (db) => {
      const claimed = await db.bankTransaction.updateMany({
        where: { id, matchStatus: BANK_MATCH_STATUS.UNMATCHED },
        data: {
          matchStatus: BANK_MATCH_STATUS.IGNORED,
          matchNote: dto.note,
          matchedBy: actorUserId,
          matchedAt: new Date(),
        },
      });
      if (claimed.count === 0) {
        throw new ConflictException({
          code: API_ERROR_CODE.BANK_TX_ALREADY_HANDLED,
          message: 'Giao dịch này vừa được xử lý bởi người khác',
        });
      }
      await this.audit.record(
        {
          actorUserId,
          actorScope: AUDIT_ACTOR_SCOPE.PLATFORM,
          action: 'bank_transaction.ignore',
          targetType: 'bank_transaction',
          targetId: id,
          before: { matchStatus: BANK_MATCH_STATUS.UNMATCHED },
          after: { matchStatus: BANK_MATCH_STATUS.IGNORED, note: dto.note },
        },
        db,
      );
    });

    return this.getOne(id);
  }

  // ── Nội bộ ────────────────────────────────────────────────────────────────

  private async loadPending(id: string) {
    const row = await this.prisma.bankTransaction.findUnique({
      where: { id },
      select: { id: true, amountIn: true, providerTxId: true, matchStatus: true },
    });
    if (!row) {
      throw new NotFoundException({
        code: API_ERROR_CODE.NOT_FOUND,
        message: 'Không tìm thấy giao dịch',
      });
    }
    if (row.matchStatus !== BANK_MATCH_STATUS.UNMATCHED) {
      throw new ConflictException({
        code: API_ERROR_CODE.BANK_TX_ALREADY_HANDLED,
        message: 'Giao dịch này đã được xử lý',
      });
    }
    return row;
  }

  /**
   * Hoá đơn đang chờ tiền, sắp theo mức khớp số tiền rồi tới mới nhất.
   *
   * Sắp xếp ở NODE chứ không ở SQL: "còn thiếu" = `total − paid`, một biểu thức trên hai cột mà
   * Prisma không `orderBy` được, và số hoá đơn đang chờ ở quy mô pilot chỉ vài chục dòng. Khi
   * nào con số đó thành hàng nghìn thì đổi sang cột `remaining_amount` sinh sẵn, không phải sang
   * một câu raw SQL khó đọc.
   */
  private async suggest(amount: Prisma.Decimal): Promise<BankTransactionSuggestionDto[]> {
    const rows = await this.prisma.subscriptionInvoice.findMany({
      where: {
        status: {
          in: [SUBSCRIPTION_INVOICE_STATUS.ISSUED, SUBSCRIPTION_INVOICE_STATUS.PARTIALLY_PAID],
        },
      },
      orderBy: { createdAt: 'desc' },
      take: 200,
      select: {
        id: true,
        code: true,
        status: true,
        totalAmount: true,
        paidAmount: true,
        createdAt: true,
        tenant: { select: { name: true } },
      },
    });

    return rows
      .map((r) => {
        const remaining = r.totalAmount.sub(r.paidAmount);
        return {
          invoiceId: r.id,
          code: r.code,
          tenantName: r.tenant.name,
          status: r.status,
          totalAmount: r.totalAmount.toString(),
          paidAmount: r.paidAmount.toString(),
          remainingAmount: remaining.toString(),
          amountMatches: remaining.equals(amount),
          createdAt: r.createdAt.toISOString(),
        };
      })
      .sort((a, b) => {
        if (a.amountMatches !== b.amountMatches) return a.amountMatches ? -1 : 1;
        return b.createdAt.localeCompare(a.createdAt);
      })
      .slice(0, SUGGESTION_LIMIT);
  }

  /**
   * Bù hai trường mà bảng `bank_transactions` cố ý không có khoá ngoại tới (ADR 0022 điều 2):
   * tên admin đã thao tác, và mã hoá đơn đã khớp. Tra theo LÔ — một vòng lặp `findUnique` cho
   * 20 dòng là 40 lượt đi database cho một màn danh sách.
   */
  private async decorate(
    rows: Array<Prisma.BankTransactionGetPayload<{ select: typeof SELECT }>>,
  ): Promise<BankTransactionDto[]> {
    const actorIds = [...new Set(rows.map((r) => r.matchedBy).filter((v): v is string => !!v))];
    const invoiceIds = [
      ...new Set(
        rows
          .filter((r) => r.matchedType === BANK_MATCH_TARGET_TYPE.SUBSCRIPTION_INVOICE)
          .map((r) => r.matchedRefId)
          .filter((v): v is string => !!v),
      ),
    ];

    const [actors, invoices] = await Promise.all([
      actorIds.length
        ? this.prisma.user.findMany({
            where: { id: { in: actorIds } },
            select: { id: true, displayName: true },
          })
        : Promise.resolve([]),
      invoiceIds.length
        ? this.prisma.subscriptionInvoice.findMany({
            where: { id: { in: invoiceIds } },
            select: { id: true, code: true },
          })
        : Promise.resolve([]),
    ]);
    const actorName = new Map(actors.map((a) => [a.id, a.displayName]));
    const invoiceCode = new Map(invoices.map((i) => [i.id, i.code]));

    return rows.map((r) => ({
      id: r.id,
      provider: r.provider,
      providerTxId: r.providerTxId,
      amountIn: r.amountIn.toString(),
      content: r.content,
      referenceCode: r.referenceCode,
      bankTime: r.bankTime?.toISOString() ?? null,
      matchStatus: r.matchStatus,
      matchedType: r.matchedType,
      matchedRefId: r.matchedRefId,
      matchNote: r.matchNote,
      matchedAt: r.matchedAt?.toISOString() ?? null,
      matchedByName: r.matchedBy ? (actorName.get(r.matchedBy) ?? null) : null,
      createdAt: r.createdAt.toISOString(),
      matchedInvoiceCode: r.matchedRefId ? (invoiceCode.get(r.matchedRefId) ?? null) : null,
    }));
  }
}

import { ConflictException, Injectable, NotFoundException } from '@nestjs/common';
import { Prisma } from '@xeprime/prisma';
import { formatMoneyVndVi } from '@xeprime/domain';
import {
  API_ERROR_CODE,
  AUDIT_ACTOR_SCOPE,
  BANK_DIRECTION,
  BANK_MATCH_REASON,
  BANK_MATCH_STATUS,
  BANK_MATCH_TARGET_TYPE,
  BANK_MATCH_WALLET_CREDIT,
  BANK_TX_CODE_FILTER,
  BOOKING_EXTENSION_STATUS,
  BOOKING_HOLD_STATUS,
  NOTIFICATION_TYPE,
  REFERENCE_CODE_PREFIX,
  SUBSCRIPTION_INVOICE_PAYABLE_STATUSES,
  SUBSCRIPTION_INVOICE_STATUS,
  WALLET_ENTRY_KIND,
  WALLET_ENTRY_SOURCE,
  WALLET_OWNER_TYPE,
  addDateKeyDays,
  isHoldPastDue,
  referenceCodeTarget,
  resolveRefundWalletOwner,
  vnDayStart,
  type BankTxCodeFilter,
  type PaginationMeta,
} from '@xeprime/types';
import { PrismaService } from '../../prisma/prisma.service';
import { AuditService } from '../audit/audit.service';
import { BillingService } from '../billing/billing.service';
import { BookingExtensionsService } from '../booking-extensions/booking-extensions.service';
import { BookingHoldsService } from '../holds/booking-holds.service';
import { NotificationService } from '../notification/notification.service';
import { WalletService } from '../wallet/wallet.service';
import { paginationMeta, resolvePaging } from '../../common/pagination';
import {
  BANK_TX_DEFAULT_LIMIT,
  BANK_TX_MAX_LIMIT,
  BankTransactionDetailDto,
  BankTransactionDto,
  BankTransactionListQueryDto,
  BankTransactionSuggestionDto,
  BankTxLateCreditDto,
  BankTxReceivableSuggestionDto,
  CreditCustomerDto,
  IgnoreBankTransactionDto,
  MatchBankTransactionDto,
  MatchReceivableDto,
  type BankTxReceivableType,
} from './dto/bank-transaction.dto';

/** Bao nhiêu hoá đơn đang chờ được gợi ý ở màn chi tiết - đủ để mắt quét, không thành một danh sách thứ hai. */
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
  matchReasonCode: true,
  matchReasonParams: true,
  matchedAt: true,
  matchedBy: true,
  refundReference: true,
  refundedAt: true,
  createdAt: true,
} satisfies Prisma.BankTransactionSelect;

/**
 * Hàng đợi đối soát của admin nền tảng - mặt ĐỌC và KHỚP TAY của `bank_transactions`.
 *
 * Tách khỏi `SepayService` (mặt ghi từ webhook) vì hai bề mặt khác nhau hoàn toàn: một bên là
 * endpoint công khai không session, một bên là màn quản trị có quyền và audit. Nhưng **đường
 * tiền thì chỉ có một**: khớp tay cũng gọi đúng `BillingService.applyBankPaymentWithinTx` mà
 * webhook gọi - nếu không, hai đường sẽ trôi khỏi nhau và một trong hai sẽ cộng tiền sai cách.
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
    /** Khớp tay vào khoản giữ chỗ / phụ lục đi CÙNG đường áp tiền của webhook (ADR 0092). */
    private readonly holds: BookingHoldsService,
    private readonly extensions: BookingExtensionsService,
    /** Writer duy nhất của sổ ví — tiền về muộn ghi có ví khách qua đây (ADR 0033 điều 6). */
    private readonly wallet: WalletService,
    private readonly notifications: NotificationService,
  ) {}

  async list(
    query: BankTransactionListQueryDto,
  ): Promise<{ data: BankTransactionDto[]; meta: PaginationMeta }> {
    const paging = resolvePaging(query, BANK_TX_DEFAULT_LIMIT, BANK_TX_MAX_LIMIT);
    // Hai bộ lọc cùng cần `OR` (tìm kiếm, khoảng ngày) - gom vào `AND` để không cái nào ghi đè cái nào.
    const and: Prisma.BankTransactionWhereInput[] = [];
    if (query.q) {
      and.push({
        OR: [
          { content: { contains: query.q, mode: 'insensitive' } },
          { referenceCode: { contains: query.q, mode: 'insensitive' } },
          // Mã tham chiếu PHÍA NGÂN HÀNG (FT…) — thứ khách đọc trên biên lai khi gọi hỏi tiền.
          { rawJson: { path: ['referenceCode'], string_contains: query.q } },
        ],
      });
    }
    if (query.amount) and.push({ amountIn: new Prisma.Decimal(query.amount) });
    if (query.reason) and.push({ matchReasonCode: query.reason });
    const range = vnDayRange(query.from, query.to);
    if (range) {
      // Thời điểm NGÂN HÀNG là thứ người trực đối chiếu với sao kê; dòng thiếu nó (payload cũ) lấy
      // lúc webhook tới - lệch vài giây, không lệch ngày.
      and.push({ OR: [{ bankTime: range }, { bankTime: null, createdAt: range }] });
    }
    const where: Prisma.BankTransactionWhereInput = {
      // Hàng đợi này là tiền VÀO; dòng chiều ra (khi SePay mở webhook đó) có sổ đối chiếu riêng.
      direction: BANK_DIRECTION.IN,
      // Không lọc gì = VIỆC CẦN LÀM (chưa khớp), không phải toàn bộ lịch sử. Lịch sử vẫn lấy
      // được bằng `?matchStatus=`, nhưng nó không đáng chiếm màn hình mặc định.
      matchStatus: query.matchStatus ?? BANK_MATCH_STATUS.UNMATCHED,
      ...codeFilterWhere(query.code),
      ...(and.length ? { AND: and } : {}),
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
    const raw = isRecord(row.rawJson) ? row.rawJson : {};
    const pending = row.matchStatus === BANK_MATCH_STATUS.UNMATCHED;
    return {
      ...base!,
      rawJson: row.rawJson,
      bankGateway: rawText(raw, 'gateway'),
      bankAccountNumber: rawText(raw, 'accountNumber'),
      bankReferenceNumber: rawText(raw, 'referenceCode'),
      suggestions: await this.suggest(row.amountIn),
      // Hai gợi ý mới chỉ có nghĩa khi giao dịch còn chờ người xử lý.
      receivableSuggestions: pending ? await this.suggestReceivables(row.amountIn) : [],
      lateCredit: pending ? await this.lateCreditTarget(row.referenceCode) : null,
    };
  }

  /**
   * Khớp TAY vào một khoản giữ chỗ (XPH) / phụ lục (XPE) CÒN NHẬN TIỀN — ca khách chuyển sai nội
   * dung khi khoản đó còn hạn (ADR 0092). Đi CÙNG đường áp tiền của webhook
   * (`applyBankPaymentWithinTx`) trong cùng transaction với cột `matched_*`: đủ tiền thì đơn được tạo
   * ngay tại đây, đúng như khi mã được gõ đúng.
   *
   * Khoản ĐÃ ĐÓNG không bao giờ được khớp để tạo đơn (ADR 0044 điều 7) — lịch xe có thể đã thuộc
   * về khách khác; đường đúng là `creditCustomer`.
   */
  async matchReceivable(
    id: string,
    actorUserId: string,
    dto: MatchReceivableDto,
  ): Promise<BankTransactionDetailDto> {
    const tx = await this.loadPending(id);
    const target = await this.loadReceivable(dto.targetType, dto.targetId);
    if (!target.receivable) {
      throw new ConflictException({
        code: API_ERROR_CODE.BANK_TX_TARGET_CLOSED,
        message: 'Khoản này đã đóng, không nhận tiền nữa - hãy ghi có Ví điểm khách',
        details: { status: target.status },
      });
    }

    await this.prisma.$transaction(async (db) => {
      const claimed = await db.bankTransaction.updateMany({
        where: { id, matchStatus: BANK_MATCH_STATUS.UNMATCHED },
        data: {
          matchStatus: BANK_MATCH_STATUS.MANUAL,
          matchedType: dto.targetType,
          matchedRefId: target.id,
          matchNote: dto.note,
          matchedBy: actorUserId,
          matchedAt: new Date(),
        },
      });
      if (claimed.count === 0) throw alreadyHandled();

      const input = { code: target.code, amount: tx.amountIn, providerTxId: tx.providerTxId };
      let outcome: string;
      if (dto.targetType === BANK_MATCH_TARGET_TYPE.BOOKING_HOLD) {
        const applied = await this.holds.applyBankPaymentWithinTx(db, input);
        outcome = applied.outcome;
        // Khoản vừa đóng GIỮA phép kiểm và lượt áp (worker hết hạn chạy xen) ⇒ cả lượt cuộn lại.
        if (applied.outcome === 'hold_not_found' || applied.outcome === 'hold_closed') {
          throw targetClosed(applied.outcome === 'hold_closed' ? applied.status : null);
        }
      } else {
        const applied = await this.extensions.applyBankPaymentWithinTx(db, input);
        outcome = applied.outcome;
        if (applied.outcome === 'not_found' || applied.outcome === 'closed') {
          throw targetClosed(applied.outcome === 'closed' ? applied.status : null);
        }
      }
      if (outcome === 'already_paid') {
        // Khoản vừa đủ tiền ở một lượt song song ⇒ tiền này là THỪA, đã hoàn vào ví khách.
        await db.bankTransaction.update({
          where: { id },
          data: { matchReasonCode: BANK_MATCH_REASON.OVERPAID },
        });
      }

      await this.audit.record(
        {
          tenantId: target.tenantId,
          actorUserId,
          actorScope: AUDIT_ACTOR_SCOPE.PLATFORM,
          action: 'bank_transaction.match_receivable',
          targetType: 'bank_transaction',
          targetId: id,
          before: { matchStatus: BANK_MATCH_STATUS.UNMATCHED },
          after: {
            matchStatus: BANK_MATCH_STATUS.MANUAL,
            targetType: dto.targetType,
            targetId: target.id,
            targetCode: target.code,
            amount: tx.amountIn.toString(),
            outcome,
            note: dto.note,
          },
        },
        db,
      );
    });

    return this.getOne(id);
  }

  /**
   * GHI CÓ VÍ ĐIỂM KHÁCH cho tiền chuyển tới SAU khi khoản giữ chỗ / phụ lục đã đóng (ADR 0092) —
   * thay cho chuyển trả tay ra ngoài sổ. Tiền vào ví của TÀI KHOẢN KHÁCH đã đặt (ADR 0053 điều 8),
   * khách rút về ngân hàng qua đường rút sẵn có.
   *
   * Khoản CÒN nhận tiền thì từ chối (`BANK_TX_TARGET_STILL_OPEN`): khách chuyển là để giữ chuyến —
   * khớp vào khoản đó (`matchReceivable`) chứ không hoàn tiền đi.
   *
   * Một transaction: lượt nhận giao dịch + bút toán ví + audit + thông báo. Chống ghi đôi ở hai lớp:
   * `match_status = unmatched` khi nhận, và unique 4 cột của sổ ví (nguồn = chính giao dịch này).
   */
  async creditCustomer(
    id: string,
    actorUserId: string,
    dto: CreditCustomerDto,
  ): Promise<BankTransactionDetailDto> {
    const tx = await this.loadPending(id);
    const target = await this.loadReceivable(dto.targetType, dto.targetId);
    if (target.receivable) {
      throw new ConflictException({
        code: API_ERROR_CODE.BANK_TX_TARGET_STILL_OPEN,
        message: 'Khoản này vẫn đang chờ tiền - hãy khớp vào nó thay vì hoàn tiền',
      });
    }
    const customerUserId = target.customerUserId;
    if (!customerUserId) {
      throw new ConflictException({
        code: API_ERROR_CODE.BANK_TX_NO_CUSTOMER_ACCOUNT,
        message: 'Khoản này không gắn tài khoản khách nào để ghi có ví',
      });
    }

    await this.prisma.$transaction(async (db) => {
      const now = new Date();
      const claimed = await db.bankTransaction.updateMany({
        where: { id, matchStatus: BANK_MATCH_STATUS.UNMATCHED },
        data: {
          matchStatus: BANK_MATCH_STATUS.MANUAL,
          matchedType: BANK_MATCH_WALLET_CREDIT,
          matchNote: dto.note,
          // Mã của khoản gốc — để dòng đã xử lý vẫn nói được tiền này thuộc chuyến nào.
          matchReasonParams: { code: target.code, status: target.status },
          matchedBy: actorUserId,
          matchedAt: now,
        },
      });
      if (claimed.count === 0) throw alreadyHandled();

      const credited = await this.wallet.creditWithinTx(db, {
        owner: {
          type: WALLET_OWNER_TYPE.USER,
          userId: resolveRefundWalletOwner(customerUserId).userId,
        },
        kind: WALLET_ENTRY_KIND.LATE_PAYMENT_REFUND,
        sourceType: WALLET_ENTRY_SOURCE.BANK_TRANSACTION,
        sourceRefId: id,
        amount: tx.amountIn,
        ...(dto.targetType === BANK_MATCH_TARGET_TYPE.BOOKING_HOLD ? { holdId: target.id } : {}),
        note: `Tiền chuyển muộn cho ${target.code}`,
        createdByUserId: actorUserId,
      });
      // Nguồn này đã ghi có từ trước — không bao giờ xảy ra khi lượt nhận ở trên thắng, nhưng nếu có
      // thì cuộn lại thay vì để giao dịch nói "đã ghi có" mà ví không có dòng nào mới.
      if (!credited) throw alreadyHandled();
      await db.bankTransaction.update({
        where: { id },
        data: { matchedRefId: credited.entryId },
      });

      await this.notifications.emitToUser(
        customerUserId,
        {
          type: NOTIFICATION_TYPE.HOLD_REFUNDED,
          title: 'Đã hoàn tiền chuyển muộn vào Ví điểm',
          body: `Khoản ${formatMoneyVndVi(tx.amountIn.toString())} chuyển cho mã ${target.code} tới sau khi khoản giữ chỗ đã đóng - XePrime đã hoàn vào Ví điểm của bạn.`,
          tenantId: target.tenantId,
        },
        db,
      );

      await this.audit.record(
        {
          tenantId: target.tenantId,
          actorUserId,
          actorScope: AUDIT_ACTOR_SCOPE.PLATFORM,
          action: 'bank_transaction.credit_customer',
          targetType: 'bank_transaction',
          targetId: id,
          before: { matchStatus: BANK_MATCH_STATUS.UNMATCHED },
          after: {
            matchStatus: BANK_MATCH_STATUS.MANUAL,
            matchedType: BANK_MATCH_WALLET_CREDIT,
            walletEntryId: credited.entryId,
            targetType: dto.targetType,
            targetCode: target.code,
            amount: tx.amountIn.toString(),
            note: dto.note,
          },
        },
        db,
      );
    });

    return this.getOne(id);
  }

  /**
   * Khớp TAY một giao dịch vào một hoá đơn gói.
   *
   * Hai chốt chặn, cả hai đều là `updateMany` có điều kiện thay vì đọc-rồi-ghi:
   *  1. giao dịch phải còn `unmatched` - hai admin cùng bấm thì đúng một người thắng;
   *  2. hiệu ứng tiền đi qua `applyBankPaymentWithinTx`, TRONG cùng transaction với cột
   *     `matched_*` (ADR 0022 điều 2 - hai sổ không được lệch nhau nửa chừng).
   */
  async match(
    id: string,
    actorUserId: string,
    dto: MatchBankTransactionDto,
  ): Promise<BankTransactionDetailDto> {
    const tx = await this.loadPending(id);

    const invoice = await this.prisma.subscriptionInvoice.findUnique({
      where: { id: dto.invoiceId },
      select: { id: true, code: true, status: true, checkout: { select: { code: true } } },
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
      /*
       * Phần chuyển thừa ghi có ví gian hàng — cùng luật với webhook (ADR 0092). Đo bằng tiền thật
       * đã khớp: khớp khoản chuyển khoản thật vào hoá đơn gói admin gán tay là TRẢ gói, không thừa.
       */
      const credited = await this.billing.creditSubscriptionOverpayWithinTx(db, {
        matchedType: BANK_MATCH_TARGET_TYPE.SUBSCRIPTION_INVOICE,
        refId: invoice.id,
        amount: tx.amountIn,
        bankTransactionId: id,
      });
      if (credited.gt(0)) {
        await db.bankTransaction.update({
          where: { id },
          data: { matchReasonCode: BANK_MATCH_REASON.OVERPAID },
        });
      }

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
            // Hoá đơn con của phiếu gộp: tiền vào PHIẾU (ADR 0083) - ghi mã phiếu để đối chiếu.
            ...(invoice.checkout ? { checkoutCode: invoice.checkout.code } : {}),
            amount: tx.amountIn.toString(),
            outcome: applied.outcome,
            overpayCredited: credited.toFixed(0),
            note: dto.note,
          },
        },
        db,
      );
    });

    return this.getOne(id);
  }

  /**
   * Bỏ qua một giao dịch - tiền vào không thuộc luồng nào của nền tảng (chuyển nhầm, hoàn tiền
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

    const now = new Date();
    // Chỉ ghi "đã trả lại" khi có MÃ giao dịch - CHECK ở DB đòi hai cột đi cặp.
    const refundReference = dto.refundReference?.trim() || null;

    await this.prisma.$transaction(async (db) => {
      const claimed = await db.bankTransaction.updateMany({
        where: { id, matchStatus: BANK_MATCH_STATUS.UNMATCHED },
        data: {
          matchStatus: BANK_MATCH_STATUS.IGNORED,
          matchNote: dto.note,
          matchedBy: actorUserId,
          matchedAt: now,
          refundReference,
          refundedAt: refundReference ? now : null,
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
          after: { matchStatus: BANK_MATCH_STATUS.IGNORED, note: dto.note, refundReference },
        },
        db,
      );
    });

    return this.getOne(id);
  }

  // ── Nội bộ ────────────────────────────────────────────────────────────────

  /**
   * Một khoản của KHÁCH (giữ chỗ / phụ lục) + nó CÒN NHẬN TIỀN không — đọc theo MỐC hạn, không theo
   * cột trạng thái (worker có thể chưa kịp lật `expired` — cùng luật `isHoldPastDue` của webhook).
   */
  private async loadReceivable(
    type: BankTxReceivableType,
    id: string,
  ): Promise<{
    id: string;
    code: string;
    status: string;
    tenantId: string;
    customerUserId: string | null;
    receivable: boolean;
  }> {
    const row =
      type === BANK_MATCH_TARGET_TYPE.BOOKING_HOLD
        ? await this.prisma.bookingHold.findUnique({
            where: { id },
            select: {
              id: true,
              code: true,
              status: true,
              expiresAt: true,
              tenantId: true,
              customerUserId: true,
            },
          })
        : await this.prisma.bookingExtension.findUnique({
            where: { id },
            select: {
              id: true,
              code: true,
              status: true,
              expiresAt: true,
              tenantId: true,
              customerUserId: true,
            },
          });
    if (!row) {
      throw new NotFoundException({
        code: API_ERROR_CODE.NOT_FOUND,
        message: 'Không tìm thấy khoản đã chọn',
      });
    }
    return { ...row, receivable: isReceivable(type, row.status, row.expiresAt) };
  }

  /** Khoản giữ chỗ / phụ lục còn nhận tiền — khoản khớp đúng số tiền lên trước, rồi hạn gần nhất. */
  private async suggestReceivables(
    amount: Prisma.Decimal,
  ): Promise<BankTxReceivableSuggestionDto[]> {
    const now = new Date();
    const [holds, extensions] = await Promise.all([
      this.prisma.bookingHold.findMany({
        where: {
          status: { in: [BOOKING_HOLD_STATUS.PENDING, BOOKING_HOLD_STATUS.UNDERPAID] },
          expiresAt: { gt: now },
        },
        orderBy: { expiresAt: 'asc' },
        take: 100,
        select: {
          id: true,
          code: true,
          amount: true,
          paidAmount: true,
          expiresAt: true,
          bookingRequest: { select: { customerName: true } },
          tenant: { select: { name: true } },
        },
      }),
      this.prisma.bookingExtension.findMany({
        where: {
          status: BOOKING_EXTENSION_STATUS.AWAITING_PAYMENT,
          OR: [{ expiresAt: null }, { expiresAt: { gt: now } }],
        },
        orderBy: { createdAt: 'desc' },
        take: 100,
        select: {
          id: true,
          code: true,
          onlineAmount: true,
          paidAmount: true,
          expiresAt: true,
          booking: { select: { customerName: true } },
          tenant: { select: { name: true } },
        },
      }),
    ]);
    const rows: BankTxReceivableSuggestionDto[] = [
      ...holds.map((h) => ({
        targetType: BANK_MATCH_TARGET_TYPE.BOOKING_HOLD,
        targetId: h.id,
        code: h.code,
        customerName: h.bookingRequest.customerName,
        tenantName: h.tenant.name,
        amount: h.amount.toFixed(0),
        paidAmount: h.paidAmount.toFixed(0),
        remainingAmount: h.amount.sub(h.paidAmount).toFixed(0),
        expiresAt: h.expiresAt.toISOString(),
        amountMatches: h.amount.sub(h.paidAmount).equals(amount),
      })),
      ...extensions.map((e) => ({
        targetType: BANK_MATCH_TARGET_TYPE.BOOKING_EXTENSION,
        targetId: e.id,
        code: e.code,
        customerName: e.booking.customerName,
        tenantName: e.tenant.name,
        amount: e.onlineAmount.toFixed(0),
        paidAmount: e.paidAmount.toFixed(0),
        remainingAmount: e.onlineAmount.sub(e.paidAmount).toFixed(0),
        expiresAt: e.expiresAt?.toISOString() ?? null,
        amountMatches: e.onlineAmount.sub(e.paidAmount).equals(amount),
      })),
    ];
    return rows
      .sort((a, b) => {
        if (a.amountMatches !== b.amountMatches) return a.amountMatches ? -1 : 1;
        return (a.expiresAt ?? '9').localeCompare(b.expiresAt ?? '9');
      })
      .slice(0, SUGGESTION_LIMIT);
  }

  /**
   * Mã trong nội dung trỏ tới một khoản giữ chỗ / phụ lục ĐÃ ĐÓNG ⇒ đó là đích của "Ghi có Ví điểm
   * khách". Còn nhận tiền thì không (phải khớp vào nó); không có mã / mã gói thì không.
   */
  private async lateCreditTarget(
    referenceCode: string | null,
  ): Promise<BankTxLateCreditDto | null> {
    const type = referenceCodeTarget(referenceCode);
    if (!referenceCode) return null;
    const code = referenceCode.toUpperCase();
    if (type === BANK_MATCH_TARGET_TYPE.BOOKING_HOLD) {
      const hold = await this.prisma.bookingHold.findUnique({
        where: { code },
        select: {
          id: true,
          code: true,
          status: true,
          expiresAt: true,
          customerUserId: true,
          bookingRequest: { select: { customerName: true } },
        },
      });
      if (!hold || isReceivable(type, hold.status, hold.expiresAt)) return null;
      return {
        targetType: type,
        targetId: hold.id,
        code: hold.code,
        status: hold.status,
        customerName: hold.bookingRequest.customerName,
        hasCustomerAccount: hold.customerUserId !== null,
      };
    }
    if (type === BANK_MATCH_TARGET_TYPE.BOOKING_EXTENSION) {
      const ext = await this.prisma.bookingExtension.findUnique({
        where: { code },
        select: {
          id: true,
          code: true,
          status: true,
          expiresAt: true,
          customerUserId: true,
          booking: { select: { customerName: true } },
        },
      });
      if (!ext || isReceivable(type, ext.status, ext.expiresAt)) return null;
      return {
        targetType: type,
        targetId: ext.id,
        code: ext.code,
        status: ext.status,
        customerName: ext.booking.customerName,
        hasCustomerAccount: ext.customerUserId !== null,
      };
    }
    return null;
  }

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
          in: [...SUBSCRIPTION_INVOICE_PAYABLE_STATUSES],
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
        checkout: {
          select: { id: true, code: true, status: true, totalAmount: true, paidAmount: true },
        },
      },
    });

    /*
     * Hoá đơn thuộc PHIẾU GỘP (ADR 0083) nhận tiền qua phiếu, nên gợi ý nói bằng con số của PHIẾU
     * - mã XPC, tổng và phần còn thiếu của cả cụm - và chỉ MỘT dòng cho mỗi phiếu. `invoiceId` vẫn
     * là một hoá đơn con: khớp tay vào nó tự chuyển sang phiếu (`applyBankPaymentWithinTx`).
     */
    const seenCheckouts = new Set<string>();
    return rows
      .filter((r) => {
        if (!r.checkout) return true;
        if (seenCheckouts.has(r.checkout.id)) return false;
        seenCheckouts.add(r.checkout.id);
        return true;
      })
      .map((r) => {
        const source = r.checkout ?? r;
        const remaining = source.totalAmount.sub(source.paidAmount);
        return {
          invoiceId: r.id,
          code: source.code,
          tenantName: r.tenant.name,
          status: source.status,
          totalAmount: source.totalAmount.toString(),
          paidAmount: source.paidAmount.toString(),
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
   * tên admin đã thao tác, và mã hoá đơn đã khớp. Tra theo LÔ - một vòng lặp `findUnique` cho
   * 20 dòng là 40 lượt đi database cho một màn danh sách.
   */
  private async decorate(
    rows: Array<Prisma.BankTransactionGetPayload<{ select: typeof SELECT }>>,
  ): Promise<BankTransactionDto[]> {
    const actorIds = [...new Set(rows.map((r) => r.matchedBy).filter((v): v is string => !!v))];
    const refIdsOf = (type: string) => [
      ...new Set(
        rows
          .filter((r) => r.matchedType === type)
          .map((r) => r.matchedRefId)
          .filter((v): v is string => !!v),
      ),
    ];
    const invoiceIds = refIdsOf(BANK_MATCH_TARGET_TYPE.SUBSCRIPTION_INVOICE);
    const checkoutIds = refIdsOf(BANK_MATCH_TARGET_TYPE.SUBSCRIPTION_CHECKOUT);
    const holdIds = refIdsOf(BANK_MATCH_TARGET_TYPE.BOOKING_HOLD);
    const extensionIds = refIdsOf(BANK_MATCH_TARGET_TYPE.BOOKING_EXTENSION);

    const [holdsMatched, extensionsMatched] = await Promise.all([
      holdIds.length
        ? this.prisma.bookingHold.findMany({
            where: { id: { in: holdIds } },
            select: { id: true, code: true },
          })
        : Promise.resolve([]),
      extensionIds.length
        ? this.prisma.bookingExtension.findMany({
            where: { id: { in: extensionIds } },
            select: { id: true, code: true },
          })
        : Promise.resolve([]),
    ]);
    const targetCode = new Map([
      ...holdsMatched.map((h) => [h.id, h.code] as const),
      ...extensionsMatched.map((e) => [e.id, e.code] as const),
    ]);

    const [actors, invoices, checkouts] = await Promise.all([
      actorIds.length
        ? this.prisma.user.findMany({
            where: { id: { in: actorIds } },
            select: { id: true, displayName: true },
          })
        : Promise.resolve([]),
      invoiceIds.length
        ? this.prisma.subscriptionInvoice.findMany({
            where: { id: { in: invoiceIds } },
            select: { id: true, code: true, checkout: { select: { code: true } } },
          })
        : Promise.resolve([]),
      checkoutIds.length
        ? this.prisma.subscriptionCheckout.findMany({
            where: { id: { in: checkoutIds } },
            select: { id: true, code: true },
          })
        : Promise.resolve([]),
    ]);
    const actorName = new Map(actors.map((a) => [a.id, a.displayName]));
    /*
     * Mã hoá đơn HOẶC mã phiếu gộp - id là ULID nên hai tập không đụng nhau. Hoá đơn con của phiếu
     * (ADR 0083) in mã PHIẾU: tiền gửi theo mã con (webhook) hay khớp tay vào con đều được chuyển
     * sang phiếu (`BillingService.applyBankPaymentWithinTx`), nên "đã khớp vào" phải là nơi tiền
     * thật sự nằm. Mã khách gõ vẫn đọc được ở `referenceCode`.
     */
    const invoiceCode = new Map([
      ...invoices.map((i) => [i.id, i.checkout?.code ?? i.code] as const),
      ...checkouts.map((c) => [c.id, c.code] as const),
    ]);

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
      matchReasonCode: r.matchReasonCode,
      matchReasonParams: reasonParams(r.matchReasonParams),
      // Khoản giữ chỗ / phụ lục đã khớp; lượt ghi có ví thay thì mã khoản gốc nằm ở tham số.
      matchedTargetCode:
        (r.matchedRefId ? targetCode.get(r.matchedRefId) : undefined) ??
        (r.matchedType === BANK_MATCH_WALLET_CREDIT
          ? (reasonParams(r.matchReasonParams)?.code ?? null)
          : null),
      matchedAt: r.matchedAt?.toISOString() ?? null,
      matchedByName: r.matchedBy ? (actorName.get(r.matchedBy) ?? null) : null,
      createdAt: r.createdAt.toISOString(),
      matchedInvoiceCode: r.matchedRefId ? (invoiceCode.get(r.matchedRefId) ?? null) : null,
      refundReference: r.refundReference,
      refundedAt: r.refundedAt?.toISOString() ?? null,
    }));
  }
}

/**
 * Khoản của khách còn nhận tiền không — theo MỐC hạn, cùng luật với lượt áp tiền của webhook
 * (`BookingHoldsService` / `BookingExtensionsService.applyBankPaymentWithinTx`).
 */
function isReceivable(type: BankTxReceivableType, status: string, expiresAt: Date | null): boolean {
  if (type === BANK_MATCH_TARGET_TYPE.BOOKING_HOLD) {
    const awaiting: string[] = [BOOKING_HOLD_STATUS.PENDING, BOOKING_HOLD_STATUS.UNDERPAID];
    return awaiting.includes(status) && !isHoldPastDue(expiresAt);
  }
  return (
    status === BOOKING_EXTENSION_STATUS.AWAITING_PAYMENT &&
    (expiresAt === null || expiresAt.getTime() > Date.now())
  );
}

/** `match_reason_params` (jsonb) → `{ code?, status? }`; dữ liệu lạ thì `null`, không ném. */
function reasonParams(value: Prisma.JsonValue | null): { code?: string; status?: string } | null {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return null;
  const record = value as Record<string, unknown>;
  return {
    ...(typeof record.code === 'string' ? { code: record.code } : {}),
    ...(typeof record.status === 'string' ? { status: record.status } : {}),
  };
}

function alreadyHandled(): ConflictException {
  return new ConflictException({
    code: API_ERROR_CODE.BANK_TX_ALREADY_HANDLED,
    message: 'Giao dịch này vừa được xử lý bởi người khác',
  });
}

function targetClosed(status: string | null): ConflictException {
  return new ConflictException({
    code: API_ERROR_CODE.BANK_TX_TARGET_CLOSED,
    message: 'Khoản này vừa đóng, không nhận tiền nữa - hãy ghi có Ví điểm khách',
    details: { status },
  });
}

/**
 * `YYYY-MM-DD` (giờ VN) → khoảng thời gian tuyệt đối `[đầu ngày from, đầu ngày sau to)`.
 * Thiếu một đầu thì để hở đầu đó; thiếu cả hai thì không lọc.
 */
function vnDayRange(from?: string, to?: string): Prisma.DateTimeFilter | null {
  if (!from && !to) return null;
  return {
    ...(from ? { gte: vnDayStart(from) } : {}),
    ...(to ? { lt: vnDayStart(addDateKeyDays(to, 1)) } : {}),
  };
}

/** Lọc theo LUỒNG của mã rút được - tiền tố quyết định, cùng quy tắc với `referenceCodeTarget`. */
function codeFilterWhere(code: BankTxCodeFilter | undefined): Prisma.BankTransactionWhereInput {
  switch (code) {
    case BANK_TX_CODE_FILTER.NO_CODE:
      return { referenceCode: null };
    case BANK_TX_CODE_FILTER.SUBSCRIPTION_INVOICE:
    case BANK_TX_CODE_FILTER.BOOKING_HOLD:
    case BANK_TX_CODE_FILTER.BOOKING_EXTENSION:
    case BANK_TX_CODE_FILTER.SUBSCRIPTION_CHECKOUT:
      return {
        referenceCode: { startsWith: REFERENCE_CODE_PREFIX[code], mode: 'insensitive' },
      };
    default:
      return {};
  }
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

/** Một trường chữ của payload nhà cung cấp - dữ liệu NGOÀI, nên kiểm từng kiểu, rỗng thì `null`. */
function rawText(raw: Record<string, unknown>, key: string): string | null {
  const value = raw[key];
  if (typeof value === 'string') return value.trim() || null;
  if (typeof value === 'number') return String(value);
  return null;
}

import { ConflictException, Injectable, NotFoundException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Prisma } from '@xeprime/prisma';
import {
  API_ERROR_CODE,
  AUDIT_ACTOR_SCOPE,
  NOTIFICATION_TARGET_TYPE,
  NOTIFICATION_TYPE,
  TENANT_ROLE,
  WALLET_ENTRY_KIND,
  WALLET_OWNER_TYPE,
  WITHDRAWAL_STATUS,
  WITHDRAWAL_TERMS,
  taxPeriodRangeVn,
  type NotificationType,
  type WalletOwnerType,
  type WithdrawalStatus,
} from '@xeprime/types';
import { formatMoneyVndVi } from '@xeprime/domain';
import { csvDocument } from '../../common/csv';
import { PrismaService } from '../../prisma/prisma.service';
import { AuditService } from '../audit/audit.service';
import { NotificationService } from '../notification/notification.service';
import type {
  MarkWithdrawalPaidDto,
  PlatformWithdrawalDto,
  PlatformWithdrawalPageDto,
  PlatformWithdrawalQueryDto,
  RejectWithdrawalDto,
  ReverseWithdrawalDto,
} from './dto/platform-withdrawal.dto';
import { WalletService } from './wallet.service';

const SELECT = {
  id: true,
  code: true,
  amount: true,
  status: true,
  walletId: true,
  bankCode: true,
  bankAccountNumber: true,
  bankAccountName: true,
  dueBy: true,
  reviewedBy: true,
  paidBy: true,
  paidAt: true,
  bankReference: true,
  rejectReason: true,
  reversedAt: true,
  reverseReason: true,
  rowVersion: true,
  createdAt: true,
  wallet: {
    select: {
      ownerType: true,
      ownerUserId: true,
      ownerTenantId: true,
      ownerUser: { select: { displayName: true } },
      ownerTenant: { select: { name: true } },
    },
  },
} satisfies Prisma.WithdrawalRequestSelect;

type Row = Prisma.WithdrawalRequestGetPayload<{ select: typeof SELECT }>;

/** Chủ ví của một lệnh — đủ để biết báo cho AI. */
interface WalletOwnerRef {
  ownerUserId: string | null;
  ownerTenantId: string | null;
}

/** Việc CẦN LÀM: còn phải duyệt, hoặc đã duyệt mà chưa chuyển. */
const ACTIONABLE: WithdrawalStatus[] = [WITHDRAWAL_STATUS.PENDING, WITHDRAWAL_STATUS.APPROVED];

/** Lệnh đã CHI (tiền đã rời ngân hàng) — kể cả lệnh sau đó bị đảo. Đi vào bảng kê tháng. */
const DISBURSED: WithdrawalStatus[] = [WITHDRAWAL_STATUS.PAID, WITHDRAWAL_STATUS.REVERSED];

/** Ô tra cứu đúng 4 chữ số = 4 số cuối tài khoản nhận (khách đọc qua điện thoại). */
const ACCOUNT_LAST4 = /^\d{4}$/;

/**
 * Hàng đợi rút tiền của admin (ADR 0033, ADR 0025 điều 7).
 *
 * Mỗi lệnh là một việc tay: chuyển khoản ở VN là đẩy, nền tảng không tự chi được. Vì vậy hàng
 * đợi phải trả lời hai câu ngay từ dòng đầu — *cái nào cũ nhất* và *cái nào đã quá hạn cam kết*.
 *
 * Ranh giới giữa bốn hành động là ranh giới TIỀN, không phải ranh giới quy trình:
 * `approve` chưa đụng tiền · `paid` mới sinh bút toán âm · `reject` nhả khoá không bút toán ·
 * `reverse` là dòng đảo sau khi tiền đã đi.
 *
 * Lệnh từ ngưỡng `WITHDRAWAL_DUAL_CONTROL_MIN_AMOUNT` trở lên cần HAI người (đợt rà Admin
 * 16/11/2026): người bấm "Đã chuyển" phải khác người đã duyệt — điều kiện nằm TRONG câu lệnh chốt,
 * không ở một phép đọc trước.
 */
@Injectable()
export class PlatformWithdrawalService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly wallet: WalletService,
    private readonly audit: AuditService,
    private readonly notifications: NotificationService,
    private readonly config: ConfigService,
  ) {}

  /** Ngưỡng hai người — mặc định do `env.schema.ts` đặt, ConfigModule đã validate. */
  private get dualControlMinAmount(): Prisma.Decimal {
    return new Prisma.Decimal(this.config.getOrThrow<number>('WITHDRAWAL_DUAL_CONTROL_MIN_AMOUNT'));
  }

  async list(query: PlatformWithdrawalQueryDto): Promise<PlatformWithdrawalPageDto> {
    const page = Math.max(1, query.page ?? 1);
    const limit = Math.min(100, Math.max(1, query.limit ?? 20));
    const now = new Date();
    const q = query.q?.trim();

    const where: Prisma.WithdrawalRequestWhereInput = {
      /*
       * Không lọc trạng thái: hàng đợi mặc định là VIỆC CẦN LÀM. Nhưng khi người trực TRA một lệnh
       * (mã, tên chủ ví, 4 số cuối) thì câu hỏi là "lệnh đó đâu", ở bất kỳ trạng thái nào.
       */
      ...(query.status ? { status: query.status } : q ? {} : { status: { in: ACTIONABLE } }),
      ...(query.overdue ? { dueBy: { lt: now }, status: { in: ACTIONABLE } } : {}),
      ...(query.ownerType ? { wallet: { ownerType: query.ownerType } } : {}),
      ...(q ? searchWhere(q) : {}),
    };

    const [total, rows, overdueCount] = await Promise.all([
      this.prisma.withdrawalRequest.count({ where }),
      this.prisma.withdrawalRequest.findMany({
        where,
        // CŨ NHẤT TRƯỚC: hàng đợi việc tay thì thứ tự đúng là thứ tự chờ, không phải mới nhất.
        orderBy: { createdAt: 'asc' },
        skip: (page - 1) * limit,
        take: limit,
        select: SELECT,
      }),
      this.prisma.withdrawalRequest.count({
        where: { status: { in: ACTIONABLE }, dueBy: { lt: now } },
      }),
    ]);

    const names = await this.staffNames(rows.flatMap((r) => [r.reviewedBy, r.paidBy]));
    const threshold = this.dualControlMinAmount;
    return {
      items: rows.map((row) => toDto(row, now, names, threshold)),
      total,
      page,
      limit,
      hasNext: page * limit < total,
      overdueCount,
      dualControlMinAmount: threshold.toFixed(0),
    };
  }

  /**
   * Duyệt — đặt hạn cam kết và bắt đầu đếm.
   *
   * Tiền chưa đụng tới: nó đã bị khoá từ lúc chủ ví bấm rút, và chỉ rời ví ở bước `paid`.
   */
  async approve(id: string, actorUserId: string): Promise<void> {
    await this.prisma.$transaction(async (tx) => {
      const claimed = await tx.withdrawalRequest.updateMany({
        where: { id, status: WITHDRAWAL_STATUS.PENDING },
        data: {
          status: WITHDRAWAL_STATUS.APPROVED,
          reviewedBy: actorUserId,
          reviewedAt: new Date(),
          dueBy: commitmentDueDate(new Date()),
          rowVersion: { increment: 1 },
        },
      });
      if (claimed.count === 0) throw alreadyHandled();

      await this.audit.record(
        {
          actorUserId,
          actorScope: AUDIT_ACTOR_SCOPE.PLATFORM,
          action: 'withdrawal.approved',
          targetType: 'withdrawal_request',
          targetId: id,
        },
        tx,
      );
    });
  }

  /**
   * Đã chuyển khoản — điểm DUY NHẤT số dư thật sự giảm.
   *
   * `rowVersion` từ client: hai admin cùng mở hàng đợi và cùng bấm thì người sau thấy 409 thay
   * vì ghi đè bản ghi người trước — và quan trọng hơn, thay vì chuyển tiền lần thứ hai.
   *
   * Lệnh từ ngưỡng hai người: điều kiện `reviewed_by <> người bấm` nằm trong chính `updateMany`
   * chốt lệnh, nên không có khe nào giữa "kiểm" và "ghi" để một người tự duyệt rồi tự chi.
   */
  async markPaid(id: string, actorUserId: string, dto: MarkWithdrawalPaidDto): Promise<void> {
    const threshold = this.dualControlMinAmount;
    await this.prisma.$transaction(async (tx) => {
      const row = await tx.withdrawalRequest.findUnique({
        where: { id },
        select: {
          id: true,
          walletId: true,
          amount: true,
          status: true,
          code: true,
          reviewedBy: true,
          wallet: { select: { ownerUserId: true, ownerTenantId: true } },
        },
      });
      if (!row) throw notFound();

      const needsSecondPerson = row.amount.gte(threshold);
      const claimed = await tx.withdrawalRequest.updateMany({
        where: {
          id,
          status: WITHDRAWAL_STATUS.APPROVED,
          rowVersion: dto.rowVersion,
          ...(needsSecondPerson ? { reviewedBy: { not: actorUserId } } : {}),
        },
        data: {
          status: WITHDRAWAL_STATUS.PAID,
          paidBy: actorUserId,
          paidAt: new Date(),
          bankReference: dto.bankReference.trim(),
          rowVersion: { increment: 1 },
        },
      });
      if (claimed.count === 0) {
        if (
          needsSecondPerson &&
          row.status === WITHDRAWAL_STATUS.APPROVED &&
          row.reviewedBy === actorUserId
        ) {
          throw new ConflictException({
            code: API_ERROR_CODE.WITHDRAWAL_SECOND_PERSON_REQUIRED,
            message: 'Lệnh lớn cần hai người: người chuyển phải khác người đã duyệt',
            details: { minAmount: threshold.toFixed(0) },
          });
        }
        throw alreadyHandled(row.status);
      }

      await this.wallet.recordWithdrawalPaidWithinTx(tx, {
        walletId: row.walletId,
        withdrawalId: row.id,
        amount: row.amount,
        actorUserId,
      });

      await this.audit.record(
        {
          // Ví gian hàng ⇒ dòng audit mang tenant, để hiện cả ở nhật ký của chính gian hàng đó.
          tenantId: row.wallet.ownerTenantId,
          actorUserId,
          actorScope: AUDIT_ACTOR_SCOPE.PLATFORM,
          action: 'withdrawal.paid',
          targetType: 'withdrawal_request',
          targetId: id,
          after: {
            code: row.code,
            amount: row.amount.toString(),
            bankReference: dto.bankReference.trim(),
            dualControl: needsSecondPerson,
          },
        },
        tx,
      );

      await this.notifyOwner(tx, row.wallet, {
        type: NOTIFICATION_TYPE.WITHDRAWAL_PAID,
        title: 'Đã chuyển tiền rút',
        body: `${formatMoneyVndVi(row.amount.toString())} · mã ${row.code}`,
        withdrawalId: row.id,
      });
    });
  }

  /** Từ chối — nhả khoá. KHÔNG bút toán: tiền chưa bao giờ rời ví. */
  async reject(id: string, actorUserId: string, dto: RejectWithdrawalDto): Promise<void> {
    const reason = dto.reason.trim();
    await this.prisma.$transaction(async (tx) => {
      const row = await tx.withdrawalRequest.findUnique({
        where: { id },
        select: {
          id: true,
          code: true,
          walletId: true,
          amount: true,
          status: true,
          wallet: { select: { ownerUserId: true, ownerTenantId: true } },
        },
      });
      if (!row) throw notFound();

      const claimed = await tx.withdrawalRequest.updateMany({
        where: { id, status: { in: ACTIONABLE } },
        data: {
          status: WITHDRAWAL_STATUS.REJECTED,
          reviewedBy: actorUserId,
          reviewedAt: new Date(),
          rejectReason: reason,
          rowVersion: { increment: 1 },
        },
      });
      if (claimed.count === 0) throw alreadyHandled(row.status);

      await this.wallet.releaseWithdrawalHoldWithinTx(tx, row.walletId, row.amount);
      await this.audit.record(
        {
          tenantId: row.wallet.ownerTenantId,
          actorUserId,
          actorScope: AUDIT_ACTOR_SCOPE.PLATFORM,
          action: 'withdrawal.rejected',
          targetType: 'withdrawal_request',
          targetId: id,
          after: { code: row.code, reason },
        },
        tx,
      );

      await this.notifyOwner(tx, row.wallet, {
        type: NOTIFICATION_TYPE.WITHDRAWAL_REJECTED,
        title: 'Lệnh rút bị từ chối - tiền đã về số dư khả dụng',
        body: `${formatMoneyVndVi(row.amount.toString())} · mã ${row.code} · ${reason}`,
        withdrawalId: row.id,
      });
    });
  }

  /**
   * Chuyển hụt hoặc sai tài khoản — đảo bút toán đã chi (ADR 0025 điều 7).
   *
   * Hai sự kiện đều được GIỮ: bút toán chi và bằng chứng chuyển (`paid_*`, `bank_reference`)
   * không bị sửa, bút toán đảo được ghi THÊM. Nhưng lệnh chuyển sang trạng thái cuối `reversed`:
   * để nguyên `paid` (cách làm trước 01/10/2026) là để chủ ví đọc "Đã chuyển" cho một khoản đã
   * quay về ví, và để hàng đợi admin mời đảo thêm lần nữa.
   *
   * Chốt bằng `updateMany` có điều kiện `status = paid` + `rowVersion` — bấm hai lần hay hai
   * admin cùng bấm thì đúng MỘT lần đảo, lần sau nhận `WITHDRAWAL_ALREADY_HANDLED`. Unique
   * `reversal_of_entry_id` ở sổ ví là lớp chặn thứ hai, ở database.
   */
  async reverse(id: string, actorUserId: string, dto: ReverseWithdrawalDto): Promise<void> {
    const reason = dto.reason.trim();
    await this.prisma.$transaction(async (tx) => {
      const row = await tx.withdrawalRequest.findUnique({
        where: { id },
        select: {
          id: true,
          code: true,
          amount: true,
          walletId: true,
          status: true,
          wallet: { select: { ownerUserId: true, ownerTenantId: true } },
        },
      });
      if (!row) throw notFound();

      const claimed = await tx.withdrawalRequest.updateMany({
        where: { id, status: WITHDRAWAL_STATUS.PAID, rowVersion: dto.rowVersion },
        data: {
          status: WITHDRAWAL_STATUS.REVERSED,
          reversedAt: new Date(),
          reversedBy: actorUserId,
          reverseReason: reason,
          rowVersion: { increment: 1 },
        },
      });
      if (claimed.count === 0) throw alreadyHandled(row.status);

      const entry = await tx.walletEntry.findFirst({
        where: { walletId: row.walletId, sourceRefId: id, kind: WALLET_ENTRY_KIND.WITHDRAWAL },
        select: { id: true },
      });
      if (!entry) throw notFound();

      await this.wallet.reverseWithinTx(tx, entry.id, { reason, actorUserId });
      await this.audit.record(
        {
          tenantId: row.wallet.ownerTenantId,
          actorUserId,
          actorScope: AUDIT_ACTOR_SCOPE.PLATFORM,
          action: 'withdrawal.reversed',
          targetType: 'withdrawal_request',
          targetId: id,
          before: { status: WITHDRAWAL_STATUS.PAID },
          after: { status: WITHDRAWAL_STATUS.REVERSED, code: row.code, reason },
        },
        tx,
      );

      // ADR 0025 điều 7: "báo người dùng nhập lại".
      await this.notifyOwner(tx, row.wallet, {
        type: NOTIFICATION_TYPE.WITHDRAWAL_REVERSED,
        title: 'Lệnh rút chuyển không thành công - tiền đã về ví',
        body: `${formatMoneyVndVi(row.amount.toString())} · mã ${row.code} · ${reason}. Kiểm tra tài khoản nhận rồi tạo lệnh rút mới.`,
        withdrawalId: row.id,
      });
    });
  }

  /**
   * BẢNG KÊ THÁNG các lệnh đã chi (`paid`, và `reversed` — tiền đã rời ngân hàng rồi mới quay về)
   * theo mốc chuyển giờ Việt Nam — đối chiếu sao kê ngân hàng chiều RA.
   *
   * File mang SỐ TÀI KHOẢN ĐẦY ĐỦ của chủ ví: ghi audit (ai, tháng nào, bao nhiêu dòng — chỉ đếm,
   * không chép số) TRƯỚC khi trả file, giống bảng kê thuế. Audit lỗi thì không xuất.
   */
  async monthCsv(month: string, actorUserId: string): Promise<string> {
    const { start, end } = taxPeriodRangeVn(month);
    const rows = await this.prisma.withdrawalRequest.findMany({
      where: { status: { in: DISBURSED }, paidAt: { gte: start, lt: end } },
      orderBy: [{ paidAt: 'asc' }, { id: 'asc' }],
      select: SELECT,
    });
    const names = await this.staffNames(rows.flatMap((r) => [r.reviewedBy, r.paidBy]));

    const header = [
      'ma_lenh',
      'chu_vi',
      'loai_vi',
      'ngan_hang',
      'so_tai_khoan',
      'ten_tai_khoan',
      'so_tien',
      'ngay_chuyen',
      'ma_giao_dich',
      'nguoi_duyet',
      'nguoi_chuyen',
      'trang_thai',
    ];
    const lines = rows.map((row) => [
      row.code,
      ownerNameOf(row) ?? '',
      row.wallet.ownerType,
      row.bankCode,
      row.bankAccountNumber,
      row.bankAccountName,
      row.amount.toFixed(0),
      row.paidAt ? vnDateTime(row.paidAt) : '',
      row.bankReference ?? '',
      (row.reviewedBy && names.get(row.reviewedBy)) ?? '',
      (row.paidBy && names.get(row.paidBy)) ?? '',
      row.status,
    ]);

    await this.audit.record({
      actorUserId,
      actorScope: AUDIT_ACTOR_SCOPE.PLATFORM,
      action: 'withdrawal.month_export',
      targetType: 'withdrawal_month',
      targetId: month,
      after: { month, rows: lines.length },
    });

    return csvDocument(header, lines);
  }

  /** Tên nhân sự nền tảng đã duyệt / đã chuyển — một truy vấn cho cả trang. */
  private async staffNames(ids: (string | null)[]): Promise<Map<string, string>> {
    const unique = [...new Set(ids.filter((id): id is string => id != null))];
    if (unique.length === 0) return new Map();
    const users = await this.prisma.user.findMany({
      where: { id: { in: unique } },
      select: { id: true, displayName: true },
    });
    return new Map(users.map((u) => [u.id, u.displayName]));
  }

  /**
   * Báo CHỦ VÍ — ví tài khoản ⇒ chính tài khoản đó; ví gian hàng ⇒ chỉ chủ gian hàng: ví gian hàng
   * là quyền SỞ HỮU (`@ShopOwnerOnly`, ADR 0038 điều 3), nhân viên không chạm được nên cũng không
   * nhận tin về tiền của nó. Đích là màn Ví điểm (`withdrawal` + id lệnh).
   */
  private async notifyOwner(
    tx: Prisma.TransactionClient,
    owner: WalletOwnerRef,
    notice: { type: NotificationType; title: string; body: string; withdrawalId: string },
  ): Promise<void> {
    const payload = {
      type: notice.type,
      title: notice.title,
      body: notice.body,
      targetType: NOTIFICATION_TARGET_TYPE.WITHDRAWAL,
      targetId: notice.withdrawalId,
    };
    if (owner.ownerUserId) {
      await this.notifications.emitToUser(owner.ownerUserId, payload, tx);
    } else if (owner.ownerTenantId) {
      await this.notifications.emitToTenantMembers(owner.ownerTenantId, payload, tx, {
        roleKeys: [TENANT_ROLE.SHOP_OWNER],
      });
    }
  }
}

// ── Nội bộ ──────────────────────────────────────────────────────────────────

/**
 * Tra một lệnh: đúng 4 chữ số ⇒ 4 số cuối tài khoản nhận; ngược lại khớp mã lệnh HOẶC tên chủ ví
 * (người hoặc gian hàng), không phân biệt hoa thường.
 */
function searchWhere(q: string): Prisma.WithdrawalRequestWhereInput {
  if (ACCOUNT_LAST4.test(q)) return { bankAccountNumber: { endsWith: q } };
  return {
    OR: [
      { code: { contains: q, mode: 'insensitive' } },
      { wallet: { ownerUser: { displayName: { contains: q, mode: 'insensitive' } } } },
      { wallet: { ownerTenant: { name: { contains: q, mode: 'insensitive' } } } },
    ],
  };
}

/**
 * Hạn cam kết: `MAX_BUSINESS_DAYS` ngày LÀM VIỆC kể từ lúc duyệt (ADR 0028 điều 8 — 2 ngày).
 *
 * Bỏ qua thứ Bảy và Chủ nhật. Ngày lễ chưa tính — bảng `public_holidays` đã có, nhưng đọc nó ở
 * đây biến một phép cộng thành một lượt truy vấn trên đường ghi tiền; để dành cho lúc có số liệu
 * cho thấy nó đáng.
 */
function commitmentDueDate(from: Date): Date {
  const due = new Date(from);
  let left = WITHDRAWAL_TERMS.MAX_BUSINESS_DAYS;
  while (left > 0) {
    due.setDate(due.getDate() + 1);
    const day = due.getDay();
    if (day !== 0 && day !== 6) left -= 1;
  }
  return due;
}

/** `dd/MM/yyyy HH:mm` giờ Việt Nam (UTC+7, không DST) — cột ngày của file Excel. */
function vnDateTime(d: Date): string {
  const v = new Date(d.getTime() + 7 * 60 * 60 * 1000).toISOString();
  return `${v.slice(8, 10)}/${v.slice(5, 7)}/${v.slice(0, 4)} ${v.slice(11, 16)}`;
}

function ownerNameOf(row: Row): string | null {
  return row.wallet.ownerType === WALLET_OWNER_TYPE.USER
    ? (row.wallet.ownerUser?.displayName ?? null)
    : (row.wallet.ownerTenant?.name ?? null);
}

function toDto(
  row: Row,
  now: Date,
  names: Map<string, string>,
  dualControlMinAmount: Prisma.Decimal,
): PlatformWithdrawalDto {
  const ownerType = row.wallet.ownerType as WalletOwnerType;
  return {
    id: row.id,
    code: row.code,
    amount: row.amount.toFixed(0),
    status: row.status as WithdrawalStatus,
    ownerType,
    ownerId:
      ownerType === WALLET_OWNER_TYPE.USER ? row.wallet.ownerUserId : row.wallet.ownerTenantId,
    ownerName: ownerNameOf(row),
    bankCode: row.bankCode,
    bankAccountNumber: row.bankAccountNumber,
    bankAccountName: row.bankAccountName,
    dueBy: row.dueBy?.toISOString() ?? null,
    overdue: row.dueBy != null && row.dueBy < now && (ACTIONABLE as string[]).includes(row.status),
    ageHours: Math.floor((now.getTime() - row.createdAt.getTime()) / 3_600_000),
    reviewedById: row.reviewedBy,
    reviewedByName: (row.reviewedBy && names.get(row.reviewedBy)) ?? null,
    paidByName: (row.paidBy && names.get(row.paidBy)) ?? null,
    requiresSecondPerson: row.amount.gte(dualControlMinAmount),
    paidAt: row.paidAt?.toISOString() ?? null,
    bankReference: row.bankReference,
    rejectReason: row.rejectReason,
    reversedAt: row.reversedAt?.toISOString() ?? null,
    reverseReason: row.reverseReason,
    rowVersion: row.rowVersion,
    createdAt: row.createdAt.toISOString(),
  };
}

function notFound(): NotFoundException {
  return new NotFoundException({
    code: API_ERROR_CODE.NOT_FOUND,
    message: 'Không tìm thấy yêu cầu rút',
  });
}

function alreadyHandled(status?: string): ConflictException {
  return new ConflictException({
    code: API_ERROR_CODE.WITHDRAWAL_ALREADY_HANDLED,
    message: 'Yêu cầu này vừa được người khác xử lý',
    ...(status ? { details: { status } } : {}),
  });
}

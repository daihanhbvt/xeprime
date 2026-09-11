import { ConflictException, Injectable, NotFoundException } from '@nestjs/common';
import { Prisma } from '@xeprime/prisma';
import {
  API_ERROR_CODE,
  AUDIT_ACTOR_SCOPE,
  NOTIFICATION_TARGET_TYPE,
  NOTIFICATION_TYPE,
  WALLET_ENTRY_KIND,
  WALLET_OWNER_TYPE,
  WITHDRAWAL_STATUS,
  WITHDRAWAL_TERMS,
  type WalletOwnerType,
  type WithdrawalStatus,
} from '@xeprime/types';
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
  paidAt: true,
  bankReference: true,
  rejectReason: true,
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

/** Việc CẦN LÀM: còn phải duyệt, hoặc đã duyệt mà chưa chuyển. */
const ACTIONABLE: WithdrawalStatus[] = [WITHDRAWAL_STATUS.PENDING, WITHDRAWAL_STATUS.APPROVED];

/**
 * Hàng đợi rút tiền của admin (ADR 0033, ADR 0025 điều 7).
 *
 * Mỗi lệnh là một việc tay: chuyển khoản ở VN là đẩy, nền tảng không tự chi được. Vì vậy hàng
 * đợi phải trả lời hai câu ngay từ dòng đầu — *cái nào cũ nhất* và *cái nào đã quá hạn cam kết*.
 *
 * Ranh giới giữa bốn hành động là ranh giới TIỀN, không phải ranh giới quy trình:
 * `approve` chưa đụng tiền · `paid` mới sinh bút toán âm · `reject` nhả khoá không bút toán ·
 * `reverse` là dòng đảo sau khi tiền đã đi.
 */
@Injectable()
export class PlatformWithdrawalService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly wallet: WalletService,
    private readonly audit: AuditService,
    private readonly notifications: NotificationService,
  ) {}

  async list(query: PlatformWithdrawalQueryDto): Promise<PlatformWithdrawalPageDto> {
    const page = Math.max(1, query.page ?? 1);
    const limit = Math.min(100, Math.max(1, query.limit ?? 20));
    const now = new Date();

    const where: Prisma.WithdrawalRequestWhereInput = {
      ...(query.status ? { status: query.status } : { status: { in: ACTIONABLE } }),
      ...(query.overdue ? { dueBy: { lt: now }, status: { in: ACTIONABLE } } : {}),
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

    return {
      items: rows.map((row) => toDto(row, now)),
      total,
      page,
      limit,
      hasNext: page * limit < total,
      overdueCount,
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
   */
  async markPaid(id: string, actorUserId: string, dto: MarkWithdrawalPaidDto): Promise<void> {
    await this.prisma.$transaction(async (tx) => {
      const row = await tx.withdrawalRequest.findUnique({
        where: { id },
        select: { id: true, walletId: true, amount: true, status: true, code: true, wallet: { select: { ownerUserId: true, ownerTenantId: true } } },
      });
      if (!row) throw notFound();

      const claimed = await tx.withdrawalRequest.updateMany({
        where: { id, status: WITHDRAWAL_STATUS.APPROVED, rowVersion: dto.rowVersion },
        data: {
          status: WITHDRAWAL_STATUS.PAID,
          paidBy: actorUserId,
          paidAt: new Date(),
          bankReference: dto.bankReference.trim(),
          rowVersion: { increment: 1 },
        },
      });
      if (claimed.count === 0) throw alreadyHandled(row.status);

      await this.wallet.recordWithdrawalPaidWithinTx(tx, {
        walletId: row.walletId,
        withdrawalId: row.id,
        amount: row.amount,
        actorUserId,
      });

      await this.audit.record(
        {
          actorUserId,
          actorScope: AUDIT_ACTOR_SCOPE.PLATFORM,
          action: 'withdrawal.paid',
          targetType: 'withdrawal_request',
          targetId: id,
          after: { code: row.code, amount: row.amount.toString(), bankReference: dto.bankReference.trim() },
        },
        tx,
      );

      if (row.wallet.ownerUserId) {
        await this.notifications.emitToUser(
          row.wallet.ownerUserId,
          {
            type: NOTIFICATION_TYPE.HOLD_REFUND_PAID,
            title: 'Đã chuyển tiền rút',
            body: `${Number(row.amount).toLocaleString('vi-VN')}đ · mã ${row.code}`,
            /*
             * Không có đích "ví" trong `NOTIFICATION_TARGET_TYPE`, và không nên thêm chỉ để
             * thông báo này có chỗ trỏ: nó là tin BÁO, người dùng mở chuông rồi vào màn số dư.
             * Trỏ về chính yêu cầu rút để tra cứu được khi họ hỏi hỗ trợ.
             */
            targetType: NOTIFICATION_TARGET_TYPE.TENANT,
            targetId: row.id,
          },
          tx,
        );
      }
    });
  }

  /** Từ chối — nhả khoá. KHÔNG bút toán: tiền chưa bao giờ rời ví. */
  async reject(id: string, actorUserId: string, dto: RejectWithdrawalDto): Promise<void> {
    await this.prisma.$transaction(async (tx) => {
      const row = await tx.withdrawalRequest.findUnique({
        where: { id },
        select: { id: true, walletId: true, amount: true, status: true },
      });
      if (!row) throw notFound();

      const claimed = await tx.withdrawalRequest.updateMany({
        where: { id, status: { in: ACTIONABLE } },
        data: {
          status: WITHDRAWAL_STATUS.REJECTED,
          reviewedBy: actorUserId,
          reviewedAt: new Date(),
          rejectReason: dto.reason.trim(),
          rowVersion: { increment: 1 },
        },
      });
      if (claimed.count === 0) throw alreadyHandled(row.status);

      await this.wallet.releaseWithdrawalHoldWithinTx(tx, row.walletId, row.amount);
      await this.audit.record(
        {
          actorUserId,
          actorScope: AUDIT_ACTOR_SCOPE.PLATFORM,
          action: 'withdrawal.rejected',
          targetType: 'withdrawal_request',
          targetId: id,
          after: { reason: dto.reason.trim() },
        },
        tx,
      );
    });
  }

  /**
   * Chuyển hụt hoặc sai tài khoản — đảo bút toán đã chi (ADR 0025 điều 7).
   *
   * Lệnh giữ nguyên trạng thái `paid` và bút toán chi vẫn nằm đó: cả hai sự kiện — đã chuyển,
   * rồi tiền quay lại — đều là chuyện đã xảy ra. Chủ ví tạo lệnh mới với tài khoản đúng.
   */
  async reverse(id: string, actorUserId: string, dto: ReverseWithdrawalDto): Promise<void> {
    await this.prisma.$transaction(async (tx) => {
      const row = await tx.withdrawalRequest.findUnique({
        where: { id },
        select: { id: true, walletId: true, status: true },
      });
      if (!row) throw notFound();
      if (row.status !== WITHDRAWAL_STATUS.PAID) {
        throw new ConflictException({
          code: API_ERROR_CODE.WITHDRAWAL_ALREADY_HANDLED,
          message: 'Chỉ đảo được lệnh đã chuyển',
          details: { status: row.status },
        });
      }

      const entry = await tx.walletEntry.findFirst({
        where: { walletId: row.walletId, sourceRefId: id, kind: WALLET_ENTRY_KIND.WITHDRAWAL },
        select: { id: true },
      });
      if (!entry) throw notFound();

      await this.wallet.reverseWithinTx(tx, entry.id, {
        reason: dto.reason.trim(),
        actorUserId,
      });
      await this.audit.record(
        {
          actorUserId,
          actorScope: AUDIT_ACTOR_SCOPE.PLATFORM,
          action: 'withdrawal.reversed',
          targetType: 'withdrawal_request',
          targetId: id,
          after: { reason: dto.reason.trim() },
        },
        tx,
      );
    });
  }
}

// ── Nội bộ ──────────────────────────────────────────────────────────────────

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

function toDto(row: Row, now: Date): PlatformWithdrawalDto {
  const ownerType = row.wallet.ownerType as WalletOwnerType;
  return {
    id: row.id,
    code: row.code,
    amount: row.amount.toFixed(0),
    status: row.status as WithdrawalStatus,
    ownerType,
    ownerName:
      ownerType === WALLET_OWNER_TYPE.USER
        ? (row.wallet.ownerUser?.displayName ?? null)
        : (row.wallet.ownerTenant?.name ?? null),
    bankCode: row.bankCode,
    bankAccountNumber: row.bankAccountNumber,
    bankAccountName: row.bankAccountName,
    dueBy: row.dueBy?.toISOString() ?? null,
    overdue:
      row.dueBy != null &&
      row.dueBy < now &&
      (ACTIONABLE as string[]).includes(row.status),
    ageHours: Math.floor((now.getTime() - row.createdAt.getTime()) / 3_600_000),
    paidAt: row.paidAt?.toISOString() ?? null,
    bankReference: row.bankReference,
    rejectReason: row.rejectReason,
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

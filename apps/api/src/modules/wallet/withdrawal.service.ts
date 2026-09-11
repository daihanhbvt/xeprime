import { BadRequestException, ConflictException, Injectable, NotFoundException } from '@nestjs/common';
import { newId, Prisma } from '@xeprime/prisma';
import {
  API_ERROR_CODE,
  WITHDRAWAL_STATUS,
  WITHDRAWAL_TERMS,
  maskAccountNumber,
  type WithdrawalStatus,
} from '@xeprime/types';
import { PrismaService } from '../../prisma/prisma.service';
import { AuditService } from '../audit/audit.service';
import { AUDIT_ACTOR_SCOPE } from '@xeprime/types';
import { BankAccountsService } from '../bank-accounts/bank-accounts.service';
import type { CreateWithdrawalDto, WithdrawalRequestDto } from './dto/wallet.dto';
import { WalletService, type WalletOwner } from './wallet.service';

const SELECT = {
  id: true,
  code: true,
  amount: true,
  status: true,
  bankCode: true,
  bankAccountNumber: true,
  bankAccountName: true,
  dueBy: true,
  paidAt: true,
  rejectReason: true,
  createdAt: true,
} satisfies Prisma.WithdrawalRequestSelect;

/**
 * Yêu cầu RÚT TIỀN — chuyển khoản admin thủ công (ADR 0023 điều 3, ADR 0033).
 *
 * Chuyển khoản ở Việt Nam là đẩy: nền tảng không có API nào tự trả tiền về tài khoản người nhận,
 * nên mỗi lệnh là một con người mở app ngân hàng. Hệ quả thiết kế: phải có cam kết thời gian
 * hiện ra TRƯỚC khi người dùng bấm rút, và một hàng đợi admin sắp theo tuổi.
 *
 * Vòng đời và ai giữ tiền ở mỗi chặng:
 *
 * ```text
 *   pending   tiền đã KHOÁ khỏi số dư khả dụng, chưa rời ngân hàng nền tảng
 *   approved  như trên — duyệt và chi là hai việc, đôi khi hai người
 *   paid      tiền đã rời ngân hàng; bút toán ÂM ghi vào sổ
 *   rejected  nhả khoá, tiền về lại khả dụng, KHÔNG có bút toán nào
 *   cancelled như rejected, do chính chủ ví bấm
 * ```
 *
 * Không có bước nào tiền "biến mất": mọi nhánh đều trả lời được số dư đang ở đâu.
 */
@Injectable()
export class WithdrawalService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly wallet: WalletService,
    private readonly bankAccounts: BankAccountsService,
    private readonly audit: AuditService,
  ) {}

  /**
   * Tạo yêu cầu rút.
   *
   * Ba điều kiện, theo thứ tự rẻ-đến-đắt: số tiền hợp lệ · tài khoản nhận là của chính chủ ví ·
   * số dư đủ. Cái cuối là một câu lệnh có điều kiện ở database, không phải một phép đọc — hai
   * người bấm rút cùng lúc thì đúng một cái thắng.
   *
   * Thông tin ngân hàng được SNAPSHOT vào lệnh (ADR 0023 điều 8): người dùng đổi số tài khoản
   * sau đó không được làm đổi lệnh chuyển admin đang cầm trên tay.
   */
  async create(
    owner: WalletOwner,
    requestedByUserId: string,
    dto: CreateWithdrawalDto,
  ): Promise<WithdrawalRequestDto> {
    const amount = new Prisma.Decimal(dto.amount);
    if (!amount.isFinite() || amount.lte(0)) {
      throw new BadRequestException({
        code: API_ERROR_CODE.VALIDATION_FAILED,
        message: 'Số tiền rút không hợp lệ',
      });
    }
    if (amount.lt(WITHDRAWAL_TERMS.MIN_AMOUNT)) {
      throw new BadRequestException({
        code: API_ERROR_CODE.WITHDRAWAL_BELOW_MINIMUM,
        message: `Rút tối thiểu ${WITHDRAWAL_TERMS.MIN_AMOUNT.toLocaleString('vi-VN')}đ mỗi lần`,
        details: { minAmount: String(WITHDRAWAL_TERMS.MIN_AMOUNT) },
      });
    }

    const account = await this.bankAccounts.resolveForPayout(owner, dto.bankAccountId);
    if (!account) {
      throw new NotFoundException({
        code: API_ERROR_CODE.NOT_FOUND,
        message: 'Không tìm thấy tài khoản nhận tiền',
      });
    }

    const walletId = await this.wallet.findWalletId(owner);
    if (!walletId) {
      throw new ConflictException({
        code: API_ERROR_CODE.INSUFFICIENT_BALANCE,
        message: 'Số dư không đủ',
      });
    }

    const row = await this.prisma.$transaction(async (tx) => {
      const locked = await this.wallet.holdForWithdrawalWithinTx(tx, walletId, amount);
      if (!locked) {
        throw new ConflictException({
          code: API_ERROR_CODE.INSUFFICIENT_BALANCE,
          message: 'Số dư khả dụng không đủ, hoặc ví đang tạm khoá',
        });
      }

      const created = await tx.withdrawalRequest.create({
        data: {
          id: newId(),
          code: await this.uniqueCode(tx),
          walletId,
          amount,
          status: WITHDRAWAL_STATUS.PENDING,
          bankCode: account.bankCode,
          bankAccountNumber: account.accountNumber,
          bankAccountName: account.accountName,
          bankAccountId: account.id,
          requestedByUserId,
        },
        select: SELECT,
      });

      await this.audit.record(
        {
          tenantId: owner.type === 'tenant' ? owner.tenantId : null,
          actorUserId: requestedByUserId,
          actorScope: AUDIT_ACTOR_SCOPE.CUSTOMER,
          action: 'withdrawal.requested',
          targetType: 'withdrawal_request',
          targetId: created.id,
          after: { code: created.code, amount: amount.toString() },
        },
        tx,
      );
      return created;
    });

    return toDto(row);
  }

  async list(owner: WalletOwner): Promise<WithdrawalRequestDto[]> {
    const walletId = await this.wallet.findWalletId(owner);
    if (!walletId) return [];
    const rows = await this.prisma.withdrawalRequest.findMany({
      where: { walletId },
      orderBy: { createdAt: 'desc' },
      take: 50,
      select: SELECT,
    });
    return rows.map(toDto);
  }

  /**
   * Chủ ví tự huỷ — chỉ khi còn `pending`. Đã duyệt rồi thì admin có thể đang cầm lệnh chuyển
   * trên tay, và huỷ lúc đó là hai bên hiểu khác nhau về việc tiền đã đi hay chưa.
   */
  async cancel(owner: WalletOwner, id: string, actorUserId: string): Promise<void> {
    const walletId = await this.wallet.findWalletId(owner);
    if (!walletId) throw notFound();

    await this.prisma.$transaction(async (tx) => {
      const row = await tx.withdrawalRequest.findFirst({
        where: { id, walletId },
        select: { id: true, amount: true, status: true },
      });
      if (!row) throw notFound();

      const claimed = await tx.withdrawalRequest.updateMany({
        where: { id, status: WITHDRAWAL_STATUS.PENDING },
        data: { status: WITHDRAWAL_STATUS.CANCELLED, rowVersion: { increment: 1 } },
      });
      if (claimed.count === 0) {
        throw new ConflictException({
          code: API_ERROR_CODE.WITHDRAWAL_ALREADY_HANDLED,
          message: 'Yêu cầu này đã được xử lý — không huỷ được nữa',
          details: { status: row.status },
        });
      }

      await this.wallet.releaseWithdrawalHoldWithinTx(tx, walletId, row.amount);
      await this.audit.record(
        {
          tenantId: owner.type === 'tenant' ? owner.tenantId : null,
          actorUserId,
          actorScope: AUDIT_ACTOR_SCOPE.CUSTOMER,
          action: 'withdrawal.cancelled',
          targetType: 'withdrawal_request',
          targetId: id,
        },
        tx,
      );
    });
  }

  /**
   * Mã `XPW` + 8 — CÙNG không gian tên với `XPG`/`XPH` (ADR 0022 điều 3).
   *
   * Chiều RA chưa có đối soát tự động, nhưng mã nằm sẵn trong cùng không gian tên để khi SePay
   * mở webhook chiều ra thì không phải migrate lại toàn bộ lệnh đã chi.
   */
  private async uniqueCode(tx: Prisma.TransactionClient): Promise<string> {
    for (let attempt = 0; attempt < 5; attempt += 1) {
      const code = `XPW${randomBody()}`;
      const taken = await tx.withdrawalRequest.findUnique({ where: { code }, select: { id: true } });
      if (!taken) return code;
    }
    throw new Error('Không sinh được mã rút tiền duy nhất sau 5 lần thử');
  }
}

// ── Nội bộ ──────────────────────────────────────────────────────────────────

/** Bảng chữ bỏ `0/O` và `1/I` — người đọc mã qua điện thoại không nhầm (ADR 0016 điều 5). */
const ALPHABET = '23456789ABCDEFGHJKLMNPQRSTUVWXYZ';

function randomBody(): string {
  let out = '';
  for (let i = 0; i < 8; i += 1) {
    out += ALPHABET[Math.floor(Math.random() * ALPHABET.length)];
  }
  return out;
}

function toDto(row: Prisma.WithdrawalRequestGetPayload<{ select: typeof SELECT }>): WithdrawalRequestDto {
  return {
    id: row.id,
    code: row.code,
    amount: row.amount.toFixed(0),
    status: row.status as WithdrawalStatus,
    bankCode: row.bankCode,
    // PII: chủ ví chỉ cần nhận ra tài khoản, không cần đọc lại số.
    accountNumberMasked: maskAccountNumber(row.bankAccountNumber) ?? '',
    accountName: row.bankAccountName,
    dueBy: row.dueBy?.toISOString() ?? null,
    paidAt: row.paidAt?.toISOString() ?? null,
    rejectReason: row.rejectReason,
    createdAt: row.createdAt.toISOString(),
  };
}

function notFound(): NotFoundException {
  return new NotFoundException({
    code: API_ERROR_CODE.NOT_FOUND,
    message: 'Không tìm thấy yêu cầu rút',
  });
}

import { ConflictException, Injectable, Logger } from '@nestjs/common';
import { newId, Prisma } from '@xeprime/prisma';
import {
  API_ERROR_CODE,
  WALLET_ENTRY_KIND,
  WALLET_ENTRY_SOURCE,
  WALLET_OWNER_TYPE,
  WALLET_STATUS,
  BANK_ACCOUNT_STATUS,
  type WalletEntryKind,
  type WalletEntrySource,
} from '@xeprime/types';
import { PrismaService } from '../../prisma/prisma.service';

/** Chủ ví — đúng một trong hai, khớp CHECK owner XOR ở DB. */
export type WalletOwner =
  | { type: typeof WALLET_OWNER_TYPE.USER; userId: string }
  | { type: typeof WALLET_OWNER_TYPE.TENANT; tenantId: string };

export interface CreditInput {
  owner: WalletOwner;
  kind: WalletEntryKind;
  sourceType: WalletEntrySource;
  sourceRefId: string;
  /** VND dương. Ghi có số 0 là một bút toán không nói gì — DB cũng chặn. */
  amount: Prisma.Decimal;
  bookingId?: string | null;
  holdId?: string | null;
  note?: string | null;
  createdByUserId?: string | null;
}

/**
 * Sổ công nợ phải trả — writer DUY NHẤT của `wallets`, `wallet_entries`,
 * `withdrawal_requests` (ADR 0023 ràng buộc 3, ADR 0033).
 *
 * Module khác KHÔNG đụng ba bảng này; chúng gọi `creditWithinTx(...)` trong transaction của
 * chính mình, để bút toán và hiệu ứng sinh ra nó cùng sống hoặc cùng chết.
 *
 * Ba nguyên tắc, và cả ba đều do DATABASE giữ chứ không do service nhớ:
 *
 *  1. **Chỉ ghi thêm.** Sửa sai bằng dòng ĐẢO (`reverseWithinTx`), không update, không delete.
 *     Một dòng đã ghi là một sự kiện đã xảy ra.
 *  2. **Một sự kiện nguồn → đúng một dòng**, bằng unique `(wallet, kind, source_type, source_ref)`.
 *     Gọi lại cùng nguồn là no-op, không phải lỗi — worker và webhook đều chạy lại được.
 *  3. **Rút tiền là một câu lệnh có điều kiện.** `updateMany({ where: { balance: { gte } } })` —
 *     hai request rút song song thì database quyết ai thắng, không phải một phép đọc-rồi-ghi.
 */
@Injectable()
export class WalletService {
  private readonly logger = new Logger(WalletService.name);

  constructor(private readonly prisma: PrismaService) {}

  /**
   * Ví của một chủ, tạo nếu chưa có.
   *
   * Bắt P2002 thay vì kiểm trước: hai lần ghi có đầu tiên chạy song song đều thấy "chưa có ví"
   * và đều tạo — unique là thứ duy nhất phân xử được. Bắt xong đọc lại chính dòng vừa thua.
   */
  async ensureWalletWithinTx(
    tx: Prisma.TransactionClient,
    owner: WalletOwner,
  ): Promise<{ id: string; balance: Prisma.Decimal; status: string }> {
    const where = ownerWhere(owner);
    const existing = await tx.wallet.findFirst({
      where,
      select: { id: true, balance: true, status: true },
    });
    if (existing) return existing;

    try {
      return await tx.wallet.create({
        data: {
          id: newId(),
          ownerType: owner.type,
          ownerUserId: owner.type === WALLET_OWNER_TYPE.USER ? owner.userId : null,
          ownerTenantId: owner.type === WALLET_OWNER_TYPE.TENANT ? owner.tenantId : null,
        },
        select: { id: true, balance: true, status: true },
      });
    } catch (err) {
      if (err instanceof Prisma.PrismaClientKnownRequestError && err.code === 'P2002') {
        return tx.wallet.findFirstOrThrow({
          where,
          select: { id: true, balance: true, status: true },
        });
      }
      throw err;
    }
  }

  /**
   * Người này trở thành CHỦ XE ⇒ ví của họ thuộc về TENANT từ đây (15/09/2026).
   *
   * Gọi trong CHÍNH transaction mở gian hàng (`TenantsService.registerShop`), nên không có
   * khoảnh khắc nào tenant tồn tại mà ví còn đứng tên cá nhân.
   *
   * **Đổi CHỦ của hàng ví, không chuyển tiền.** Một `UPDATE` đặt cả ba cột cùng lúc (CHECK owner
   * XOR kiểm theo từng câu lệnh nên không thấy trạng thái nửa vời). Đây là cách duy nhất không
   * sinh một bút toán nào: không có phép cộng nào để cộng đôi, không dòng lịch sử nào bị viết
   * lại, `balance`/`pending_withdraw_amount` giữ nguyên, và vì `wallets.id` KHÔNG đổi nên mọi
   * tham chiếu vẫn đúng mà không phải sửa gì —
   *
   *   • `wallet_entries.wallet_id`          — sổ cái nguyên vẹn, `balance_after` vẫn liền mạch
   *   • `withdrawal_requests.wallet_id`     — lệnh rút đang `pending`/`approved` đi theo miễn phí
   *   • `hold_refunds.wallet_entry_id`      — tham chiếu mềm theo id dòng, không đụng tới
   *
   * Nhờ đó KHÔNG cần chặn đăng ký khi người dùng đang có lệnh rút chờ xử lý: thông tin ngân hàng
   * trên lệnh đã là snapshot (ADR 0023 điều 8) nên admin vẫn chuyển đúng tài khoản cá nhân họ đã
   * khai.
   *
   * Tài khoản ngân hàng `active` đi theo ví — không chuyển thì màn rút tiền hiện ô chọn RỖNG dù
   * họ đã khai số từ lâu, vì `resolveForPayout` chỉ nhận tài khoản cùng chủ với ví.
   *
   * Tenant vừa được tạo trong cùng transaction nên KHÔNG BAO GIỜ có sẵn ví: nhánh gộp hai ví chỉ
   * tồn tại trong migration dữ liệu cũ (`20260915120000_wallet_owner_unification`). Ở đây nó là
   * một lỗi lập trình, và ném là đúng.
   */
  async adoptUserWalletWithinTx(
    tx: Prisma.TransactionClient,
    userId: string,
    tenantId: string,
  ): Promise<{ walletId: string; bankAccountsMoved: number } | null> {
    const existingTenantWallet = await tx.wallet.findFirst({
      where: { ownerType: WALLET_OWNER_TYPE.TENANT, ownerTenantId: tenantId },
      select: { id: true },
    });
    if (existingTenantWallet) {
      throw new Error(
        `adoptUserWalletWithinTx: tenant ${tenantId} đã có ví ${existingTenantWallet.id}. ` +
          'Gộp hai ví là việc của migration dữ liệu cũ, không phải của đường đăng ký.',
      );
    }

    const userWallet = await tx.wallet.findFirst({
      where: { ownerType: WALLET_OWNER_TYPE.USER, ownerUserId: userId },
      select: { id: true },
    });

    if (userWallet) {
      await tx.wallet.update({
        where: { id: userWallet.id },
        data: {
          ownerType: WALLET_OWNER_TYPE.TENANT,
          ownerTenantId: tenantId,
          ownerUserId: null,
        },
      });
    }

    const moved = await tx.bankAccount.updateMany({
      where: {
        ownerType: WALLET_OWNER_TYPE.USER,
        ownerUserId: userId,
        status: BANK_ACCOUNT_STATUS.ACTIVE,
      },
      data: {
        ownerType: WALLET_OWNER_TYPE.TENANT,
        ownerTenantId: tenantId,
        ownerUserId: null,
      },
    });

    if (!userWallet && moved.count === 0) return null;
    this.logger.log(
      `Ví/tài khoản NH của user ${userId} chuyển sang tenant ${tenantId} ` +
        `(ví: ${userWallet?.id ?? 'chưa có'}, tài khoản NH: ${moved.count}).`,
    );
    return { walletId: userWallet?.id ?? '', bankAccountsMoved: moved.count };
  }

  /**
   * Ghi CÓ một khoản vào ví — idempotent theo nguồn.
   *
   * Trả `null` khi nguồn này đã được ghi rồi: caller (worker, webhook, nút admin) chạy lại là
   * chuyện bình thường, không phải lỗi cần ném lên tận người dùng.
   *
   * `balance` và dòng sổ cái được ghi trong CÙNG transaction của caller — hai thứ đó lệch nhau
   * dù chỉ một khoảnh khắc là một khoản tiền không giải thích được (ADR 0023 điều 6).
   */
  async creditWithinTx(
    tx: Prisma.TransactionClient,
    input: CreditInput,
  ): Promise<{ entryId: string; balanceAfter: Prisma.Decimal } | null> {
    if (input.amount.lte(0)) {
      throw new Error(`creditWithinTx: số tiền phải dương (${input.amount.toString()})`);
    }
    const wallet = await this.ensureWalletWithinTx(tx, input.owner);

    /*
     * Tăng số dư TRƯỚC để lấy `balanceAfter` thật (câu `UPDATE` khoá hàng ví, nên hai lượt ghi
     * song song không đọc ra cùng một số).
     */
    const updated = await tx.wallet.update({
      where: { id: wallet.id },
      data: { balance: { increment: input.amount } },
      select: { balance: true },
    });

    /*
     * `createMany({ skipDuplicates })` = `ON CONFLICT DO NOTHING`, KHÔNG phải `create` rồi bắt
     * P2002.
     *
     * Khác biệt quyết định: trong Postgres, một câu lệnh lỗi làm **abort cả transaction** —
     * sau đó không lệnh nào chạy được nữa, kể cả lệnh hoàn tác phép cộng ở trên. Còn
     * `DO NOTHING` không sinh lỗi, nên nhánh "nguồn này đã ghi rồi" vẫn trả lại được số dư và
     * caller nhận một no-op sạch thay vì một transaction chết.
     *
     * Chống cộng đôi vẫn là RÀNG BUỘC DB (unique 4 cột), không phải một phép kiểm trước đó:
     * hai lượt chạy song song cùng nguồn thì đúng một lượt có `count = 1`.
     */
    const entryId = newId();
    const created = await tx.walletEntry.createMany({
      data: [
        {
          id: entryId,
          walletId: wallet.id,
          kind: input.kind,
          sourceType: input.sourceType,
          sourceRefId: input.sourceRefId,
          amount: input.amount,
          balanceAfter: updated.balance,
          bookingId: input.bookingId ?? null,
          holdId: input.holdId ?? null,
          note: input.note ?? null,
          createdByUserId: input.createdByUserId ?? null,
        },
      ],
      skipDuplicates: true,
    });

    if (created.count === 0) {
      await tx.wallet.update({
        where: { id: wallet.id },
        data: { balance: { decrement: input.amount } },
      });
      this.logger.debug(
        `Bỏ qua ghi có trùng: ${input.kind}/${input.sourceType}/${input.sourceRefId}`,
      );
      return null;
    }

    return { entryId, balanceAfter: updated.balance };
  }

  /**
   * Khoá tiền cho một yêu cầu rút — chuyển từ `balance` sang `pendingWithdrawAmount`.
   *
   * MỘT câu lệnh có điều kiện: `updateMany` với `balance: { gte }`. Hai request rút cùng lúc
   * trên cùng một ví thì đúng một cái thấy `count = 1`. Đọc số dư rồi mới ghi sẽ cho cả hai
   * cùng qua — và đó là cách một ví rút được nhiều hơn số nó có.
   */
  async holdForWithdrawalWithinTx(
    tx: Prisma.TransactionClient,
    walletId: string,
    amount: Prisma.Decimal,
  ): Promise<boolean> {
    const claimed = await tx.wallet.updateMany({
      where: { id: walletId, status: WALLET_STATUS.ACTIVE, balance: { gte: amount } },
      data: {
        balance: { decrement: amount },
        pendingWithdrawAmount: { increment: amount },
      },
    });
    return claimed.count === 1;
  }

  /**
   * Nhả khoản đã khoá về lại số dư — yêu cầu bị từ chối hoặc người dùng tự huỷ.
   *
   * KHÔNG sinh bút toán: tiền chưa bao giờ rời ví, nó chỉ bị treo. Bút toán chỉ ghi khi tiền
   * thật sự đi (`withdrawal`) hoặc quay lại sau khi đã đi (`withdrawal_reversal`).
   */
  async releaseWithdrawalHoldWithinTx(
    tx: Prisma.TransactionClient,
    walletId: string,
    amount: Prisma.Decimal,
  ): Promise<void> {
    await tx.wallet.update({
      where: { id: walletId },
      data: {
        balance: { increment: amount },
        pendingWithdrawAmount: { decrement: amount },
      },
    });
  }

  /**
   * Tiền đã rời tài khoản nền tảng — ghi bút toán ÂM và xoá khoản treo.
   *
   * Đây là điểm duy nhất số dư thật sự giảm. Trước đó tiền chỉ bị khoá, và một lệnh bị từ chối
   * ở giữa vẫn trả lại đủ cho chủ ví.
   */
  async recordWithdrawalPaidWithinTx(
    tx: Prisma.TransactionClient,
    input: {
      walletId: string;
      withdrawalId: string;
      amount: Prisma.Decimal;
      actorUserId: string;
    },
  ): Promise<void> {
    const wallet = await tx.wallet.update({
      where: { id: input.walletId },
      data: { pendingWithdrawAmount: { decrement: input.amount } },
      select: { balance: true },
    });

    await tx.walletEntry.create({
      data: {
        id: newId(),
        walletId: input.walletId,
        kind: WALLET_ENTRY_KIND.WITHDRAWAL,
        sourceType: WALLET_ENTRY_SOURCE.WITHDRAWAL_REQUEST,
        sourceRefId: input.withdrawalId,
        amount: input.amount.negated(),
        balanceAfter: wallet.balance,
        createdByUserId: input.actorUserId,
      },
    });
  }

  /**
   * Đảo một bút toán — cách DUY NHẤT để sửa sai trên sổ chỉ-ghi-thêm (ADR 0023 điều 4).
   *
   * Dùng khi chuyển khoản hụt hoặc sai tài khoản: tiền quay lại ví bằng một dòng mới trỏ về
   * dòng cũ, chứ không phải bằng cách sửa dòng cũ. Người đọc sổ sau này thấy cả hai sự kiện —
   * đã chi, rồi đã quay lại — thay vì một dòng đã bị viết lại và không ai biết.
   */
  async reverseWithinTx(
    tx: Prisma.TransactionClient,
    entryId: string,
    input: { reason: string; actorUserId: string },
  ): Promise<void> {
    const original = await tx.walletEntry.findUniqueOrThrow({
      where: { id: entryId },
      select: { id: true, walletId: true, kind: true, amount: true, reversedBy: { select: { id: true } } },
    });
    if (original.reversedBy) {
      throw new ConflictException({
        code: API_ERROR_CODE.CONFLICT,
        message: 'Bút toán này đã được đảo rồi',
      });
    }

    const reversed = original.amount.negated();
    const wallet = await tx.wallet.update({
      where: { id: original.walletId },
      data: { balance: { increment: reversed } },
      select: { balance: true },
    });

    await tx.walletEntry.create({
      data: {
        id: newId(),
        walletId: original.walletId,
        kind:
          original.kind === WALLET_ENTRY_KIND.WITHDRAWAL
            ? WALLET_ENTRY_KIND.WITHDRAWAL_REVERSAL
            : WALLET_ENTRY_KIND.ADJUSTMENT,
        sourceType: WALLET_ENTRY_SOURCE.MANUAL,
        sourceRefId: original.id,
        amount: reversed,
        balanceAfter: wallet.balance,
        reversalOfEntryId: original.id,
        note: input.reason,
        createdByUserId: input.actorUserId,
      },
    });
  }

  // ── Đọc ───────────────────────────────────────────────────────────────────

  /** Số dư của một chủ. Chưa có ví = chưa từng có khoản nào, trả số 0 thay vì 404. */
  async summaryFor(owner: WalletOwner): Promise<{
    available: string;
    pending: string;
    total: string;
    status: string;
  }> {
    const wallet = await this.prisma.wallet.findFirst({
      where: ownerWhere(owner),
      select: { balance: true, pendingWithdrawAmount: true, status: true },
    });
    if (!wallet) {
      return { available: '0', pending: '0', total: '0', status: WALLET_STATUS.ACTIVE };
    }
    return {
      available: wallet.balance.toFixed(0),
      pending: wallet.pendingWithdrawAmount.toFixed(0),
      // Tổng NGHĨA VỤ = khả dụng + đang treo. Tính lúc đọc, không lưu cột thứ ba để khỏi lệch.
      total: wallet.balance.add(wallet.pendingWithdrawAmount).toFixed(0),
      status: wallet.status,
    };
  }

  /** Id ví của một chủ, `null` khi chưa từng có khoản nào. */
  async findWalletId(owner: WalletOwner): Promise<string | null> {
    const wallet = await this.prisma.wallet.findFirst({
      where: ownerWhere(owner),
      select: { id: true },
    });
    return wallet?.id ?? null;
  }
}

function ownerWhere(owner: WalletOwner): Prisma.WalletWhereInput {
  return owner.type === WALLET_OWNER_TYPE.USER
    ? { ownerType: WALLET_OWNER_TYPE.USER, ownerUserId: owner.userId }
    : { ownerType: WALLET_OWNER_TYPE.TENANT, ownerTenantId: owner.tenantId };
}

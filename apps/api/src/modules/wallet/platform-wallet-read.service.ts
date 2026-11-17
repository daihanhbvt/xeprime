import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { Prisma } from '@xeprime/prisma';
import {
  ACCOUNT_REALM,
  API_ERROR_CODE,
  WALLET_ENTRY_SOURCE,
  WALLET_OWNER_TYPE,
  WALLET_STATUS,
  isWalletOwnerType,
  maskAccountNumber,
} from '@xeprime/types';
import { PrismaService } from '../../prisma/prisma.service';
import {
  PLATFORM_WALLET_ENTRY_DEFAULT_LIMIT,
  PLATFORM_WALLET_ENTRY_MAX_LIMIT,
  type PlatformWalletEntryPageDto,
  type PlatformWalletEntryQueryDto,
  type PlatformWalletSummaryDto,
} from './dto/platform-wallet.dto';
import { WalletService, type WalletOwner } from './wallet.service';

/**
 * Ví điểm của MỘT chủ ví nhìn từ admin — CHỈ ĐỌC (đợt rà Admin 16/11/2026).
 *
 * Hỗ trợ trả lời "tiền hoàn của tôi đâu" và người duyệt rút tiền đọc được sổ của chủ ví trước khi
 * chuyển. Hai lớp: ai có `platform.wallets.view` thấy số dư và bút toán; tài khoản ngân hàng của lệnh
 * rút chỉ hiện cho người có `platform.money.manage` (bỏ ở server, không giấu ở giao diện).
 *
 * Sổ ví chỉ dài thêm, nên bút toán phân trang ở server trên index `(wallet_id, created_at)`; mã đơn /
 * mã giữ chỗ / mã lệnh rút gom một truy vấn cho cả trang, không N+1.
 */
@Injectable()
export class PlatformWalletReadService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly wallet: WalletService,
  ) {}

  async summary(ownerType: string, ownerId: string): Promise<PlatformWalletSummaryDto> {
    const owner = parseOwner(ownerType, ownerId);
    const ownerName = await this.ownerName(owner);
    const walletRow = await this.prisma.wallet.findFirst({
      where:
        owner.type === WALLET_OWNER_TYPE.USER
          ? { ownerType: WALLET_OWNER_TYPE.USER, ownerUserId: owner.userId }
          : { ownerType: WALLET_OWNER_TYPE.TENANT, ownerTenantId: owner.tenantId },
      select: { id: true, balance: true, pendingWithdrawAmount: true, status: true },
    });
    if (!walletRow) {
      return {
        ownerType: owner.type,
        ownerId,
        ownerName,
        exists: false,
        status: WALLET_STATUS.ACTIVE,
        available: '0',
        pending: '0',
        total: '0',
        ledgerTotal: '0',
        reconciled: true,
        entryCount: 0,
      };
    }

    const ledger = await this.prisma.walletEntry.aggregate({
      where: { walletId: walletRow.id },
      _sum: { amount: true },
      _count: { _all: true },
    });
    const total = walletRow.balance.add(walletRow.pendingWithdrawAmount);
    const ledgerTotal = ledger._sum.amount ?? new Prisma.Decimal(0);
    return {
      ownerType: owner.type,
      ownerId,
      ownerName,
      exists: true,
      status: walletRow.status,
      available: walletRow.balance.toFixed(0),
      pending: walletRow.pendingWithdrawAmount.toFixed(0),
      total: total.toFixed(0),
      ledgerTotal: ledgerTotal.toFixed(0),
      // Rút tiền chỉ CHUYỂN khả dụng sang đang rút (không bút toán) cho tới lúc chi — nên tổng sổ
      // phải bằng khả dụng + đang rút. Lệch là dấu hiệu ai đó ghi ví ngoài `WalletService`.
      reconciled: ledgerTotal.eq(total),
      entryCount: ledger._count._all,
    };
  }

  async entries(
    ownerType: string,
    ownerId: string,
    query: PlatformWalletEntryQueryDto,
    canSeeBank: boolean,
  ): Promise<PlatformWalletEntryPageDto> {
    const owner = parseOwner(ownerType, ownerId);
    await this.ownerName(owner); // 404 khi chủ ví không tồn tại
    const page = Math.max(1, query.page ?? 1);
    const limit = Math.min(
      PLATFORM_WALLET_ENTRY_MAX_LIMIT,
      Math.max(1, query.limit ?? PLATFORM_WALLET_ENTRY_DEFAULT_LIMIT),
    );
    const walletId = await this.wallet.findWalletId(owner);
    if (!walletId) return { items: [], total: 0, page, limit, hasNext: false };

    const where: Prisma.WalletEntryWhereInput = { walletId };
    const [total, rows] = await Promise.all([
      this.prisma.walletEntry.count({ where }),
      this.prisma.walletEntry.findMany({
        where,
        orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
        skip: (page - 1) * limit,
        take: limit,
        select: {
          id: true,
          kind: true,
          amount: true,
          balanceAfter: true,
          sourceType: true,
          sourceRefId: true,
          bookingId: true,
          holdId: true,
          reversalOfEntryId: true,
          note: true,
          createdAt: true,
        },
      }),
    ]);

    const bookingIds = uniq(rows.map((r) => r.bookingId));
    const holdIds = uniq(rows.map((r) => r.holdId));
    const withdrawalIds = uniq(
      rows
        .filter((r) => r.sourceType === WALLET_ENTRY_SOURCE.WITHDRAWAL_REQUEST)
        .map((r) => r.sourceRefId),
    );
    const [bookings, holds, withdrawals] = await Promise.all([
      bookingIds.length
        ? this.prisma.booking.findMany({
            where: { id: { in: bookingIds } },
            select: { id: true, code: true },
          })
        : Promise.resolve([]),
      holdIds.length
        ? this.prisma.bookingHold.findMany({
            where: { id: { in: holdIds } },
            select: { id: true, code: true },
          })
        : Promise.resolve([]),
      withdrawalIds.length
        ? this.prisma.withdrawalRequest.findMany({
            where: { id: { in: withdrawalIds } },
            select: { id: true, code: true, status: true, bankCode: true, bankAccountNumber: true },
          })
        : Promise.resolve([]),
    ]);
    const bookingCode = new Map(bookings.map((b) => [b.id, b.code]));
    const holdCode = new Map(holds.map((h) => [h.id, h.code]));
    const withdrawalById = new Map(withdrawals.map((w) => [w.id, w]));

    return {
      items: rows.map((r) => {
        const w =
          r.sourceType === WALLET_ENTRY_SOURCE.WITHDRAWAL_REQUEST
            ? withdrawalById.get(r.sourceRefId)
            : undefined;
        return {
          id: r.id,
          kind: r.kind,
          amount: r.amount.toFixed(0),
          balanceAfter: r.balanceAfter.toFixed(0),
          sourceType: r.sourceType,
          sourceRefId: r.sourceRefId,
          bookingId: r.bookingId,
          bookingCode: (r.bookingId && bookingCode.get(r.bookingId)) ?? null,
          holdCode: (r.holdId && holdCode.get(r.holdId)) ?? null,
          withdrawal: w
            ? {
                id: w.id,
                code: w.code,
                status: w.status,
                bankCode: canSeeBank ? w.bankCode : null,
                bankAccountMasked: canSeeBank ? maskAccountNumber(w.bankAccountNumber) : null,
              }
            : null,
          isReversal: r.reversalOfEntryId != null,
          note: r.note,
          createdAt: r.createdAt.toISOString(),
        };
      }),
      total,
      page,
      limit,
      hasNext: page * limit < total,
    };
  }

  /** Tên chủ ví — 404 khi tài khoản khách / gian hàng không tồn tại. */
  private async ownerName(owner: WalletOwner): Promise<string | null> {
    if (owner.type === WALLET_OWNER_TYPE.USER) {
      // Ví tài khoản chỉ thuộc tài khoản KHÁCH (ADR 0053 điều 8) — nhân viên gian hàng không có ví.
      const user = await this.prisma.user.findFirst({
        where: { id: owner.userId, realm: ACCOUNT_REALM.CUSTOMER },
        select: { displayName: true },
      });
      if (!user) throw notFound();
      return user.displayName;
    }
    const tenant = await this.prisma.tenant.findUnique({
      where: { id: owner.tenantId },
      select: { name: true },
    });
    if (!tenant) throw notFound();
    return tenant.name;
  }
}

function parseOwner(ownerType: string, ownerId: string): WalletOwner {
  if (!isWalletOwnerType(ownerType)) {
    throw new BadRequestException({
      code: API_ERROR_CODE.VALIDATION_FAILED,
      message: 'Loại chủ ví không hợp lệ',
      details: { ownerType },
    });
  }
  return ownerType === WALLET_OWNER_TYPE.USER
    ? { type: WALLET_OWNER_TYPE.USER, userId: ownerId }
    : { type: WALLET_OWNER_TYPE.TENANT, tenantId: ownerId };
}

function uniq(ids: (string | null)[]): string[] {
  return [...new Set(ids.filter((id): id is string => id != null))];
}

function notFound(): NotFoundException {
  return new NotFoundException({
    code: API_ERROR_CODE.NOT_FOUND,
    message: 'Không tìm thấy chủ ví',
  });
}

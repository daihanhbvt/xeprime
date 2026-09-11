import { Injectable } from '@nestjs/common';
import { Prisma } from '@xeprime/prisma';
import { WITHDRAWAL_TERMS, type WalletEntryKind, type WalletStatus } from '@xeprime/types';
import { PrismaService } from '../../prisma/prisma.service';
import type { WalletEntryPageDto, WalletEntryQueryDto, WalletSummaryDto } from './dto/wallet.dto';
import { WalletService, type WalletOwner } from './wallet.service';

const DEFAULT_LIMIT = 20;
const MAX_LIMIT = 100;

/**
 * Đọc ví — tách khỏi `WalletService` (writer) để đường GHI không mọc thêm bề mặt đọc.
 *
 * Sổ ví là một danh sách chỉ dài thêm, nên phân trang ở SERVER và có index
 * `(wallet_id, created_at)` đi kèm: một chủ xe chạy vài trăm chuyến một năm sẽ có sổ dài hàng
 * nghìn dòng, và tải hết về client là cách nó chậm dần cho tới lúc không mở nổi.
 */
@Injectable()
export class WalletReadService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly wallet: WalletService,
  ) {}

  /**
   * Ba con số + cam kết thời gian.
   *
   * Cam kết đi kèm ngay trong response thay vì để FE tự hardcode: *việc phải hiện một cam kết
   * trước khi người dùng bấm rút* là QUY TẮC (ADR 0025 điều 7), còn con số là dữ liệu — và hai
   * client (web, native) phải nói cùng một con số.
   */
  async summary(owner: WalletOwner): Promise<WalletSummaryDto> {
    const s = await this.wallet.summaryFor(owner);
    return {
      available: s.available,
      pending: s.pending,
      total: s.total,
      status: s.status as WalletStatus,
      minWithdrawAmount: String(WITHDRAWAL_TERMS.MIN_AMOUNT),
      maxBusinessDays: WITHDRAWAL_TERMS.MAX_BUSINESS_DAYS,
    };
  }

  async entries(owner: WalletOwner, query: WalletEntryQueryDto): Promise<WalletEntryPageDto> {
    const page = Math.max(1, query.page ?? 1);
    const limit = Math.min(MAX_LIMIT, Math.max(1, query.limit ?? DEFAULT_LIMIT));

    const walletId = await this.wallet.findWalletId(owner);
    // Chưa có ví = chưa từng có khoản nào. Trang rỗng, không phải 404.
    if (!walletId) return { items: [], total: 0, page, limit, hasNext: false };

    const where: Prisma.WalletEntryWhereInput = { walletId };
    const [total, rows] = await Promise.all([
      this.prisma.walletEntry.count({ where }),
      this.prisma.walletEntry.findMany({
        where,
        orderBy: { createdAt: 'desc' },
        skip: (page - 1) * limit,
        take: limit,
        select: {
          id: true,
          kind: true,
          amount: true,
          balanceAfter: true,
          bookingId: true,
          note: true,
          createdAt: true,
        },
      }),
    ]);

    return {
      items: rows.map((row) => ({
        id: row.id,
        kind: row.kind as WalletEntryKind,
        amount: row.amount.toFixed(0),
        balanceAfter: row.balanceAfter.toFixed(0),
        bookingId: row.bookingId,
        note: row.note,
        createdAt: row.createdAt.toISOString(),
      })),
      total,
      page,
      limit,
      hasNext: page * limit < total,
    };
  }
}
